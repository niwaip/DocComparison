from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import endpoints
import os

app = FastAPI(title="DocComparison API")

# CORS
origins_raw = os.getenv("DOC_COMPARISON_CORS_ORIGINS", "").strip()
if origins_raw:
    origins = [x.strip() for x in origins_raw.split(",") if x.strip()]
else:
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

allow_all = len(origins) == 1 and origins[0] == "*"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else origins,
    allow_credentials=False if allow_all else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router, prefix="/api")

@app.get("/")
def read_root():
    return {"Hello": "World", "Service": "DocComparison Backend (Python)"}
