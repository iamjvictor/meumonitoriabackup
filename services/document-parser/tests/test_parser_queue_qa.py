"""Independent queue regression tests; all parser work is stubbed and local."""

from __future__ import annotations

import importlib.util
import io
import json
import os
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
SPEC = importlib.util.spec_from_file_location("docling_http_service_queue_qa", SERVICE_PATH)
assert SPEC is not None and SPEC.loader is not None
service = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = service
SPEC.loader.exec_module(service)
from doc_chunker import DocChunkerError  # noqa: E402

REQUEST_IDS = (
    "b3615f67-b6df-47e1-90b7-7e5d8de13e4f",
    "3b8f2f13-8355-4c7f-a1ed-8c04a7cadff1",
)


def multipart(filename: str, payload: bytes) -> tuple[str, bytes]:
    boundary = "----independent-queue-qa-boundary"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
    ).encode() + payload + f"\r\n--{boundary}--\r\n".encode()
    return f"multipart/form-data; boundary={boundary}", body


def package(payload: bytes, request_id: str) -> bytes:
    manifest = {
        "schema_version": "doc-chunker/v2",
        "request_id": request_id,
        "doc_hash": sha256(payload).hexdigest(),
        "parser_version": "qa",
        "tokenizer_id": "qa-tokenizer",
        "chunker_version": "qa-v1",
        "engine": "docling",
        "page_count": 1,
        "chunks": [{
            "index": 0, "text": "fila", "raw_text": "fila", "headings": [],
            "pages": [1], "type": "text", "tokens": 1, "provenance": [],
        }],
        "visual_assets": [],
        "warnings": [],
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("qa/asset.bin", b"package-payload")
    return output.getvalue()


class BoundaryEvents:
    def __init__(self) -> None:
        self.condition = threading.Condition()
        self.events: list[tuple[str, dict[str, object]]] = []

    def __call__(self, event: str, fields: dict[str, object]) -> None:
        with self.condition:
            self.events.append((event, fields))
            self.condition.notify_all()

    def wait_for(self, predicate, timeout: float = 3) -> bool:
        with self.condition:
            return self.condition.wait_for(lambda: predicate(self.events), timeout=timeout)


class ControlledChunker:
    def __init__(self, *, block: bool = False, error: Exception | None = None) -> None:
        self.calls: list[tuple[str, bytes, str, bool]] = []
        self.lock = threading.Lock()
        self.started = threading.Event()
        self.release = threading.Event()
        if not block:
            self.release.set()
        self.error = error

    def chunk(self, filename: str, payload: bytes, request_id: str, _digest: str, *, visual_package: bool = False):
        with self.lock:
            self.calls.append((filename, payload, request_id, visual_package))
        self.started.set()
        if not self.release.wait(timeout=8):
            raise RuntimeError("QA gate was not released")
        if self.error is not None:
            raise self.error
        return package(payload, request_id) if visual_package else {
            "status": "completed", "request_id": request_id,
            "doc_hash": sha256(payload).hexdigest(), "chunks": [],
        }


class ParserQueueIndependentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.events = BoundaryEvents()
        self.server, self.thread, self.port = service.serve_in_thread(
            host="127.0.0.1",
            port=0,
            parser=SimpleNamespace(parse=lambda _filename, _payload: {"markdown": "stub"}),
            boundary_logger=self.events,
            max_concurrency=1,
        )

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def restart_server(self, *, max_concurrency: int) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.server, self.thread, self.port = service.serve_in_thread(
            host="127.0.0.1",
            port=0,
            parser=SimpleNamespace(parse=lambda _filename, _payload: {"markdown": "stub"}),
            boundary_logger=self.events,
            max_concurrency=max_concurrency,
        )

    def send(
        self,
        request_id: str,
        document_id: str,
        filename: str,
        payload: bytes,
        path: str = "/chunk/v2",
    ) -> tuple[int, dict[str, str], bytes]:
        content_type, body = multipart(filename, payload)
        connection = HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request("POST", path, body=body, headers={
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
            "X-Document-Id": document_id,
            "X-Request-Id": request_id,
            "X-Expected-SHA256": sha256(payload).hexdigest(),
        })
        response = connection.getresponse()
        response_body = response.read()
        headers = dict(response.getheaders())
        connection.close()
        return response.status, headers, response_body

    def send_parse(self, filename: str, payload: bytes) -> tuple[int, bytes]:
        content_type, body = multipart(filename, payload)
        connection = HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request("POST", "/v1/parse", body=body, headers={
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
        })
        response = connection.getresponse()
        response_body = response.read()
        connection.close()
        return response.status, response_body

    def test_fifo_capacity_keeps_second_distinct_document_waiting_then_returns_both_packages(self) -> None:
        chunker = ControlledChunker(block=True)
        self.server.chunker_service = chunker
        first_payload, second_payload = b"first document", b"second document"

        with ThreadPoolExecutor(max_workers=2) as clients:
            first = clients.submit(self.send, REQUEST_IDS[0], "doc-first", "first.pdf", first_payload)
            self.assertTrue(chunker.started.wait(timeout=3))
            second = clients.submit(self.send, REQUEST_IDS[1], "doc-second", "second.pdf", second_payload)
            self.assertTrue(self.events.wait_for(
                lambda recorded: sum(event == "doc_chunker.request_started" for event, _ in recorded) >= 2,
            ))
            self.assertEqual(len(chunker.calls), 1, "queued PDF must not begin conversion before capacity is free")
            chunker.release.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual([item[0] for item in results], [200, 200])
        self.assertEqual([call[1] for call in chunker.calls], [first_payload, second_payload])
        for result, expected_id, expected_payload in zip(results, REQUEST_IDS, (first_payload, second_payload)):
            self.assertEqual(result[1]["X-Request-Id"], expected_id)
            with zipfile.ZipFile(io.BytesIO(result[2])) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["request_id"], expected_id)
                self.assertEqual(manifest["doc_hash"], sha256(expected_payload).hexdigest())
                self.assertEqual(archive.read("qa/asset.bin"), b"package-payload")

    def test_duplicate_v2_content_coalesces_without_leaking_request_metadata(self) -> None:
        self.restart_server(max_concurrency=2)
        chunker = ControlledChunker(block=True)
        self.server.chunker_service = chunker
        payload = b"same content with retry metadata"

        with ThreadPoolExecutor(max_workers=2) as clients:
            first = clients.submit(self.send, REQUEST_IDS[0], "doc-original", "original.pdf", payload)
            self.assertTrue(chunker.started.wait(timeout=3))
            second = clients.submit(self.send, REQUEST_IDS[1], "doc-retry", "retry.pdf", payload)
            self.assertTrue(self.events.wait_for(
                lambda recorded: any(
                    event == "doc_parser.job_coalesced" and fields.get("request_id") == REQUEST_IDS[1]
                    for event, fields in recorded
                ),
            ))
            self.assertEqual(len(chunker.calls), 1)
            chunker.release.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual([item[0] for item in results], [200, 200])
        self.assertEqual(len(chunker.calls), 1, "same hash+endpoint must share active conversion")
        self.assertEqual(chunker.calls[0][0], "original.pdf")
        coalesced_log = next(
            fields for event, fields in self.events.events
            if event == "doc_parser.job_coalesced" and fields.get("request_id") == REQUEST_IDS[1]
        )
        self.assertEqual(coalesced_log["document_id"], "doc-retry")
        for result, expected_id in zip(results, REQUEST_IDS):
            self.assertEqual(result[1]["X-Request-Id"], expected_id)
            with zipfile.ZipFile(io.BytesIO(result[2])) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["request_id"], expected_id)
                self.assertEqual(manifest["doc_hash"], sha256(payload).hexdigest())
                self.assertEqual(archive.read("qa/asset.bin"), b"package-payload")

    def test_request_does_not_fail_at_legacy_timeout_and_releases_after_long_job(self) -> None:
        chunker = ControlledChunker(block=True)
        self.server.chunker_service = chunker
        payload = b"slow but eventually successful"

        with patch.dict(os.environ, {"DOC_CHUNKER_TIMEOUT_MS": "1"}):
            with ThreadPoolExecutor(max_workers=1) as clients:
                pending = clients.submit(self.send, REQUEST_IDS[0], "doc-slow", "slow.pdf", payload)
                self.assertTrue(chunker.started.wait(timeout=3))
                time.sleep(0.03)
                self.assertFalse(pending.done(), "the old local timeout must not abandon an active parser job")
                chunker.release.set()
                status, headers, body = pending.result(timeout=5)

        self.assertEqual(status, 200)
        self.assertEqual(headers["X-Request-Id"], REQUEST_IDS[0])
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            self.assertEqual(json.loads(archive.read("manifest.json"))["request_id"], REQUEST_IDS[0])

    def test_parser_failure_surfaces_original_error_and_failed_job_is_removed_for_retry(self) -> None:
        parser_error = DocChunkerError("DOCLING_CONVERSION_FAILED", "converter falhou", 503, "convert")
        chunker = ControlledChunker(error=parser_error)
        self.server.chunker_service = chunker
        payload = b"retry after conversion failure"

        status, _headers, body = self.send(REQUEST_IDS[0], "doc-failure", "failure.pdf", payload)
        response = json.loads(body)
        self.assertEqual(status, 503)
        self.assertEqual(response["error"]["code"], "DOCLING_CONVERSION_FAILED")
        self.assertTrue(
            any(event == "doc_chunker.request_failed" for event, _ in self.events.events),
            repr(self.events.events),
        )

        chunker.error = None
        chunker.release.set()
        retry_status, _retry_headers, retry_body = self.send(REQUEST_IDS[1], "doc-failure", "failure.pdf", payload)
        self.assertEqual(retry_status, 200)
        self.assertEqual(len(chunker.calls), 2, "a completed failure must not poison future attempts")
        with zipfile.ZipFile(io.BytesIO(retry_body)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["request_id"], REQUEST_IDS[1])
            self.assertEqual(manifest["doc_hash"], sha256(payload).hexdigest())

    def test_parse_does_not_share_identical_bytes_across_different_filename_suffixes(self) -> None:
        self.restart_server(max_concurrency=2)

        class FilenameAwareParser:
            def __init__(self) -> None:
                self.calls: list[str] = []
                self.lock = threading.Lock()
                self.started = threading.Event()
                self.release = threading.Event()

            def parse(self, filename: str, _payload: bytes) -> dict[str, str]:
                with self.lock:
                    self.calls.append(filename)
                self.started.set()
                self.release.wait(timeout=5)
                return {"received_filename": filename}

        parser = FilenameAwareParser()
        self.server.parser_service = service.CachedParseService(parser=parser)
        payload = b"same bytes but parser-relevant extension differs"

        with ThreadPoolExecutor(max_workers=2) as clients:
            first = clients.submit(self.send_parse, "upload.pdf", payload)
            self.assertTrue(parser.started.wait(timeout=3))
            second = clients.submit(self.send_parse, "upload.docx", payload)
            self.assertTrue(self.events.wait_for(
                lambda recorded: sum(event == "docling_http.request_started" for event, _ in recorded) >= 2,
            ))
            parser.release.set()
            results = [first.result(timeout=5), second.result(timeout=5)]

        self.assertEqual([status for status, _ in results], [200, 200])
        parsed = [json.loads(body)["result"]["received_filename"] for _, body in results]
        self.assertEqual(parsed, ["upload.pdf", "upload.docx"])
        self.assertEqual(sorted(parser.calls), ["upload.docx", "upload.pdf"])


if __name__ == "__main__":
    unittest.main()
