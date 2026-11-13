#!/usr/bin/env python3
"""Run an auditable five-page Docling profile benchmark and emit JSON."""
from __future__ import annotations

import argparse
from dataclasses import asdict, replace
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from knowledge_batch_runner import run_batch
from knowledge_profile import KnowledgeProfile


def _private_dir(path: Path, *, create: bool = True) -> None:
    if path.is_symlink():
        raise ValueError(f"Diretório de artefatos não pode ser symlink: {path.name}")
    if create:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir():
        raise ValueError(f"Caminho de artefatos não é diretório: {path.name}")
    os.chmod(path, 0o700)


def _write_private_json(path: Path, payload: Any) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(encoded)
    os.chmod(path, 0o600)


def _artifact_inventory(condition_dir: Path) -> tuple[list[str], int]:
    paths = sorted(path for path in condition_dir.rglob("*") if path.is_file())
    relative = [path.relative_to(condition_dir).as_posix() for path in paths]
    for path in paths:
        os.chmod(path, 0o600)
    return relative, sum(path.stat().st_size for path in paths)


def _summarize(manifest: dict[str, Any], duration_ms: int, artifact_bytes: int) -> dict[str, Any]:
    pages = manifest.get("pages", [])
    if not isinstance(pages, list):
        pages = []
    return {
        "status": manifest.get("status"),
        "conversionStatus": manifest.get("conversionStatus"),
        "expectedPages": len(pages),
        "convertedPages": sum(page.get("status") == "CONVERTED" for page in pages if isinstance(page, dict)),
        "verifiedBlankPages": sum(page.get("status") == "VERIFIED_BLANK" for page in pages if isinstance(page, dict)),
        "failedPages": sum(page.get("status") == "FAILED" for page in pages if isinstance(page, dict)),
        "characterCount": sum(page.get("characterCount", 0) for page in pages if isinstance(page, dict)),
        "layoutItemCount": sum(page.get("layoutItemCount", 0) for page in pages if isinstance(page, dict)),
        "imageCount": sum(page.get("imageCount", 0) for page in pages if isinstance(page, dict)),
        "visualAssetCount": len(manifest.get("visualAssets", [])) if isinstance(manifest.get("visualAssets", []), list) else 0,
        "wallDurationMs": duration_ms,
        "converterInitializationMs": manifest.get("converterInitializationMs"),
        "conversionMs": manifest.get("conversionMs"),
        "peakRssBytes": manifest.get("peakRssBytes"),
        "artifactBytes": artifact_bytes,
    }


