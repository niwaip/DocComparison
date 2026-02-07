from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import io

from app.services.skill_bundle import export_skill_bundle, import_skill_bundle


router = APIRouter()


@router.get("/skills/export")
def export_skill(templateId: str, version: str | None = None):
    payload, filename = export_skill_bundle(template_id=templateId, version=version)
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/skills/import")
async def import_skill(
    file: UploadFile = File(...),
    overwriteSameVersion: bool = Form(False),
):
    data = await file.read()
    out = import_skill_bundle(bundle_bytes=data, overwrite_same_version=overwriteSameVersion)
    return out
