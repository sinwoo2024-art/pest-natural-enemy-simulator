from __future__ import annotations

import json
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    from .landscape_review import SMARTFARM_BOUNDARY
except ImportError:
    from landscape_review import SMARTFARM_BOUNDARY


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

REGION_ALIASES = {
    "서울": "서울특별시",
    "부산": "부산광역시",
    "대구": "대구광역시",
    "인천": "인천광역시",
    "광주": "광주광역시",
    "대전": "대전광역시",
    "울산": "울산광역시",
    "세종": "세종특별자치시",
    "경기": "경기도",
    "강원": "강원특별자치도",
    "강원도": "강원특별자치도",
    "충북": "충청북도",
    "충남": "충청남도",
    "전북": "전북특별자치도",
    "전라북도": "전북특별자치도",
    "전남": "전라남도",
    "경북": "경상북도",
    "경남": "경상남도",
    "제주": "제주특별자치도",
    "제주도": "제주특별자치도",
}

CROP_ALIASES = {
    "논벼": "벼",
    "벼(논벼)": "벼",
}

SERVICE_LABELS = {
    "greenhouse_realtime": "시설원예 실시간",
    "greenhouse_item": "시설원예 품목 데이터마트",
    "greenhouse_year": "시설원예 작기별 데이터마트",
    "outdoor_realtime": "노지 스마트팜 실시간",
}


