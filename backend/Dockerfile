FROM registry.access.redhat.com/hi/python:3.14-builder@sha256:e5e527e2b5ee838c52545c7bb24d504577320114c8e6850ba7713b68e05a0e74 AS builder

COPY --from=ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff /uv /uvx /usr/local/bin/

# Only the builder runs as root; the final image keeps the default non-root user
USER root
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev

# Then, use a final image without uv
FROM registry.access.redhat.com/hi/python:3.14@sha256:3521997789c9b812980f0fa15846949a7a7f6bfd959bf61202b5d83e25efecba

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=builder /app/.venv ./.venv
COPY pyproject.toml ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

ARG VERSION=dev
ENV REDOOST_VERSION=$VERSION
# The CLI wheel built by the same release, which redoost update checks against
ARG CLI_SHA256=
ENV REDOOST_CLI_SHA256=$CLI_SHA256

EXPOSE 8000
CMD ["python", "-m", "src.main"]
