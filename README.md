# Defect Tracking Tool

A full-stack defect tracking application with AI-powered recommendations, ML analytics, and production-ready security and observability.

**Repository:** [github.com/subramaniyam22/defect-tracking-tool](https://github.com/subramaniyam22/defect-tracking-tool)

## Features

### Core Functionality
- **Defect Management**: Create, update, track, and manage software defects with filters and audit history
- **Defect Import**: Bulk import defects from Excel with pattern analysis and suggestions
- **PMC Management**: Organize defects by Project Management Company (PMC), with locations and auto-suggestions
- **User Management**: Admin CRUD, four roles (`ADMIN`, `PROJECT_MANAGER`, `QC`, `WIS`), assignee lists, and activity views
- **Comments & Global Chat**: Per-defect comments plus global chat with read/unread tracking
- **Attachments**: Upload and download files with presigned URLs and upload confirmation
- **QC Parameters**: Dynamic quality control parameters by phase (Staging, Pre-Live, Post-Live)
- **Audit Trail**: Complete history of changes to defects

### AI & ML Features
- **AI Recommendations**: Root cause analysis, remediation steps, and prevention checklists (Ollama or Azure OpenAI)
- **AI Suggestions**: Admin and personal suggestion endpoints
- **ML Insights**: Reopen rate, mean time to fix, status/priority/project distributions, and TF-IDF + K-Means clustering
- **ML Service**: Optional FastAPI worker with scheduled nightly insight generation

### Analytics & Reporting
- **Dashboard**: KPI metrics and interactive charts (`/dashboard`)
- **Filtering**: Date range, project, assignee, phase, status, type, and more
- **Insights Page**: Global and user-specific ML insights
- **My Work**: Personal view of assigned defects and activity

### Security
- **JWT Authentication**: Access and refresh tokens with Redis-backed sessions (Redis optional locally)
- **Role-Based Access Control**: ADMIN, PROJECT_MANAGER, QC, and WIS roles
- **Rate Limiting**: 100 requests per minute (global)
- **CSRF Protection**: Cross-site request forgery protection on mutating requests
- **AV Scanning**: Antivirus scanning for uploads (stub, configurable)
- **Input Validation**: class-validator (backend) and Zod (frontend)

### Observability
- **Health Checks**: `/health`, `/health/liveness`, `/health/readiness`
- **Metrics**: Prometheus-compatible endpoint at `/metrics`
- **OpenTelemetry**: Optional distributed tracing (`ENABLE_TELEMETRY=true`)
- **Swagger API Docs**: Interactive docs at `/api` (non-production only)

## Tech Stack

| Layer | Technologies |
|-------|----------------|
| **Backend** | NestJS 10, PostgreSQL, Prisma 5, Redis (optional), JWT + Argon2, Swagger |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, ECharts, Axios, Zod |
| **ML Service** | FastAPI, scikit-learn, pandas, APScheduler |
| **Infrastructure** | Docker Compose (PostgreSQL 15, Redis 7), Render Blueprint (`render.yaml`) |
| **Testing** | Jest (backend), Playwright (e2e) |

## Architecture

The application is an **npm workspaces monorepo** with three deployable services: a NestJS API (system of record), a Next.js web UI, and an optional FastAPI ML worker. PostgreSQL holds all persistent data; Redis backs JWT sessions when configured.

### System overview

```mermaid
flowchart TB
  subgraph client["Client"]
    Browser["Browser / Next.js 14"]
  end

  subgraph app["Application tier"]
    FE["Frontend :3001"]
    BE["Backend API :3000"]
    ML["ML Service :8000"]
  end

  subgraph data["Data tier"]
    PG[(PostgreSQL 15)]
    RD[(Redis 7 — optional)]
  end

  subgraph external["External (optional)"]
    Ollama["Ollama / Local LLM"]
    Azure["Azure OpenAI"]
  end

  Browser --> FE
  FE -->|REST + JWT| BE
  ML -->|Fetch defects / POST insights| BE
  BE --> PG
  BE --> RD
  BE --> Ollama
  BE --> Azure
```

### Local vs production topology

| Environment | Frontend | Backend | ML Service | Database | Cache |
|-------------|----------|---------|------------|----------|-------|
| **Local dev** | `npm run dev:frontend` | `npm run dev:backend` | `uvicorn` (optional) | Docker Compose | Docker Compose |
| **Render** | Web service (`frontend/`) | Web service (`backend/`) | Web service (`ml-service/`) | Managed PostgreSQL (`render.yaml`) | Not in blueprint |

Render provisions all three app services plus PostgreSQL via [`render.yaml`](./render.yaml). See [DEPLOYMENT.md](./DEPLOYMENT.md) for wiring `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, and `ML_SERVICE_URL`.

### Request flow

1. User authenticates via `POST /auth/login`; access and refresh tokens are returned.
2. The frontend stores tokens in `localStorage` and attaches the access token on every API call (`frontend/lib/api.ts`).
3. On `401`, the Axios response interceptor calls `POST /auth/refresh` once, then redirects to `/login` if refresh fails.
4. Mutating requests pass through global **CSRF**, **rate limit** (100/min), and **validation** pipes before reaching domain controllers.
5. Domain services use **Prisma** for PostgreSQL; optional **Redis** validates refresh-token sessions.

```mermaid
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant BE as Backend
  participant RD as Redis
  participant DB as PostgreSQL

  U->>FE: Login
  FE->>BE: POST /auth/login
  BE->>DB: Verify user (Argon2)
  BE->>RD: Store session + refresh mapping
  BE-->>FE: accessToken + refreshToken
  FE->>BE: API call (Bearer token)
  BE->>RD: Validate session (if Redis up)
  BE->>DB: Read/write data
  BE-->>FE: JSON response
```

### Backend (NestJS)

Single Node process exposing a REST API. Modules are feature-based; shared infrastructure is global.

| Module | Responsibility |
|--------|----------------|
| **Auth** | Login, refresh, JWT strategy, `JwtAuthGuard`, `RolesGuard` |
| **Users** | Profiles, admin user CRUD, assignable/active user lists |
| **Defects** | CRUD, comments, filters, PMC/location suggestions, global defects & chat |
| **DefectImport** | Excel upload, training data, pattern detection, AI-oriented analysis |
| **Projects** | PMC (Project Management Company) management — API name `projects`, data model `PMC` |
| **Attachments** | Presigned upload/download, confirm upload, AV scan hook |
| **QCParameters** | Phase-based QC parameter definitions and per-defect values |
| **Dashboard** | Aggregated KPI metrics for charts |
| **AI** | Pluggable providers: Ollama (`LocalLLMProvider`) or Azure OpenAI; recommendations & suggestions |
| **ML** | Persist insights, in-process generation fallback, webhook for ML service |
| **Health / Metrics / Telemetry** | Terminus probes, Prometheus metrics, optional OpenTelemetry |

**Global cross-cutting** (`app.module.ts`):

- `RateLimitGuard` — 100 requests/minute
- `RolesGuard` — RBAC via `@Roles()` decorator
- `CsrfInterceptor` — CSRF on state-changing routes
- `LoggingInterceptor` — structured request logging
- `HttpExceptionFilter` — consistent error responses
- `ValidationPipe` — DTO whitelist + transform

**Swagger** is mounted at `/api` when `NODE_ENV !== 'production'`.

### Authentication and sessions

| Token | TTL | Secret | Storage |
|-------|-----|--------|---------|
| Access | 30 minutes | `JWT_SECRET` | Client `localStorage` |
| Refresh | 6 hours (sliding) | `JWT_REFRESH_SECRET` | Client + Redis mapping |

**Redis keys** (when `REDIS_URL` is set):

- `session:{userId}` — active refresh token, 6-hour absolute session TTL
- `refresh:{refreshToken}` — maps token to user ID

If Redis is unavailable, the app logs a warning and continues without server-side session invalidation.

**Roles** (Prisma `Role` enum): `ADMIN`, `PROJECT_MANAGER`, `QC`, `WIS`. Route guards enforce role requirements per endpoint.

### AI and ML pipelines

```mermaid
flowchart LR
  subgraph sync["Synchronous (user-triggered)"]
    D[Defect context] --> AI[AIService]
    AI --> P{AI_PROVIDER}
    P -->|ollama| OLL[Ollama]
    P -->|azure| AZ[Azure OpenAI]
    AI --> R[Recommendations JSON]
  end

  subgraph async["Asynchronous (scheduled / manual)"]
    MLW[ML Service] -->|GET defects| BE2[Backend API]
    MLW -->|TF-IDF + K-Means| INS[Insights]
    MLW -->|POST /ml/insights| BE2
    BE2 --> DB2[(MLInsight table)]
  end
```

- **AI recommendations** (`POST /ai/recommendations`): backend loads defect + comments/attachments, builds context, calls configured LLM provider.
- **AI suggestions** (`GET /ai/suggestions/*`): stored `AISuggestion` records by user or role.
- **ML insights**: FastAPI worker pulls defect data from the backend, computes metrics (reopen rate, MTTR, distributions, clustering), posts results to `POST /ml/insights`. APScheduler runs nightly generation at 2 AM. Backend can also generate insights in-process via `POST /ml/insights/generate`.

**Defect import / training**: Excel uploads populate `DefectTrainingData`; `DefectPattern` records capture recurring themes for import analytics and prevention tips.

### Data model (PostgreSQL / Prisma)

Core entities and relationships:

| Entity | Purpose |
|--------|---------|
| **User** | Accounts with role, active flag, assignments |
| **PMC** | Project management company (exposed as “projects” in API) |
| **Location** | Sites under a PMC; used for suggestions and defects |
| **Defect** | Primary work item: status, source, priority, PMC/location, optional **global** flag |
| **DefectLocation / DefectAssignee** | Many-to-many for global defects (multi-site, multi-assignee) |
| **Comment** | Per-defect discussion |
| **GlobalDefectChat** | Refined collaboration messages on global defects |
| **Attachment** | File metadata + storage key |
| **AuditEvent** | Status, assignment, comment, create/update history |
| **QCParameter / DefectQCValue** | Configurable QC fields by phase (Staging, PreLive, PostLive) |
| **MLInsight** | Stored analytics snapshots by scope (global / user / team) |
| **AISuggestion** | Role- or user-specific AI guidance |
| **DefectTrainingData / DefectPattern** | Historical import data and detected patterns |

Defect **sources**: Peer Review, PM Feedback, Staging QC, Pre-Live QC, Post-Live QC.  
Defect **statuses**: Open, In Progress, Fixed, Resolved, Closed, Reopened, Deferred, Out of Scope.

### Frontend (Next.js App Router)

Server and client components under `frontend/app/`:

| Route | Purpose |
|-------|---------|
| `/login` | Authentication |
| `/dashboard` | KPI dashboard (ECharts) |
| `/defects`, `/defects/new`, `/defects/[id]` | Defect list, create, detail |
| `/my-work` | Assignee-focused view |
| `/insights` | ML insights visualization |
| `/import-defects` | Bulk Excel import (admin) |
| `/upload-qc` | QC parameter upload (admin) |
| `/admin` | User administration |

Shared libraries:

- `lib/api.ts` — Axios client, JWT interceptors, auto-refresh
- `lib/auth.ts` — login, refresh, logout, `getMe`
- `lib/validation.ts` — Zod schemas

UI: Tailwind CSS, reusable `Navbar`, `FilterBar`, `AIRecommendationPanel`.

### Monorepo layout

```
.
├── backend/src/       # NestJS modules (see table above)
├── backend/prisma/    # schema.prisma, migrations, seed
├── frontend/app/      # Next.js routes
├── frontend/lib/      # API client, auth, validation
├── ml-service/        # FastAPI + insights_generator.py
├── e2e/               # Playwright specs
├── docker-compose.yml # postgres:15-alpine, redis:7-alpine
└── render.yaml        # Render Blueprint
```

Full design notes: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerequisites

- **Node.js** 18+
- **Docker** and Docker Compose (for local PostgreSQL and Redis)
- **Python** 3.11+ (optional, for ML service)
- **npm** (workspaces: backend + frontend)

## Quick Start

See [SETUP.md](./SETUP.md) for detailed setup instructions.

### 1. Install dependencies

```bash
npm install
```

### 2. Start Docker services

```bash
docker-compose up -d
```

Default local database: `postgresql://user:password@localhost:5432/defect_tracking`

### 3. Configure and migrate backend

```bash
cd backend
cp env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL
npx prisma migrate dev
npx prisma generate
npx prisma db seed
```

### 4. Configure frontend

```bash
cd ../frontend
cp env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 5. Run development servers

From the project root:

```bash
npm run dev
```

Or run services separately:

```bash
npm run dev:backend   # NestJS on port 3000
npm run dev:frontend  # Next.js on port 3001
```

**Optional — ML service:**

```bash
cd ml-service
pip install -r requirements.txt
set BACKEND_URL=http://localhost:3000   # Windows
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Local URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| Backend API | http://localhost:3000 |
| Swagger (dev) | http://localhost:3000/api |
| Health | http://localhost:3000/health |
| Metrics | http://localhost:3000/metrics |
| ML Service | http://localhost:8000 |

### Test credentials

After seeding the database:

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `password123` |
| User | `user` | `password123` |

> Change these credentials before any production deployment.

## NPM Scripts (root)

| Script | Description |
|--------|-------------|
| `npm run dev` | Backend + frontend concurrently |
| `npm run dev:backend` | NestJS watch mode |
| `npm run dev:frontend` | Next.js dev server (port 3001) |
| `npm run build` | Build backend and frontend |
| `npm test` | Backend unit tests + e2e |
| `npm run test:backend` | Jest unit tests only |
| `npm run test:e2e` | Playwright tests |
| `npm run test:e2e:ui` | Playwright UI mode |

## API Overview

All protected routes require `Authorization: Bearer <access_token>` unless noted.

### Authentication
- `POST /auth/login` — Login
- `POST /auth/refresh` — Refresh access token

### Defects
- `GET /defects` — List with filters
- `POST /defects` — Create
- `GET /defects/:id` — Details
- `PATCH /defects/:id` — Update
- `DELETE /defects/:id` — Delete
- `POST /defects/:id/comments` — Add comment
- `GET /defects/my-activity` — Current user activity
- `GET /defects/suggestions/pmc` — PMC suggestions
- `GET /defects/suggestions/location` — Location suggestions
- `GET|POST /defects/:id/global-chat` — Global chat thread
- `POST /defects/:id/global-chat/mark-read` — Mark chat read
- `GET /defects/:id/global-chat/unread-count` — Unread count
- `GET /defects/:id/global-completion-status` — Completion status

### Defect Import
- `POST /defect-import/upload` — Upload Excel (Admin)
- `GET /defect-import/stats` — Import statistics
- `GET /defect-import/patterns` — Detected patterns
- `GET /defect-import/suggestions` — Import suggestions
- `POST /defect-import/analyze` — Analyze import data
- `POST /defect-import/clear` — Clear import data (Admin)

### Projects
- `GET /projects` — List
- `POST /projects` — Create (Admin)
- `GET /projects/:id` — Get one
- `PATCH /projects/:id` — Update (Admin)
- `DELETE /projects/:id` — Delete (Admin)

### Users
- `GET /users/me` — Current user profile
- `GET /users` — List users (Admin)
- `POST /users` — Create user (Admin)
- `PATCH /users/:id/toggle-active` — Activate/deactivate (Admin)
- `DELETE /users/:id` — Delete user (Admin)
- `GET /users/active` — Active users
- `GET /users/assignable` — Assignable users

### Attachments
- `POST /attachments/presigned-upload` — Get upload URL
- `POST /attachments/confirm-upload` — Confirm upload
- `GET /attachments/:id/presigned-download` — Get download URL
- `GET /attachments/defect/:defectId` — List by defect
- `DELETE /attachments/:id` — Delete attachment

### QC Parameters
- `POST /qc-parameters/upload` — Upload Excel (Admin)
- `GET /qc-parameters/phase/:phase` — Parameters by phase
- `GET /qc-parameters/defect/:defectId` — Values for defect
- `POST /qc-parameters/defect/:defectId/values` — Save QC values

### Dashboard & AI
- `GET /dashboard/metrics` — Dashboard KPIs
- `POST /ai/recommendations` — AI recommendations for a defect
- `GET /ai/suggestions/admin` — Admin AI suggestions
- `GET /ai/suggestions/me` — Personal AI suggestions

### ML Insights
- `GET /ml/insights` — Latest insights
- `GET /ml/insights/history` — Insights history
- `POST /ml/insights` — Store insights (ML service)
- `POST /ml/insights/generate` — Trigger generation

### Health & Metrics
- `GET /health` — Combined health check
- `GET /health/liveness` — Liveness probe
- `GET /health/readiness` — Readiness probe
- `GET /metrics` — Prometheus metrics

## Running Tests

### Backend unit tests
```bash
cd backend
npm test
```

### E2E tests (Playwright)
```bash
cd e2e
npm install
npx playwright install
npm test
```

From root: `npm run test:e2e` or `npm run test:e2e:ui`

## Environment Variables

Copy the example files and adjust for your environment:

| App | Example file | Output file |
|-----|--------------|-------------|
| Backend | `backend/env.example` | `backend/.env` |
| Frontend | `frontend/env.example` | `frontend/.env.local` |
| ML Service | — | Set `BACKEND_URL`, optional `BACKEND_API_KEY` |

### Backend (key variables)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token signing secret |
| `JWT_REFRESH_SECRET` | Refresh token signing secret |
| `FRONTEND_URL` | Frontend origin for CORS |
| `REDIS_URL` | Redis URL (optional; sessions degrade gracefully without it) |
| `AI_PROVIDER` | `ollama` (default) or `azure` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local LLM settings |
| `AZURE_OPENAI_*` | Azure OpenAI when `AI_PROVIDER=azure` |
| `ML_SERVICE_URL` | ML service base URL (production) |
| `ENABLE_AV_SCAN` | Enable upload AV scan (`true`/`false`) |
| `ENABLE_TELEMETRY` | Enable OpenTelemetry (`true`/`false`) |

### Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

## Deployment

Production deployment is documented in [DEPLOYMENT.md](./DEPLOYMENT.md).

### Render (recommended)

The repo includes a [Render Blueprint](https://render.com/docs/blueprint-spec) at `render.yaml` that provisions:

- **PostgreSQL** (`basic-256mb` plan)
- **Backend** — NestJS with Prisma migrate + optional seed on start
- **ML Service** — FastAPI on Python
- **Frontend** — Next.js

**Quick steps:**

1. Push this repo to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), choose **New → Blueprint** and connect the repository.
3. Apply the blueprint; set `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, and `ML_SERVICE_URL` after services deploy.
4. Seed the database once via the backend shell: `npx prisma db seed`.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for manual service setup, env var reference, and Vercel frontend option.

### Docker (local data stores only)

```bash
docker-compose up -d
```

Runs PostgreSQL 15 and Redis 7 with persisted volumes. Application services run via npm locally or on your host platform.

## Security

See [SECURITY.md](./SECURITY.md) for security practices.

- JWT access + refresh tokens with Redis session storage
- Role-based access control (ADMIN, PROJECT_MANAGER, QC, WIS)
- Rate limiting, CSRF protection, and input validation
- CORS allowlist for localhost, Railway, Render, and Vercel hosts

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](./SETUP.md) | Local development setup |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Render deployment guide |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture |
| [SECURITY.md](./SECURITY.md) | Security features and guidelines |
| [CODE_IMPROVEMENTS.md](./CODE_IMPROVEMENTS.md) | Recent codebase improvements |

## License

MIT
