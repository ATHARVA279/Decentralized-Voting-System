# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ──────────────────────────────────────────────────────────────────────────────
FROM rust:slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    musl-tools \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add x86_64-unknown-linux-musl

COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release --target x86_64-unknown-linux-musl 2>/dev/null || true
RUN rm -rf src

COPY src ./src
RUN touch src/main.rs
RUN cargo build --release --target x86_64-unknown-linux-musl

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime
# ──────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/vote-service /app/vote-service

RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN useradd -m nonroot
USER nonroot:nonroot

EXPOSE 3003

ENTRYPOINT ["/app/vote-service"]
