#!/usr/bin/env python3
"""Exercise the production Docling/HybridChunker path on one PDF, without a DB.

Example:
  python scripts/test_knowledge_parser.py document.pdf --output /tmp/knowledge.json \
    --expect-text "Beatriz" --expect-pages 1
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from doc_chunker import DocChunkerService, MAX_TOKENS, TOKENIZER_ID
from docling_http_service import analyze_pdf_text_layer


def run(pdf_path: Path, expect_text: list[str], expect_pages: int | None) -> dict:
    payload = pdf_path.read_bytes()
    if not payload.startswith(b"%PDF-"):
        raise ValueError(f"Arquivo não parece ser PDF: {pdf_path}")
    with tempfile.NamedTemporaryFile(suffix=".pdf") as source:
        source.write(payload)
        source.flush()
        analysis = analyze_pdf_text_layer(Path(source.name))

    # The flag enables OCR when needed; classification is recorded separately
    # so a scanned or mixed input cannot be reported as a native-text success.
    result = DocChunkerService(enable_ocr=True).chunk(
        pdf_path.name, payload, str(uuid4()), sha256(payload).hexdigest(),
    )
    chunks = result["chunks"]
    if result["status"] != "completed" or result["engine"] != "docling" or not chunks:
        raise ValueError("O Docling não retornou chunks válidos.")
    if result["tokenizer_id"] != TOKENIZER_ID:
        raise ValueError(f"Tokenizer diferente do configurado: {result['tokenizer_id']}")
    if expect_pages is not None and result["page_count"] != expect_pages:
        raise ValueError(f"Esperadas {expect_pages} páginas; recebidas {result['page_count']}.")
    covered_pages: set[int] = set()
    for index, chunk in enumerate(chunks):
        if chunk["index"] != index or not chunk["text"].strip() or not chunk["raw_text"].strip():
            raise ValueError(f"Chunk {index} vazio ou fora de ordem.")
        if chunk["tokens"] > MAX_TOKENS:
            raise ValueError(f"Chunk {index} excede {MAX_TOKENS} tokens.")
        if not chunk["pages"] or any(page < 1 or page > result["page_count"] for page in chunk["pages"]):
            raise ValueError(f"Chunk {index} sem página válida.")
        covered_pages.update(chunk["pages"])
    all_text = "\n".join(chunk["text"] for chunk in chunks).casefold()
    missing_text = [text for text in expect_text if text.casefold() not in all_text]
    if missing_text:
        raise ValueError(f"Trechos esperados ausentes: {missing_text}")
    return {
        "input": str(pdf_path.resolve()),
        "text_classification": analysis.classification,
        "native_text_pages": analysis.pages_with_text,
        "ocr_configured": True,
        "ocr_required_by_text_layer": analysis.classification != "TEXT",
        "doc_hash": result["doc_hash"],
        "page_count": result["page_count"],
        "covered_pages": sorted(covered_pages),
        "chunk_count": len(chunks),
        "tokenizer_id": result["tokenizer_id"],
        "max_tokens": MAX_TOKENS,
        "chunks": chunks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audita o parser real da base de conhecimento.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, help="Arquivo JSON com todos os chunks e metadados.")
    parser.add_argument("--expect-text", action="append", default=[], help="Trecho que precisa aparecer nos chunks; pode ser repetido.")
    parser.add_argument("--expect-pages", type=int)
    args = parser.parse_args()
    try:
        report = run(args.pdf, args.expect_text, args.expect_pages)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key != "chunks"}, ensure_ascii=False))
    except (OSError, ValueError, KeyError) as exc:
        print(f"Falha no teste de conhecimento: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
