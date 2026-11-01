#!/usr/bin/env python3
"""Minimal HTTP wrapper around the existing Docling parser logic."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import threading
import traceback
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import dataclass, replace
from hashlib import sha256
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from typing import Any, Callable, Iterable, Literal
from uuid import UUID
import os
import time

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from run_mineru import get_document_converter, normalize_content_list


JsonValue = dict[str, Any]
BoundaryLogger = Callable[[str, JsonValue], None]
TextClassification = Literal["TEXT", "SCANNED", "MIXED"]

MIN_NATIVE_TEXT_CHARS_PER_PAGE = 80
TEXT_DOCUMENT_MIN_PAGE_RATIO = 0.70
SCANNED_DOCUMENT_MAX_PAGE_RATIO = 0.30


@dataclass(frozen=True, slots=True)
class TextLayerAnalysis:
    classification: TextClassification
    page_count: int
    pages_with_text: int
    native_text_chars: int
    ocr_enabled: bool
    force_backend_text: bool

    def with_explicit_ocr_option(self, enable_ocr: bool) -> "TextLayerAnalysis":
        if not enable_ocr:
            return replace(self, ocr_enabled=False, force_backend_text=True)
        is_text = self.classification == "TEXT"
        return replace(self, ocr_enabled=not is_text, force_backend_text=is_text)

    def to_response_payload(self) -> JsonValue:
        return {
            "classification": self.classification,
            "pageCount": self.page_count,
            "pagesWithText": self.pages_with_text,
            "nativeTextChars": self.native_text_chars,
            "ocrEnabled": self.ocr_enabled,
            "forceBackendText": self.force_backend_text,
        }

    def to_log_payload(self) -> JsonValue:
        return {
            "classification": self.classification,
            "page_count": self.page_count,
            "pages_with_text": self.pages_with_text,
            "native_text_chars": self.native_text_chars,
            "ocr_enabled": self.ocr_enabled,
            "force_backend_text": self.force_backend_text,
        }


def _normalize_native_text(value: str) -> str:
    return " ".join(value.split())


def classify_native_text_pages(page_texts: Iterable[str]) -> TextLayerAnalysis:
    normalized_lengths = [len(_normalize_native_text(text)) for text in page_texts]
    page_count = len(normalized_lengths)
    pages_with_text = sum(
        length >= MIN_NATIVE_TEXT_CHARS_PER_PAGE
        for length in normalized_lengths
    )
    native_text_chars = sum(normalized_lengths)
    text_ratio = pages_with_text / page_count if page_count else 0.0

    if page_count > 0 and text_ratio >= TEXT_DOCUMENT_MIN_PAGE_RATIO:
        classification: TextClassification = "TEXT"
    elif page_count == 0 or text_ratio < SCANNED_DOCUMENT_MAX_PAGE_RATIO:
        classification = "SCANNED"
    else:
        classification = "MIXED"

    return TextLayerAnalysis(
        classification=classification,
        page_count=page_count,
        pages_with_text=pages_with_text,
        native_text_chars=native_text_chars,
        ocr_enabled=False,
        force_backend_text=True,
    )


def _close_pdf_resource(resource: Any) -> None:
    close = getattr(resource, "close", None)
    if callable(close):
        close()


def analyze_pdf_text_layer(
    input_path: Path,
    *,
    pdf_document_factory: Callable[[str], Any] | None = None,
) -> TextLayerAnalysis:
    """Extract native text cheaply with PDFium; invalid PDFs defer to Docling."""
    if pdf_document_factory is None:
        from pypdfium2 import PdfDocument

        pdf_document_factory = PdfDocument

    document = None
    try:
        document = pdf_document_factory(str(input_path))
        page_texts: list[str] = []
        for page_index in range(len(document)):
            page = document[page_index]
            text_page = None
            try:
                text_page = page.get_textpage()
                page_texts.append(text_page.get_text_range() or "")
            finally:
                if text_page is not None:
                    _close_pdf_resource(text_page)
                _close_pdf_resource(page)
        return classify_native_text_pages(page_texts)
    except Exception:
        return classify_native_text_pages([])
    finally:
        if document is not None:
            _close_pdf_resource(document)


@dataclass(slots=True)
class ParseError(Exception):
    code: str
    message: str
    status_code: int = HTTPStatus.BAD_REQUEST

    def to_payload(self) -> JsonValue:
        return {
            "status": "failed",
            "error": {
                "code": self.code,
                "message": self.message,
            },
        }


class RealDoclingParser:
    """Convert uploaded bytes using the current parser implementation."""

    def __init__(
        self,
        converter_factory: Callable[..., Any] | None = None,
        text_analyzer: Callable[[Path], TextLayerAnalysis] | None = None,
        enable_ocr: bool | None = None,
        boundary_logger: BoundaryLogger | None = None,
    ) -> None:
        self._converter_factory = converter_factory or get_document_converter
        self._text_analyzer = text_analyzer or analyze_pdf_text_layer
        self._enable_ocr = enable_ocr if enable_ocr is not None else os.getenv("DOCUMENT_PARSER_ENABLE_OCR", "false").lower() == "true"
        self._boundary_logger = boundary_logger or _default_boundary_logger

    def _log(self, event: str, payload: JsonValue) -> None:
        self._boundary_logger(event, payload)

    def parse(self, filename: str, payload: bytes) -> JsonValue:
        if not filename:
            raise ParseError("INVALID_INPUT", "O arquivo enviado precisa ter nome.")
        if not payload:
            raise ParseError("INVALID_INPUT", "O arquivo enviado está vazio.")

        input_sha256 = sha256(payload).hexdigest()
        self._log("docling_parser.conversion_started", {
            "payload_bytes": len(payload),
            "input_sha256": input_sha256,
        })
        suffix = Path(filename).suffix or ".pdf"
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / f"input{suffix}"
            input_path.write_bytes(payload)
            text_analysis = self._text_analyzer(input_path).with_explicit_ocr_option(self._enable_ocr)
            self._log(
                "docling_parser.text_layer_analyzed",
                text_analysis.to_log_payload(),
            )
            converter = self._converter_factory(
                do_ocr=text_analysis.ocr_enabled,
                force_backend_text=text_analysis.force_backend_text,
            )
            self._log("docling_parser.converter_ready", {
                "input_sha256": input_sha256,
            })
            document = converter.convert(input_path).document
            self._log("docling_parser.conversion_finished", {
                "input_sha256": input_sha256,
            })
            markdown = document.export_to_markdown()
            document_json = document.export_to_dict()
            layout = normalize_content_list(document)
            self._log("docling_parser.exports_finished", {
                "input_sha256": input_sha256,
                "markdown_chars": len(markdown),
                "layout_pages": len(layout.get("pages", [])),
            })
            return {
                "markdown": markdown,
                "document": document_json,
                "layout": layout,
                "textAnalysis": text_analysis.to_response_payload(),
            }


class CachedParseService:
    """Coalesce conversions that are currently running, keyed by file bytes."""

    def __init__(self, parser: Any | None = None) -> None:
        self._parser = parser or RealDoclingParser()
        self._in_flight: dict[str, Future[JsonValue]] = {}
        self._lock = threading.Lock()

    def parse(self, filename: str, payload: bytes) -> JsonValue:
        input_sha256 = sha256(payload).hexdigest()
        with self._lock:
            pending = self._in_flight.get(input_sha256)
            if pending is None:
                pending = Future()
                self._in_flight[input_sha256] = pending
                owns_conversion = True
            else:
                owns_conversion = False

        if not owns_conversion:
            return pending.result()

        try:
            result = self._parser.parse(filename, payload)
            response = {
                "status": "completed",
                "inputSha256": input_sha256,
                "result": result,
            }
            with self._lock:
                self._in_flight.pop(input_sha256, None)
            pending.set_result(response)
            return response
        except BaseException as exc:
            with self._lock:
                self._in_flight.pop(input_sha256, None)
            pending.set_exception(exc)
            raise


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: JsonValue, headers: dict[str, str] | None = None) -> bool:
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(encoded)))
    for name, value in (headers or {}).items():
        handler.send_header(name, value)
    handler.end_headers()
    try:
        handler.wfile.write(encoded)
        return True
    except (BrokenPipeError, ConnectionResetError):
        _log_boundary(handler, "docling_http.client_disconnected", {
            "method": getattr(handler, "command", ""),
            "path": getattr(handler, "path", ""),
            "status_code": status,
            "failure_kind": "client_disconnected",
        })
        return False


def _binary_response(
    handler: BaseHTTPRequestHandler, status: int, payload: bytes,
    content_type: str, headers: dict[str, str] | None = None,
) -> bool:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Cache-Control", "no-store")
    for name, value in (headers or {}).items():
        handler.send_header(name, value)
    handler.end_headers()
    try:
        handler.wfile.write(payload)
        handler.wfile.flush()
        return True
    except (BrokenPipeError, ConnectionResetError, OSError):
        return False
def _default_boundary_logger(event: str, payload: JsonValue) -> None:
    print(
        json.dumps({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "service": "doc-chunker", "event": event, **payload,
        }, ensure_ascii=False, sort_keys=True),
        file=sys.stderr,
        flush=True,
    )


def _log_boundary(handler: BaseHTTPRequestHandler, event: str, payload: JsonValue) -> None:
    logger = getattr(handler.server, "boundary_logger", _default_boundary_logger)
    try:
        logger(event, payload)
    except TypeError:
        logger((event, payload))


def _emit_request_started(handler: BaseHTTPRequestHandler) -> None:
    _log_boundary(handler, "docling_http.request_started", {
        "method": handler.command,
        "path": handler.path,
        "content_type": handler.headers.get("Content-Type", ""),
        "content_length": handler.headers.get("Content-Length", ""),
    })


def _emit_request_finished(handler: BaseHTTPRequestHandler, payload: JsonValue) -> None:
    _log_boundary(handler, "docling_http.request_finished", payload)


def _emit_request_failed(handler: BaseHTTPRequestHandler, payload: JsonValue) -> None:
    _log_boundary(handler, "docling_http.request_failed", payload)


def _read_request_body(handler: BaseHTTPRequestHandler) -> bytes:
    length = handler.headers.get("Content-Length")
    if length is None:
        raise ParseError("INVALID_INPUT", "Content-Length é obrigatório.")
    try:
        size = int(length)
    except ValueError as exc:
        raise ParseError("INVALID_INPUT", "Content-Length inválido.") from exc
    if size < 0:
        raise ParseError("INVALID_INPUT", "Content-Length inválido.")
    return handler.rfile.read(size)


def _extract_file_upload(handler: BaseHTTPRequestHandler) -> tuple[str, bytes]:
    content_type = handler.headers.get("Content-Type", "")
    if "multipart/form-data" not in content_type:
        raise ParseError("INVALID_INPUT", "POST /v1/parse exige multipart/form-data com campo file.")

    body = _read_request_body(handler)
    message = BytesParser(policy=default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
    )
    if not message.is_multipart():
        raise ParseError("INVALID_INPUT", "POST /v1/parse exige multipart/form-data com campo file.")

    upload = None
    for part in message.iter_parts():
        if part.get_param("name", header="content-disposition") == "file":
            upload = part
            break

    if upload is None:
        raise ParseError("INVALID_INPUT", "Campo file é obrigatório.")

    filename = upload.get_filename() or ""
    payload = upload.get_payload(decode=True) or b""
    return filename, payload


class DoclingRequestHandler(BaseHTTPRequestHandler):
    server_version = "DoclingHTTP/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # pragma: no cover - noisy in tests
        return

    @property
    def parser_service(self) -> CachedParseService:
        service = getattr(self.server, "parser_service", None)
        if service is None:
            service = CachedParseService()
            setattr(self.server, "parser_service", service)
        return service

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/ready":
            ready = bool(getattr(self.server, "ready", False))
            _json_response(self, HTTPStatus.OK if ready else HTTPStatus.SERVICE_UNAVAILABLE, {"status": "ready" if ready else "not_ready"})
            return
        if self.path != "/health":
            _json_response(self, HTTPStatus.NOT_FOUND, {
                "status": "failed",
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Endpoint inexistente.",
                },
            })
            return
        _json_response(self, HTTPStatus.OK, {"status": "ok"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path in {"/chunk", "/chunk/v2"}:
            self._handle_chunk(visual_package=self.path == "/chunk/v2")
            return
        if self.path != "/v1/parse":
            _json_response(self, HTTPStatus.NOT_FOUND, {
                "status": "failed",
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Endpoint inexistente.",
                },
            })
            return

        _emit_request_started(self)
        try:
            filename, payload = _extract_file_upload(self)
            with self.server.parser_semaphore:
                response = self.server.parser_executor.submit(
                    self.parser_service.parse, filename, payload
                ).result()
        except ParseError as exc:
            _emit_request_failed(self, {
                "method": self.command,
                "path": self.path,
                "status_code": exc.status_code,
                "parse_status": "failed",
                "error_code": exc.code,
                "error_message": exc.message,
                "failure_kind": "input",
            })
            _json_response(self, exc.status_code, exc.to_payload())
            return
        except Exception as exc:  # pragma: no cover - defensive error boundary
            traceback.print_exception(exc, file=sys.stderr)
            _emit_request_failed(self, {
                "method": self.command,
                "path": self.path,
                "status_code": HTTPStatus.INTERNAL_SERVER_ERROR,
                "parse_status": "failed",
                "error_code": "PARSER_ERROR",
                "error_message": f"{type(exc).__name__}: {exc}",
                "failure_kind": "parser",
            })
            _json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {
                "status": "failed",
                "error": {
                    "code": "PARSER_ERROR",
                    "message": f"{type(exc).__name__}: {exc}",
                },
            })
            return

        _emit_request_finished(self, {
            "method": self.command,
            "path": self.path,
            "status_code": HTTPStatus.OK,
            "parse_status": str(response.get("status", "completed")),
            "input_sha256": str(response.get("inputSha256", "")),
            "payload_bytes": len(payload),
        })
        _json_response(self, HTTPStatus.OK, response)

    def _handle_chunk(self, *, visual_package: bool = False) -> None:
        request_started = time.monotonic()
        request_id = self.headers.get("X-Request-Id", "")
        try:
            request_id = str(UUID(request_id))
        except (ValueError, AttributeError):
            _json_response(self, HTTPStatus.BAD_REQUEST, {
                "status": "failed", "request_id": request_id,
                "error": {"code": "INVALID_REQUEST_ID", "message": "X-Request-Id precisa ser um UUID."},
            })
            return
        try:
            document_id = self.headers.get("X-Document-Id", "")
            _log_boundary(self, "doc_chunker.request_started", {
                "request_id": request_id, "document_id": document_id,
                "payload_bytes": self.headers.get("Content-Length"), "stage": "input",
            })
            max_bytes = int(os.getenv("DOC_CHUNKER_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
            content_length = int(self.headers.get("Content-Length", "-1"))
            if content_length < 0:
                raise ParseError("INVALID_INPUT", "Content-Length é obrigatório.")
            if content_length > max_bytes + 1024 * 1024:
                raise ParseError("UPLOAD_TOO_LARGE", "O arquivo excede o limite de envio.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            filename, payload = _extract_file_upload(self)
            if len(payload) > max_bytes:
                raise ParseError("UPLOAD_TOO_LARGE", "O arquivo excede o limite de envio.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            expected_hash = self.headers.get("X-Expected-SHA256", "")
            if not document_id or len(expected_hash) != 64:
                raise ParseError("INVALID_INPUT", "Identificador do documento e SHA-256 esperado são obrigatórios.")
            from doc_chunker import DocChunkerError, DocChunkerService
            actual_hash = sha256(payload).hexdigest()
            if actual_hash != expected_hash:
                raise DocChunkerError("DOC_HASH_MISMATCH", "O hash do arquivo recebido não corresponde ao esperado.", HTTPStatus.BAD_REQUEST)
            chunker_service = getattr(self.server, "chunker_service", None)
            if chunker_service is None:
                chunker_service = DocChunkerService()
                setattr(self.server, "chunker_service", chunker_service)
            self.server.parser_semaphore.acquire()
            try:
                if visual_package:
                    future = self.server.parser_executor.submit(
                        chunker_service.chunk, filename, payload, request_id, expected_hash,
                        visual_package=True,
                    )
                else:
                    future = self.server.parser_executor.submit(
                        chunker_service.chunk, filename, payload, request_id, expected_hash,
                    )
                future.add_done_callback(lambda _future: self.server.parser_semaphore.release())
            except Exception:
                self.server.parser_semaphore.release()
                raise
            try:
                response = future.result(timeout=max(1, int(os.getenv("DOC_CHUNKER_TIMEOUT_MS", "600000"))) / 1000)
            except FutureTimeoutError as exc:
                from doc_chunker import DocChunkerError
                raise DocChunkerError("DOC_CHUNKER_TIMEOUT", "O tempo limite de conversão foi excedido.", HTTPStatus.GATEWAY_TIMEOUT, "convert") from exc
            is_binary = isinstance(response, bytes)
            response_bytes = response if is_binary else json.dumps(response, ensure_ascii=False).encode("utf-8")
            max_response_bytes = int(os.getenv("DOC_CHUNKER_MAX_RESPONSE_BYTES", str(20 * 1024 * 1024)))
            if len(response_bytes) > max_response_bytes:
                from doc_chunker import DocChunkerError
                raise DocChunkerError("DOC_CHUNKER_RESPONSE_TOO_LARGE", "A resposta excede o limite permitido.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "serialize")
            _log_boundary(self, "doc_chunker.response.started", {
                "request_id": request_id, "document_id": document_id, "stage": "serialize",
            })
            if is_binary:
                completed = _binary_response(
                    self, HTTPStatus.OK, response, "application/vnd.doc-chunker.v2+zip",
                    {"X-Request-Id": request_id},
                )
            else:
                completed = _json_response(self, HTTPStatus.OK, response, {"X-Request-Id": request_id})
            _log_boundary(self, "doc_chunker.request_completed" if completed else "doc_chunker.request_failed", {
                "request_id": request_id, "document_id": document_id,
                "stage": "send", "outcome": "completed" if completed else "failed",
                "duration_ms": round((time.monotonic() - request_started) * 1000),
                "doc_hash": response.get("doc_hash") if isinstance(response, dict) else None,
                "chunk_count": len(response.get("chunks", [])) if isinstance(response, dict) else None,
                "response_bytes": len(response_bytes),
            })
        except ParseError as exc:
            response_payload = {
                "status": "failed", "request_id": request_id,
                "error": {"code": exc.code, "message": exc.message},
            }
            completed = _json_response(self, exc.status_code, response_payload, {"X-Request-Id": request_id})
            _log_boundary(self, "doc_chunker.request_failed", {
                "request_id": request_id, "document_id": self.headers.get("X-Document-Id"),
                "stage": "input", "outcome": "failed", "duration_ms": round((time.monotonic() - request_started) * 1000),
                "error_code": exc.code, "error_class": type(exc).__name__, "retryable": False,
                "response_complete": completed,
            })
        except Exception as exc:
            traceback.print_exception(exc, file=sys.stderr)
            code = getattr(exc, "code", "DOC_CHUNKER_FAILED")
            status = getattr(exc, "status_code", HTTPStatus.INTERNAL_SERVER_ERROR)
            message = getattr(exc, "message", "Falha durante o processamento do documento.")
            response_payload = {
                "status": "failed", "request_id": request_id,
                "error": {"code": code, "message": message},
            }
            completed = _json_response(self, status, response_payload, {"X-Request-Id": request_id})
            error_stage = getattr(exc, "stage", "convert")
            failure_kind = {
                "input": "input", "text_layer": "conversion", "convert": "conversion",
                "chunking": "chunking", "serialize": "contract",
            }.get(error_stage, "conversion")
            if code == "DOC_CHUNKER_TIMEOUT":
                failure_kind = "timeout"
            _log_boundary(self, "doc_chunker.request_failed", {
                "request_id": request_id, "document_id": self.headers.get("X-Document-Id"),
                "stage": error_stage, "outcome": "failed", "duration_ms": round((time.monotonic() - request_started) * 1000),
                "error_code": code, "error_class": type(exc).__name__,
                "failure_kind": failure_kind, "retryable": status >= 500, "response_complete": completed,
            })

class DoclingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        server_address: tuple[str, int],
        parser_service: CachedParseService | None = None,
        boundary_logger: BoundaryLogger | None = None,
        max_concurrency: int = 2,
        stream_after_seconds: float = 0.25,
    ) -> None:
        super().__init__(server_address, DoclingRequestHandler)
        self.parser_service = parser_service or CachedParseService()
        self.boundary_logger = boundary_logger or _default_boundary_logger
        self.parser_semaphore = threading.BoundedSemaphore(max(1, max_concurrency))
        self.parser_executor = ThreadPoolExecutor(max_workers=max(1, max_concurrency))
        self.stream_after_seconds = max(0.0, stream_after_seconds)

    def server_close(self) -> None:
        self.parser_executor.shutdown(wait=True, cancel_futures=False)
        super().server_close()


def serve(
    host: str = "127.0.0.1",
    port: int = 8080,
    parser: Any | None = None,
    boundary_logger: BoundaryLogger | None = None,
    max_concurrency: int = 2,
    stream_after_seconds: float = 0.25,
) -> DoclingHTTPServer:
    parser_service = parser if isinstance(parser, CachedParseService) else CachedParseService(parser=parser)
    return DoclingHTTPServer(
        (host, port),
        parser_service=parser_service,
        boundary_logger=boundary_logger,
        max_concurrency=max_concurrency,
        stream_after_seconds=stream_after_seconds,
    )


def serve_in_thread(
    host: str = "127.0.0.1",
    port: int = 8080,
    parser: Any | None = None,
    boundary_logger: BoundaryLogger | None = None,
    max_concurrency: int = 2,
    stream_after_seconds: float = 0.25,
) -> tuple[DoclingHTTPServer, threading.Thread, int]:
    server = serve(
        host=host,
        port=port,
        parser=parser,
        boundary_logger=boundary_logger,
        max_concurrency=max_concurrency,
        stream_after_seconds=stream_after_seconds,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, server.server_address[1]


def _write_chunk(writer: Any, payload: bytes) -> None:
    writer.write(f"{len(payload):X}\r\n".encode("ascii"))
    if payload:
        writer.write(payload)
    writer.write(b"\r\n")
    flush = getattr(writer, "flush", None)
    if callable(flush):
        flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0", help="Interface para escutar")
    parser.add_argument("--port", type=int, default=8080, help="Porta HTTP")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    concurrency = int(os.getenv("DOC_CHUNKER_MAX_CONCURRENCY", "1"))
    server = serve(host=args.host, port=args.port, max_concurrency=concurrency)
    try:
        from doc_chunker import DocChunkerService
        server.chunker_service = DocChunkerService()
        server.chunker_service._initialize()
        server.ready = True
        _default_boundary_logger("doc_chunker.boot_completed", {
            "service": "doc-chunker", "parser_version": "2.122.0",
            "tokenizer_id": getattr(server.chunker_service, "tokenizer_id", "Qwen/Qwen3-Embedding-8B"),
            "max_concurrency": concurrency, "pid": os.getpid(),
        })
        print(f"Docling HTTP server listening on {args.host}:{args.port}", flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
