FROM registry.access.redhat.com/hi/python:3.14-builder@sha256:5fe8aa9537fa42d05654ca8acdf48a55328956e448c1e7dc0ec3b3e79f0422e2 AS builder

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
FROM registry.access.redhat.com/hi/python:3.14@sha256:692555eb909fda7bbb8876fd80342a13721ab10abe39ecc53fecfd9d77eea947

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

EXPOSE 8000
CMD ["python", "-m", "src.main"]
