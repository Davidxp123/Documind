import os
from supabase import create_client, Client
from app.core.config import settings

# Load SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

supabase_admin: Client | None = None

if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        print("[INFO] Supabase Admin Client initialized successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to initialize Supabase Admin Client: {e}")
        supabase_admin = None
else:
    print("[WARN] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured.")

def get_supabase_admin() -> Client:
    if supabase_admin is None:
        raise RuntimeError("Supabase Admin Client is not initialized. Please verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return supabase_admin
