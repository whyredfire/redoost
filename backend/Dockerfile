FROM registry.access.redhat.com/hi/python:3.14-builder@sha256:cf2995050c92438fad912a5c93d11a54d73941417732cf7ed26bc575de8d9396 AS builder

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
FROM registry.access.redhat.com/hi/python:3.14@sha256:4a27bfdbed2dbefc91bac3dc3ca08ff04d8c036f90729f46fadad267f6b0b8ae

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
