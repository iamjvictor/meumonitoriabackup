#!/usr/bin/env python3
"""Upload a PDF to /chunk and inspect the actual Docling response.

Example:
  python scripts/test_pdf_processing.py document.pdf \
    --base-url http://127.0.0.1:8080 --output /tmp/document-chunks.json
"""

from __future__ import annotations

import argparse
import json
import sys
from hashlib import sha256
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


MAX_RESPONSE_BYTES = 20 * 1024 * 1024


def multipart_pdf(pdf_bytes: bytes, filename: str, boundary: str) -> bytes:
    prefix = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8")
    return prefix + pdf_bytes + f"\r\n--{boundary}--\r\n".encode("ascii")


def validate_response(value: object, expected_hash: str, request_id: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError("Resposta do /chunk não é um objeto JSON.")
    if value.get("schema_version") != "doc-chunker/v1" or value.get("status") != "completed":
        raise ValueError("Resposta do /chunk não corresponde ao contrato doc-chunker/v1.")
    if value.get("request_id") != request_id or value.get("doc_hash") != expected_hash:
        raise ValueError("Request ID ou SHA-256 da resposta não corresponde ao PDF enviado.")
    if value.get("engine") != "docling" or not isinstance(value.get("chunks"), list):
        raise ValueError("Resposta não contém chunks Docling.")
    if not value["chunks"]:
        raise ValueError("Docling concluiu sem gerar chunks.")
    for index, chunk in enumerate(value["chunks"]):
        if not isinstance(chunk, dict) or chunk.get("index") != index:
            raise ValueError(f"Chunk {index} inválido ou fora de ordem.")
        if not isinstance(chunk.get("text"), str) or not chunk["text"].strip():
            raise ValueError(f"Chunk {index} sem texto contextualizado.")
        if not isinstance(chunk.get("pages"), list) or not chunk["pages"]:
            raise ValueError(f"Chunk {index} sem página de origem.")
    return value


def run(pdf_path: Path, base_url: str, output_path: Path | None, timeout: float) -> dict:
    pdf_bytes = pdf_path.read_bytes()
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError(f"Arquivo não parece ser PDF: {pdf_path}")
    pdf_hash = sha256(pdf_bytes).hexdigest()
    request_id = str(uuid4())
    boundary = f"doc-chunker-smoke-{uuid4().hex}"
    body = multipart_pdf(pdf_bytes, pdf_path.name, boundary)
    request = Request(
        f"{base_url.rstrip('/')}/chunk",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "X-Document-Id": str(uuid4()),
            "X-Request-Id": request_id,
            "X-Expected-SHA256": pdf_hash,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_bytes = response.read(MAX_RESPONSE_BYTES + 1)
            response_request_id = response.headers.get("X-Request-Id")
    except HTTPError as exc:
        try:
            error = json.loads(exc.read(MAX_RESPONSE_BYTES + 1))
            details = error.get("error", {})
            raise ValueError(f"HTTP {exc.code}: {details.get('code', 'UNKNOWN')}: {details.get('message', '')}") from exc
        except (json.JSONDecodeError, AttributeError):
            raise ValueError(f"HTTP {exc.code}: resposta de erro não é JSON válido.") from exc
    except URLError as exc:
        raise ValueError(f"Não foi possível conectar ao /chunk: {exc.reason}") from exc
    if len(response_bytes) > MAX_RESPONSE_BYTES:
        raise ValueError("Resposta do /chunk excede 20 MiB.")
    if response_request_id != request_id:
        raise ValueError("X-Request-Id da resposta não corresponde à requisição.")
    try:
        value = json.loads(response_bytes)
    except json.JSONDecodeError as exc:
        raise ValueError("Resposta HTTP 200 do /chunk não é JSON válido.") from exc
    result = validate_response(value, pdf_hash, request_id)
    if output_path is not None:
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    first_chunk = result["chunks"][0]
    return {
        "doc_hash": pdf_hash,
        "engine": result["engine"],
        "page_count": result.get("page_count"),
        "chunk_count": len(result["chunks"]),
        "first_chunk": {
            "pages": first_chunk["pages"],
            "headings": first_chunk.get("headings", []),
            "tokens": first_chunk.get("tokens"),
            "text_preview": first_chunk["text"][:240],
        },
        "output": str(output_path) if output_path else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Envia um PDF ao Doc-chunker e valida o resultado.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--output", type=Path, help="Salva a resposta JSON completa neste arquivo.")
    parser.add_argument("--timeout", type=float, default=600, help="Timeout em segundos, incluindo leitura do corpo.")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.pdf, args.base_url, args.output, args.timeout), ensure_ascii=False))
    except (OSError, ValueError) as exc:
        print(f"Falha no teste do PDF: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