def run_benchmark(
    pdf: Path,
    sample_pages: dict[str, int],
    report_path: Path,
    *,
    current_scale: float = 3.0,
    reduced_scale: float = 1.5,
) -> dict[str, Any]:
    pdf = pdf.expanduser().resolve(strict=True)
    report_path = report_path.expanduser()
    if report_path.is_symlink():
        raise ValueError("Arquivo de relatório não pode ser symlink")
    report_path = report_path.resolve()
    if not pdf.is_file():
        raise ValueError("PDF não encontrado")
    expected_samples = {"text", "formula", "table", "image", "scan"}
    if set(sample_pages) != expected_samples or any(not isinstance(page, int) or isinstance(page, bool) or page < 1 for page in sample_pages.values()) or len(set(sample_pages.values())) != 5:
        raise ValueError("informe cinco páginas positivas e distintas: text, formula, table, image e scan")
    if not (0 < current_scale <= 8 and 0 < reduced_scale <= 8):
        raise ValueError("escalas precisam ser maiores que zero e no máximo 8")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_root = report_path.with_name(report_path.name + ".artifacts")
    _private_dir(artifact_root)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
    run_dir = artifact_root / run_id
    run_dir.mkdir(mode=0o700)
    os.chmod(run_dir, 0o700)

    content_hash = hashlib.sha256(pdf.read_bytes()).hexdigest()
    records = []
    for label, page in sample_pages.items():
        for formulas in (True, False):
            for scale_name, scale in (("current", current_scale), ("reduced", reduced_scale)):
                profile = replace(KnowledgeProfile.from_env(), do_formula_enrichment=formulas, ocr_scale=scale, batch_pages=1)
                request = {
                    "documentId": "00000000-0000-4000-8000-000000000001",
                    "runId": "00000000-0000-4000-8000-000000000002",
                    "contentHash": content_hash,
                    "configurationHash": profile.digest(),
                    "pageStart": page, "pageEnd": page, "profile": asdict(profile),
                }
                # Labels and condition tokens are fixed enumerations, never raw
                # user strings; no input filename is used to build a child path.
                condition_name = f"{label}-formula-{int(formulas)}-scale-{scale_name}"
                condition_dir = run_dir / condition_name
                condition_dir.mkdir(mode=0o700)
                os.chmod(condition_dir, 0o700)
                outcome = run_batch(request, pdf, condition_dir)
                manifest = outcome["manifest"]
                artifact_files, _ = _artifact_inventory(condition_dir)
                review_path = condition_dir / "manual-review.json"
                review_template = {
                    "schemaVersion": "knowledge-pdf-comparison-v1",
                    "status": "not_reviewed",
                    "sample": label,
                    "pageNumber": page,
                    "formulaEnrichment": formulas,
                    "ocrScale": scale,
                    "artifacts": [name for name in artifact_files if name != "manifest.json"],
                    "checks": {
                        "textAndReadingOrderMatchPdf": None,
                        "formulaContentMatchPdf": None,
                        "tableStructureMatchPdf": None,
                        "visualAssetsMatchPdf": None,
                    },
                    "notes": "",
                }
                _write_private_json(review_path, review_template)
                artifact_files, artifact_bytes = _artifact_inventory(condition_dir)
                review_relative = review_path.relative_to(report_path.parent).as_posix()
                records.append({
                    "sample": label,
                    "page": page,
                    "formulaEnrichment": formulas,
                    "ocrScaleCondition": scale_name,
                    "ocrScale": scale,
                    "artifactDirectory": condition_dir.relative_to(report_path.parent).as_posix(),
                    "artifactFiles": artifact_files,
                    "manualPdfComparison": {"status": "not_reviewed", "reviewFile": review_relative},
                    "metrics": _summarize(manifest, outcome["durationMs"], artifact_bytes),
                    "pageEvidence": manifest.get("pages"),
                })

    durations = [record["metrics"]["wallDurationMs"] for record in records]
    report = {
        "schemaVersion": "knowledge-benchmark-v1",
        "inputSha256": content_hash,
        "artifactRunDirectory": run_dir.relative_to(report_path.parent).as_posix(),
        "summary": {
            "conditionCount": len(records),
            "completedConditions": sum(record["metrics"]["status"] == "COMPLETED" for record in records),
            "partialConditions": sum(record["metrics"]["status"] == "PARTIAL" for record in records),
            "meanWallDurationMs": round(sum(durations) / len(durations)) if durations else 0,
            "maxPeakRssBytes": max((record["metrics"]["peakRssBytes"] or 0 for record in records), default=0),
            "manualReviewsRequired": sum(record["manualPdfComparison"]["status"] == "not_reviewed" for record in records),
        },
        "conditions": records,
    }
    _write_private_json(report_path, report)
    print(json.dumps({"output": str(report_path), "artifactDirectory": str(run_dir), "conditions": len(records)}, ensure_ascii=False))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--text-page", type=int, required=True)
    parser.add_argument("--formula-page", type=int, required=True)
    parser.add_argument("--table-page", type=int, required=True)
    parser.add_argument("--image-page", type=int, required=True)
    parser.add_argument("--scan-page", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ocr-scale", type=float, default=3.0)
    parser.add_argument("--reduced-scale", type=float, default=1.5)
    args = parser.parse_args()
    sample_pages = {
        "text": args.text_page, "formula": args.formula_page, "table": args.table_page,
        "image": args.image_page, "scan": args.scan_page,
    }
    try:
        run_benchmark(args.pdf, sample_pages, args.output, current_scale=args.ocr_scale, reduced_scale=args.reduced_scale)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
