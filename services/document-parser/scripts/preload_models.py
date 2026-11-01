#!/usr/bin/env python3
"""Initialize the production converter during the image build.

This forces Docling and RapidOCR to fetch their weights while the build has
network access, so PDF conversion does not depend on model downloads at runtime.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

from doc_chunker import DocChunkerService


def main() -> None:
    os.environ["DOCUMENT_PARSER_ENABLE_OCR"] = "true"
    service = DocChunkerService()
    service._initialize()
    with tempfile.TemporaryDirectory() as directory:
        image = Image.new("RGB", (800, 240), "white")
        ImageDraw.Draw(image).text((40, 80), "OCR model preload", fill="black")
        pdf_path = Path(directory) / "preload.pdf"
        image.save(pdf_path, format="PDF", resolution=144)
        service.converter.convert(pdf_path)
    print("Production tokenizer and OCR models initialized.", flush=True)


if __name__ == "__main__":
    main()
