# ML Service

FastAPI service for generating ML insights from defect data.

## Features

- **Reopen Rate Calculation**: Computes the percentage of defects that have been reopened
- **Mean Time to Fix**: Calculates average time from defect creation to resolution
- **Distributions**: Analyzes distributions of status, priority, and project
- **Clustering**: Uses TF-IDF and K-Means to cluster defect descriptions

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables:
```bash
export BACKEND_URL=http://localhost:3000
export BACKEND_API_KEY=your-api-key  # Optional
```

3. Run the service:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /health` - Health check
- `POST /generate-insights` - Generate insights for a scope
- `POST /generate-insights/nightly` - Generate insights for all scopes (called by cron)

## Nightly Cron Job

The service includes a built-in scheduler that runs insights generation at 2 AM daily. This can be configured in `main.py`.

## Docker

Build and run with Docker:
```bash
docker build -t ml-service .
docker run -p 8000:8000 -e BACKEND_URL=http://host.docker.internal:3000 ml-service
```

