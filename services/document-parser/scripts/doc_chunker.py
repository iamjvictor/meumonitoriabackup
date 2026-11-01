"""Create bounded, provenance-aware chunks from uploaded PDFs."""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

PARSER_VERSION = "2.122.0"
TOKENIZER_REVISION = "c90816d848505624c2434128dfc61132162a0ee9"
TOKENIZER_ID = f"Qwen/Qwen3-Embedding-8B@{TOKENIZER_REVISION}"
CHUNKER_VERSION = "hybrid-v1"
MAX_TOKENS = 500
_PDF_ACCENTS = {
    "˜a": "ã", "˜A": "Ã", "˜o": "õ", "˜O": "Õ",
    "´a": "á", "´A": "Á", "´e": "é", "´E": "É", "´i": "í", "´I": "Í",
    "´o": "ó", "´O": "Ó", "´u": "ú", "´U": "Ú",
    "ˆa": "â", "ˆA": "Â", "ˆe": "ê", "ˆE": "Ê", "ˆo": "ô", "ˆO": "Ô",
    "¸c": "ç", "¸C": "Ç",
}


def normalize_pdf_text(text: str) -> str:
    """Repair common spacing accent glyphs produced by broken PDF ToUnicode maps."""
    return re.sub(
        r"([˜´ˆ¸])\s*([acdeinorstuACDEINORSTU])",
        lambda match: _PDF_ACCENTS.get(match.group(1) + match.group(2), match.group(0)),
        text,
    )


class DocChunkerError(ValueError):
    def __init__(self, code: str, message: str, status_code: int = 422, stage: str = "input"):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.status_code = status_code
        self.stage = stage


