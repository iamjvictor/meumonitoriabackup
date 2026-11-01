#!/usr/bin/env python3
"""Run Docling v2 and emit parser-neutral, reproducible spike artifacts.

The filename is retained for compatibility with the previous spike command.
The implementation uses only Docling v2's public DocumentConverter API.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def find_files(root: Path) -> list[str]:
    return sorted(str(path.relative_to(root)) for path in root.rglob("*") if path.is_file())


def hardware_details() -> dict[str, Any]:
    """Collect host facts without importing Docling or models."""
    details: dict[str, Any] = {
        "architecture": platform.machine(),
        "processor": platform.processor() or None,
        "cpuCount": os.cpu_count(),
        "accelerator": "not-detected",
    }
    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        return details
    try:
        result = subprocess.run(
            [nvidia_smi, "--query-gpu=name,memory.total", "--format=csv,noheader"],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        details["accelerator"] = "nvidia-smi-unavailable"
        return details
    if result.returncode == 0:
        details["accelerator"] = "nvidia"
        details["devices"] = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    else:
        details["accelerator"] = "nvidia-smi-failed"
    return details


def get_document_converter(
    *,
    do_ocr: bool = False,
    force_backend_text: bool = True,
) -> Any:
    """Build Docling lazily with explicit PDF text/OCR pipeline options."""
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pipeline_options = PdfPipelineOptions(
        do_ocr=do_ocr,
        force_backend_text=force_backend_text,
        generate_picture_images=True,
        images_scale=1.0,
    )
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        },
    )


def _item_type(item: Any) -> str:
    label = getattr(item, "label", None)
    value = getattr(label, "value", label)
    if value is None:
        value = type(item).__name__
    return str(value).split(".")[-1].upper()


def _bbox_values(bbox: Any) -> list[float | int] | None:
    if bbox is None:
        return None
    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        return list(bbox)
    if isinstance(bbox, dict):
        values = [bbox.get(name) for name in ("l", "t", "r", "b")]
    else:
        values = [getattr(bbox, name, None) for name in ("l", "t", "r", "b")]
    return values if all(value is not None for value in values) else None


def normalize_content_list(document: Any) -> dict[str, Any]:
    """Normalize ordered Docling items while retaining raw Docling JSON separately."""
    pages: dict[int, list[dict[str, Any]]] = {}
    warnings: list[str] = []
    try:
        entries = document.iterate_items()
    except AttributeError:
        return {
            "schemaVersion": "docling-layout-v1",
            "pages": [],
            "warnings": ["docling_iterate_items_unavailable"],
        }

    for external_index, entry in enumerate(entries):
        if isinstance(entry, tuple):
            item = entry[0]
            level = entry[1] if len(entry) > 1 else None
        else:
            item = entry
            level = None
        provenance = next(iter(getattr(item, "prov", []) or []), None)
        page_number = getattr(provenance, "page_no", None) if provenance is not None else None
        try:
            page_number = int(page_number)
            if page_number < 1:
                raise ValueError
        except (TypeError, ValueError):
            warnings.append(f"item_{external_index}_missing_page_provenance")
            continue

        text = getattr(item, "text", None)
        pages.setdefault(page_number, []).append({
            "externalIndex": external_index,
            "level": level if isinstance(level, int) else None,
            "type": _item_type(item),
            "text": text if isinstance(text, str) else None,
            "bbox": _bbox_values(getattr(provenance, "bbox", None)),
        })

    return {
        "schemaVersion": "docling-layout-v1",
        "pages": [
            {"pageNumber": number, "elements": elements}
            for number, elements in sorted(pages.items())
        ],
        "warnings": warnings,
    }


def finalize_manifest(output_path: Path, manifest: dict[str, Any]) -> None:
    manifest["finishedAt"] = datetime.now(timezone.utc).isoformat()
    manifest["durationMs"] = round((time.monotonic() - manifest.pop("_started", time.monotonic())) * 1000)
    manifest["files"] = sorted(set(find_files(output_path)) | {"manifest.json"})


def write_manifest(output_path: Path, manifest: dict[str, Any]) -> bool:
    finalize_manifest(output_path, manifest)
    manifest_path = output_path / "manifest.json"
    if manifest_path.exists():
        manifest["warnings"].append("existing_manifest_preserved")
        return False
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def is_docling_document_export(value: Any) -> bool:
    """Validate the stable structural markers emitted by DoclingDocument.export_to_dict()."""
    return (
        isinstance(value, dict)
        and value.get("schema_name") == "DoclingDocument"
        and isinstance(value.get("name"), str)
        and isinstance(value.get("body"), dict)
    )


def is_docling_layout_export(value: Any) -> bool:
    """Validate the parser-neutral layout JSON without importing Docling models."""
    if (
        not isinstance(value, dict)
        or value.get("schemaVersion") != "docling-layout-v1"
        or not isinstance(value.get("pages"), list)
        or not isinstance(value.get("warnings"), list)
    ):
        return False

    for page in value["pages"]:
        if (
            not isinstance(page, dict)
            or not isinstance(page.get("pageNumber"), int)
            or isinstance(page["pageNumber"], bool)
            or page["pageNumber"] < 1
            or not isinstance(page.get("elements"), list)
        ):
            return False
        for element in page["elements"]:
            if (
                not isinstance(element, dict)
                or not isinstance(element.get("externalIndex"), int)
                or isinstance(element["externalIndex"], bool)
                or not isinstance(element.get("type"), str)
                or not (isinstance(element.get("text"), str) or element.get("text") is None)
                or not (isinstance(element.get("level"), int) or element.get("level") is None)
                or not (
                    element.get("bbox") is None
                    or (isinstance(element.get("bbox"), list) and len(element["bbox"]) == 4)
                )
            ):
                return False
    return True


def reusable_docling_artifacts(output_path: Path) -> bool:
    return (
        (output_path / "document.md").is_file()
        and is_docling_document_export(load_json(output_path / "document.json"))
        and is_docling_layout_export(load_json(output_path / "layout.json"))
    )


def run(args: argparse.Namespace) -> int:
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    manifest: dict[str, Any] = {
        "schemaVersion": "spike-manifest-v1",
        "status": "PROCESSING",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "_started": time.monotonic(),
        "input": str(input_path),
        "inputSha256": sha256_file(input_path) if input_path.is_file() else None,
        "python": sys.version,
        "pythonExecutable": sys.executable,
        "platform": platform.platform(),
        "parserName": "DOCLING",
        "parserVersion": package_version("docling") or "not-installed",
        "configuration": {
            "pipeline": "docling-default-cpu",
            "backendCompatibility": args.backend or "omitted",
            "timeoutSeconds": args.timeout,
            "skipParse": bool(args.skip_parse),
            "extraOcrOrVlm": "not-configured",
        },
        "hardware": hardware_details(),
        "executionMode": "reuse" if args.skip_parse else "fresh",
        "reusedExistingOutput": bool(args.skip_parse),
        "exitCode": None,
        "warnings": ["timeout_is_audit_only_for_in_process_docling_conversion"],
    }

    output_path.mkdir(parents=True, exist_ok=True)
    if args.backend not in (None, "pipeline"):
        manifest.update({
            "status": "FAILED",
            "error": "UNSUPPORTED_BACKEND_COMPATIBILITY",
            "errorDetails": "Docling não seleciona backend por esta flag; apenas --backend pipeline é aceito para compatibilidade.",
            "exitCode": 1,
        })
        write_manifest(output_path, manifest)
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 1
    if args.backend == "pipeline":
        manifest["warnings"].append("backend_pipeline_accepted_for_command_compatibility_and_ignored")

    if not input_path.is_file():
        manifest.update({"status": "FAILED", "error": "INPUT_NOT_FOUND", "errorDetails": f"PDF não encontrado: {input_path}", "exitCode": 1})
        write_manifest(output_path, manifest)
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 1

    if not args.skip_parse and any(output_path.iterdir()):
        manifest.update({
            "status": "FAILED",
            "error": "OUTPUT_DIRECTORY_NOT_EMPTY",
            "errorDetails": "Use um diretório novo para uma execução fresca ou --skip-parse para inspeção explícita.",
            "exitCode": 1,
        })
        write_manifest(output_path, manifest)
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 1

    if args.skip_parse:
        if (output_path / "manifest.json").exists():
            manifest.update({
                "status": "FAILED",
                "error": "MANIFEST_ALREADY_EXISTS",
                "errorDetails": "O manifesto existente é imutável; use um diretório de artefatos sem manifesto para registrar um reuso.",
                "executionMode": "reuse-rejected",
                "reusedExistingOutput": False,
                "exitCode": 1,
            })
            finalize_manifest(output_path, manifest)
            print(json.dumps(manifest, ensure_ascii=False, indent=2))
            return 1
        if reusable_docling_artifacts(output_path):
            manifest["status"] = "REUSED"
            manifest["warnings"].append("reused_existing_docling_artifacts_without_fresh_exit_code")
        else:
            manifest.update({
                "status": "FAILED",
                "error": "REUSE_ARTIFACTS_NOT_FOUND",
                "errorDetails": "--skip-parse exige document.md, document.json e layout.json Docling válidos já existentes.",
                "executionMode": "reuse-rejected",
                "reusedExistingOutput": False,
                "exitCode": 1,
            })
    else:
        shutil.copy2(input_path, output_path / "source.pdf")
        manifest["command"] = ["DocumentConverter", "convert", str(input_path)]
        manifest["commandSource"] = "docling-v2-library-api"
        try:
            converter = get_document_converter()
            document = converter.convert(input_path).document
            (output_path / "document.md").write_text(document.export_to_markdown(), encoding="utf-8")
            (output_path / "document.json").write_text(json.dumps(document.export_to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
            layout = normalize_content_list(document)
            (output_path / "layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
            manifest.update({"status": "COMPLETED", "exitCode": 0})
            manifest["warnings"].extend(layout["warnings"])
        except ModuleNotFoundError as exc:
            manifest.update({"status": "FAILED", "error": "DOCLING_DEPENDENCY_MISSING", "errorDetails": str(exc), "exitCode": 1})
        except TimeoutError as exc:
            manifest.update({"status": "FAILED", "error": "DOCLING_TIMEOUT", "errorDetails": str(exc), "exitCode": 1})
        except Exception as exc:  # The manifest is the auditable error boundary for this spike.
            manifest.update({"status": "FAILED", "error": "DOCLING_CONVERSION_FAILED", "errorDetails": f"{type(exc).__name__}: {exc}", "exitCode": 1})

    write_manifest(output_path, manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0 if manifest["status"] in {"COMPLETED", "REUSED"} else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Caminho do PDF")
    parser.add_argument("--output", required=True, help="Diretório de artefatos")
    parser.add_argument("--backend", default="pipeline", help="Compatibilidade MinerU: apenas 'pipeline' é aceito e ignorado pelo Docling.")
    parser.add_argument("--timeout", type=int, default=3600, help="Registrado no manifesto; não interrompe a chamada Docling em processo.")
    parser.add_argument("--skip-parse", action="store_true", help="Reaproveita apenas artefatos Docling existentes, sem conversão nova")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
