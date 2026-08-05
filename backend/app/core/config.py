import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "DocMind AI Workspace"
    API_V1_STR: str = "/api/v1"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # Paths
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    STORAGE_DIR: str = os.path.join(BASE_DIR, "storage")
    DOCS_DIR: str = os.path.join(STORAGE_DIR, "docs")
    CHROMA_DIR: str = os.path.join(STORAGE_DIR, "chroma_db")
    SQLITE_URL: str = f"sqlite+aiosqlite:///{os.path.join(STORAGE_DIR, 'sqlite', 'docmind.db')}"

    class Config:
        case_sensitive = True

settings = Settings()
