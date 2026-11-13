"""Versioned, validated settings for bounded knowledge-book conversion."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
import os


@dataclass(frozen=True, slots=True)
class KnowledgeProfile:
    version: str = "knowledge-v1"
    do_ocr: bool = True
    do_formula_enrichment: bool = True
    do_table_structure: bool = True
    ocr_scale: float = 3.0
    images_scale: float = 1.0
    num_threads: int = 4
    batch_pages: int = 10
    document_timeout_seconds: float = 540.0
    batch_timeout_seconds: float = 600.0

    def __post_init__(self) -> None:
        for name in ("ocr_scale", "images_scale", "document_timeout_seconds", "batch_timeout_seconds"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{name} precisa ser número")
            object.__setattr__(self, name, float(value))
        if not isinstance(self.version, str) or not self.version.strip():
            raise ValueError("Perfil precisa de versão")
        if any(not isinstance(value, bool) for value in (self.do_ocr, self.do_formula_enrichment, self.do_table_structure)):
            raise ValueError("Flags do perfil precisam ser booleanas")
        if not isinstance(self.batch_pages, int) or isinstance(self.batch_pages, bool) or not 1 <= self.batch_pages <= 20:
            raise ValueError("Perfil precisa de versão e batch_pages entre 1 e 20")
        if not isinstance(self.num_threads, int) or isinstance(self.num_threads, bool) or not 1 <= self.num_threads <= 64:
            raise ValueError("num_threads precisa estar entre 1 e 64")
        if any(not math.isfinite(value) or value <= 0 or value > 8 for value in (self.ocr_scale, self.images_scale)):
            raise ValueError("Escalas precisam ser maiores que zero e no máximo 8")
        if any(not math.isfinite(value) or value <= 0 or value > 7200 for value in (self.document_timeout_seconds, self.batch_timeout_seconds)) or self.batch_timeout_seconds <= self.document_timeout_seconds:
            raise ValueError("Timeout externo deve exceder document_timeout")

    @classmethod
    def from_env(cls) -> "KnowledgeProfile":
        def env_bool(name: str, default: str) -> bool:
            value = os.getenv(name, default).lower()
            if value not in {"true", "false"}:
                raise ValueError(f"{name} precisa ser true ou false")
            return value == "true"

        return cls(
            version=os.getenv("KNOWLEDGE_PROFILE_VERSION", "knowledge-v1"),
            do_ocr=env_bool("KNOWLEDGE_DO_OCR", "true"),
            do_formula_enrichment=env_bool("KNOWLEDGE_FORMULA_ENRICHMENT", "true"),
            do_table_structure=env_bool("KNOWLEDGE_TABLE_STRUCTURE", "true"),
            ocr_scale=float(os.getenv("KNOWLEDGE_OCR_SCALE", "3.0")),
            images_scale=float(os.getenv("KNOWLEDGE_IMAGES_SCALE", "1.0")),
            num_threads=int(os.getenv("KNOWLEDGE_NUM_THREADS", "4")),
            batch_pages=int(os.getenv("KNOWLEDGE_BATCH_PAGES", "10")),
            document_timeout_seconds=float(os.getenv("KNOWLEDGE_DOC_TIMEOUT_SECONDS", "540")),
            batch_timeout_seconds=float(os.getenv("KNOWLEDGE_BATCH_TIMEOUT_SECONDS", "600")),
        )

    def digest(self) -> str:
        effective = asdict(self)
        # The external watchdog is an operational ceiling, not a conversion
        # setting; changing it must not invalidate an already verified batch.
        effective.pop("batch_timeout_seconds")
        return hashlib.sha256(json.dumps(effective, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def build_pipeline_options(profile: KnowledgeProfile):
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.accelerator_options import AcceleratorOptions

    options = PdfPipelineOptions(
        do_ocr=profile.do_ocr,
        force_backend_text=not profile.do_ocr,
        do_formula_enrichment=profile.do_formula_enrichment,
        do_table_structure=profile.do_table_structure,
        generate_picture_images=True,
        images_scale=profile.images_scale,
        document_timeout=profile.document_timeout_seconds,
        accelerator_options=AcceleratorOptions(num_threads=profile.num_threads),
    )
    options.ocr_options.scale = profile.ocr_scale
    return options
