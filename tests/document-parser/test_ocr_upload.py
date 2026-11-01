"""Live /chunk regression for the scanned knowledge-base fixture.

Set DOC_CHUNKER_URL to run; without a local parser this test is skipped.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PDF = Path(__file__).with_name("ocrTeste.pdf")
UPLOAD = ROOT / "services/document-parser/scripts/test_pdf_processing.py"


class OcrKnowledgeUploadTest(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("DOC_CHUNKER_URL"), "Defina DOC_CHUNKER_URL para testar o parser HTTP")
    def test_scanned_pdf_activates_ocr_and_returns_citable_chunks(self) -> None:
        native = subprocess.run(
            ["pdftotext", "-layout", str(PDF), "-"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        native_chars = len(native.replace("\f", "").strip())
        self.assertLess(native_chars, 500, "O fixture deixou de ser predominantemente escaneado")

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "ocr-response.json"
            process = subprocess.run(
                [sys.executable, str(UPLOAD), str(PDF), "--base-url", os.environ["DOC_CHUNKER_URL"],
                 "--output", str(output), "--timeout", "600"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(process.returncode, 0, process.stderr or process.stdout)
            result = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(result["page_count"], 4)
        self.assertEqual(result["engine"], "docling")
        self.assertEqual(sorted({page for chunk in result["chunks"] for page in chunk["pages"]}), [1, 2, 3, 4])
        text = "\n".join(chunk["raw_text"] for chunk in result["chunks"])
        self.assertGreater(len(text), native_chars * 3, "O resultado não demonstra recuperação por OCR")
        self.assertIn("pH", text)
        self.assertIn("pOH", text)
        print(json.dumps({"native_chars": native_chars, "ocr_chars": len(text), "chunks": len(result["chunks"])}))


if __name__ == "__main__":
    unittest.main()
