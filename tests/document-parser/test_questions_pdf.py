"""Audit the real QUESTIONS PDF with the production PDF.js/block/chunk path."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PDF = Path(__file__).with_name("questionsQuimica.pdf")
RESULT = Path(__file__).parent / "results/questionsQuimica.pdfjs-after.json"
EXPECTED = [f"{number:02d}" for number in range(1, 11)]


class QuestionsPdfTest(unittest.TestCase):
    def test_all_ten_exam_questions_reach_chunks(self) -> None:
        process = subprocess.run(
            ["npm", "run", "test:questions-parser", "--", str(PDF), str(RESULT),
             "--source=pdfjs", f"--expect-numbers={','.join(EXPECTED)}"],
            cwd=ROOT / "backend",
            capture_output=True,
            text=True,
        )
        self.assertEqual(process.returncode, 0, process.stderr or process.stdout)
        report = json.loads(RESULT.read_text(encoding="utf-8"))
        self.assertEqual(report["summary"]["questionBlocks"], 10)
        self.assertEqual(report["summary"]["questionBlocksWithChunks"], 10)
        exam = [block for block in report["questionBlocks"] if (block.get("pageStart") or 0) >= 3]
        self.assertEqual([block["questionNumber"] for block in exam], EXPECTED)
        self.assertEqual([block["pageStart"] for block in exam], list(range(3, 13)))
        self.assertTrue(all(len(block["chunkIndexes"]) == 1 and block["chunkCoverageExact"] for block in exam))
        self.assertEqual(report["summary"]["missingNumbers"], [])
        self.assertEqual(report["summary"]["missingCandidateNumbers"], [])
        candidates = [candidate for candidate in report["candidates"] if candidate.get("questionNumber")]
        self.assertEqual([candidate["questionNumber"] for candidate in candidates], EXPECTED)
        self.assertEqual(report["summary"]["deterministicCandidates"], 10)
        self.assertEqual(next(candidate for candidate in candidates if candidate["questionNumber"] == "08")["alternatives"], [])
        self.assertTrue(all("Vestibular Estadual 2026 Exame Discursivo" not in candidate["statement"] for candidate in candidates))
        readiness = report["candidateReadiness"]
        self.assertEqual([item["questionNumber"] for item in readiness], EXPECTED)
        pending_visual = [item for item in readiness if item["candidateStatus"] == "VISUAL_PENDING"]
        self.assertEqual([item["questionNumber"] for item in pending_visual], ["01"])
        self.assertTrue(all(item["candidateStatus"] == "READY_FOR_COMPLETION" and not item["completionBlocked"]
                            for item in readiness if item["questionNumber"] != "01"))
        print(json.dumps({"question_blocks": len(exam), "chunks": len(exam),
                          "missing_candidates": report["summary"]["missingCandidateNumbers"],
                          "visual_pending": [item["questionNumber"] for item in pending_visual]}))


if __name__ == "__main__":
    unittest.main()
