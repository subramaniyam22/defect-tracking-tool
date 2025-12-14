# Defect Tracking Tool

A comprehensive defect tracking application with AI-powered insights, ML analytics, and advanced security features.

## Features

### Core Functionality
- **Defect Management**: Create, update, track, and manage software defects
- **Project Management**: Organize defects by projects
- **User Management**: Role-based access control (Admin/User)
- **Comments & Attachments**: Collaborate on defects with comments and file attachments
- **QC Parameters**: Dynamic quality control parameters by phase (Staging, Pre-Live, Post-Live)
- **Audit Trail**: Complete history of all changes to defects

### AI & ML Features
- **AI Recommendations**: Get AI-powered root cause analysis, remediation steps, and prevention checklists
- **ML Insights**: Automated insights including:
  - Reopen rate analysis
  - Mean time to fix
  - Status/priority/project distributions
  - Defect clustering using TF-IDF and K-Means

### Analytics & Reporting
- **Dashboard**: KPI cards and interactive charts
- **Filtering**: Advanced filters by date range, project, assignee, phase, status, type
- **Insights Page**: Visualize global and user-specific insights
- **My Work**: Personal dashboard for assigned defects

### Security
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Admin and User roles
- **Rate Limiting**: Protection against abuse (100 req/min)
- **CSRF Protection**: Cross-site request forgery protection
- **AV Scanning**: Antivirus scanning for uploaded files (stub)
- **Input Validation**: Comprehensive validation on backend and frontend

### Observability
- **Health Checks**: Liveness and readiness probes
- **Metrics**: Prometheus-compatible metrics endpoint
- **OpenTelemetry**: Distributed tracing support (optional)

## Tech Stack

### Backend
- **Framework**: NestJS 10.x
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Authentication**: JWT + Argon2
- **Validation**: class-validator
- **Rate Limiting**: @nestjs/throttler
- **Health Checks**: @nestjs/terminus
- **Metrics**: prom-client

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Charts**: ECharts
- **Validation**: Zod
- **HTTP Client**: Axios with interceptors

### ML Service
- **Framework**: FastAPI
- **ML Libraries**: scikit-learn, pandas, numpy
- **Scheduling**: APScheduler

### Testing
- **E2E**: Playwright
- **Unit**: Jest

## Quick Start

See [SETUP.md](./SETUP.md) for detailed setup instructions.

### Quick Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Start Docker services:**
```bash
docker-compose up -d
```

3. **Setup database:**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npx prisma migrate dev
npx prisma generate
npx prisma db seed
```

4. **Setup frontend:**
```bash
cd ../frontend
cp .env.example .env.local
# Edit .env.local with your configuration
```

5. **Run development servers:**
```bash
# From root directory
npm run dev
```

Access:
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/health
- Metrics: http://localhost:3000/metrics

### Test Credentials

- **Admin**: username: `admin`, password: `password123`
- **User**: username: `user`, password: `password123`

## Project Structure

```
.
├── backend/          # NestJS backend application
├── frontend/         # Next.js frontend application
├── ml-service/       # FastAPI ML service
├── e2e/              # Playwright e2e tests
├── docker-compose.yml # Docker services
└── package.json      # Root workspace configuration
```

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token

### Defects
- `GET /defects` - List defects (with filters)
- `POST /defects` - Create defect
- `GET /defects/:id` - Get defect details
- `PATCH /defects/:id` - Update defect
- `DELETE /defects/:id` - Delete defect
- `POST /defects/:id/comments` - Add comment

### Projects
- `GET /projects` - List projects
- `POST /projects` - Create project (Admin only)
- `GET /projects/:id` - Get project
- `PATCH /projects/:id` - Update project (Admin only)
- `DELETE /projects/:id` - Delete project (Admin only)

### Attachments
- `POST /attachments/presigned-upload` - Get upload URL
- `GET /attachments/:id/presigned-download` - Get download URL
- `GET /attachments/defect/:defectId` - List attachments for defect

### QC Parameters
- `POST /qc-parameters/upload` - Upload QC parameters Excel (Admin only)
- `GET /qc-parameters/phase/:phase` - Get parameters by phase
- `GET /qc-parameters/defect/:defectId` - Get defect QC values

### AI
- `POST /ai/recommendations` - Get AI recommendations for defect

### ML Insights
- `GET /ml/insights` - Get latest insights
- `GET /ml/insights/history` - Get insights history

### Health & Metrics
- `GET /health` - Health check
- `GET /health/liveness` - Liveness probe
- `GET /health/readiness` - Readiness probe
- `GET /metrics` - Prometheus metrics

## Running Tests

### Unit Tests
```bash
cd backend
npm test
```

### E2E Tests
```bash
cd e2e
npm install
npx playwright install
npm test
```

## Security

See [SECURITY.md](./SECURITY.md) for detailed security information.

Key security features:
- JWT authentication with refresh tokens
- Role-based access control
- Rate limiting (100 req/min)
- CSRF protection
- Input validation
- AV scanning (stub)

## Environment Variables

See `.env.example` files in each directory:
- `backend/.env.example`
- `frontend/.env.example`
- `ml-service/.env.example`

## Deployment (Railway)

This application is configured for easy deployment on Railway.

### Prerequisites
- GitHub account
- Railway account (https://railway.app)

### Deployment Steps

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/defect-tracking-tool.git
   git push -u origin main
   ```

2. **Create Railway Project:**
   - Go to https://railway.app
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Add PostgreSQL:**
   - In Railway dashboard, click "New" → "Database" → "PostgreSQL"

4. **Add Redis:**
   - Click "New" → "Database" → "Redis"

5. **Deploy Backend:**
   - Click "New" → "GitHub Repo" → Select your repo
   - Settings:
     - Root Directory: `backend`
     - Build Command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
     - Start Command: `npm run start:prod`
   - Environment Variables:
     - `DATABASE_URL`: Reference from PostgreSQL service
     - `REDIS_URL`: Reference from Redis service
     - `JWT_SECRET`: Generate a secure secret
     - `FRONTEND_URL`: Your frontend Railway URL

6. **Deploy Frontend:**
   - Click "New" → "GitHub Repo" → Select your repo
   - Settings:
     - Root Directory: `frontend`
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
   - Environment Variables:
     - `NEXT_PUBLIC_API_URL`: Your backend Railway URL

7. **Seed Database (one-time):**
   - In backend service, go to "Settings" → "Run Command"
   - Run: `npx prisma db seed`

### Environment Variables Reference

**Backend:**
| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| JWT_SECRET | Secret for JWT tokens |
| FRONTEND_URL | Frontend URL for CORS |
| PORT | Auto-set by Railway |

**Frontend:**
| Variable | Description |
|----------|-------------|
| NEXT_PUBLIC_API_URL | Backend API URL |

## Documentation

- [SETUP.md](./SETUP.md) - Setup instructions
- [SECURITY.md](./SECURITY.md) - Security features and best practices
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture overview

## License

MIT
