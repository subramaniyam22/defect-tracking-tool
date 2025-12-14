from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import os
import asyncio
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

from insights_generator import InsightsGenerator

app = FastAPI(title="ML Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000")
BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

insights_generator = InsightsGenerator(BACKEND_URL, BACKEND_API_KEY)


class InsightsRequest(BaseModel):
    scope: Optional[str] = "global"  # global, team, user
    userId: Optional[str] = None
    teamId: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/generate-insights")
async def generate_insights(request: InsightsRequest):
    """Generate insights for the specified scope"""
    try:
        logger.info(f"Generating insights for scope: {request.scope}")
        
        insights = await insights_generator.generate(
            scope=request.scope,
            userId=request.userId,
            teamId=request.teamId,
            startDate=request.startDate,
            endDate=request.endDate,
        )
        
        # Store insights via backend
        await insights_generator.store_insights(insights, request.scope, request.userId, request.teamId)
        
        return insights
    except Exception as e:
        logger.error(f"Error generating insights: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-insights/nightly")
async def generate_nightly_insights():
    """Generate insights for all scopes (called by cron)"""
    try:
        logger.info("Running nightly insights generation")
        
        # Generate global insights
        global_insights = await insights_generator.generate(scope="global")
        await insights_generator.store_insights(global_insights, "global", None, None)
        
        # Generate team insights (if teams exist)
        # This would require fetching teams from backend
        # For now, we'll just do global
        
        logger.info("Nightly insights generation completed")
        return {"status": "success", "message": "Insights generated for all scopes"}
    except Exception as e:
        logger.error(f"Error in nightly insights generation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Scheduler for nightly runs
async def run_nightly_insights():
    """Async function to run nightly insights generation"""
    try:
        logger.info("Running nightly insights generation")
        global_insights = await insights_generator.generate(scope="global")
        await insights_generator.store_insights(global_insights, "global", None, None)
        logger.info("Nightly insights generation completed")
    except Exception as e:
        logger.error(f"Error in nightly insights generation: {str(e)}")

# Initialize and start scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(
    func=lambda: asyncio.run(run_nightly_insights()),
    trigger=CronTrigger(hour=2, minute=0),  # Run at 2 AM daily
    id="nightly_insights",
    name="Generate nightly insights",
    replace_existing=True,
)
scheduler.start()
logger.info("Scheduler started - nightly insights will run at 2 AM")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

