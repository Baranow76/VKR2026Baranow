"""
Модели данных (SQLAlchemy 2.0, типизированные Mapped/mapped_column).

Архитектура связей направленная (без циклов):
    User → Project → {ProductionItem, RobotOperation, RiskEvent, RiskStrategy,
                      EconomicPeriod, CalculationHistory, ComparisonScenario}
    User → RefreshToken

Скалярные параметры модулей (фонд времени, такт, ограничения робота, база рисков,
ставка дисконтирования и т.п.) хранятся колонками в Project; позиции/операции/
периоды — в отдельных нормализованных таблицах. JSON используется точечно:
гибкие векторы (риски по событиям, коэффициенты Гурвица) и снапшоты расчётов.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# ---------------------------------------------------------------------------
# Пользователи и сессии
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Подтверждён ли email одноразовым кодом (OTP). До подтверждения вход запрещён.
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    projects: Mapped[List["Project"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan",
    )
    refresh_tokens: Mapped[List["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
    )
    otp_codes: Mapped[List["OtpCode"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    # Хранится ХЕШ refresh-токена, не сырое значение.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class OtpCode(Base):
    """Одноразовые коды подтверждения (email_verification и др.). Хранится только хеш."""
    __tablename__ = "otp_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(40), index=True, default="email_verification")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    user: Mapped["User"] = relationship(back_populates="otp_codes")


# ---------------------------------------------------------------------------
# Центральная сущность — проект
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Скаляры производственной программы
    time_fund: Mapped[float] = mapped_column(Float, default=0.0)
    takt: Mapped[float] = mapped_column(Float, default=0.0)
    # Скаляры роботизированных звеньев
    max_machines_per_robot: Mapped[int] = mapped_column(Integer, default=3)
    max_deviation: Mapped[float] = mapped_column(Float, default=0.0)
    # Скаляры анализа рисков
    base_loss: Mapped[float] = mapped_column(Float, default=0.0)
    profitability_threshold: Mapped[float] = mapped_column(Float, default=0.0)
    hurwicz_coefficients: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Скаляры экономики
    initial_investment: Mapped[float] = mapped_column(Float, default=0.0)
    discount_rate: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    owner: Mapped["User"] = relationship(back_populates="projects")

    production_items: Mapped[List["ProductionItem"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ProductionItem.position",
    )
    robot_operations: Mapped[List["RobotOperation"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="RobotOperation.position",
    )
    risk_events: Mapped[List["RiskEvent"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="RiskEvent.position",
    )
    risk_strategies: Mapped[List["RiskStrategy"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="RiskStrategy.position",
    )
    economic_periods: Mapped[List["EconomicPeriod"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="EconomicPeriod.year",
    )
    histories: Mapped[List["CalculationHistory"]] = relationship(
        back_populates="project", cascade="all, delete-orphan",
    )
    scenarios: Mapped[List["ComparisonScenario"]] = relationship(
        back_populates="project", cascade="all, delete-orphan",
    )


# ---------------------------------------------------------------------------
# Нормализованные данные модулей
# ---------------------------------------------------------------------------

class ProductionItem(Base):
    __tablename__ = "production_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    setup_time: Mapped[float] = mapped_column(Float, default=0.0)
    group: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="production_items")


class RobotOperation(Base):
    __tablename__ = "robot_operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    top: Mapped[float] = mapped_column(Float, default=0.0)
    kz: Mapped[float] = mapped_column(Float, default=0.0)
    service_time: Mapped[float] = mapped_column(Float, default=0.0)
    machine: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="robot_operations")


class RiskEvent(Base):
    __tablename__ = "risk_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    project: Mapped["Project"] = relationship(back_populates="risk_events")


class RiskStrategy(Base):
    __tablename__ = "risk_strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    # Вектор рисков по событиям (выровнен по порядку RiskEvent) — оправданный JSON.
    risks: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="risk_strategies")


class EconomicPeriod(Base):
    __tablename__ = "economic_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)

    year: Mapped[int] = mapped_column(Integer, default=1)
    inflow: Mapped[float] = mapped_column(Float, default=0.0)
    operating_costs: Mapped[float] = mapped_column(Float, default=0.0)
    risk_losses: Mapped[float] = mapped_column(Float, default=0.0)
    maintenance_costs: Mapped[float] = mapped_column(Float, default=0.0)
    additional_investment: Mapped[float] = mapped_column(Float, default=0.0)

    project: Mapped["Project"] = relationship(back_populates="economic_periods")


# ---------------------------------------------------------------------------
# История расчётов и сценарии сравнения
# ---------------------------------------------------------------------------

class CalculationHistory(Base):
    __tablename__ = "calculation_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True, nullable=True)

    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    input_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    project: Mapped[Optional["Project"]] = relationship(back_populates="histories")


class ComparisonScenario(Base):
    __tablename__ = "comparison_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"), index=True, nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Снапшот исходных данных и результата сценария — оправданный JSON.
    source_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    project: Mapped[Optional["Project"]] = relationship(back_populates="scenarios")
