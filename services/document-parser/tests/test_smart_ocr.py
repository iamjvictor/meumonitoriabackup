"""TDD coverage for adaptive OCR selection and in-flight parse deduplication."""

from __future__ import annotations

import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import docling_http_service as service
from run_mineru import get_document_converter


USEFUL_TEXT = "x" * 80


class FakeDocument:
    def export_to_markdown(self) -> str:
        return "# Aula\n"

    def export_to_dict(self) -> dict[str, object]:
        return {"schema_name": "DoclingDocument", "name": "aula"}


class FakeConversion:
    document = FakeDocument()


class FakeConverter:
    def convert(self, _path: Path) -> FakeConversion:
        return FakeConversion()


class BlockingParser:
    def __init__(self) -> None:
        self.calls = 0
        self._calls_lock = threading.Lock()
        self.first_call_started = threading.Event()
        self.duplicate_call_started = threading.Event()
        self.release = threading.Event()

    def parse(self, _filename: str, _payload: bytes) -> dict[str, object]:
        with self._calls_lock:
            self.calls += 1
            if self.calls == 1:
                self.first_call_started.set()
            else:
                self.duplicate_call_started.set()
        if not self.release.wait(timeout=5):
            raise TimeoutError("test did not release parser")
        return {
            "markdown": "# Aula\n",
            "document": {"name": "aula"},
            "layout": {"pages": []},
        }


