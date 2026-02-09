from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from typing import List, Dict, Any
import os
import shutil
import tempfile

from app.core.config import settings
from app.models import Block, AlignmentRow
from app.services.doc_service import DocService
from app.services.diff_service import align_blocks
from app.services.llm_service import LLMService


router = APIRouter()
llm_service = LLMService()


def _max_upload_bytes() -> int:
    return settings.max_upload_bytes()


def _is_probably_docx(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            head = f.read(4)
        return head[:2] == b"PK"
    except Exception:
        return False


@router.post("/parse", response_model=List[Block])
async def parse_document(file: UploadFile = File(...)):
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
        return blocks
    except HTTPException:
        raise
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
