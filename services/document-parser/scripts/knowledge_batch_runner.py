"""Run an isolated, time-bounded Docling conversion for a page interval."""
from __future__ import annotations

import argparse
from dataclasses import fields
import importlib.metadata
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import tempfile
from uuid import UUID
import time
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from knowledge_batch_manifest import SCHEMA_VERSION, build_files, package_checksum, sha256_bytes, write_json
from knowledge_profile import KnowledgeProfile


class BatchCancelledError(RuntimeError):
    pass


def _profile(raw: Any) -> KnowledgeProfile:
    if not isinstance(raw, dict):
        raise ValueError("profile precisa ser um objeto JSON")
    allowed = {item.name for item in fields(KnowledgeProfile)}
    unknown = set(raw) - allowed
    if unknown:
        raise ValueError(f"campos desconhecidos no profile: {', '.join(sorted(unknown))}")
    return KnowledgeProfile(**raw)


def _conversion_child(input_path: Path, request_path: Path, output_dir: Path) -> int:
    from run_mineru import get_document_converter, normalize_content_list

    request = json.loads(request_path.read_text(encoding="utf-8"))
    profile = _profile(request["profile"])
    start, end = request["pageStart"], request["pageEnd"]
    init_started = time.monotonic()
    converter = get_document_converter(knowledge_profile=profile)
    converter_init_ms = round((time.monotonic() - init_started) * 1000)
    conversion_started = time.monotonic()
    result = converter.convert(input_path, raises_on_error=False, page_range=(start, end))
    conversion_ms = round((time.monotonic() - conversion_started) * 1000)
    document = getattr(result, "document", None)
    status = getattr(getattr(result, "status", None), "value", getattr(result, "status", None))
    raw_errors = getattr(result, "errors", []) or []
    errors = [str(getattr(error, "error_message", error))[:1000] for error in raw_errors]
    if document is None:
        raise RuntimeError("Docling retornou ConversionResult sem document")

    layout = normalize_content_list(document)
    from visual_asset_export import export_scanned_page_assets, export_visual_assets
    figure_assets, figure_warnings = export_visual_assets(document, request["contentHash"])
    figure_pages = {asset.page_number for asset in figure_assets}
    page_assets, page_warnings = export_scanned_page_assets(
        input_path, request["contentHash"], existing_page_numbers=figure_pages,
        page_start=start, page_end=end,
    )
    visual_assets = [*figure_assets, *page_assets]
    by_page = {entry["pageNumber"]: entry["elements"] for entry in layout.get("pages", [])}
    pages = []
    conversion_ok = status == "success" and not errors
    for number in range(start, end + 1):
        elements = by_page.get(number, [])
        character_count = sum(len(element.get("text") or "") for element in elements)
        image_count = sum(element.get("type", "").upper() in {"PICTURE", "IMAGE"} for element in elements) + sum(asset.page_number == number for asset in visual_assets)
        # A raster fallback preserves the source image but cannot prove that
        # Docling extracted content or that the page is truly blank.
        has_converted_items = bool(elements)
        page_errors = [] if conversion_ok and has_converted_items else (errors or ["Página sem itens Docling; raster sozinho não comprova página vazia."])
        pages.append({
            "pageNumber": number,
            "status": "CONVERTED" if conversion_ok and has_converted_items else "FAILED",
            "characterCount": character_count,
            "layoutItemCount": len(elements),
            "imageCount": image_count,
            "errors": page_errors,
        })

    output_dir.mkdir(parents=True, exist_ok=True)
    markdown = document.export_to_markdown()
    doc_json = document.export_to_dict()
    (output_dir / "document.md").write_text(markdown, encoding="utf-8")
    write_json(output_dir / "document.json", doc_json)
    write_json(output_dir / "layout.json", layout)
    for asset in visual_assets:
        asset_path = output_dir / "assets" / f"{asset.asset_key}.png"
        asset_path.parent.mkdir(parents=True, exist_ok=True)
        asset_path.write_bytes(asset.content)
    request.update({
        "schemaVersion": SCHEMA_VERSION,
        "parserVersion": importlib.metadata.version("docling"),
        "pages": pages,
        "visualAssets": [asset.manifest_entry() for asset in visual_assets],
        "assetWarnings": [*figure_warnings, *page_warnings],
        "status": "COMPLETED" if all(page["status"] != "FAILED" for page in pages) else "PARTIAL",
        "conversionStatus": status,
        "errors": errors,
        "converterInitializationMs": converter_init_ms,
        "conversionMs": conversion_ms,
        "peakRssBytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1024 if sys.platform != "darwin" else 1)),
    })
    write_json(output_dir / "manifest.json", request)
    return 0


