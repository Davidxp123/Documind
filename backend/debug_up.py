import httpx
import os
import time
from dotenv import load_dotenv

load_dotenv('d:/Documind/backend/.env')
from supabase import create_client

sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
email = f'test_up_{int(time.time())}@test.com'
u = sb.auth.admin.create_user({'email': email, 'password': 'Password123!', 'email_confirm': True})
token = sb.auth.sign_in_with_password({'email': email, 'password': 'Password123!'}).session.access_token

headers = {'Authorization': f'Bearer {token}'}
r_sess = httpx.post('http://127.0.0.1:8000/api/v1/workspaces/default/sessions', json={'name': 'Test Session'}, headers=headers)
print('Session status:', r_sess.status_code, r_sess.text)
s_id = r_sess.json()['id']
print('Session ID:', s_id)

files = {'file': ('test.txt', b'Hello world content', 'text/plain')}
data = {'workspace_id': 'default', 'session_id': s_id}
r_up = httpx.post('http://127.0.0.1:8000/api/v1/documents/upload', files=files, data=data, headers=headers)
print('Upload status:', r_up.status_code)
print('Upload text:', r_up.text)
sb.auth.admin.delete_user(u.user.id)
