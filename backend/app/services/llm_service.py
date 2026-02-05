from openai import OpenAI
from app.core.config import settings
from app.models import Block, CheckAiResult
from typing import List, Dict, Any
import json
import re

class LLMService:
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL if hasattr(settings, 'OPENAI_BASE_URL') else None
        )
    
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

        response = self.client.chat.completions.create(
            model="deepseek-ai/DeepSeek-V2.5", # SiliconFlow common model, can be env var
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
        if not settings.OPENAI_API_KEY:
            return CheckAiResult(raw="AI skipped: OPENAI_API_KEY not configured")

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
            model="deepseek-ai/DeepSeek-V2.5",
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
