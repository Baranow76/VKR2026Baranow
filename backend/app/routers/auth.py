

"""
Роуты аутентификации: регистрация, вход, обновление токена, выход, профиль.

Стратегия токенов:
- access-токен (короткоживущий) возвращается в теле; фронтенд хранит его в памяти;
- refresh-токен (длинноживущий, отзываемый) устанавливается в httpOnly cookie,
  а в БД хранится только его SHA-256 хеш. Обновление выполняет ротацию токена.
"""
from __future__ import annotations

from datetime import datetime, timezone

from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.email import send_otp_email
from ..core.security import (
    create_access_token, generate_otp, generate_refresh_token, hash_otp, hash_password,
    hash_refresh_token, otp_expiry, refresh_token_expiry, verify_otp as verify_otp_code,
    verify_password,
)
from ..database import get_db
from ..deps import get_current_active_user
from ..models import OtpCode, RefreshToken, User
from ..schemas import (
    RefreshRequest, RegisterResponse, ResendOtpRequest, TokenResponse,
    UserCreate, UserLogin, UserPublic, VerifyOtpRequest,
)

OTP_PURPOSE = "email_verification"


def _aware(dt: datetime) -> datetime:
    """Приводит naive-datetime из SQLite к UTC-aware для корректного сравнения."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _issue_otp(db: Session, user: User) -> str:
    """Инвалидирует прежние коды пользователя и выпускает новый. Возвращает сырой код."""
    db.query(OtpCode).filter(
        OtpCode.user_id == user.id,
        OtpCode.purpose == OTP_PURPOSE,
        OtpCode.is_used.is_(False),
    ).update({"is_used": True, "used_at": datetime.now(timezone.utc)})
    code = generate_otp()
    db.add(OtpCode(
        user_id=user.id,
        code_hash=hash_otp(code),
        purpose=OTP_PURPOSE,
        expires_at=otp_expiry(),
        max_attempts=settings.OTP_MAX_ATTEMPTS,
    ))
    db.commit()
    send_otp_email(user.email, code)  # dev: код выводится в лог, если SMTP не настроен
    return code

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_token,
        httponly=True,
        samesite="lax",
        secure=False,  # PROD: True (только по HTTPS)
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path="/api/auth",
    )


def _issue_tokens(user: User, db: Session, response: Response) -> TokenResponse:
    access = create_access_token(user.id)
    raw_refresh = generate_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=refresh_token_expiry(),
    ))
    db.commit()
    _set_refresh_cookie(response, raw_refresh)
    return TokenResponse(
        access_token=access,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=raw_refresh,
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Создаёт пользователя (is_verified=False) и отправляет OTP. Токены НЕ выдаются."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Пользователь с таким email уже существует")
        # Неподтверждённый аккаунт: обновляем данные и перевыпускаем код (повторная регистрация).
        existing.hashed_password = hash_password(payload.password)
        if payload.full_name:
            existing.full_name = payload.full_name
        db.commit()
        _issue_otp(db, existing)
        return RegisterResponse(email=existing.email)

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _issue_otp(db, user)
    return RegisterResponse(email=user.email)


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    # Единое сообщение: не раскрываем, что именно неверно (email или пароль).
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Пользователь неактивен")
    if not user.is_verified:
        # Структурированная ошибка: фронтенд по code перенаправит на экран ввода OTP.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "Email не подтверждён. Введите код из письма.",
                "email": user.email,
            },
        )
    return _issue_tokens(user, db, response)


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp_route(payload: VerifyOtpRequest, response: Response, db: Session = Depends(get_db)):
    """Проверяет код. При успехе помечает пользователя подтверждённым и логинит (выдаёт токены)."""
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Неверный или истёкший код подтверждения")

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise invalid  # не раскрываем, существует ли email
    if user.is_verified:
        return _issue_tokens(user, db, response)  # идемпотентно: уже подтверждён

    rec = (
        db.query(OtpCode)
        .filter(OtpCode.user_id == user.id, OtpCode.purpose == OTP_PURPOSE, OtpCode.is_used.is_(False))
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    if rec is None or _aware(rec.expires_at) < now:
        raise invalid
    if rec.attempts >= rec.max_attempts:
        rec.is_used = True
        rec.used_at = now
        db.commit()
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Слишком много попыток. Запросите новый код.")

    if not verify_otp_code(payload.code, rec.code_hash):
        rec.attempts += 1
        if rec.attempts >= rec.max_attempts:
            rec.is_used = True
            rec.used_at = now
        db.commit()
        raise invalid

    # Успех: код использован, пользователь подтверждён → авто-логин.
    rec.is_used = True
    rec.used_at = now
    user.is_verified = True
    db.commit()
    return _issue_tokens(user, db, response)


@router.post("/resend-otp")
def resend_otp(payload: ResendOtpRequest, db: Session = Depends(get_db)):
    """Повторно отправляет код с ограничением частоты (anti-spam)."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user and not user.is_verified:
        last = (
            db.query(OtpCode)
            .filter(OtpCode.user_id == user.id, OtpCode.purpose == OTP_PURPOSE)
            .order_by(OtpCode.created_at.desc())
            .first()
        )
        if last is not None:
            elapsed = (datetime.now(timezone.utc) - _aware(last.created_at)).total_seconds()
            if elapsed < settings.OTP_RESEND_INTERVAL_SECONDS:
                wait = int(settings.OTP_RESEND_INTERVAL_SECONDS - elapsed)
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                    detail=f"Запросить новый код можно через {wait} с")
        _issue_otp(db, user)
    # Единый ответ — не раскрываем существование/статус аккаунта.
    return {"status": "sent", "message": "Если аккаунт существует и не подтверждён, код отправлен повторно."}


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    body: Optional[RefreshRequest] = Body(default=None),
    db: Session = Depends(get_db),
):
    # Приоритет — httpOnly cookie (prod); fallback — тело запроса (cross-origin dev).
    raw = request.cookies.get(REFRESH_COOKIE) or (body.refresh_token if body else None)
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Отсутствует refresh-токен")

    token_hash = hash_refresh_token(raw)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    expires = record.expires_at.replace(tzinfo=timezone.utc) if record and record.expires_at.tzinfo is None else (record.expires_at if record else None)
    if record is None or record.revoked or (expires and expires < datetime.now(timezone.utc)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")

    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")

    # Ротация: старый токен отзывается, выдаётся новый.
    record.revoked = True
    db.commit()
    return _issue_tokens(user, db, response)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    body: Optional[RefreshRequest] = Body(default=None),
    db: Session = Depends(get_db),
):
    raw = request.cookies.get(REFRESH_COOKIE) or (body.refresh_token if body else None)
    if raw:
        record = db.query(RefreshToken).filter(
            RefreshToken.token_hash == hash_refresh_token(raw)
        ).first()
        if record and not record.revoked:
            record.revoked = True
            db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")
    return {"status": "logged_out"}


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_active_user)):
    return user
