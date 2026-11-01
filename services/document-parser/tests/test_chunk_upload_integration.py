"""Upload a repository PDF through the HTTP boundary and inspect chunk output.

The default cases isolate Docling model loading while exercising the real
multipart endpoint, file bytes, hash validation, response schema and failures.
Set RUN_REAL_DOCLING_UPLOAD=1 to run the same PDF through real Docling and
HybridChunker in an environment with the pinned tokenizer and models cached.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from hashlib import sha256
from http.client import HTTPConnection
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[3]
PDF_PATH = PROJECT_ROOT / "test/mineru-spike/razao-proporcao-sample-pages.pdf"
SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))


def load_module(name: str, file_name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / file_name)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


http_service = load_module("docling_http_service", "docling_http_service.py")
doc_chunker = load_module("doc_chunker", "doc_chunker.py")


class CountingTokenizer:
    def count_tokens(self, text: str) -> int:
        return len(text.split())


class SampleConverter:
    """Check that the uploaded PDF reaches the conversion boundary intact."""

    def __init__(self, expected_bytes: bytes, error: Exception | None = None):
        self.expected_bytes = expected_bytes
        self.error = error
        self.calls = 0

    def convert(self, path: Path):
        self.calls += 1
        assert path.read_bytes() == self.expected_bytes
        if self.error:
            raise self.error
        return SimpleNamespace(document=SimpleNamespace(pages={1: object(), 2: object()}))


class SampleChunker:
    def chunk(self, _document):
        item = SimpleNamespace(
            label="text",
            self_ref="#/texts/0",
            prov=[SimpleNamespace(
                page_no=2,
                bbox=SimpleNamespace(l=10, t=20, r=300, b=80, coord_origin=SimpleNamespace(value="BOTTOMLEFT")),
            )],
        )
        return [SimpleNamespace(
            text="A razão entre as idades de Beatriz e Fernanda é 2 para 3.",
            meta=SimpleNamespace(headings=["Razão e proporção"], doc_items=[item]),
        )]

    def contextualize(self, chunk):
        return "\n".join([*chunk.meta.headings, chunk.text])


class ChunkUploadIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pdf_bytes = PDF_PATH.read_bytes()
        assert cls.pdf_bytes.startswith(b"%PDF-")
        cls.pdf_hash = sha256(cls.pdf_bytes).hexdigest()

    def setUp(self):
        self.converter = SampleConverter(self.pdf_bytes)
        self.server, self.thread, self.port = http_service.serve_in_thread(host="127.0.0.1", port=0)
        self.server.chunker_service = doc_chunker.DocChunkerService(
            converter=self.converter,
            tokenizer=CountingTokenizer(),
            chunker=SampleChunker(),
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def upload(self, expected_hash: str | None = None, timeout: int = 30):
        boundary = "----doc-chunker-upload-test"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="razao-proporcao.pdf"\r\n'
            "Content-Type: application/pdf\r\n\r\n"
        ).encode() + self.pdf_bytes + f"\r\n--{boundary}--\r\n".encode()
        request_id = str(uuid4())
        connection = HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        try:
            connection.request("POST", "/chunk", body=body, headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(len(body)),
                "X-Document-Id": str(uuid4()),
                "X-Request-Id": request_id,
                "X-Expected-SHA256": expected_hash or self.pdf_hash,
            })
            response = connection.getresponse()
            payload = json.loads(response.read())
            return response.status, dict(response.getheaders()), payload, request_id
        finally:
            connection.close()

    def test_upload_real_pdf_returns_contextualized_chunks_and_provenance(self):
        status, headers, payload, request_id = self.upload()

        self.assertEqual(status, 200)
        self.assertEqual(headers["X-Request-Id"], request_id)
        self.assertEqual(payload["schema_version"], "doc-chunker/v1")
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["request_id"], request_id)
        self.assertEqual(payload["doc_hash"], self.pdf_hash)
        self.assertEqual(payload["engine"], "docling")
        self.assertEqual(payload["page_count"], 2)
        self.assertEqual(self.converter.calls, 1)
        self.assertEqual(len(payload["chunks"]), 1)
        chunk = payload["chunks"][0]
        self.assertEqual(chunk["index"], 0)
        self.assertEqual(chunk["raw_text"], "A razão entre as idades de Beatriz e Fernanda é 2 para 3.")
        self.assertEqual(chunk["text"], "Razão e proporção\n" + chunk["raw_text"])
        self.assertEqual(chunk["headings"], ["Razão e proporção"])
        self.assertEqual(chunk["pages"], [2])
        self.assertEqual(chunk["tokens"], len(chunk["text"].split()))
        self.assertEqual(chunk["provenance"], [{
            "page": 2, "item_ref": "#/texts/0", "bbox": [10, 20, 300, 80], "coord_origin": "BOTTOMLEFT",
        }])
        print("UPLOAD_SAMPLE=" + json.dumps({
            "status": status,
            "doc_hash": payload["doc_hash"],
            "engine": payload["engine"],
            "chunk_count": len(payload["chunks"]),
            "first_chunk": chunk,
        }, ensure_ascii=False))

    def test_upload_rejects_wrong_hash_before_conversion(self):
        status, _, payload, _ = self.upload("0" * 64)
        self.assertEqual(status, 400)
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["error"]["code"], "DOC_HASH_MISMATCH")
        self.assertEqual(self.converter.calls, 0)

    def test_conversion_failure_returns_error_json_instead_of_false_200(self):
        self.converter.error = RuntimeError("conversion fixture failed")
        status, _, payload, _ = self.upload()
        self.assertIn(status, {500, 503})
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["error"]["code"], "DOCLING_CONVERSION_FAILED")
        self.assertEqual(self.converter.calls, 1)

    def test_pdf_smoke_script_uploads_file_and_saves_validated_chunks(self):
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "chunks.json"
            result = subprocess.run([
                sys.executable, str(SCRIPT_DIR / "test_pdf_processing.py"),
                str(PDF_PATH), "--base-url", f"http://127.0.0.1:{self.port}",
                "--output", str(output_path),
            ], capture_output=True, text=True, timeout=30, check=False)

            self.assertEqual(result.returncode, 0, result.stderr)
            saved = json.loads(output_path.read_text(encoding="utf-8"))
            summary = json.loads(result.stdout)
            self.assertEqual(saved["doc_hash"], self.pdf_hash)
            self.assertEqual(saved["chunks"][0]["pages"], [2])
            self.assertEqual(summary["chunk_count"], 1)
            self.assertEqual(summary["doc_hash"], self.pdf_hash)

    def test_pdf_smoke_script_returns_error_when_conversion_fails(self):
        self.converter.error = RuntimeError("conversion fixture failed")
        result = subprocess.run([
            sys.executable, str(SCRIPT_DIR / "test_pdf_processing.py"),
            str(PDF_PATH), "--base-url", f"http://127.0.0.1:{self.port}",
        ], capture_output=True, text=True, timeout=30, check=False)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DOCLING_CONVERSION_FAILED", result.stderr)


class RealDoclingLocalTokenizerUploadTest(unittest.TestCase):
    """Exercise real Docling and HybridChunker without a Qwen download."""

    upload = ChunkUploadIntegrationTests.upload
    tearDown = ChunkUploadIntegrationTests.tearDown

    @classmethod
    def setUpClass(cls):
        import pypdfium2

        source = pypdfium2.PdfDocument(str(PDF_PATH))
        first_page = pypdfium2.PdfDocument.new()
        try:
            first_page.import_pages(source, [0])
            output = io.BytesIO()
            first_page.save(output)
            cls.pdf_bytes = output.getvalue()
        finally:
            first_page.close()
            source.close()
        cls.pdf_hash = sha256(cls.pdf_bytes).hexdigest()

    def setUp(self):
        from docling.chunking import HybridChunker
        from docling_core.transforms.chunker.tokenizer.base import BaseTokenizer
        from run_mineru import get_document_converter

        class WhitespaceTokenizer(BaseTokenizer):
            def count_tokens(self, text: str) -> int:
                return len(text.split())

            def get_max_tokens(self) -> int:
                return 2000

            def get_tokenizer(self):
                return None

        tokenizer = WhitespaceTokenizer()
        self.server, self.thread, self.port = http_service.serve_in_thread(host="127.0.0.1", port=0)
        self.server.chunker_service = doc_chunker.DocChunkerService(
            converter=get_document_converter(do_ocr=False, force_backend_text=True),
            tokenizer=tokenizer,
            chunker=HybridChunker(tokenizer=tokenizer, merge_peers=True),
            max_tokens=2000,
            text_analyzer=http_service.analyze_pdf_text_layer,
            enable_ocr=False,
        )

    def test_pdf_with_text_layer_without_ocr_returns_source_text_with_page(self):
        status, _, payload, _ = self.upload()
        self.assertEqual(status, 200, payload.get("error"))
        self.assertEqual(payload["doc_hash"], self.pdf_hash)
        self.assertEqual(payload["page_count"], 1)
        self.assertGreater(len(payload["chunks"]), 0)
        text = "\n".join(chunk["text"] for chunk in payload["chunks"])
        self.assertIn("Beatriz", text)
        self.assertIn("Fernanda", text)
        self.assertTrue(all(chunk["pages"] == [1] for chunk in payload["chunks"]))
        print("REAL_DOCLING_LOCAL_SAMPLE=" + json.dumps({
            "status": status,
            "page_count": payload["page_count"],
            "chunk_count": len(payload["chunks"]),
            "first_chunk": {
                "pages": payload["chunks"][0]["pages"],
                "headings": payload["chunks"][0]["headings"],
                "tokens": payload["chunks"][0]["tokens"],
                "text_preview": payload["chunks"][0]["text"][:240],
            },
        }, ensure_ascii=False))
        self.assertIn("razão", text.casefold(), "O texto convertido perdeu o acento da palavra 'razão'.")

    def test_pdf_with_text_layer_still_returns_chunks_when_ocr_is_enabled(self):
        from run_mineru import get_document_converter

        self.server.chunker_service.converter = get_document_converter(do_ocr=True, force_backend_text=False)
        self.server.chunker_service.enable_ocr = True
        status, _, payload, _ = self.upload(timeout=120)

        self.assertEqual(status, 200, payload.get("error"))
        self.assertEqual(payload["page_count"], 1)
        self.assertGreater(len(payload["chunks"]), 0)
        text = "\n".join(chunk["text"] for chunk in payload["chunks"])
        self.assertIn("Beatriz", text)
        self.assertTrue(all(chunk["pages"] == [1] for chunk in payload["chunks"]))


class RealDoclingOcrUploadTest(unittest.TestCase):
    """An image-only PDF must produce searchable chunks with OCR enabled."""

    upload = ChunkUploadIntegrationTests.upload
    tearDown = ChunkUploadIntegrationTests.tearDown

    @classmethod
    def setUpClass(cls):
        import pypdfium2

        source = pypdfium2.PdfDocument(str(PDF_PATH))
        try:
            page = source[0]
            try:
                image = page.render(scale=2).to_pil().convert("RGB")
            finally:
                page.close()
            output = io.BytesIO()
            image.save(output, format="PDF", resolution=144)
            cls.pdf_bytes = output.getvalue()
        finally:
            source.close()
        cls.pdf_hash = sha256(cls.pdf_bytes).hexdigest()

    def setUp(self):
        from docling.chunking import HybridChunker
        from docling_core.transforms.chunker.tokenizer.base import BaseTokenizer
        from run_mineru import get_document_converter

        class WhitespaceTokenizer(BaseTokenizer):
            def count_tokens(self, text: str) -> int:
                return len(text.split())

            def get_max_tokens(self) -> int:
                return 2000

            def get_tokenizer(self):
                return None

        tokenizer = WhitespaceTokenizer()
        self.server, self.thread, self.port = http_service.serve_in_thread(host="127.0.0.1", port=0)
        with patch.dict(os.environ, {"DOCUMENT_PARSER_ENABLE_OCR": "true"}):
            self.server.chunker_service = doc_chunker.DocChunkerService(
                converter=get_document_converter(do_ocr=True, force_backend_text=False),
                tokenizer=tokenizer,
                chunker=HybridChunker(tokenizer=tokenizer, merge_peers=True),
                max_tokens=2000,
                text_analyzer=http_service.analyze_pdf_text_layer,
            )

    def test_scanned_pdf_with_ocr_returns_searchable_chunks_and_page(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf") as fixture:
            fixture.write(self.pdf_bytes)
            fixture.flush()
            analysis = http_service.analyze_pdf_text_layer(Path(fixture.name))
        self.assertEqual(analysis.classification, "SCANNED")
        self.assertEqual(analysis.native_text_chars, 0)

        status, _, payload, _ = self.upload(timeout=120)
        self.assertEqual(status, 200, payload.get("error"))
        self.assertEqual(payload["doc_hash"], self.pdf_hash)
        self.assertEqual(payload["page_count"], 1)
        self.assertGreater(len(payload["chunks"]), 0)
        text = "\n".join(chunk["text"] for chunk in payload["chunks"])
        self.assertIn("Beatriz", text)
        self.assertTrue(all(chunk["pages"] == [1] for chunk in payload["chunks"]))
        print("REAL_DOCLING_OCR_SAMPLE=" + json.dumps({
            "status": status, "page_count": payload["page_count"],
            "chunk_count": len(payload["chunks"]), "text_preview": text[:240],
        }, ensure_ascii=False))

    def test_scanned_pdf_without_ocr_returns_explicit_error(self):
        self.server.chunker_service.enable_ocr = False
        status, _, payload, _ = self.upload()
        self.assertEqual(status, 422)
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["error"]["code"], "OCR_REQUIRED")


@unittest.skipUnless(
    os.getenv("RUN_PRODUCTION_DOC_CHUNKER_TESTS") == "1",
    "Run inside the parser Docker image with the pinned Qwen tokenizer",
)
class ProductionDocChunkerUploadTest(unittest.TestCase):
    """Exercise /chunk with the production converter, OCR and Qwen tokenizer."""

    upload = ChunkUploadIntegrationTests.upload
    tearDown = ChunkUploadIntegrationTests.tearDown

    @classmethod
    def setUpClass(cls):
        import pypdfium2

        source = pypdfium2.PdfDocument(str(PDF_PATH))
        first_page = pypdfium2.PdfDocument.new()
        try:
            first_page.import_pages(source, [0])
            digital = io.BytesIO()
            first_page.save(digital)
            cls.digital_bytes = digital.getvalue()
            page = source[0]
            try:
                image = page.render(scale=2).to_pil().convert("RGB")
            finally:
                page.close()
            scanned = io.BytesIO()
            image.save(scanned, format="PDF", resolution=144)
            cls.scanned_bytes = scanned.getvalue()
        finally:
            first_page.close()
            source.close()

    def setUp(self):
        with patch.dict(os.environ, {"DOCUMENT_PARSER_ENABLE_OCR": "true"}):
            chunker_service = doc_chunker.DocChunkerService()
        self.server, self.thread, self.port = http_service.serve_in_thread(host="127.0.0.1", port=0)
        self.server.chunker_service = chunker_service

    def assert_production_chunks(self, pdf_bytes: bytes):
        self.pdf_bytes = pdf_bytes
        self.pdf_hash = sha256(pdf_bytes).hexdigest()
        status, _, payload, _ = self.upload(timeout=120)
        self.assertEqual(status, 200, payload.get("error"))
        self.assertEqual(payload["doc_hash"], self.pdf_hash)
        self.assertEqual(payload["tokenizer_id"], doc_chunker.TOKENIZER_ID)
        self.assertEqual(payload["chunker_version"], doc_chunker.CHUNKER_VERSION)
        self.assertEqual(payload["page_count"], 1)
        self.assertGreater(len(payload["chunks"]), 0)
        text = "\n".join(chunk["text"] for chunk in payload["chunks"])
        self.assertIn("Beatriz", text)
        for index, chunk in enumerate(payload["chunks"]):
            self.assertEqual(chunk["index"], index)
            self.assertGreater(chunk["tokens"], 0)
            self.assertLessEqual(chunk["tokens"], 500)
            self.assertTrue(chunk["raw_text"].strip())
            self.assertEqual(chunk["pages"], [1])
        return payload

    def test_native_pdf_with_production_chunker(self):
        self.assert_production_chunks(self.digital_bytes)

    def test_scanned_pdf_with_production_ocr_and_chunker(self):
        payload = self.assert_production_chunks(self.scanned_bytes)
        print("PRODUCTION_OCR_SAMPLE=" + json.dumps({
            "chunk_count": len(payload["chunks"]),
            "tokens": payload["chunks"][0]["tokens"],
            "text_preview": payload["chunks"][0]["text"][:240],
        }, ensure_ascii=False))


@unittest.skipUnless(os.getenv("RUN_REAL_DOCLING_UPLOAD") == "1", "Set RUN_REAL_DOCLING_UPLOAD=1 with a cached tokenizer and models")
class RealDoclingUploadSmokeTest(ChunkUploadIntegrationTests):
    def setUp(self):
        self.server, self.thread, self.port = http_service.serve_in_thread(host="127.0.0.1", port=0)
        self.server.chunker_service = doc_chunker.DocChunkerService()

    def test_upload_real_pdf_returns_contextualized_chunks_and_provenance(self):
        status, _, payload, _ = self.upload()
        self.assertEqual(status, 200, payload.get("error"))
        self.assertEqual(payload["doc_hash"], self.pdf_hash)
        self.assertGreater(payload["page_count"], 0)
        self.assertGreater(len(payload["chunks"]), 0)
        for index, chunk in enumerate(payload["chunks"]):
            self.assertEqual(chunk["index"], index)
            self.assertGreater(chunk["tokens"], 0)
            self.assertLessEqual(chunk["tokens"], 500)
            self.assertTrue(chunk["text"].strip())
            self.assertTrue(chunk["raw_text"].strip())
            self.assertTrue(all(1 <= page <= payload["page_count"] for page in chunk["pages"]))
        print("REAL_DOCLING_UPLOAD_SUMMARY=" + json.dumps({
            "status": status,
            "page_count": payload["page_count"],
            "chunk_count": len(payload["chunks"]),
            "first_chunks": [{
                "index": chunk["index"], "pages": chunk["pages"], "tokens": chunk["tokens"],
                "text_preview": chunk["text"][:160],
            } for chunk in payload["chunks"][:2]],
        }, ensure_ascii=False))

    @unittest.skip("Only the real conversion smoke case applies to this subclass")
    def test_upload_rejects_wrong_hash_before_conversion(self):
        pass

    @unittest.skip("Only the real conversion smoke case applies to this subclass")
    def test_conversion_failure_returns_error_json_instead_of_false_200(self):
        pass

    @unittest.skip("The CLI contract is covered by ChunkUploadIntegrationTests")
    def test_pdf_smoke_script_uploads_file_and_saves_validated_chunks(self):
        pass

    @unittest.skip("The CLI failure contract is covered by ChunkUploadIntegrationTests")
    def test_pdf_smoke_script_returns_error_when_conversion_fails(self):
        pass


if __name__ == "__main__":
    unittest.main()
