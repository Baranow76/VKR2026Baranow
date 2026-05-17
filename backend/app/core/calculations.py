from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

from app.schemas import (
    EconomicsRequest,
    ProductionRequest,
    RiskRequest,
    RoboticsRequest,
)


def _round(value: float, ndigits: int = 2) -> float:
    return round(float(value), ndigits)


# ---------------------------------------------------------------------------
# 1. Production program module
# ---------------------------------------------------------------------------

def calculate_production_program(request: ProductionRequest) -> Dict[str, Any]:
    """
    Forms a quasi-optimal production sequence.

    The logic follows the prototype idea:
    - items with the largest production volume are pushed closer to the start;
    - items with the largest setup/changeover time are pushed closer to the end;
    - the resulting sequence is cut by the available time fund.
    """
    source_items = [item.model_dump() for item in request.items]
    remaining = deepcopy(source_items)

    left: List[dict] = []
    right: List[dict] = []

    while remaining:
        # Largest quantity first; if tied, lower setup time goes earlier.
        max_q_idx = max(
            range(len(remaining)),
            key=lambda i: (remaining[i]["quantity"], -remaining[i]["setup_time"], remaining[i]["name"]),
        )
        left.append(remaining.pop(max_q_idx))

        if not remaining:
            break

        # Largest setup time later; if tied, lower quantity goes later.
        max_t_idx = max(
            range(len(remaining)),
            key=lambda i: (remaining[i]["setup_time"], -remaining[i]["quantity"], remaining[i]["name"]),
        )
        right.insert(0, remaining.pop(max_t_idx))

    sequence = left + right

    used_time = 0.0
    included: List[dict] = []
    excluded: List[dict] = []

    for index, item in enumerate(sequence, start=1):
        production_time = item["quantity"] * request.takt
        total_time = production_time + item["setup_time"]
        can_include = used_time + total_time <= request.time_fund

        row = {
            "order": index,
            "name": item["name"],
            "quantity": item["quantity"],
            "setup_time": _round(item["setup_time"]),
            "production_time": _round(production_time),
            "total_time": _round(total_time),
            "group": item.get("group"),
            "comment": item.get("comment"),
        }

        if can_include:
            used_time += total_time
            row["cumulative_time"] = _round(used_time)
            row["status"] = "included"
            included.append(row)
        else:
            row["cumulative_time"] = _round(used_time)
            row["status"] = "excluded"
            row["reason"] = "Не хватает доступного фонда времени"
            excluded.append(row)

    utilization = used_time / request.time_fund if request.time_fund else 0

    return {
        "module": "production_program",
        "input_summary": {
            "time_fund": _round(request.time_fund),
            "takt": _round(request.takt),
            "items_count": len(source_items),
        },
        "sequence": included,
        "excluded_items": excluded,
        "used_time": _round(used_time),
        "remaining_time": _round(request.time_fund - used_time),
        "utilization_percent": _round(utilization * 100),
        "interpretation": _production_interpretation(included, excluded, used_time, request.time_fund),
    }


def _production_interpretation(included: list, excluded: list, used_time: float, time_fund: float) -> str:
    if not included:
        return "Ни одна позиция не включена в производственную программу: доступного фонда времени недостаточно."
    utilization = used_time / time_fund * 100
    text = (
        f"Сформирована квазиоптимальная производственная программа из {len(included)} позиций. "
        f"Использовано {used_time:.2f} из {time_fund:.2f} единиц фонда времени, "
        f"коэффициент использования фонда составляет {utilization:.2f}%."
    )
    if excluded:
        text += f" {len(excluded)} позиций не включено из-за ограничения фонда времени."
    else:
        text += " Все заданные позиции включены в программу."
    return text


# ---------------------------------------------------------------------------
# 2. Robotics module
# ---------------------------------------------------------------------------

