"""Read lightweight KMA surface/marine products for the FastAPI layer."""

from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
STAGE4 = ROOT / "data" / "processed" / "stage4"
REPORTS = ROOT / "data" / "reports" / "stage4"
ASOS_RUN = "stage4_20260825_212325"
AWS_RUN = "stage4_aws_long_term_20240101"
MARINE_RUN = "stage4_marine_long_term_20240101"
STATION_FILE = STAGE4 / ASOS_RUN / "KMA_관측지점.csv"
MARINE_TYPES = {
    "B": "해양기상부이",
    "C": "파고부이",
    "D": "표류부이",
    "L": "등표",
    "N": "조위관측소",
    "F": "연안방재",
    "G": "파랑계",
    "J": "기상선",
}


def _json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _number(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def latest_surface_marine_aggregate() -> Path | None:
    candidates = [
        path
        for path in STAGE4.glob("stage4_surface_marine_aggregate_*")
        if (path / "KMA_해양관측_최신공간분포.csv").exists()
    ]
    return max(candidates, key=lambda path: path.name) if candidates else None


def latest_requested_services_validation() -> dict[str, Any]:
    candidates = [
        path
        for path in REPORTS.glob("stage4_requested_services_validation_*/validation.json")
        if path.is_file()
    ]
    return _json(max(candidates, key=lambda path: path.parent.name)) if candidates else {}


@lru_cache(maxsize=1)
def archive_summary() -> dict[str, Any]:
    asos_validation = _json(REPORTS / ASOS_RUN / "validation.json")
    aws_checkpoint = _json(REPORTS / AWS_RUN / "checkpoint.json")
    marine_checkpoint = _json(REPORTS / MARINE_RUN / "checkpoint.json")
    aggregate = latest_surface_marine_aggregate()
    aggregate_validation = (
        _json(REPORTS / aggregate.name / "validation.json") if aggregate else {}
    )
    requested_services = latest_requested_services_validation()
    category_status: dict[str, dict[str, int]] = {}
    for item in requested_services.get("results", []):
        category = str(item.get("category", "기타"))
        summary = category_status.setdefault(category, {"tested": 0, "approved": 0, "data": 0})
        summary["tested"] += 1
        summary["approved"] += int(bool(item.get("approval_confirmed")))
        summary["data"] += int(bool(item.get("actual_data_confirmed")))
    asos = asos_validation.get("services", {}).get("ASOS", {})
    aws = aws_checkpoint.get("stats", {})
    marine = marine_checkpoint.get("stats", {})
    marine_planned = marine_checkpoint.get("collection_plan", {}).get("planned_hours", 0)
    marine_completed = len(marine_checkpoint.get("completed_hours", []))
    return {
        "surface": {
            "ASOS": {
                "status": asos.get("status", "not_found"),
                "rows": int(asos.get("row_count", 0) or 0),
                "stations": int(asos.get("station_count", 0) or 0),
                "first_observation": asos.get("first_observation_time"),
                "last_observation": asos.get("last_observation_time"),
                "resolution": "시간",
            },
            "AWS": {
                "status": aws_checkpoint.get("status", "not_found"),
                "rows": int(aws.get("observation_rows", 0) or 0),
                "valid_rows": int(aws.get("valid_observation_rows", 0) or 0),
                "completed_windows": len(aws_checkpoint.get("completed_windows", [])),
                "first_observation": aws.get("first_observation"),
                "last_observation": aws.get("last_observation"),
                "resolution": "1분",
            },
        },
        "marine": {
            "status": marine_checkpoint.get("status", "not_found"),
            "rows": int(marine.get("observation_rows", 0) or 0),
            "valid_rows": int(marine.get("valid_measurement_rows", 0) or 0),
            "completed_hours": marine_completed,
            "planned_hours": int(marine_planned or 0),
            "remaining_hours": max(0, int(marine_planned or 0) - marine_completed),
            "completion_percent": (
                round(marine_completed / marine_planned * 100, 4)
                if marine_planned
                else 0.0
            ),
            "first_observation": marine.get("first_observation"),
            "last_observation": marine.get("last_observation"),
            "type_rows": marine.get("type_rows", {}),
            "types": MARINE_TYPES,
            "resolution": "시간별 종합 스냅샷",
        },
        "processed": {
            "aggregate_run": aggregate.name if aggregate else None,
            "latest_spatial_rows": int(
                aggregate_validation.get("latest_spatial_rows", 0) or 0
            ),
            "daily_rows": int(aggregate_validation.get("daily_rows", 0) or 0),
            "monthly_rows": int(aggregate_validation.get("monthly_rows", 0) or 0),
        },
        "extended_services": {
            "run_id": requested_services.get("run_id"),
            "tested": int(requested_services.get("api_request_count", 0) or 0),
            "approved": int(requested_services.get("approved_count", 0) or 0),
            "actual_data": int(requested_services.get("actual_data_count", 0) or 0),
            "categories": category_status,
            "world_weather_policy": requested_services.get("world_weather_policy", ""),
        },
        "data_policy": {
            "raw_location": "server_only",
            "browser_payload": "latest/lightweight aggregate only",
            "missing_values": "not imputed",
            "actual_zero": "preserved",
            "api_key_exposed": False,
        },
        "source": "기상청 APIHub 지상관측·해양관측",
    }


def _surface_points() -> list[dict[str, Any]]:
    if not STATION_FILE.exists():
        return []
    aggregate = latest_surface_marine_aggregate()
    latest_file = aggregate / "KMA_지상관측_최신공간분포.csv" if aggregate else None
    latest_by_station: dict[str, dict[str, str]] = {}
    if latest_file and latest_file.exists():
        with latest_file.open(encoding="utf-8-sig", newline="") as handle:
            latest_by_station = {
                str(row.get("지점번호", "")).strip(): row
                for row in csv.DictReader(handle)
            }
    points: list[dict[str, Any]] = []
    with STATION_FILE.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            kind = str(row.get("자료종류", "")).strip()
            if kind not in {"SFC", "AWS"}:
                continue
            latitude = _number(row.get("위도"))
            longitude = _number(row.get("경도"))
            if latitude is None or longitude is None:
                continue
            station_id = str(row.get("지점번호", "")).strip()
            observed = latest_by_station.get(station_id, {}) if kind == "SFC" else {}
            points.append(
                {
                    "domain": "surface",
                    "type_code": kind,
                    "type_name": "ASOS 지점" if kind == "SFC" else "AWS 지점",
                    "station_id": station_id,
                    "station_name": str(row.get("지점명", "")).strip(),
                    "latitude": latitude,
                    "longitude": longitude,
                    "province": str(row.get("시도명", "")).strip(),
                    "district": str(row.get("시군구명", "")).strip(),
                    "observed_at": str(
                        observed.get("관측시각", row.get("최종확인시각", ""))
                    ).strip(),
                    "wave_height": None,
                    "wind_speed": _number(observed.get("풍속")),
                    "wind_direction": _number(observed.get("풍향")),
                    "gust_speed": None,
                    "water_temperature": None,
                    "air_temperature": _number(observed.get("기온")),
                    "pressure": None,
                    "humidity": _number(observed.get("상대습도")),
                    "rainfall": _number(observed.get("강수량")),
                    "ground_temperature": _number(observed.get("지면온도")),
                    "sunshine": _number(observed.get("일조")),
                    "solar_radiation": _number(observed.get("일사")),
                    "data_status": (
                        str(observed.get("자료상태", "")).strip()
                        if observed
                        else "관측지점"
                    ),
                }
            )
    return points


def _marine_points() -> list[dict[str, Any]]:
    aggregate = latest_surface_marine_aggregate()
    if aggregate is None:
        return []
    source = aggregate / "KMA_해양관측_최신공간분포.csv"
    points: list[dict[str, Any]] = []
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            latitude = _number(row.get("위도"))
            longitude = _number(row.get("경도"))
            if latitude is None or longitude is None:
                continue
            points.append(
                {
                    "domain": "marine",
                    "type_code": str(row.get("자료종류코드", "")).strip(),
                    "type_name": str(row.get("자료종류", "")).strip(),
                    "station_id": str(row.get("지점번호", "")).strip(),
                    "station_name": str(row.get("지점명", "")).strip(),
                    "latitude": latitude,
                    "longitude": longitude,
                    "province": "",
                    "district": "",
                    "observed_at": str(row.get("관측시각", "")).strip(),
                    "wave_height": _number(row.get("유의파고")),
                    "wind_speed": _number(row.get("풍속")),
                    "wind_direction": _number(row.get("풍향")),
                    "gust_speed": _number(row.get("돌풍속")),
                    "water_temperature": _number(row.get("수온")),
                    "air_temperature": _number(row.get("기온")),
                    "pressure": _number(row.get("해면기압")),
                    "humidity": _number(row.get("상대습도")),
                    "rainfall": None,
                    "ground_temperature": None,
                    "sunshine": None,
                    "solar_radiation": None,
                    "data_status": str(row.get("자료상태", "")).strip(),
                }
            )
    return points


@lru_cache(maxsize=1)
def all_observation_points() -> list[dict[str, Any]]:
    return [*_surface_points(), *_marine_points()]


def observation_map(
    domain: str = "all",
    type_code: str | None = None,
    limit: int = 2000,
) -> dict[str, Any]:
    points = all_observation_points()
    if domain in {"surface", "marine"}:
        points = [point for point in points if point["domain"] == domain]
    if type_code:
        wanted = type_code.strip().upper()
        points = [point for point in points if point["type_code"].upper() == wanted]
    available_types = sorted(
        {
            (point["domain"], point["type_code"], point["type_name"])
            for point in all_observation_points()
        }
    )
    return {
        "domain": domain,
        "type_code": type_code,
        "total_points": len(points),
        "returned_points": min(len(points), limit),
        "points": points[:limit],
        "available_types": [
            {"domain": item[0], "code": item[1], "name": item[2]}
            for item in available_types
        ],
        "archive": archive_summary(),
        "note": "지상은 ASOS 최신 실제 관측과 ASOS·AWS 지점망, 해양은 유형별 최신 실제 관측을 제공합니다. 결측값은 보간하지 않습니다.",
    }


def clear_observation_cache() -> None:
    archive_summary.cache_clear()
    all_observation_points.cache_clear()
