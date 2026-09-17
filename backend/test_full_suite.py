import httpx
import time
import os
from dotenv import load_dotenv

load_dotenv('d:/Documind/backend/.env')

from supabase import create_client

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
BACKEND_URL = 'http://127.0.0.1:8000/api/v1'

print("=== DOCUMIND SUPABASE AUTH & SCOPING VALIDATION ===")

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Create two separate test accounts
ts = int(time.time())
email_a = f"test_user_a_{ts}@documind.test"
email_b = f"test_user_b_{ts}@documind.test"
password = "Password123!Secure"

print(f"\n1. Creating test users in Supabase Auth...")
user_a = sb.auth.admin.create_user({
    "email": email_a,
    "password": password,
    "email_confirm": True
})
print(f"   [PASS] Created User A: {user_a.user.id} ({email_a})")

user_b = sb.auth.admin.create_user({
    "email": email_b,
    "password": password,
    "email_confirm": True
})
print(f"   [PASS] Created User B: {user_b.user.id} ({email_b})")

# 2. Login as User A and get access token
auth_a = sb.auth.sign_in_with_password({"email": email_a, "password": password})
token_a = auth_a.session.access_token
print(f"\n2. Authenticated User A -> Token obtained (len={len(token_a)})")

# Login as User B and get access token
auth_b = sb.auth.sign_in_with_password({"email": email_b, "password": password})
token_b = auth_b.session.access_token
print(f"   Authenticated User B -> Token obtained (len={len(token_b)})")

# 3. Test unauthenticated request rejection (401)
print("\n3. Testing Unauthenticated Request Rejection:")
r_no_auth = httpx.get(f"{BACKEND_URL}/workspaces/default/sessions")
print(f"   GET /workspaces/default/sessions without token -> Status: {r_no_auth.status_code}")
assert r_no_auth.status_code == 401, f"Expected 401, got {r_no_auth.status_code}"
print("   [PASS] Unauthenticated request rejected with 401")

# 4. User A creates session
print("\n4. User A creates a session:")
headers_a = {"Authorization": f"Bearer {token_a}"}
headers_b = {"Authorization": f"Bearer {token_b}"}

r_sess_a = httpx.post(f"{BACKEND_URL}/workspaces/default/sessions", json={"name": "User A Financial Report"}, headers=headers_a)
print(f"   POST /workspaces/default/sessions -> Status: {r_sess_a.status_code}, Body: {r_sess_a.json()}")
assert r_sess_a.status_code == 200
session_a_id = r_sess_a.json()["id"]

# 5. User A lists sessions
r_list_a = httpx.get(f"{BACKEND_URL}/workspaces/default/sessions", headers=headers_a)
print(f"   User A list sessions -> count: {len(r_list_a.json())}, names: {[s['name'] for s in r_list_a.json()]}")
assert any(s["id"] == session_a_id for s in r_list_a.json())
print("   [PASS] User A sees their own session")

# 6. User B lists sessions (should NOT see User A's session)
print("\n5. User B lists sessions (Multi-user Isolation Check):")
r_list_b = httpx.get(f"{BACKEND_URL}/workspaces/default/sessions", headers=headers_b)
print(f"   User B list sessions -> count: {len(r_list_b.json())}, names: {[s['name'] for s in r_list_b.json()]}")
assert not any(s["id"] == session_a_id for s in r_list_b.json())
print("   [PASS] User B CANNOT see User A's session")

# 7. User B tries to query or fetch messages from User A's session (should return empty/404)
print("\n6. User B attempts unauthorized access to User A's session:")
r_b_on_a_docs = httpx.get(f"{BACKEND_URL}/documents/session/{session_a_id}/documents", headers=headers_b)
print(f"   User B GET documents for User A session -> {r_b_on_a_docs.json()}")
assert len(r_b_on_a_docs.json()) == 0

r_b_on_a_msgs = httpx.get(f"{BACKEND_URL}/documents/session/{session_a_id}/messages", headers=headers_b)
print(f"   User B GET messages for User A session -> {r_b_on_a_msgs.json()}")
assert len(r_b_on_a_msgs.json()) == 0

r_b_query_a = httpx.post(f"{BACKEND_URL}/documents/query", json={"session_id": session_a_id, "query": "What is in here?"}, headers=headers_b)
print(f"   User B POST /documents/query for User A session -> Status: {r_b_query_a.status_code}")
assert r_b_query_a.status_code == 404
print("   [PASS] Cross-user access properly blocked and rejected!")

# 8. User A uploads a document to their session
print("\n7. User A uploads a test document:")
test_doc_content = b"DocuMind Financial Summary 2026: Revenue reached $45 Million in Q3. Projected growth is 35% for next fiscal year."
files = {"file": ("financial_summary.txt", test_doc_content, "text/plain")}
data = {"workspace_id": "default", "session_id": session_a_id}
r_upload = httpx.post(f"{BACKEND_URL}/documents/upload", files=files, data=data, headers=headers_a)
print(f"   Upload response -> Status: {r_upload.status_code}, Body: {r_upload.json()}")
assert r_upload.status_code == 200
doc_id = r_upload.json()["doc"]["id"]
print("   [PASS] Document upload initiated")

# Wait a moment for background processing
time.sleep(3)

# 9. User A queries the document
print("\n8. User A queries RAG pipeline:")
r_query = httpx.post(f"{BACKEND_URL}/documents/query", json={"session_id": session_a_id, "query": "What was the revenue in Q3 2026?"}, headers=headers_a)
print(f"   Query response -> Status: {r_query.status_code}, Answer: {r_query.json().get('answer')}")
assert r_query.status_code == 200
print("   [PASS] RAG query answered successfully")

# 10. User A checks persisted messages
print("\n9. User A retrieves persisted messages:")
r_msgs = httpx.get(f"{BACKEND_URL}/documents/session/{session_a_id}/messages", headers=headers_a)
msgs = r_msgs.json()
print(f"   Messages count: {len(msgs)}")
for m in msgs:
    print(f"   [{m['role'].upper()}]: {m['content'][:60]}...")
assert len(msgs) >= 2
print("   [PASS] Messages persisted and restored")

# 11. Cleanup test users from Supabase Auth
print("\n10. Cleaning up test accounts from Supabase...")
sb.auth.admin.delete_user(user_a.user.id)
sb.auth.admin.delete_user(user_b.user.id)
print("   [PASS] Test users cleaned up successfully")

print("\n=== ALL AUTH, PERSISTENCE, SCOPING & ISOLATION CHECKS PASSED! ===")
