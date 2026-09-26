"""Read-only access to the latest validated Stage 5 weather forecast outputs."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
import re
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_ROOT = ROOT / "data" / "processed" / "stage5"
REPORT_ROOT = ROOT / "data" / "reports" / "stage5"
STAGE4_REPORT_ROOT = ROOT / "data" / "reports" / "stage4"
FORECAST_FILE = "forecast_2027_weather.csv"
MONTHLY_FILE = "forecast_2027_region_month.csv"
RELATIONSHIP_FILE = "병해충_기상관계_요약.csv"
MODEL_LIMITATION_WEATHER = (
    "2024·2026 NCPMS 관측자료와 ASOS 공통 조사월의 연관성을 이용한 상대 위험 전망입니다. "
    "2026년은 부분연도이며 2027년 미래 기상·실제 발생·발생확률을 확정하지 않습니다."
)


def clean_name(value: object) -> str:
    return re.sub(r"\([^)]*\)", "", str(value)).replace(" ", "").strip()


@lru_cache(maxsize=1)
def latest_stage5_directory() -> Path | None:
    if not PROCESSED_ROOT.exists():
        return None
    candidates = [
        directory
        for directory in PROCESSED_ROOT.iterdir()
        if directory.is_dir()
        and (directory / FORECAST_FILE).exists()
        and (directory / MONTHLY_FILE).exists()
        and (directory / RELATIONSHIP_FILE).exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


def _read(filename: str) -> pd.DataFrame:
    directory = latest_stage5_directory()
    if directory is None:
        return pd.DataFrame()
    return pd.read_csv(directory / filename, encoding="utf-8-sig")


@lru_cache(maxsize=1)
def load_weather_forecast() -> pd.DataFrame:
    return _read(FORECAST_FILE)


@lru_cache(maxsize=1)
def load_monthly_outlook() -> pd.DataFrame:
    return _read(MONTHLY_FILE)


@lru_cache(maxsize=1)
def load_weather_relationships() -> pd.DataFrame:
    return _read(RELATIONSHIP_FILE)


@lru_cache(maxsize=1)
def load_stage5_validation() -> dict[str, Any]:
    directory = latest_stage5_directory()
    if directory is None:
        return {"status": "not_available"}
    path = REPORT_ROOT / directory.name / "validation.json"
    if not path.exists():
        return {"status": "validation_missing", "run_id": directory.name}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {"status": "complete", "run_id": directory.name, **payload}


def stage5_source_path() -> str:
    directory = latest_stage5_directory()
    return (
        f"data/processed/stage5/{directory.name}/{FORECAST_FILE}"
        if directory is not None
        else "data/forecast_2027.csv"
    )


def aws_minute_archive_status() -> dict[str, Any]:
    """Return only non-secret progress fields from the latest AWS minute run."""
    if not STAGE4_REPORT_ROOT.exists():
        return {"status": "not_available", "observation_rows": 0}
    candidates = [
        directory
        for directory in STAGE4_REPORT_ROOT.glob("stage4_aws_minute_20*")
        if directory.is_dir()
        and "smoke" not in directory.name
        and (directory / "checkpoint.json").exists()
    ]
    if not candidates:
        return {"status": "not_available", "observation_rows": 0}
    directory = max(candidates, key=lambda path: path.stat().st_mtime)
    try:
        checkpoint = json.loads((directory / "checkpoint.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "checkpoint_unreadable", "run_id": directory.name, "observation_rows": 0}
    stats = checkpoint.get("stats", {})
    completed = len(checkpoint.get("completed_windows", []))
    total = 7056
    aggregate_snapshot: dict[str, Any] | None = None
    aggregate_candidates = [
        path
        for path in STAGE4_REPORT_ROOT.glob("stage4_aws_minute_aggregate_20*")
        if path.is_dir() and (path / "validation.json").exists()
    ]
    if aggregate_candidates:
        aggregate_path = max(aggregate_candidates, key=lambda path: path.stat().st_mtime)
        try:
            aggregate = json.loads((aggregate_path / "validation.json").read_text(encoding="utf-8"))
            aggregate_snapshot = {
                "run_id": aggregate_path.name,
                "source_rows": int(aggregate.get("source_rows", 0)),
                "unique_stations": int(aggregate.get("unique_stations", 0)),
                "first_time": aggregate.get("first_time"),
                "last_time": aggregate.get("last_time"),
                "station_join_rate_percent": aggregate.get("station_join_rate_percent"),
            }
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            aggregate_snapshot = None
    return {
        "status": str(checkpoint.get("status", "running")),
        "run_id": directory.name,
        "observation_rows": int(stats.get("observation_rows", 0)),
        "request_count": int(stats.get("request_count", 0)),
        "success_count": int(stats.get("success_count", 0)),
        "completed_windows": completed,
        "priority_windows": total,
        "completion_rate_percent": round(100 * completed / total, 2),
        "storage_policy": "원문·정규화 gzip 서버 보존, 화면에는 집계값만 전송",
        "latest_aggregate_snapshot": aggregate_snapshot,
    }


def _weighted_score(frame: pd.DataFrame) -> int | None:
    available = frame[frame["전망위험도_2027"].notna()].copy()
    if available.empty:
        return None
    weights = pd.to_numeric(available["관측수"], errors="coerce").fillna(1).clip(lower=1)
    values = pd.to_numeric(available["전망위험도_2027"], errors="coerce")
    valid = values.notna()
    if not valid.any():
        return None
    return int(round(float(np.average(values[valid], weights=weights[valid]))))


def weather_context(pest: str, crop: str | None, region: str | None) -> dict[str, Any]:
    pest_key = clean_name(pest)
    relationships = load_weather_relationships().copy()
    monthly = load_monthly_outlook().copy()
    if relationships.empty or monthly.empty:
        return {
            "weather_data_status": "not_available",
            "weather_relationships": [],
            "monthly_outlook": [],
            "weather_note": MODEL_LIMITATION_WEATHER,
        }

    relationships = relationships[relationships["병해충"].map(clean_name) == pest_key]
    monthly = monthly[monthly["병해충"].map(clean_name) == pest_key]
    if crop and crop != "전체":
        relationships = relationships[relationships["작물"] == crop]
        monthly = monthly[monthly["작물"] == crop]
    if region and region != "전체":
        monthly = monthly[monthly["지역"] == region]

    relationship_items: list[dict[str, Any]] = []
    if not relationships.empty:
        for factor, group in relationships.groupby("기상요인"):
            numeric = pd.to_numeric(group["순위상관계수"], errors="coerce")
            counts = pd.to_numeric(group["비교단위수"], errors="coerce").fillna(0)
            valid = numeric.notna() & counts.gt(0)
            coefficient = (
                float(np.average(numeric[valid], weights=counts[valid]))
                if valid.any()
                else None
            )
            evidence_count = int(counts.sum())
            grades = group["근거등급"].dropna().astype(str).tolist()
            grade_order = {"자료 부족": 0, "약함": 1, "참고 가능": 2, "비교적 뚜렷": 3}
            grade = max(grades, key=lambda value: grade_order.get(value, 0)) if grades else "자료 부족"
            relationship_items.append(
                {
                    "factor": str(factor),
                    "coefficient": None if coefficient is None else round(coefficient, 3),
                    "evidence_count": evidence_count,
                    "grade": grade,
                    "direction": (
                        "같이 증가" if coefficient is not None and coefficient > 0.1
                        else "반대 방향" if coefficient is not None and coefficient < -0.1
                        else "뚜렷한 방향 없음"
                    ),
                }
            )
    relationship_items.sort(
        key=lambda item: (abs(item["coefficient"] or 0), item["evidence_count"]),
        reverse=True,
    )

    monthly_items: list[dict[str, Any]] = []
    for month in range(1, 13):
        group = monthly[monthly["월"] == month]
        score = _weighted_score(group) if not group.empty else None
        observations = int(pd.to_numeric(group.get("관측수", pd.Series(dtype=float)), errors="coerce").fillna(0).sum())
        source_years = sorted(
            {
                int(year)
                for value in group.get("근거연도", pd.Series(dtype=str)).dropna().astype(str)
                for year in re.findall(r"2024|2026", value)
            }
        )
        monthly_items.append(
            {
                "month": month,
                "forecast_score": score,
                "observation_count": observations,
                "source_years": source_years,
                "data_status": "관측 계절형 반영" if score is not None else "전망자료 부족",
            }
        )

    available_months = sum(item["forecast_score"] is not None for item in monthly_items)
    return {
        "weather_data_status": "linked" if available_months else "insufficient",
        "weather_relationships": relationship_items,
        "monthly_outlook": monthly_items,
        "monthly_available_count": available_months,
        "weather_note": MODEL_LIMITATION_WEATHER,
        "weather_source": "기상청 APIHub ASOS 전국 시간관측 → 시도·월 집계",
    }
