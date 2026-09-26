from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
STAGE17_ROOT = ROOT / "data" / "processed" / "stage17"
SMARTFARM_FILE = ROOT / "data" / "processed" / "smartfarm_cultivation_normalized.csv"

PROVINCE_ALIASES = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
    "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시",
    "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도",
    "강원": "강원특별자치도", "강원도": "강원특별자치도", "충북": "충청북도",
    "충남": "충청남도", "전북": "전북특별자치도", "전라북도": "전북특별자치도",
    "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도", "제주도": "제주특별자치도",
}


def _normalise_province(value: str | None) -> str:
    text = (value or "").strip()
    if text in {"", "전체", "전국"}:
        return "전국"
    return PROVINCE_ALIASES.get(text, text)


@lru_cache(maxsize=1)
def _data() -> dict[str, Any]:
    candidates = sorted(STAGE17_ROOT.glob("stage17_spatial_livestock_*/spatial_livestock_app.json"))
    if not candidates:
        return {}
    with candidates[-1].open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    payload["_source_file"] = str(candidates[-1].relative_to(ROOT))
    return payload


def clear_spatial_evidence_cache() -> None:
    _data.cache_clear()
    _smartfarm_examples.cache_clear()


def _normalise_district(value: str | None) -> str:
    text = (value or "").strip()
    if text in {"", "전체", "전국"}:
        return ""
    return text.replace("  ", " ")


def _case_id(*parts: str) -> str:
    raw = "|".join(parts).encode("utf-8")
    return "SF-" + hashlib.sha256(raw).hexdigest()[:10].upper()


@lru_cache(maxsize=1)
def _smartfarm_examples() -> list[dict[str, Any]]:
    """Return official smart-farm cases with the source farm code irreversibly aliased."""
    if not SMARTFARM_FILE.exists():
        return []
    rows: list[dict[str, str]] = []
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with SMARTFARM_FILE.open("r", encoding=encoding, newline="") as handle:
                rows = list(csv.DictReader(handle))
            break
        except UnicodeDecodeError:
            continue
    grouped: dict[tuple[str, str, str, str, str, str], dict[str, Any]] = {}
    for row in rows:
        source_code = str(row.get("농가명") or "").strip()
        province = _normalise_province(row.get("시도명"))
        district = _normalise_district(row.get("시군구명"))
        crop = str(row.get("품목") or "").strip()
        variety = str(row.get("품종") or "").strip()
        greenhouse = str(row.get("온실유형") or row.get("온실종류") or "").strip()
        if not source_code or not (province or district or crop):
            continue
        key = (source_code, province, district, crop, variety, greenhouse)
        current = grouped.setdefault(key, {
            "case_id": _case_id(*key),
            "kind": "스마트팜 익명 농가사례",
            "province": province,
            "district": district,
            "town": "",
            "crop": crop,
            "variety": variety,
            "cultivation": "스마트팜",
            "facility": greenhouse,
            "years": set(),
            "cycle_count": 0,
            "data_modules": set(),
            "coordinate": None,
            "public_label": "공식 공개자료의 익명 농가 식별자",
            "source": "농촌진흥청 스마트팜 우수농가 공개용 데이터",
            "is_anonymised_farm_case": True,
            "contains_owner_name": False,
        })
        year = str(row.get("연도") or "").strip()
        if year:
            current["years"].add(year)
        current["cycle_count"] += 1
        for column, label in (("환경데이터", "환경"), ("생육데이터", "생육"), ("판매데이터", "판매")):
            if str(row.get(column) or "").strip():
                current["data_modules"].add(label)
    result: list[dict[str, Any]] = []
    for item in grouped.values():
        item["years"] = sorted(item["years"])
        item["data_modules"] = sorted(item["data_modules"])
        result.append(item)
    return sorted(result, key=lambda item: (item["province"], item["district"], item["crop"], item["case_id"]))


def _float(value: Any) -> float | None:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number


def _map_point(lon: float, lat: float) -> tuple[float, float] | None:
    """Project public WGS84 points into the national 1000x1000 evidence frame."""
    if not (124.0 <= lon <= 132.5 and 32.0 <= lat <= 40.0):
        return None
    x = (lon - 124.0) / (132.5 - 124.0) * 1000
    y = (40.0 - lat) / (40.0 - 32.0) * 1000
    return round(x, 2), round(y, 2)


