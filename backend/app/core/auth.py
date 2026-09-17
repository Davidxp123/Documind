import os
import httpx
from fastapi import Header, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.core.config import settings

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

class AuthenticatedUser(BaseModel):
    id: str
    email: Optional[str] = None
    user_metadata: Dict[str, Any] = {}

async def get_current_user(authorization: Optional[str] = Header(None)) -> AuthenticatedUser:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing"
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format. Expected 'Bearer <token>'"
        )
    
    token = parts[1]
    
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase is not configured on the server"
        )
    
    # Verify token against Supabase Auth API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {token}"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired authentication token"
                )
            
            user_data = response.json()
            user_id = user_data.get("id")
            if not user_id:
                raise HTTPException(
                    status_code=401,
                    detail="User ID not found in token"
                )
            
            return AuthenticatedUser(
                id=user_id,
                email=user_data.get("email"),
                user_metadata=user_data.get("user_metadata", {})
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Auth verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail=f"Token verification failed: {str(e)}"
        )
