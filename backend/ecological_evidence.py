"""Read-only Stage 13 ecological and experimental evidence API payloads."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
STAGE13_ROOT = ROOT / "data" / "processed" / "stage13"

FILES = {
    "distribution": "생태계교란생물_분포_2016_2024.csv",
    "distribution_summary": "생태계교란생물_지역연도_요약.csv",
    "invasive_insects": "외래곤충_지역연도_관측근거.csv",
    "radiation_sample": "방사선조사_해충_실험샘플_정제.csv",
    "radiation_summary": "방사선조사_해충_실험샘플_선량요약.csv",
    "insect_reports": "전국자연환경조사_2019_육상곤충_문서인덱스.csv",
    "natural_enemy_matches": "육상곤충보고서_천적종명_문헌매칭.csv",
    "agchm": "농약안전사용지침_OpenAPI_명세.csv",
    "registry": "공식근거_활용등급_레지스트리.csv",
    "radioactivity": "전국환경방사능_보고서_활용판정.csv",
}


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


@lru_cache(maxsize=1)
def latest_stage13_directory() -> Path | None:
    if not STAGE13_ROOT.exists():
        return None
    candidates = [
        path
        for path in STAGE13_ROOT.glob("stage13_ecological_evidence_*")
        if path.is_dir() and all((path / filename).exists() for filename in FILES.values())
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


def _read(path: Path, filename: str) -> pd.DataFrame:
    return pd.read_csv(path / filename, encoding="utf-8-sig", dtype=str, keep_default_na=False)


@lru_cache(maxsize=1)
def _sources() -> dict[str, Any]:
    directory = latest_stage13_directory()
    if directory is None:
        return {"directory": None, **{key: pd.DataFrame() for key in FILES}}
    return {
        "directory": directory,
        **{key: _read(directory, filename) for key, filename in FILES.items()},
    }


def clear_ecological_evidence_cache() -> None:
    latest_stage13_directory.cache_clear()
    _sources.cache_clear()


def _as_int(value: Any) -> int | None:
    text = _clean(value)
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _as_float(value: Any) -> float | None:
    text = _clean(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _records(frame: pd.DataFrame, fields: dict[str, str], limit: int | None = None) -> list[dict[str, Any]]:
    output = []
    selected = frame if limit is None else frame.head(limit)
    for _, row in selected.iterrows():
        output.append({target: _clean(row.get(source)) for target, source in fields.items()})
    return output


def _deterministic_sample(frame: pd.DataFrame, limit: int) -> pd.DataFrame:
    if len(frame) <= limit:
        return frame
    indexes = [round(index * (len(frame) - 1) / (limit - 1)) for index in range(limit)] if limit > 1 else [0]
    return frame.iloc[indexes]


def ecological_evidence_context(
    *,
    year: int | None = None,
    region: str | None = None,
    species: str | None = None,
    limit: int = 300,
) -> dict[str, Any]:
    sources = _sources()
    directory = sources["directory"]
    distribution = sources["distribution"].copy()
    if directory is None or distribution.empty:
        return {
            "status": "not_available",
            "available": False,
            "message": "검증된 Stage 13 공식 생태 근거가 없습니다.",
        }

    selected = distribution.copy()
    if year is not None:
        selected = selected[pd.to_numeric(selected["조사연도"], errors="coerce").eq(year)]
    if region and region != "전체":
        selected = selected[selected["시도명"].eq(region)]
    if species and species != "전체":
        selected = selected[selected["한글보통명"].eq(species)]

    point_frame = selected[
        pd.to_numeric(selected["위도"], errors="coerce").notna()
        & pd.to_numeric(selected["경도"], errors="coerce").notna()
    ].sort_values(["조사연도", "시도명", "시군구명", "한글보통명", "ID"])
    point_frame = _deterministic_sample(point_frame, limit)
    points = []
    for _, row in point_frame.iterrows():
        points.append(
            {
                "id": _clean(row.get("ID")),
                "year": _as_int(row.get("조사연도")),
                "class_name": _clean(row.get("분류군명")),
                "region": _clean(row.get("시도명")),
                "district": _clean(row.get("시군구명")) or None,
                "species": _clean(row.get("한글보통명")),
                "scientific_name": _clean(row.get("학명")),
                "latitude": _as_float(row.get("위도")),
                "longitude": _as_float(row.get("경도")),
                "data_status": _clean(row.get("자료상태")),
                "ncpms_exact_match": _clean(row.get("NCPMS명칭정확일치")) == "Y",
            }
        )

    ranking_source = selected.copy()
    ranking_source["_year"] = pd.to_numeric(ranking_source["조사연도"], errors="coerce")
    regional_rankings = []
    for region_name, group in ranking_source.groupby("시도명", dropna=False):
        if not _clean(region_name):
            continue
        regional_rankings.append(
            {
                "region": _clean(region_name),
                "record_count": int(len(group)),
                "species_count": int(group["한글보통명"].nunique()),
                "district_count": int(group.loc[group["시군구명"].ne(""), "시군구명"].nunique()),
                "latest_year": _as_int(group["_year"].max()),
                "ncpms_exact_match_records": int(group["NCPMS명칭정확일치"].eq("Y").sum()),
            }
        )
    regional_rankings.sort(key=lambda item: (item["record_count"], item["species_count"]), reverse=True)

    species_rankings = []
    for species_name, group in ranking_source.groupby("한글보통명", dropna=False):
        if not _clean(species_name):
            continue
        species_rankings.append(
            {
                "species": _clean(species_name),
                "scientific_name": _clean(group["학명"].iloc[0]),
                "record_count": int(len(group)),
                "region_count": int(group["시도명"].nunique()),
                "district_count": int(group.loc[group["시군구명"].ne(""), "시군구명"].nunique()),
                "first_year": _as_int(group["_year"].min()),
                "latest_year": _as_int(group["_year"].max()),
                "ncpms_exact_match": bool(group["NCPMS명칭정확일치"].eq("Y").any()),
            }
        )
    species_rankings.sort(key=lambda item: (item["record_count"], item["region_count"]), reverse=True)

    report_frame = sources["insect_reports"]
    natural_enemy_frame = sources["natural_enemy_matches"]
    natural_enemy_summary = []
    if not natural_enemy_frame.empty:
        natural_enemy_frame["_mentions"] = (
            pd.to_numeric(natural_enemy_frame["한글명언급수"], errors="coerce").fillna(0)
            + pd.to_numeric(natural_enemy_frame["학명언급수"], errors="coerce").fillna(0)
        )
        grouped_enemies = natural_enemy_frame.groupby(["천적명", "학명"], dropna=False)
        for (enemy_name, scientific_name), group in grouped_enemies:
            natural_enemy_summary.append(
                {
                    "name": _clean(enemy_name) or None,
                    "scientific_name": _clean(scientific_name) or None,
                    "report_count": int(group["보고서파일"].nunique()),
                    "mention_count": int(group["_mentions"].sum()),
                    "evidence_type": "2019 육상곤충 조사보고서 종명 정확일치",
                    "release_timing_evidence": False,
                    "effect_evidence": False,
                }
            )
        natural_enemy_summary.sort(key=lambda item: (item["report_count"], item["mention_count"]), reverse=True)

    radiation_summary = []
    for _, row in sources["radiation_summary"].iterrows():
        radiation_summary.append(
            {
                "dose": _clean(row.get("조사선량")),
                "dose_gy": _as_float(row.get("조사선량_Gy")),
                "observation_count": _as_int(row.get("관측수")),
                "development_state_count": _as_int(row.get("발육상태구분수")),
                "numeric_value_count": _as_int(row.get("수치값존재수")),
                "field_management_model_input": False,
            }
        )

    evidence_gate = []
    for _, row in sources["registry"].iterrows():
        evidence_gate.append(
            {
                "id": _clean(row.get("근거ID")),
                "source": _clean(row.get("공식자료")),
                "volume": _clean(row.get("보유량")),
                "spatiotemporal_unit": _clean(row.get("시공간단위")),
                "use_grade": _clean(row.get("사용등급")),
                "direct_2027_input": _clean(row.get("2027점수직접반영")) == "Y",
                "app_visibility": _clean(row.get("앱표시")),
                "reason": _clean(row.get("판정근거")),
            }
        )

    agchm = sources["agchm"]
    agchm_services = agchm.loc[agchm["구분"].eq("서비스"), "이름"].tolist()
    agchm_operations = agchm.loc[agchm["구분"].eq("오퍼레이션"), "이름"].tolist()
    radioactivity = sources["radioactivity"]
    all_years = sorted(pd.to_numeric(distribution["조사연도"], errors="coerce").dropna().astype(int).unique().tolist())
    all_regions = sorted(value for value in distribution["시도명"].unique().tolist() if value)
    all_species = sorted(value for value in distribution["한글보통명"].unique().tolist() if value)

    return {
        "status": "complete",
        "available": True,
        "run_id": directory.name,
        "selected": {"year": year, "region": region or "전체", "species": species or "전체"},
        "filters": {"years": all_years, "regions": all_regions, "species": all_species},
        "summary": {
            "distribution_rows": int(len(distribution)),
            "selected_rows": int(len(selected)),
            "species_count": int(distribution["한글보통명"].nunique()),
            "region_count": int(distribution["시도명"].nunique()),
            "district_count": int(distribution.loc[distribution["시군구명"].ne(""), "시군구명"].nunique()),
            "coordinate_count": int((distribution["위도"].ne("") & distribution["경도"].ne("")).sum()),
            "ncpms_exact_match_rows": int(distribution["NCPMS명칭정확일치"].eq("Y").sum()),
            "insect_reports": int(len(report_frame)),
            "insect_report_pages": int(pd.to_numeric(report_frame["페이지수"], errors="coerce").fillna(0).sum()),
            "natural_enemy_document_matches": int(len(natural_enemy_frame)),
            "radiation_sample_rows": int(len(sources["radiation_sample"])),
            "radioactivity_report_count": int(len(radioactivity)),
            "agchm_spec_rows": int(len(agchm)),
        },
        "map": {
            "point_count": len(points),
            "total_filtered_points": int(len(selected)),
            "sampling": "필터 결과를 정렬한 뒤 균등 간격 결정표본",
            "points": points,
        },
        "regional_rankings": regional_rankings[:20],
        "species_rankings": species_rankings[:20],
        "natural_enemy_evidence": natural_enemy_summary[:30],
        "radiation_research_sandbox": {
            "available": bool(radiation_summary),
            "source_rows": int(len(sources["radiation_sample"])),
            "dose_groups": radiation_summary,
            "field_recommendation_allowed": False,
            "caution": "공식 제공 실험 샘플의 기술통계이며 현장 방제효과·발생확률·천적 효과 근거가 아닙니다.",
        },
        "pesticide_safety_connector": {
            "manual_available": not agchm.empty,
            "services": agchm_services,
            "operations": agchm_operations,
            "spec_rows": int(len(agchm)),
            "api_called": False,
            "key_value_exposed": False,
            "status": "기술명세 연결 완료 · 실제 최신 응답은 재발급 키 환경변수와 서비스 승인이 필요",
        },
        "evidence_gate": evidence_gate,
        "model_policy": {
            "direct_2027_inputs_added": 0,
            "context_layers_added": 4,
            "excluded_sources": [item["source"] for item in evidence_gate if item["use_grade"] == "모델 제외"],
            "reason": "새 자료의 시공간 단위와 목적이 NCPMS 상대위험 학습단위와 다르므로 점수에는 직접 혼합하지 않고 독립 근거층으로 제공합니다.",
        },
        "limitations": [
            "분포 관측기록은 발생확률·피해강도·방제효과가 아닙니다.",
            "천적 종명 문헌 일치는 투입 적기·방사량·효과율을 입증하지 않습니다.",
            "방사선 해충 샘플과 환경방사능 보고서는 2027 병해충 상대위험 점수에 사용하지 않습니다.",
            "자료 없음은 발생하지 않음으로 해석하지 않습니다.",
        ],
        "source": f"data/processed/stage13/{directory.name}",
    }
