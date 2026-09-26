"""Separate surveillance, field gates, cited evidence and user economics.

No risk-to-loss conversion, inferred efficacy, or automated release instruction.
"""
import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DISCLAIMER = (
    "본 결과는 사용자가 입력한 비용·피해액·효과 가정을 이용한 시나리오 계산입니다. "
    "NCPMS 상대위험도는 실제 피해확률이나 천적의 방제효과를 의미하지 않습니다. "
    "공식 효과자료가 없는 경우 공생AI는 효과율을 생성하지 않으며, "
    "최종 도입 여부는 현장 예찰과 전문가 검토를 거쳐 결정해야 합니다."
)
FORMULAS = {
    "avoided_loss": "기대 회피피해액 = 예상 무처리 피해액 × 예상 효과율 / 100",
    "benefit": "총편익 = 기대 회피피해액 + 기존 방제비 절감 예상액",
    "cost": "총도입비용 = 천적 구입비 + 투입 작업비 + 추가 예찰비 + 기타 적용비용",
    "net": "예상 순편익 = 총편익 − 총도입비용",
    "bcr": "BCR = 총편익 ÷ 총도입비용 (비용 0이면 산출하지 않음)",
    "break_even": "손익분기 효과율 = max(0, (총도입비용 − 방제비 절감액) ÷ 예상 무처리 피해액 × 100)",
}


