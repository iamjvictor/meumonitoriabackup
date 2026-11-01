"""Regression test for the exact Docling dependency contract."""

from __future__ import annotations

import tomllib
import unittest
from pathlib import Path


PYPROJECT_PATH = Path(__file__).resolve().parents[1] / "pyproject.toml"
DOCKERFILE_PATH = Path(__file__).resolve().parents[1] / "Dockerfile"


class ParserDependencyTests(unittest.TestCase):
    def test_docling_is_declared_at_the_resolved_stable_version_without_mineru_stack(self) -> None:
        project = tomllib.loads(PYPROJECT_PATH.read_text(encoding="utf-8"))
        dependencies = set(project["project"]["dependencies"])

        self.assertIn("docling==2.122.0", dependencies)
        self.assertIn("pypdfium2==5.10.1", dependencies)
        self.assertFalse(any(dependency.startswith("mineru") for dependency in dependencies))
        self.assertFalse(any(dependency.startswith("torch") for dependency in dependencies))

    def test_dockerfile_uses_pinned_uv_and_the_resolved_lockfile(self) -> None:
        dockerfile = DOCKERFILE_PATH.read_text(encoding="utf-8")

        self.assertIn("ARG UV_VERSION=0.10.9", dockerfile)
        self.assertIn("COPY --from=uv /uv /uvx /bin/", dockerfile)
        self.assertIn("COPY pyproject.toml uv.lock README.md ./", dockerfile)
        self.assertIn("uv sync --locked", dockerfile)
        self.assertIn(
            "import docling; from docling.document_converter import DocumentConverter;",
            dockerfile,
        )


if __name__ == "__main__":
    unittest.main()
