from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

from config import settings
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    username: str
    role: str = "admin"


class TokenResponse(BaseModel):
    token: str
    user: UserInfo


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = verify_token(credentials.credentials)
    username = payload.get("sub")
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id, username, created_at FROM users WHERE username = ?", (username,))
        user = await cursor.fetchone()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return {"id": user[0], "username": user[1], "created_at": user[2]}
    finally:
        await db.close()


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (req.username,))
        user = await cursor.fetchone()
        if user is None or not bcrypt.checkpw(req.password.encode(), user[2].encode()):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
        token = create_access_token({"sub": user[1]})
        return TokenResponse(token=token, user=UserInfo(username=user[1]))
    finally:
        await db.close()


@router.get("/me", response_model=UserInfo)
async def me(current_user: dict = Depends(get_current_user)):
    return UserInfo(username=current_user["username"])
