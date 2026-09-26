from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from .adoption_review import explicit_target_match
except ImportError:
    from adoption_review import explicit_target_match

try:
    from .work_safety_risk import clear_work_safety_cache, safety_risk_context
except ImportError:
    from work_safety_risk import clear_work_safety_cache, safety_risk_context


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

PSIS_GUIDE_URL = "https://psis.rda.go.kr/psis/cont/contentMain.ps?menuId=PS00381"
PSIS_APPLICATION_URL = "https://psis.rda.go.kr/psis/share/api/apiReqstAddForm.ps?menuId=PS00383"
PSIS_SEARCH_URL = (
    "https://nongsaro.go.kr/portal/ps/psa/psab/psaba/"
    "openApiAgchmRegistInfoLst.ps?menuId=PS03704"
)

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
    "강원도": "강원특별자치도",
    "강원": "강원특별자치도",
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

KOSHA_REGION_LABELS = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원특별자치도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전북특별자치도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
}


def _latest(pattern: str) -> Path | None:
    candidates = sorted(DATA.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def _read(path: Path | None) -> pd.DataFrame:
    if path is None or not path.exists():
        return pd.DataFrame()
    for encoding in ("utf-8-sig", "utf-8", "cp949"):
        try:
            return pd.read_csv(path, encoding=encoding, low_memory=False)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return pd.read_csv(path, low_memory=False)


def _clean(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _canonical_region(value: Any) -> str:
    cleaned = _clean(value)
    return REGION_ALIASES.get(cleaned, cleaned)


def _name_key(value: Any) -> str:
    return re.sub(r"[\s\(\)\[\]{}·ㆍ,_\-]", "", _clean(value)).lower()


def _crop_key(value: Any) -> str:
    cleaned = _clean(value)
    return _name_key(CROP_ALIASES.get(cleaned, cleaned))


def _number(value: Any) -> float | None:
    parsed = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
    return None if pd.isna(parsed) else float(parsed)


def _as_int(value: Any) -> int:
    number = _number(value)
    return 0 if number is None else int(number)


def _secret_status(name: str) -> str:
    value = os.environ.get(name, "")
    if not value and os.name == "nt":
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
                value = str(winreg.QueryValueEx(key, name)[0]).strip()
        except (FileNotFoundError, OSError, ImportError):
            value = ""
    return "설정됨" if value else "미설정"


def _pesticide_path() -> Path:
    direct = DATA / "processed" / "등록농약DB.csv"
    candidates = [
        direct,
        _latest("processed/stage10/stage10_psis_excel_*/등록농약_앱연결.csv"),
        _latest("processed/stage9/stage9_psis_*/등록농약DB.csv"),
    ]
    usable = [path for path in candidates if path is not None and path.exists() and path.stat().st_size > 1024]
    return max(usable, key=lambda path: path.stat().st_mtime) if usable else direct


def _natural_enemy_evidence_path() -> Path:
    direct = DATA / "processed" / "천적투입기준DB.csv"
    latest = _latest("processed/stage15/stage15_quantitative_evidence_*/천적_정량투입_시험근거.csv")
    return latest if latest is not None and latest.exists() else direct


@lru_cache(maxsize=1)
def _sources() -> dict[str, Any]:
    paths = {
        "cultivation": DATA / "processed" / "재배유형_기준.csv",
        "smartfarm": DATA / "processed" / "smartfarm_cultivation_normalized.csv",
        "district": _latest("processed/stage4/stage4_ncpms_daily_full_*_reprocessed_*/일자별예찰_시군구_원형.csv"),
        "indicator_codes": _latest("processed/stage4/stage4_ncpms_daily_full_*_reprocessed_*/병해충측정항목_코드.csv"),
        "monthly": _latest("processed/stage5/stage5_*/forecast_2027_region_month.csv"),
        "survey_sites": _latest("processed/stage15/stage15_field_network_safety_*/NCPMS_대표관측지점_앱연결.csv"),
        "natural_enemy": _natural_enemy_evidence_path(),
        "evidence_bridge": _latest("processed/stage21/stage21_evidence_bridge_*/재배환경_근거브리지.csv"),
        "effect_ledger": _latest("processed/stage21/stage21_evidence_bridge_*/천적_시험효과_수치원장.csv"),
        "effect_summary": _latest("processed/stage21/stage21_evidence_bridge_*/천적_시험효과_요약.csv"),
        "pesticide": _pesticide_path(),
        "accident_stats": _latest("processed/stage15/stage15_field_network_safety_*/농업기계_관측사고지표_앱연결.csv"),
        "kosha_micro": _latest("processed/stage15/stage15_kosha_microdata_*/KOSHA_농업산업재해_2017_2023_마이크로.csv"),
        "kosha_year": _latest("processed/stage15/stage15_kosha_microdata_*/KOSHA_농업산업재해_연도요약.csv"),
        "kosha_region": _latest("processed/stage15/stage15_kosha_microdata_*/KOSHA_농업산업재해_지역요약.csv"),
        "kosha_event": _latest("processed/stage15/stage15_kosha_microdata_*/KOSHA_농업산업재해_발생형태요약.csv"),
        "safety": _latest("processed/stage8/stage8_safety_checklists_*/농작업안전_공식체크리스트_항목.csv"),
        "work_safety": _latest("processed/stage8/stage8_safety_checklists_*/농작업안전DB.csv"),
        "machinery": (
            _latest("processed/stage8/stage8_safety_checklists_*/농기계안전DB.csv")
            or DATA / "processed" / "농기계안전DB.csv"
        ),
    }
    return {
        "paths": paths,
        "cultivation": _read(paths["cultivation"]),
        "smartfarm": _read(paths["smartfarm"]),
        "district": _read(paths["district"]),
        "indicator_codes": _read(paths["indicator_codes"]),
        "monthly": _read(paths["monthly"]),
        "survey_sites": _read(paths["survey_sites"]),
        "natural_enemy": _read(paths["natural_enemy"]),
        "evidence_bridge": _read(paths["evidence_bridge"]),
        "effect_ledger": _read(paths["effect_ledger"]),
        "effect_summary": _read(paths["effect_summary"]),
        "pesticide": _read(paths["pesticide"]),
        "accident_stats": _read(paths["accident_stats"]),
        "kosha_micro": _read(paths["kosha_micro"]),
        "kosha_year": _read(paths["kosha_year"]),
        "kosha_region": _read(paths["kosha_region"]),
        "kosha_event": _read(paths["kosha_event"]),
        "safety": _read(paths["safety"]),
        "work_safety": _read(paths["work_safety"]),
        "machinery": _read(paths["machinery"]),
    }


def clear_decision_cache() -> None:
    _sources.cache_clear()
    clear_work_safety_cache()


def _evidence_bridge_context(crop: str, region: str) -> dict[str, Any]:
    frame = _sources()["evidence_bridge"].copy()
    if frame.empty:
        return {
            "available": False,
            "rows": 0,
            "grade_counts": {},
            "best_grade": "자료 없음",
            "direct_field_key": False,
            "risk_adjustment_allowed": False,
            "matched_districts": [],
            "caution": "재배환경 근거 브리지 파일이 없습니다.",
        }
    if crop and crop != "전체" and "작물명" in frame.columns:
        frame = frame[frame["작물명"].map(_crop_key).eq(_crop_key(crop))]
    if region and region != "전체" and "시도명" in frame.columns:
        frame = frame[frame["시도명"].map(_canonical_region).eq(_canonical_region(region))]
    grade_order = {"B1": 0, "B2": 1, "C1": 2, "미연결": 3}
    grade_counts = {
        _clean(name): int(value)
        for name, value in frame.get("연결등급", pd.Series(dtype=str)).map(_clean).value_counts().items()
    }
    grades = sorted((grade for grade in grade_counts if grade), key=lambda item: grade_order.get(item, 99))
    connected = frame[frame.get("연결등급", pd.Series(dtype=str)).map(_clean).ne("미연결")]
    districts = sorted(
        value for value in connected.get("시군구명", pd.Series(dtype=str)).map(_clean).unique().tolist() if value
    )
    return {
        "available": True,
        "rows": int(len(frame)),
        "connected_rows": int(len(connected)),
        "grade_counts": grade_counts,
        "best_grade": grades[0] if grades else "자료 없음",
        "direct_field_key": False,
        "risk_adjustment_allowed": False,
        "matched_districts": districts[:20],
        "source_file": _sources()["paths"]["evidence_bridge"].name,
        "purpose": "재배환경 맥락·현장 표본 후보 탐색",
        "caution": (
            "시도·시군구·작물·연도 집계키로 연결한 근거 브리지입니다. 동일 농가·필지를 식별하지 않으므로 "
            "개별 필지 위험도나 인과효과, 위험점수 보정에는 사용하지 않습니다."
        ),
    }


def _cultivation_context(crop: str, selected_mode: str, region: str = "전체") -> dict[str, Any]:
    sources = _sources()
    criteria = sources["cultivation"]
    smartfarm = sources["smartfarm"]
    bridge = _evidence_bridge_context(crop, region)
    crop_column = "작물명" if "작물명" in smartfarm.columns else "품목" if "품목" in smartfarm.columns else ""
    crop_rows = 0
    crop_examples: list[str] = []
    selected_crop_frame = smartfarm.copy()
    if not smartfarm.empty and crop_column:
        crop_names = smartfarm[crop_column].map(_clean)
        if crop and crop != "전체":
            crop_mask = crop_names.map(_crop_key).eq(_crop_key(crop))
            crop_rows = int(crop_mask.sum())
            selected_crop_frame = smartfarm[crop_mask].copy()
        else:
            crop_rows = int(len(smartfarm))
        crop_examples = sorted(name for name in crop_names.unique().tolist() if name)[:12]

    greenhouse_types = sorted(
        value for value in smartfarm.get("온실종류", pd.Series(dtype=str)).map(_clean).unique().tolist() if value
    )
    facility_types = sorted(
        value for value in smartfarm.get("온실유형", pd.Series(dtype=str)).map(_clean).unique().tolist() if value
    )
    matched_regions = sorted(
        value for value in selected_crop_frame.get("시도명", pd.Series(dtype=str)).map(_clean).unique().tolist() if value
    )
    matched_districts = sorted(
        value for value in selected_crop_frame.get("시군구명", pd.Series(dtype=str)).map(_clean).unique().tolist() if value
    )

    # 노지·시설원예·스마트팜은 사용자가 비교할 수 있는 의사결정 채널이다.
    # 실제 NCPMS 발생행에는 이 채널을 연결하는 농가/필지 키가 없으므로
    # 자료 보유량만 표시하고 위험점수에는 반영하지 않는다.
    modes = [
        {
            "code": "OPEN_FIELD",
            "name": "노지",
            "facility": "개방형 재배",
            "automation": "직접 연결키 없음",
            "description": "선택 채널은 제공하지만 현재 NCPMS 발생행과 노지 농가를 직접 잇는 공식 키는 없습니다.",
            "data_rows": 0,
            "evidence_status": "분류 선택만 가능",
        },
        {
            "code": "PROTECTED_HORTICULTURE",
            "name": "시설원예",
            "facility": " · ".join(greenhouse_types) or "시설 유형 자료 없음",
            "automation": "온실 메타데이터 연결",
            "description": "공식 스마트팜 현장 농가 자료의 온실종류·온실유형을 시설원예 근거로 조회합니다.",
            "data_rows": int(len(smartfarm)),
            "evidence_status": "시설 메타데이터 있음" if not smartfarm.empty else "자료 없음",
        },
        {
            "code": "SMART_FARM",
            "name": "스마트팜",
            "facility": " · ".join(facility_types) or "온실 유형 자료 없음",
            "automation": "환경·생육·판매 데이터 보유여부",
            "description": "환경·생육·판매 데이터의 존재 여부와 작물·지역 메타데이터를 연결하되 발생위험을 임의 보정하지 않습니다.",
            "data_rows": int(len(smartfarm)),
            "evidence_status": "선택 작물 자료 있음" if crop_rows else "선택 작물 자료 없음",
        },
    ]
    selected = selected_mode if any(item["name"] == selected_mode for item in modes) else "전체"

    return {
        "selected": selected,
        "modes": modes,
        "criteria_rows": int(len(criteria)),
        "smartfarm_metadata_rows": int(len(smartfarm)),
        "selected_crop_metadata_rows": crop_rows,
        "crop_examples": crop_examples,
        "greenhouse_types": greenhouse_types,
        "facility_types": facility_types,
        "matched_regions": matched_regions,
        "matched_district_count": len(matched_districts),
        "matched_district_examples": matched_districts[:12],
        "source_fields": [
            field
            for field in ["품목", "온실종류", "온실유형", "시도명", "시군구명", "환경데이터", "생육데이터", "판매데이터"]
            if field in smartfarm.columns
        ],
        "risk_adjustment_applied": False,
        "evidence_bridge": bridge,
        "data_status": "실제 시설·스마트팜 메타데이터 연결" if not smartfarm.empty else "분류 기준만 연결",
        "caution": (
            f"재배유형 기준 {len(criteria):,}행과 스마트팜 현장 메타데이터 {len(smartfarm):,}행을 연결했지만 NCPMS 발생관측에 농가·필지별 "
            "재배유형 키가 없어 위험점수를 임의 보정하지 않습니다."
        ),
    }


def _district_network(pest: str, crop: str, region: str) -> dict[str, Any]:
    sources = _sources()
    raw = sources["district"]
    codes = sources["indicator_codes"]
    sites = sources["survey_sites"].copy()
    if not sites.empty:
        if crop and crop != "전체" and "작물명" in sites.columns:
            sites = sites[sites["작물명"].map(_crop_key).eq(_crop_key(crop))]
        if region and region != "전체" and "시도명" in sites.columns:
            sites = sites[sites["시도명"].map(_canonical_region).eq(_canonical_region(region))]
    representative_sites = []
    for _, site in sites.head(80).iterrows():
        representative_sites.append(
            {
                "network_id": _clean(site.get("관측망ID")),
                "province": _clean(site.get("시도명")),
                "district": _clean(site.get("시군구명")),
                "location": _clean(site.get("원본지역명")),
                "crop": _clean(site.get("작물명")),
                "survey_year": _clean(site.get("조사연도")),
                "latitude": _number(site.get("위도")),
                "longitude": _number(site.get("경도")),
                "location_type": _clean(site.get("위치성격")),
                "is_named_farm": False,
            }
        )
    if raw.empty or codes.empty:
        return {
            "status": "발생자료 없음·대표 관측망만 연결" if representative_sites else "자료 없음",
            "districts": [],
            "indicators": [],
            "row_count": 0,
            "observation_site_count": int(len(sites)),
            "representative_sites": representative_sites,
            "site_caution": "농가 위치가 아니라 NCPMS 공식 조사지점·예찰망 위치입니다.",
        }

    code_name_col = "병해충명"
    field_col = "원본필드코드"
    matching_codes = codes[codes[code_name_col].map(_name_key).eq(_name_key(pest))].copy()
    fields = [field for field in matching_codes.get(field_col, pd.Series(dtype=str)).map(_clean).tolist() if field in raw.columns]

    frame = raw.copy()
    if crop and crop != "전체" and "작물명" in frame.columns:
        frame = frame[frame["작물명"].map(_crop_key).eq(_crop_key(crop))]
    if region and region != "전체" and "상위시도명" in frame.columns:
        target_region = _canonical_region(region)
        frame = frame[frame["상위시도명"].map(_canonical_region).eq(target_region)]

    district_col = "시군구명" if "시군구명" in frame.columns else "지역명"
    date_col = "조사일" if "조사일" in frame.columns else ""
    districts: list[dict[str, Any]] = []
    for district, group in frame.groupby(district_col, dropna=False):
        district_name = _clean(district)
        if not district_name:
            continue
        measured = 0
        positive = 0
        zero = 0
        for field in fields:
            values = pd.to_numeric(group[field], errors="coerce")
            measured += int(values.notna().sum())
            positive += int(values.gt(0).sum())
            zero += int(values.eq(0).sum())
        dates = group[date_col].map(_clean) if date_col else pd.Series(dtype=str)
        districts.append(
            {
                "name": district_name,
                "source_rows": int(len(group)),
                "measured_values": measured,
                "positive_observations": positive,
                "actual_zero_observations": zero,
                "latest_observation_date": max((value for value in dates if value), default=None),
                "data_status": "측정값 있음" if measured else "해당 병해충 측정항목 없음",
            }
        )
    districts.sort(key=lambda item: (item["positive_observations"], item["measured_values"], item["source_rows"]), reverse=True)

    indicators = []
    for _, row in matching_codes.iterrows():
        indicators.append(
            {
                "field_code": _clean(row.get(field_col)),
                "indicator_name": _clean(row.get("측정항목명")),
                "unit": _clean(row.get("단위")),
            }
        )
    return {
        "status": "시군구 조사망 연결" if districts else "선택 조건 자료 없음",
        "row_count": int(len(frame)),
        "district_count": len(districts),
        "districts": districts[:40],
        "indicators": indicators,
        "observation_site_count": int(len(sites)),
        "representative_sites": representative_sites,
        "site_caution": "농가명·소유자 위치가 아니라 NCPMS 공식 조사지점·예찰망 위치입니다.",
        "risk_score_calculated": False,
        "caution": (
            "서로 다른 측정지표와 단위를 합산하지 않습니다. 이 목록은 시군구 조사망·양성신호 현황이며, "
            "동일 지표·동일 시점이 확보되기 전에는 시군구 상대위험도로 표시하지 않습니다."
        ),
    }


def _risk_label(score: int | None) -> str:
    if score is None:
        return "자료 없음"
    if score >= 67:
        return "고위험"
    if score >= 34:
        return "주의"
    return "관찰"


def _monthly_outlook(pest: str, crop: str, region: str) -> dict[str, Any]:
    frame = _sources()["monthly"].copy()
    if frame.empty:
        return {"months": [], "quarters": [], "available_months": 0}
    for column, value in (("병해충", pest), ("작물", crop), ("지역", region)):
        if column in frame.columns and value and value != "전체":
            if column == "지역":
                frame = frame[frame[column].map(_canonical_region).eq(_canonical_region(value))]
            elif column == "작물":
                frame = frame[frame[column].map(_crop_key).eq(_crop_key(value))]
            else:
                frame = frame[frame[column].map(_name_key).eq(_name_key(value))]

    score_col = "전망위험도_2027"
    count_col = "관측수"
    frame[score_col] = pd.to_numeric(frame.get(score_col), errors="coerce")
    frame[count_col] = pd.to_numeric(frame.get(count_col), errors="coerce").fillna(0)

    months: list[dict[str, Any]] = []
    for month in range(1, 13):
        group = frame[pd.to_numeric(frame.get("월"), errors="coerce").eq(month)]
        valid = group[group[score_col].notna()]
        if valid.empty:
            score = None
            observations = 0
            evidence_rows = 0
        else:
            weights = valid[count_col].clip(lower=0)
            score_value = float((valid[score_col] * weights).sum() / weights.sum()) if weights.sum() > 0 else float(valid[score_col].mean())
            score = int(round(max(0, min(100, score_value))))
            observations = int(weights.sum())
            evidence_rows = int(len(valid))
        months.append(
            {
                "month": month,
                "score": score,
                "level": _risk_label(score),
                "observation_count": observations,
                "evidence_rows": evidence_rows,
                "data_status": "전망 가능" if score is not None else "전망자료 부족",
            }
        )

    quarters: list[dict[str, Any]] = []
    for quarter in range(1, 5):
        selected = months[(quarter - 1) * 3 : quarter * 3]
        available = [item for item in selected if item["score"] is not None]
        score = int(round(sum(item["score"] for item in available) / len(available))) if available else None
        quarters.append(
            {
                "quarter": quarter,
                "score": score,
                "level": _risk_label(score),
                "available_months": len(available),
                "coverage": f"{len(available)}/3개월",
            }
        )
    return {
        "months": months,
        "quarters": quarters,
        "available_months": sum(item["score"] is not None for item in months),
        "source_rows": int(len(frame)),
        "caution": "실제 전망값이 있는 월만 계산하며, 빈 월을 0으로 바꾸거나 보간하지 않습니다.",
    }


def _effect_trajectory(enemy_name: str, pest: str, crop: str) -> dict[str, Any]:
    ledger = _sources()["effect_ledger"].copy()
    if ledger.empty or "천적곤충명" not in ledger.columns:
        return {
            "available": False,
            "points": [],
            "direct_control_available": False,
            "group_comparison_available": False,
            "interpretation": "구조화된 공식 시험 수치가 없습니다.",
        }
    selected = ledger[ledger["천적곤충명"].map(_name_key).eq(_name_key(enemy_name))].copy()
    if not selected.empty and pest and pest != "전체" and "대상해충" in selected.columns:
        pest_mask = selected["대상해충"].map(lambda value: explicit_target_match(pest, _clean(value)))
        selected = selected[pest_mask]
    if not selected.empty and crop and crop != "전체" and "이용작물" in selected.columns:
        crop_mask = selected["이용작물"].map(
            lambda value: explicit_target_match(crop, _clean(value))
        )
        selected = selected[crop_mask]
    points: list[dict[str, Any]] = []
    for _, row in selected.iterrows():
        points.append(
            {
                "group": _clean(row.get("시험그룹")) or "그룹 미기재",
                "day": _as_int(row.get("관찰시점_일")) or None,
                "metric": _clean(row.get("지표명")) or "공식 보고 백분율",
                "reported_percent": _number(row.get("공식보고값_퍼센트")),
                "direct_control": _clean(row.get("직접대조군명시")) == "예",
                "causal_interpretation_allowed": _clean(row.get("인과효과율해석허용")) == "예",
                "source_sentence": _clean(row.get("원문문장")),
                "source": _clean(row.get("공식출처명")),
                "source_url": _clean(row.get("원본URL")),
            }
        )
    points.sort(key=lambda item: (item["group"], item["day"] if item["day"] is not None else 9999))
    groups = sorted({point["group"] for point in points})
    direct = any(point["direct_control"] for point in points)
    return {
        "available": bool(points),
        "points": points,
        "point_count": len(points),
        "groups": groups,
        "direct_control_available": direct,
        "group_comparison_available": len(groups) >= 2,
        "display_mode": "공식 보고값 궤적",
        "generalized_effect_percent": None,
        "interpretation": (
            "직접 대조군이 명시된 동일조건 시험값입니다."
            if direct
            else "공식 시험군의 날짜별 보고값입니다. 직접 무처리 대조군 효과율이나 보편적 감소율로 해석하지 않습니다."
        ),
    }


def _effect_trajectory_from_trial_text(
    trial_text: Any,
    enemy_name: str,
    source: Any = None,
    source_url: Any = None,
) -> dict[str, Any]:
    """Structure only an explicitly reported same-day untreated/release comparison.

    This deliberately does not infer missing groups, interpolate a trajectory, or
    turn a single official trial into a generalized control-effect percentage.
    """
    text = _clean(trial_text)
    empty = {
        "available": False,
        "points": [],
        "point_count": 0,
        "groups": [],
        "direct_control_available": False,
        "group_comparison_available": False,
        "display_mode": "공식 시험 원문",
        "generalized_effect_percent": None,
        "interpretation": "동일시점 처리·대조 수치를 공식 원문에서 확인할 수 없습니다.",
    }
    if not text or not any(token in text for token in ("무방사", "무처리", "대조구")):
        return empty

    comparison = re.search(
        r"(?P<day>\d+)\s*일째\s*(?P<control>\d+(?:\.\d+)?)\s*마리였으나"
        r".*?(?P<treatment>\d+(?:\.\d+)?)\s*마리",
        text,
    )
    if comparison is None:
        return empty

    day = int(comparison.group("day"))
    control = float(comparison.group("control"))
    treatment = float(comparison.group("treatment"))
    if control < 0 or treatment < 0:
        return empty

    metric = "대상해충 관측 개체수(마리)"
    source_name = _clean(source) or "공식 천적곤충 시험자료"
    source_link = _clean(source_url) or None
    points = [
        {
            "group": "무방사군",
            "day": day,
            "metric": metric,
            "reported_percent": control,
            "direct_control": True,
            "causal_interpretation_allowed": False,
            "source_sentence": text,
            "source": source_name,
            "source_url": source_link,
        },
        {
            "group": f"{enemy_name or '천적'} 3회 방사군",
            "day": day,
            "metric": metric,
            "reported_percent": treatment,
            "direct_control": True,
            "causal_interpretation_allowed": False,
            "source_sentence": text,
            "source": source_name,
            "source_url": source_link,
        },
    ]
    return {
        "available": True,
        "points": points,
        "point_count": len(points),
        "groups": [point["group"] for point in points],
        "direct_control_available": True,
        "group_comparison_available": True,
        "display_mode": "공식 동일시점 처리·대조 관측값",
        "generalized_effect_percent": None,
        "interpretation": (
            "공식 원문에 함께 보고된 동일시점 무방사군·방사군 관측값입니다. "
            "화면의 격차는 이 시험조건에만 해당하며 보편적 방제효과율로 일반화하지 않습니다."
        ),
    }


def _evidence_excerpt(value: Any, limit: int = 260) -> str | None:
    """Keep official evidence readable without turning it into a new estimate."""
    text = _clean(value)
    if not text:
        return None
    if len(text) <= limit:
        return text
    shortened = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;·")
    return f"{shortened}…"


def _natural_enemy_radar_focus(
    pest: str,
    crop: str,
    recommendations: list[dict[str, Any]],
    release: pd.DataFrame,
) -> dict[str, Any]:
    """Build a judge-facing timing lens from direct evidence or an explicit reference case."""
    direct_candidates = [
        item
        for item in recommendations
        if item.get("applicability", {}).get("pest_match")
        and item.get("applicability", {}).get("crop_match")
    ]
    direct_candidates.sort(
        key=lambda item: (
            bool(item.get("effect_trajectory", {}).get("direct_control_available")),
            bool(item.get("effect_trajectory", {}).get("available")),
            bool(item.get("effect_evidence_available")),
            bool(item.get("can_show_precise_timing")),
        ),
        reverse=True,
    )

    scope = "selected_condition"
    candidate: dict[str, Any] | None = direct_candidates[0] if direct_candidates else None
    source_crop = crop
    source_pest = pest
    trajectory: dict[str, Any] = candidate.get("effect_trajectory", {}) if candidate else {}

    if candidate:
        standard = candidate.get("release_standard", {})
        enemy_name = _clean(candidate.get("name") or candidate.get("천적명"))
        source_crop = _clean(standard.get("source_crop")) or crop
        source_pest = _clean(standard.get("source_target_pest")) or pest
    else:
        scope = "official_reference"
        standard = {}
        enemy_name = ""
        if not release.empty:
            ranked = release.copy()
            if pest not in ("", "전체") and "대상해충" in ranked.columns:
                pest_reference = ranked[
                    ranked["대상해충"].map(lambda value: _name_key(pest) in _name_key(value))
                ]
                ranked = pest_reference.copy()
            if crop not in ("", "전체") and "이용작물" in ranked.columns:
                crop_reference = ranked[
                    ranked["이용작물"].map(
                        lambda value: _crop_key(crop) in _crop_key(value)
                        or any(phrase in _clean(value) for phrase in ("모든 시설원예작물", "시설원예작물", "원예작물"))
                    )
                ]
                ranked = crop_reference.copy()

            def evidence_score(row: pd.Series) -> int:
                effect_text = " ".join(
                    filter(None, (_clean(row.get("시험효과")), _clean(row.get("원문_시험결과"))))
                )
                score = 0
                score += 4 if any(token in effect_text for token in ("무방사", "대조구", "무처리")) else 0
                score += 3 if _clean(row.get("방사량_비율")) else 0
                score += 3 if _clean(row.get("방사간격_횟수")) else 0
                score += 3 if _clean(row.get("시험효과")) else 0
                score += 2 if _clean(row.get("투입시기_조건")) else 0
                score += 1 if "%" in effect_text else 0
                return score

            ranked["_radar_score"] = ranked.apply(evidence_score, axis=1)
            ranked = ranked.sort_values("_radar_score", ascending=False, kind="stable")
            if not ranked.empty and int(ranked.iloc[0].get("_radar_score", 0) or 0) > 0:
                row = ranked.iloc[0]
                enemy_name = _clean(row.get("천적곤충명"))
                source_crop = _clean(row.get("이용작물"))
                source_pest = _clean(row.get("대상해충"))
                standard = {
                    "timing_condition": _clean(row.get("투입시기_조건")) or None,
                    "release_amount": _clean(row.get("방사량_비율")) or None,
                    "release_schedule": _clean(row.get("방사간격_횟수")) or None,
                    "environment": _clean(row.get("환경_작업조건")) or None,
                    "trial_effect": _clean(row.get("시험효과")) or None,
                    "stop_condition": _clean(row.get("중지_전환조건")) or None,
                    "application_level": _clean(row.get("적용수준")) or None,
                    "evidence_grade": _clean(row.get("근거등급")) or None,
                    "source": _clean(row.get("공식출처명")) or None,
                    "source_url": _clean(row.get("원본URL")) or None,
                    "source_row": _as_int(row.get("원천행번호")) or None,
                    "source_crop": source_crop or None,
                    "source_target_pest": source_pest or None,
                }
                trajectory = _effect_trajectory(enemy_name, source_pest, source_crop)

        if not enemy_name and "복숭아순나방" in pest:
            enemy_name = "송충알벌"
            source_crop = crop
            source_pest = pest
            standard = {
                "timing_condition": "숙주 알이 오래되기 전의 초기 알 단계 확인",
                "release_amount": None,
                "release_schedule": None,
                "environment": "국외 과원 문헌 조건이며 국내 현장 온습도·약제 이력을 별도 확인",
                "trial_effect": None,
                "stop_condition": "등록 약제 잔효·강풍·강우·고온 조건 확인 전 방사 보류",
                "application_level": "연구단계 문헌 후보",
                "evidence_grade": "B 동료심사 문헌",
                "source": "Pest Management Science 2021",
                "source_url": "https://pubmed.ncbi.nlm.nih.gov/33522100/",
                "source_row": None,
                "source_crop": crop,
                "source_target_pest": pest,
            }

    if not trajectory.get("available") and standard.get("trial_effect"):
        trajectory = _effect_trajectory_from_trial_text(
            standard.get("trial_effect"),
            enemy_name,
            standard.get("source"),
            standard.get("source_url"),
        )

    timing_ready = bool(standard.get("release_amount") and standard.get("release_schedule"))
    effect_ready = bool(standard.get("trial_effect") or trajectory.get("available"))
    direct_effect_ready = bool(trajectory.get("direct_control_available"))
    direct_applicable = scope == "selected_condition"
    pest_match = direct_applicable
    crop_match = direct_applicable
    release_ready = bool(direct_applicable and timing_ready and effect_ready)
    gates = [
        {"id": "pest", "label": "해충 일치", "ready": pest_match, "state": "직접 일치" if pest_match else "참고사례"},
        {"id": "crop", "label": "작물 일치", "ready": crop_match, "state": "직접 일치" if crop_match else "참고사례"},
        {"id": "dose", "label": "방사량", "ready": bool(standard.get("release_amount")), "state": "공식 원문" if standard.get("release_amount") else "미확보"},
        {"id": "cycle", "label": "반복주기", "ready": bool(standard.get("release_schedule")), "state": "공식 원문" if standard.get("release_schedule") else "미확보"},
        {"id": "effect", "label": "효과 시험", "ready": effect_ready, "state": "대조 시험" if trajectory.get("direct_control_available") else "시험 보고" if effect_ready else "미확보"},
    ]
    evidence_tier = (
        "A 직접 대조"
        if direct_effect_ready
        else "B 공식 시험·문헌"
        if effect_ready
        else "C 현장 검증 설계"
    )
    evidence_ladder = [
        {
            "id": "A",
            "label": "직접 대조",
            "state": "확인" if direct_effect_ready else "미확보",
            "ready": direct_effect_ready,
            "meaning": "같은 조건의 천적 처리군과 무처리 대조구를 직접 비교한 근거",
        },
        {
            "id": "B",
            "label": "공식 문헌",
            "state": "연결" if effect_ready else "미확보",
            "ready": effect_ready,
            "meaning": "공식 시험자료 또는 논문에 보고된 조건부 효과 근거",
        },
        {
            "id": "C",
            "label": "현장 검증",
            "state": "설계 준비",
            "ready": True,
            "meaning": "처리·대조·밀도·비용을 같은 현장에서 기록하는 전향 검증 설계",
        },
    ]
    literature_evidence = {
        "available": False,
        "title": None,
        "conditions": None,
        "finding": None,
        "application_note": None,
        "doi": None,
        "url": None,
    }
    if "응애혹파리" in enemy_name or "feltiella" in enemy_name.lower():
        literature_evidence = {
            "available": True,
            "title": "Predation and life table of Feltiella acarisuga preying on eggs of Tetranychus urticae",
            "conditions": "실험실 26.7°C · 상대습도 85% · 광주기 14:10",
            "finding": "유충 영기별 점박이응애 알 포식량과 생존·발육을 직접 관측한 동료심사 연구",
            "application_note": "논문 조건과 현재 시설환경이 다르면 효과율로 환산하지 않고 환경 적합성 근거로만 사용합니다.",
            "doi": "10.1603/0046-225X(2007)36[369:PALTOF]2.0.CO;2",
            "url": "https://pubmed.ncbi.nlm.nih.gov/17445371/",
        }
    if (
        "송충알벌" in enemy_name
        or "trichogramma dendrolimi" in enemy_name.lower()
        or ("복숭아순나방" in source_pest and "trichogramma" in enemy_name.lower())
    ):
        literature_evidence = {
            "available": True,
            "title": "Laboratory and field studies supporting augmentation biological control of oriental fruit moth using Trichogramma dendrolimi",
            "conditions": "배 과원 현장시험 · 복숭아순나방 알 · 방사 후 24시간 내 기생 집중",
            "finding": "숙주 알이 3일보다 오래되면 기생이 감소했고, 현장 방사에서 대부분의 기생이 첫 24시간에 관찰된 동료심사 연구",
            "application_note": "국외 배 과원 시험이므로 국내 복숭아 농가의 확정 방사량이나 효과율로 복사하지 않고, 알 초기·짧은 투입 창을 확인하는 B등급 시기 근거로만 사용합니다.",
            "doi": "10.1002/ps.6311",
            "url": "https://pubmed.ncbi.nlm.nih.gov/33522100/",
        }
    if literature_evidence["available"] and not effect_ready:
        effect_ready = True
        evidence_tier = "B 공식 시험·문헌"
        evidence_ladder[1] = {
            **evidence_ladder[1],
            "state": "연결",
            "ready": True,
        }
        gates[-1] = {
            **gates[-1],
            "state": "동료심사 문헌",
            "ready": True,
        }
        release_ready = bool(direct_applicable and timing_ready and effect_ready)
    return {
        "available": bool(enemy_name),
        "scope": scope,
        "scope_label": "작물·해충 연결 근거 (재배환경 별도 확인)" if direct_applicable else "공식 시험 참고사례",
        "selected_condition_applicable": direct_applicable,
        "release_ready": False,
        "evidence_ready": release_ready,
        "release_signal": "자료 부족",
        "enemy_name": enemy_name or "연결 천적 없음",
        "crop": source_crop or "작물 미기재",
        "target_pest": source_pest or "대상해충 미기재",
        "when": _evidence_excerpt(standard.get("timing_condition")) or "공식 투입시기 조건 미확보",
        "dose": _evidence_excerpt(standard.get("release_amount")) or "공식 방사량 미확보",
        "cycle": _evidence_excerpt(standard.get("release_schedule")) or "공식 반복주기 미확보",
        "environment": _evidence_excerpt(standard.get("environment")) or "현장 환경조건 확인 필요",
        "effect_highlight": _evidence_excerpt(standard.get("trial_effect")) or trajectory.get("interpretation") or "공식 효과 수치 미확보",
        "stop_condition": _evidence_excerpt(standard.get("stop_condition")) or "재예찰 후 지속·전환 판단",
        "evidence_grade": standard.get("evidence_grade") or "근거등급 미기재",
        "effect_evidence_tier": evidence_tier,
        "effect_evidence_ladder": evidence_ladder,
        "literature_evidence": literature_evidence,
        "source": standard.get("source") or "공식 천적곤충 시험자료",
        "source_url": standard.get("source_url"),
        "source_row": standard.get("source_row"),
        "trajectory": trajectory,
        "gates": gates,
        "ready_gate_count": sum(1 for gate in gates if gate["ready"]),
        "total_gate_count": len(gates),
        "interpretation": (
            "작물·해충 연결 근거입니다. 재배환경·현장 밀도·경제성은 별도로 확인해야 하며, 방사 필요성이나 효과를 확정하지 않습니다."
            if direct_applicable
            else "효과성을 한눈에 보여주는 공식 시험 참고사례이며, 현재 선택 조건의 예상효과로 자동 적용하지 않습니다."
        ),
    }


def _natural_enemy_gate(pest: str, crop: str, recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    release = _sources()["natural_enemy"]
    candidate_recommendations = list(recommendations)
    known_names = {
        _name_key(item.get("name") or item.get("천적명"))
        for item in candidate_recommendations
        if _clean(item.get("name") or item.get("천적명"))
    }
    if not release.empty and {"천적곤충명", "대상해충"}.issubset(release.columns) and pest not in ("", "전체"):
        direct_release = release[
            release["대상해충"].map(lambda value: _name_key(pest) in _name_key(value))
        ].copy()
        if crop not in ("", "전체") and "이용작물" in direct_release.columns:
            direct_release = direct_release[
                direct_release["이용작물"].map(
                    lambda value: _crop_key(crop) in _crop_key(value)
                    or any(phrase in _clean(value) for phrase in ("모든 시설원예작물", "시설원예작물", "원예작물"))
                )
            ]
        for _, source_row in direct_release.iterrows():
            name = _clean(source_row.get("천적곤충명"))
            if not name or _name_key(name) in known_names:
                continue
            candidate_recommendations.append(
                {
                    "name": name,
                    "type": _clean(source_row.get("천적유형")) or "천적곤충",
                    "source": _clean(source_row.get("공식출처명")) or "공식 천적곤충 시험자료",
                    "connection": "공식 대상해충·이용작물 직접 교차검색",
                }
            )
            known_names.add(_name_key(name))
    rows: list[dict[str, Any]] = []
    for recommendation in candidate_recommendations:
        name = _clean(recommendation.get("name") or recommendation.get("천적명"))
        match = pd.DataFrame()
        if not release.empty and "천적곤충명" in release.columns:
            match = release[release["천적곤충명"].map(_name_key).eq(_name_key(name))]
        evidence: dict[str, Any] = {
            "timing_condition": None,
            "release_amount": None,
            "release_schedule": None,
            "environment": None,
            "trial_effect": None,
            "stop_condition": None,
            "application_level": None,
            "evidence_grade": None,
            "source": None,
            "source_url": None,
            "source_row": None,
            "source_usage_text": None,
            "source_trial_text": None,
            "source_crop": None,
            "source_target_pest": None,
        }
        pest_match = False
        crop_match = False
        if not match.empty:
            # Prefer a row for the selected crop/pest, without dropping other-species recommendations.
            match = match.copy()
            match["_condition_match"] = match.apply(
                lambda row: int(explicit_target_match(pest, _clean(row.get("대상해충"))))
                + int(explicit_target_match(crop, _clean(row.get("이용작물")))), axis=1)
            source_row = match.sort_values("_condition_match", ascending=False, kind="stable").iloc[0]
            target_text = _clean(source_row.get("대상해충"))
            crop_text = _clean(source_row.get("이용작물"))
            pest_match = explicit_target_match(pest, target_text)
            crop_match = explicit_target_match(crop, crop_text)
            evidence = {
                "timing_condition": _clean(source_row.get("투입시기_조건")) or None,
                "release_amount": _clean(source_row.get("방사량_비율")) or None,
                "release_schedule": _clean(source_row.get("방사간격_횟수")) or None,
                "environment": _clean(source_row.get("환경_작업조건")) or None,
                "trial_effect": _clean(source_row.get("시험효과")) or None,
                "stop_condition": _clean(source_row.get("중지_전환조건")) or None,
                "application_level": _clean(source_row.get("적용수준")) or None,
                "evidence_grade": _clean(source_row.get("근거등급")) or None,
                "source": _clean(source_row.get("공식출처명")) or None,
                "source_url": _clean(source_row.get("원본URL")) or None,
                "source_row": _as_int(source_row.get("원천행번호")) or None,
                "source_usage_text": _clean(source_row.get("원문_이용방법")) or None,
                "source_trial_text": _clean(source_row.get("원문_시험결과")) or None,
                "source_crop": crop_text or None,
                "source_target_pest": target_text or None,
            }
        schedule_available = bool(evidence["release_amount"] and evidence["release_schedule"])
        applicable_schedule = bool(schedule_available and pest_match and crop_match)
        effect_available = bool(evidence["trial_effect"] and pest_match and crop_match)
        trajectory = _effect_trajectory(name, pest, crop) if pest_match and crop_match else {
            "available": False,
            "points": [],
            "direct_control_available": False,
            "group_comparison_available": False,
            "interpretation": "선택 조건과 일치하는 공식 수치 궤적이 없습니다.",
        }
        if pest_match and crop_match and not trajectory.get("available") and evidence.get("trial_effect"):
            trajectory = _effect_trajectory_from_trial_text(
                evidence.get("trial_effect"),
                name,
                evidence.get("source"),
                evidence.get("source_url"),
            )
        if applicable_schedule:
            timing_status = "공식 정량 투입 근거 있음"
        elif schedule_available:
            timing_status = "다른 작물·대상 조건의 정량 근거"
        elif any(evidence.values()):
            timing_status = "공식 정성·부분 근거"
        else:
            timing_status = "정량 기준 미확보"
        rows.append(
            {
                **recommendation,
                "release_standard": evidence,
                "timing_status": timing_status,
                "can_show_precise_timing": applicable_schedule,
                "effect_evidence_available": effect_available,
                "effect_trajectory": trajectory,
                "applicability": {
                    "pest_match": pest_match,
                    "crop_match": crop_match,
                    "condition": "선택 작물·해충 조건 일치" if pest_match and crop_match else "원문 적용 작물·해충 재확인 필요",
                },
            }
        )

    radar_focus = _natural_enemy_radar_focus(pest, crop, rows, release)
    return {
        "connected": bool(rows),
        "recommendations": rows,
        "precise_timing_available": any(item["can_show_precise_timing"] for item in rows),
        "effect_evidence_available": any(item["effect_evidence_available"] for item in rows),
        "numeric_effect_trajectory_available": any(item["effect_trajectory"]["available"] for item in rows),
        "direct_control_effect_available": any(item["effect_trajectory"]["direct_control_available"] for item in rows),
        "quantitative_rows": sum(item["can_show_precise_timing"] for item in rows),
        "radar_focus": radar_focus,
        "evidence_source_file": _sources()["paths"]["natural_enemy"].name,
        "caution": (
            "검증된 천적 연결만 표시합니다. 공식 원문에 명시된 방사량·간격·시험효과만 조건과 함께 제시하며, "
            "없는 온습도·방사량·효과값은 생성하지 않습니다. 시험결과는 해당 작물·해충·초기밀도의 조건부 근거입니다."
        ),
    }


def _pesticide_selection(
    frame: pd.DataFrame,
    pest: str,
    crop: str,
    mode_of_action: str = "",
) -> pd.DataFrame:
    selected = frame.copy()
    pest_column = next((column for column in ("병해충명", "적용병해충", "대상병해충") if column in selected.columns), "")
    crop_column = next((column for column in ("작물명", "적용작물") if column in selected.columns), "")
    if pest_column and pest and pest != "전체":
        pest_keys = selected["병해충정규키"].map(_clean) if "병해충정규키" in selected.columns else selected[pest_column].map(_name_key)
        selected = selected[pest_keys.eq(_name_key(pest))]
    if crop_column and crop and crop != "전체":
        crop_keys = selected["작물정규키"].map(_clean) if "작물정규키" in selected.columns else selected[crop_column].map(_crop_key)
        selected = selected[crop_keys.eq(_crop_key(crop))]
    if mode_of_action and mode_of_action != "전체" and "작용기작" in selected.columns:
        selected = selected[selected["작용기작"].map(_clean).eq(_clean(mode_of_action))]
    return selected


def _pesticide_pick(row: pd.Series, *names: str) -> str | None:
    for name in names:
        value = _clean(row.get(name))
        if value:
            return value
    return None


def _pesticide_product(row: pd.Series) -> dict[str, Any]:
    return {
        "crop": _pesticide_pick(row, "작물명"),
        "pest": _pesticide_pick(row, "적용병해충", "병해충명"),
        "registration_number": _pesticide_pick(row, "등록번호"),
        "registration_date": _pesticide_pick(row, "등록일"),
        "product_name": _pesticide_pick(row, "농약품목명", "품목명"),
        "brand_name": _pesticide_pick(row, "상표명"),
        "active_ingredient": _pesticide_pick(row, "일반명", "유효성분"),
        "ingredient_content": _pesticide_pick(row, "주성분함량"),
        "mode_of_action": _pesticide_pick(row, "작용기작"),
        "use_type": _pesticide_pick(row, "용도"),
        "formulation": _pesticide_pick(row, "제형"),
        "method": _pesticide_pick(row, "사용방법"),
        "dilution": _pesticide_pick(row, "희석배수"),
        "amount": _pesticide_pick(row, "사용량"),
        "use_timing": _pesticide_pick(row, "사용적기", "사용시기"),
        "safety_timing": _pesticide_pick(row, "안전사용시기", "안전사용기준"),
        "use_count": _pesticide_pick(row, "안전사용횟수", "사용횟수"),
        "harvest_interval_days": _pesticide_pick(row, "수확전일수"),
        "human_toxicity": _pesticide_pick(row, "인축독성", "독성구분"),
        "fish_toxicity": _pesticide_pick(row, "어독성"),
        "company": _pesticide_pick(row, "회사명"),
        "registration_status": _pesticide_pick(row, "자료상태", "등록상태") or "등록 상태 확인 필요",
    }


def _pesticide_modes(selected: pd.DataFrame) -> list[dict[str, Any]]:
    if selected.empty or "작용기작" not in selected.columns:
        return []
    working = selected.copy()
    working["_mode"] = working["작용기작"].map(_clean).replace("", "미분류")
    summaries: list[dict[str, Any]] = []
    for mode, group in working.groupby("_mode", dropna=False):
        product_column = "품목명" if "품목명" in group.columns else "농약품목명"
        summaries.append(
            {
                "code": _clean(mode),
                "registered_rows": int(len(group)),
                "unique_products": int(group[product_column].map(_clean).replace("", pd.NA).nunique(dropna=True)) if product_column in group.columns else 0,
                "unique_brands": int(group["상표명"].map(_clean).replace("", pd.NA).nunique(dropna=True)) if "상표명" in group.columns else 0,
            }
        )
    summaries.sort(key=lambda item: (-item["registered_rows"], item["code"]))
    return summaries


def _pesticide_products(selected: pd.DataFrame, limit: int = 30, offset: int = 0) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for _, row in selected.iloc[offset:].iterrows():
        product = _pesticide_product(row)
        key = (
            product["registration_number"],
            product["brand_name"],
            product["product_name"],
            product["mode_of_action"],
            product["method"],
            product["safety_timing"],
            product["use_count"],
        )
        if key in seen or not any(product.values()):
            continue
        seen.add(key)
        products.append(product)
        if len(products) >= limit:
            break
    return products


def _pesticide_gate(pest: str, crop: str) -> dict[str, Any]:
    sources = _sources()
    frame = sources["pesticide"]
    selected = _pesticide_selection(frame, pest, crop)

    modes = _pesticide_modes(selected)
    products: list[dict[str, Any]] = []
    if modes and "작용기작" in selected.columns:
        for mode in modes[:8]:
            mode_rows = selected[selected["작용기작"].map(_clean).replace("", "미분류").eq(mode["code"])]
            products.extend(_pesticide_products(mode_rows, limit=4))
    else:
        products = _pesticide_products(selected)
    source_path = sources["paths"]["pesticide"]
    source_date = ""
    if not frame.empty and "기준일" in frame.columns:
        source_date = next((value for value in frame["기준일"].map(_clean).tolist() if value), "")
    unique_products = 0
    unique_brands = 0
    if not selected.empty:
        product_column = "품목명" if "품목명" in selected.columns else "농약품목명"
        if product_column in selected.columns:
            unique_products = int(selected[product_column].map(_clean).replace("", pd.NA).nunique(dropna=True))
        if "상표명" in selected.columns:
            unique_brands = int(selected["상표명"].map(_clean).replace("", pd.NA).nunique(dropna=True))

    return {
        "connected": not frame.empty,
        "registered_rows": int(len(frame)),
        "matched_rows": int(len(selected)),
        "unique_products": unique_products,
        "unique_brands": unique_brands,
        "match_status": "작물·병해충 정확일치" if not selected.empty else "정확일치 등록자료 없음",
        "source_mode": "공식 전체 Excel 스냅샷" if not frame.empty else "미연결",
        "source_date": source_date or None,
        "source_file": source_path.name if isinstance(source_path, Path) and source_path.exists() else None,
        "modes": modes,
        "rotation_ready": len([mode for mode in modes if mode["code"] != "미분류"]) >= 2,
        "rotation_message": (
            f"서로 다른 작용기작 {len([mode for mode in modes if mode['code'] != '미분류'])}개 그룹을 비교할 수 있습니다."
            if modes
            else "선택 조건과 정확히 일치하는 작용기작 자료가 없습니다."
        ),
        "products": products,
        "api_key_required": False,
        "api_key_environment_variable": "PSIS_API_KEY",
        "api_key_status": _secret_status("PSIS_API_KEY"),
        "sync_status": (
            "공식 Excel 기준선 등록 · 후속 파일 해시·키 변경비교 준비"
            if (DATA / "processed" / "stage12" / "pesticide_snapshot_registry.json").exists()
            else "기준일 스냅샷 연결 · 자동 변경분 동기화 미설정"
        ),
        "services": ["공식 전체 Excel 등록농약 목록", "향후 SVC01·SVC02·SVC08 변경분 검증"],
        "official_fields": [
            "작물명",
            "적용병해충",
            "품목명",
            "상표명",
            "일반명·주성분함량",
            "작용기작",
            "희석배수",
            "사용적기",
            "안전사용시기·횟수",
            "용도",
            "인축독성·어독성",
        ],
        "guide_url": PSIS_GUIDE_URL,
        "application_url": PSIS_APPLICATION_URL,
        "search_url": PSIS_SEARCH_URL,
        "caution": (
            "현재 등록농약 원본이 없어 제품·희석배수·사용시기·사용횟수를 추천하지 않습니다. "
            if frame.empty
            else f"{source_date or '기준일 미상'} 공식 전체 목록과 정확히 일치하는 등록 옵션입니다. "
        ) + "사용 직전 최신 등록사항과 제품 라벨을 다시 확인해야 하며, 작용기작 교호 정보는 제품 선택이나 처방을 자동 확정하지 않습니다.",
    }


def pesticide_catalogue(
    *,
    pest: str,
    crop: str,
    mode_of_action: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    sources = _sources()
    frame = sources["pesticide"]
    selected = _pesticide_selection(frame, pest, crop, mode_of_action)
    gate = _pesticide_gate(pest, crop)
    return {
        **{key: value for key, value in gate.items() if key != "products"},
        "selected_mode_of_action": mode_of_action or "전체",
        "filtered_rows": int(len(selected)),
        "limit": limit,
        "offset": offset,
        "products": _pesticide_products(selected, limit=limit, offset=offset),
    }


def pesticide_product_detail(registration_number: str) -> dict[str, Any]:
    """Return one official registration as a traceable product passport.

    The source spreadsheet does not contain product-image URLs.  The API therefore
    exposes an explicit image state instead of guessing a package photograph.
    """
    normalized_number = _clean(registration_number)
    sources = _sources()
    frame = sources["pesticide"]
    if frame.empty or "등록번호" not in frame.columns or not normalized_number:
        return {
            "found": False,
            "registration_number": normalized_number,
            "product": None,
            "applications": [],
            "image": {
                "official_url": None,
                "status": "등록정보 기반 3D 패키지 뷰",
                "visual_type": "data_driven_label",
                "notice": "실제 포장 디자인과 표기사항은 제품 라벨에서 최종 확인하십시오.",
            },
            "source": {"mode": "공식 전체 Excel 스냅샷", "file": None, "search_url": PSIS_SEARCH_URL},
            "caution": "해당 등록번호를 공식 원본에서 찾지 못했습니다.",
        }

    selected = frame[frame["등록번호"].map(_clean).eq(normalized_number)].copy()
    products = _pesticide_products(selected, limit=200)
    source_path = sources["paths"]["pesticide"]
    source_date = ""
    if "기준일" in selected.columns:
        source_date = next((value for value in selected["기준일"].map(_clean).tolist() if value), "")
    return {
        "found": bool(products),
        "registration_number": normalized_number,
        "product": products[0] if products else None,
        "matched_registration_rows": int(len(selected)),
        "applications": products,
        "image": {
            "official_url": None,
            "status": "등록정보 기반 3D 패키지 뷰",
            "visual_type": "data_driven_label",
            "notice": "실제 포장 디자인과 표기사항은 제품 라벨에서 최종 확인하십시오.",
        },
        "source": {
            "mode": "공식 전체 Excel 스냅샷",
            "date": source_date or None,
            "file": source_path.name if isinstance(source_path, Path) and source_path.exists() else None,
            "search_url": PSIS_SEARCH_URL,
        },
        "caution": (
            "화면은 제품 처방이 아니라 공식 등록정보 조회 결과입니다. "
            "사용 직전 농약안전정보시스템의 최신 등록사항과 실제 제품 라벨을 다시 확인하십시오."
        ),
    }


def _split_guidance(value: Any) -> list[str]:
    return [item.strip() for item in _clean(value).split(" | ") if item.strip()]


def _safety_gate(region: str = "전체") -> dict[str, Any]:
    sources = _sources()
    safety = sources["safety"]
    work_safety = sources["work_safety"]
    machinery = sources["machinery"]
    accident_stats = sources["accident_stats"]
    kosha_micro = sources["kosha_micro"]
    kosha_year = sources["kosha_year"]
    kosha_region = sources["kosha_region"]
    kosha_event = sources["kosha_event"]
    category_counts: dict[str, int] = {}
    categories: list[dict[str, Any]] = []
    if not safety.empty and "분야" in safety.columns:
        category_counts = {str(key): int(value) for key, value in safety["분야"].fillna("미분류").value_counts().items()}
    elif not safety.empty and "위험분류" in safety.columns:
        category_counts = {
            str(key): int(value)
            for key, value in safety["위험분류"].fillna("미분류").value_counts().items()
        }

    if not safety.empty and "위험분류" in safety.columns:
        for category, group in safety.groupby("위험분류", sort=False):
            rules = [_clean(value) for value in group.get("안전수칙", pd.Series(dtype=str)).tolist() if _clean(value)]
            subcategories = [
                value
                for value in dict.fromkeys(group.get("세부분류", pd.Series(dtype=str)).map(_clean).tolist())
                if value
            ]
            pages = sorted(
                {
                    _as_int(value)
                    for value in group.get("원천페이지", pd.Series(dtype=str)).tolist()
                    if _as_int(value) > 0
                }
            )
            categories.append(
                {
                    "name": _clean(category),
                    "rule_count": len(rules),
                    "subcategories": subcategories,
                    "source_pages": pages,
                    "rules": rules,
                }
            )

    work_protocols: list[dict[str, Any]] = []
    for _, row in work_safety.iterrows():
        name = _clean(row.get("작업명"))
        if not name:
            continue
        work_protocols.append(
            {
                "code": _clean(row.get("작업코드")),
                "name": name,
                "protective_equipment": _split_guidance(row.get("필수보호구")),
                "prohibitions": _split_guidance(row.get("작업금지조건")),
                "prevention": _split_guidance(row.get("예방수칙")),
                "emergency_steps": _split_guidance(row.get("응급조치")),
                "source": _clean(row.get("출처")),
            }
        )

    machinery_protocols: list[dict[str, Any]] = []
    for _, row in machinery.iterrows():
        name = _clean(row.get("농기계명"))
        if not name:
            continue
        machinery_protocols.append(
            {
                "code": _clean(row.get("농기계코드")),
                "name": name,
                "pre_checks": _split_guidance(row.get("사전점검")),
                "protective_devices": _split_guidance(row.get("필수보호장치")),
                "protective_equipment": _split_guidance(row.get("필수보호구")),
                "safe_operations": _split_guidance(row.get("안전수칙")),
                "prohibitions": _split_guidance(row.get("작업금지조건")),
                "emergency_steps": _split_guidance(row.get("비상조치")),
                "source": _clean(row.get("출처")),
            }
        )

    relative_exposure = safety_risk_context(region=region)
    accident_priorities: list[dict[str, Any]] = []
    for _, row in accident_stats.iterrows():
        value = _number(row.get("값"))
        accident_priorities.append(
            {
                "evidence_id": _clean(row.get("근거ID")),
                "category": _clean(row.get("분류")),
                "item": _clean(row.get("항목")),
                "value": value,
                "unit": _clean(row.get("단위")),
                "population": _clean(row.get("모수")),
                "display": _clean(row.get("앱표시문구")),
                "source": _clean(row.get("출처")),
                "is_accident_probability": False,
            }
        )

    annual_observations: list[dict[str, int]] = []
    if not kosha_year.empty and {"원천연도", "재해자관측수"}.issubset(kosha_year.columns):
        for _, row in kosha_year.sort_values("원천연도").iterrows():
            annual_observations.append(
                {"year": _as_int(row.get("원천연도")), "observed_rows": _as_int(row.get("재해자관측수"))}
            )

    top_occurrence_types: list[dict[str, Any]] = []
    if not kosha_event.empty and {"발생형태", "재해자관측수"}.issubset(kosha_event.columns):
        totals = (
            kosha_event.assign(_count=pd.to_numeric(kosha_event["재해자관측수"], errors="coerce").fillna(0))
            .groupby("발생형태", dropna=False, observed=True)["_count"]
            .sum()
            .sort_values(ascending=False)
            .head(5)
        )
        top_occurrence_types = [
            {"type": _clean(name) or "미분류", "observed_rows": int(value)} for name, value in totals.items()
        ]

    canonical_region = _canonical_region(region)
    kosha_region_label = KOSHA_REGION_LABELS.get(canonical_region, _clean(region))
    selected_region_rows: int | None = None
    selected_region_offices: list[dict[str, Any]] = []
    if not kosha_region.empty and {"지역", "지방관서", "재해자관측수"}.issubset(kosha_region.columns):
        if region != "전체" and kosha_region_label:
            selected = kosha_region[kosha_region["지역"].map(_clean) == kosha_region_label].copy()
            selected["_count"] = pd.to_numeric(selected["재해자관측수"], errors="coerce").fillna(0)
            selected_region_rows = int(selected["_count"].sum())
            office_totals = selected.groupby("지방관서", dropna=False, observed=True)["_count"].sum().nlargest(5)
            selected_region_offices = [
                {"office": _clean(name), "observed_rows": int(value)} for name, value in office_totals.items()
            ]

    kosha_available = not kosha_micro.empty
    kosha_evidence = {
        "available": kosha_available,
        "period": "2017~2023" if kosha_available else "",
        "observed_rows": int(len(kosha_micro)),
        "annual_observations": annual_observations,
        "selected_region": kosha_region_label if region != "전체" else "전체",
        "selected_region_observed_rows": selected_region_rows,
        "selected_region_offices": selected_region_offices,
        "top_occurrence_types": top_occurrence_types,
        "is_accident_probability": False,
        "source": "한국산업안전보건공단 산업재해현황 마이크로데이터",
        "caution": "재해자 관측행 집계이며 개인 사고확률·농기계 전도확률이 아닙니다.",
    }
    return {
        "official_checklist_rows": int(len(safety)),
        "machinery_reference_rows": int(len(machinery)),
        "work_protocol_rows": int(len(work_safety)),
        "category_counts": category_counts,
        "categories": categories,
        "work_protocols": work_protocols,
        "machinery": machinery_protocols,
        "official_accident_evidence_rows": int(len(accident_stats)),
        "official_accident_policy_priorities": accident_priorities,
        "official_kosha_microdata_rows": int(len(kosha_micro)),
        "kosha_observed_evidence": kosha_evidence,
        "predictive_accident_risk_available": False,
        "relative_exposure": relative_exposure,
        "status": "공식 예방수칙·농기계 통계·KOSHA 마이크로데이터 연결",
        "source": "농촌진흥청 농작업 안전자료·2023 농업기계 사고 현황·KOSHA 2017~2023 산업재해 마이크로데이터",
        "caution": (
            "농촌진흥청 공식 조사와 KOSHA 농업 재해자 4,540개 관측행을 각각 제시하며 서로 다른 모수를 합산하지 않습니다. "
            "KOSHA 원본에는 농장·작업시각 공통키가 없어 개인 사고확률이나 농기계 전도확률은 산출하지 않습니다."
        ),
    }


def decision_context(
    *,
    pest: str,
    crop: str,
    region: str,
    cultivation_mode: str,
    forecast_score: int | None,
    risk_level: str,
    confidence: str,
    recommendations: list[dict[str, Any]],
    management_steps: list[str],
    management_caution: str,
    weather_support_index: float | None,
) -> dict[str, Any]:
    cultivation = _cultivation_context(crop, cultivation_mode, region)
    district = _district_network(pest, crop, region)
    monthly = _monthly_outlook(pest, crop, region)
    enemies = _natural_enemy_gate(pest, crop, recommendations)
    pesticide = _pesticide_gate(pest, crop)
    safety = _safety_gate(region)

    gates = [
        {
            "id": "pressure",
            "name": "발생압력",
            "state": risk_level if forecast_score is not None else "자료 부족",
            "ready": forecast_score is not None,
            "evidence": f"2027 상대위험 전망 {forecast_score}점" if forecast_score is not None else "비교 가능한 전망값 없음",
        },
        {
            "id": "enemy",
            "name": "천적 근거",
            "state": "연결" if enemies["connected"] else "미연결",
            "ready": enemies["connected"],
            "evidence": f"검증 연결 {len(enemies['recommendations'])}종",
        },
        {
            "id": "weather",
            "name": "기상 적합성",
            "state": "관측 연결" if weather_support_index is not None else "자료 부족",
            "ready": weather_support_index is not None,
            "evidence": "실제 KMA 관측 근거" if weather_support_index is not None else "선택 조건 기상근거 없음",
        },
        {
            "id": "safety",
            "name": "작업 안전",
            "state": "체크리스트 연결" if safety["official_checklist_rows"] else "자료 부족",
            "ready": bool(safety["official_checklist_rows"]),
            "evidence": f"공식 예방항목 {safety['official_checklist_rows']}건",
        },
    ]

    missing: list[str] = []
    if not enemies["precise_timing_available"]:
        missing.append("선택 작물·해충과 일치하는 천적 방사량·반복주기 원문")
    if not pesticide["connected"]:
        missing.append("PSIS 등록농약·작용기작·사용규정 원본")
    if not cultivation["risk_adjustment_applied"]:
        missing.append("개별 농가·필지 직접 공통키(시군구·작물·연도 집계 근거 브리지는 구현됨)")
    if not safety["predictive_accident_risk_available"]:
        missing.append("확보한 KOSHA 농업 사고 마이크로데이터와 NCPMS 작업환경을 잇는 농장·작업시각 공통키")
    if not enemies["direct_control_effect_available"]:
        missing.append("선택 조건과 일치하는 천적 투입군·무처리 대조군 동일조건 시험")
    missing.append("동일조건 대조시험의 비용·수량·농약사용량")

    return {
        "title": "공생 방제 의사결정 콘솔",
        "promise": "예찰·천적 근거·환경·경제성을 분리해 천적 도입 타당성을 검토합니다.",
        "selected_condition": {
            "pest": pest,
            "crop": crop,
            "region": region,
            "cultivation_mode": cultivation["selected"],
        },
        "forecast": {
            "score": forecast_score,
            "level": risk_level,
            "confidence": confidence,
            "is_confirmed_probability": False,
        },
        "decision_gates": gates,
        "cultivation": cultivation,
        "district_network": district,
        "monthly_outlook": monthly,
        "natural_enemy": enemies,
        "pesticide": pesticide,
        "safety": safety,
        "integrated_management": {
            "surveillance": management_steps[:1] or ["현장 예찰과 피해 증상을 확인합니다."],
            "physical": management_steps[1:2] or ["피해 부위 제거와 작물별 물리적 방제수단을 검토합니다."],
            "biological": [
                "검증된 대상해충-천적 연결만 사용합니다.",
                "정량 방사기준이 없으면 공급기관·전문가의 현장 기준을 확인합니다.",
            ],
            "chemical": [
                "PSIS에서 해당 작물·병해충에 현재 등록된 제품인지 확인합니다.",
                "작용기작을 교호하고 희석배수·사용적기·사용횟수·안전사용기준을 라벨대로 적용합니다.",
            ],
            "caution": management_caution,
        },
        "policy_action_pack": [
            "관측근거와 자료상태를 확인해 집중예찰 지역을 선별합니다.",
            "작물·병해충·월별 전망에서 현장 확인 시점을 정합니다.",
            "천적 근거와 등록농약 사용규정을 분리 검토해 통합방제안을 만듭니다.",
            "작업 전 공식 안전 체크리스트로 인력·농기계 위험을 점검합니다.",
        ],
        "effectiveness": {
            "status": (
                "직접 대조시험 근거 연결"
                if enemies["direct_control_effect_available"]
                else "공식 시험군 보고값 궤적 연결"
                if enemies["numeric_effect_trajectory_available"]
                else "수치 대조시험 자료 미확보"
            ),
            "estimated_percent": None,
            "can_compare_before_after": enemies["direct_control_effect_available"],
            "reported_trajectory_available": enemies["numeric_effect_trajectory_available"],
            "group_comparison_available": any(
                item["effect_trajectory"].get("group_comparison_available", False)
                for item in enemies["recommendations"]
            ),
            "trajectory": next(
                (
                    item["effect_trajectory"]
                    for item in enemies["recommendations"]
                    if item["effect_trajectory"].get("available")
                ),
                {
                    "available": False,
                    "points": [],
                    "direct_control_available": False,
                    "group_comparison_available": False,
                    "interpretation": "선택 조건과 일치하는 공식 수치 궤적이 없습니다.",
                },
            ),
            "required_evidence": ["처리군", "무처리 대조구", "방제 전후 밀도", "수량", "비용", "농약 사용량", "동일 시험조건"],
            "evidence_ladder": enemies["radar_focus"].get("effect_evidence_ladder", []),
            "current_tier": enemies["radar_focus"].get("effect_evidence_tier", "C 현장 검증 설계"),
            "caution": "공식 보고값과 모델 추정값을 분리합니다. 직접 대조군이 없는 수치는 일반화된 방제효과율로 표시하지 않습니다.",
        },
        "future_innovation": {
            "name": "프라이버시 우선 현장 스캔-관측 패킷",
            "current_status": "기기 내 사진 품질검사·증상 체크·전문가 검토 패킷 구현",
            "description": "사진은 서버로 전송하지 않고 기기에서 밝기·대비·해상도 품질을 확인합니다. 관찰자는 증상을 체크해 추적 가능한 검토 패킷을 만들며, 확진 AI처럼 표현하지 않습니다.",
            "required_data": ["전문가 라벨 이미지", "동일 촬영 프로토콜", "확진 결과", "외부 블라인드 검증셋"],
            "implemented": ["카메라·파일 입력", "기기 내 품질검사", "작물·축산 증상 체크", "JSON 관찰 패킷", "재촬영·전문가 검토 게이트"],
            "image_uploaded_to_server": False,
            "diagnostic_model_active": False,
        },
        "missing_data": missing,
        "research_caution": (
            "색상은 실제 관측·전망·근거 유무만 표현합니다. 자료 없음은 저위험이나 발생하지 않음으로 바꾸지 않습니다."
        ),
    }