def _diverse_sample(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Round-robin evidence types and districts instead of returning only the first region."""
    buckets: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        buckets[(str(row.get("kind", "")), str(row.get("district", "")))].append(row)
    ordered = [buckets[key] for key in sorted(buckets)]
    result: list[dict[str, Any]] = []
    while ordered and len(result) < limit:
        remaining: list[list[dict[str, Any]]] = []
        for bucket in ordered:
            if bucket and len(result) < limit:
                result.append(bucket.pop(0))
            if bucket:
                remaining.append(bucket)
        ordered = remaining
    return result


def _livestock_species(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base_names: dict[int, str] = {}
    for row in rows:
        code = str(row.get("축종지표코드", ""))
        try:
            number = int(code.removeprefix("T"))
        except ValueError:
            continue
        name = str(row.get("축종지표명", ""))
        if name and name != "마리수":
            base_names[number] = name.split(":", 1)[0]
    result: list[dict[str, Any]] = []
    for row in rows:
        code = str(row.get("축종지표코드", ""))
        try:
            number = int(code.removeprefix("T"))
        except ValueError:
            continue
        species = base_names.get(number) or base_names.get(number - 1) or str(row.get("축종지표명", ""))
        metric = "사육농가" if ":농가" in str(row.get("축종지표명", "")) or number % 2 == 0 else "사육규모"
        result.append({**row, "축종명": species, "지표구분": metric})
    return result


def spatial_evidence_context(
    province: str | None = None,
    district: str | None = None,
    mode: str = "crop",
    livestock_species: str | None = None,
    year: str | None = None,
) -> dict[str, Any]:
    payload = _data()
    if not payload:
        return {"available": False, "message": "Stage 17 공간 근거자료가 아직 생성되지 않았습니다."}
    selected_province = _normalise_province(province)
    selected_district = (district or "").strip()
    boundaries = payload.get("boundaries", {})
    provinces = boundaries.get("provinces", [])
    districts = boundaries.get("districts", [])
    if selected_province == "전국":
        active_shapes = provinces
        level = "province"
    else:
        active_shapes = [item for item in districts if item.get("province") == selected_province]
        level = "district"

    raw_hubs = payload.get("public_hubs", [])
    filtered_hubs = [
        row for row in raw_hubs
        if (selected_province == "전국" or row.get("시도명") == selected_province)
        and (not selected_district or row.get("시군구명") == selected_district)
    ]

    observation_examples: list[dict[str, Any]] = []
    map_points: list[dict[str, Any]] = []
    seen_observations: set[tuple[str, str, str, str]] = set()
    for row in filtered_hubs:
        if str(row.get("자료구분")) != "공식 예찰지점":
            continue
        marker = (
            str(row.get("시군구명", "")), str(row.get("읍면동", "")),
            str(row.get("작물", "")), str(row.get("재배유형", "")),
        )
        if marker in seen_observations:
            continue
        seen_observations.add(marker)
        lat = _float(row.get("위도"))
        lon = _float(row.get("경도"))
        point = _map_point(lon, lat) if lat is not None and lon is not None else None
        case_id = str(row.get("거점ID") or "")
        example = {
            "case_id": case_id,
            "kind": "NCPMS 공개 예찰지점",
            "province": str(row.get("시도명", "")),
            "district": str(row.get("시군구명", "")),
            "town": str(row.get("읍면동", "")),
            "crop": str(row.get("작물", "")),
            "variety": "",
            "cultivation": str(row.get("재배유형", "")),
            "facility": "",
            "years": [],
            "cycle_count": int(row.get("사례수") or 1),
            "data_modules": ["예찰망 위치"],
            "coordinate": {"latitude": lat, "longitude": lon} if lat is not None and lon is not None else None,
            "public_label": str(row.get("공개수준", "")),
            "source": str(row.get("출처", "")),
            "is_anonymised_farm_case": False,
            "contains_owner_name": False,
        }
        observation_examples.append(example)
        if point:
            map_points.append({
                "case_id": case_id,
                "kind": "observation",
                "x": point[0], "y": point[1],
                "province": example["province"], "district": example["district"],
                "town": example["town"], "crop": example["crop"],
                "source": example["source"],
            })

    smartfarm_examples = [
        item for item in _smartfarm_examples()
        if (selected_province == "전국" or item["province"] == selected_province)
        and (not selected_district or item["district"] == selected_district)
        and (not year or year in item["years"])
    ]
    all_available_years = sorted({value for item in _smartfarm_examples() for value in item["years"]})
    public_examples = _diverse_sample(observation_examples + smartfarm_examples, 72)
    map_points = _diverse_sample(map_points, 240 if selected_province == "전국" else 180)
    grouped_hubs: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in filtered_hubs:
        key = (
            str(row.get("시도명", "")), str(row.get("시군구명", "")),
            str(row.get("자료구분", "")), str(row.get("작물", "")),
        )
        current = grouped_hubs.setdefault(key, {
            "province": key[0], "district": key[1], "type": key[2], "crop": key[3],
            "case_count": 0, "coordinate_count": 0, "display_name": row.get("표시명", ""),
            "public_level": row.get("공개수준", ""), "source": row.get("출처", ""),
            "individual_farm": False,
        })
        current["case_count"] += int(row.get("사례수") or 1)
        current["coordinate_count"] += int(bool(row.get("위도") and row.get("경도")))
    hub_cards = sorted(grouped_hubs.values(), key=lambda row: (-row["case_count"], row["district"], row["type"]))[:160]

    livestock_rows = _livestock_species(payload.get("livestock_aggregates", []))
    if selected_district:
        scoped_livestock = [row for row in livestock_rows if row.get("시도명") == selected_province and row.get("시군구명") == selected_district]
    elif selected_province == "전국":
        scoped_livestock = [row for row in livestock_rows if row.get("시도명") == "전국"]
    else:
        scoped_livestock = [row for row in livestock_rows if row.get("시도명") == selected_province and not row.get("시군구명")]
    if livestock_species:
        scoped_livestock = [row for row in scoped_livestock if row.get("축종명") == livestock_species]

    national_rows = [row for row in livestock_rows if row.get("시도명") == "전국"]
    national_by_key = {(row.get("축종명"), row.get("지표구분")): row.get("값") for row in national_rows}
    livestock_cards: list[dict[str, Any]] = []
    for row in scoped_livestock:
        value = row.get("값")
        national_value = national_by_key.get((row.get("축종명"), row.get("지표구분")))
        share = None
        if isinstance(value, (int, float)) and isinstance(national_value, (int, float)) and national_value > 0:
            share = round(value / national_value * 100, 2)
        livestock_cards.append({**row, "전국대비비중": share})

    district_hub_counts = Counter(str(row.get("시군구명", "")) for row in filtered_hubs if row.get("시군구명"))
    return {
        "available": True,
        "mode": mode if mode in {"crop", "livestock"} else "crop",
        "scope": {"level": level, "province": selected_province, "district": selected_district or None},
        "map": {"view_box": "0 0 1000 1000", "shapes": active_shapes},
        "districts": [item["name"] for item in districts if selected_province == "전국" or item.get("province") == selected_province],
        "public_hubs": hub_cards,
        "public_examples": public_examples,
        "map_points": map_points,
        "available_years": all_available_years,
        "selected_year": year or None,
        "livestock": livestock_cards,
        "livestock_species": sorted({str(row.get("축종명")) for row in livestock_rows if row.get("축종명")}),
        "district_hub_counts": dict(district_hub_counts),
        "summary": {
            **payload.get("national_summary", {}),
            "selected_public_hub_rows": len(filtered_hubs),
            "selected_hub_types": dict(Counter(str(row.get("자료구분")) for row in filtered_hubs)),
            "selected_public_example_rows": len(observation_examples) + len(smartfarm_examples),
            "selected_anonymised_smartfarm_cases": len(smartfarm_examples),
            "selected_mapped_observation_points": len(map_points),
            "selected_livestock_rows": len(scoped_livestock),
        },
        "source_file": payload.get("_source_file"),
        "source_note": "SGIS 2025 2분기 경계 · KOSIS 2020 농림어업총조사 · NCPMS/팜맵/스마트팜 공개자료",
        "integrity_notice": payload.get("integrity_notice"),
        "privacy_model": {
            "named_private_farms": 0,
            "anonymous_smartfarm_cases": len(smartfarm_examples),
            "owner_names_exposed": False,
            "rule": "공식 공개 상호만 실명 표시하고, 농가 식별자는 결정적 익명 ID로 변환",
        },
        "interpretation_caution": "축산 값은 행정구역 집계이며 개별 농가 위치나 병해충 위험 확률이 아닙니다.",
    }