def calculate_robotic_links(request: RoboticsRequest) -> Dict[str, Any]:
    """
    Groups operations into robotic links.

    A safer implementation of the prototype:
    tau = top / kz
    d = min(tau) for the current remaining operations
    A = floor(tau / d), at least 1
    k = top / (d * A)
    delta = abs(k - kz)
    candidates are included when k <= 1 and delta <= allowed deviation.
    """
    remaining = []
    for index, operation in enumerate(request.operations, start=1):
        tau = operation.top / operation.kz
        remaining.append({
            "id": index,
            "name": operation.name,
            "top": float(operation.top),
            "kz": float(operation.kz),
            "service_time": float(operation.service_time),
            "machine": operation.machine,
            "comment": operation.comment,
            "tau": tau,
        })

    links = []
    unassigned = []
    link_number = 1

    while remaining:
        remaining.sort(key=lambda op: (op["tau"], -op["top"], op["service_time"]))
        d = min(op["tau"] for op in remaining)

        candidates = []
        for op in remaining:
            a = max(1, int(op["tau"] / d))
            k_fact = op["top"] / (d * a)
            delta = abs(k_fact - op["kz"])
            candidate = {
                **op,
                "A": a,
                "k_fact": k_fact,
                "delta": delta,
                "is_candidate": k_fact <= 1 and delta <= request.max_deviation,
            }
            candidates.append(candidate)

        valid = [op for op in candidates if op["is_candidate"]]
        valid.sort(key=lambda op: (op["delta"], op["service_time"], op["name"]))

        selected = []
        selected_service_time = 0.0
        for op in valid:
            if len(selected) >= request.max_machines_per_robot:
                break
            if selected_service_time + op["service_time"] <= d:
                selected.append(op)
                selected_service_time += op["service_time"]

        # Fallback to avoid an endless loop: if no operation fits, mark the best operation as unassigned.
        if not selected:
            failed = candidates[0]
            failed["reason"] = (
                "Операция не вошла в комплект: не выполняются ограничения по загрузке, "
                "отклонению или времени обслуживания."
            )
            unassigned.append(_robotics_public_row(failed))
            remaining = [op for op in remaining if op["id"] != failed["id"]]
            continue

        k_robot = sum(op["service_time"] / op["A"] for op in selected) / d if d else 0
        link = {
            "link_number": link_number,
            "d": _round(d),
            "robot_load_factor": _round(k_robot),
            "robot_load_percent": _round(k_robot * 100),
            "machines_count": len(selected),
            "operations": [_robotics_public_row(op) for op in selected],
            "assessment": _robotics_assessment(k_robot),
        }
        links.append(link)

        selected_ids = {op["id"] for op in selected}
        remaining = [op for op in remaining if op["id"] not in selected_ids]
        link_number += 1

    avg_load = sum(link["robot_load_factor"] for link in links) / len(links) if links else 0

    return {
        "module": "robotic_links",
        "links": links,
        "unassigned_operations": unassigned,
        "links_count": len(links),
        "average_robot_load_percent": _round(avg_load * 100),
        "interpretation": _robotics_interpretation(links, unassigned),
    }


def _robotics_public_row(op: dict) -> dict:
    return {
        "name": op["name"],
        "machine": op.get("machine"),
        "top": _round(op["top"]),
        "kz": _round(op["kz"], 4),
        "service_time": _round(op["service_time"]),
        "tau": _round(op["tau"]),
        "A": op.get("A"),
        "k_fact": _round(op.get("k_fact", 0), 4),
        "delta": _round(op.get("delta", 0), 4),
        "reason": op.get("reason"),
    }


def _robotics_assessment(k_robot: float) -> str:
    if k_robot < 0.55:
        return "Недогрузка робота"
    if k_robot <= 0.9:
        return "Рациональная загрузка"
    if k_robot <= 1.0:
        return "Высокая загрузка"
    return "Перегрузка"


def _robotics_interpretation(links: list, unassigned: list) -> str:
    if not links:
        return "Не удалось сформировать роботизированные звенья при заданных ограничениях."
    avg = sum(link["robot_load_percent"] for link in links) / len(links)
    text = f"Сформировано {len(links)} роботизированных звеньев. Средняя загрузка роботов составляет {avg:.2f}%."
    if unassigned:
        text += f" {len(unassigned)} операций не удалось включить в звенья при заданных ограничениях."
    return text


# ---------------------------------------------------------------------------
# 3. Risk analysis module
# ---------------------------------------------------------------------------

