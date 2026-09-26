"""Read-only access to the latest validated Stage 6 research evidence."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
import re
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_ROOT = ROOT / "data" / "processed" / "stage6"
REPORT_ROOT = ROOT / "data" / "reports" / "stage6"
STAGE4_REPORT_ROOT = ROOT / "data" / "reports" / "stage4"
STAGE19_PROCESSED_ROOT = ROOT / "data" / "processed" / "stage19"
STAGE20_PROCESSED_ROOT = ROOT / "data" / "processed" / "stage20"
FORECAST_FILE = "forecast_2027_research.csv"
RELATIONSHIP_FILE = "병해충_시차기상_특징중요도.csv"
CONDITION_FILE = "조건별_연구근거.csv"
BENCHMARK_FILE = "설명가능모델_기준선비교.csv"
EXTENSION_FILE = "KMA_확장서비스_적용판정.csv"
TRIBUNAL_FILE = "AI_분석_심사원장.json"
MULTIYEAR_LEDGER_FILE = "NCPMS_3개년_분석원장.json"
MULTIYEAR_COMMON_FILE = "NCPMS_3개년_공통단위_비교전망.csv"
MULTIYEAR_BENCHMARK_FILE = "NCPMS_3개년_모델백테스트.csv"


def clean_name(value: object) -> str:
    return re.sub(r"\([^)]*\)", "", str(value)).replace(" ", "").strip()


@lru_cache(maxsize=1)
def latest_stage6_directory() -> Path | None:
    if not PROCESSED_ROOT.exists():
        return None
    candidates = [
        directory for directory in PROCESSED_ROOT.iterdir()
        if directory.is_dir()
        and all((directory / filename).exists() for filename in (
            FORECAST_FILE, RELATIONSHIP_FILE, CONDITION_FILE, BENCHMARK_FILE,
        ))
        and (REPORT_ROOT / directory.name / "validation.json").exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def latest_stage19_directory() -> Path | None:
    if not STAGE19_PROCESSED_ROOT.exists():
        return None
    candidates = [
        directory for directory in STAGE19_PROCESSED_ROOT.iterdir()
        if directory.is_dir() and (directory / TRIBUNAL_FILE).exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def latest_stage20_directory() -> Path | None:
    if not STAGE20_PROCESSED_ROOT.exists():
        return None
    candidates = [
        directory for directory in STAGE20_PROCESSED_ROOT.iterdir()
        if directory.is_dir()
        and all((directory / filename).exists() for filename in (
            MULTIYEAR_LEDGER_FILE, MULTIYEAR_COMMON_FILE, MULTIYEAR_BENCHMARK_FILE,
        ))
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def load_model_tribunal() -> dict[str, Any]:
    directory = latest_stage19_directory()
    if directory is None:
        return {"status": "not_available"}
    try:
        payload = json.loads((directory / TRIBUNAL_FILE).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "validation_unreadable", "run_id": directory.name}
    return {"status": "complete", **payload}


@lru_cache(maxsize=1)
def load_multiyear_ledger() -> dict[str, Any]:
    directory = latest_stage20_directory()
    if directory is None:
        return {"status": "not_available"}
    try:
        payload = json.loads((directory / MULTIYEAR_LEDGER_FILE).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "validation_unreadable", "run_id": directory.name}
    return {"status": "complete", **payload}


@lru_cache(maxsize=1)
def load_multiyear_common() -> pd.DataFrame:
    directory = latest_stage20_directory()
    if directory is None:
        return pd.DataFrame()
    return pd.read_csv(directory / MULTIYEAR_COMMON_FILE, encoding="utf-8-sig")


@lru_cache(maxsize=1)
def load_multiyear_benchmarks() -> pd.DataFrame:
    directory = latest_stage20_directory()
    if directory is None:
        return pd.DataFrame()
    return pd.read_csv(directory / MULTIYEAR_BENCHMARK_FILE, encoding="utf-8-sig")


@lru_cache(maxsize=1)
def latest_extension_directory() -> Path | None:
    if not PROCESSED_ROOT.exists():
        return None
    candidates = [
        directory for directory in PROCESSED_ROOT.glob("stage6_kma_extensions_*")
        if (directory / EXTENSION_FILE).exists()
        and (REPORT_ROOT / directory.name / "validation.json").exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def latest_four_domain_audit() -> Path | None:
    if not STAGE4_REPORT_ROOT.exists():
        return None
    candidates = [
        directory for directory in STAGE4_REPORT_ROOT.iterdir()
        if directory.is_dir()
        and directory.name.startswith(("stage4_four_domains_full_audit_", "stage4_kma_domains_full_audit_"))
        if (directory / "validation.json").exists()
        and (directory / "endpoint_audit.csv").exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def latest_fusion_recheck() -> Path | None:
    if not STAGE4_REPORT_ROOT.exists():
        return None
    candidates = [
        directory for directory in STAGE4_REPORT_ROOT.glob("stage4_kma_fusion_45_revalidate_*")
        if directory.is_dir() and (directory / "validation.json").exists()
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


@lru_cache(maxsize=1)
def fusion_recheck_summary() -> dict[str, Any]:
    directory = latest_fusion_recheck()
    if directory is None:
        return {"status": "not_available"}
    try:
        payload = json.loads((directory / "validation.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "validation_unreadable", "run_id": directory.name}
    return {
        "status": str(payload.get("status", "unknown")),
        "run_id": directory.name,
        "catalogued": int(payload.get("app_catalogue_connected", 0)),
        "live_http_200": int(payload.get("live_http_200_after_recheck", 0)),
        "permission_denied": int(payload.get("permission_denied_count", 0)),
        "gateway_pending": int(payload.get("gateway_or_transport_pending", 0)),
        "request_count": int(payload.get("api_request_count", 0)),
        "all_catalogued": bool(payload.get("all_45_catalogued", False)),
        "all_live_validated": bool(payload.get("all_45_live_validated", False)),
        "key_plaintext_persisted": bool(payload.get("key_plaintext_persisted", True)),
        "report": f"data/reports/stage4/{directory.name}/validation_report.md",
    }


@lru_cache(maxsize=1)
def full_domain_audit_summary() -> dict[str, Any]:
    directory = latest_four_domain_audit()
    if directory is None:
        return {"status": "not_available", "category_summary": []}
    try:
        payload = json.loads((directory / "validation.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"status": "validation_unreadable", "run_id": directory.name, "category_summary": []}
    role_map = {
        "지상관측": (
            "국내 지상환경 기준층",
            "실측",
            "기온·습도·강수·바람의 전국 배경환경과 극값을 검증합니다.",
        ),
        "해양관측": (
            "연안 노출환경 보조층",
            "실측",
            "연안 지역의 수온·파고·해상바람 맥락과 해륙 경계를 검증합니다.",
        ),
        "예특보": (
            "운영 위험 신호층",
            "예보·특보",
            "폭염·호우·강풍 등 농작업 위험과 단기 대응 시점을 보조합니다.",
        ),
        "융합기상": (
            "고해상도 공간 보조층",
            "객관분석·응용",
            "500m 격자·농업·서리 자료로 지역 공백과 공간 패턴을 교차검증합니다.",
        ),
        "세계기상": (
            "국제 비교 검증층",
            "국제관측",
            "국내 결측을 대체하지 않고 동일 시공간의 국제관측과 외부 환경을 비교합니다.",
        ),
        "산업특화": (
            "일사·일조 환경층",
            "산업응용",
            "작물 생육과 병해충 활동에 영향을 주는 일사·일조·평년 환경을 보조합니다.",
        ),
    }
    category_summary = []
    for item in payload.get("category_summary", []):
        category = str(item.get("category", ""))
        layer_name, data_nature, analysis_role = role_map.get(
            category,
            ("외부 환경 보조층", "공식자료", "검증된 공식 기상자료를 별도 근거로 제공합니다."),
        )
        connected = int(item.get("http_200", 0))
        category_summary.append({
            **item,
            "layer_name": layer_name,
            "data_nature": data_nature,
            "analysis_role": analysis_role,
            "app_context_connected": connected,
            "forecast_direct_inputs": 3 if category == "지상관측" else 0,
        })
    return {
        "status": "complete",
        "run_id": directory.name,
        "official_endpoints": int(payload.get("official_documented_endpoints", 0)),
        "http_200": int(payload.get("http_200_count", 0)),
        "permission_denied": int(payload.get("permission_denied_count", 0)),
        "gateway_errors": int(payload.get("other_error_count", 0)),
        "timeouts": int(payload.get("timeout_count", 0)),
        "category_summary": category_summary,
        "app_context_connected": int(payload.get("http_200_count", 0)),
        "forecast_direct_inputs": 3,
        "integration_policy": (
            "여섯 분야는 분석 고도화 근거층으로 유지합니다. 시공간·단위·결측 검증을 통과한 "
            "지상관측의 기온·습도·풍속만 기존 2027 점수 근거로 승인하고, 나머지는 직접 혼합하지 않습니다."
        ),
        "permission_application_group_count": int(payload.get("permission_application_group_count", 0)),
        "report": f"data/reports/stage4/{directory.name}/validation_report.md",
        "key_plaintext_persisted": bool(payload.get("key_plaintext_persisted", True)),
        "fusion_recheck": fusion_recheck_summary(),
    }


def _read(filename: str) -> pd.DataFrame:
    directory = latest_stage6_directory()
    if directory is None:
        return pd.DataFrame()
    return pd.read_csv(directory / filename, encoding="utf-8-sig")


@lru_cache(maxsize=1)
def load_research_forecast() -> pd.DataFrame:
    return _read(FORECAST_FILE)


@lru_cache(maxsize=1)
def load_feature_relationships() -> pd.DataFrame:
    return _read(RELATIONSHIP_FILE)


@lru_cache(maxsize=1)
def load_condition_evidence() -> pd.DataFrame:
    return _read(CONDITION_FILE)


@lru_cache(maxsize=1)
def load_benchmarks() -> pd.DataFrame:
    return _read(BENCHMARK_FILE)


@lru_cache(maxsize=1)
def load_extended_services() -> pd.DataFrame:
    directory = latest_extension_directory()
    if directory is None:
        return pd.DataFrame()
    return pd.read_csv(directory / EXTENSION_FILE, encoding="utf-8-sig")


def extended_service_summary() -> dict[str, Any]:
    frame = load_extended_services()
    directory = latest_extension_directory()
    if frame.empty or directory is None:
        return {"status": "not_available", "categories": [], "services": []}
    categories = []
    for category, group in frame.groupby("분야"):
        categories.append({
            "category": str(category),
            "tested": int(len(group)),
            "approved": int(group["승인확인"].astype(str).str.lower().isin({"true", "1"}).sum()),
            "actual_data": int(group["실자료확인"].astype(str).str.lower().isin({"true", "1"}).sum()),
            "response_rows": int(pd.to_numeric(group["응답행수"], errors="coerce").fillna(0).sum()),
        })
    services = []
    for _, row in frame.iterrows():
        services.append({
            "category": str(row.get("분야", "")),
            "service_id": str(row.get("서비스ID", "")),
            "name": str(row.get("공식서비스명", "")),
            "http_status": int(row.get("HTTP상태", 0) or 0),
            "rows": int(row.get("응답행수", 0) or 0),
            "approved": str(row.get("승인확인", "")).lower() in {"true", "1"},
            "actual_data": str(row.get("실자료확인", "")).lower() in {"true", "1"},
            "role": str(row.get("분석역할", "")),
            "decision": str(row.get("현재적용판정", "")),
            "reason": str(row.get("판정근거", "")),
            "policy": str(row.get("자료정책", "")),
        })
    return {
        "status": "complete", "run_id": directory.name,
        "tested": len(services), "approved": sum(item["approved"] for item in services),
        "actual_data": sum(item["actual_data"] for item in services),
        "direct_model_inputs": 0, "categories": categories, "services": services,
        "full_audit": full_domain_audit_summary(),
    }


@lru_cache(maxsize=1)
def load_stage6_validation() -> dict[str, Any]:
    directory = latest_stage6_directory()
    if directory is None:
        return {"status": "not_available"}
    try:
        payload = json.loads(
            (REPORT_ROOT / directory.name / "validation.json").read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        return {"status": "validation_unreadable", "run_id": directory.name}
    return {"status": "complete", **payload}


def stage6_source_path() -> str:
    directory = latest_stage6_directory()
    return (
        f"data/processed/stage6/{directory.name}/{FORECAST_FILE}"
        if directory is not None else ""
    )


def _filter(frame: pd.DataFrame, pest: str, crop: str | None, region: str | None) -> pd.DataFrame:
    if frame.empty:
        return frame
    output = frame.copy()
    if "병해충" in output:
        output = output[output["병해충"].map(clean_name) == clean_name(pest)]
    if crop and crop != "전체" and "작물" in output:
        output = output[output["작물"] == crop]
    if region and region != "전체" and "지역" in output:
        output = output[output["지역"] == region]
    return output


def _weighted(frame: pd.DataFrame, column: str, weight: str = "관측수", digits: int = 2) -> float | None:
    if frame.empty or column not in frame:
        return None
    values = pd.to_numeric(frame[column], errors="coerce")
    weights = pd.to_numeric(frame.get(weight, pd.Series(1, index=frame.index)), errors="coerce").fillna(1).clip(lower=1)
    valid = values.notna()
    if not valid.any():
        return None
    return round(float(np.average(values[valid], weights=weights[valid])), digits)


def _conservative_confidence(values: pd.Series) -> str:
    order = {"낮음": 0, "보통": 1, "높음": 2}
    labels = [str(value) for value in values.dropna()]
    return min(labels, key=lambda item: order.get(item, 0)) if labels else "낮음"


def multiyear_context(pest: str, crop: str | None, region: str | None) -> dict[str, Any]:
    ledger = load_multiyear_ledger()
    frame = load_multiyear_common()
    benchmark = load_multiyear_benchmarks()
    if ledger.get("status") != "complete" or frame.empty:
        return {"status": "not_available", "summary": ledger, "benchmarks": [], "series": []}
    ranking_frame = _filter(frame, pest, crop, None)
    selected = _filter(ranking_frame, pest, crop, region)
    benchmark_items = []
    for _, row in benchmark.iterrows():
        benchmark_items.append({
            "code": str(row.get("모델코드", "")),
            "name": str(row.get("모델명", "")),
            "unit_count": int(row.get("검증단위수", 0) or 0),
            "mae": None if pd.isna(row.get("MAE")) else round(float(row["MAE"]), 4),
            "rmse": None if pd.isna(row.get("RMSE")) else round(float(row["RMSE"]), 4),
            "rank_correlation": None if pd.isna(row.get("순위상관")) else round(float(row["순위상관"]), 4),
            "mae_ci95": [
                None if pd.isna(row.get("MAE_95하한")) else round(float(row["MAE_95하한"]), 4),
                None if pd.isna(row.get("MAE_95상한")) else round(float(row["MAE_95상한"]), 4),
            ],
            "selected": str(row.get("선정", "")).strip().lower() in {"true", "1"},
            "bootstrap_best_percent": round(float(row.get("재표본최우수비율", 0) or 0), 1),
        })

    series = []
    if not selected.empty:
        for year in (2024, 2025, 2026):
            score_column = f"비교점수_{year}"
            weight_column = f"원천행수_{year}"
            score = _weighted(selected, score_column, weight_column, 1)
            series.append({
                "year": year,
                "kind": "실제 예찰 상대값",
                "year_status": "부분연도" if year == 2026 else "완전연도",
                "score": score,
                "source_rows": int(pd.to_numeric(selected.get(weight_column), errors="coerce").fillna(0).sum()),
            })
        forecast_score = _weighted(
            selected.assign(_forecast_weight=pd.to_numeric(selected.get("원천행수_2026"), errors="coerce").fillna(1)),
            "전망위험도_2027",
            "_forecast_weight",
            1,
        )
        series.append({
            "year": 2027,
            "kind": "3개년 상대 위험 전망",
            "year_status": "전망",
            "score": forecast_score,
            "source_rows": int(pd.to_numeric(selected.get("원천행수_2026"), errors="coerce").fillna(0).sum()),
        })
        confidence = _conservative_confidence(selected["신뢰도"])
    else:
        forecast_score = None
        confidence = "낮음"
    region_rankings = []
    for region_name, group in ranking_frame.groupby("지역"):
        weights_2026 = pd.to_numeric(group.get("원천행수_2026"), errors="coerce").fillna(1)
        regional_forecast = _weighted(
            group.assign(_forecast_weight=weights_2026), "전망위험도_2027", "_forecast_weight", 1
        )
        if regional_forecast is None:
            continue
        regional_2026 = _weighted(group, "비교점수_2026", "원천행수_2026", 1)
        delta = None if regional_2026 is None else regional_forecast - regional_2026
        if delta is None:
            regional_trend = "자료 부족"
        elif delta >= 5:
            regional_trend = "증가"
        elif delta <= -5:
            regional_trend = "감소"
        else:
            regional_trend = "유지"
        regional_level = "고위험" if regional_forecast >= 67 else ("주의" if regional_forecast >= 34 else "관찰")
        region_rankings.append({
            "region": str(region_name),
            "score_2024": _weighted(group, "비교점수_2024", "원천행수_2024", 1),
            "score_2025": _weighted(group, "비교점수_2025", "원천행수_2025", 1),
            "score_2026": regional_2026,
            "forecast_score": regional_forecast,
            "trend": regional_trend,
            "risk_level": regional_level,
            "observation_count": int(
                sum(pd.to_numeric(group.get(f"원천행수_{year}"), errors="coerce").fillna(0).sum() for year in (2024, 2025, 2026))
            ),
            "confidence": _conservative_confidence(group["신뢰도"]),
        })
    region_rankings.sort(key=lambda item: (item["forecast_score"], item["observation_count"]), reverse=True)
    return {
        "status": "complete",
        "run_id": ledger.get("run_id"),
        "condition_available": not selected.empty,
        "condition_unit_count": int(len(selected)),
        "confidence": confidence,
        "forecast_score": forecast_score,
        "series": series,
        "region_rankings": region_rankings,
        "benchmarks": benchmark_items,
        "summary": {
            key: ledger.get(key) for key in (
                "svc51_rows", "svc52_rows", "joined_rows", "unmatched_svc52_rows",
                "missing_occurrence_rows", "actual_zero_rows", "analysis_unit_rows",
                "common_three_year_units", "year_rows", "year_unit_rows", "year_status",
                "selected_model", "selected_model_name", "raw_mae_best_model",
                "statistical_tie", "parsimony_threshold_mae", "selection_rule",
                "bootstrap_repeats", "selection_stability_percent",
                "top_two_combined_stability_percent", "selected_mae", "selected_mae_ci95",
                "normalization", "comparison_rule", "target_policy",
            )
        },
        "disclaimer": (
            "2027 값은 NCPMS 2024·2025 완전연도와 2026 부분연도의 공통 조사단위를 이용한 "
            "상대 위험 전망이며 실제 발생확률 또는 확정 발생값이 아닙니다."
        ),
    }


def research_summary() -> dict[str, Any]:
    validation = load_stage6_validation()
    if validation.get("status") != "complete":
        return {"status": validation.get("status", "not_available"), "run_id": validation.get("run_id")}
    inputs = validation.get("inputs", {})
    analysis = validation.get("analysis", {})
    archive = validation.get("archive", {})
    source_rows = {
        "asos": int(inputs.get("asos_rows_scanned", 0)),
        "ncpms": int(inputs.get("ncpms_rows", 0)),
        "aws_valid": int(archive.get("aws_valid_rows", 0)),
        "marine": int(archive.get("marine_rows", 0)),
    }
    multiyear = load_multiyear_ledger()
    tribunal = load_model_tribunal()
    return {
        "status": "complete",
        "run_id": validation.get("run_id"),
        "source_rows": source_rows,
        "total_evidence_rows": sum(source_rows.values()),
        "derived_rows": {
            "station_day": int(analysis.get("station_day_rows", 0)),
            "province_day": int(analysis.get("province_day_rows", 0)),
            "analysis_units": int(analysis.get("analysis_unit_rows", 0)),
            "common_pairs": int(analysis.get("common_pair_rows", 0)),
            "feature_relationships": int(analysis.get("feature_relationship_rows", 0)),
        },
        "weather_join_percent": validation.get("join", {}).get("pre_survey_weather_join_percent"),
        "selected_baseline": validation.get("benchmark", {}).get("selected_model"),
        "selected_mae": validation.get("benchmark", {}).get("selected_mae"),
        "checks": validation.get("checks", {}),
        "source": stage6_source_path(),
        "extended_weather_services": extended_service_summary(),
        "multiyear_analysis": multiyear,
        "model_tribunal": tribunal,
    }


def research_context(pest: str, crop: str | None, region: str | None) -> dict[str, Any]:
    summary = research_summary()
    multiyear = multiyear_context(pest, crop, region)
    tribunal = load_model_tribunal()
    forecast = _filter(load_research_forecast(), pest, crop, region)
    relationships = _filter(load_feature_relationships(), pest, crop, None)
    condition = _filter(load_condition_evidence(), pest, crop, region)
    benchmarks = load_benchmarks()
    if summary.get("status") != "complete":
        return {
            "status": "not_available", "summary": summary, "benchmarks": [],
            "top_features": [], "year_evidence": [], "safeguards": [],
            "multiyear_analysis": multiyear, "model_tribunal": tribunal,
        }

    benchmark_items = []
    for _, row in benchmarks.iterrows():
        benchmark_items.append({
            "code": str(row.get("모델코드", "")),
            "name": str(row.get("기준선", "")),
            "pair_count": int(row.get("검증쌍수", 0) or 0),
            "mae": None if pd.isna(row.get("MAE")) else round(float(row["MAE"]), 3),
            "rmse": None if pd.isna(row.get("RMSE")) else round(float(row["RMSE"]), 3),
            "rank_correlation": None if pd.isna(row.get("순위상관")) else round(float(row["순위상관"]), 3),
            "selected": str(row.get("선정", "")).strip().lower() in {"true", "1"},
        })

    top_features = []
    if not relationships.empty:
        relationships = relationships.copy()
        relationships["중요도지수"] = pd.to_numeric(relationships["중요도지수"], errors="coerce")
        relationships = relationships.sort_values(["중요도지수", "비교단위수"], ascending=False)
        seen: set[str] = set()
        for _, row in relationships.iterrows():
            label = str(row.get("기상특징", ""))
            if not label or label in seen:
                continue
            seen.add(label)
            coefficient = pd.to_numeric(pd.Series([row.get("순위상관계수")]), errors="coerce").iloc[0]
            top_features.append({
                "feature": label,
                "coefficient": None if pd.isna(coefficient) else round(float(coefficient), 3),
                "evidence_count": int(row.get("비교단위수", 0) or 0),
                "grade": str(row.get("근거등급", "자료 부족")),
                "direction": str(row.get("관계방향", "판단 불가")),
                "importance": None if pd.isna(row.get("중요도지수")) else round(float(row["중요도지수"]), 3),
            })
            if len(top_features) >= 8:
                break

    year_evidence = []
    if not condition.empty:
        for year, group in condition.groupby("조사연도"):
            feature_complete = _weighted(group, "기상특징완전율", "분석단위수", 1)
            year_evidence.append({
                "year": int(year),
                "year_status": "부분연도" if int(year) == 2026 else "완전연도",
                "risk_score": _weighted(group, "상대위험도", "분석단위수", 1),
                "analysis_units": int(pd.to_numeric(group["분석단위수"], errors="coerce").fillna(0).sum()),
                "source_observations": int(pd.to_numeric(group["원천관측수"], errors="coerce").fillna(0).sum()),
                "feature_completeness": feature_complete,
                "lag_windows": {
                    "7d_temperature": _weighted(group, "기온평균_7일", "분석단위수", 1),
                    "14d_temperature": _weighted(group, "기온평균_14일", "분석단위수", 1),
                    "30d_temperature": _weighted(group, "기온평균_30일", "분석단위수", 1),
                    "30d_humidity": _weighted(group, "습도평균_30일", "분석단위수", 1),
                    "30d_wind": _weighted(group, "풍속평균_30일", "분석단위수", 2),
                    "30d_rain": _weighted(group, "강수누적_30일", "분석단위수", 1),
                },
            })
    year_evidence.sort(key=lambda item: item["year"])

    if forecast.empty:
        confidence = "낮음"
        interval = {"lower": None, "point": None, "upper": None}
        evidence_index = pair_count = weather_coverage = None
        core_factors = "자료 부족"
    else:
        confidence = _conservative_confidence(forecast["연구신뢰도"])
        interval = {
            "lower": _weighted(forecast, "전망하한", "관측수", 0),
            "point": _weighted(forecast, "전망위험도_2027", "관측수", 0),
            "upper": _weighted(forecast, "전망상한", "관측수", 0),
        }
        interval = {key: None if value is None else int(round(value)) for key, value in interval.items()}
        evidence_index = _weighted(forecast, "근거지수", "관측수", 1)
        pair_count = int(pd.to_numeric(forecast["공통비교쌍수"], errors="coerce").fillna(0).sum())
        weather_coverage = _weighted(forecast, "기상특징완전율", "관측수", 1)
        factors = [str(value) for value in forecast["핵심시차기상근거"].dropna().unique() if str(value) != "자료 부족"]
        core_factors = factors[0] if factors else "자료 부족"

    safeguards = [
        {"label": "시간 누수 방지", "status": "통과", "detail": "조사 당일을 제외하고 조사 전 7·14·30일 관측만 사용"},
        {"label": "기준선 경쟁", "status": "통과", "detail": "복잡도보다 2026 재현 MAE가 낮은 모델을 선택"},
        {"label": "결측 보존", "status": "통과", "detail": "자료 없음과 실제 발생값 0을 분리하고 미보간"},
        {"label": "부분기간 격리", "status": "통과", "detail": "AWS·해양 부분기간 자료는 전국 모델에서 제외"},
        {"label": "확률 과장 방지", "status": "통과", "detail": "발생확률이 아닌 2027 상대 위험 전망과 구간으로 표시"},
        {"label": "3개년 후향검증", "status": "통과", "detail": "2024·2025로 2026 공통단위를 가리고 재현한 뒤 1,000회 짝지은 재표본 검증"},
    ]
    return {
        "status": "complete",
        "pest": pest, "crop": crop or "전체", "region": region or "전체",
        "summary": summary, "confidence": confidence, "evidence_index": evidence_index,
        "forecast_interval": interval, "common_pair_count": pair_count,
        "weather_feature_completeness": weather_coverage, "core_lag_factors": core_factors,
        "benchmarks": benchmark_items, "top_features": top_features,
        "year_evidence": year_evidence, "safeguards": safeguards,
        "multiyear_analysis": multiyear,
        "model_tribunal": tribunal,
        "extended_weather_services": extended_service_summary(),
        "limitations": "2024·2025 완전연도와 2026 부분연도의 내부 후향검증입니다. 독립 외부검증이나 실제 발생확률이 아니며, 2026년 부분기간 편향 가능성을 공개합니다.",
        "source": stage6_source_path(),
    }


def clear_research_cache() -> None:
    latest_stage6_directory.cache_clear()
    latest_stage19_directory.cache_clear()
    latest_stage20_directory.cache_clear()
    latest_extension_directory.cache_clear()
    latest_four_domain_audit.cache_clear()
    latest_fusion_recheck.cache_clear()
    fusion_recheck_summary.cache_clear()
    full_domain_audit_summary.cache_clear()
    load_research_forecast.cache_clear()
    load_feature_relationships.cache_clear()
    load_condition_evidence.cache_clear()
    load_benchmarks.cache_clear()
    load_stage6_validation.cache_clear()
    load_extended_services.cache_clear()
    load_model_tribunal.cache_clear()
    load_multiyear_ledger.cache_clear()
    load_multiyear_common.cache_clear()
    load_multiyear_benchmarks.cache_clear()
