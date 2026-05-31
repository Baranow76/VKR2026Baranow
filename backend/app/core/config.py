"""
Конфигурация приложения. Секреты и параметры читаются из переменных окружения
(.env), значения по умолчанию пригодны только для локальной разработки.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Безопасность / JWT ---
    SECRET_KEY: str = Field(
        default="dev-insecure-secret-change-me-in-production-env-0123456789",
        description="Секрет для подписи JWT (в продакшене задать через .env)",
    )
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=14)

    # --- База данных ---
    DATABASE_URL: str = Field(default="sqlite:///./app/data/modernization.db")

    # --- CORS ---
    # Список доменов фронтенда. В production НЕ использовать "*" вместе с credentials.
    CORS_ORIGINS: List[str] = Field(default=["http://localhost:5173", "http://127.0.0.1:5173"])

    # --- Режим совместимости ---
    # False (dev): запросы без токена работают от лица служебного пользователя,
    # чтобы не ломать текущий фронтенд. True (prod): все защищённые роуты требуют токен.
    AUTH_REQUIRED: bool = Field(default=False)
    DEFAULT_USER_EMAIL: str = Field(default="demo@local")
    DEFAULT_USER_PASSWORD: str = Field(default="demo-password")

    # --- OTP (подтверждение email одноразовым кодом) ---
    OTP_LENGTH: int = Field(default=6, description="Длина кода: 4 или 6 цифр")
    OTP_EXPIRE_MINUTES: int = Field(default=10, description="Срок жизни кода, мин")
    OTP_MAX_ATTEMPTS: int = Field(default=5, description="Макс. число попыток ввода")
    OTP_RESEND_INTERVAL_SECONDS: int = Field(default=60, description="Минимум между повторными отправками")

    # --- SMTP (отправка письма с кодом) ---
    SMTP_HOST: str = Field(default="", description="Если пусто — dev-режим: код выводится в лог")
    SMTP_PORT: int = Field(default=587)
    SMTP_USER: str = Field(default="")
    SMTP_PASSWORD: str = Field(default="")
    SMTP_FROM_EMAIL: str = Field(default="no-reply@modernization.local")
    SMTP_USE_TLS: bool = Field(default=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
