from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from typing import List, Dict, Any
import os
import shutil
import tempfile

from app.models import Block, AlignmentRow
from app.services.doc_service import DocService
from app.services.diff_service import align_blocks
from app.services.llm_service import LLMService


router = APIRouter()
llm_service = LLMService()


@router.post("/parse", response_model=List[Block])
async def parse_document(file: UploadFile = File(...)):
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        blocks = DocService.parse_docx(tmp_path)
        return blocks
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/analyze", response_model=Dict[str, Any])
async def analyze_document(blocks: List[Block], query: str = Body(..., embed=True)):
    try:
        result = llm_service.analyze_risk(blocks, query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diff", response_model=List[AlignmentRow])
async def diff_documents(
    left_blocks: List[Block] = Body(..., embed=True),
    right_blocks: List[Block] = Body(..., embed=True),
):
    try:
        alignment = align_blocks(left_blocks, right_blocks)
        return alignment
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
