from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from app.models import GlobalPromptConfig, GlobalAnalyzeRequest, GlobalAnalyzeResponse
from app.services.llm_service import LLMService
from app.services.prompt_store import get_global_prompt_config, upsert_global_prompt_config


router = APIRouter()
llm_service = LLMService()


@router.get("/prompts/global", response_model=GlobalPromptConfig)
def get_global_prompt():
    try:
        return get_global_prompt_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/prompts/global", response_model=GlobalPromptConfig)
def put_global_prompt(cfg: GlobalPromptConfig):
    try:
        upsert_global_prompt_config(cfg)
        return cfg
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/global", response_model=GlobalAnalyzeResponse)
def analyze_global(req: GlobalAnalyzeRequest):
    try:
        cfg = get_global_prompt_config()
        prompt = (req.promptOverride or "").strip()
        if not prompt:
            prompt = (cfg.byTemplateId.get(req.templateId) or cfg.defaultPrompt or "").strip()
        blocks_payload: List[Dict[str, Any]] = []
        for b in req.rightBlocks or []:
            t = (b.text or "").strip()
            if not t:
                continue
            if len(t) > 1600:
                t = t[:1600] + "…"
            blocks_payload.append(
                {
                    "blockId": b.blockId,
                    "kind": str(getattr(b.kind, "value", b.kind)),
                    "text": t,
                }
            )
        payload = {
            "templateId": req.templateId,
            "blocks": blocks_payload,
            "diffRows": [x.model_dump() for x in req.diffRows],
            "checkRun": req.checkRun.model_dump() if req.checkRun is not None else None,
        }
        result = llm_service.global_review(payload=payload, prompt=prompt)
        return GlobalAnalyzeResponse(raw=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
