"""Validated agricultural work and machinery safety guidance."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_ROOT = ROOT / "data" / "processed" / "stage8"
DETAIL_FILE = "농작업안전_공식체크리스트_항목.csv"
WORK_FILE = "농작업안전DB.csv"
MACHINE_FILE = "농기계안전DB.csv"
SITE_CONTENT_FILE = "농업인안전365_콘텐츠카탈로그.csv"
SITE_PAGE_FILE = "농업인안전365_페이지카탈로그.csv"
SITE_PUBLICATION_FILE = "농업인안전365_간행물카탈로그.csv"
SITE_MACHINE_FILE = "농기계안전_콘텐츠인덱스.csv"
SITE_BOARD_FILE = "농업인안전365_자료실카탈로그.csv"
SOURCE_PAGE = "https://farmer.rda.go.kr/portal/intro/index.do"
OPEN_API_PAGE = "https://www.data.go.kr/data/15081310/openapi.do"
OPEN_API_SAMPLE = (
    "https://api.nongsaro.go.kr/sample/ajax/farmWorkSafetyEducation/"
    "farmWorkSafetyEducation.html"
)


def _latest_run() -> Path | None:
    if not PROCESSED_ROOT.exists():
        return None
    candidates = sorted(
        (
            path
            for path in PROCESSED_ROOT.glob("stage8_safety_checklists_*")
            if path.is_dir() and (path / DETAIL_FILE).exists()
        ),
        key=lambda path: path.name,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _latest_site_run() -> Path | None:
    if not PROCESSED_ROOT.exists():
        return None
    candidates = sorted(
        (
            path
            for path in PROCESSED_ROOT.glob("stage8_farmer_safety_public_*")
            if path.is_dir() and (path / SITE_CONTENT_FILE).exists()
        ),
        key=lambda path: path.name,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")


def _split_rules(value: object) -> list[str]:
    return [item.strip() for item in str(value or "").split(" | ") if item.strip()]


def _catalogue_link(row: dict[str, Any]) -> str:
    return str(row.get("콘텐츠URL") or row.get("다운로드URL") or "").strip()


def _knowledge_domains(contents: pd.DataFrame) -> list[dict[str, Any]]:
    if contents.empty or "위험분류" not in contents.columns:
        return []
    domains: list[dict[str, Any]] = []
    for category, frame in contents.groupby("위험분류", sort=False):
        types = sorted({value for value in frame.get("자료형", pd.Series(dtype=str)) if value})
        titles = [value for value in dict.fromkeys(frame["제목"].tolist()) if value][:4]
        domains.append(
            {
                "name": str(category),
                "content_count": int(len(frame)),
                "content_types": types,
                "representative_titles": titles,
            }
        )
    return sorted(domains, key=lambda item: item["content_count"], reverse=True)


def _featured_contents(contents: pd.DataFrame, limit: int = 24) -> list[dict[str, Any]]:
    if contents.empty:
        return []
    work = contents.copy()
    work["_priority"] = (
        work.get("게시일", pd.Series("", index=work.index)).astype(str).str.replace("-", "", regex=False)
    )
    work["_has_download"] = work.get("다운로드URL", pd.Series("", index=work.index)).astype(str).ne("")
    work = work.sort_values(["_has_download", "_priority"], ascending=[False, False])
    rows: list[dict[str, Any]] = []
    seen_categories: dict[str, int] = {}
    for row in work.to_dict(orient="records"):
        category = str(row.get("위험분류", "기타"))
        if seen_categories.get(category, 0) >= 4:
            continue
        link = _catalogue_link(row)
        if not link:
            continue
        rows.append(
            {
                "id": str(row.get("콘텐츠ID", "")),
                "category": category,
                "section": str(row.get("대분류", "")),
                "title": str(row.get("제목", "")),
                "content_type": str(row.get("자료형", "웹콘텐츠")),
                "duration": str(row.get("재생시간", "")),
                "published_at": str(row.get("게시일", "")),
                "official_url": link,
                "download_available": bool(str(row.get("다운로드URL", "")).strip()),
            }
        )
        seen_categories[category] = seen_categories.get(category, 0) + 1
        if len(rows) >= limit:
            break
    return rows


def _machinery_catalogue(contents: pd.DataFrame) -> list[dict[str, Any]]:
    if contents.empty:
        return []
    machine_terms = [
        "농기계 공통", "경운기", "트랙터", "예초기", "예취기", "콤바인", "이앙기",
        "관리기", "파쇄기", "분무기", "굴착기", "운반차", "고소작업차", "체인톱",
        "탈곡기", "건조기", "드론",
    ]
    titles = contents.get("제목", pd.Series("", index=contents.index)).astype(str)
    result: list[dict[str, Any]] = []
    for term in machine_terms:
        if term == "농기계 공통":
            frame = contents[titles.str.contains("농기계|농업기계", regex=True, na=False)]
        else:
            frame = contents[titles.str.contains(term, regex=False, na=False)]
        if frame.empty:
            continue
        examples = []
        for row in frame.head(4).to_dict(orient="records"):
            examples.append(
                {
                    "title": str(row.get("제목", "")),
                    "content_type": str(row.get("자료형", "")),
                    "official_url": _catalogue_link(row),
                }
            )
        result.append({"name": term, "content_count": int(len(frame)), "examples": examples})
    return result


@lru_cache(maxsize=1)
def safety_guidance_summary() -> dict[str, Any]:
    run_dir = _latest_run()
    if run_dir is None:
        return {
            "status": "not_ready",
            "message": "검증된 농작업 안전 체크리스트 산출물이 없습니다.",
            "categories": [],
            "machinery": [],
        }

    details = _read_csv(run_dir / DETAIL_FILE)
    work = _read_csv(run_dir / WORK_FILE)
    machinery = _read_csv(run_dir / MACHINE_FILE)
    site_run = _latest_site_run()
    site_contents = _read_csv(site_run / SITE_CONTENT_FILE) if site_run else pd.DataFrame()
    site_pages = _read_csv(site_run / SITE_PAGE_FILE) if site_run else pd.DataFrame()
    site_publications = _read_csv(site_run / SITE_PUBLICATION_FILE) if site_run else pd.DataFrame()
    site_machinery = _read_csv(site_run / SITE_MACHINE_FILE) if site_run else pd.DataFrame()
    site_board = _read_csv(site_run / SITE_BOARD_FILE) if site_run else pd.DataFrame()

    categories: list[dict[str, Any]] = []
    if not details.empty:
        for category, frame in details.groupby("위험분류", sort=False):
            pages = sorted(
                {int(value) for value in frame["원천페이지"] if str(value).isdigit()}
            )
            subcategories = [
                value
                for value in dict.fromkeys(frame["세부분류"].tolist())
                if value
            ]
            categories.append(
                {
                    "name": category,
                    "rule_count": int(len(frame)),
                    "subcategories": subcategories,
                    "pages": pages,
                    "rules": frame["안전수칙"].tolist(),
                }
            )

    machinery_rows: list[dict[str, Any]] = []
    for row in machinery.to_dict(orient="records") if not machinery.empty else []:
        machinery_rows.append(
            {
                "code": row.get("농기계코드", ""),
                "name": row.get("농기계명", ""),
                "pre_checks": _split_rules(row.get("사전점검", "")),
                "protective_devices": _split_rules(row.get("필수보호장치", "")),
                "protective_equipment": _split_rules(row.get("필수보호구", "")),
                "safe_operations": _split_rules(row.get("안전수칙", "")),
                "prohibitions": _split_rules(row.get("작업금지조건", "")),
                "emergency_steps": _split_rules(row.get("비상조치", "")),
                "source": row.get("출처", ""),
            }
        )

    nongsaro_key_configured = _secret_is_configured("NONGSARO_API_KEY", "Nongsaro")
    public_data_key_configured = _secret_is_configured("DATA_GO_KR_KEY")
    return {
        "status": "complete",
        "run_id": run_dir.name,
        "source": {
            "name": "농촌진흥청 농작업 안전 자가점검 체크리스트",
            "publication_year": 2023,
            "page": SOURCE_PAGE,
            "api_key_required": False,
            "source_rows": int(len(details)),
            "work_categories": int(len(work)),
            "machinery_rows": int(len(machinery)),
        },
        "portal_catalogue": {
            "status": "complete" if site_run else "not_ready",
            "run_id": site_run.name if site_run else "",
            "source_name": "농촌진흥청 농업인안전365 공개 웹자료",
            "source_page": SOURCE_PAGE,
            "api_key_required": False,
            "page_count": int(len(site_pages)),
            "content_count": int(len(site_contents)),
            "publication_count": int(len(site_publications)),
            "board_count": int(len(site_board)),
            "video_count": int((site_contents.get("자료형", pd.Series(dtype=str)) == "동영상").sum()),
            "machinery_content_count": int(len(site_machinery)),
            "media_files_downloaded": 0,
            "integration_method": "공식 공개 메타데이터·출처·원문 링크 연결",
        },
        "open_api": {
            "name": "농촌진흥청_농작업 안전교육",
            "official_page": OPEN_API_PAGE,
            "sample_page": OPEN_API_SAMPLE,
            "service_name": "farmWorkSafetyEducation",
            "operation_name": "safetyEducationList",
            "format": "XML/LINK",
            "key_required": True,
            "service_approval_required": True,
            "development_review": "자동승인",
            "production_review": "심의승인",
            "nongsaro_key_status": "설정됨" if nongsaro_key_configured else "미설정",
            "public_data_key_status": "설정됨" if public_data_key_configured else "미설정",
            "key_note": (
                "DATA_GO_KR_KEY가 설정되어 있어도 이 LINK형 농사로 서비스의 별도 활용신청과 "
                "농사로 인증키 발급 여부를 확인해야 합니다. 키 원문은 앱과 로그에 노출하지 않습니다."
            ),
        },
        "categories": categories,
        "machinery": machinery_rows,
        "knowledge_domains": _knowledge_domains(site_contents),
        "featured_contents": _featured_contents(site_contents),
        "machinery_catalogue": _machinery_catalogue(site_machinery),
        "official_sections": [
            {"name": "안전보건 기본교육", "url": f"{SOURCE_PAGE.rsplit('/intro/', 1)[0]}/menu3/contentMainPlay1_1.do?menuId=PS03487&m_id=9002_5218_5220"},
            {"name": "작목별 안전교육", "url": f"{SOURCE_PAGE.rsplit('/intro/', 1)[0]}/menu3/contentMainPlay_Ep.do?menuId=PS03434&m_id=9002_5217"},
            {"name": "농업인 사고사례", "url": f"{SOURCE_PAGE.rsplit('/intro/', 1)[0]}/menu3/contentMain_new.do?menuId=PS03440&m_id=9001_7272"},
            {"name": "농업인 재해예방 영상", "url": f"{SOURCE_PAGE.rsplit('/intro/', 1)[0]}/menu3/contentMainPlay.do?menuId=PS03436&m_id=9002_55"},
            {"name": "발간책자", "url": f"{SOURCE_PAGE.rsplit('/intro/', 1)[0]}/menu1/contentMain_B.do?menuId=PS03443&m_id=9004_3911"},
        ],
        "limitations": (
            "이 안내는 2023년 농촌진흥청 공식 자가점검 체크리스트와 농업인안전365 공개자료를 구조화한 예방정보입니다. "
            "사고 확률이나 법적 적합성 판정이 아니며, 원문에 없는 심각도·발생가능성 점수는 생성하지 않았습니다."
        ),
    }


def clear_safety_cache() -> None:
    safety_guidance_summary.cache_clear()
def _secret_is_configured(*names: str) -> bool:
    """Check approved environment aliases without returning or logging secret text."""
    if any(os.environ.get(name) for name in names):
        return True
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            for name in names:
                try:
                    value, _ = winreg.QueryValueEx(key, name)
                except OSError:
                    continue
                if value:
                    return True
    except (ImportError, OSError):
        pass
    return False
