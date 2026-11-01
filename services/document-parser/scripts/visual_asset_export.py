"""Export Docling figure crops as deterministic assets in a bounded ZIP package."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import io
import json
from pathlib import Path
from typing import Any
import zipfile

from PIL import Image

MAX_VISUAL_ASSETS = 500
MAX_ASSET_BYTES = 10 * 1024 * 1024
MAX_PACKAGE_BYTES = 20 * 1024 * 1024
MIN_NATIVE_TEXT_CHARS_PER_PAGE = 80


@dataclass(frozen=True)
class VisualAssetArtifact:
    asset_key: str
    source_item_ref: str
    reading_order: int
    page_number: int
    bbox: list[int | float] | None
    coord_origin: str | None
    caption: str | None
    mime_type: str
    width: int
    height: int
    sha256: str
    content: bytes

    def manifest_entry(self) -> dict[str, Any]:
        result = asdict(self)
        result.pop("content")
        result["asset_key"] = self.asset_key
        return result


def export_visual_assets(document: Any, pdf_hash: str) -> tuple[list[VisualAssetArtifact], list[dict[str, str]]]:
    """Export picture crops; missing/corrupt crops become warnings, not parse failures."""
    artifacts: list[VisualAssetArtifact] = []
    warnings: list[dict[str, str]] = []
    iterator = getattr(document, "iterate_items", None)
    if not callable(iterator):
        return artifacts, [{"code": "DOCLING_ITEMS_UNAVAILABLE"}]

    for reading_order, entry in enumerate(iterator()):
        item = entry[0] if isinstance(entry, tuple) else entry
        label = getattr(getattr(item, "label", None), "value", getattr(item, "label", ""))
        if str(label).lower().split(".")[-1] not in {"picture", "figure"}:
            continue
        item_ref = str(getattr(item, "self_ref", ""))
        provenance = list(getattr(item, "prov", []) or [])
        if not provenance:
            warnings.append({"code": "VISUAL_PROVENANCE_UNAVAILABLE", "source_item_ref": item_ref})
            continue
        if len(artifacts) >= MAX_VISUAL_ASSETS:
            warnings.append({"code": "VISUAL_ASSET_LIMIT_REACHED"})
            break
        for prov_index, prov in enumerate(provenance):
            page = getattr(prov, "page_no", None)
            if not isinstance(page, int) or page < 1:
                warnings.append({"code": "VISUAL_PROVENANCE_UNAVAILABLE", "source_item_ref": item_ref})
                continue
            try:
                get_image = getattr(item, "get_image")
                image = get_image(document, prov_index=prov_index)
                if image is None:
                    raise ValueError("crop unavailable")
                if not isinstance(image, Image.Image):
                    image = Image.open(image)
                image.load()
                if image.width < 1 or image.height < 1 or image.width > 4096 or image.height > 4096:
                    raise ValueError("crop dimensions outside limit")
                output = io.BytesIO()
                image.convert("RGB").save(output, format="PNG", optimize=True)
                content = output.getvalue()
                if len(content) > MAX_ASSET_BYTES:
                    warnings.append({"code": "VISUAL_ASSET_TOO_LARGE", "source_item_ref": item_ref})
                    continue
            except Exception:
                warnings.append({"code": "VISUAL_CROP_UNAVAILABLE", "source_item_ref": item_ref})
                continue

            bbox_obj = getattr(prov, "bbox", None)
            if isinstance(bbox_obj, (list, tuple)):
                bbox = list(bbox_obj) if len(bbox_obj) == 4 else None
            else:
                coords = [getattr(bbox_obj, key, None) for key in ("l", "t", "r", "b")]
                bbox = coords if all(isinstance(value, (int, float)) for value in coords) else None
            coord_origin = getattr(getattr(bbox_obj, "coord_origin", None), "value", None)
            identity = f"{pdf_hash}:{item_ref}:{reading_order}:{prov_index}:{page}:{bbox}"
            asset_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
            caption_text = getattr(item, "caption_text", None)
            try:
                caption = str(caption_text(document)).strip() if callable(caption_text) else ""
            except Exception:
                caption = ""
            artifacts.append(VisualAssetArtifact(
                asset_key=asset_key, source_item_ref=item_ref, reading_order=reading_order, page_number=page,
                bbox=bbox, coord_origin=str(coord_origin) if coord_origin else None,
                caption=caption or None, mime_type="image/png", width=image.width,
                height=image.height, sha256=hashlib.sha256(content).hexdigest(), content=content,
            ))
    return artifacts, warnings


def export_scanned_page_assets(
    pdf_path: Path,
    pdf_hash: str,
    *,
    existing_page_numbers: set[int],
    pdf_document_factory: Any | None = None,
) -> tuple[list[VisualAssetArtifact], list[dict[str, str]]]:
    """Render only pages without a usable native text layer or a figure crop.

    Page assets have no bbox, so question linking keeps them as review candidates.
    """
    if pdf_document_factory is None:
        from pypdfium2 import PdfDocument
        pdf_document_factory = PdfDocument
    artifacts: list[VisualAssetArtifact] = []
    warnings: list[dict[str, str]] = []
    pdf_document = pdf_document_factory(str(pdf_path))
    try:
        for page_index in range(len(pdf_document)):
            page_number = page_index + 1
            if page_number in existing_page_numbers:
                continue
            if len(artifacts) >= MAX_VISUAL_ASSETS:
                warnings.append({"code": "VISUAL_ASSET_LIMIT_REACHED"})
                break
            page = pdf_document[page_index]
            try:
                text_page = None
                try:
                    text_page = page.get_textpage()
                    native_text = " ".join((text_page.get_text_range() or "").split())
                except Exception:
                    native_text = ""
                finally:
                    if text_page is not None and callable(getattr(text_page, "close", None)):
                        text_page.close()
                if len(native_text) >= MIN_NATIVE_TEXT_CHARS_PER_PAGE:
                    continue
                try:
                    width = float(page.get_width()) if callable(getattr(page, "get_width", None)) else 1.0
                    height = float(page.get_height()) if callable(getattr(page, "get_height", None)) else 1.0
                    scale = min(1.0, 4096 / max(width, height))
                    image = page.render(scale=scale).to_pil()
                    image.load()
                    if image.width < 1 or image.height < 1 or image.width > 4096 or image.height > 4096:
                        raise ValueError("page image dimensions outside limit")
                    output = io.BytesIO()
                    image.convert("RGB").save(output, format="PNG", optimize=True)
                    content = output.getvalue()
                    if len(content) > MAX_ASSET_BYTES:
                        raise ValueError("page image bytes outside limit")
                except Exception:
                    warnings.append({"code": "VISUAL_SCANNED_PAGE_UNAVAILABLE", "source_item_ref": f"#/pages/{page_number}"})
                    continue
                key = hashlib.sha256(f"{pdf_hash}:scanned-page:{page_number}".encode("utf-8")).hexdigest()[:32]
                artifacts.append(VisualAssetArtifact(
                    asset_key=key, source_item_ref=f"#/pages/{page_number}", reading_order=0,
                    page_number=page_number, bbox=None, coord_origin=None, caption=None,
                    mime_type="image/png", width=image.width, height=image.height,
                    sha256=hashlib.sha256(content).hexdigest(), content=content,
                ))
            finally:
                if callable(getattr(page, "close", None)):
                    page.close()
    finally:
        if callable(getattr(pdf_document, "close", None)):
            pdf_document.close()
    return artifacts, warnings


def build_visual_package(
    document: Any,
    pdf_hash: str,
    *,
    request_id: str,
    chunks: list[dict[str, Any]],
    parser_version: str = "2.122.0",
    tokenizer_id: str = "Qwen/Qwen3-Embedding-8B@c90816d848505624c2434128dfc61132162a0ee9",
    chunker_version: str = "hybrid-v1",
    fallback_assets: list[VisualAssetArtifact] | None = None,
    fallback_warnings: list[dict[str, str]] | None = None,
    scanned_pdf_path: Path | None = None,
) -> bytes:
    assets, warnings = export_visual_assets(document, pdf_hash)
    if scanned_pdf_path is not None:
        page_assets, page_warnings = export_scanned_page_assets(
            scanned_pdf_path, pdf_hash,
            existing_page_numbers={asset.page_number for asset in assets},
        )
        fallback_assets = [*(fallback_assets or []), *page_assets]
        fallback_warnings = [*(fallback_warnings or []), *page_warnings]
    remaining = max(0, MAX_VISUAL_ASSETS - len(assets))
    extras = fallback_assets or []
    if len(extras) > remaining:
        warnings.append({"code": "VISUAL_ASSET_LIMIT_REACHED"})
    assets.extend(extras[:remaining])
    warnings.extend(fallback_warnings or [])
    manifest = {
        "schema_version": "doc-chunker/v2", "request_id": request_id,
        "doc_hash": pdf_hash, "engine": "docling", "chunks": chunks,
        "parser_version": parser_version, "tokenizer_id": tokenizer_id,
        "chunker_version": chunker_version, "page_count": len(getattr(document, "pages", {}) or {}),
        "visual_assets": [asset.manifest_entry() for asset in assets],
        "warnings": warnings,
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        info = zipfile.ZipInfo("manifest.json", date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
        for asset in assets:
            info = zipfile.ZipInfo(f"assets/{asset.asset_key}.png", date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, asset.content)
    package = output.getvalue()
    if len(package) > MAX_PACKAGE_BYTES:
        raise ValueError("DOC_CHUNKER_RESPONSE_TOO_LARGE: pacote visual excede o limite permitido")
    return package
