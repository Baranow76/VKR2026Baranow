"""
Отправка писем (OTP-коды подтверждения).

Если SMTP не настроен (SMTP_HOST пустой) — DEV-режим: код выводится в лог,
письмо не отправляется. В production задайте SMTP_* в .env.
Ошибки отправки логируются и не роняют запрос.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

logger = logging.getLogger("app.email")


def _build_otp_message(to_email: str, code: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Код подтверждения — Modernization IS"
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to_email
    msg.set_content(
        f"Ваш код подтверждения: {code}\n\n"
        f"Код действует {settings.OTP_EXPIRE_MINUTES} минут. "
        f"Если вы не регистрировались, проигнорируйте это письмо."
    )
    return msg


def send_otp_email(to_email: str, code: str) -> bool:
    """
    Отправляет код на email. Возвращает True, если письмо отправлено по SMTP.

    DEV (SMTP не настроен): код пишется в лог, возвращается False.
    """
    if not settings.SMTP_HOST:
        # ВНИМАНИЕ: только для разработки. В production SMTP обязателен,
        # код НЕ должен попадать в логи/ответ API.
        logger.warning("[DEV-OTP] Код подтверждения для %s: %s", to_email, code)
        return False

    try:
        msg = _build_otp_message(to_email, code)
        if settings.SMTP_USE_TLS:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.starttls(context=context)
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        logger.info("OTP-письмо отправлено на %s", to_email)
        return True
    except Exception as exc:  # noqa: BLE001 — не роняем регистрацию из-за SMTP
        logger.error("Не удалось отправить OTP на %s: %s", to_email, exc)
        return False
