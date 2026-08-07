from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

engine = create_async_engine(settings.SQLITE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_sqlite_schema)


def _ensure_sqlite_schema(conn):
    if conn.engine.dialect.name != "sqlite":
        return

    inspector = inspect(conn)
    if "documents" not in inspector.get_table_names():
        return

    columns = [col["name"] for col in inspector.get_columns("documents")]
    if "session_id" not in columns:
        conn.execute(text("ALTER TABLE documents ADD COLUMN session_id VARCHAR"))