class SmartOcrTests(unittest.TestCase):
    def test_classifies_text_at_seventy_percent_boundary(self) -> None:
        analysis = service.classify_native_text_pages([USEFUL_TEXT] * 7 + [""] * 3)

        self.assertEqual(analysis.classification, "TEXT")
        self.assertEqual(analysis.page_count, 10)
        self.assertEqual(analysis.pages_with_text, 7)
        self.assertFalse(analysis.ocr_enabled)
        self.assertTrue(analysis.force_backend_text)

    def test_classifies_scanned_below_thirty_percent(self) -> None:
        analysis = service.classify_native_text_pages([USEFUL_TEXT] * 2 + [""] * 8)

        self.assertEqual(analysis.classification, "SCANNED")
        self.assertFalse(analysis.ocr_enabled)
        self.assertTrue(analysis.force_backend_text)

    def test_classifies_mixed_at_intermediate_ratio(self) -> None:
        analysis = service.classify_native_text_pages([USEFUL_TEXT] * 3 + [""] * 7)

        self.assertEqual(analysis.classification, "MIXED")
        self.assertFalse(analysis.ocr_enabled)
        self.assertTrue(analysis.force_backend_text)

    def test_empty_or_invalid_preflight_falls_back_to_scanned(self) -> None:
        empty = service.classify_native_text_pages([])
        invalid = service.analyze_pdf_text_layer(
            Path("invalid.pdf"),
            pdf_document_factory=lambda _path: (_ for _ in ()).throw(ValueError("invalid PDF")),
        )

        self.assertEqual(empty.classification, "SCANNED")
        self.assertEqual(invalid.classification, "SCANNED")
        self.assertEqual(invalid.page_count, 0)
        self.assertFalse(invalid.ocr_enabled)
        self.assertTrue(invalid.force_backend_text)

    def test_normalizes_page_text_before_applying_eighty_character_threshold(self) -> None:
        useful = service.classify_native_text_pages(["  " + "x " * 40])
        short = service.classify_native_text_pages(["x" * 79])

        self.assertEqual(useful.native_text_chars, 79)
        self.assertEqual(useful.pages_with_text, 0)
        self.assertEqual(short.pages_with_text, 0)

        exact = service.classify_native_text_pages(["x" * 80])
        self.assertEqual(exact.pages_with_text, 1)
        self.assertEqual(exact.classification, "TEXT")

    def test_docling_factory_applies_text_pipeline_options(self) -> None:
        from docling.datamodel.base_models import InputFormat

        converter = get_document_converter(do_ocr=False, force_backend_text=True)
        options = converter.format_to_options[InputFormat.PDF].pipeline_options

        self.assertFalse(options.do_ocr)
        self.assertTrue(options.force_backend_text)
        self.assertEqual(converter.initialized_pipelines, {})

    def test_docling_factory_disables_ocr_by_default(self) -> None:
        from docling.datamodel.base_models import InputFormat

        converter = get_document_converter()
        options = converter.format_to_options[InputFormat.PDF].pipeline_options

        self.assertFalse(options.do_ocr)
        self.assertTrue(options.force_backend_text)

    def test_preflight_runs_before_converter_and_emits_analysis_metadata(self) -> None:
        order: list[str] = []
        converter_options: list[tuple[bool, bool]] = []
        logs: list[tuple[str, dict[str, object]]] = []

        def analyze(_path: Path) -> service.TextLayerAnalysis:
            order.append("preflight")
            return service.classify_native_text_pages([USEFUL_TEXT])

        def converter_factory(*, do_ocr: bool, force_backend_text: bool) -> FakeConverter:
            order.append("converter")
            converter_options.append((do_ocr, force_backend_text))
            return FakeConverter()

        parser = service.RealDoclingParser(
            converter_factory=converter_factory,
            text_analyzer=analyze,
            boundary_logger=lambda event, payload: logs.append((event, payload)),
        )

        result = parser.parse("aula.pdf", b"%PDF-1.4\nfixture\n")

        self.assertEqual(order, ["preflight", "converter"])
        self.assertEqual(converter_options, [(False, True)])
        self.assertEqual(result["textAnalysis"], {
            "classification": "TEXT",
            "pageCount": 1,
            "pagesWithText": 1,
            "nativeTextChars": 80,
            "ocrEnabled": False,
            "forceBackendText": True,
        })
        analysis_logs = [payload for event, payload in logs if event == "docling_parser.text_layer_analyzed"]
        self.assertEqual(analysis_logs, [{
            "classification": "TEXT",
            "page_count": 1,
            "pages_with_text": 1,
            "native_text_chars": 80,
            "ocr_enabled": False,
            "force_backend_text": True,
        }])

    def test_scanned_and_mixed_remain_analyzed_but_ocr_stays_disabled_by_default(self) -> None:
        for page_texts, expected_classification in (
            (["", ""], "SCANNED"),
            ([USEFUL_TEXT, ""], "MIXED"),
        ):
            with self.subTest(classification=expected_classification):
                options: list[tuple[bool, bool]] = []
                parser = service.RealDoclingParser(
                    converter_factory=lambda *, do_ocr, force_backend_text: (
                        options.append((do_ocr, force_backend_text)) or FakeConverter()
                    ),
                    text_analyzer=lambda _path, texts=page_texts: service.classify_native_text_pages(texts),
                    boundary_logger=lambda _event, _payload: None,
                )

                result = parser.parse("aula.pdf", b"%PDF-1.4\nfixture\n")

                self.assertEqual(result["textAnalysis"]["classification"], expected_classification)
                self.assertEqual(options, [(False, True)])

    def test_enable_ocr_explicitly_restores_adaptive_scanned_mode(self) -> None:
        options: list[tuple[bool, bool]] = []
        parser = service.RealDoclingParser(
            converter_factory=lambda *, do_ocr, force_backend_text: (
                options.append((do_ocr, force_backend_text)) or FakeConverter()
            ),
            text_analyzer=lambda _path: service.classify_native_text_pages(["", ""]),
            enable_ocr=True,
            boundary_logger=lambda _event, _payload: None,
        )

        result = parser.parse("aula.pdf", b"%PDF-1.4\nfixture\n")

        self.assertEqual(result["textAnalysis"]["classification"], "SCANNED")
        self.assertTrue(result["textAnalysis"]["ocrEnabled"])
        self.assertFalse(result["textAnalysis"]["forceBackendText"])
        self.assertEqual(options, [(True, False)])

    def test_concurrent_requests_for_same_sha_share_in_flight_conversion(self) -> None:
        parser = BlockingParser()
        cached = service.CachedParseService(parser=parser)
        start = threading.Barrier(3)

        def request() -> dict[str, object]:
            start.wait(timeout=5)
            return cached.parse("aula.pdf", b"same-pdf")

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(request)
            second = executor.submit(request)
            start.wait(timeout=5)
            self.assertTrue(parser.first_call_started.wait(timeout=2))
            self.assertFalse(parser.duplicate_call_started.wait(timeout=0.25))
            parser.release.set()
            first_result = first.result(timeout=5)
            second_result = second.result(timeout=5)

        self.assertEqual(parser.calls, 1)
        self.assertIs(first_result, second_result)


if __name__ == "__main__":
    unittest.main()
