# VoteChain — Developer Makefile
# Usage: make <target>
# Windows users: install make via `winget install GnuWin32.Make` or use Git Bash

.PHONY: help up down build test lint k8s-deploy k8s-teardown logs clean

# ── Default target ─────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  VoteChain Makefile"
	@echo "  ──────────────────────────────────────────────"
	@echo "  make up           Start full stack (docker-compose)"
	@echo "  make down         Stop and remove containers"
	@echo "  make build        Build all Docker images"
	@echo "  make test         Run all backend + frontend tests"
	@echo "  make lint         Run Clippy + Angular ESLint"
	@echo "  make logs         Tail all service logs"
	@echo "  make clean        Remove build artifacts"
	@echo ""
	@echo "  K8s (Minikube):"
	@echo "  make k8s-up       Start Minikube cluster"
	@echo "  make k8s-build    Build images into Minikube"
	@echo "  make k8s-deploy   Apply all K8s manifests"
	@echo "  make k8s-status   Show all pod/service status"
	@echo "  make k8s-teardown Delete all K8s resources"
	@echo "  make k8s-logs     Tail logs for a service (svc=auth-service)"
	@echo ""

# ── Docker Compose ─────────────────────────────────────────────────────────────
up:
	docker-compose up -d
	@echo "✅  Stack running. Open http://localhost"

down:
	docker-compose down

build:
	docker-compose build --parallel

logs:
	docker-compose logs -f --tail=50

restart:
	docker-compose restart

# Individual service logs
logs-%:
	docker-compose logs -f $*

# ── Testing ────────────────────────────────────────────────────────────────────
test: test-auth test-election test-vote test-frontend

test-auth:
	@echo "🧪 Testing auth-service..."
	cd backend/auth-service && cargo test

test-election:
	@echo "🧪 Testing election-service..."
	cd backend/election-service && cargo test

test-vote:
	@echo "🧪 Testing vote-service..."
	cd backend/vote-service && cargo test

test-frontend:
	@echo "🧪 Testing frontend..."
	cd frontend && npm test -- --watch=false --browsers=ChromeHeadless

# ── Linting ────────────────────────────────────────────────────────────────────
lint: lint-rust lint-frontend

lint-rust:
	cd backend/auth-service     && cargo clippy -- -D warnings
	cd backend/election-service && cargo clippy -- -D warnings
	cd backend/vote-service     && cargo clippy -- -D warnings

lint-frontend:
	cd frontend && npm run lint

fmt:
	cd backend/auth-service     && cargo fmt
	cd backend/election-service && cargo fmt
	cd backend/vote-service     && cargo fmt

# ── Kubernetes (Minikube) ──────────────────────────────────────────────────────
k8s-up:
	minikube start --cpus=4 --memory=4g --driver=docker
	minikube addons enable ingress
	minikube addons enable metrics-server
	@echo "✅  Minikube running. IP: $$(minikube ip)"
	@echo "    Add to /etc/hosts:  $$(minikube ip)  voting.local"

k8s-build:
	@echo "🐳 Building images into Minikube daemon..."
	eval $$(minikube docker-env) && \
	  docker build -t voting/auth-service:latest     -f ./backend/auth-service/Dockerfile ./backend && \
	  docker build -t voting/election-service:latest -f ./backend/election-service/Dockerfile ./backend && \
	  docker build -t voting/vote-service:latest     -f ./backend/vote-service/Dockerfile ./backend && \
	  docker build -t voting/frontend:latest         ./frontend
	@echo "✅  Images built"

k8s-deploy:
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmaps/
	kubectl apply -f k8s/secrets/
	kubectl apply -f k8s/postgres/
	kubectl apply -f k8s/redis/
	@echo "⏳  Waiting for postgres..."
	kubectl wait --for=condition=ready pod -l app=postgres -n voting-system --timeout=120s
	kubectl apply -f k8s/auth-service/
	kubectl apply -f k8s/election-service/
	kubectl apply -f k8s/vote-service/
	kubectl apply -f k8s/frontend/
	kubectl apply -f k8s/ingress/
	@echo "✅  Deployed. Open http://voting.local"

k8s-status:
	kubectl output pods,svc,ingress,hpa -n voting-system

k8s-logs:
	kubectl logs -f deploy/$(svc) -n voting-system

k8s-teardown:
	kubectl delete namespace voting-system --ignore-not-found
	@echo "✅  All K8s resources deleted"

k8s-rollback:
	kubectl rollout undo deployment/auth-service     -n voting-system
	kubectl rollout undo deployment/election-service -n voting-system
	kubectl rollout undo deployment/vote-service     -n voting-system
	kubectl rollout undo deployment/frontend         -n voting-system

# ── Cleanup ────────────────────────────────────────────────────────────────────
clean:
	cd backend/auth-service     && cargo clean
	cd backend/election-service && cargo clean
	cd backend/vote-service     && cargo clean
	rm -rf frontend/dist frontend/.angular
	@echo "✅  Build artifacts removed"

# ── Database ───────────────────────────────────────────────────────────────────
db-shell:
	docker-compose exec postgres psql -U postgres -d voting_db

db-seed:
	docker-compose exec -T postgres psql -U postgres -d voting_db < database/seeds/001_seed_data.sql
	@echo "✅  Seed data loaded"

db-reset:
	docker-compose down -v
	docker-compose up -d postgres
	@echo "✅  Database reset"