def _latest(pattern: str) -> Path | None:
    candidates = sorted(DATA.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def _load_json(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split())


def _canonical_region(value: Any) -> str:
    cleaned = _clean(value)
    return REGION_ALIASES.get(cleaned, cleaned)


def _canonical_crop(value: Any) -> str:
    cleaned = _clean(value)
    return CROP_ALIASES.get(cleaned, cleaned)


def _month(value: Any) -> int | None:
    text = _clean(value)
    try:
        month = int(text[5:7])
    except (TypeError, ValueError):
        return None
    return month if 1 <= month <= 12 else None


def _record_count(value: Any) -> int:
    if not isinstance(value, dict):
        return 0
    try:
        return int(value.get("record_count") or 0)
    except (TypeError, ValueError):
        return 0


def _numeric(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number


@lru_cache(maxsize=1)
def _source_bundle() -> dict[str, Any]:
    evidence_path = _latest("processed/stage26/stage26_smartfarm_year_*/smartfarm_year_evidence.json")
    evidence = _load_json(evidence_path)
    run_id = evidence_path.parent.name if evidence_path is not None else ""
    manifest_path = DATA / "reports" / "stage26" / run_id / "manifest.json" if run_id else None
    manifest = _load_json(manifest_path)
    return {
        "evidence_path": evidence_path,
        "manifest_path": manifest_path,
        "evidence": evidence,
        "manifest": manifest,
    }


def clear_smartfarm_evidence_cache() -> None:
    _source_bundle.cache_clear()


def _approval_summary(payload: dict[str, Any]) -> dict[str, Any]:
    audit = payload.get("approval_audit") or {}
    services = []
    for item in audit.get("services") or []:
        code = _clean(item.get("service_code"))
        status_codes = [_clean(value) for value in item.get("status_codes") or []]
        approved = bool(item.get("approved_and_usable"))
        services.append(
            {
                "code": code,
                "name": SERVICE_LABELS.get(code, code),
                "approved": approved,
                "state": "수집 완료" if approved else "서비스별 활용신청 필요",
                "status_code": status_codes[0] if status_codes else None,
                "document_url": item.get("document_url"),
            }
        )
    return {
        "approved_count": sum(1 for item in services if item["approved"]),
        "checked_count": len(services),
        "services": services,
        "credential_configured": bool((audit.get("credential") or {}).get("configured")),
        "credential_raw_recorded": False,
        "caution": "동일 인증키라도 스마트팜코리아에서 세부 서비스별 활용신청이 필요합니다.",
    }


def smartfarm_evidence(*, crop: str = "전체", region: str = "전체") -> dict[str, Any]:
    bundle = _source_bundle()
    payload = bundle["evidence"]
    if not payload:
        return {
            "available": False,
            "selected_condition": {"crop": crop or "전체", "region": region or "전체"},
            "message": "스마트팜코리아 작기별 공식 수집 결과가 없습니다.",
            "claim_boundary": {
                **SMARTFARM_BOUNDARY,
                "direct_ncpms_field_link": False,
                "natural_enemy_causal_effect": False,
                "economic_causal_effect": False,
            },
        }

    selected_crop = _canonical_crop(crop)
    selected_region = _canonical_region(region)
    seasons = list(payload.get("seasons") or [])
    selected = []
    for item in seasons:
        crop_matches = not selected_crop or selected_crop == "전체" or _canonical_crop(item.get("crop")) == selected_crop
        province = _canonical_region(item.get("province"))
        district = _clean(item.get("district"))
        region_matches = (
            not selected_region
            or selected_region == "전체"
            or province == selected_region
            or district == _clean(region)
        )
        if crop_matches and region_matches:
            selected.append(item)

    start_counts = Counter(month for month in (_month(item.get("season_start")) for item in selected) if month)
    end_counts = Counter(month for month in (_month(item.get("season_end")) for item in selected) if month)
    monthly_profile = [
        {
            "month": month,
            "season_starts": int(start_counts.get(month, 0)),
            "season_ends": int(end_counts.get(month, 0)),
        }
        for month in range(1, 13)
    ]
    busiest_start = max(monthly_profile, key=lambda item: item["season_starts"], default=None)
    busiest_end = max(monthly_profile, key=lambda item: item["season_ends"], default=None)

    year_counts = Counter(_clean(item.get("year")) for item in selected if _clean(item.get("year")))
    crop_counts = Counter(_clean(item.get("crop")) for item in selected if _clean(item.get("crop")))
    province_counts = Counter(_clean(item.get("province")) for item in selected if _clean(item.get("province")))
    district_counts = Counter(
        (_clean(item.get("province")), _clean(item.get("district")))
        for item in selected
        if _clean(item.get("district"))
    )

    output_rows = [item for item in selected if _record_count(item.get("management_output")) > 0]
    cost_rows = [item for item in selected if _record_count(item.get("management_cost")) > 0]
    observed_income = [
        value
        for value in (_numeric((item.get("management_output") or {}).get("opIncome_sum")) for item in output_rows)
        if value is not None
    ]

    summary = payload.get("summary") or {}
    manifest_requests = bundle["manifest"].get("requests") or {}
    sample_cases = [
        {
            "case_id": item.get("case_id"),
            "year": item.get("year"),
            "crop": item.get("crop"),
            "variety": item.get("variety"),
            "province": item.get("province"),
            "district": item.get("district"),
            "facility_type": item.get("facility_type"),
            "cultivation_method": item.get("cultivation_method"),
            "area_m2": item.get("area_m2"),
            "season_start": item.get("season_start"),
            "season_end": item.get("season_end"),
            "management_output_observed": _record_count(item.get("management_output")) > 0,
            "management_cost_observed": _record_count(item.get("management_cost")) > 0,
        }
        for item in selected[:8]
    ]

    return {
        "available": True,
        "generated_at": payload.get("generated_at"),
        "source": {
            "provider": "스마트팜코리아",
            "service": "시설원예 작기별 데이터마트",
            "coverage": (payload.get("source") or {}).get("coverage") or "2015~2024",
            "document_url": (payload.get("source") or {}).get("document_url"),
            "processed_file": bundle["evidence_path"].name if bundle["evidence_path"] else None,
        },
        "collection_validation": {
            "requests": int(manifest_requests.get("actual") or 0),
            "success": int(manifest_requests.get("success") or 0),
            "failure": int(manifest_requests.get("failure") or 0),
            "credential_configured": True,
            "credential_raw_recorded": False,
        },
        "official_summary": {
            "farm_count": int(summary.get("farm_count") or 0),
            "farm_season_rows": int(summary.get("farm_season_rows") or 0),
            "season_date_rows": int(summary.get("season_date_rows") or 0),
            "crop_count": int(summary.get("crop_count") or 0),
            "province_count": int(summary.get("province_count") or 0),
            "district_count": int(summary.get("district_count") or 0),
            "management_output_observed_seasons": int(summary.get("management_output_observed_seasons") or 0),
            "management_cost_observed_seasons": int(summary.get("management_cost_observed_seasons") or 0),
        },
        "selected_condition": {
            "crop": crop or "전체",
            "region": region or "전체",
            "matched_seasons": len(selected),
            "matched_anonymised_cases": len(
                {item.get("case_id") for item in selected if item.get("case_id")}
            ),
            "year_count": len(year_counts),
            "province_count": len(province_counts),
            "district_count": len(district_counts),
            "data_status": "작기 근거 있음" if selected else "선택 조건 작기자료 없음",
        },
        "timing_context": {
            "monthly_profile": monthly_profile,
            "busiest_start_month": busiest_start["month"] if busiest_start and busiest_start["season_starts"] else None,
            "busiest_end_month": busiest_end["month"] if busiest_end and busiest_end["season_ends"] else None,
            "interpretation": (
                "작기 시작·종료 분포는 작기·시설환경 맥락 확인용이며, 시설 해충 밀도·방사밀도·최적 방사 시점을 산출하지 않습니다."
            ),
        },
        "distributions": {
            "year": [{"year": key, "rows": value} for key, value in sorted(year_counts.items())],
            "crop": [{"crop": key, "rows": value} for key, value in crop_counts.most_common()],
            "province": [{"province": key, "rows": value} for key, value in province_counts.most_common()],
            "district": [
                {"province": key[0], "district": key[1], "rows": value}
                for key, value in district_counts.most_common(20)
            ],
        },
        "economic_observations": {
            "output_observed_seasons": len(output_rows),
            "cost_observed_seasons": len(cost_rows),
            "income_value_observations": len(observed_income),
            "observed_income_sum_won": round(sum(observed_income), 2) if observed_income else None,
            "causal_effect_available": False,
            "interpretation": "경영성과·비용은 관측 유무와 기술통계만 제시하며 천적 투입 효과 또는 절감액으로 해석하지 않습니다.",
        },
        "sample_cases": sample_cases,
        "approval": _approval_summary(payload),
        "claim_boundary": {
            **SMARTFARM_BOUNDARY,
            "direct_ncpms_field_link": False,
            "natural_enemy_causal_effect": False,
            "economic_causal_effect": False,
            "allowed_use": "별도 확장 연구: 작기·시설환경·경영 관측 맥락 확인; 실제 시설 해충 밀도자료 확보 후 검증 예정",
            "prohibited_claim": "NCPMS 점수 합산, 시설 해충 밀도·방사밀도·최적 시점 추정 금지. 발생확률·방제효과율·경제효과를 확정하지 않음",
        },
    }