def run_batch(
    request: dict[str, Any],
    input_path: Path,
    output_dir: Path,
    *,
    timeout_seconds: float | None = None,
    max_response_bytes: int | None = None,
    cancel_event: Any | None = None,
    absolute_deadline: float | None = None,
) -> dict[str, Any]:
    """Execute conversion in a process group and package only finalized outputs."""
    profile = _profile(request.get("profile"))
    start, end = request.get("pageStart"), request.get("pageEnd")
    if any(not isinstance(value, int) or isinstance(value, bool) for value in (start, end)) or start < 1 or end < start or end - start + 1 > profile.batch_pages:
        raise ValueError(f"intervalo de páginas deve ser inclusivo e conter até {profile.batch_pages} páginas")
    for key in ("documentId", "runId"):
        if not isinstance(request.get(key), str) or not request[key]:
            raise ValueError(f"{key} é obrigatório")
        try:
            UUID(request[key])
        except ValueError as exc:
            raise ValueError(f"{key} precisa ser UUID") from exc
    for key in ("contentHash", "configurationHash"):
        if not isinstance(request.get(key), str) or len(request[key]) != 64 or any(c not in "0123456789abcdefABCDEF" for c in request[key]):
            raise ValueError(f"{key} precisa ser SHA-256 hexadecimal")
    if request["configurationHash"].lower() != profile.digest():
        raise ValueError("configurationHash não corresponde ao perfil efetivo")
    if not input_path.is_file():
        raise ValueError("arquivo PDF ausente")
    if sha256_bytes(input_path.read_bytes()) != request["contentHash"].lower():
        raise ValueError("hash do arquivo não corresponde a contentHash")
    if cancel_event is not None and cancel_event.is_set():
        raise BatchCancelledError("O lote foi cancelado antes de criar o subprocesso.")
    work = Path(tempfile.mkdtemp(prefix="knowledge-batch-"))
    req_file = work / "request.json"
    child_out = work / "out"
    write_json(req_file, request)
    started = time.monotonic()
    local_deadline = min(
        absolute_deadline if absolute_deadline is not None else float("inf"),
        started + (timeout_seconds if timeout_seconds is not None else profile.batch_timeout_seconds),
    )
    if started >= local_deadline:
        import shutil
        shutil.rmtree(work, ignore_errors=True)
        raise TimeoutError("Prazo absoluto expirou antes de iniciar o subprocesso.")
    process = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), "--child", str(input_path), str(req_file), str(child_out)],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        while True:
            if cancel_event is not None and cancel_event.is_set():
                _terminate_group(process)
                process.communicate()
                raise BatchCancelledError("Todos os clientes encerraram a solicitação do lote.")
            remaining = local_deadline - time.monotonic()
            if remaining <= 0:
                _terminate_group(process)
                process.communicate()
                raise TimeoutError("O limite absoluto de fila e conversão do lote expirou.")
            try:
                process.communicate(timeout=min(0.1, remaining))
                break
            except subprocess.TimeoutExpired:
                continue
        if cancel_event is not None and cancel_event.is_set():
            raise BatchCancelledError("Todos os clientes encerraram a solicitação do lote.")
        if time.monotonic() >= local_deadline:
            raise TimeoutError("O limite absoluto de fila e conversão do lote expirou.")
        if process.returncode != 0:
            raise RuntimeError(f"subprocesso Docling terminou com código {process.returncode}")
        manifest_path = child_out / "manifest.json"
        if not manifest_path.is_file():
            raise RuntimeError("subprocesso terminou sem manifest")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if time.monotonic() >= local_deadline:
            raise TimeoutError("Prazo absoluto expirou durante a preparação dos artefatos.")
        manifest.update({key: request[key] for key in ("documentId", "runId", "contentHash", "configurationHash", "pageStart", "pageEnd")})
        if max_response_bytes is not None:
            total_file_bytes = sum(path.stat().st_size for path in child_out.rglob("*") if path.is_file() and path.name != "manifest.json")
            if total_file_bytes > max_response_bytes * 3 // 4:
                raise ValueError("Artefatos do lote excedem o limite de resposta")
        files = build_files(child_out)
        if cancel_event is not None and cancel_event.is_set():
            raise BatchCancelledError("Todos os clientes encerraram a solicitação do lote.")
        if not files:
            raise RuntimeError("lote não produziu artefatos")
        manifest["files"] = files
        output_dir.mkdir(parents=True, exist_ok=True)
        for item in files:
            target = output_dir / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            import base64
            target.write_bytes(base64.b64decode(item["contentBase64"]))
        write_json(output_dir / "manifest.json", manifest)
        package = [{"path": item["path"], "sha256": item["sha256"], "contentBase64": item["contentBase64"]} for item in files]
        if time.monotonic() >= local_deadline:
            raise TimeoutError("Prazo absoluto expirou durante a preparação dos artefatos.")
        return {"manifest": manifest, "files": files, "artifactChecksum": package_checksum(files), "durationMs": round((time.monotonic() - started) * 1000)}
    finally:
        _terminate_group(process)
        process.communicate()
        import shutil
        shutil.rmtree(work, ignore_errors=True)


def _terminate_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        return
    try:
        os.killpg(process.pid, 0)
    except ProcessLookupError:
        return
    else:
        try:
            # The leader exited, but at least one descendant remains in the
            # process group. It has already received TERM; reap stragglers.
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--child", nargs=3, metavar=("INPUT", "REQUEST", "OUTPUT"))
    args = parser.parse_args()
    if not args.child:
        parser.error("somente execução interna do subprocesso")
    input_path, request_path, output_dir = map(Path, args.child)
    return _conversion_child(input_path, request_path, output_dir)


if __name__ == "__main__":
    raise SystemExit(main())
