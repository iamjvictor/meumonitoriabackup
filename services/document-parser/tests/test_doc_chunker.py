"""Contract tests for normalized Docling chunks."""
from __future__ import annotations

import importlib.util
import importlib.util as import_util
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from hashlib import sha256

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "doc_chunker.py"
if str(MODULE_PATH.parent) not in sys.path:
    sys.path.insert(0, str(MODULE_PATH.parent))
SPEC = importlib.util.spec_from_file_location("doc_chunker", MODULE_PATH)
module = None
if SPEC and SPEC.loader:
    module = importlib.util.module_from_spec(SPEC)
    sys.modules[SPEC.name] = module
    try:
        SPEC.loader.exec_module(module)
    except FileNotFoundError:
        module = None


class FakeTokenizer:
    def count_tokens(self, text: str) -> int:
        return len(text.split())


class FakeChunker:
    def __init__(self, chunks):
        self.chunks = chunks

    def chunk(self, _document):
        return self.chunks

    def contextualize(self, chunk):
        return f"{' / '.join(chunk.meta.headings)}\n{chunk.text}".strip()


class DocChunkerTests(unittest.TestCase):
    def test_repairs_common_pdf_spacing_accent_sequences(self):
        self.assertTrue(callable(getattr(module, "normalize_pdf_text", None)))
        self.assertEqual(module.normalize_pdf_text("raz˜ ao e propor¸c˜ao"), "razão e proporção")

    def test_contextualizes_embedding_text_and_preserves_raw_text_and_ordered_pages(self):
        self.assertIsNotNone(module, "doc_chunker module is not implemented")
        chunks = [
            SimpleNamespace(text="Corpo original", meta=SimpleNamespace(headings=["Capítulo 2"], doc_items=[SimpleNamespace(label="text", prov=[SimpleNamespace(page_no=2, bbox=None)])])),
            SimpleNamespace(text="Tabela original", meta=SimpleNamespace(headings=[], doc_items=[SimpleNamespace(label="table", prov=[SimpleNamespace(page_no=1, bbox=None), SimpleNamespace(page_no=2, bbox=None)])])),
        ]
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=SimpleNamespace(pages={1: object(), 2: object()}))),
            tokenizer=FakeTokenizer(),
            chunker=FakeChunker(chunks),
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )
        payload = b"%PDF fixture"
        result = service.chunk("a.pdf", payload, "request-1", sha256(payload).hexdigest())

        self.assertEqual([chunk["index"] for chunk in result["chunks"]], [0, 1])
        self.assertEqual(result["chunks"][0]["text"], "Capítulo 2\nCorpo original")
        self.assertEqual(result["chunks"][0]["raw_text"], "Corpo original")
        self.assertEqual(result["chunks"][0]["tokens"], 4)
        self.assertEqual(result["chunks"][1]["pages"], [1, 2])
        self.assertEqual(result["chunks"][1]["type"], "table")

    def test_preserves_original_and_enriched_formula_evidence_separately(self):
        formula = SimpleNamespace(
            label=SimpleNamespace(value="formula"), self_ref="#/texts/62",
            text=r"2 H_{2}O_{2} \xrightarrow{} O_{2}",
            orig="2 H2O2 (aq) 2 H2O (l) + O2 (g)",
            prov=[SimpleNamespace(page_no=6, bbox=SimpleNamespace(l=10, t=70, r=60, b=60, coord_origin=SimpleNamespace(value="BOTTOMLEFT")))],
        )
        chunk = SimpleNamespace(
            text="$" + formula.text + "$",
            meta=SimpleNamespace(headings=[], doc_items=[formula]),
        )
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=SimpleNamespace(pages={page: object() for page in range(1, 7)}))),
            tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]),
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )
        payload = b"%PDF formula evidence"

        result = service.chunk("a.pdf", payload, "request-formula", sha256(payload).hexdigest())

        self.assertEqual(result["chunks"][0]["formulaEvidence"], [{
            "pageNumber": 6, "itemRef": "#/texts/62", "bbox": [10, 70, 60, 60],
            "originalText": "2 H2O2 (aq) 2 H2O (l) + O2 (g)",
            "enrichedText": r"2 H_{2}O_{2} \xrightarrow{} O_{2}",
        }])

    def test_resolves_formula_doc_item_wrapper_to_canonical_document_item(self):
        formula_ref = "#/texts/62"
        canonical_formula = SimpleNamespace(
            label=SimpleNamespace(value="formula"), self_ref=formula_ref,
            text=r"2 H_{2}O_{2} \\xrightarrow{MnO_2} 2 H_2O + O_2",
            orig="2 H2O2 (aq) 2 H2O (l) + O2 (g) MnO2 (s)",
            prov=[SimpleNamespace(page_no=6, bbox=SimpleNamespace(l=10, t=70, r=60, b=60))],
        )
        doc_item_ref = SimpleNamespace(
            label=SimpleNamespace(value="formula"), self_ref=formula_ref,
            prov=canonical_formula.prov,
        )
        chunk = SimpleNamespace(
            text="Reação química",
            meta=SimpleNamespace(headings=[], doc_items=[doc_item_ref]),
        )
        document = SimpleNamespace(
            pages={page: object() for page in range(1, 7)},
            iterate_items=lambda: [(canonical_formula, 0)],
        )
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=document)),
            tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]),
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )
        payload = b"%PDF canonical formula ref"

        result = service.chunk("a.pdf", payload, "request-formula-ref", sha256(payload).hexdigest())

        evidence = result["chunks"][0]["formulaEvidence"][0]
        self.assertEqual(evidence["originalText"], canonical_formula.orig)
        self.assertEqual(evidence["enrichedText"], canonical_formula.text)
        self.assertTrue(evidence["enrichedText"])

    @unittest.skipUnless(import_util.find_spec("pypdfium2"), "pypdfium2 is required for geometry evidence")
    def test_extracts_q04_inline_exponents_from_pdf_character_geometry(self):
        pdf_path = Path(__file__).resolve().parents[3] / "tests" / "document-parser" / "teacher-materials" / "Quimica-3.pdf"
        evidence_by_page = module._extract_inline_formula_evidence(pdf_path)
        evidence = [item for page_evidence in evidence_by_page.values() for item in page_evidence]

        exponent_10 = next(item for item in evidence if item["baseText"] == "10" and item["raisedText"] == "7")
        exponent_unit = next(item for item in evidence if item["baseText"] == "s" and item["raisedText"] == "−1")
        exponent_liter_unit = next(item for item in evidence if item["baseText"] == "L" and item["raisedText"] == "−1")
        self.assertEqual(exponent_10["normalizedText"], r"10^{7}")
        self.assertEqual(exponent_unit["normalizedText"], r"s^{-1}")
        self.assertEqual(exponent_liter_unit["normalizedText"], r"L^{-1}")
        self.assertEqual(exponent_10["pageNumber"], 6)
        self.assertEqual(exponent_liter_unit["pageNumber"], 6)
        self.assertTrue(exponent_10["bbox"])
        self.assertTrue(exponent_unit["bbox"])
        self.assertTrue(exponent_liter_unit["bbox"])

        text_item = SimpleNamespace(label="text", self_ref="#/texts/inline", prov=[
            SimpleNamespace(page_no=6, bbox=SimpleNamespace(l=90, t=640, r=150, b=610)),
        ])
        chunk = SimpleNamespace(text="4,0 x 10 7 s -1", meta=SimpleNamespace(headings=[], doc_items=[text_item]))
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=SimpleNamespace(
                pages={page: object() for page in range(1, 17)}, iterate_items=lambda: [],
            ))),
            tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]),
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )
        pdf_bytes = pdf_path.read_bytes()
        result = service.chunk("Quimica-3.pdf", pdf_bytes, "request-inline-chunk", sha256(pdf_bytes).hexdigest())
        chunk_evidence = result["chunks"][0]["inlineFormulaEvidence"]
        normalized = {item["normalizedText"] for item in chunk_evidence}
        self.assertIn(r"10^{7}", normalized)
        self.assertIn(r"s^{-1}", normalized)
        self.assertIn(r"L^{-1}", normalized)
        self.assertEqual(result["chunker_version"], "hybrid-v2-formula-evidence-geometry-v2")

    def test_splits_a_chunk_over_the_token_limit_without_losing_text(self):
        self.assertIsNotNone(module, "doc_chunker module is not implemented")
        chunk = SimpleNamespace(text="um dois três quatro", meta=SimpleNamespace(headings=[], doc_items=[]))
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=object())),
            tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]), max_tokens=3,
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )
        payload = b"%PDF fixture"
        result = service.chunk("a.pdf", payload, "request-1", sha256(payload).hexdigest())
        self.assertEqual("".join(part["raw_text"] for part in result["chunks"]), chunk.text)
        self.assertEqual([part["index"] for part in result["chunks"]], [0, 1])
        self.assertTrue(all(part["tokens"] <= 3 for part in result["chunks"]))

    def test_split_repeats_heading_context_without_cutting_source_words(self):
        chunk = SimpleNamespace(text="um dois três quatro cinco", meta=SimpleNamespace(headings=["Capítulo"], doc_items=[]))
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=object())),
            tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]), max_tokens=3,
            text_analyzer=lambda _path: SimpleNamespace(classification="TEXT"),
        )
        payload = b"%PDF fixture"
        result = service.chunk("a.pdf", payload, "request-1", sha256(payload).hexdigest())
        self.assertEqual("".join(part["raw_text"] for part in result["chunks"]), chunk.text)
        self.assertTrue(all(part["text"].startswith("Capítulo\n") for part in result["chunks"]))
        self.assertTrue(all(part["tokens"] <= 3 for part in result["chunks"]))

    def test_requires_ocr_for_mixed_text_and_scanned_pages_when_ocr_is_disabled(self):
        chunk = SimpleNamespace(text="texto nativo", meta=SimpleNamespace(headings=[], doc_items=[]))
        converter = SimpleNamespace(convert=lambda _path: SimpleNamespace(document=SimpleNamespace(pages={1: object()})))
        service = module.DocChunkerService(
            converter=converter, tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]),
            text_analyzer=lambda _path: SimpleNamespace(classification="MIXED"), enable_ocr=False,
        )
        with self.assertRaisesRegex(module.DocChunkerError, "OCR_REQUIRED"):
            service.chunk("a.pdf", b"%PDF fixture", "request-1", sha256(b"%PDF fixture").hexdigest())

    def test_v2_exports_scanned_page_when_docling_has_no_picture_items(self):
        from pypdfium2 import PdfDocument
        source = PdfDocument.new()
        source.new_page(200, 200)
        output = io.BytesIO()
        source.save(output)
        source.close()
        payload = output.getvalue()
        document = SimpleNamespace(pages={1: object()}, iterate_items=lambda: [])
        chunk = SimpleNamespace(text="Texto recuperado por OCR", meta=SimpleNamespace(headings=[], doc_items=[SimpleNamespace(label="text", prov=[SimpleNamespace(page_no=1, bbox=None)])]))
        service = module.DocChunkerService(
            converter=SimpleNamespace(convert=lambda _path: SimpleNamespace(document=document)),
            tokenizer=FakeTokenizer(), chunker=FakeChunker([chunk]),
            text_analyzer=lambda _path: SimpleNamespace(classification="SCANNED"), enable_ocr=True,
        )
        package = service.chunk("a.pdf", payload, "request-1", sha256(payload).hexdigest(), visual_package=True)
        with zipfile.ZipFile(io.BytesIO(package)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(len(manifest["visual_assets"]), 1)
            self.assertEqual(manifest["visual_assets"][0]["source_item_ref"], "#/pages/1")
            self.assertIsNone(manifest["visual_assets"][0]["bbox"])
