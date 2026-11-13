"""Manifest and deterministic artifact helpers for knowledge conversion batches."""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "knowledge-batch-v1"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def build_files(output_dir: Path) -> list[dict[str, str]]:
    files = []
    for path in sorted(item for item in output_dir.rglob("*") if item.is_file() and item.name != "manifest.json"):
        relative = path.relative_to(output_dir).as_posix()
        payload = path.read_bytes()
        files.append({"path": relative, "sha256": sha256_bytes(payload), "contentBase64": base64.b64encode(payload).decode("ascii")})
    return files


def package_checksum(files: list[dict[str, str]]) -> str:
    normalized = [{"path": item["path"], "sha256": item["sha256"], "contentBase64": item["contentBase64"]} for item in files]
    payload = json.dumps(normalized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(payload)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
