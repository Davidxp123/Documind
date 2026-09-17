import uuid
import datetime
import json
import sqlite3
import os
from typing import List, Optional, Dict, Any
from app.core.config import settings
from app.core.supabase_client import get_supabase_admin

def _get_sqlite_conn():
    db_path = os.path.join(settings.STORAGE_DIR, "sqlite", "docmind.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # Ensure tables exist in SQLite
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                user_id TEXT,
                name TEXT NOT NULL,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_path TEXT,
                file_size INTEGER,
                status TEXT DEFAULT 'pending',
                page_count INTEGER DEFAULT 0,
                summary TEXT,
                keywords TEXT,
                timeline TEXT,
                entities TEXT,
                metadata_json TEXT,
                created_at TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                workspace_id TEXT,
                session_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                citations TEXT,
                timestamp TIMESTAMP
            )
        """)
    return conn

class SupabaseDBService:
    @staticmethod
    def create_session(user_id: str, name: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        s_id = session_id or str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat()
        data = {
            "id": s_id,
            "user_id": user_id,
            "name": name,
            "created_at": now,
            "updated_at": now
        }
        try:
            sb = get_supabase_admin()
            res = sb.table("sessions").insert(data).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            return data
        except Exception as e:
            # Fallback to local SQLite scoped by user_id
            conn = _get_sqlite_conn()
            with conn:
                conn.execute(
                    "INSERT OR REPLACE INTO sessions (id, workspace_id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (s_id, "default", user_id, name, now, now)
                )
            return data

    @staticmethod
    def list_sessions(user_id: str) -> List[Dict[str, Any]]:
        try:
            sb = get_supabase_admin()
            res = sb.table("sessions").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
            return res.data or []
        except Exception as e:
            conn = _get_sqlite_conn()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, user_id, name, created_at, updated_at FROM sessions WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,)
            )
            rows = cursor.fetchall()
            return [
                {
                    "id": r["id"],
                    "user_id": r["user_id"],
                    "name": r["name"],
                    "created_at": str(r["created_at"]),
                    "updated_at": str(r["updated_at"])
                }
                for r in rows
            ]

    @staticmethod
    def get_session(session_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase_admin()
            query = sb.table("sessions").select("*").eq("id", session_id)
            if user_id:
                query = query.eq("user_id", user_id)
            res = query.execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            return None
        except Exception as e:
            conn = _get_sqlite_conn()
            cursor = conn.cursor()
            if user_id:
                cursor.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
            else:
                cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            r = cursor.fetchone()
            if not r:
                return None
            return {
                "id": r["id"],
                "user_id": r["user_id"],
                "name": r["name"],
                "created_at": str(r["created_at"]),
                "updated_at": str(r["updated_at"])
            }

    @staticmethod
    def update_session(session_id: str, user_id: str, name: str) -> Optional[Dict[str, Any]]:
        existing = SupabaseDBService.get_session(session_id, user_id)
        if not existing:
            return None
        now = datetime.datetime.utcnow().isoformat()
        try:
            sb = get_supabase_admin()
            res = sb.table("sessions").update({"name": name, "updated_at": now}).eq("id", session_id).eq("user_id", user_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            return {"id": session_id, "user_id": user_id, "name": name, "updated_at": now}
        except Exception as e:
            conn = _get_sqlite_conn()
            with conn:
                conn.execute(
                    "UPDATE sessions SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                    (name, now, session_id, user_id)
                )
            return {"id": session_id, "user_id": user_id, "name": name, "updated_at": now}

    @staticmethod
    def touch_session(session_id: str):
        now = datetime.datetime.utcnow().isoformat()
        try:
            sb = get_supabase_admin()
            sb.table("sessions").update({"updated_at": now}).eq("id", session_id).execute()
        except Exception:
            try:
                conn = _get_sqlite_conn()
                with conn:
                    conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
            except Exception:
                pass

    @staticmethod
    def delete_session(session_id: str, user_id: str) -> bool:
        existing = SupabaseDBService.get_session(session_id, user_id)
        if not existing:
            return False
        
        try:
            sb = get_supabase_admin()
            try:
                sb.table("messages").delete().eq("session_id", session_id).execute()
            except Exception:
                pass
            try:
                sb.table("documents").delete().eq("session_id", session_id).execute()
            except Exception:
                pass
            sb.table("sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()
        except Exception:
            conn = _get_sqlite_conn()
            with conn:
                conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
                conn.execute("DELETE FROM documents WHERE session_id = ?", (session_id,))
                conn.execute("DELETE FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        return True

    @staticmethod
    def create_document(session_id: str, user_id: str, filename: str, file_type: str, file_size: int, doc_id: Optional[str] = None, file_path: Optional[str] = None) -> Dict[str, Any]:
        session = SupabaseDBService.get_session(session_id, user_id)
        if not session:
            SupabaseDBService.create_session(user_id=user_id, name="Sample-1", session_id=session_id)

        d_id = doc_id or str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat()
        meta = {
            "file_size": file_size,
            "file_path": file_path or "",
            "page_count": 0,
            "summary": "",
            "keywords": [],
            "timeline": [],
            "entities": []
        }
        data = {
            "id": d_id,
            "session_id": session_id,
            "filename": filename,
            "file_type": file_type,
            "status": "pending",
            "metadata": meta,
            "created_at": now
        }
        try:
            sb = get_supabase_admin()
            res = sb.table("documents").insert(data).execute()
            SupabaseDBService.touch_session(session_id)
            if res.data and len(res.data) > 0:
                return res.data[0]
            return data
        except Exception as e:
            conn = _get_sqlite_conn()
            with conn:
                conn.execute(
                    "INSERT OR REPLACE INTO documents (id, workspace_id, session_id, filename, file_type, file_path, file_size, status, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (d_id, "default", session_id, filename, file_type, file_path or "", file_size, "pending", json.dumps(meta), now)
                )
            SupabaseDBService.touch_session(session_id)
            return data

    @staticmethod
    def get_document(doc_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase_admin()
            res = sb.table("documents").select("*").eq("id", doc_id).execute()
            if res.data and len(res.data) > 0:
                doc = res.data[0]
                if user_id:
                    session = SupabaseDBService.get_session(doc["session_id"], user_id)
                    if not session:
                        return None
                return doc
        except Exception:
            pass

        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        r = cursor.fetchone()
        if not r:
            return None
        if user_id:
            session = SupabaseDBService.get_session(r["session_id"], user_id)
            if not session:
                return None

        meta_json = r["metadata_json"]
        meta = {}
        if meta_json:
            try:
                meta = json.loads(meta_json)
            except Exception:
                meta = {}
        if not meta:
            meta = {
                "file_size": r["file_size"] or 0,
                "file_path": r["file_path"],
                "page_count": r["page_count"] or 0,
                "summary": r["summary"],
                "keywords": json.loads(r["keywords"]) if r["keywords"] else [],
                "timeline": json.loads(r["timeline"]) if r["timeline"] else [],
                "entities": json.loads(r["entities"]) if r["entities"] else []
            }

        return {
            "id": r["id"],
            "session_id": r["session_id"],
            "filename": r["filename"],
            "file_type": r["file_type"],
            "status": r["status"],
            "metadata": meta,
            "created_at": str(r["created_at"])
        }

    @staticmethod
    def update_document(doc_id: str, status: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None, filename: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase_admin()
            update_data: Dict[str, Any] = {}
            if status is not None:
                update_data["status"] = status
            if metadata is not None:
                update_data["metadata"] = metadata
            if filename is not None:
                update_data["filename"] = filename
            
            if update_data:
                res = sb.table("documents").update(update_data).eq("id", doc_id).execute()
                if res.data and len(res.data) > 0:
                    doc = res.data[0]
                    if doc.get("session_id"):
                        SupabaseDBService.touch_session(doc["session_id"])
                    return doc
        except Exception:
            pass

        # Update in SQLite
        conn = _get_sqlite_conn()
        existing = SupabaseDBService.get_document(doc_id)
        if not existing:
            return None
        
        current_meta = existing.get("metadata") or {}
        if metadata is not None:
            current_meta.update(metadata)

        with conn:
            if status is not None and metadata is not None:
                conn.execute(
                    "UPDATE documents SET status = ?, summary = ?, keywords = ?, timeline = ?, entities = ?, page_count = ?, metadata_json = ? WHERE id = ?",
                    (
                        status,
                        current_meta.get("summary"),
                        json.dumps(current_meta.get("keywords", [])),
                        json.dumps(current_meta.get("timeline", [])),
                        json.dumps(current_meta.get("entities", [])),
                        current_meta.get("page_count", 0),
                        json.dumps(current_meta),
                        doc_id
                    )
                )
            elif status is not None:
                conn.execute("UPDATE documents SET status = ? WHERE id = ?", (status, doc_id))
            elif filename is not None:
                conn.execute("UPDATE documents SET filename = ? WHERE id = ?", (filename, doc_id))

        if existing.get("session_id"):
            SupabaseDBService.touch_session(existing["session_id"])

        return SupabaseDBService.get_document(doc_id)

    @staticmethod
    def list_session_documents(session_id: str, user_id: str) -> List[Dict[str, Any]]:
        session = SupabaseDBService.get_session(session_id, user_id)
        if not session:
            return []
        try:
            sb = get_supabase_admin()
            res = sb.table("documents").select("*").eq("session_id", session_id).order("created_at", desc=False).execute()
            if res.data is not None:
                return res.data
        except Exception:
            pass

        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
        rows = cursor.fetchall()
        docs = []
        for r in rows:
            meta_json = r["metadata_json"]
            meta = {}
            if meta_json:
                try:
                    meta = json.loads(meta_json)
                except Exception:
                    pass
            if not meta:
                meta = {
                    "file_size": r["file_size"] or 0,
                    "file_path": r["file_path"],
                    "page_count": r["page_count"] or 0,
                    "summary": r["summary"],
                    "keywords": json.loads(r["keywords"]) if r["keywords"] else [],
                    "timeline": json.loads(r["timeline"]) if r["timeline"] else [],
                    "entities": json.loads(r["entities"]) if r["entities"] else []
                }
            docs.append({
                "id": r["id"],
                "session_id": r["session_id"],
                "filename": r["filename"],
                "file_type": r["file_type"],
                "status": r["status"],
                "metadata": meta,
                "created_at": str(r["created_at"])
            })
        return docs

    @staticmethod
    def delete_document(doc_id: str, user_id: str) -> bool:
        doc = SupabaseDBService.get_document(doc_id, user_id)
        if not doc:
            return False
        try:
            sb = get_supabase_admin()
            sb.table("documents").delete().eq("id", doc_id).execute()
        except Exception:
            pass

        conn = _get_sqlite_conn()
        with conn:
            conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        if doc.get("session_id"):
            SupabaseDBService.touch_session(doc["session_id"])
        return True

    @staticmethod
    def create_message(session_id: str, user_id: str, role: str, content: str, sources: Optional[List[Any]] = None) -> Dict[str, Any]:
        session = SupabaseDBService.get_session(session_id, user_id)
        if not session:
            SupabaseDBService.create_session(user_id=user_id, name="Sample-1", session_id=session_id)

        m_id = str(uuid.uuid4())
        now = datetime.datetime.utcnow().isoformat()
        data = {
            "id": m_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "sources": sources or [],
            "created_at": now
        }
        try:
            sb = get_supabase_admin()
            res = sb.table("messages").insert(data).execute()
            SupabaseDBService.touch_session(session_id)
            if res.data and len(res.data) > 0:
                return res.data[0]
            return data
        except Exception:
            conn = _get_sqlite_conn()
            with conn:
                conn.execute(
                    "INSERT INTO chat_messages (id, workspace_id, session_id, role, content, citations, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (m_id, "default", session_id, role, content, json.dumps(sources or []), now)
                )
            SupabaseDBService.touch_session(session_id)
            return data

    @staticmethod
    def list_session_messages(session_id: str, user_id: str) -> List[Dict[str, Any]]:
        session = SupabaseDBService.get_session(session_id, user_id)
        if not session:
            return []
        try:
            sb = get_supabase_admin()
            res = sb.table("messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute()
            if res.data is not None:
                return res.data
        except Exception:
            pass

        conn = _get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
        rows = cursor.fetchall()
        msgs = []
        for r in rows:
            citations_raw = r["citations"]
            citations = []
            if citations_raw:
                try:
                    citations = json.loads(citations_raw)
                except Exception:
                    pass
            msgs.append({
                "id": r["id"],
                "session_id": r["session_id"],
                "role": r["role"],
                "content": r["content"],
                "sources": citations,
                "created_at": str(r["timestamp"])
            })
        return msgs
