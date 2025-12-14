# Setup Instructions

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose installed
- npm or yarn package manager
- Python 3.11+ (for ML service)
- Playwright (for e2e tests)

## Step-by-Step Setup

### 1. Install Dependencies

From the root directory:
```bash
npm install
```

This will install dependencies for both the monorepo root and workspaces (backend and frontend).

### 2. Start Docker Services

Start PostgreSQL and Redis using Docker Compose:
```bash
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

### 3. Setup Backend

Navigate to the backend directory:
```bash
cd backend
```

Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database connection string
- Redis connection
- JWT secrets (CHANGE IN PRODUCTION!)
- AI provider settings
- Security settings

Run Prisma migrations:
```bash
npx prisma migrate dev --name init
```

Generate Prisma client:
```bash
npx prisma generate
```

Seed the database with test users:
```bash
npx prisma db seed
```

This creates two test users:
- Username: `admin`, Password: `password123`, Role: `ADMIN`
- Username: `user`, Password: `password123`, Role: `USER`

### 4. Setup Frontend

Navigate to the frontend directory:
```bash
cd ../frontend
```

Create a `.env.local` file from `.env.example`:
```bash
cp .env.example .env.local
```

Edit `.env.local` and set:
- `NEXT_PUBLIC_API_URL` to your backend URL

### 5. Setup ML Service (Optional)

Navigate to the ml-service directory:
```bash
cd ../ml-service
```

Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Edit `.env` and configure:
- `BACKEND_URL` to your backend API URL

### 6. Run the Application

From the root directory, you can run all services:

**Terminal 1 - Backend:**
```bash
npm run dev:backend
```

**Terminal 2 - Frontend:**
```bash
npm run dev:frontend
```

**Terminal 3 - ML Service (Optional):**
```bash
cd ml-service
uvicorn main:app --host 0.0.0.0 --port 8000
```

Or use the root script:
```bash
npm run dev
```

### 7. Access the Application

- Frontend: http://localhost:3001
- Backend API: http://localhost:3000
- ML Service: http://localhost:8000
- Health Check: http://localhost:3000/health
- Metrics: http://localhost:3000/metrics

## Environment Variables

### Backend (.env)

See `backend/.env.example` for all available options. Key variables:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`: Redis configuration
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: JWT signing secrets (CHANGE IN PRODUCTION!)
- `AI_PROVIDER`: `ollama` or `azure`
- `ENABLE_AV_SCAN`: Enable antivirus scanning (default: false)
- `ENABLE_TELEMETRY`: Enable OpenTelemetry (default: false)

### Frontend (.env.local)

- `NEXT_PUBLIC_API_URL`: Backend API URL

### ML Service (.env)

- `BACKEND_URL`: Backend API URL
- `BACKEND_API_KEY`: Optional API key for authentication

## Running Tests

### Unit Tests
```bash
cd backend
npm test
```

### E2E Tests (Playwright)
```bash
cd e2e
npm install
npx playwright install
npm test
```

Run with UI:
```bash
npm run test:ui
```

## Health Checks

### Backend Health
```bash
curl http://localhost:3000/health
```

### Liveness Probe
```bash
curl http://localhost:3000/health/liveness
```

### Readiness Probe
```bash
curl http://localhost:3000/health/readiness
```

## Metrics

Prometheus metrics available at:
```bash
curl http://localhost:3000/metrics
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `docker-compose ps`
- Check DATABASE_URL in `.env`
- Ensure database exists: `createdb defect_tracking`

### Redis Connection Issues
- Verify Redis is running: `docker-compose ps`
- Check REDIS_HOST and REDIS_PORT in `.env`
- Test connection: `redis-cli ping`

### Port Conflicts
- Backend default: 3000
- Frontend default: 3001
- ML Service default: 8000
- Change ports in respective `.env` files if needed

## Production Deployment

See [SECURITY.md](./SECURITY.md) for security best practices.

Key production considerations:
1. Use strong JWT secrets (minimum 32 characters)
2. Enable HTTPS
3. Configure CORS properly
4. Enable AV scanning
5. Set up monitoring and alerting
6. Use environment-specific configuration
7. Enable rate limiting
8. Configure security headers
