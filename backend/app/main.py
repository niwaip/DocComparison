from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

def _error_payload(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    body = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=status_code, content=body)


@app.exception_handler(HTTPException)
async def _http_exception_handler(_: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, str):
        msg = detail
        details = None
    else:
        msg = "Request failed"
        details = detail
    return _error_payload(status_code=int(exc.status_code), code="HTTP_ERROR", message=msg, details=details)


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(_: Request, exc: RequestValidationError):
    return _error_payload(status_code=422, code="VALIDATION_ERROR", message="Invalid request", details=exc.errors())


@app.exception_handler(Exception)
async def _unhandled_exception_handler(_: Request, exc: Exception):
    return _error_payload(status_code=500, code="INTERNAL_ERROR", message=str(exc) or "Internal server error")

app.include_router(endpoints.router, prefix="/api")

@app.get("/")
def read_root():
    return {"Hello": "World", "Service": "DocComparison Backend (Python)"}
