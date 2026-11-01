"""Tests for deterministic, bounded visual asset extraction."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import sys
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "visual_asset_export.py"
SPEC = importlib.util.spec_from_file_location("visual_asset_export", MODULE_PATH)
module = None
if SPEC and SPEC.loader:
    module = importlib.util.module_from_spec(SPEC)
    sys.modules[SPEC.name] = module
    try:
        SPEC.loader.exec_module(module)
    except FileNotFoundError:
        module = None


def image_bytes(color: str = "red") -> bytes:
    image = Image.new("RGB", (24, 12), color)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class VisualAssetExportTests(unittest.TestCase):
    def test_renders_only_scanned_pages_without_picture_crops_as_review_candidates(self):
        self.assertIsNotNone(module, "visual_asset_export module is not implemented")
        class FakePage:
            def __init__(self, native_text):
                self.native_text = native_text
            def get_textpage(self):
                return SimpleNamespace(get_text_range=lambda: self.native_text, close=lambda: None)
            def render(self, scale=1):
                return SimpleNamespace(to_pil=lambda: Image.new("RGB", (30, 40), "white"))
            def close(self):
                pass
        class FakePdf:
            def __init__(self, _path):
                self.pages = [FakePage(""), FakePage("texto nativo " * 20), FakePage("")]
            def __len__(self):
                return len(self.pages)
            def __getitem__(self, index):
                return self.pages[index]
            def close(self):
                pass
        assets, warnings = module.export_scanned_page_assets(
            Path("fixture.pdf"), "f" * 64,
            existing_page_numbers={3}, pdf_document_factory=FakePdf,
        )
        self.assertEqual(warnings, [])
        self.assertEqual([asset.page_number for asset in assets], [1])
        self.assertEqual(assets[0].source_item_ref, "#/pages/1")
        self.assertIsNone(assets[0].bbox)
        self.assertEqual(assets[0].sha256, hashlib.sha256(assets[0].content).hexdigest())
        with Image.open(io.BytesIO(assets[0].content)) as decoded:
            self.assertEqual(decoded.size, (30, 40))

    def test_v2_package_includes_scanned_page_fallback_asset(self):
        artifact = module.VisualAssetArtifact(
            asset_key="a" * 32, source_item_ref="#/pages/1", reading_order=0,
            page_number=1, bbox=None, coord_origin=None, caption=None,
            mime_type="image/png", width=24, height=12,
            sha256=hashlib.sha256(image_bytes()).hexdigest(), content=image_bytes(),
        )
        package = module.build_visual_package(
            SimpleNamespace(iterate_items=lambda: [], pages={1: object()}), "f" * 64,
            request_id="r1", chunks=[], fallback_assets=[artifact],
        )
        with zipfile.ZipFile(io.BytesIO(package)) as archive:
            manifest = __import__("json").loads(archive.read("manifest.json"))
            self.assertEqual([asset["source_item_ref"] for asset in manifest["visual_assets"]], ["#/pages/1"])
            self.assertEqual(hashlib.sha256(archive.read("assets/" + artifact.asset_key + ".png")).hexdigest(), artifact.sha256)

    def test_exports_figure_with_provenance_caption_hash_and_decodable_png(self):
        self.assertIsNotNone(module, "visual_asset_export module is not implemented")
        raw = image_bytes()
        bbox = SimpleNamespace(l=1, t=2, r=25, b=14, coord_origin=SimpleNamespace(value="TOPLEFT"))
        item = SimpleNamespace(
            label=SimpleNamespace(value="picture"), self_ref="#/pictures/0",
            prov=[SimpleNamespace(page_no=3, bbox=bbox)],
            caption_text=lambda _doc: "Figura 2 — ciclo da água",
            get_image=lambda _doc, prov_index=0: Image.open(io.BytesIO(raw)),
        )
        artifacts, warnings = module.export_visual_assets(
            SimpleNamespace(iterate_items=lambda: [(item, 0)]), "a" * 64,
        )
        self.assertEqual(warnings, [])
        self.assertEqual(len(artifacts), 1)
        asset = artifacts[0]
        self.assertEqual(asset.page_number, 3)
        self.assertEqual(asset.source_item_ref, "#/pictures/0")
        self.assertEqual(asset.reading_order, 0)
        self.assertEqual(asset.bbox, [1, 2, 25, 14])
        self.assertEqual(asset.caption, "Figura 2 — ciclo da água")
        self.assertEqual(asset.sha256, hashlib.sha256(asset.content).hexdigest())
        with Image.open(io.BytesIO(asset.content)) as decoded:
            self.assertEqual(decoded.size, (24, 12))

    def test_returns_empty_list_for_document_without_visual_items(self):
        self.assertIsNotNone(module, "visual_asset_export module is not implemented")
        artifacts, warnings = module.export_visual_assets(
            SimpleNamespace(iterate_items=lambda: []), "b" * 64,
        )
        self.assertEqual(artifacts, [])
        self.assertEqual(warnings, [])

    def test_missing_crop_is_reported_without_failing_text_extraction(self):
        self.assertIsNotNone(module, "visual_asset_export module is not implemented")
        item = SimpleNamespace(
            label=SimpleNamespace(value="picture"), self_ref="#/pictures/0",
            prov=[SimpleNamespace(page_no=1, bbox=None)],
            caption_text=lambda _doc: "Diagrama", get_image=lambda _doc, prov_index=0: None,
        )
        artifacts, warnings = module.export_visual_assets(
            SimpleNamespace(iterate_items=lambda: [(item, 0)]), "c" * 64,
        )
        self.assertEqual(artifacts, [])
        self.assertEqual(len(warnings), 1)
        self.assertEqual(warnings[0]["code"], "VISUAL_CROP_UNAVAILABLE")
        self.assertEqual(warnings[0]["source_item_ref"], "#/pictures/0")

    def test_package_manifest_and_asset_paths_are_v2_and_repeatable(self):
        self.assertIsNotNone(module, "visual_asset_export module is not implemented")
        raw = image_bytes("blue")
        item = SimpleNamespace(
            label="picture", self_ref="#/pictures/4",
            prov=[SimpleNamespace(page_no=2, bbox=[0, 0, 24, 12])],
            caption_text=lambda _doc: "Figura", get_image=lambda _doc, prov_index=0: Image.open(io.BytesIO(raw)),
        )
        document = SimpleNamespace(iterate_items=lambda: [(item, 0)], pages={1: object()})
        first = module.build_visual_package(document, "d" * 64, request_id="r1", chunks=[])
        second = module.build_visual_package(document, "d" * 64, request_id="r1", chunks=[])
        self.assertEqual(first, second)
        with zipfile.ZipFile(io.BytesIO(first)) as archive:
            manifest = __import__("json").loads(archive.read("manifest.json"))
            self.assertEqual(manifest["schema_version"], "doc-chunker/v2")
            self.assertEqual(len(manifest["visual_assets"]), 1)
            asset = manifest["visual_assets"][0]
            self.assertEqual(archive.namelist(), ["manifest.json", f"assets/{asset['asset_key']}.png"])
            self.assertEqual(hashlib.sha256(archive.read(f"assets/{asset['asset_key']}.png")).hexdigest(), asset["sha256"])


if __name__ == "__main__":
    unittest.main()
