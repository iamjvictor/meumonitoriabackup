"""Behavioral tests for the Docling HTTP service wrapper."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import threading
import time
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from hashlib import sha256
from http.client import HTTPConnection
from pathlib import Path


SERVICE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "docling_http_service.py"
SPEC = importlib.util.spec_from_file_location("docling_http_service", SERVICE_PATH)
assert SPEC is not None and SPEC.loader is not None
service = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = service
SPEC.loader.exec_module(service)


class FakeParser:
    def __init__(self, result: dict[str, object] | None = None, error: Exception | None = None) -> None:
        self.result = result or {
            "markdown": "# Aula\n",
            "document": {"schema_name": "DoclingDocument", "name": "aula"},
            "layout": {"schemaVersion": "docling-layout-v1", "pages": [], "warnings": []},
        }
        self.error = error
        self.calls: list[tuple[str, bytes]] = []

    def parse(self, filename: str, payload: bytes) -> dict[str, object]:
        self.calls.append((filename, payload))
        if self.error is not None:
            raise self.error
        return self.result


class BlockingParser(FakeParser):
    def __init__(self) -> None:
        super().__init__()
        self.active = 0
        self.max_active = 0

    def parse(self, filename: str, payload: bytes) -> dict[str, object]:
        self.calls.append((filename, payload))
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            time.sleep(0.05)
            return self.result
        finally:
            self.active -= 1


class SlowParser(FakeParser):
    def parse(self, filename: str, payload: bytes) -> dict[str, object]:
        self.calls.append((filename, payload))
        time.sleep(0.35)
        return self.result


class LateFailParser(FakeParser):
    def parse(self, filename: str, payload: bytes) -> dict[str, object]:
        self.calls.append((filename, payload))
        time.sleep(0.35)
        raise RuntimeError("late conversion failure")


class GateParser(FakeParser):
    def __init__(self, error: Exception | None = None) -> None:
        super().__init__(error=error)
        self.started = threading.Event()
        self.release = threading.Event()

    def parse(self, filename: str, payload: bytes) -> dict[str, object]:
        self.calls.append((filename, payload))
        self.started.set()
        self.release.wait(timeout=5)
        if self.error is not None:
            raise self.error
        return self.result


class FakeDocument:
    def export_to_markdown(self) -> str:
        return "# Aula\n"

    def export_to_dict(self) -> dict[str, object]:
        return {"schema_name": "DoclingDocument", "name": "aula"}


class FakeConversion:
    document = FakeDocument()


class FakeConverter:
    def convert(self, path: Path) -> FakeConversion:
        return FakeConversion()

def build_multipart(field_name: str, filename: str, content: bytes, boundary: str = "----codex-boundary") -> tuple[str, bytes]:
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    return f"multipart/form-data; boundary={boundary}", body


class DoclingOcrConfigurationTests(unittest.TestCase):
    def test_default_parser_reads_ocr_flag_from_service_environment(self) -> None:
        with patch.dict(os.environ, {"DOCUMENT_PARSER_ENABLE_OCR": "true"}):
            parser = service.CachedParseService()
        self.assertTrue(parser._parser._enable_ocr)


class DoclingHttpServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.parser = FakeParser()
        self.server, self.thread, self.port = service.serve_in_thread(parser=self.parser, host="127.0.0.1", port=0)
        self.logs: list[tuple[str, dict[str, object]]] = []
        setattr(self.server, "boundary_logger", lambda event, payload: self.logs.append((event, payload)))

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def request(self, method: str, path: str, body: bytes = b"", headers: dict[str, str] | None = None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        connection.close()
        return response.status, response.getheaders(), payload

    def test_post_parse_returns_status_result_and_sha_for_uploaded_pdf(self) -> None:
        content = b"%PDF-1.4\nfixture\n"
        content_type, body = build_multipart("file", "aula.pdf", content)

        status, _, payload = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        response = json.loads(payload.decode("utf-8"))
        self.assertEqual(status, 200)
        self.assertEqual(response["status"], "completed")
        self.assertEqual(response["inputSha256"], sha256(content).hexdigest())
        self.assertEqual(response["result"], self.parser.result)
        self.assertEqual(self.parser.calls, [("aula.pdf", content)])

    def test_ready_endpoint_reports_whether_required_parser_resources_are_initialized(self) -> None:
        self.assertEqual(self.request("GET", "/ready")[0], 503)
        self.server.ready = True
        status, _, payload = self.request("GET", "/ready")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload)["status"], "ready")


    def test_post_parse_rejects_missing_file_with_readable_error(self) -> None:
        content_type, body = build_multipart("other", "aula.pdf", b"conteudo")

        status, _, payload = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        response = json.loads(payload.decode("utf-8"))
        self.assertEqual(status, 400)
        self.assertEqual(response["status"], "failed")
        self.assertEqual(response["error"]["code"], "INVALID_INPUT")
        self.assertIn("file", response["error"]["message"])

    def test_streamed_parser_exception_returns_json_error(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.parser = LateFailParser()
        self.server, self.thread, self.port = service.serve_in_thread(
            parser=self.parser,
            host="127.0.0.1",
            port=0,
            stream_after_seconds=0.05,
        )
        content = b"%PDF-1.4\\nfixture\\n"
        content_type, body = build_multipart("file", "aula.pdf", content)

        status, _, payload = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        self.assertEqual(status, 500)
        response = json.loads(payload.decode("utf-8"))
        self.assertEqual(response["status"], "failed")
        self.assertEqual(response["error"]["code"], "PARSER_ERROR")

    def test_post_chunk_echoes_request_id_and_rejects_hash_mismatch(self) -> None:
        content = b"%PDF-1.4\\nfixture\\n"
        content_type, body = build_multipart("file", "aula.pdf", content)
        request_id = "b3615f67-b6df-47e1-90b7-7e5d8de13e4f"

        status, headers, payload = self.request(
            "POST", "/chunk", body=body,
            headers={
                "Content-Type": content_type, "Content-Length": str(len(body)),
                "X-Document-Id": "document-1", "X-Request-Id": request_id,
                "X-Expected-SHA256": "0" * 64,
            },
        )

        response = json.loads(payload.decode("utf-8"))
        self.assertEqual(status, 400)
        self.assertEqual(response["request_id"], request_id)
        self.assertEqual(response["error"]["code"], "DOC_HASH_MISMATCH")
        self.assertEqual(dict(headers).get("X-Request-Id"), request_id)
        self.assertEqual(self.parser.calls, [])

    def test_post_chunk_enforces_configured_conversion_timeout(self) -> None:
        import os
        from unittest.mock import patch
        content = b"%PDF-1.4\\nfixture\\n"
        content_type, body = build_multipart("file", "aula.pdf", content)
        request_id = "b3615f67-b6df-47e1-90b7-7e5d8de13e4f"
        self.server.chunker_service = SimpleNamespace(chunk=lambda *_args: (time.sleep(0.1), {})[1])
        with patch.dict(os.environ, {"DOC_CHUNKER_TIMEOUT_MS": "10"}):
            status, _, payload = self.request(
                "POST", "/chunk", body=body,
                headers={"Content-Type": content_type, "Content-Length": str(len(body)),
                         "X-Document-Id": "document-1", "X-Request-Id": request_id,
                         "X-Expected-SHA256": sha256(content).hexdigest()},
            )
        self.assertEqual(status, 504)
        self.assertEqual(json.loads(payload)["error"]["code"], "DOC_CHUNKER_TIMEOUT")

    def test_chunk_v2_returns_visual_package_without_changing_v1_json_contract(self) -> None:
        import io
        import zipfile
        content = b"%PDF-1.4\\nfixture\\n"
        content_type, body = build_multipart("file", "aula.pdf", content)
        request_id = "b3615f67-b6df-47e1-90b7-7e5d8de13e4f"
        package = io.BytesIO()
        with zipfile.ZipFile(package, "w") as archive:
            archive.writestr("manifest.json", '{"schema_version":"doc-chunker/v2"}')
        calls = []
        def chunk(*_args, **kwargs):
            calls.append(kwargs)
            return package.getvalue()
        self.server.chunker_service = SimpleNamespace(chunk=chunk)

        status, headers, payload = self.request(
            "POST", "/chunk/v2", body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body)),
                     "X-Document-Id": "document-1", "X-Request-Id": request_id,
                     "X-Expected-SHA256": sha256(content).hexdigest()},
        )
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers)["Content-Type"], "application/vnd.doc-chunker.v2+zip")
        self.assertEqual(dict(headers)["X-Request-Id"], request_id)
        self.assertEqual(payload, package.getvalue())
        self.assertEqual(calls, [{"visual_package": True}])

    def test_cached_service_reconverts_same_payload_after_completion(self) -> None:
        parser = FakeParser()
        cached_service = service.CachedParseService(parser=parser)
        content = b"%PDF-1.4\nfixture\n"

        first = cached_service.parse("aula.pdf", content)
        second = cached_service.parse("aula.pdf", content)

        self.assertEqual(first, second)
        self.assertEqual(len(parser.calls), 2)
        self.assertEqual(cached_service._in_flight, {})

    def test_cached_service_coalesces_simultaneous_same_payload(self) -> None:
        parser = GateParser()
        cached_service = service.CachedParseService(parser=parser)
        content = b"%PDF-1.4\nfixture\n"
        with ThreadPoolExecutor(max_workers=2) as executor:
            first_future = executor.submit(cached_service.parse, "aula.pdf", content)
            self.assertTrue(parser.started.wait(timeout=5))
            second_future = executor.submit(cached_service.parse, "aula.pdf", content)
            parser.release.set()
            first = first_future.result(timeout=5)
            second = second_future.result(timeout=5)

        self.assertEqual(first, second)
        self.assertEqual(len(parser.calls), 1)
        self.assertEqual(cached_service._in_flight, {})

    def test_cached_service_clears_in_flight_after_parser_failure(self) -> None:
        parser = GateParser(error=RuntimeError("model unavailable"))
        cached_service = service.CachedParseService(parser=parser)
        content = b"%PDF-1.4\nfixture\n"
        with self.assertRaisesRegex(RuntimeError, "model unavailable"):
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(cached_service.parse, "aula.pdf", content)
                self.assertTrue(parser.started.wait(timeout=5))
                parser.release.set()
                future.result(timeout=5)

        self.assertEqual(cached_service._in_flight, {})

    def test_post_parse_respects_the_configured_parser_concurrency(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.parser = BlockingParser()
        self.server, self.thread, self.port = service.serve_in_thread(
            parser=self.parser,
            host="127.0.0.1",
            port=0,
            max_concurrency=1,
        )

        content_type, body = build_multipart("file", "aula.pdf", b"%PDF-1.4\nfixture\n")

        def send_request() -> int:
            status, _, _ = self.request(
                "POST",
                "/v1/parse",
                body=body,
                headers={"Content-Type": content_type, "Content-Length": str(len(body))},
            )
            return status

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(lambda _index: send_request(), range(2)))

        self.assertEqual(statuses, [200, 200])
        self.assertEqual(self.parser.max_active, 1)

    def test_post_parse_keeps_long_conversion_connection_alive_with_heartbeat(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.parser = SlowParser()
        self.server, self.thread, self.port = service.serve_in_thread(
            parser=self.parser,
            host="127.0.0.1",
            port=0,
            stream_after_seconds=0.05,
        )

        content_type, body = build_multipart("file", "aula.pdf", b"%PDF-1.4\nfixture\n")
        status, _, payload = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        self.assertEqual(status, 200)
        self.assertTrue(payload.startswith(b"{"))
        self.assertEqual(json.loads(payload.decode("utf-8"))["status"], "completed")

    def test_json_response_treats_client_disconnect_as_expected_boundary(self) -> None:
        logs: list[tuple[str, dict[str, object]]] = []

        class BrokenPipeWriter:
            def write(self, _payload: bytes) -> int:
                raise BrokenPipeError(32, "Broken pipe")

        class Handler:
            wfile = BrokenPipeWriter()

            def send_response(self, _status: int) -> None:
                return None

            def send_header(self, _name: str, _value: str) -> None:
                return None

            def end_headers(self) -> None:
                return None

        fake_handler = Handler()
        fake_server = SimpleNamespace(boundary_logger=lambda event, payload: logs.append((event, payload)))
        fake_handler.server = fake_server

        service._json_response(fake_handler, 200, {"status": "completed"})

        self.assertEqual(logs[-1][0], "docling_http.client_disconnected")

    def test_post_parse_reports_parser_failures_with_a_readable_error(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.parser = FakeParser(error=RuntimeError("model unavailable"))
        self.server, self.thread, self.port = service.serve_in_thread(parser=self.parser, host="127.0.0.1", port=0)
        setattr(self.server, "boundary_logger", lambda event, payload: self.logs.append((event, payload)))

        content = b"%PDF-1.4\nfixture\n"
        content_type, body = build_multipart("file", "aula.pdf", content)

        status, _, payload = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        response = json.loads(payload.decode("utf-8"))
        self.assertEqual(status, 500)
        self.assertEqual(response["status"], "failed")
        self.assertEqual(response["error"]["code"], "PARSER_ERROR")
        self.assertIn("model unavailable", response["error"]["message"])

    def test_post_parse_emits_boundary_logs_for_request_lifecycle(self) -> None:
        content = b"%PDF-1.4\nfixture\n"
        content_type, body = build_multipart("file", "aula.pdf", content)

        status, _, _ = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(self.logs), 2)
        event_names = [event for event, _payload in self.logs]
        self.assertEqual(event_names[0], "docling_http.request_started")
        self.assertEqual(event_names[-1], "docling_http.request_finished")
        self.assertEqual(self.logs[0][1]["path"], "/v1/parse")
        self.assertEqual(self.logs[-1][1]["status_code"], 200)
        self.assertEqual(self.logs[-1][1]["parse_status"], "completed")

    def test_post_parse_emits_boundary_logs_for_parser_error(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.parser = FakeParser(error=RuntimeError("model unavailable"))
        self.server, self.thread, self.port = service.serve_in_thread(parser=self.parser, host="127.0.0.1", port=0)
        setattr(self.server, "boundary_logger", lambda event, payload: self.logs.append((event, payload)))

        content = b"%PDF-1.4\nfixture\n"
        content_type, body = build_multipart("file", "aula.pdf", content)

        status, _, _ = self.request(
            "POST",
            "/v1/parse",
            body=body,
            headers={"Content-Type": content_type, "Content-Length": str(len(body))},
        )

        self.assertEqual(status, 500)
        self.assertGreaterEqual(len(self.logs), 2)
        event_names = [event for event, _payload in self.logs]
        self.assertEqual(event_names[0], "docling_http.request_started")
        self.assertEqual(event_names[-1], "docling_http.request_failed")
        self.assertEqual(self.logs[-1][1]["status_code"], 500)
        self.assertEqual(self.logs[-1][1]["error_code"], "PARSER_ERROR")
        self.assertIn("model unavailable", self.logs[-1][1]["error_message"])

    def test_real_parser_emits_conversion_stage_logs(self) -> None:
        logs: list[tuple[str, dict[str, object]]] = []
        parser = service.RealDoclingParser(
            converter_factory=lambda **_options: FakeConverter(),
            text_analyzer=lambda _path: service.classify_native_text_pages(["x" * 80]),
            boundary_logger=lambda event, payload: logs.append((event, payload)),
        )

        parser.parse("aula.pdf", b"%PDF-1.4\nfixture\n")

        event_names = [event for event, _payload in logs]
        self.assertEqual(event_names, [
            "docling_parser.conversion_started",
            "docling_parser.text_layer_analyzed",
            "docling_parser.converter_ready",
            "docling_parser.conversion_finished",
            "docling_parser.exports_finished",
        ])
        self.assertNotIn("filename", logs[0][1])
        self.assertEqual(logs[0][1]["payload_bytes"], 17)
        self.assertGreaterEqual(logs[-1][1]["markdown_chars"], 1)


if __name__ == "__main__":
    unittest.main()