class DocChunkerService:
    def __init__(
        self,
        converter: Any | None = None,
        tokenizer: Any | None = None,
        chunker: Any | None = None,
        max_tokens: int = MAX_TOKENS,
        text_analyzer: Any | None = None,
        enable_ocr: bool | None = None,
    ) -> None:
        self.converter = converter
        self.tokenizer = tokenizer
        self.chunker = chunker
        self.max_tokens = max_tokens
        self.text_analyzer = text_analyzer
        self.enable_ocr = enable_ocr if enable_ocr is not None else os.getenv("DOCUMENT_PARSER_ENABLE_OCR", "false").lower() == "true"

    def _initialize(self) -> None:
        if self.converter is None:
            from run_mineru import get_document_converter
            self.converter = get_document_converter(do_ocr=self.enable_ocr, force_backend_text=not self.enable_ocr)
        if self.tokenizer is None or self.chunker is None:
            from transformers import AutoTokenizer
            from huggingface_hub import try_to_load_from_cache
            from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
            from docling.chunking import HybridChunker
            model_id = TOKENIZER_ID.split("@", maxsplit=1)[0]
            cached_tokenizer = try_to_load_from_cache(
                model_id, "tokenizer.json", revision=TOKENIZER_REVISION,
            )
            tokenizer_source = str(Path(cached_tokenizer).parent) if isinstance(cached_tokenizer, str) else model_id
            tokenizer_model = AutoTokenizer.from_pretrained(
                tokenizer_source, revision=TOKENIZER_REVISION,
                local_files_only=tokenizer_source != model_id,
            )
            self.tokenizer = HuggingFaceTokenizer(tokenizer=tokenizer_model, max_tokens=self.max_tokens)
            self.chunker = HybridChunker(tokenizer=self.tokenizer, merge_peers=True)
        self.tokenizer_id = TOKENIZER_ID

    def chunk(
        self, file_name: str, payload: bytes, request_id: str, expected_sha256: str,
        *, visual_package: bool = False,
    ) -> dict[str, object] | bytes:
        overall_started = time.monotonic()
        _emit("doc_chunker.input_validation.started", request_id=request_id, outcome="started", payload_bytes=len(payload))
        actual_hash = hashlib.sha256(payload).hexdigest()
        if actual_hash != expected_sha256:
            _emit("doc_chunker.input_validation.failed", request_id=request_id, outcome="failed", error_code="DOC_HASH_MISMATCH", duration_ms=round((time.monotonic() - overall_started) * 1000))
            raise DocChunkerError("DOC_HASH_MISMATCH", "O hash do arquivo recebido não corresponde ao esperado.", 400, "input")
        if not payload:
            raise DocChunkerError("INVALID_INPUT", "O arquivo enviado está vazio.", 400, "input")
        if not file_name.lower().endswith(".pdf"):
            raise DocChunkerError("INVALID_INPUT", "O arquivo enviado precisa ser PDF.", 400, "input")
        self._initialize()
        _emit("doc_chunker.input_validation.completed", request_id=request_id, outcome="completed", duration_ms=round((time.monotonic() - overall_started) * 1000), payload_bytes=len(payload), doc_hash=actual_hash)
        if self.text_analyzer is None:
            from docling_http_service import analyze_pdf_text_layer
            analysis = analyze_pdf_text_layer
        else:
            analysis = self.text_analyzer
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "upload.pdf"
            pdf_path.write_bytes(payload)
            _emit("doc_chunker.text_layer.started", request_id=request_id, outcome="started")
            analysis_result = analysis(pdf_path)
            classification = getattr(analysis_result, "classification", "TEXT")
            _emit("doc_chunker.text_layer.completed", request_id=request_id, outcome="completed", classification=classification, page_count=getattr(analysis_result, "page_count", None))
            if classification in {"SCANNED", "MIXED"} and not self.enable_ocr:
                _emit("doc_chunker.text_layer.failed", request_id=request_id, outcome="failed", error_code="OCR_REQUIRED", classification=classification)
                raise DocChunkerError("OCR_REQUIRED", "O PDF não possui camada de texto suficiente e OCR está desativado.", stage="text_layer")
            conversion_started = time.monotonic()
            _emit("doc_chunker.conversion.started", request_id=request_id, outcome="started", parser_version=PARSER_VERSION)
            try:
                document = self.converter.convert(pdf_path).document
            except Exception as exc:
                _emit("doc_chunker.conversion.failed", request_id=request_id, outcome="failed", error_code="DOCLING_CONVERSION_FAILED", error_class=type(exc).__name__, duration_ms=round((time.monotonic() - conversion_started) * 1000))
                raise DocChunkerError("DOCLING_CONVERSION_FAILED", "Docling falhou ao converter o documento.", 503, "convert") from exc
            _emit("doc_chunker.conversion.completed", request_id=request_id, outcome="completed", duration_ms=round((time.monotonic() - conversion_started) * 1000), page_count=len(getattr(document, "pages", {}) or {}))
            reading_order_by_ref = _document_reading_order(document)
            chunking_started = time.monotonic()
            _emit("doc_chunker.chunking.started", request_id=request_id, outcome="started", tokenizer_id=TOKENIZER_ID, max_tokens=self.max_tokens)
            doc_chunks = list(self.chunker.chunk(document))
            page_count = len(getattr(document, "pages", {}) or {})
            normalized_chunks: list[dict[str, object]] = []
            for index, chunk in enumerate(doc_chunks):
                raw_text = normalize_pdf_text(str(getattr(chunk, "text", "")).strip())
                contextualized = normalize_pdf_text(str(self.chunker.contextualize(chunk)).strip())
                if not contextualized or not raw_text:
                    continue
                text_parts = _split_bounded_text(
                    raw_text, contextualized, self.tokenizer, self.max_tokens,
                    list(getattr(getattr(chunk, "meta", None), "headings", []) or []),
                )
                if len(text_parts) > 1:
                    _emit("doc_chunker.chunking.split", request_id=request_id, outcome="completed",
                          source_chunk_index=index, part_count=len(text_parts),
                          original_tokens=int(self.tokenizer.count_tokens(contextualized)))
                pages: set[int] = set()
                headings = list(getattr(getattr(chunk, "meta", None), "headings", []) or [])
                provenance: list[dict[str, object]] = []
                labels: set[str] = set()
                for item in getattr(getattr(chunk, "meta", None), "doc_items", []) or []:
                    label = str(getattr(getattr(item, "label", None), "value", getattr(item, "label", "text"))).lower()
                    labels.add("table" if "table" in label else "formula" if "formula" in label else "text")
                    for prov in getattr(item, "prov", []) or []:
                        page = getattr(prov, "page_no", None)
                        if isinstance(page, int) and page > 0:
                            pages.add(page)
                            bbox = getattr(prov, "bbox", None)
                            coords = _bbox(bbox)
                            if coords:
                                item_ref = str(getattr(item, "self_ref", ""))
                                provenance.append({"page": page, "item_ref": item_ref, "reading_order": reading_order_by_ref.get(item_ref), "bbox": coords, "coord_origin": str(getattr(getattr(bbox, "coord_origin", None), "value", "")) or None})
                chunk_type = next(iter(labels)) if len(labels) == 1 else "mixed"
                for part_text, part_raw, token_count in text_parts:
                    normalized_chunks.append({
                        "index": len(normalized_chunks), "text": part_text, "raw_text": part_raw,
                        "headings": [normalize_pdf_text(str(value)) for value in headings], "pages": sorted(pages),
                        "type": chunk_type, "tokens": token_count, "provenance": provenance,
                    })
            if not normalized_chunks:
                code = "OCR_REQUIRED" if classification == "SCANNED" else "NO_EXTRACTABLE_TEXT"
                raise DocChunkerError(code, "O PDF não produziu texto que possa ser indexado.", stage="chunking")
            if any(page > page_count for item in normalized_chunks for page in item["pages"]):
                raise DocChunkerError("INVALID_PROVENANCE", "A proveniência contém página fora do documento.", stage="chunking")
            _emit("doc_chunker.chunking.completed", request_id=request_id, outcome="completed", duration_ms=round((time.monotonic() - chunking_started) * 1000), chunk_count=len(normalized_chunks), token_min=min(item["tokens"] for item in normalized_chunks), token_max=max(item["tokens"] for item in normalized_chunks), chunks_without_page=sum(not item["pages"] for item in normalized_chunks))
            response = {
                "schema_version": "doc-chunker/v1", "request_id": request_id,
                "status": "completed", "doc_hash": actual_hash, "engine": "docling",
                "parser_version": PARSER_VERSION, "tokenizer_id": TOKENIZER_ID,
                "chunker_version": CHUNKER_VERSION, "page_count": page_count,
                "chunks": normalized_chunks,
            }
            if not visual_package:
                return response
            from visual_asset_export import build_visual_package
            package = build_visual_package(
                document, actual_hash, request_id=request_id, chunks=normalized_chunks,
                parser_version=PARSER_VERSION, tokenizer_id=TOKENIZER_ID, chunker_version=CHUNKER_VERSION,
                scanned_pdf_path=pdf_path if classification in {"SCANNED", "MIXED"} else None,
            )
            with zipfile.ZipFile(io.BytesIO(package)) as archive:
                asset_count = sum(name.startswith("assets/") for name in archive.namelist())
            _emit("doc_chunker.visual_assets.completed", request_id=request_id,
                  outcome="completed", asset_count=asset_count, package_bytes=len(package))
            return package


