"""
Утилиты безопасности: хеширование паролей (bcrypt через passlib),
выпуск/проверка JWT (access), генерация и хеширование refresh-токенов.

Принципы:
- пароль хранится только как хеш;
- refresh-токен в БД хранится как SHA-256 хеш (по сырому значению из cookie);
- access-токен короткоживущий, refresh — длинноживущий и отзываемый.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- Пароли ---

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


# --- Access JWT ---

def create_access_token(subject: str | int, extra: Optional[Dict[str, Any]] = None) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None


# --- Refresh-токены (хранятся как хеш) ---

def generate_refresh_token() -> str:
    """Криптостойкое сырое значение refresh-токена (отдаётся клиенту)."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    """Хеш refresh-токена для хранения в БД (сырое значение не сохраняется)."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


# --- OTP-коды (хранятся как HMAC-хеш, в БД нет открытого кода) ---

def generate_otp(length: Optional[int] = None) -> str:
    """Случайный числовой код заданной длины (4 или 6 цифр)."""
    n = length or settings.OTP_LENGTH
    return "".join(secrets.choice("0123456789") for _ in range(n))


def hash_otp(code: str) -> str:
    """HMAC-SHA256 кода с серверным секретом — в БД хранится только хеш."""
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), code.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_otp(code: str, hashed: str) -> bool:
    """Сравнение в постоянном времени (защита от тайминг-атак)."""
    return hmac.compare_digest(hash_otp(code), hashed)


def otp_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
