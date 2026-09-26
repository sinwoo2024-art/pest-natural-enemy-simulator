from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def _latest(pattern: str, filename: str) -> Path | None:
    candidates = sorted(DATA.glob(pattern))
    for directory in reversed(candidates):
        path = directory / filename
        if path.exists():
            return path
    return None


def _read(path: Path | None) -> pd.DataFrame:
    if path is None or not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _canonical_region(value: Any) -> str:
    text = _clean(value).replace(" ", "")
    replacements = {
        "강원도": "강원특별자치도", "강원": "강원특별자치도",
        "전라북도": "전북특별자치도", "전북": "전북특별자치도",
        "제주도": "제주특별자치도", "제주": "제주특별자치도",
        "충북": "충청북도", "충남": "충청남도", "전남": "전라남도",
        "경북": "경상북도", "경남": "경상남도", "경기": "경기도",
    }
    return replacements.get(text, text)


@lru_cache(maxsize=1)
def _sources() -> dict[str, Any]:
    daily_path = _latest("processed/stage12/stage12_work_safety_*", "작업환경_상대노출_일별.csv")
    monthly_path = _latest("processed/stage12/stage12_work_safety_*", "작업환경_상대노출_월별.csv")
    evidence_path = _latest("processed/stage12/stage12_work_safety_*", "농업기계_사고통계_공식근거.csv")
    rules_path = _latest("processed/stage12/stage12_work_safety_*", "농작업안전_공식규칙.csv")
    gaps_path = _latest("processed/stage12/stage12_work_safety_*", "연구데이터_확보상태.csv")
    return {
        "paths": {"daily": daily_path, "monthly": monthly_path, "evidence": evidence_path, "rules": rules_path, "gaps": gaps_path},
        "daily": _read(daily_path), "monthly": _read(monthly_path),
        "evidence": _read(evidence_path), "rules": _read(rules_path), "gaps": _read(gaps_path),
    }


def clear_work_safety_cache() -> None:
    _sources.cache_clear()


def _actions(dominant: str, rules: pd.DataFrame) -> list[str]:
    keywords = {
        "고온": ["폭염", "자외선"], "저온": ["한랭", "기상"],
        "강수": ["농업기계", "전도", "미끄"], "강풍": ["농업기계", "악천후", "시설"],
    }.get(dominant, ["농업기계"])
    selected: list[str] = []
    for _, row in rules.iterrows():
        haystack = " ".join(_clean(row.get(column)) for column in ["위험분류", "세부분류", "안전수칙"])
        if any(keyword in haystack for keyword in keywords):
            rule = _clean(row.get("안전수칙"))
            if rule and rule not in selected:
                selected.append(rule)
        if len(selected) >= 5:
            break
    return selected


