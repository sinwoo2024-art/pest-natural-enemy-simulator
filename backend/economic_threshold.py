"""Unit-checked user criteria and EIL; never an official threshold or action."""
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

FORMULA_SOURCE = "https://ipmworld.umn.edu/pedigo"
FORMULA = "EIL = C / (V × I × D × K)"


class Criterion(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    value: float | None = Field(None, ge=0, le=1e12)
    unit: str = Field("", max_length=100)
    crop: str = Field("", max_length=100)
    pest: str = Field("", max_length=100)
    source: str = Field("", max_length=500)
    region: str = Field("", max_length=100)
    cultivation: str = Field("", max_length=100)


class EilInputs(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)
    C: float | None = Field(None, ge=0, le=1e12)
    V: float | None = Field(None, gt=0, le=1e12)
    I: float | None = Field(None, gt=0, le=1e12)
    D: float | None = Field(None, gt=0, le=1e12)
    K: float | None = Field(None, gt=0, le=1)
    C_unit: str = Field("", max_length=40)
    V_unit: str = Field("", max_length=40)
    I_unit: str = Field("", max_length=40)
    D_unit: str = Field("", max_length=40)
    K_unit: str = Field("", max_length=40)
    source: str = Field("", max_length=500)


def unit(value: str) -> str:
    return value.replace(" ", "").replace("m2", "m²").replace("cm2", "cm²")


def calculate_eil(inputs: EilInputs) -> dict:
    raw = inputs.model_dump()
    missing = [key for key in ("C", "V", "I", "D", "K", "C_unit", "V_unit", "I_unit", "D_unit", "K_unit")
               if raw[key] is None or raw[key] == ""]
    cost_units = {"원/m²": "마리/m²", "원/ha": "마리/ha", "원/주": "마리/주", "원/잎": "마리/잎"}
    units_ok = (unit(inputs.C_unit) in cost_units and unit(inputs.V_unit) == "원/kg" and
                ((unit(inputs.I_unit), unit(inputs.D_unit)) in (("cm²/마리", "kg/cm²"), ("피해단위/마리", "kg/피해단위"))) and
                inputs.K_unit == "비율(0~1)")
    result = {"status": "EIL 계산 근거 부족", "value": None, "unit": None,
              "formula": FORMULA, "formula_source": FORMULA_SOURCE, "inputs": raw,
              "missing": missing, "units_compatible": units_ok, "origin": "사용자 입력·가정값 (공식 기준 아님)",
              "note": "EIL은 이론적 경제적 피해수준이며 경제적 방제수준(ET)·자동 방제 명령과 다릅니다. 선형 피해–손실 관계, 동일 조사기간·생육단계의 적용 타당성은 현장 확인이 필요합니다."}
    if missing or not units_ok:
        return result
    v = {key: Decimal(str(raw[key])) for key in ("C", "V", "I", "D", "K")}
    computed = v["C"] / (v["V"] * v["I"] * v["D"] * v["K"])
    if computed > Decimal("1e12"):
        return {**result, "missing": ["결과 범위 초과: 단위와 입력값 재확인"]}
    return {**result, "status": "사용자 입력 EIL 시나리오", "value": float(computed),
            "unit": cost_units[unit(inputs.C_unit)]}


def review_threshold(criterion: Criterion, eil: EilInputs, mode: str, crop: str, pest: str,
                     region: str, cultivation: str, density: float | None, density_unit: str) -> dict:
    calc = calculate_eil(eil)
    required = {"기준값": criterion.value, "단위": criterion.unit, "대상 작물": criterion.crop,
                "대상 병해충": criterion.pest, "출처": criterion.source}
    missing = [k for k, v in required.items() if v is None or v in ("", "미확인")]
    if not criterion.region and not criterion.cultivation:
        missing.append("적용 지역 또는 재배조건")
    scope_ok = (criterion.crop == crop and criterion.pest == pest and crop != "전체" and pest != "전체" and
                (not criterion.region or criterion.region == region) and
                (not criterion.cultivation or criterion.cultivation == cultivation) and
                (bool(criterion.region) or bool(criterion.cultivation)))
    direct_ok = not missing and scope_ok
    selected = criterion.value if mode == "direct" and direct_ok else calc["value"] if mode == "eil" else None
    selected_unit = criterion.unit if mode == "direct" else calc["unit"] or ""
    comparable = selected is not None and density is not None and bool(density_unit) and unit(selected_unit) == unit(density_unit)
    status = ("출처 확인 필요" if not criterion.source or not criterion.unit else
              "입력 기준 자료 부족" if missing else "적용 조건 확인 필요" if not scope_ok else
              "사용자 입력 기준 · 공식 원문 미검증") if mode == "direct" else calc["status"]
    relation = None
    if comparable:
        relation = "입력 기준 이상 (실행 지시 아님)" if density >= selected else "입력 기준 미만 (안전 보장 아님)"
    return {"mode": mode, "status": status, "inputs": criterion.model_dump(), "missing": missing if mode == "direct" else calc["missing"],
            "official_value": None, "source": criterion.source or None, "source_verified": False,
            "official_comparable": False, "control_required": None,
            "numeric_comparable": comparable, "selected_value": selected, "selected_unit": selected_unit,
            "comparison": relation, "ready": comparable, "eil": calc["value"], "eil_result": calc,
            "eil_note": calc["status"], "origin": "사용자 입력값 · 출처 기재만으로 공식 검증된 기준으로 인정하지 않음"}
