from __future__ import annotations

import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

from scripts import benchmark_knowledge


class KnowledgeBenchmarkTests(unittest.TestCase):
    def test_preserves_condition_artifacts_and_writes_reviewable_metrics_privately(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pdf = root / "sample.pdf"
            pdf.write_bytes(b"%PDF-fixture")
            report_path = root / "benchmark.json"

            def fake_run_batch(request, _pdf, output_dir):
                output_dir.mkdir(parents=True, exist_ok=True)
                (output_dir / "document.md").write_text("Page preview", encoding="utf-8")
                (output_dir / "document.json").write_text("{}", encoding="utf-8")
                (output_dir / "layout.json").write_text("{}", encoding="utf-8")
                assets = output_dir / "assets"
                assets.mkdir()
                (assets / "figure.png").write_bytes(b"PNG")
                manifest = {
                    "status": "COMPLETED", "conversionStatus": "success",
                    "pages": [{"pageNumber": request["pageStart"], "status": "CONVERTED", "characterCount": 12, "layoutItemCount": 2, "imageCount": 1}],
                    "visualAssets": [{"asset_kind": "FIGURE"}],
                    "converterInitializationMs": 15, "conversionMs": 120, "peakRssBytes": 4096,
                }
                (output_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
                return {"manifest": manifest, "durationMs": 150}

            with patch.object(benchmark_knowledge, "run_batch", side_effect=fake_run_batch):
                report = benchmark_knowledge.run_benchmark(
                    pdf,
                    {"text": 1, "formula": 2, "table": 3, "image": 4, "scan": 5},
                    report_path,
                )

            artifact_root = root / "benchmark.json.artifacts"
            run_dir = root / report["artifactRunDirectory"]
            self.assertEqual(report["summary"]["conditionCount"], 20)
            self.assertEqual(report["summary"]["manualReviewsRequired"], 20)
            self.assertEqual(stat.S_IMODE(artifact_root.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(run_dir.stat().st_mode), 0o700)
            for condition in report["conditions"]:
                condition_dir = root / condition["artifactDirectory"]
                self.assertTrue((condition_dir / "document.md").is_file())
                self.assertTrue((condition_dir / "document.json").is_file())
                self.assertTrue((condition_dir / "layout.json").is_file())
                self.assertTrue((condition_dir / "assets/figure.png").is_file())
                review = root / condition["manualPdfComparison"]["reviewFile"]
                review_data = json.loads(review.read_text(encoding="utf-8"))
                self.assertEqual(review_data["status"], "not_reviewed")
                self.assertEqual(condition["metrics"]["convertedPages"], 1)
                self.assertGreater(condition["metrics"]["artifactBytes"], 0)
                self.assertNotIn("..", Path(condition["artifactDirectory"]).parts)
                self.assertEqual(stat.S_IMODE((condition_dir / "document.md").stat().st_mode), 0o600)
            self.assertTrue(report_path.is_file())
            self.assertEqual(stat.S_IMODE(report_path.stat().st_mode), 0o600)

    def test_refuses_symlinked_artifact_root_before_running_conditions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pdf = root / "sample.pdf"
            pdf.write_bytes(b"%PDF-fixture")
            outside = root / "outside"
            outside.mkdir()
            artifact_root = root / "benchmark.json.artifacts"
            artifact_root.symlink_to(outside, target_is_directory=True)
            with patch.object(benchmark_knowledge, "run_batch") as run_batch:
                with self.assertRaisesRegex(ValueError, "symlink"):
                    benchmark_knowledge.run_benchmark(
                        pdf,
                        {"text": 1, "formula": 2, "table": 3, "image": 4, "scan": 5},
                        root / "benchmark.json",
                    )
            run_batch.assert_not_called()
            self.assertEqual(list(outside.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
