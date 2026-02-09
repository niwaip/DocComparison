import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "DocComparison"
    API_V1_STR: str = "/api"
    
    # Paths
    ARTIFACTS_DIR: str = os.getenv("ARTIFACTS_DIR", "/data/artifacts")

    DOC_COMPARISON_MAX_UPLOAD_MB: int = int(os.getenv("DOC_COMPARISON_MAX_UPLOAD_MB", "20") or "20")
    CHECK_AI_CHUNK_SIZE: int = int(os.getenv("DOC_COMPARISON_CHECK_AI_CHUNK_SIZE", "10") or "10")

    TEMPLATE_MATCH_OUTLINE_MIN_SCORE: float = float(os.getenv("DOC_COMPARISON_TM_OUTLINE_MIN_SCORE", "0.72") or "0.72")
    TEMPLATE_MATCH_OUTLINE_MIN_GAP: float = float(os.getenv("DOC_COMPARISON_TM_OUTLINE_MIN_GAP", "0.06") or "0.06")
    TEMPLATE_MATCH_OUTLINE_BOOST_BASE: float = float(os.getenv("DOC_COMPARISON_TM_OUTLINE_BOOST_BASE", "0.90") or "0.90")
    
    # OpenAI / SiliconFlow
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.siliconflow.cn/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "")

    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "")

    SILICONFLOW_API_KEY: str = os.getenv("SILICONFLOW_API_KEY", "")
    SILICONFLOW_BASE_URL: str = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")
    SILICONFLOW_MODEL: str = os.getenv("SILICONFLOW_MODEL", "deepseek-ai/DeepSeek-V2.5")

    QWEN_API_KEY: str = os.getenv("QWEN_API_KEY", "")
    QWEN_BASE_URL: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    QWEN_MODEL: str = os.getenv("QWEN_MODEL", "")
    
    class Config:
        env_file = ".env"

    def max_upload_bytes(self) -> int:
        mb = self.DOC_COMPARISON_MAX_UPLOAD_MB
        if mb < 1:
            mb = 1
        return mb * 1024 * 1024

    def clamp(self) -> "Settings":
        self.DOC_COMPARISON_MAX_UPLOAD_MB = max(1, int(self.DOC_COMPARISON_MAX_UPLOAD_MB or 1))
        self.CHECK_AI_CHUNK_SIZE = max(1, int(self.CHECK_AI_CHUNK_SIZE or 1))
        self.TEMPLATE_MATCH_OUTLINE_MIN_SCORE = float(self.TEMPLATE_MATCH_OUTLINE_MIN_SCORE or 0.72)
        self.TEMPLATE_MATCH_OUTLINE_MIN_GAP = float(self.TEMPLATE_MATCH_OUTLINE_MIN_GAP or 0.06)
        self.TEMPLATE_MATCH_OUTLINE_BOOST_BASE = float(self.TEMPLATE_MATCH_OUTLINE_BOOST_BASE or 0.9)
        self.TEMPLATE_MATCH_OUTLINE_BOOST_BASE = min(1.0, max(0.0, self.TEMPLATE_MATCH_OUTLINE_BOOST_BASE))
        self.TEMPLATE_MATCH_OUTLINE_MIN_SCORE = min(1.0, max(0.0, self.TEMPLATE_MATCH_OUTLINE_MIN_SCORE))
        self.TEMPLATE_MATCH_OUTLINE_MIN_GAP = min(1.0, max(0.0, self.TEMPLATE_MATCH_OUTLINE_MIN_GAP))
        return self

settings = Settings().clamp()