def safety_risk_context(*, region: str = "전체", year: int | None = None, month: int | None = None) -> dict[str, Any]:
    sources = _sources()
    daily, monthly = sources["daily"].copy(), sources["monthly"].copy()
    evidence, rules, gaps = sources["evidence"], sources["rules"], sources["gaps"]
    if daily.empty:
        return {"available": False, "status": "자료 없음", "is_accident_probability": False, "caution": "Stage 12 안전 상대노출 결과가 없습니다."}

    daily["_region"] = daily["시도명"].map(_canonical_region)
    monthly["_region"] = monthly["시도명"].map(_canonical_region)
    selected, selected_monthly = daily.copy(), monthly.copy()
    if region and region != "전체":
        target = _canonical_region(region)
        selected = selected[selected["_region"].eq(target)]
        selected_monthly = selected_monthly[selected_monthly["_region"].eq(target)]
    if year is not None:
        selected = selected[pd.to_numeric(selected["연도"], errors="coerce").eq(year)]
        selected_monthly = selected_monthly[pd.to_numeric(selected_monthly["연도"], errors="coerce").eq(year)]
    if month is not None:
        selected = selected[pd.to_numeric(selected["월"], errors="coerce").eq(month)]
        selected_monthly = selected_monthly[pd.to_numeric(selected_monthly["월"], errors="coerce").eq(month)]
    if selected.empty:
        return {"available": False, "status": "선택 조건 자료 없음", "selected_region": region, "selected_year": year, "selected_month": month, "is_accident_probability": False, "caution": "관측자료 없음은 안전하거나 사고가 없다는 뜻이 아닙니다."}

    selected["_score"] = pd.to_numeric(selected["상대노출지수"], errors="coerce")
    latest_date = selected["기준일"].max()
    latest_row = selected[selected["기준일"].eq(latest_date)].sort_values("_score", ascending=False).iloc[0]
    dominant = _clean(latest_row.get("주요노출요인"))
    scope = daily[daily["기준일"].eq(latest_date)].copy()
    scope["_score"] = pd.to_numeric(scope["상대노출지수"], errors="coerce")
    rankings = [{"region": _clean(row.get("시도명")), "score": float(row["_score"]) if pd.notna(row["_score"]) else None, "signal": _clean(row.get("작업조정신호")), "dominant_exposure": _clean(row.get("주요노출요인")), "data_status": _clean(row.get("자료상태"))} for _, row in scope.sort_values("_score", ascending=False).iterrows()]
    timeline = [{"year": int(float(row["연도"])), "month": int(float(row["월"])), "region": _clean(row.get("시도명")), "median_score": float(row["월중앙상대노출지수"]) if _clean(row.get("월중앙상대노출지수")) else None, "max_score": float(row["월최대상대노출지수"]) if _clean(row.get("월최대상대노출지수")) else None, "adjustment_days": int(float(row["작업조정검토일수"])), "caution_days": int(float(row["주의강화일수"])), "dominant_exposure": _clean(row.get("주요노출요인"))} for _, row in selected_monthly.sort_values(["연도", "월"]).tail(36).iterrows()]
    priorities = [{"category": _clean(row.get("분류")), "item": _clean(row.get("항목")), "value": float(row["값"]), "unit": _clean(row.get("단위")), "source_page": int(float(row["원천페이지"])), "population": _clean(row.get("모수"))} for _, row in evidence.iterrows()]
    data_gaps = [{"domain": _clean(row.get("데이터영역")), "status": _clean(row.get("현재상태")), "available_rows": int(float(row["확보행수"])) if _clean(row.get("확보행수")) else 0, "current_implementation": _clean(row.get("현재구현")), "forbidden_interpretation": _clean(row.get("금지해석"))} for _, row in gaps.iterrows()]
    return {
        "available": True, "status": "실제 ASOS 기반 상대노출 신호",
        "selected_region": region, "selected_year": year, "selected_month": month,
        "observation_rows": int(len(selected)),
        "latest": {
            "date": latest_date, "region": _clean(latest_row.get("시도명")),
            "relative_exposure_score": float(latest_row["_score"]) if pd.notna(latest_row["_score"]) else None,
            "work_adjustment_signal": _clean(latest_row.get("작업조정신호")), "color": _clean(latest_row.get("표시색")),
            "dominant_exposure": dominant,
            "max_temperature_c": float(latest_row["최고기온_C"]) if _clean(latest_row.get("최고기온_C")) else None,
            "rainfall_mm": float(latest_row["강수량_mm"]) if _clean(latest_row.get("강수량_mm")) else None,
            "rainfall_actual_zero": _clean(latest_row.get("강수실제0여부")),
            "max_wind_m_s": float(latest_row["최대풍속_m_s"]) if _clean(latest_row.get("최대풍속_m_s")) else None,
            "data_status": _clean(latest_row.get("자료상태")),
        },
        "recommended_checks": _actions(dominant, rules), "regional_ranking": rankings,
        "monthly_timeline": timeline, "official_accident_policy_priorities": priorities, "data_gaps": data_gaps,
        "is_accident_probability": False,
        "method": "동일 월 실제 ASOS 분포에서 고온·저온·강수·강풍 백분위 중 최댓값",
        "thresholds": {"작업조정 검토": ">=95백분위", "주의 강화": ">=80백분위", "관찰": "<80백분위"},
        "source_file": sources["paths"]["daily"].name if sources["paths"]["daily"] else None,
        "caution": "상대노출지수는 작업 전 확인 순서를 정하는 탐색 신호이며 사고확률·기상특보·법적 작업중지 판정이 아닙니다. 공식 집계통계는 정책 우선순위에만 사용하며 지역 점수와 곱하지 않습니다.",
    }
