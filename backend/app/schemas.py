from __future__ import annotations

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
