#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup.sh — One-shot local development setup script
# Usage: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  VoteChain — Local Development Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ── 1. Check prerequisites ─────────────────────────────────────────────────
echo -e "\n${YELLOW}[1/5] Checking prerequisites...${NC}"

command -v docker   > /dev/null || { echo "❌ Docker not found. Install from https://docs.docker.com/get-docker/"; exit 1; }
command -v cargo    > /dev/null || { echo "❌ Rust not found. Install from https://rustup.rs/"; exit 1; }
command -v node     > /dev/null || { echo "❌ Node.js not found. Install from https://nodejs.org/"; exit 1; }

echo "✅ Docker: $(docker --version)"
echo "✅ Rust:   $(rustc --version)"
echo "✅ Node:   $(node --version)"

# ── 2. Setup environment ───────────────────────────────────────────────────
echo -e "\n${YELLOW}[2/5] Setting up environment...${NC}"

if [ ! -f .env ]; then
    cp .env.example .env
    # Auto-generate JWT secret
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
    sed -i.bak "s/CHANGE_ME_GENERATE_WITH_OPENSSL_RAND_HEX_32/$JWT_SECRET/" .env
    rm -f .env.bak
    echo "✅ .env created with auto-generated JWT_SECRET"
else
    echo "ℹ️  .env already exists — skipping"
fi

# ── 3. Start infrastructure ────────────────────────────────────────────────
echo -e "\n${YELLOW}[3/5] Starting Redis...${NC}"

docker-compose up -d redis
echo "✅ Redis ready"

# ── 4. Install frontend dependencies ──────────────────────────────────────
echo -e "\n${YELLOW}[4/5] Installing Angular dependencies...${NC}"
(cd frontend && npm install --silent)
echo "✅ Frontend dependencies installed"

# ── 5. Summary ────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}[5/5] Setup complete!${NC}"
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Next steps:${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Option A — Full Docker stack:"
echo "    docker-compose up -d"
echo "    open http://localhost"
echo ""
echo "  Option B — Local dev (hot reload):"
echo "    Terminal 1: cd backend/auth-service && cargo run"
echo "    Terminal 2: cd backend/election-service && cargo run"
echo "    Terminal 3: cd backend/vote-service && cargo run"
echo "    Terminal 4: cd frontend && npm start"
echo "    open http://localhost:4200"
echo ""
echo "  Option C — Kubernetes (Minikube):"
echo "    See README.md → Kubernetes Deployment section"
echo ""
