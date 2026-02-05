import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "DocComparison"
    API_V1_STR: str = "/api"
    
    # Paths
    ARTIFACTS_DIR: str = os.getenv("ARTIFACTS_DIR", "/data/artifacts")
    
    # OpenAI / SiliconFlow
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.siliconflow.cn/v1")
    
    class Config:
        env_file = ".env"

settings = Settings()
