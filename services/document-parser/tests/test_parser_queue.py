"""Focused tests for parser queueing and in-flight request coalescing."""

from __future__ import annotations

import importlib.util
import io
import json
import sys
import threading
import time
import unittest
import zipfile
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from http.client import HTTPConnection
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SERVICE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "docling_http_service.py"
SPEC = importlib.util.spec_from_file_location("docling_http_service_queue_tests", SERVICE_PATH)
assert SPEC is not None and SPEC.loader is not None
service = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = service
SPEC.loader.exec_module(service)


def multipart(filename: str, payload: bytes) -> tuple[str, bytes]:
    boundary = "----queue-test-boundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
    ).encode() + payload + f"\r\n--{boundary}--\r\n".encode()
    return f"multipart/form-data; boundary={boundary}", body


class QueueChunker:
    def __init__(self, *, binary: bool = False) -> None:
        self.calls: list[tuple[bytes, str, bool]] = []
        self.filenames: list[str] = []
        self.started = threading.Event()
        self.release = threading.Event()
        self.binary = binary

    def chunk(self, _filename: str, payload: bytes, request_id: str, _digest: str, *, visual_package: bool = False):
        self.calls.append((payload, request_id, visual_package))
        self.filenames.append(_filename)
        self.started.set()
        self.release.wait()
        if self.binary:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr("manifest.json", json.dumps({"request_id": request_id, "doc_hash": sha256(payload).hexdigest()}))
                archive.writestr("assets/page.png", b"image")
            return buffer.getvalue()
        return {"status": "completed", "request_id": request_id, "doc_hash": sha256(payload).hexdigest(), "chunks": []}


class FormatAwareParser:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.lock = threading.Lock()
        self.two_formats_started = threading.Event()
        self.release = threading.Event()

    def parse(self, filename: str, _payload: bytes) -> dict[str, str]:
        with self.lock:
            self.calls.append(filename)
            if len(self.calls) == 2:
                self.two_formats_started.set()
        self.release.wait()
        return {"received_filename": filename}


class ParserQueueHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server, self.thread, self.port = service.serve_in_thread(
            host="127.0.0.1", port=0, max_concurrency=1,
            parser=SimpleNamespace(parse=lambda _filename, _payload: {"markdown": "ok"}),
            boundary_logger=lambda *_args: None,
        )

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def send(self, request_id: str, payload: bytes, path: str = "/chunk/v2", filename: str = "test.pdf"):
        content_type, body = multipart(filename, payload)
        connection = HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request(
            "POST", path, body=body,
            headers={
                "Content-Type": content_type,
                "Content-Length": str(len(body)),
                "X-Document-Id": "doc-queue-test",
                "X-Request-Id": request_id,
                "X-Expected-SHA256": sha256(payload).hexdigest(),
            },
        )
        response = connection.getresponse()
        response_body = response.read()
        headers = dict(response.getheaders())
        connection.close()
        return response.status, headers, response_body

    def send_parse(self, filename: str, payload: bytes):
        content_type, body = multipart(filename, payload)
        connection = HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request(
            "POST", "/v1/parse", body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )
        response = connection.getresponse()
        response_body = response.read()
        connection.close()
        return response.status, json.loads(response_body)

    def test_parse_jobs_with_same_bytes_but_different_filename_suffixes_are_distinct(self) -> None:
        parser = FormatAwareParser()
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.server, self.thread, self.port = service.serve_in_thread(
            host="127.0.0.1", port=0, max_concurrency=2,
            parser=service.CachedParseService(parser=parser),
            boundary_logger=lambda *_args: None,
        )
        payload = b"same-bytes-different-formats"

        with ThreadPoolExecutor(max_workers=2) as executor:
            pdf = executor.submit(self.send_parse, "upload.pdf", payload)
            docx = executor.submit(self.send_parse, "upload.docx", payload)
            self.assertTrue(parser.two_formats_started.wait(timeout=3))
            parser.release.set()
            results = [pdf.result(timeout=5), docx.result(timeout=5)]

        self.assertEqual([status for status, _response in results], [200, 200])
        received_filenames = [response["result"]["received_filename"] for _, response in results]
        self.assertCountEqual(received_filenames, ["upload.pdf", "upload.docx"])
        self.assertCountEqual(parser.calls, ["upload.pdf", "upload.docx"])

    def test_long_conversion_ignores_old_local_timeout_and_returns_complete_package(self) -> None:
        chunker = QueueChunker(binary=True)
        self.server.chunker_service = chunker
        payload = b"pdf-long-work"
        request_id = "b3615f67-b6df-47e1-90b7-7e5d8de13e4f"

        with patch.dict("os.environ", {"DOC_CHUNKER_TIMEOUT_MS": "1"}):
            with ThreadPoolExecutor(max_workers=1) as executor:
                result_future = executor.submit(self.send, request_id, payload)
                self.assertTrue(chunker.started.wait(timeout=3))
                self.assertFalse(result_future.done())
                chunker.release.set()
                status, headers, response_body = result_future.result(timeout=5)

        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/vnd.doc-chunker.v2+zip")
        with zipfile.ZipFile(io.BytesIO(response_body)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["request_id"], request_id)
            self.assertEqual(archive.read("assets/page.png"), b"image")

    def test_same_active_pdf_is_converted_once_and_each_json_response_keeps_its_id(self) -> None:
        chunker = QueueChunker()
        self.server.chunker_service = chunker
        payload = b"same-pdf-retry"
        request_ids = [
            "b3615f67-b6df-47e1-90b7-7e5d8de13e4f",
            "3b8f2f13-8355-4c7f-a1ed-8c04a7cadff1",
        ]

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.send, request_ids[0], payload, "/chunk")
            self.assertTrue(chunker.started.wait(timeout=3))
            second = executor.submit(self.send, request_ids[1], payload, "/chunk")
            time.sleep(0.05)
            self.assertEqual(len(chunker.calls), 1)
            chunker.release.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual([result[0] for result in results], [200, 200])
        bodies = [json.loads(result[2]) for result in results]
        self.assertEqual([body["request_id"] for body in bodies], request_ids)
        self.assertEqual(len(chunker.calls), 1)

    def test_same_active_visual_package_is_recorrelated_for_each_request(self) -> None:
        chunker = QueueChunker(binary=True)
        self.server.chunker_service = chunker
        payload = b"same-visual-pdf-retry"
        request_ids = [
            "b3615f67-b6df-47e1-90b7-7e5d8de13e4f",
            "3b8f2f13-8355-4c7f-a1ed-8c04a7cadff1",
        ]

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.send, request_ids[0], payload)
            self.assertTrue(chunker.started.wait(timeout=3))
            second = executor.submit(self.send, request_ids[1], payload)
            time.sleep(0.05)
            self.assertEqual(len(chunker.calls), 1)
            chunker.release.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual([result[0] for result in results], [200, 200])
        for result, expected_id in zip(results, request_ids):
            with zipfile.ZipFile(io.BytesIO(result[2])) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["request_id"], expected_id)
                self.assertEqual(archive.read("assets/page.png"), b"image")
        self.assertEqual(len(chunker.calls), 1)

    def test_distinct_documents_wait_in_executor_queue_until_capacity_is_available(self) -> None:
        chunker = QueueChunker()
        self.server.chunker_service = chunker
        first_payload = b"first-pdf"
        second_payload = b"second-pdf"
        request_ids = [
            "b3615f67-b6df-47e1-90b7-7e5d8de13e4f",
            "3b8f2f13-8355-4c7f-a1ed-8c04a7cadff1",
        ]

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.send, request_ids[0], first_payload, "/chunk")
            self.assertTrue(chunker.started.wait(timeout=3))
            second = executor.submit(self.send, request_ids[1], second_payload, "/chunk")
            time.sleep(0.05)
            self.assertEqual(len(chunker.calls), 1)
            self.assertEqual(chunker.calls[0][0], first_payload)
            chunker.release.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual([result[0] for result in results], [200, 200])
        self.assertEqual([call[0] for call in chunker.calls], [first_payload, second_payload])

    def test_chunk_jobs_with_same_bytes_but_different_suffixes_are_distinct(self) -> None:
        chunker = QueueChunker()
        self.server.chunker_service = chunker
        payload = b"same-bytes-different-suffixes"
        request_ids = [
            "b3615f67-b6df-47e1-90b7-7e5d8de13e4f",
            "3b8f2f13-8355-4c7f-a1ed-8c04a7cadff1",
        ]

        with ThreadPoolExecutor(max_workers=2) as executor:
            pdf = executor.submit(self.send, request_ids[0], payload, "/chunk", "upload.pdf")
            self.assertTrue(chunker.started.wait(timeout=3))
            docx = executor.submit(self.send, request_ids[1], payload, "/chunk", "upload.docx")
            time.sleep(0.05)
            self.assertEqual(len(chunker.calls), 1)
            chunker.release.set()
            results = [pdf.result(timeout=5), docx.result(timeout=5)]

        self.assertEqual([result[0] for result in results], [200, 200])
        self.assertCountEqual(chunker.filenames, ["upload.pdf", "upload.docx"])


if __name__ == "__main__":
    unittest.main()
