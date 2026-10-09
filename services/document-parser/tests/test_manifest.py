"""Behavioral tests for the parser-neutral Docling spike wrapper.

Breaks protected here:
* a successful conversion failing to preserve the source PDF or Docling exports;
* a manifest identifying the old parser or hiding compatibility configuration;
* dependency, conversion and timeout failures being collapsed into one result;
* a fresh run overwriting an existing output, or a reuse claiming fresh output.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Iterator


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_mineru.py"
FAKE_DOCLING_VERSION = "2.122.0"
SPEC = importlib.util.spec_from_file_location("run_docling_compat", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
run_docling = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = run_docling
SPEC.loader.exec_module(run_docling)
# The pre-migration wrapper may still find an installed MinerU console script.
# Disable that external path so RED is deterministic and model-free.
run_docling.resolve_mineru_command = lambda: None


@contextlib.contextmanager
def patched(module: object, name: str, value: object) -> Iterator[None]:
    previous = getattr(module, name, None)
    had_attribute = hasattr(module, name)
    setattr(module, name, value)
    try:
        yield
    finally:
        if had_attribute:
            setattr(module, name, previous)
        else:
            delattr(module, name)


class FakeBox:
    l = 10
    t = 20
    r = 30
    b = 40


class FakeProvenance:
    page_no = 1
    bbox = FakeBox()


class FakeItem:
    label = "text"
    text = "Regra de três"
    prov = [FakeProvenance()]


class FakeDocument:
    def export_to_markdown(self) -> str:
        return "# Regra de três\n"

    def export_to_dict(self) -> dict[str, object]:
        return {"schema_name": "DoclingDocument", "texts": [{"text": "Regra de três"}]}

    def iterate_items(self):
        return iter([(FakeItem(), 0)])


class FakeConverter:
    def __init__(self, document: FakeDocument | None = None, error: Exception | None = None) -> None:
        self.document = document or FakeDocument()
        self.error = error
        self.paths: list[Path] = []

    def convert(self, path: Path):
        self.paths.append(path)
        if self.error:
            raise self.error
        return type("ConversionResult", (), {"document": self.document})()


class DoclingManifestTests(unittest.TestCase):
    def arguments(
        self, pdf: Path, output: Path, timeout: float = 5, *, skip_parse: bool = False, backend: str | None = "pipeline"
    ) -> argparse.Namespace:
        return argparse.Namespace(
            input=str(pdf),
            output=str(output),
            backend=backend,
            timeout=timeout,
            skip_parse=skip_parse,
        )

    def write_reusable_docling_artifacts(self, output: Path) -> None:
        output.mkdir()
        (output / "document.md").write_text("# Stored\n", encoding="utf-8")
        (output / "document.json").write_text(
            json.dumps(
                {
                    "schema_name": "DoclingDocument",
                    "version": "2.0.0",
                    "name": "stored-document",
                    "body": {"name": "_root_", "self_ref": "#/body"},
                }
            ),
            encoding="utf-8",
        )
        (output / "layout.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "docling-layout-v1",
                    "pages": [
                        {
                            "pageNumber": 1,
                            "elements": [
                                {
                                    "externalIndex": 0,
                                    "level": 0,
                                    "type": "TEXT",
                                    "text": "Stored",
                                    "bbox": None,
                                }
                            ],
                        }
                    ],
                    "warnings": [],
                }
            ),
            encoding="utf-8",
        )

    def test_fresh_conversion_preserves_docling_exports_and_auditable_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"
            converter = FakeConverter()

            with (
                patched(run_docling, "get_document_converter", lambda: converter),
                patched(run_docling, "package_version", lambda name: FAKE_DOCLING_VERSION if name == "docling" else None),
            ):
                exit_code = run_docling.run(self.arguments(pdf, output))

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 0)
            self.assertEqual(manifest["status"], "COMPLETED")
            self.assertEqual(manifest["parserName"], "DOCLING")
            self.assertEqual(manifest["parserVersion"], FAKE_DOCLING_VERSION)
            self.assertEqual(manifest["configuration"]["pipeline"], "docling-default-cpu")
            self.assertEqual(manifest["configuration"]["backendCompatibility"], "pipeline")
            self.assertEqual(converter.paths, [pdf.resolve()])
            self.assertEqual((output / "source.pdf").read_bytes(), pdf.read_bytes())
            self.assertEqual((output / "document.md").read_text(encoding="utf-8"), "# Regra de três\n")
            self.assertEqual(
                json.loads((output / "document.json").read_text(encoding="utf-8"))["schema_name"],
                "DoclingDocument",
            )
            layout = json.loads((output / "layout.json").read_text(encoding="utf-8"))
            self.assertEqual(layout["pages"][0]["elements"][0]["type"], "TEXT")
            self.assertIn("source.pdf", manifest["files"])
            self.assertIn("document.md", manifest["files"])
            self.assertIn("document.json", manifest["files"])

    def test_manifest_reports_the_installed_docling_version_when_available(self) -> None:
        installed_version = run_docling.package_version("docling")
        if installed_version is None:
            self.skipTest("Docling não está instalado neste interpretador")

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"

            with patched(run_docling, "get_document_converter", lambda: FakeConverter()):
                exit_code = run_docling.run(self.arguments(pdf, output))

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 0)
            self.assertEqual(installed_version, "2.122.0")
            self.assertEqual(manifest["parserVersion"], "2.122.0")

    def test_missing_docling_dependency_is_distinct_from_conversion_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"

            with patched(run_docling, "get_document_converter", lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'docling'"))):
                exit_code = run_docling.run(self.arguments(pdf, output))

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 1)
            self.assertEqual(manifest.get("error"), "DOCLING_DEPENDENCY_MISSING")
            self.assertIn("docling", manifest.get("errorDetails", ""))

    def test_timeout_and_conversion_failure_have_distinct_error_codes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")

            with patched(run_docling, "get_document_converter", lambda: FakeConverter(error=TimeoutError("fixture timeout"))):
                timeout_exit = run_docling.run(self.arguments(pdf, root / "timeout-output"))
            with patched(run_docling, "get_document_converter", lambda: FakeConverter(error=ValueError("fixture invalid PDF"))):
                failure_exit = run_docling.run(self.arguments(pdf, root / "failure-output"))

            timeout_manifest = json.loads((root / "timeout-output" / "manifest.json").read_text(encoding="utf-8"))
            failure_manifest = json.loads((root / "failure-output" / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(timeout_exit, 1)
            self.assertEqual(timeout_manifest.get("error"), "DOCLING_TIMEOUT")
            self.assertEqual(failure_exit, 1)
            self.assertEqual(failure_manifest.get("error"), "DOCLING_CONVERSION_FAILED")

    def test_fresh_parse_refuses_nonempty_output_and_preserves_existing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"
            output.mkdir()
            existing_manifest = output / "manifest.json"
            existing_manifest.write_text('{"status":"HISTORICAL"}\n', encoding="utf-8")

            exit_code = run_docling.run(self.arguments(pdf, output))

            self.assertEqual(exit_code, 1)
            self.assertEqual(existing_manifest.read_text(encoding="utf-8"), '{"status":"HISTORICAL"}\n')

    def test_explicit_reuse_rejects_empty_or_schema_less_docling_json_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            for name, document, layout in (
                ("empty-document", {}, {"schemaVersion": "docling-layout-v1", "pages": [], "warnings": []}),
                ("schema-less-layout", {"schema_name": "DoclingDocument"}, {"pages": []}),
            ):
                with self.subTest(name=name):
                    output = root / name
                    output.mkdir()
                    (output / "document.md").write_text("# Stored\n", encoding="utf-8")
                    (output / "document.json").write_text(json.dumps(document), encoding="utf-8")
                    (output / "layout.json").write_text(json.dumps(layout), encoding="utf-8")

                    exit_code = run_docling.run(self.arguments(pdf, output, skip_parse=True))

                    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
                    self.assertEqual(exit_code, 1)
                    self.assertEqual(manifest["status"], "FAILED")
                    self.assertEqual(manifest["error"], "REUSE_ARTIFACTS_NOT_FOUND")
                    self.assertEqual(manifest["executionMode"], "reuse-rejected")
                    self.assertFalse(manifest["reusedExistingOutput"])

    def test_explicit_reuse_accepts_schema_valid_docling_exports_without_fresh_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"
            self.write_reusable_docling_artifacts(output)

            exit_code = run_docling.run(self.arguments(pdf, output, skip_parse=True))

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 0)
            self.assertEqual(manifest["status"], "REUSED")
            self.assertEqual(manifest["executionMode"], "reuse")
            self.assertTrue(manifest["reusedExistingOutput"])
            self.assertIsNone(manifest["exitCode"])

    def test_reuse_refuses_to_replace_an_existing_manifest(self) -> None:
        """A second reuse must not report a state it cannot persist safely."""
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"
            self.write_reusable_docling_artifacts(output)
            existing_manifest = output / "manifest.json"
            existing_manifest.write_text('{"status":"HISTORICAL"}\n', encoding="utf-8")

            exit_code = run_docling.run(self.arguments(pdf, output, skip_parse=True))

            self.assertEqual(exit_code, 1)
            self.assertEqual(existing_manifest.read_text(encoding="utf-8"), '{"status":"HISTORICAL"}\n')

    def test_unsupported_backend_is_rejected_as_compatibility_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf = root / "source.pdf"
            pdf.write_bytes(b"%PDF-1.4\nfixture\n")
            output = root / "output"

            exit_code = run_docling.run(self.arguments(pdf, output, backend="vlm"))

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 1)
            self.assertEqual(manifest.get("error"), "UNSUPPORTED_BACKEND_COMPATIBILITY")


if __name__ == "__main__":
    unittest.main()
