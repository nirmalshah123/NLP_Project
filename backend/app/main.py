from contextlib import asynccontextmanager
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.models.db import init_db
from app.routers import calls, reports, scenarios


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Adversarial Dialogue API", lifespan=lifespan)

# Deployment-safe default: allow all origins for preflight reliability.
# You can tighten this later by switching CORS_MODE to "strict" and setting
# CORS_ORIGINS/CORS_ORIGIN_REGEX.
cors_mode = os.getenv("CORS_MODE", "open").lower()
cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,https://nlp-project-red.vercel.app"
    ).split(",")
    if origin.strip()
]
cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if cors_mode == "open" else cors_origins,
    allow_origin_regex=None if cors_mode == "open" else cors_origin_regex,
    allow_credentials=False if cors_mode == "open" else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scenarios.router, prefix="/api/scenarios", tags=["scenarios"])
app.include_router(calls.router, prefix="/api/calls", tags=["calls"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
