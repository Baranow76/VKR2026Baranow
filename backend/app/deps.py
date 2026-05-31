"""
Зависимости аутентификации FastAPI.

- get_current_user        — строго требует валидный access-токен (иначе 401);
- get_current_active_user — дополнительно проверяет активность пользователя (иначе 403);
- get_request_user        — рабочий резолвер для роутов проектов:
  при наличии токена возвращает его владельца; если токена нет и AUTH_REQUIRED=False
  (режим разработки), возвращает служебного пользователя, чтобы не ломать текущий
  фронтенд без экрана входа. В production (AUTH_REQUIRED=True) — всегда требует токен.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .core.config import settings
from .core.security import decode_token, hash_password
from .database import get_db
from .models import User

# auto_error=False — сами решаем, требовать токен или нет (для dev-совместимости).
_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Не удалось подтвердить учётные данные",
    headers={"WWW-Authenticate": "Bearer"},
)


def _user_from_token(token: str, db: Session) -> Optional[User]:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        return None
    return db.get(User, user_id)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise _CREDENTIALS_EXC
    user = _user_from_token(creds.credentials, db)
    if user is None:
        raise _CREDENTIALS_EXC
    return user


def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь неактивен")
    return user


def get_or_create_default_user(db: Session) -> User:
    """Служебный пользователь для dev-режима (владелец «ничьих» проектов)."""
    user = db.query(User).filter(User.email == settings.DEFAULT_USER_EMAIL).first()
    if user is None:
        user = User(
            email=settings.DEFAULT_USER_EMAIL,
            full_name="Демо-пользователь",
            hashed_password=hash_password(settings.DEFAULT_USER_PASSWORD),
            is_active=True,
            is_verified=True,  # служебный аккаунт не требует подтверждения
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_request_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Резолвер пользователя для роутов проектов (с dev-совместимостью)."""
    if creds and creds.credentials:
        user = _user_from_token(creds.credentials, db)
        if user is None:
            raise _CREDENTIALS_EXC
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь неактивен")
        return user
    if settings.AUTH_REQUIRED:
        raise _CREDENTIALS_EXC
    return get_or_create_default_user(db)
