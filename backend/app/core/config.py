import os
from dotenv import load_dotenv

# Find and load the .env file reliably
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_backend = os.path.join(backend_dir, ".env")
env_root = os.path.join(os.path.dirname(backend_dir), ".env")

if os.path.exists(env_backend):
    load_dotenv(dotenv_path=env_backend)
elif os.path.exists(env_root):
    load_dotenv(dotenv_path=env_root)
else:
    load_dotenv()

try:
    from pydantic_settings import BaseSettings
except ImportError:
    try:
        from pydantic import BaseSettings
    except ImportError:
        class BaseSettings:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

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