def calculate_risk_analysis(request: RiskRequest) -> Dict[str, Any]:
    event_count = len(request.events)

    # Losses and conditional gains.
    loss_table = []
    payoff_table = []

    for strategy_index, strategy in enumerate(request.strategies, start=1):
        losses = [risk * request.base_loss / 100 for risk in strategy.risks]
        total_loss = sum(losses)
        dij_values = [
            request.profitability_threshold - (strategy.cost / event_count + loss)
            for loss in losses
        ]
        payoff_table.append({
            "strategy": strategy.name,
            "Dij": [_round(v) for v in dij_values],
            "Dminij": _round(min(dij_values)),
            "Dmaxij": _round(max(dij_values)),
        })
        loss_table.append({
            "strategy": strategy.name,
            "losses": [_round(v) for v in losses],
            "total_loss": _round(total_loss),
            "strategy_cost": _round(strategy.cost),
        })

    best_by_event = []
    for event_index in range(event_count):
        best_by_event.append(max(row["Dij"][event_index] for row in payoff_table))

    regret_table = []
    for row in payoff_table:
        regrets = [best_by_event[i] - row["Dij"][i] for i in range(event_count)]
        regret_table.append({
            "strategy": row["strategy"],
            "ERij": [_round(v) for v in regrets],
            "ERmaxij": _round(max(regrets)),
        })

    # Savage: minimize maximum regret.
    min_max_regret = min(row["ERmaxij"] for row in regret_table)
    savage = [row["strategy"] for row in regret_table if row["ERmaxij"] == min_max_regret]

    # Wald: maximize the minimum payoff. This is pessimistic maximin, not optimism.
    max_min_payoff = max(row["Dminij"] for row in payoff_table)
    wald = [row["strategy"] for row in payoff_table if row["Dminij"] == max_min_payoff]

    # Maximax: optional optimistic criterion.
    max_max_payoff = max(row["Dmaxij"] for row in payoff_table)
    maximax = [row["strategy"] for row in payoff_table if row["Dmaxij"] == max_max_payoff]

    hurwicz_table = []
    for row in payoff_table:
        values = []
        for x in request.hurwicz_coefficients:
            # x is the pessimism coefficient.
            gh = x * row["Dminij"] + (1 - x) * row["Dmaxij"]
            values.append(_round(gh))
        hurwicz_table.append({"strategy": row["strategy"], "GHj": values})

    hurwicz_recommendations = []
    for coeff_index, x in enumerate(request.hurwicz_coefficients):
        best_value = max(row["GHj"][coeff_index] for row in hurwicz_table)
        best_strategies = [row["strategy"] for row in hurwicz_table if row["GHj"][coeff_index] == best_value]
        hurwicz_recommendations.append({
            "coefficient": x,
            "best_value": _round(best_value),
            "strategies": best_strategies,
        })

    summary_vote = {}
    for name in savage + wald + maximax:
        summary_vote[name] = summary_vote.get(name, 0) + 1
    for item in hurwicz_recommendations:
        for name in item["strategies"]:
            summary_vote[name] = summary_vote.get(name, 0) + 1

    recommended = sorted(summary_vote.items(), key=lambda x: (-x[1], x[0]))[0][0] if summary_vote else None

    return {
        "module": "risk_analysis",
        "events": request.events,
        "loss_table": loss_table,
        "payoff_table": payoff_table,
        "best_payoff_by_event": [_round(v) for v in best_by_event],
        "regret_table": regret_table,
        "criteria": {
            "savage_minimax_regret": savage,
            "wald_maximin_pessimism": wald,
            "maximax_optimism": maximax,
            "hurwicz": hurwicz_recommendations,
            "recommended_strategy": recommended,
        },
        "hurwicz_table": hurwicz_table,
        "interpretation": _risk_interpretation(savage, wald, recommended),
    }


def _risk_interpretation(savage: list, wald: list, recommended: Optional[str]) -> str:
    text = (
        f"По критерию Сэвиджа рекомендуется: {', '.join(savage)}. "
        f"По критерию Вальда, то есть по пессимистическому maximin-подходу, рекомендуется: {', '.join(wald)}."
    )
    if recommended:
        text += f" Сводная рекомендация системы: стратегия «{recommended}»."
    return text


# ---------------------------------------------------------------------------
# 4. Economics module
# ---------------------------------------------------------------------------

