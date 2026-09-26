"""Collect 2025 NCPMS SVC51/SVC52 data using an environment credential.

The credential value is never printed or persisted. This legacy one-off collector
is retained for reproducibility; the Stage 3 collector remains the full collector.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any

import pandas as pd
import requests


API_URL = "http://ncpms.rda.go.kr/npmsAPI/service"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "data" / "ncpms_SVC52_2025.csv"
DISPLAY_COUNT = 50


def require_api_key() -> str:
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not key:
        raise RuntimeError("DATA_GO_KR_KEY 환경변수가 설정되지 않았습니다.")
    return key


def request_service(api_key: str, **params: str) -> dict[str, Any]:
    response = requests.get(
        API_URL,
        params={"apiKey": api_key, "serviceType": "AA003", **params},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("NCPMS 응답이 JSON 객체가 아닙니다.")
    return payload


def service_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    items = payload.get("service", {}).get("list", [])
    if isinstance(items, dict):
        return [items]
    return items if isinstance(items, list) else []


def collect_surveys(api_key: str) -> list[dict[str, Any]]:
    surveys: list[dict[str, Any]] = []
    start_point = 1
    total_count: int | None = None
    while total_count is None or start_point <= total_count:
        payload = request_service(
            api_key,
            serviceCode="SVC51",
            searchExaminYear="2025",
            displayCount=str(DISPLAY_COUNT),
            startPoint=str(start_point),
        )
        page = service_items(payload)
        surveys.extend(page)
        raw_total = payload.get("service", {}).get("totalCount")
        try:
            total_count = int(raw_total)
        except (TypeError, ValueError):
            total_count = len(surveys) if len(page) < DISPLAY_COUNT else None
        if not page or len(page) < DISPLAY_COUNT:
            break
        start_point += DISPLAY_COUNT
    return surveys


def parse_svc52_list(raw: Any, survey: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(raw, str):
        return []
    rows: list[dict[str, Any]] = []
    for block in re.findall(r"\{([^{}]+)\}", raw):
        pest = re.search(r"dbyhsNm=([^,]+)", block)
        region = re.search(r"sidoNm=([^,]+)", block)
        value = re.search(r"inqireValue=([^,]+)", block)
        if not (pest and region and value):
            continue
        try:
            observed_value = float(value.group(1).strip())
        except ValueError:
            continue
        rows.append(
            {
                "insectKey": survey.get("insectKey"),
                "작물": survey.get("kncrNm"),
                "조사구분": survey.get("examinSpchcknNm"),
                "예측구분": survey.get("predictnSpchcknNm"),
                "조사연도": survey.get("examinYear"),
                "조사회차": survey.get("examinTmrd"),
                "병해충": pest.group(1).strip(),
                "지역": region.group(1).strip(),
                "발생값": observed_value,
            }
        )
    return rows


def main() -> int:
    api_key = require_api_key()
    surveys = collect_surveys(api_key)
    print(f"SVC51 목록 건수: {len(surveys)}")

    detail_rows: list[dict[str, Any]] = []
    for index, survey in enumerate(surveys, start=1):
        insect_key = str(survey.get("insectKey") or "").strip()
        if not insect_key:
            continue
        try:
            payload = request_service(
                api_key,
                serviceCode="SVC52",
                insectKey=insect_key,
            )
            raw = payload.get("service", {}).get("list", "")
            detail_rows.extend(parse_svc52_list(raw, survey))
            print(f"{index}/{len(surveys)} 완료")
        except (requests.RequestException, ValueError, RuntimeError) as exc:
            print(f"개별 자료 오류: {type(exc).__name__}")
        time.sleep(0.1)

    frame = pd.DataFrame(detail_rows)
    frame.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")
    print(f"총 저장 행: {len(frame)}")
    print(f"저장 완료: {OUTPUT_PATH.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
