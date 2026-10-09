"""Behavioral tests for the experimental Docling layout artifact."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_mineru.py"
SPEC = importlib.util.spec_from_file_location("run_docling_normalize", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
run_docling = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = run_docling
SPEC.loader.exec_module(run_docling)


class FixtureBox:
    l = 10
    t = 20
    r = 30
    b = 40


class FixtureProvenance:
    def __init__(self, page_no: int | None, bbox: FixtureBox | None = None) -> None:
        self.page_no = page_no
        self.bbox = bbox


class FixtureItem:
    def __init__(self, label: str, text: str, provenance: list[FixtureProvenance]) -> None:
        self.label = label
        self.text = text
        self.prov = provenance


class FixtureDoclingDocument:
    def iterate_items(self):
        return iter([
            (FixtureItem("text", "Regra de três", [FixtureProvenance(1, FixtureBox())]), 0),
            (FixtureItem("table", "a | b", [FixtureProvenance(2)]), 1),
        ])


class NormalizeDoclingDocumentTests(unittest.TestCase):
    def test_normalization_runs_without_docling_installed(self) -> None:
        """The fixture path must keep working in a standard-library-only interpreter."""
        probe = textwrap.dedent(
            f"""
            import importlib.util

            spec = importlib.util.spec_from_file_location("docling_free_wrapper", {str(SCRIPT_PATH)!r})
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            class Provenance:
                page_no = 3
                bbox = (1, 2, 3, 4)

            class Item:
                label = "text"
                text = "fixture"
                prov = [Provenance()]

            class Document:
                def iterate_items(self):
                    return iter([(Item(), 0)])

            result = module.normalize_content_list(Document())
            assert result["pages"][0]["elements"][0]["text"] == "fixture"
            """
        )

        completed = subprocess.run(
            [sys.executable, "-S", "-c", probe],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_docling_items_keep_iteration_order_type_text_and_available_bbox(self) -> None:
        normalized = run_docling.normalize_content_list(FixtureDoclingDocument())

        self.assertEqual(normalized["schemaVersion"], "docling-layout-v1")
        self.assertEqual(normalized["pages"], [
            {
                "pageNumber": 1,
                "elements": [{
                    "externalIndex": 0,
                    "level": 0,
                    "type": "TEXT",
                    "text": "Regra de três",
                    "bbox": [10, 20, 30, 40],
                }],
            },
            {
                "pageNumber": 2,
                "elements": [{
                    "externalIndex": 1,
                    "level": 1,
                    "type": "TABLE",
                    "text": "a | b",
                    "bbox": None,
                }],
            },
        ])
        self.assertEqual(normalized["warnings"], [])

    def test_item_without_provenance_is_audited_without_being_invented_on_page_one(self) -> None:
        document = type("FixtureDoclingDocument", (), {
            "iterate_items": lambda self: iter([(FixtureItem("text", "Sem página", []), 0)]),
        })()

        normalized = run_docling.normalize_content_list(document)

        self.assertEqual(normalized["pages"], [])
        self.assertEqual(normalized["warnings"], ["item_0_missing_page_provenance"])


if __name__ == "__main__":
    unittest.main()