def calculate_economics(request: EconomicsRequest) -> Dict[str, Any]:
    rate = request.discount_rate / 100 if request.discount_rate > 1 else request.discount_rate
    periods = sorted(request.periods, key=lambda p: p.year)

    rows = []
    cumulative = -request.initial_investment
    cumulative_simple = -request.initial_investment
    discounted_sum = 0.0
    simple_payback_year = None
    discounted_payback_year = None

    for period in periods:
        net_flow = (
            period.inflow
            - period.operating_costs
            - period.risk_losses
            - period.maintenance_costs
            - period.additional_investment
        )
        discounted_flow = net_flow / ((1 + rate) ** period.year)
        discounted_sum += discounted_flow
        prev_simple = cumulative_simple
        prev_discounted = cumulative
        cumulative_simple += net_flow
        cumulative += discounted_flow

        if simple_payback_year is None and cumulative_simple >= 0:
            simple_payback_year = _interpolate_payback(period.year, prev_simple, net_flow)
        if discounted_payback_year is None and cumulative >= 0:
            discounted_payback_year = _interpolate_payback(period.year, prev_discounted, discounted_flow)

        rows.append({
            "year": period.year,
            "inflow": _round(period.inflow),
            "operating_costs": _round(period.operating_costs),
            "risk_losses": _round(period.risk_losses),
            "maintenance_costs": _round(period.maintenance_costs),
            "additional_investment": _round(period.additional_investment),
            "net_flow": _round(net_flow),
            "discounted_flow": _round(discounted_flow),
            "cumulative_simple_flow": _round(cumulative_simple),
            "cumulative_discounted_flow": _round(cumulative),
        })

    npv = -request.initial_investment + discounted_sum
    total_net_flow = sum(row["net_flow"] for row in rows)
    roi = (total_net_flow - request.initial_investment) / request.initial_investment * 100
    pi = discounted_sum / request.initial_investment

    cashflow_series = [-request.initial_investment] + [
        row["net_flow"] for row in rows
    ]
    irr = _calculate_irr(cashflow_series)

    result = {
        "module": "economics",
        "initial_investment": _round(request.initial_investment),
        "discount_rate_percent": _round(rate * 100),
        "npv": _round(npv),
        "irr_percent": None if irr is None else _round(irr * 100),
        "roi_percent": _round(roi),
        "profitability_index": _round(pi, 4),
        "simple_payback_period_years": None if simple_payback_year is None else _round(simple_payback_year, 2),
        "discounted_payback_period_years": None if discounted_payback_year is None else _round(discounted_payback_year, 2),
        "is_effective": npv > 0,
        "flows": rows,
        "sensitivity": _sensitivity_analysis(request, rate),
    }
    result["interpretation"] = _economics_interpretation(result)
    return result


def _interpolate_payback(year: int, previous_cumulative: float, current_flow: float) -> float:
    if current_flow == 0:
        return float(year)
    missing_at_start = abs(previous_cumulative)
    fraction = min(max(missing_at_start / current_flow, 0), 1)
    return (year - 1) + fraction


def _npv_for_rate(cashflows: List[float], rate: float) -> float:
    return sum(cf / ((1 + rate) ** index) for index, cf in enumerate(cashflows))


def _calculate_irr(cashflows: List[float]) -> Optional[float]:
    # Bisection over a broad range. Returns None when there is no sign change.
    low, high = -0.95, 10.0
    low_value = _npv_for_rate(cashflows, low)
    high_value = _npv_for_rate(cashflows, high)

    if low_value == 0:
        return low
    if high_value == 0:
        return high
    if low_value * high_value > 0:
        return None

    for _ in range(200):
        mid = (low + high) / 2
        mid_value = _npv_for_rate(cashflows, mid)
        if abs(mid_value) < 1e-7:
            return mid
        if low_value * mid_value <= 0:
            high = mid
            high_value = mid_value
        else:
            low = mid
            low_value = mid_value
    return (low + high) / 2


def _sensitivity_analysis(request: EconomicsRequest, rate: float) -> Dict[str, Any]:
    def clone_with_multiplier(flow_multiplier: float = 1.0, investment_multiplier: float = 1.0, new_rate: Optional[float] = None):
        inv = request.initial_investment * investment_multiplier
        r = rate if new_rate is None else new_rate
        discounted = 0.0
        for period in request.periods:
            net = (
                period.inflow * flow_multiplier
                - period.operating_costs
                - period.risk_losses
                - period.maintenance_costs
                - period.additional_investment
            )
            discounted += net / ((1 + r) ** period.year)
        return _round(-inv + discounted)

    return {
        "discount_rate_minus_5pp": clone_with_multiplier(new_rate=max(rate - 0.05, 0)),
        "discount_rate_base": clone_with_multiplier(),
        "discount_rate_plus_5pp": clone_with_multiplier(new_rate=rate + 0.05),
        "investment_minus_10_percent": clone_with_multiplier(investment_multiplier=0.9),
        "investment_plus_10_percent": clone_with_multiplier(investment_multiplier=1.1),
        "inflow_minus_10_percent": clone_with_multiplier(flow_multiplier=0.9),
        "inflow_plus_10_percent": clone_with_multiplier(flow_multiplier=1.1),
    }


def _economics_interpretation(result: Dict[str, Any]) -> str:
    if result["is_effective"]:
        verdict = "проект экономически эффективен, так как ЧДД/NPV положителен"
    else:
        verdict = "проект экономически не подтвержден, так как ЧДД/NPV не является положительным"
    return (
        f"NPV проекта составляет {result['npv']:.2f}. Следовательно, {verdict}. "
        f"Индекс доходности равен {result['profitability_index']:.4f}, ROI составляет {result['roi_percent']:.2f}%."
    )