class Economics(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    untreated_loss: float | None = Field(None, ge=0, le=1e15)
    saved_control: float | None = Field(None, ge=0, le=1e15)
    enemy_cost: float | None = Field(None, ge=0, le=1e15)
    labor_cost: float | None = Field(None, ge=0, le=1e15)
    monitoring_cost: float | None = Field(None, ge=0, le=1e15)
    other_cost: float | None = Field(None, ge=0, le=1e15)
    effect_low: float | None = Field(None, ge=0, le=100)
    effect_base: float | None = Field(None, ge=0, le=100)
    effect_high: float | None = Field(None, ge=0, le=100)


Gate = Literal["unknown", "clear", "adverse"]


class FieldConditions(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    temperature: float | None = Field(None, ge=-60, le=80)
    humidity: float | None = Field(None, ge=0, le=100)
    environment: Gate = "unknown"
    rainfall: Gate = "unknown"
    wind: Gate = "unknown"
    chemical_residue: Gate = "unknown"
    pest_observed: bool = False
    crop_stage_checked: bool = False


class AdoptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: str = Field(min_length=1, max_length=100)
    pest: str = Field(min_length=1, max_length=100)
    region: str = Field(default="전체", max_length=100)
    cultivation_mode: Literal["미확인", "시설", "노지", "스마트팜"] = "미확인"
    enemy_name: str | None = Field(None, max_length=100)
    economics: Economics = Field(default_factory=Economics)
    field: FieldConditions = Field(default_factory=FieldConditions)


def _rounded(value: Decimal, digits: str = "1") -> float:
    return float(value.quantize(Decimal(digits), rounding=ROUND_HALF_UP))


def calculate_economics(inputs: Economics) -> dict:
    raw = inputs.model_dump()
    missing = [key for key, value in raw.items() if value is None]
    base = {"input_origin": "사용자 가정값", "inputs": raw, "formulas": FORMULAS,
            "currency": "KRW", "rounding": "원 단위 반올림, BCR·효과율 소수 둘째 자리; 상태는 반올림 전 값으로 판단",
            "disclaimer": DISCLAIMER, "missing_inputs": missing, "scenarios": []}
    if missing or not any(raw.values()):
        return {**base, "status": "경제성 입력 필요", "complete": False}
    v = {key: Decimal(str(value)) for key, value in raw.items()}
    if not v["effect_low"] <= v["effect_base"] <= v["effect_high"]:
        return {**base, "status": "효과율은 하한 ≤ 기준값 ≤ 상한이어야 합니다.", "complete": False}
    cost = sum(v[key] for key in ("enemy_cost", "labor_cost", "monitoring_cost", "other_cost"))
    scenarios = []
    for key, label in (("effect_low", "하한"), ("effect_base", "기준"), ("effect_high", "상한")):
        avoided = v["untreated_loss"] * v[key] / 100
        benefit = avoided + v["saved_control"]
        net = benefit - cost
        scenarios.append({"label": label, "effect_percent": float(v[key]),
                          "avoided_loss": _rounded(avoided), "total_benefit": _rounded(benefit),
                          "net_benefit": _rounded(net), "net_positive": net > 0,
                          "bcr": _rounded(benefit / cost, "0.01") if cost else None})
    loss = v["untreated_loss"]
    needed = max(Decimal(0), cost - v["saved_control"])
    threshold = needed / loss * 100 if loss else (Decimal(0) if not needed else None)
    return {**base, "status": "사용자 가정 시나리오", "complete": True,
            "scenarios": scenarios, "total_cost": _rounded(cost),
            "break_even_effect_percent": _rounded(threshold, "0.01") if threshold is not None else None,
            "break_even_note": "피해액 0으로 효과율 산출 불가" if threshold is None else
                               "100% 효과로도 손익분기 불가" if threshold > 100 else "사용자 가정 기준 최소 필요 효과율"}


def explicit_target_match(value: str, text: str | None) -> bool:
    """An explicit listed name, never a broad horticulture category or substring."""
    return value not in ("", "전체") and value in [s.strip() for s in re.split(r"[,、/·;\s()（）]+", text or "")]


def evidence_track(enemy: dict | None, crop: str, pest: str, mode: str, reference: dict | None = None) -> dict:
    standard = (enemy or {}).get("release_standard", {})
    trajectory = (enemy or {}).get("effect_trajectory", {})
    references = []
    literature = (reference or {}).get("literature_evidence", {})
    if literature.get("available") and literature.get("url"):
        references.append({"title": literature.get("title"), "url": literature["url"],
                           "conditions": literature.get("conditions"), "note": literature.get("application_note"),
                           "enemy_name": (reference or {}).get("enemy_name"), "scope": "참고문헌 (직접근거 충족과 별개)"})
    source_environment = standard.get("environment") or ""
    # A Korean publisher is not proof that a trial was carried out in Korea.
    # The current ledger has no audited trial-country column: keep this unknown.
    domestic = standard.get("trial_country") in ("KR", "대한민국")
    env_match = ((mode in ("시설", "스마트팜") and any(t in source_environment for t in ("시설", "온실")))
                 or (mode == "노지" and "노지" in source_environment))
    checks = {
        "pest_match": explicit_target_match(pest, standard.get("source_target_pest")),
        "crop_match": explicit_target_match(crop, standard.get("source_crop")),
        "environment_match": env_match,
        "dose_available": bool(standard.get("release_amount")),
        "timing_available": bool(standard.get("timing_condition")),
        "repeats_available": bool(standard.get("release_schedule")),
        "control_available": bool(trajectory.get("direct_control_available") and trajectory.get("group_comparison_available")),
        "effect_numeric_available": any(p.get("reported_percent") is not None for p in trajectory.get("points", [])),
        "source_available": bool(standard.get("source") and standard.get("source_url")),
        "domestic_context": domestic,
    }
    labels = {"pest_match": "대상 병해충 직접근거 부족", "crop_match": "대상 작물 직접근거 부족",
              "environment_match": "재배환경 직접근거 부족", "dose_available": "공식 방사량 미확보",
              "timing_available": "공식 처리시기 미확보", "repeats_available": "공식 반복 횟수·간격 미확보",
              "control_available": "처리군·대조군 비교 근거 미확보", "effect_numeric_available": "공식 효과 수치 미확보",
              "source_available": "동일 작물·병해충·환경의 공식 처리조건 출처 미확보 (참고문헌 있음)" if references else "근거 원문 출처 미확보",
              "domestic_context": "국내 현장 적용 근거 확인 필요"}
    return {"enemy_name": (enemy or {}).get("name"), "checks": checks,
            "grade": "선택 조건 직접근거" if all(checks.values()) else "간접·부분 근거" if enemy else "근거 부족",
            "source_grade": standard.get("evidence_grade"), "official": standard,
            "references": references,
            "source_status": "원문 링크 있음 · 직접근거 충족 여부는 별도 확인" if references or standard.get("source_url") else "원문 링크 미확보",
            "reported_points": trajectory.get("points", []), "generalized_effect_percent": None,
            "missing": [labels[key] for key, ok in checks.items() if not ok],
            "caution": "원문 시험조건·관측값은 현장 효과율이 아닙니다. 해외·다른 작물·다른 환경 연구를 직접근거로 보지 않습니다."}


def evaluate_review(risk: dict, evidence: dict, field: FieldConditions, economics: Economics) -> dict:
    economy = calculate_economics(economics)
    observations = field.model_dump()
    adverse = [name for name in ("environment", "rainfall", "wind", "chemical_residue") if observations[name] == "adverse"]
    unknown = [name for name in ("environment", "rainfall", "wind", "chemical_residue") if observations[name] == "unknown"]
    checks = evidence["checks"]
    field_ready = not unknown and field.pest_observed and field.crop_stage_checked
    missing = list(evidence["missing"])
    if not economy["complete"]:
        missing.append("경제성 판단 자료 부족: 모든 비용·피해액·효과율을 입력하세요. 비용 없음도 0으로 명시하세요.")
    if not field_ready:
        missing.append("현장 예찰·생육·환경·강우·강풍·약제 잔효 확인")
    if adverse:
        state, reason = "현장 적용 검토 보류", "사용자가 불리한 환경·작업조건을 확인했습니다. 경제성 계산이 긍정적이어도 검토를 보류합니다."
    elif not economy["complete"] or not all(checks.get(k) for k in ("dose_available", "effect_numeric_available", "source_available")):
        state, reason = "자료 부족", "경제성 필수 입력 또는 공식 방사량·효과 수치·출처가 부족합니다."
    elif not economy["scenarios"][2]["net_positive"]:
        state, reason = "경제성 낮음", "사용자 효과 상한에서도 예상 순편익이 0 이하입니다."
    elif not economy["scenarios"][0]["net_positive"] or not all(checks.values()):
        state, reason = "현장 실증 필요", "순편익 범위가 0을 포함하거나 대상·환경·대조시험 등 효과 근거가 간접·부분 근거입니다."
    elif not field_ready:
        state, reason = "자료 부족", "경제성 하한이 양수여도 필수 현장 관문이 확인되지 않았습니다."
    else:
        state, reason = "도입 검토 후보", "직접근거와 필수 현장 관문이 연결되고 사용자 가정 순편익 하한이 0보다 큽니다."
    return {"tracks": {
        "surveillance": {"score": risk.get("risk_score"), "level": risk.get("risk_level"),
                         "action": "예찰 빈도 강화와 현장 밀도 확인" if (risk.get("risk_score") or 0) >= 67 else "현장 예찰과 피해 증상 확인",
                         "meaning": "상대위험 신호는 실제 피해확률·예상 피해액·천적 방사 필요성·경제효과를 뜻하지 않습니다."},
        "environment": {"inputs": observations, "origin": "사용자 현장 확인값 (자동 센서 연동 아님)",
                        "adverse": adverse, "unknown": unknown, "all_checked": field_ready,
                        "risk_adjustment_applied": False,
                        "meaning": "천적 활동·현장 작업조건 검토를 위한 보조 관문이며 방사 가능 여부·효과·경제성 판정이 아닙니다."},
        "evidence": evidence, "economics": economy},
        "status": state, "reason": reason, "missing": missing, "automatic_release": False,
        "decision_notice": "도입 검토 후보도 실제 방사 명령이 아닙니다. 최종 결정은 농업인과 전문가가 현장 확인 후 수행합니다.",
        "disclaimer": DISCLAIMER}
