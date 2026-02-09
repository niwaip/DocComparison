from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import List, Dict, Any
import os
import shutil
import tempfile

from app.core.config import settings
from app.models import Ruleset, CheckRunRequest, CheckRunResponse
from app.services.check_service import CheckService
from app.services.doc_service import DocService
from app.services.ruleset_store import list_rulesets, get_ruleset, upsert_ruleset


router = APIRouter()
check_service = CheckService()


def _max_upload_bytes() -> int:
    return settings.max_upload_bytes()


def _is_probably_docx(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            head = f.read(4)
        return head[:2] == b"PK"
    except Exception:
        return False


@router.get("/check/rulesets", response_model=List[Ruleset])
def get_rulesets():
    try:
        return list_rulesets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check/rulesets/{template_id}", response_model=Ruleset)
def get_ruleset_by_id(template_id: str):
    rs = get_ruleset(template_id)
    if rs is None:
        raise HTTPException(status_code=404, detail="ruleset not found")
    return rs


@router.put("/check/rulesets/{template_id}", response_model=Ruleset)
def put_ruleset(template_id: str, ruleset: Ruleset):
    try:
        if ruleset.templateId != template_id:
            raise HTTPException(status_code=400, detail="templateId mismatch")
        upsert_ruleset(ruleset)
        return ruleset
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check/run", response_model=CheckRunResponse)
def run_checks(req: CheckRunRequest):
    try:
        return check_service.run(req.templateId, req.rightBlocks, req.aiEnabled)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check/run_docx", response_model=CheckRunResponse)
async def run_checks_docx(
    templateId: str = Form(...),
    aiEnabled: bool = Form(False),
    file: UploadFile = File(...),
):
    filename = (file.filename or "").lower()
    if not filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        if os.path.getsize(tmp_path) > _max_upload_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        if not _is_probably_docx(tmp_path):
            raise HTTPException(status_code=400, detail="Invalid .docx file")
        blocks = DocService.parse_docx(tmp_path)
        return check_service.run(templateId, blocks, aiEnabled)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/check/run/{run_id}", response_model=Dict[str, Any])
def get_check_run(run_id: str):
    payload = check_service.get_run(run_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="run not found")
    return payload
