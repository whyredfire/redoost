FROM rust:1.100-slim-trixie@sha256:3b199fd6db7d709274df56565b8f4003f9e30d7bfcff9d53148c86053b7855e2 AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends musl-tools ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add "$(uname -m)-unknown-linux-musl"

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
RUN mkdir src \
    && echo "fn main() {}" > src/main.rs \
    && touch src/lib.rs \
    && cargo build --release --locked --target "$(uname -m)-unknown-linux-musl" \
    && rm -rf src

COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs src/lib.rs \
    && cargo build --release --locked --target "$(uname -m)-unknown-linux-musl" \
    && cp "target/$(uname -m)-unknown-linux-musl/release/redoost-api" /redoost-api

FROM scratch

# The S3 client and OIDC sign-in check TLS certificates against the system's
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /redoost-api /usr/local/bin/redoost-api

ARG VERSION=dev
ENV REDOOST_VERSION=$VERSION
# The CLI wheel built by the same release, which redoost update checks against
ARG CLI_SHA256=
ENV REDOOST_CLI_SHA256=$CLI_SHA256

USER 65532:65532
EXPOSE 8000
CMD ["redoost-api", "serve"]
