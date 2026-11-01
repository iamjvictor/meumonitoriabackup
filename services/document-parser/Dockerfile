ARG UV_VERSION=0.10.9

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    UV_NO_CACHE=1 \
    HF_HOME=/opt/huggingface

WORKDIR /app

COPY --from=uv /uv /uvx /bin/

RUN apt-get update \
    && apt-get install -y --no-install-recommends libxcb1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project

COPY scripts ./scripts

RUN python -c "import ctypes; [ctypes.CDLL(name) for name in ('libxcb.so.1', 'libGL.so.1', 'libgthread-2.0.so.0')]; import docling; from docling.document_converter import DocumentConverter; print(docling.__version__); print(DocumentConverter)" \
    && python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('Qwen/Qwen3-Embedding-8B', revision='c90816d848505624c2434128dfc61132162a0ee9')" \
    && python scripts/preload_models.py

ENTRYPOINT ["python", "scripts/run_http_server.py"]
CMD ["--host", "0.0.0.0", "--port", "8080"]