def _split_bounded_text(
    raw_text: str, contextualized: str, tokenizer: Any, max_tokens: int, headings: list[Any],
) -> list[tuple[str, str, int]]:
    """Partition an oversized Docling chunk without dropping source text or heading context."""
    token_count = int(tokenizer.count_tokens(contextualized))
    if token_count <= max_tokens:
        return [(contextualized, raw_text, token_count)]
    prefix = contextualized[:-len(raw_text)] if contextualized.endswith(raw_text) else (
        "\n".join(normalize_pdf_text(str(heading)) for heading in headings) + "\n" if headings else ""
    )
    parts: list[tuple[str, str, int]] = []
    remaining = raw_text
    while remaining:
        low, high, best = 1, len(remaining), 0
        while low <= high:
            middle = (low + high) // 2
            if int(tokenizer.count_tokens(prefix + remaining[:middle])) <= max_tokens:
                best = middle
                low = middle + 1
            else:
                high = middle - 1
        if best == 0:
            raise DocChunkerError("CHUNK_TOO_LARGE", "O cabeçalho não deixa espaço para dividir o chunk.", stage="chunking")
        cut = best
        if best < len(remaining):
            boundaries = [remaining.rfind(separator, 0, best) for separator in ("\n", " ", "\t")]
            boundary = max(boundaries)
            if boundary >= best // 2:
                cut = boundary + 1
        raw_part = remaining[:cut]
        text_part = (prefix + raw_part).strip()
        part_tokens = int(tokenizer.count_tokens(text_part))
        if not text_part or part_tokens > max_tokens:
            raise DocChunkerError("CHUNK_TOO_LARGE", "Não foi possível dividir o chunk dentro do limite.", stage="chunking")
        parts.append((text_part, raw_part, part_tokens))
        remaining = remaining[cut:]
    return parts


def _bbox(bbox: Any) -> list[int | float] | None:
    if bbox is None:
        return None
    values = [getattr(bbox, key, None) for key in ("l", "t", "r", "b")]
    if all(isinstance(value, (int, float)) for value in values):
        return values
    if isinstance(bbox, (list, tuple)) and len(bbox) == 4 and all(isinstance(value, (int, float)) for value in bbox):
        return list(bbox)
    return None


def _document_reading_order(document: Any) -> dict[str, int]:
    try:
        entries = document.iterate_items()
    except AttributeError:
        return {}
    result: dict[str, int] = {}
    for order, entry in enumerate(entries):
        item = entry[0] if isinstance(entry, tuple) else entry
        item_ref = getattr(item, "self_ref", None)
        if isinstance(item_ref, str) and item_ref:
            result[item_ref] = order
    return result


def _emit(event: str, **fields: object) -> None:
    print(json.dumps({"event": event, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "service": "doc-chunker", **fields}, ensure_ascii=False), flush=True)
