from openai import OpenAI
from app.core.config import settings
from app.models import Block
from typing import List, Dict, Any
import json

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
