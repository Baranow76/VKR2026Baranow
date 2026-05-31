from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


class ProductionItem(BaseModel):
    name: str = Field(..., min_length=1, description="Наименование изделия")
    quantity: int = Field(..., gt=0, description="Объем выпуска")
    setup_time: float = Field(..., ge=0, description="Время переналадки")
    group: Optional[str] = Field(default=None, description="Группа/семейство изделия")
    comment: Optional[str] = None


class ProductionRequest(BaseModel):
    time_fund: float = Field(..., gt=0, description="Доступный фонд времени")
    takt: float = Field(..., gt=0, description="Такт работы оборудования")
    items: List[ProductionItem] = Field(..., min_length=1)


class RoboticOperation(BaseModel):
    name: str = Field(..., min_length=1, description="Номер или название операции")
    top: float = Field(..., gt=0, description="Оперативное время")
    kz: float = Field(..., gt=0, le=1, description="Плановый коэффициент загрузки")
    service_time: float = Field(..., ge=0, description="Время обслуживания роботом / to")
    machine: Optional[str] = None
    comment: Optional[str] = None


class RoboticsRequest(BaseModel):
    max_machines_per_robot: int = Field(..., gt=0)
    max_deviation: float = Field(..., ge=0)
    operations: List[RoboticOperation] = Field(..., min_length=1)


class RiskStrategy(BaseModel):
    name: str = Field(..., min_length=1)
    cost: float = Field(..., ge=0, description="Стоимость реализации стратегии")
    risks: List[float] = Field(..., min_length=1, description="Риски по событиям, %")


class RiskRequest(BaseModel):
    events: List[str] = Field(..., min_length=1)
    base_loss: float = Field(..., ge=0, description="База для расчета упущенной выгоды")
    profitability_threshold: float = Field(..., description="Порог рентабельности проекта")
    strategies: List[RiskStrategy] = Field(..., min_length=1)
    hurwicz_coefficients: List[float] = Field(default_factory=lambda: [0.3, 0.5, 0.7, 0.8, 0.9])

    @model_validator(mode="after")
    def validate_dimensions(self):
        event_count = len(self.events)
        for strategy in self.strategies:
            if len(strategy.risks) != event_count:
                raise ValueError(
                    f"У стратегии '{strategy.name}' количество рисков ({len(strategy.risks)}) "
                    f"не совпадает с количеством событий ({event_count})."
                )
        for x in self.hurwicz_coefficients:
            if not 0 <= x <= 1:
                raise ValueError("Коэффициенты Гурвица должны быть в диапазоне от 0 до 1.")
        return self


class CashFlowPeriod(BaseModel):
    year: int = Field(..., ge=1)
    inflow: float = Field(..., description="Дополнительный денежный поток/выручка/эффект")
    operating_costs: float = Field(default=0, ge=0)
    risk_losses: float = Field(default=0, ge=0)
    maintenance_costs: float = Field(default=0, ge=0)
    additional_investment: float = Field(default=0, ge=0)


class EconomicsRequest(BaseModel):
    initial_investment: float = Field(..., gt=0)
    discount_rate: float = Field(..., ge=0, description="Ставка дисконтирования: 0.18 или 18")
    periods: List[CashFlowPeriod] = Field(..., min_length=1)


class FullProjectRequest(BaseModel):
    name: str = Field(default="Проект инновационной модернизации")
    production: Optional[ProductionRequest] = None
    robotics: Optional[RoboticsRequest] = None
    risks: Optional[RiskRequest] = None
    economics: Optional[EconomicsRequest] = None


# ---------------------------------------------------------------------------
# Схемы ИИ-модуля: прогнозирование отказов оборудования (predictive maintenance)
# Датасет AI4I 2020 (UCI id=601). Используются модулем app/ml.
# ---------------------------------------------------------------------------

class EquipmentParamsRequest(BaseModel):
    """Рабочие параметры единицы оборудования для прогноза вероятности отказа."""

    type_class: str = Field(
        default="M",
        description="Класс качества изделия: L (низкий), M (средний), H (высокий)",
    )
    air_temperature: float = Field(
        ..., gt=0, description="Температура воздуха, K (диапазон датасета ~295–305)"
    )
    process_temperature: float = Field(
        ..., gt=0, description="Температура процесса, K (диапазон ~305–314)"
    )
    rotational_speed: float = Field(
        ..., gt=0, description="Скорость вращения, об/мин (диапазон ~1160–2890)"
    )
    torque: float = Field(
        ..., ge=0, description="Крутящий момент, Н·м (диапазон ~3–77)"
    )
    tool_wear: float = Field(
        ..., ge=0, description="Износ инструмента, мин (диапазон ~0–253)"
    )


# ---------------------------------------------------------------------------
# Схемы NLU-модуля: интеллектуальный редактор данных по текстовой команде.
# ---------------------------------------------------------------------------

class ParseCommandRequest(BaseModel):
    """Запрос на разбор команды и предпросмотр изменений (без применения)."""

    command: str = Field(..., min_length=1, description="Команда на естественном языке")
    records: List[dict] = Field(
        default_factory=list, description="Записи проекта, над которыми выполняется действие"
    )
    module_type: Optional[str] = Field(default=None, description="Тип модуля-контекста")
    allowed_parameters: Optional[List[str]] = Field(
        default=None, description="Параметры, допустимые в текущем модуле"
    )
    target_groups: Optional[List[str]] = Field(
        default=None, description="Целевые группы, доступные в текущем модуле"
    )


class ApplyCommandRequest(BaseModel):
    """Запрос на применение команды к записям проекта."""

    command: str = Field(..., min_length=1, description="Команда на естественном языке")
    records: List[dict] = Field(default_factory=list, description="Записи проекта")
    confirm: bool = Field(
        default=False, description="Подтверждение применения при большом числе изменений"
    )
    module_type: Optional[str] = Field(default=None, description="Тип модуля-контекста")
    allowed_parameters: Optional[List[str]] = Field(
        default=None, description="Параметры, допустимые в текущем модуле"
    )
    target_groups: Optional[List[str]] = Field(
        default=None, description="Целевые группы, доступные в текущем модуле"
    )


class ApplyChangesRequest(BaseModel):
    """Применение выверенного пользователем набора изменений (после правок preview)."""

    records: List[dict] = Field(default_factory=list, description="Записи проекта")
    changes: List[dict] = Field(
        default_factory=list, description="Отобранные/отредактированные изменения"
    )
    source_object: Optional[str] = Field(
        default=None, description="Имя записи-источника (для копий)"
    )


# ---------------------------------------------------------------------------
# Схемы авторизации и аутентификации
# ---------------------------------------------------------------------------

from pydantic import EmailStr  # noqa: E402


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128, description="Пароль (минимум 8 символов)")
    full_name: Optional[str] = Field(default=None, max_length=255)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool = False
    is_verified: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Профиль пользователя ---

class UserUpdate(BaseModel):
    """Частичное обновление профиля. Email меняется только для подтверждённых аккаунтов."""
    full_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[EmailStr] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128, description="Подтверждение паролем")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Время жизни access-токена, сек")
    refresh_token: Optional[str] = Field(default=None, description="Возвращается в теле только если не используется cookie")


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = None


# --- OTP: подтверждение email одноразовым кодом ---

class RegisterResponse(BaseModel):
    """Ответ регистрации: токены НЕ выдаются до подтверждения email."""
    status: str = "verification_required"
    email: EmailStr
    message: str = "Код подтверждения отправлен на email"


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=8)


class ResendOtpRequest(BaseModel):
    email: EmailStr
