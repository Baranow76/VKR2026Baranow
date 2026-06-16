"""
Профиль пользователя: данные аккаунта, обновление, смена пароля, удаление,
статистика и карта активности, управление активными сессиями (refresh-токены).

Все роуты работают строго от лица текущего авторизованного пользователя
(get_current_active_user) и затрагивают только его собственные данные.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.activity import CALC_KINDS
from ..core.security import hash_password, verify_password
from ..database import get_db
from ..deps import get_current_active_user
from ..models import (
    CalculationHistory, ComparisonScenario, Project, RefreshToken, User,
)
from ..schemas import (
    ChangePasswordRequest, DeleteAccountRequest, UserPublic, UserUpdate,
)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
def get_me(user: User = Depends(get_current_active_user)):
    return user


@router.patch("/me", response_model=UserPublic)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None

    if payload.email is not None and payload.email != user.email:
        # Смена email разрешена только для подтверждённых аккаунтов и при уникальности.
        if not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Смена email доступна только для подтверждённых аккаунтов",
            )
        exists = db.query(User).filter(User.email == payload.email, User.id != user.id).first()
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Этот email уже используется другим аккаунтом",
            )
        user.email = payload.email

    db.commit()
    db.refresh(user)
    return user


@router.post("/me/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий пароль указан неверно",
        )
    user.hashed_password = hash_password(payload.new_password)
    # Безопасность: отзываем все refresh-сессии, кроме текущего обновления невозможно
    # отличить — отзываем все, пользователь повторно войдёт на других устройствах.
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False),
    ).update({"revoked": True})
    db.commit()
    return {"status": "password_changed"}


@router.delete("/me")
def delete_me(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль указан неверно — удаление отменено",
        )
    # Каскад (all, delete-orphan) удалит проекты, токены, OTP и связанные данные.
    db.delete(user)
    db.commit()
    return {"status": "account_deleted"}


@router.get("/me/stats")
def get_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Статистика по реальным данным пользователя (проекты, расчёты, сценарии)."""
    projects_count = db.query(func.count(Project.id)).filter(Project.user_id == user.id).scalar() or 0
    scenarios_count = (
        db.query(func.count(ComparisonScenario.id))
        .filter(ComparisonScenario.user_id == user.id)
        .scalar() or 0
    )

    events = (
        db.query(CalculationHistory.module, CalculationHistory.created_at)
        .filter(CalculationHistory.user_id == user.id)
        .all()
    )
    module_runs: Counter = Counter()
    calc_total = 0
    last_calc_at = None
    last_activity_at = None
    for module, created_at in events:
        if last_activity_at is None or (created_at and created_at > last_activity_at):
            last_activity_at = created_at
        if module in CALC_KINDS:
            calc_total += 1
            module_runs[module] += 1
            if last_calc_at is None or (created_at and created_at > last_calc_at):
                last_calc_at = created_at

    return {
        "active_projects": projects_count,
        "total_calculations": calc_total,
        "comparison_scenarios": scenarios_count,
        "last_calculation_at": last_calc_at.isoformat() if last_calc_at else None,
        "last_activity_at": last_activity_at.isoformat() if last_activity_at else None,
        "module_runs": dict(module_runs),
        "member_since": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/me/activity")
def get_activity(
    days: int = 365,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """
    Карта активности (heatmap) по дням за период. Строится по реальным событиям
    пользователя из CalculationHistory + датам создания/обновления проектов и
    созданию сценариев сравнения.
    """
    days = max(1, min(days, 366))
    since = datetime.now(timezone.utc) - timedelta(days=days)

    counts: Counter = Counter()
    by_kind: Counter = Counter()

    def bump(dt, kind):
        if not dt:
            return
        key = dt.date().isoformat()
        counts[key] += 1
        by_kind[kind] += 1

    for (created_at, module) in (
        db.query(CalculationHistory.created_at, CalculationHistory.module)
        .filter(CalculationHistory.user_id == user.id)
        .all()
    ):
        bump(created_at, module)

    for (created_at,) in (
        db.query(ComparisonScenario.created_at)
        .filter(ComparisonScenario.user_id == user.id)
        .all()
    ):
        bump(created_at, "scenario_create")

    # Проекты: дата создания как событие (обновления уже фиксируются project_save).
    for (created_at,) in db.query(Project.created_at).filter(Project.user_id == user.id).all():
        bump(created_at, "project_create")

    series = [{"date": d, "count": c} for d, c in sorted(counts.items())]
    return {
        "days": days,
        "from": since.date().isoformat(),
        "to": datetime.now(timezone.utc).date().isoformat(),
        "total_events": sum(counts.values()),
        "by_kind": dict(by_kind),
        "days_active": len(counts),
        "series": series,
    }


@router.get("/me/sessions")
def get_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Активные (не отозванные, не истёкшие) refresh-сессии пользователя."""
    now = datetime.now(timezone.utc)
    tokens = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .order_by(RefreshToken.created_at.desc())
        .all()
    )
    result = []
    for t in tokens:
        expires = t.expires_at.replace(tzinfo=timezone.utc) if t.expires_at and t.expires_at.tzinfo is None else t.expires_at
        if expires and expires < now:
            continue
        result.append({
            "id": t.id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        })
    return {"sessions": result, "count": len(result)}


@router.post("/me/sessions/revoke-all")
def revoke_all_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Выход со всех устройств: отзывает все refresh-токены пользователя."""
    revoked = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .update({"revoked": True})
    )
    db.commit()
    return {"status": "revoked_all", "revoked": int(revoked or 0)}
