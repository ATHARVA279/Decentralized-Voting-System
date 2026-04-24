# 🗳️ VoteChain — Decentralized Voting System

> A production-grade, microservices-based academic council voting platform built with **Angular 17**, **Rust (Axum)**, **PostgreSQL**, **Redis**, and deployed via **Kubernetes (Minikube)**.

[![CI](https://github.com/your-org/decentralized-voting/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/decentralized-voting/actions/workflows/ci.yml)
[![CD](https://github.com/your-org/decentralized-voting/actions/workflows/cd.yml/badge.svg)](https://github.com/your-org/decentralized-voting/actions/workflows/cd.yml)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Rust](https://img.shields.io/badge/rust-1.78%2B-orange.svg)
![Angular](https://img.shields.io/badge/angular-17-red.svg)

---

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   NGINX Ingress (K8s)                   │
│          Rate limiting · Path routing · WebSocket       │
└──────┬────────────────┬──────────────────┬──────────────┘
       │                │                  │
  ┌────▼────┐    ┌──────▼──────┐   ┌───────▼──────┐
  │ Auth    │    │  Election   │   │   Vote       │
  │ Service │    │  Service    │   │   Service    │
  │ :3001   │    │  :3002      │   │   :3003      │
  │ Rust    │    │  Rust/Axum  │   │  Rust+WS     │
  └────┬────┘    └──────┬──────┘   └───────┬──────┘
       └────────────────┴──────────────────┘
                         │
              ┌──────────▼──────────┐
              │    PostgreSQL 16    │
              │  (ACID · Immutable  │
              │   Audit Log · RLS)  │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │       Redis 7       │
              │  Sessions · Cache   │
              │  Rate Limit · Dedup │
              └─────────────────────┘
```

### Key Design Decisions

| Decision | Why |
|---|---|
| **Rust + Axum** | Zero-cost async, ~5MB binary, handles 100k+ concurrent connections per pod |
| **PostgreSQL append-only audit log** | Immutable by DB trigger — UPDATE/DELETE blocked at DB level, not just app level |
| **Redis deduplication** | Blocks duplicate votes in microseconds before any DB write |
| **Vote hash chain** | SHA-256 of `(prev_hash ‖ voter_id ‖ election_id ‖ timestamp)` — tamper-evident |
| **JWT (15min) + Refresh (7d)** | Short access tokens minimize replay window; refresh in httpOnly-pattern |
| **Angular 17 signals** | Reactive state without RxJS boilerplate for UI state management |
| **WebSocket for live results** | Tokio broadcast channel fans out vote updates to all watchers instantly |

---

## 📁 Project Structure

```
Decentralized-Voting-System/
├── frontend/                       # Angular 17 SPA
│   ├── src/app/
│   │   ├── core/                   # Services, guards, interceptors
│   │   │   ├── services/           # auth, election, vote services
│   │   │   ├── guards/             # auth, admin, guest guards
│   │   │   └── interceptors/       # JWT Bearer interceptor
│   │   ├── features/
│   │   │   ├── auth/               # Login, Register
│   │   │   ├── dashboard/          # Home dashboard
│   │   │   ├── elections/          # List, Detail, Create form
│   │   │   ├── voting/             # Ballot + Live Results
│   │   │   └── admin/              # Admin panel
│   │   └── shared/navbar/
│   ├── Dockerfile                  # Node build + NGINX runtime
│   └── nginx.conf                  # SPA routing + API proxy
│
├── backend/
│   ├── auth-service/               # JWT auth, Argon2id passwords, RBAC
│   ├── election-service/           # Election + Candidate CRUD
│   └── vote-service/               # Vote casting + WebSocket live results
│
├── database/
│   ├── migrations/                 # 001–005 SQL migrations (ordered)
│   └── seeds/                      # Dev seed data
│
├── k8s/                            # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmaps/
│   ├── secrets/
│   ├── postgres/
│   ├── redis/
│   ├── auth-service/               # Deployment + Service + HPA
│   ├── election-service/
│   ├── vote-service/
│   ├── frontend/
│   ├── ingress/
│   └── monitoring/                 # Prometheus + Grafana
│
├── .github/workflows/
│   ├── ci.yml                      # Build + Test + Lint
│   └── cd.yml                      # Docker Build + Push + K8s Deploy
│
├── docker-compose.yml              # Full local stack
└── README.md
```

---

## 🔐 Security Architecture

### Authentication Flow
```
Client ──POST /api/auth/login──▶ Auth Service
                                     │
                               Argon2id verify
                                     │
                         ┌───────────▼────────────┐
                         │  JWT access (15 min)   │
                         │  + Refresh token (7d)  │
                         └───────────┬────────────┘
                                     │
Client ◀─────────────────────────────┘
       (Bearer token in header for all subsequent requests)

Logout: JTI blacklisted in Redis until token expiry
```

### Double-Vote Prevention (Two-Layer Defense)
```
Vote Request
     │
     ▼
1. Redis check: EXISTS "voted:{user}:{election}"
     │ hit ──▶ Reject (409 Conflict)
     │ miss
     ▼
2. DB INSERT with UNIQUE(voter_id, election_id)
     │ dup key ──▶ Reject (409 Conflict)
     │ success
     ▼
3. Set Redis key with TTL
4. Write to immutable audit_log
5. Broadcast via WebSocket
```

### Immutable Audit Log
The `audit_log` table is protected by **database-level triggers** that raise exceptions on any `UPDATE` or `DELETE`. Each row contains a **SHA-256 hash chain** linking it to the previous entry — providing a verifiable, tamper-evident ledger.

---

## 🚀 Quickstart — Local (Docker Compose)

### Prerequisites
- Docker Desktop 24+
- Docker Compose v2

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/Decentralized-Voting-System.git
cd Decentralized-Voting-System

# 2. Start the app services (uses external `DATABASE_URL` from `.env`)
docker-compose up -d

# 3. Check all services are healthy
docker-compose ps

# 4. Access the application
open http://localhost          # Frontend
open http://localhost:9090     # Prometheus
open http://localhost:3100     # Grafana (admin / admin123)
```

### Service Ports (local)
| Service | URL |
|---|---|
| Frontend | http://localhost |
| Auth API | http://localhost:3001 |
| Election API | http://localhost:3002 |
| Vote API | http://localhost:3003 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3100 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## ☸️ Kubernetes Deployment (Minikube)

### Prerequisites
```bash
# Install Minikube
winget install Kubernetes.minikube      # Windows
brew install minikube                   # macOS

# Install kubectl
winget install Kubernetes.kubectl

# Start Minikube with enough resources
minikube start --cpus=4 --memory=4g --driver=docker

# Enable NGINX Ingress
minikube addons enable ingress
minikube addons enable metrics-server
```

### Build Images into Minikube
```bash
# Point Docker to Minikube's daemon (no push needed)
eval $(minikube docker-env)          # macOS/Linux
minikube docker-env | Invoke-Expression   # Windows PowerShell

# Build all images
docker build -t voting/auth-service:latest     ./backend/auth-service
docker build -t voting/election-service:latest ./backend/election-service
docker build -t voting/vote-service:latest     ./backend/vote-service
docker build -t voting/frontend:latest         ./frontend
```

### Deploy
```bash
# 1. Namespace + config
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmaps/
kubectl apply -f k8s/secrets/

# 2. Infrastructure (wait for postgres to be healthy before services)
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl wait --for=condition=ready pod -l app=postgres -n voting-system --timeout=120s

# 3. Backend services
kubectl apply -f k8s/auth-service/
kubectl apply -f k8s/election-service/
kubectl apply -f k8s/vote-service/

# 4. Frontend + Ingress
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress/

# 5. Monitoring (optional)
kubectl apply -f k8s/monitoring/

# 6. Check rollout
kubectl rollout status deployment/auth-service -n voting-system
kubectl get pods -n voting-system
```

### Access the App via Minikube
```bash
# Get Minikube IP
minikube ip    # e.g. 192.168.49.2

# Add to hosts file (run as Administrator on Windows)
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/macOS: /etc/hosts
192.168.49.2   voting.local

# Open in browser
open http://voting.local
```

### Useful K8s Commands
```bash
# View all resources
kubectl get all -n voting-system

# Tail logs from a service
kubectl logs -f deploy/vote-service -n voting-system

# Scale vote service for an election event
kubectl scale deployment vote-service --replicas=5 -n voting-system

# Port-forward Grafana for local access
kubectl port-forward svc/grafana-service 3000:3000 -n voting-system

# Rollback a deployment
kubectl rollout undo deployment/vote-service -n voting-system

# Check HPA status
kubectl get hpa -n voting-system
```

---

## 🗄️ Database Schema

```
users
├── id (UUID PK)
├── email (UNIQUE)
├── password_hash (Argon2id)
├── full_name, student_id, department
├── role: student | admin | observer
└── is_active, email_verified, created_at, updated_at

elections
├── id (UUID PK)
├── title, description
├── start_time, end_time
├── status: draft | upcoming | active | completed | cancelled
└── created_by (FK → users)

candidates
├── id (UUID PK)
├── election_id (FK → elections, CASCADE DELETE)
├── name, manifesto, photo_url, department, position
└── created_at

votes  ← IMMUTABLE (no UPDATE/DELETE)
├── id (UUID PK)
├── election_id, voter_id, candidate_id (FK)
├── voted_at, vote_hash (SHA-256, UNIQUE)
└── UNIQUE(voter_id, election_id)  ← Database-level double-vote prevention

audit_log  ← APPEND-ONLY (DB trigger blocks UPDATE/DELETE)
├── id (BIGSERIAL — sequential ordering proof)
├── action (ENUM), actor_id, resource_type, resource_id
├── metadata (JSONB), ip_address
├── row_hash (SHA-256 hash chain)
└── logged_at
```

---

## 🔌 API Reference

### Auth Service (`/api/auth`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | ❌ | Register new user |
| `POST` | `/login` | ❌ | Login → JWT tokens |
| `POST` | `/refresh` | ❌ | Refresh access token |
| `POST` | `/logout` | ✅ | Blacklist token |
| `GET` | `/me` | ✅ | Current user profile |

### Election Service (`/api/elections`)
| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| `GET` | `/` | ✅ | Any | List elections |
| `POST` | `/` | ✅ | Admin | Create election |
| `GET` | `/:id` | ✅ | Any | Get election |
| `PUT` | `/:id` | ✅ | Admin | Update election |
| `DELETE` | `/:id` | ✅ | Admin | Delete draft election |
| `GET` | `/:id/candidates` | ✅ | Any | List candidates |
| `POST` | `/:id/candidates` | ✅ | Admin | Add candidate |
| `GET` | `/:id/results` | ✅ | Any | Get results |
| `GET` | `/:id/participation` | ✅ | Any | Participation stats |

### Vote Service (`/api/votes`)
| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| `POST` | `/cast` | ✅ | Student | Cast vote |
| `GET` | `/status/:election_id` | ✅ | Any | Has user voted? |
| `GET` | `/audit/:election_id` | ✅ | Admin | Audit trail |
| `WS` | `/live/:election_id` | ✅ | Any | Live vote counts |

---

## ⚙️ CI/CD Pipeline

```
Push to main
     │
     ├── CI (parallel)
     │   ├── Test auth-service    (Rust + real Postgres + Redis)
     │   ├── Test election-service
     │   ├── Test vote-service
     │   ├── Build Angular (prod)
     │   └── Validate K8s manifests (kubeval)
     │
     └── CD (on CI pass)
         ├── Build Docker images (matrix: 4 services)
         ├── Push to GHCR (tagged: branch, semver, git-sha)
         ├── kubectl set image (rolling update)
         ├── Wait for rollout status
         └── Auto-rollback on failure
```

---

## 📊 Observability

| Tool | URL (local) | Purpose |
|---|---|---|
| **Prometheus** | :9090 | Metrics scraping + alerting |
| **Grafana** | :3100 | Dashboards (admin/admin123) |

**Key metrics:**
- `http_requests_total` — request rate per service
- `http_request_duration_seconds` — latency percentiles
- `votes_cast_total` — real-time vote count
- Kubernetes pod CPU/memory via metrics-server

---

## 🛡️ Rate Limiting

Configured at NGINX Ingress level:
- Global: **20 requests/second** per IP
- Vote endpoint: additional Redis token-bucket (`lua-resty-limit`)
- WebSocket connections: timeout 1 hour, max connections per IP: 10

---

## 🧑‍💻 Development

### Running individual services locally
```bash
# Auth service
cd backend/auth-service
DATABASE_URL=postgres://YOUR_SUPABASE_DB_USER:YOUR_SUPABASE_DB_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=local_dev_secret_at_least_32_characters \
cargo run

# Frontend dev server (hot reload)
cd frontend
npm install
npm start      # http://localhost:4200
```

### Running tests
```bash
cd backend/auth-service && cargo test
cd backend/election-service && cargo test
cd backend/vote-service && cargo test
cd frontend && npm test
```

---

## 📝 License

MIT © 2024 — Built with ❤️ using Rust, Angular, and Kubernetes.
