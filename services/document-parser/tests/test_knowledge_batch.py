from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

from scripts.knowledge_batch_manifest import package_checksum, sha256_bytes
from scripts.knowledge_batch_runner import _conversion_child, _profile, _terminate_group, run_batch
from scripts.knowledge_profile import KnowledgeProfile


class KnowledgeProfileTests(unittest.TestCase):
    def test_json_integer_round_trip_produces_worker_compatible_digest(self):
        profile = KnowledgeProfile(ocr_scale=3, images_scale=1, document_timeout_seconds=540, batch_timeout_seconds=600)
        self.assertEqual(profile.digest(), KnowledgeProfile().digest())
        self.assertEqual(profile.digest(), '7aeb530ea42649d75fed380eea701fb7b5a7102cfd2e925faf02f9355fcd966d')

    def test_defaults_keep_existing_quality_settings_and_bounds(self):
        profile = KnowledgeProfile()
        self.assertTrue(profile.do_ocr)
        self.assertTrue(profile.do_formula_enrichment)
        self.assertEqual(profile.ocr_scale, 3.0)
        self.assertEqual(profile.images_scale, 1.0)
        self.assertEqual(profile.batch_pages, 10)
        with self.assertRaises(ValueError):
            KnowledgeProfile(batch_pages=21)
        with self.assertRaises(ValueError):
            KnowledgeProfile(document_timeout_seconds=600, batch_timeout_seconds=600)

    def test_profile_rejects_unknown_fields(self):
        with self.assertRaisesRegex(ValueError, "desconhecidos"):
            _profile({"batch_pages": 10, "silent_disable_quality": True})


class KnowledgeBatchContractTests(unittest.TestCase):
    def test_rejects_hash_that_does_not_match_effective_profile(self):
        request = self.request()
        request["configurationHash"] = "b" * 64
        with self.assertRaisesRegex(ValueError, "perfil efetivo"):
            run_batch(request, Path("/arquivo-ausente.pdf"), Path("/saida-inexistente"))

    def request(self):
        return {
            "documentId": "00000000-0000-4000-8000-000000000001",
            "runId": "00000000-0000-4000-8000-000000000002",
            "contentHash": "a" * 64,
            "configurationHash": KnowledgeProfile().digest(),
            "pageStart": 351,
            "pageEnd": 354,
            "profile": {"batch_pages": 10},
        }

    def test_interval_limits_and_input_validation_happen_before_process_start(self):
        request = self.request()
        with self.assertRaisesRegex(ValueError, "até"):
            run_batch({**request, "pageEnd": 371}, Path("unused"), Path("unused"))
        with self.assertRaisesRegex(ValueError, "UUID"):
            run_batch({**request, "runId": "bad"}, Path("unused"), Path("unused"))
        with self.assertRaisesRegex(ValueError, "ausente"):
            run_batch(request, Path("missing.pdf"), Path("unused"))

    def test_artifact_package_hash_uses_client_canonical_order(self):
        payload = b"# lote"
        files = [{"path": "document.md", "sha256": sha256_bytes(payload), "contentBase64": "IyBsb3Rl"}]
        expected = hashlib.sha256(json.dumps(files, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        self.assertEqual(package_checksum(files), expected)

    def test_watchdog_terminates_the_process_group(self):
        process = subprocess.Popen(["sleep", "10"], start_new_session=True)
        _terminate_group(process)
        self.assertIsNotNone(process.poll())

    def test_conversion_child_preserves_absolute_pages_and_fails_empty_page_despite_raster(self):
        class Provenance:
            def __init__(self, page_no):
                self.page_no = page_no
                self.bbox = None

        class Item:
            label = "text"
            text = "Conteúdo convertido"
            prov = [Provenance(351)]

        class Document:
            def iterate_items(self):
                return iter([(Item(), 0)])

            def export_to_markdown(self):
                return "Conteúdo convertido"

            def export_to_dict(self):
                return {"schema_name": "DoclingDocument", "name": "fixture", "body": {}}

        class Converter:
            def convert(self, input_path, *, raises_on_error, page_range):
                self.page_range = page_range
                return SimpleNamespace(status=SimpleNamespace(value="success"), errors=[], document=Document())

        converter = Converter()
        fake_run_mineru = ModuleType("run_mineru")
        from scripts import run_mineru as real_run_mineru
        fake_run_mineru.get_document_converter = lambda **_kwargs: converter
        fake_run_mineru.normalize_content_list = real_run_mineru.normalize_content_list

        raster_asset = SimpleNamespace(
            page_number=352,
            asset_key="raster-only-page-352",
            content=b"png fixture",
            manifest_entry=lambda: {"asset_key": "raster-only-page-352", "page_number": 352, "asset_kind": "PAGE"},
        )
        fake_assets = ModuleType("visual_asset_export")
        fake_assets.export_visual_assets = lambda *_args: ([], [])
        fake_assets.export_scanned_page_assets = lambda *_args, **_kwargs: ([raster_asset], [])

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "fixture.pdf"
            source.write_bytes(b"%PDF-fixture")
            request_path = root / "request.json"
            request_path.write_text(json.dumps({
                **self.request(), "pageStart": 351, "pageEnd": 352,
            }), encoding="utf-8")
            output = root / "out"
            with patch.dict(sys.modules, {"run_mineru": fake_run_mineru, "visual_asset_export": fake_assets}):
                self.assertEqual(_conversion_child(source, request_path, output), 0)
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))

        self.assertEqual(converter.page_range, (351, 352))
        self.assertEqual([page["pageNumber"] for page in manifest["pages"]], [351, 352])
        self.assertEqual([page["status"] for page in manifest["pages"]], ["CONVERTED", "FAILED"])
        self.assertEqual(manifest["pages"][1]["imageCount"], 1)
        self.assertIn("raster sozinho", manifest["pages"][1]["errors"][0])
        self.assertEqual(manifest["status"], "PARTIAL")


if __name__ == "__main__":
    unittest.main()
