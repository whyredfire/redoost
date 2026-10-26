FROM registry.access.redhat.com/hi/python:3.14-builder@sha256:e5e527e2b5ee838c52545c7bb24d504577320114c8e6850ba7713b68e05a0e74 AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.18@sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc /uv /uvx /usr/local/bin/

# Only the builder runs as root; the final image keeps the default non-root user
USER root
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev
RUN mkdir data

# Then, use a final image without uv
FROM registry.access.redhat.com/hi/python:3.14@sha256:3521997789c9b812980f0fa15846949a7a7f6bfd959bf61202b5d83e25efecba

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=builder /app/.venv ./.venv
COPY --from=builder --chown=65532:0 /app/data ./data
COPY pyproject.toml ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

ARG VERSION=dev
ENV REDOOST_VERSION=$VERSION

EXPOSE 8000
CMD ["python", "-m", "src.main"]
