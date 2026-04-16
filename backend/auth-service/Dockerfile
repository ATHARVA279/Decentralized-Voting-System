# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Build — full Rust toolchain with musl for static linking
# ──────────────────────────────────────────────────────────────────────────────
FROM rust:slim AS builder

WORKDIR /app

# Install musl tools for fully static binary (smaller final image)
RUN apt-get update && apt-get install -y \
    musl-tools \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Add musl target
RUN rustup target add x86_64-unknown-linux-musl

# Cache dependency layer — copy manifests first
COPY Cargo.toml Cargo.lock* ./

# Create a dummy main to cache dependencies separately
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release --target x86_64-unknown-linux-musl 2>/dev/null || true
RUN rm -rf src

# Copy real source and build
COPY src ./src
RUN touch src/main.rs  # Force rebuild of our code
RUN cargo build --release --target x86_64-unknown-linux-musl

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime — distroless/scratch for minimal attack surface
# ──────────────────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

WORKDIR /app

# Copy the static binary
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/auth-service /app/auth-service

RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN useradd -m nonroot
USER nonroot:nonroot

EXPOSE 3001

# Health check for local Docker usage
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/app/auth-service", "--health-check"] || exit 1

ENTRYPOINT ["/app/auth-service"]
