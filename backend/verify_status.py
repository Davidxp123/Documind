import os
from dotenv import load_dotenv

load_dotenv('d:/Documind/backend/.env')

from supabase import create_client

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

print(f"SUPABASE_URL: {supabase_url}")
sb = create_client(supabase_url, supabase_key)

try:
    users = sb.auth.admin.list_users()
    print(f"[OK] Supabase Auth Admin works! Total registered users: {len(users)}")
except Exception as e:
    print(f"[ERROR] Supabase Auth Admin error: {e}")

for tbl in ['sessions', 'documents', 'messages']:
    try:
        res = sb.table(tbl).select('*').limit(1).execute()
        print(f"[OK] Supabase table '{tbl}' exists! Data: {res.data}")
    except Exception as e:
        print(f"[WARN] Supabase table '{tbl}' not found or error: {e}")
