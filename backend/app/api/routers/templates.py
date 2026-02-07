from fastapi import APIRouter, UploadFile, File, HTTPException, Body, Form
from typing import List, Dict, Any
import os
import shutil
import tempfile

from app.models import Ruleset, TemplateSnapshot, TemplateListItem, TemplateMatchRequest, TemplateMatchResponse
from app.services.doc_service import DocService
from app.services.ruleset_store import get_ruleset, upsert_ruleset
from app.services.template_store import (
    list_template_index,
    compute_signature,
    upsert_template,
    match_templates,
    get_latest_template,
    rename_template,
    delete_template,
    save_template_docx,
)


router = APIRouter()


@router.get("/templates", response_model=List[TemplateListItem])
def get_templates():
    try:
        return list_template_index()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates/generate", response_model=TemplateSnapshot)
async def generate_template(
    templateId: str = Form(...),
    name: str = Form(...),
    version: str = Form(...),
    file: UploadFile = File(...),
):
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are supported")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        blocks = DocService.parse_docx(tmp_path)
        signature, _ = compute_signature(blocks)
        snapshot = TemplateSnapshot(
            templateId=templateId,
            name=name,
            version=version,
            signature=signature,
            blocks=blocks,
        )
        upsert_template(snapshot)
        with open(tmp_path, "rb") as f:
            save_template_docx(template_id=templateId, version=version, data=f.read())
        if get_ruleset(templateId) is None:
            upsert_ruleset(Ruleset(templateId=templateId, name=name, version=version, referenceData={}, points=[]))
        return snapshot
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/templates/{template_id}/latest", response_model=TemplateSnapshot)
def get_template_latest(template_id: str):
    t = get_latest_template(template_id)
    if t is None:
        raise HTTPException(status_code=404, detail="template not found")
    return t


@router.put("/templates/{template_id}/name", response_model=TemplateListItem)
def put_template_name(template_id: str, payload: Dict[str, Any] = Body(...)):
    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    try:
        ok = rename_template(template_id, name)
        if not ok:
            raise HTTPException(status_code=404, detail="template not found")
        return TemplateListItem(templateId=template_id, name=name, versions=[])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/templates/{template_id}")
def delete_template_by_id(template_id: str):
    try:
        ok = delete_template(template_id)
        if not ok:
            raise HTTPException(status_code=404, detail="template not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates/match", response_model=TemplateMatchResponse)
def match_template(req: TemplateMatchRequest):
    try:
        return match_templates(req.blocks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
