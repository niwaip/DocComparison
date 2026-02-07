try:
    from openai import OpenAI
except ModuleNotFoundError:
    OpenAI = None
from app.core.config import settings
from app.models import Block, CheckAiResult
from typing import List, Dict, Any
import json
import re

class LLMService:
    def __init__(self):
        self.api_key, self.base_url, self.model = self._resolve_client_config()
        if OpenAI is None:
            self.client = None
        else:
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url if self.base_url else None,
            )

    def _resolve_client_config(self) -> tuple[str, str, str]:
        provider = (getattr(settings, "LLM_PROVIDER", "") or "").strip().lower()

        api_key = (getattr(settings, "LLM_API_KEY", "") or "").strip()
        base_url = (getattr(settings, "LLM_BASE_URL", "") or "").strip()
        model = (getattr(settings, "LLM_MODEL", "") or "").strip()

        if not provider:
            if api_key or base_url or model:
                provider = "openai"
            elif (getattr(settings, "QWEN_API_KEY", "") or "").strip():
                provider = "qwen"
            elif (getattr(settings, "SILICONFLOW_API_KEY", "") or "").strip():
                provider = "siliconflow"
            elif (getattr(settings, "OPENAI_API_KEY", "") or "").strip():
                provider = "openai"
            else:
                provider = "openai"

        if provider in ("qwen", "dashscope"):
            if not api_key:
                api_key = (getattr(settings, "QWEN_API_KEY", "") or "").strip()
            if not base_url:
                base_url = (getattr(settings, "QWEN_BASE_URL", "") or "").strip()
            if not model:
                model = (getattr(settings, "QWEN_MODEL", "") or "").strip() or "qwen-plus"

        elif provider in ("siliconflow", "sf"):
            if not api_key:
                api_key = (getattr(settings, "SILICONFLOW_API_KEY", "") or "").strip() or (getattr(settings, "OPENAI_API_KEY", "") or "").strip()
            if not base_url:
                base_url = (getattr(settings, "SILICONFLOW_BASE_URL", "") or "").strip() or (getattr(settings, "OPENAI_BASE_URL", "") or "").strip()
            if not model:
                model = (getattr(settings, "SILICONFLOW_MODEL", "") or "").strip() or (getattr(settings, "OPENAI_MODEL", "") or "").strip() or "deepseek-ai/DeepSeek-V2.5"

        else:
            if not api_key:
                api_key = (getattr(settings, "OPENAI_API_KEY", "") or "").strip()
            if not base_url:
                base_url = (getattr(settings, "OPENAI_BASE_URL", "") or "").strip()
            if not model:
                model = (getattr(settings, "OPENAI_MODEL", "") or "").strip() or "deepseek-ai/DeepSeek-V2.5"

        return api_key, base_url, model
    
    def analyze_risk(self, blocks: List[Block], query: str) -> Dict[str, Any]:
        """
        Analyze risk in the document blocks based on query.
        Returns response with traceability (citations).
        """
        # Prepare context from blocks
        context_parts = []
        for block in blocks:
            # We include Block ID in the context so LLM can reference it
            context_parts.append(f"<block id='{block.blockId}'>{block.text}</block>")
        
        context_str = "\n".join(context_parts)
        
        system_prompt = """You are a legal contract assistant. 
Analyze the provided contract blocks and answer the user's query.
Crucially, you MUST cite the specific block IDs that support your analysis.
Use the format [Block ID] (e.g., [b_0001]) when referencing a clause.
If you find a risk or issue, explain it and cite the source block.
"""

        user_prompt = f"""Context:
{context_str}

Query: {query}

Please provide a detailed risk analysis with citations."""

        if not self.api_key or self.client is None:
            return {"analysis": "AI skipped: LLM client not configured", "trace_id": ""}

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0
        )
        
        content = response.choices[0].message.content
        return {
            "analysis": content,
            "trace_id": response.id # Traceability of the request
        }

    def check_point(
        self,
        title: str,
        instruction: str,
        evidence_text: str,
        rule_status: str,
        rule_message: str,
    ) -> CheckAiResult:
        if not self.api_key or self.client is None:
            return CheckAiResult(raw="AI skipped: LLM API key not configured")

        system_prompt = (
            "You are a contract checking assistant. "
            "Return ONLY a single JSON object with keys: "
            "status (pass|fail|warn|manual), summary (string), confidence (0-1). "
            "Do not include any extra text."
        )

        user_payload = {
            "title": title,
            "instruction": instruction,
            "evidence": evidence_text,
            "rule": {"status": rule_status, "message": rule_message},
        }

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            temperature=0,
        )

        content = response.choices[0].message.content or ""
        content2 = content.strip()
        try:
            obj = json.loads(content2)
        except Exception:
            m = re.search(r"\{[\s\S]*\}", content2)
            if m:
                try:
                    obj = json.loads(m.group(0))
                except Exception:
                    return CheckAiResult(raw=content2)
            else:
                return CheckAiResult(raw=content2)

        status = obj.get("status")
        summary = obj.get("summary")
        confidence = obj.get("confidence")
        try:
            confidence_f = float(confidence) if confidence is not None else None
        except Exception:
            confidence_f = None
        return CheckAiResult(status=status, summary=summary, confidence=confidence_f, raw=content2)

    def check_points_batch(self, points: List[Dict[str, Any]]) -> Dict[str, CheckAiResult]:
        if not self.api_key or self.client is None:
            out: Dict[str, CheckAiResult] = {}
            for p in points:
                pid = str(p.get("pointId") or "")
                if pid:
                    out[pid] = CheckAiResult(raw="AI skipped: LLM API key not configured")
            return out

        system_prompt = (
            "You are a contract checking assistant. "
            "Return ONLY a single JSON object with key: results. "
            "results is an array of objects with keys: "
            "pointId (string), status (pass|fail|warn|manual), summary (string), confidence (0-1). "
            "Do not include any extra text. "
            "Important policy: if input.rule.status is 'fail', you MUST NOT output 'pass' for that point."
        )

        user_payload = {"points": points}
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            temperature=0,
        )

        content = (response.choices[0].message.content or "").strip()
        try:
            obj = json.loads(content)
        except Exception:
            m = re.search(r"\{[\s\S]*\}", content)
            if not m:
                out: Dict[str, CheckAiResult] = {}
                for p in points:
                    pid = str(p.get("pointId") or "")
                    if pid:
                        out[pid] = CheckAiResult(raw=content)
                return out
            try:
                obj = json.loads(m.group(0))
            except Exception:
                out: Dict[str, CheckAiResult] = {}
                for p in points:
                    pid = str(p.get("pointId") or "")
                    if pid:
                        out[pid] = CheckAiResult(raw=content)
                return out

        results = obj.get("results")
        if not isinstance(results, list):
            out: Dict[str, CheckAiResult] = {}
            for p in points:
                pid = str(p.get("pointId") or "")
                if pid:
                    out[pid] = CheckAiResult(raw=content)
            return out

        out: Dict[str, CheckAiResult] = {}
        for r in results:
            if not isinstance(r, dict):
                continue
            pid = str(r.get("pointId") or "").strip()
            if not pid:
                continue
            status = r.get("status")
            summary = r.get("summary")
            confidence = r.get("confidence")
            try:
                confidence_f = float(confidence) if confidence is not None else None
            except Exception:
                confidence_f = None
            out[pid] = CheckAiResult(status=status, summary=summary, confidence=confidence_f, raw=content)

        for p in points:
            pid = str(p.get("pointId") or "")
            if pid and pid not in out:
                out[pid] = CheckAiResult(raw=content)
        return out

    def global_review(self, payload: Dict[str, Any], prompt: str) -> str:
        if not self.api_key or self.client is None:
            return "AI skipped: LLM API key not configured"

        system_prompt = (
            "You are a contract review assistant. "
            "Return ONLY a single JSON object. "
            "It MUST contain keys: "
            "overallRiskLevel (low|medium|high), summary (string), "
            "keyFindings (array of {title, detail, evidenceIds}), "
            "improvementSuggestions (array of {title, detail, priority}), "
            "missingInformation (array of strings), confidence (0-1). "
            "It MAY include: "
            "sections (array of {title, riskLevel, findings, suggestions, evidenceIds}), "
            "blockReviews (array of {blockId, riskLevel, issues, suggestions}). "
            "Do not include any extra text."
        )

        user_payload = {"prompt": prompt, "input": payload}
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            temperature=0,
        )
        return (response.choices[0].message.content or "").strip()
