from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Form
from app.services.doc_service import DocService
from app.services.llm_service import LLMService
from app.services.diff_service import align_blocks
from app.models import Block, AlignmentRow, Ruleset, CheckRunRequest, CheckRunResponse
from app.services.check_service import CheckService
from app.services.ruleset_store import list_rulesets, get_ruleset, upsert_ruleset
from typing import List, Dict, Any
import os
import shutil
import tempfile

router = APIRouter()
llm_service = LLMService()
check_service = CheckService()

@router.post("/parse", response_model=List[Block])
async def parse_document(file: UploadFile = File(...)):
    """
    Upload a docx file, convert to HTML, and return parsed blocks.
    """
    if not file.filename.endswith('.docx'):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")
    
    # Save temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        # Convert and Parse directly using python-docx
        blocks = DocService.parse_docx(tmp_path)
        
        return blocks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@router.post("/analyze", response_model=Dict[str, Any])
async def analyze_document(
    blocks: List[Block],
    query: str = Body(..., embed=True)
):
    """
    Analyze document blocks using LLM with traceability.
    """
    try:
        result = llm_service.analyze_risk(blocks, query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/diff", response_model=List[AlignmentRow])
async def diff_documents(
    left_blocks: List[Block] = Body(..., embed=True),
    right_blocks: List[Block] = Body(..., embed=True)
):
    """
    Diff two lists of blocks and return alignment rows.
    """
    try:
        alignment = align_blocks(left_blocks, right_blocks)
        return alignment
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
def health_check():
    return {"status": "ok"}

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
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        blocks = DocService.parse_docx(tmp_path)
        return check_service.run(templateId, blocks, aiEnabled)
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
