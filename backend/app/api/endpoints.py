from fastapi import APIRouter

from app.api.routers.checks import router as checks_router
from app.api.routers.documents import router as documents_router
from app.api.routers.prompts import router as prompts_router
from app.api.routers.skills import router as skills_router
from app.api.routers.templates import router as templates_router

router = APIRouter()
@router.get("/health")
def health_check():
    return {"status": "ok"}

router.include_router(documents_router)
router.include_router(templates_router)
router.include_router(prompts_router)
router.include_router(skills_router)
router.include_router(checks_router)
