"""Load the validated Stage 7 spatiotemporal 2027 forecast layer."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_ROOT = ROOT / "data" / "processed" / "stage7"
REPORT_ROOT = ROOT / "data" / "reports" / "stage7"
FORECAST_FILE = "forecast_2027_spatiotemporal.csv"
MATRIX_FILE = "KMA_6분야_시공간단위_검증.csv"


@lru_cache(maxsize=1)
def latest_stage7_directory() -> Path | None:
    if not PROCESSED_ROOT.exists():
        return None
    candidates = [
        path for path in PROCESSED_ROOT.glob("stage7_spatiotemporal_2027_*")
        if path.is_dir()
        and (path / FORECAST_FILE).exists()
        and (path / MATRIX_FILE).exists()
        and (REPORT_ROOT / path.name / "validation.json").exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def load_spatiotemporal_forecast() -> pd.DataFrame:
    directory = latest_stage7_directory()
    if directory is None:
        return pd.DataFrame()
    return pd.read_csv(directory / FORECAST_FILE, encoding="utf-8-sig")


def _boolean(value: Any) -> bool:
    return str(value).strip().lower() in {"true", "1", "y", "yes"}


@lru_cache(maxsize=1)
def spatiotemporal_validation_summary() -> dict[str, Any]:
    directory = latest_stage7_directory()
    if directory is None:
        return {"status": "not_available", "layers": []}
    report_path = REPORT_ROOT / directory.name / "validation.json"
    try:
        validation = json.loads(report_path.read_text(encoding="utf-8"))
        matrix = pd.read_csv(directory / MATRIX_FILE, encoding="utf-8-sig")
    except (OSError, json.JSONDecodeError, pd.errors.ParserError):
        return {"status": "validation_unreadable", "run_id": directory.name, "layers": []}
    layers = []
    for _, row in matrix.iterrows():
        layers.append({
            "category": str(row.get("분야", "")),
            "official_endpoints": int(row.get("공식endpoint수", 0) or 0),
            "http_200": int(row.get("HTTP200수", 0) or 0),
            "permission_denied": int(row.get("HTTP403수", 0) or 0),
            "observed_rows": int(row.get("확인관측행수", 0) or 0),
            "spatial_validation": str(row.get("공간검증", "")),
            "temporal_validation": str(row.get("시간검증", "")),
            "unit_validation": str(row.get("단위검증", "")),
            "direct_variables": str(row.get("검증직접변수", "")),
            "direct_score_input": _boolean(row.get("2027점수직접연결", False)),
            "context_connected": _boolean(row.get("2027분석근거연결", False)),
            "role": str(row.get("연결역할", "")),
            "limitation": str(row.get("제한사항", "")),
            "decision": str(row.get("판정", "")),
        })
    connection = validation.get("connection", {})
    return {
        "status": validation.get("status", "validation_incomplete"),
        "run_id": directory.name,
        "context_domain_count": len(connection.get("context_domains", [])),
        "direct_score_domain_count": len(connection.get("direct_score_domains", [])),
        "context_domains": connection.get("context_domains", []),
        "direct_score_domains": connection.get("direct_score_domains", []),
        "direct_variables": connection.get("direct_variables", []),
        "score_change_rows": int(connection.get("score_change_rows", 0) or 0),
        "policy": connection.get("policy", ""),
        "audit": validation.get("audit", {}),
        "checks": validation.get("checks", {}),
        "layers": layers,
        "source": f"data/processed/stage7/{directory.name}/{FORECAST_FILE}",
        "report": f"data/reports/stage7/{directory.name}/validation_report.md",
    }


def stage7_source_path() -> str:
    directory = latest_stage7_directory()
    return (
        f"data/processed/stage7/{directory.name}/{FORECAST_FILE}"
        if directory is not None else ""
    )


def clear_spatiotemporal_cache() -> None:
    latest_stage7_directory.cache_clear()
    load_spatiotemporal_forecast.cache_clear()
    spatiotemporal_validation_summary.cache_clear()
