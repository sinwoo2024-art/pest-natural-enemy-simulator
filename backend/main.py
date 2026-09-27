from pathlib import Path
from functools import lru_cache
import os
import re

try:
    from .landscape_review import LandscapeRequest, review_landscape
except ImportError:
    from landscape_review import LandscapeRequest, review_landscape

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

try:
    from .adoption_review import AdoptionRequest, evidence_track, evaluate_review, FORMULAS, DISCLAIMER
    from .decision_support import _natural_enemy_gate
except ImportError:
    from adoption_review import AdoptionRequest, evidence_track, evaluate_review, FORMULAS, DISCLAIMER
    from decision_support import _natural_enemy_gate

try:
    from .forecast_2027 import (
        FORECAST_DISCLAIMER,
        FORECAST_PATH,
        INSUFFICIENT_MESSAGE,
        MODEL_LIMITATION,
        forecast_summary,
        generate_forecast_csv,
        validate_reference_data,
        validate_source_data,
    )
except ImportError:
    from forecast_2027 import (
        FORECAST_DISCLAIMER,
        FORECAST_PATH,
        INSUFFICIENT_MESSAGE,
        MODEL_LIMITATION,
        forecast_summary,
        generate_forecast_csv,
        validate_reference_data,
        validate_source_data,
    )

try:
    from .weather_forecast_2027 import (
        MODEL_LIMITATION_WEATHER,
        aws_minute_archive_status,
        load_stage5_validation,
        load_weather_forecast,
        stage5_source_path,
        weather_context,
    )
except ImportError:
    from weather_forecast_2027 import (
        MODEL_LIMITATION_WEATHER,
        aws_minute_archive_status,
        load_stage5_validation,
        load_weather_forecast,
        stage5_source_path,
        weather_context,
    )

try:
    from .kma_observations import (
        archive_summary as kma_archive_summary,
        clear_observation_cache,
        observation_map as kma_observation_map,
    )
except ImportError:
    from kma_observations import (
        archive_summary as kma_archive_summary,
        clear_observation_cache,
        observation_map as kma_observation_map,
    )

try:
    from .research_analysis import (
        clear_research_cache,
        load_stage6_validation,
        research_context,
        research_summary,
        stage6_source_path,
    )
except ImportError:
    from research_analysis import (
        clear_research_cache,
        load_stage6_validation,
        research_context,
        research_summary,
        stage6_source_path,
    )

try:
    from .spatiotemporal_forecast_2027 import (
        clear_spatiotemporal_cache,
        load_spatiotemporal_forecast,
        spatiotemporal_validation_summary,
        stage7_source_path,
    )
except ImportError:
    from spatiotemporal_forecast_2027 import (
        clear_spatiotemporal_cache,
        load_spatiotemporal_forecast,
        spatiotemporal_validation_summary,
        stage7_source_path,
    )

try:
    from .safety_guidance import clear_safety_cache, safety_guidance_summary
except ImportError:
    from safety_guidance import clear_safety_cache, safety_guidance_summary

try:
    from .decision_support import clear_decision_cache, decision_context, pesticide_catalogue, pesticide_product_detail
except ImportError:
    from decision_support import clear_decision_cache, decision_context, pesticide_catalogue, pesticide_product_detail

try:
    from .smartfarm_evidence import clear_smartfarm_evidence_cache, smartfarm_evidence
except ImportError:
    from smartfarm_evidence import clear_smartfarm_evidence_cache, smartfarm_evidence

try:
    from .work_safety_risk import clear_work_safety_cache, safety_risk_context
except ImportError:
    from work_safety_risk import clear_work_safety_cache, safety_risk_context

try:
    from .ecological_evidence import (
        clear_ecological_evidence_cache,
        ecological_evidence_context,
    )
except ImportError:
    from ecological_evidence import (
        clear_ecological_evidence_cache,
        ecological_evidence_context,
    )

try:
    from .field_manual import build_field_manual
except ImportError:
    from field_manual import build_field_manual

try:
    from .spatial_evidence import clear_spatial_evidence_cache, spatial_evidence_context
except ImportError:
    from spatial_evidence import clear_spatial_evidence_cache, spatial_evidence_context


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

app = FastAPI(
    title="공생의 알고리즘 AI API",
    description="NCPMS 예찰자료와 천적곤충 정보를 연결하는 분석 API",
    version="0.1.0",
)
DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://app.gongsaeng-ai.com",
]
CONFIGURED_CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(DEFAULT_CORS_ORIGINS + CONFIGURED_CORS_ORIGINS)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean_name(value: object) -> str:
    return re.sub(r"\([^)]*\)", "", str(value)).replace(" ", "").strip()


def split_targets(value: object) -> list[str]:
    return [clean_name(item) for item in re.split(r"[,;/]", str(value)) if clean_name(item)]


AVAILABLE_YEARS = [2024, 2025, 2026]


@lru_cache(maxsize=1)
def _load_stage20_observations() -> pd.DataFrame:
    """Load the audited three-year NCPMS long table without copying raw rows.

    The legacy 2024/2026 files remain the source for the original dashboard.
    Stage 20 is used only when the 2025 first-class simulator view is requested.
    """
    stage20_root = DATA_DIR / "processed" / "stage20"
    if not stage20_root.exists():
        return pd.DataFrame()

    run_directories = sorted(
        (path for path in stage20_root.iterdir() if path.is_dir()),
        key=lambda path: path.name,
        reverse=True,
    )
    for run_directory in run_directories:
        candidates = sorted(run_directory.glob("NCPMS_2024_2025_2026_*.csv"))
        for candidate in candidates:
            try:
                frame = pd.read_csv(candidate, encoding="utf-8-sig")
            except (OSError, UnicodeError, pd.errors.ParserError):
                continue
            required = {
                "조사연도", "작물", "병해충", "지역", "조사회차",
                "측정지표", "발생값",
            }
            if not required.issubset(frame.columns):
                continue

            result = frame.copy()
            result["조사연도"] = pd.to_numeric(result["조사연도"], errors="coerce")
            result["조사회차"] = pd.to_numeric(result["조사회차"], errors="coerce").fillna(0).astype(int)
            result["발생값"] = pd.to_numeric(result["발생값"], errors="coerce")
            result["병해충기본명"] = result["병해충"].map(clean_name)
            result["병해충"] = (
                result["병해충"].astype(str)
                + "(" + result["측정지표"].astype(str) + ")"
            )
            result["자료출처"] = "승인 NCPMS SVC51·52 Stage 20 3개년 분석원장"
            return result
    return pd.DataFrame()


def load_observations(year: int) -> pd.DataFrame:
    if year not in AVAILABLE_YEARS:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 연도입니다: {year}"
        )

    file_path = DATA_DIR / f"ncpms_SVC52_{year}.csv"

    if file_path.exists():
        observations = pd.read_csv(
            file_path,
            encoding="utf-8-sig"
        )
    elif year == 2025:
        observations = _load_stage20_observations()
        if not observations.empty:
            observations = observations[observations["조사연도"].eq(2025)].copy()
        if observations.empty:
            raise HTTPException(
                status_code=404,
                detail="2025년 승인 NCPMS Stage 20 분석원장을 찾을 수 없습니다."
            )
    else:
        raise HTTPException(
            status_code=404,
            detail=f"{year}년 데이터 파일을 찾을 수 없습니다."
        )

    observations["병해충기본명"] = (
        observations["병해충"]
        .map(clean_name)
    )

    observations["발생값"] = pd.to_numeric(
        observations["발생값"],
        errors="coerce"
    ).fillna(0)

    return observations


def load_enemy_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    custom = pd.read_excel(
        DATA_DIR / "병해충_천적DB.xlsx",
        sheet_name="천적곤충",
        header=1
    )

    official = pd.read_csv(
        DATA_DIR / "천적곤충현황.csv",
        encoding="cp949"
    )

    return custom, official


CUSTOM_ENEMIES, OFFICIAL_ENEMIES = load_enemy_data()
EXPANDED_ENEMIES = pd.read_csv(DATA_DIR / "천적확장DB.csv", encoding="utf-8-sig")


def scientific_name_key(value: object) -> str:
    """Normalize one scientific name for a stable official+literature union."""
    text = "" if pd.isna(value) else str(value).strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\([^)]*\)", "", text)
    text = re.sub(r"\b(?:sp|spp)\.?$", "spp", text, flags=re.IGNORECASE)
    return re.sub(r"[^a-z]", "", text.casefold())


def combined_natural_enemy_taxa_count() -> int:
    """Count unique taxa across the official 31 and the literature extension DB."""
    official_names = (
        OFFICIAL_ENEMIES["속명"].fillna("").astype(str).str.strip()
        + " "
        + OFFICIAL_ENEMIES["종명"].fillna("").astype(str).str.strip()
    )
    expanded_name_column = "학명" if "학명" in EXPANDED_ENEMIES.columns else "과학명"
    keys = {
        scientific_name_key(value)
        for value in [*official_names.tolist(), *EXPANDED_ENEMIES[expanded_name_column].tolist()]
        if scientific_name_key(value)
    }
    return len(keys)


NATURAL_ENEMY_TAXA_COUNT = combined_natural_enemy_taxa_count()
PEST_CLASSES = pd.read_csv(DATA_DIR / "병해충분류DB.csv", encoding="utf-8-sig")
PEST_CLASSES["병해충기본명"] = PEST_CLASSES["병해충기본명"].map(clean_name)
PEST_CLASS_LOOKUP = PEST_CLASSES.set_index("병해충기본명").to_dict("index")
KNOWN_ENEMY_TARGETS = {
    target
    for frame, column in [
        (CUSTOM_ENEMIES, "대상병해충"),
        (OFFICIAL_ENEMIES, "대상해충"),
        (EXPANDED_ENEMIES, "대상병해충"),
    ]
    for value in frame[column].dropna().tolist()
    for target in split_targets(value)
}


MANAGEMENT_GUIDES = {
    "해충": {
        "response_type": "예찰·물리·재배·등록 방제 통합관리",
        "message": (
            "현재 천적 DB에서 직접 일치하는 활용 근거가 확인되지 않아 임의의 천적을 추천하지 않고, "
            "예찰과 물리·재배 관리 및 등록 방제를 단계적으로 안내합니다."
        ),
        "steps": [
            "예찰: 피해 증상과 충체를 함께 확인하고 발생 시기·밀도·분포를 기록해 대상 해충을 정확히 동정합니다.",
            "물리 관리: 피해 부위와 잔재를 제거하고 방충망·트랩 등 해당 작물과 해충에 적합한 물리적 수단을 검토합니다.",
            "재배 관리: 포장 위생, 기주 잡초, 과도한 질소 시비와 밀식 등 발생을 키울 수 있는 조건을 조정합니다.",
            "방제: 경제적 피해 수준과 발생 단계를 확인한 뒤 해당 작물·해충에 등록된 방제 수단을 안전사용기준에 따라 적용합니다.",
        ],
        "caution": "천적 DB의 직접 근거가 없는 해충에 유사 이름만으로 천적을 확대 적용하지 않습니다.",
        "evidence": "NCPMS 예찰자료 / 농촌진흥청 농사로 해충 관리자료 / 등록 약제 확인: 농약안전정보시스템",
    },
    "병해": {
        "response_type": "병원체 진단·재배환경·등록 방제 통합관리",
        "message": (
            "병징만으로 원인을 단정하지 않고 발생 양상과 재배환경을 함께 확인한 뒤 "
            "예방·환경·위생·등록 방제를 단계적으로 적용합니다."
        ),
        "steps": [
            "진단: 병반 형태, 발생 위치·확산 양상과 온도·습도·관수 조건을 확인하고 필요하면 전문기관에 진단을 의뢰합니다.",
            "예방: 건전 종자·묘와 저항성 품종을 우선하고 병원체의 전염 특성과 재배환경에 맞춰 윤작·배수·재식밀도·환기를 조정합니다.",
            "위생: 이병 잔재와 전염원을 제거하고 작업 도구·육묘장·관수원을 청결하게 관리합니다.",
            "방제: 예방적으로 또는 발생 초기에, 해당 작물과 대상 병해에 등록된 살균제·생물농약을 라벨과 안전사용기준에 따라 적용합니다.",
        ],
        "caution": (
            "곰팡이성·세균성·토양전염성 병해는 관리법이 다르므로 "
            "병원체 확인 전 임의 약제 사용을 피해야 합니다."
        ),
        "evidence": "농촌진흥청 농사로·NCPMS 병해충 정보 / 등록 농약 및 안전사용기준: 농약안전정보시스템",
    },
    "바이러스": {
        "response_type": "감염원 제거·매개충·작업위생 통합관리",
        "message": (
            "바이러스는 감염 후 직접 치료가 어려우므로 건전 종묘, 감염원 제거, "
            "매개충과 작업위생을 중심으로 확산을 차단합니다."
        ),
        "steps": [
            "진단: 모자이크·황화·왜화·괴저 증상과 포장 확산 양상을 확인하되 증상만으로 확진하지 않고, 필요하면 전문기관 진단을 통해 유사한 생리장해와 구분합니다.",
            "감염원 차단: 감염 의심주는 우선 격리하고 진단 결과나 공식 방제지침에 따라 제거합니다. 감염이 확인된 포기에서는 종자·삽수·모주를 채취하지 않습니다.",
            "매개충 관리: 해당 바이러스의 전염경로와 매개충을 확인하고, 예찰·방충망·기주잡초 관리와 등록 방제수단을 병행합니다.",
            "위생·예방: 무병 종자·묘를 사용하고 손·도구·농기구를 소독하며 주변 기주잡초와 자생식물을 관리합니다.",
        ],
        "caution": (
            "매개충 방제는 추가 전염을 줄이는 조치이며 이미 감염된 식물체를 "
            "치료하는 방법은 아닙니다."
        ),
        "evidence": "농촌진흥청 농사로·NCPMS 병해충 정보 / 등록 농약 및 안전사용기준: 농약안전정보시스템",
    },
    "선충": {
        "response_type": "밀도진단·유입차단·기주관리·밀도억제",
        "message": (
            "식물기생선충은 의심 증상만으로 확진하지 않고, 토양·뿌리 시료를 통해 선충의 "
            "종류와 밀도를 확인한 뒤 건전 종묘, 포장위생, 기주관리와 등록 방제수단을 "
            "단계적으로 적용합니다."
        ),
        "steps": [
            "진단: 포장 내 불균일 생육, 황화·위조, 뿌리의 혹·갈변 등 의심 증상을 확인합니다. 증상만으로 확진하지 않고 토양·뿌리 시료를 채취해 선충의 종류와 밀도를 조사합니다.",
            "유입 차단: 건전 종묘와 오염되지 않은 상토를 사용하고, 오염 토양이 묻은 농기구·작업화·묘와 관개수·배수를 통한 포장 간 확산을 차단합니다.",
            "재배 관리: 확인된 선충의 종·레이스와 기주범위를 기준으로 비기주작물 윤작, 기주잡초 제거, 저항성 품종 또는 대목을 선택합니다.",
            "밀도 억제: 선충의 종류와 재배조건에 따라 태양열 소독, 담수, 시설 내 증기소독 등 물리·경종적 방법을 검토합니다. 약제는 해당 작물과 대상 선충에 등록된 제품만 라벨과 안전사용기준에 따라 사용합니다.",
        ],
        "caution": (
            "윤작과 저항성 품종의 효과는 선충의 종·레이스 및 포장 내 기주잡초에 따라 "
            "달라질 수 있으므로, 선충 동정과 밀도조사가 우선입니다."
        ),
        "evidence": "농촌진흥청 농사로 선충 진단·방제자료 / 등록 약제 확인: 농약안전정보시스템",
    },
}


def enrich_profile(profile: dict) -> dict:
    # CSV에 눈에 보이지 않는 BOM/공백이 섞여 있어도 유형별 안내를 찾도록 정리합니다.
    category = str(profile.get("분류", "기타")).replace("\ufeff", "").strip()
    is_enemy_target = str(profile.get("천적추천대상", "N")).upper() == "Y"
    guide = None if category == "해충" and is_enemy_target else MANAGEMENT_GUIDES.get(category)
    if not guide:
        return {
            **profile,
            "분류": category,
            "관리단계": [],
            "관리주의": "",
            "관리근거": "",
        }

    return {
        **profile,
        "분류": category,
        "대응유형": guide["response_type"],
        "관리안내": guide["message"],
        "관리단계": guide["steps"],
        "관리주의": guide["caution"],
        "관리근거": guide["evidence"],
    }


def pest_profile(pest: str) -> dict:
    key = clean_name(pest)
    if key in KNOWN_ENEMY_TARGETS:
        profile = PEST_CLASS_LOOKUP.get(
            key,
            {
                "분류": "해충",
                "대응유형": "천적곤충·예찰관리",
                "천적추천대상": "Y",
                "관리안내": "NCPMS 직접 관측이 없는 대상해충입니다. 연결된 천적 근거를 확인하고 실제 발생 여부를 먼저 예찰하세요.",
            },
        )
    else:
        default = {
            "분류": "기타",
            "대응유형": "예찰·전문가 확인",
            "천적추천대상": "N",
            "관리안내": "분류가 확인되지 않은 항목입니다. 예찰자료를 참고하고 작물보호 전문가의 확인을 권장합니다.",
        }
        profile = PEST_CLASS_LOOKUP.get(key, default)

    # 분류 DB가 Y여도 실제 천적 근거 행이 없으면 추천을 만들지 않습니다.
    # 대신 해충 통합관리 경로로 전환해 모든 항목에 근거 있는 대응을 제공합니다.
    if (
        str(profile.get("분류", "")).replace("\ufeff", "").strip() == "해충"
        and str(profile.get("천적추천대상", "N")).upper() == "Y"
        and not recommendations(key)
    ):
        profile = {
            **profile,
            "천적추천대상": "N",
        }

    return enrich_profile(profile)


def normalized_rows(frame: pd.DataFrame) -> pd.DataFrame:
    work = frame.copy()
    work["지표"] = work["병해충"].str.extract(r"\(([^)]*)\)", expand=False).fillna("발생값")
    work["정규화값"] = 0.0
    for _, indices in work.groupby("지표").groups.items():
        values = work.loc[indices, "발생값"]
        ceiling = float(values.quantile(0.95))
        if ceiling <= 0:
            ceiling = float(values.max())
        if ceiling > 0:
            work.loc[indices, "정규화값"] = (values / ceiling).clip(0, 1)
    return work


def recommendations(pest: str) -> list[dict]:
    key = clean_name(pest)
    match_keys = {key, key.split("-")[-1]}
    results: list[dict] = []

    for _, row in CUSTOM_ENEMIES.iterrows():
        targets = split_targets(row.get("대상병해충", ""))
        if match_keys.intersection(targets):
            results.append(
                {
                    "name": str(row.get("천적곤충명", "")),
                    "scientific_name": str(row.get("학명", "")),
                    "type": str(row.get("천적유형", "")),
                    "target": str(row.get("대상병해충", "")),
                    "usage": str(row.get("활용방법", "")),
                    "source": "맞춤 천적 DB",
                    "evidence_status": "검증 DB 직접 연결",
                    "application_level": "DB 등록 활용정보",
                }
            )

    known = {item["name"] for item in results}
    for _, row in OFFICIAL_ENEMIES.iterrows():
        targets = split_targets(row.get("대상해충", ""))
        name = str(row.get("한글명", ""))
        if match_keys.intersection(targets):
            results.append(
                {
                    "name": name,
                    "scientific_name": f"{row.get('속명', '')} {row.get('종명', '')}".strip(),
                    "type": str(row.get("과명", "")),
                    "target": str(row.get("대상해충", "")),
                    "usage": str(row.get("이용방법", "")),
                    "source": "농촌진흥청 천적곤충현황",
                    "evidence_status": "공식 현장 활용자료",
                    "application_level": "공식 활용정보",
                }
            )

            known = {item["name"] for item in results}
    pest_base = key.split("-")[-1]

    for _, row in EXPANDED_ENEMIES.iterrows():
        targets = split_targets(row.get("대상병해충", ""))
        enemy_name = str(row.get("천적곤충명", "")).strip()
        matched = False

        # 한 셀에 쉼표·슬래시로 기록된 여러 대상을 각각 비교합니다.
        # 카탈로그는 split_targets를 사용하면서 추천만 셀 전체를 비교하던
        # 불일치 때문에 생긴 '추천 대상인데 결과 없음' 상태를 막습니다.
        for target in targets:
            exact_match = pest_base == target
            group_match = target.endswith("류") and target[:-1] in pest_base

            # 뿌리응애는 일반 응애류 천적을 자동 추천하지 않음
            if target == "응애류" and "뿌리응애" in pest_base:
                group_match = False
            # 시설원예 잎굴파리류의 포괄 추천을 벼·보리 굴파리에 자동 적용하지 않음.
            # DB가 해당 종을 직접 명시한 exact_match는 유지합니다.
            if target == "잎굴파리류" and (
                "벼" in pest_base or "보리" in pest_base
            ):
                group_match = False

            if exact_match or group_match:
                matched = True
                break

        if matched and enemy_name and enemy_name not in known:
            application_level = str(row.get("적용수준", "")).strip()
            evidence_grade = str(row.get("근거등급", "")).strip()
            evidence_status = (
                "연구단계 후보"
                if "연구" in application_level or "후보" in application_level
                else "현장 활용 근거"
            )
            results.append(
                {
                    "name": enemy_name,
                    "scientific_name": str(row.get("학명", "")),
                    "type": str(row.get("천적유형", "")),
                    "target": str(row.get("대상병해충", "")),
                    "usage": str(row.get("이용방법", "")),
                    "source": (
                        f"{row.get('출처', '')} · "
                        f"{evidence_grade} · "
                        f"{application_level}"
                    ),
                    "evidence_status": evidence_status,
                    "application_level": application_level or "적용수준 미기재",
                }
            )
            known.add(enemy_name)

    return results




# ---------------------------------------------------------------------------
# NCPMS 2024·2026 연도 비교 데이터
# 기존 2026 시뮬레이션은 그대로 두고, 연도 비교 전용 데이터만 별도로 읽습니다.
# ---------------------------------------------------------------------------
def _load_year_observations(filename: str) -> pd.DataFrame:
    path = DATA_DIR / filename
    if not path.exists():
        return pd.DataFrame(
            columns=[
                "insectKey", "작물", "조사구분", "예찰구분", "조사연도",
                "조사회차", "병해충", "지역", "발생값", "병해충기본명",
            ]
        )
    frame = pd.read_csv(path, encoding="utf-8-sig")
    frame["병해충기본명"] = frame["병해충"].map(clean_name)
    frame["발생값"] = pd.to_numeric(frame["발생값"], errors="coerce").fillna(0.0)
    return frame


OBSERVATIONS_BY_YEAR = {
    2024: _load_year_observations("ncpms_SVC52_2024.csv"),
    2025: load_observations(2025),
    2026: _load_year_observations("ncpms_SVC52_2026.csv"),
}

FULL_PEST_CATALOG = {
    clean_name(value)
    for observations in OBSERVATIONS_BY_YEAR.values()
    for value in observations["병해충"].dropna().tolist()
    if clean_name(value)
} | KNOWN_ENEMY_TARGETS

REGION_UNIVERSE = sorted(
    {
        str(value)
        for observations in OBSERVATIONS_BY_YEAR.values()
        for value in observations["지역"].dropna().tolist()
        if str(value).strip()
    }
)


def pest_year_availability(crop: str | None = None) -> dict[str, list[int]]:
    """Return the survey years available for every catalog pest.

    Availability means that at least one survey row exists.  A row whose
    occurrence value is zero is still an observation and remains comparable.
    When a crop is supplied, availability is recalculated inside that crop.
    """
    pests_by_year: dict[int, set[str]] = {}
    for comparison_year, source in OBSERVATIONS_BY_YEAR.items():
        frame = source
        if crop and crop != "전체":
            frame = frame[frame["작물"] == crop]
        pests_by_year[comparison_year] = {
            str(value)
            for value in frame["병해충기본명"].dropna().tolist()
            if str(value).strip()
        }

    return {
        name: [
            comparison_year
            for comparison_year in sorted(OBSERVATIONS_BY_YEAR)
            if name in pests_by_year.get(comparison_year, set())
        ]
        for name in sorted(FULL_PEST_CATALOG)
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/summary")
def summary(year: int = Query(2026)) -> dict:
    observations = load_observations(year)
    research = research_summary()
    multiyear = research.get("multiyear_analysis", {})
    category_counts = PEST_CLASSES["분류"].value_counts().to_dict()

    return {
        "year": year,
        "observations": int(len(observations)),
        "crops": int(observations["작물"].nunique()),
        "pests": int(observations["병해충"].nunique()),
        "regions": int(observations["지역"].nunique()),
        "natural_enemies": NATURAL_ENEMY_TAXA_COUNT,
        "positive_observations": int((observations["발생값"] > 0).sum()),
        "total_evidence_rows": int(research.get("total_evidence_rows", 0) or 0),
        "multiyear_analysis_units": int(multiyear.get("analysis_unit_rows", 0) or 0),
        "common_three_year_units": int(multiyear.get("common_three_year_units", 0) or 0),
        "backtest_mae_2026": multiyear.get("selected_mae"),
        "backtest_mae_ci95": multiyear.get("selected_mae_ci95", []),
        "forecast_model": multiyear.get("selected_model_name"),
        "source_years": sorted(int(item) for item in multiyear.get("year_status", {}).keys()),
        "year_status": multiyear.get("year_status", {}),
        "research_status": multiyear.get("status", research.get("status", "not_available")),
        "pest_categories": {
            category: int(category_counts.get(category, 0))
            for category in ["해충", "병해", "바이러스", "선충", "기타"]
        },
    }


@app.get("/api/compare")
def compare() -> dict:
    data_2024 = load_observations(2024)
    data_2025 = load_observations(2025)
    data_2026 = load_observations(2026)

    return {
        "2024": {
            "observations": int(len(data_2024)),
            "crops": int(data_2024["작물"].nunique()),
            "pests": int(data_2024["병해충"].nunique()),
            "regions": int(data_2024["지역"].nunique()),
        },
        "2025": {
            "observations": int(len(data_2025)),
            "crops": int(data_2025["작물"].nunique()),
            "pests": int(data_2025["병해충"].nunique()),
            "regions": int(data_2025["지역"].nunique()),
            "year_status": "완전연도",
            "source": "승인 NCPMS SVC51·52 Stage 20 분석원장",
        },
        "2026": {
            "observations": int(len(data_2026)),
            "crops": int(data_2026["작물"].nunique()),
            "pests": int(data_2026["병해충"].nunique()),
            "regions": int(data_2026["지역"].nunique()),
        },
        "change": {
            "observations":
                int(len(data_2026)) - int(len(data_2024)),
            "crops":
                int(data_2026["작물"].nunique()) - int(data_2024["작물"].nunique()),
            "pests":
                int(data_2026["병해충"].nunique()) - int(data_2024["병해충"].nunique()),
            "regions":
                int(data_2026["지역"].nunique()) - int(data_2024["지역"].nunique()),
        }
    }

@app.get("/api/options")
def options(
    year: int = Query(2026),
    crop: str | None = Query(None),
    pest: str | None = Query(None),
) -> dict:
    observations = load_observations(year)
    filtered = observations.copy()

    if crop and crop != "전체":
        filtered = filtered[filtered["작물"] == crop]

    if pest and pest != "전체":
        pest_key = clean_name(pest)
        filtered = filtered[
            filtered["병해충"].map(clean_name) == pest_key
        ]

    categories = {
        name: str(pest_profile(name)["분류"])
        for name in FULL_PEST_CATALOG
    }
    pest_years = pest_year_availability(crop)
    comparable_pests = sorted(
        name
        for name, years in pest_years.items()
        if years == [2024, 2025, 2026]
    )

    category_order = ["해충", "병해", "바이러스", "선충", "기타"]

    return {
        "year": year,
        "crops": sorted(
            observations["작물"].dropna().unique().tolist()
        ),
        "regions": sorted(
            filtered["지역"].dropna().unique().tolist()
        ),
        "pests": sorted(FULL_PEST_CATALOG),
        "pest_years": pest_years,
        "comparable_pests": comparable_pests,
        "comparison_priority_rule": (
            "같은 병해충 기본명이 2024·2025·2026 공식 예찰자료에 각각 1건 이상 있으면 "
            "3개년 비교 가능으로 우선 표시합니다. 발생값 0인 조사도 관측으로 포함합니다."
        ),
        "pest_categories": categories,
        "pest_groups": [
            {
                "category": category,
                "items": sorted(
                    name
                    for name in FULL_PEST_CATALOG
                    if categories.get(name) == category
                ),
            }
            for category in category_order
            if any(
                categories.get(name) == category
                for name in FULL_PEST_CATALOG
            )
        ],
    }

@app.post("/api/landscape-review")
def landscape_review(request: LandscapeRequest) -> dict:
    risk = simulate(year=2026, pest=request.pest, crop=request.crop, region=request.region)
    enemies = _natural_enemy_gate(request.pest, request.crop, recommendations(clean_name(request.pest)))
    return review_landscape(request, risk, enemies["recommendations"])


@app.post("/api/adoption-review")
def adoption_review(request: AdoptionRequest) -> dict:
    risk = simulate(year=2026, pest=request.pest, crop=request.crop, region=request.region)
    enemies = _natural_enemy_gate(request.pest, request.crop, recommendations(clean_name(request.pest)))
    candidates = enemies["recommendations"]
    selected = next((item for item in candidates if item.get("name") == request.enemy_name), None)
    if request.enemy_name is None and candidates:
        selected = candidates[0]
    evidence = evidence_track(selected, request.crop, request.pest, request.cultivation_mode, enemies.get("radar_focus"))
    result = evaluate_review(risk, evidence, request.field, request.economics)
    return {**result, "selected_condition": {"crop": request.crop, "pest": request.pest,
            "region": request.region, "cultivation_mode": request.cultivation_mode},
            "enemies": [{"name": item.get("name"), "scientific_name": item.get("scientific_name")} for item in candidates]}


@app.get("/api/simulate")
def simulate(
    year: int = Query(2026),
    pest: str = Query("담배거세미나방"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
) -> dict:
    observations = load_observations(year)

    key = clean_name(pest)
    profile = pest_profile(key)
    category = str(profile["분류"])
    natural_enemy_target = str(profile["천적추천대상"]).upper() == "Y"

    frame = observations[
        observations["병해충기본명"] == key
    ].copy()

    if crop and crop != "전체":
        frame = frame[frame["작물"] == crop]
    enemies = recommendations(key) if natural_enemy_target else []
    if frame.empty:
        return {
            "pest": pest,
            "crop": crop or "전체",
            "region": region or "전체",
            "has_observation": False,
            "category": category,
            "response_type": str(profile["대응유형"]),
            "is_natural_enemy_target": natural_enemy_target,
            "management_message": str(profile["관리안내"]),
            "management_steps": list(profile.get("관리단계", [])),
            "management_caution": str(profile.get("관리주의", "")),
            "management_evidence": str(profile.get("관리근거", "")),
            "message": f"현재 {year}년 NCPMS 예찰자료에는 직접 일치하는 관측값이 없습니다.",
            "risk_score": None,
            "risk_level": "자료 없음",
            "regions": [],
            "trend": [],
            "indicators": [],
            "recommendations": enemies,
        }

    work = normalized_rows(frame)
    region_scores = (
        work.groupby("지역", as_index=False)["정규화값"].mean().sort_values("정규화값", ascending=False)
    )
    region_scores["score"] = (region_scores["정규화값"] * 100).round().astype(int)

    selected_region = region if region in set(work["지역"]) else region_scores.iloc[0]["지역"]
    selected_score = int(region_scores.loc[region_scores["지역"] == selected_region, "score"].iloc[0])
    risk_level = "고위험" if selected_score >= 67 else "주의" if selected_score >= 34 else "관찰"

    trend = work.groupby("조사회차", as_index=False)["정규화값"].mean()
    trend["score"] = (trend["정규화값"] * 100).round().astype(int)

    return {
        "pest": pest,
        "crop": crop or "전체",
        "region": selected_region,
        "has_observation": True,
        "category": category,
        "response_type": str(profile["대응유형"]),
        "is_natural_enemy_target": natural_enemy_target,
        "management_message": str(profile["관리안내"]),
        "management_steps": list(profile.get("관리단계", [])),
        "management_caution": str(profile.get("관리주의", "")),
        "management_evidence": str(profile.get("관리근거", "")),
        "message": "서로 다른 조사 지표를 95백분위 기준으로 표준화한 상대 위험지수입니다.",
        "risk_score": selected_score,
        "risk_level": risk_level,
        "regions": [
            {"name": row["지역"], "score": int(row["score"])}
            for _, row in region_scores.iterrows()
        ],
        "trend": [
            {"round": int(row["조사회차"]), "score": int(row["score"])}
            for _, row in trend.iterrows()
        ],
        "indicators": sorted(frame["병해충"].dropna().unique().tolist()),
        "recommendations": enemies,
    }


@lru_cache(maxsize=32)
def _bootstrap_payload(year: int, crop: str, pest: str, region: str) -> dict:
    """Return the complete first-screen dataset in one verified response.

    The public site reaches this backend through Cloudflare Tunnel.  Keeping
    the initial read model in one endpoint removes repeated tunnel round trips,
    while the cache makes subsequent visitors reuse the same official result.
    """
    normalized_crop = crop or "전체"
    normalized_pest = pest or "복숭아순나방"
    normalized_region = region or "전체"

    payload = {
        "health": health(),
        "summary": summary(year),
        "options": options(year=year, crop=None, pest=None),
        "compare": compare(),
        "filtered_options": options(
            year=year,
            crop=None if normalized_crop == "전체" else normalized_crop,
            pest=None if normalized_pest == "전체" else normalized_pest,
        ),
        "simulation": simulate(
            year=year,
            pest=normalized_pest,
            crop=None if normalized_crop == "전체" else normalized_crop,
            region=None if normalized_region == "전체" else normalized_region,
        ),
        "errors": {},
    }
    payload["complete"] = all(payload[key] is not None for key in (
        "health",
        "summary",
        "options",
        "compare",
        "filtered_options",
        "simulation",
    ))
    return payload


@app.get("/api/bootstrap")
def bootstrap(
    year: int = Query(2026),
    crop: str = Query("복숭아"),
    pest: str = Query("복숭아순나방"),
    region: str = Query("전체"),
) -> dict:
    """Load every dataset required by the first screen with one API call."""
    return _bootstrap_payload(year, crop, pest, region)


@app.on_event("startup")
def warm_initial_bootstrap_cache() -> None:
    """Precompute the real first-screen and judge-path datasets before public traffic arrives."""
    _bootstrap_payload(2026, "복숭아", "복숭아순나방", "전체")
    for crop, pest, region in (
        ("복숭아", "복숭아순나방", "전체"),
        ("고추", "점박이응애", "전체"),
    ):
        _forecast_2027_cached(pest, crop, region)
        _judge_impact_cached(pest, crop, region, "전체")


def _year_comparison_item(
    year: int,
    pest: str,
    crop: str | None,
    region: str | None,
) -> dict:
    source = OBSERVATIONS_BY_YEAR.get(year)
    key = clean_name(pest)
    explicit_region = bool(region and region != "전체")

    if source is None or source.empty:
        return {
            "year": year,
            "has_observation": False,
            "risk_score": None,
            "risk_level": "자료 없음",
            "observations": 0,
            "positive_observations": 0,
            "region": region if explicit_region else "자료 없음",
        }

    if "병해충기본명" in source.columns:
        frame = source[source["병해충기본명"] == key].copy()
    else:
        frame = source[source["병해충"].map(clean_name) == key].copy()

    if crop and crop != "전체":
        frame = frame[frame["작물"] == crop]

    if frame.empty:
        return {
            "year": year,
            "has_observation": False,
            "risk_score": None,
            "risk_level": "자료 없음",
            "observations": 0,
            "positive_observations": 0,
            "region": region if explicit_region else "자료 없음",
        }

    work = normalized_rows(frame)
    region_scores = (
        work.groupby("지역", as_index=False)["정규화값"]
        .mean()
        .sort_values("정규화값", ascending=False)
    )
    region_scores["score"] = (region_scores["정규화값"] * 100).round().astype(int)

    selected_region = str(region) if explicit_region else str(region_scores.iloc[0]["지역"])
    selected_rows = region_scores[region_scores["지역"] == selected_region]
    if selected_rows.empty:
        return {
            "year": year,
            "has_observation": False,
            "risk_score": None,
            "risk_level": "자료 없음",
            "observations": 0,
            "positive_observations": 0,
            "region": selected_region,
        }

    selected_score = int(selected_rows.iloc[0]["score"])
    selected_frame = frame[frame["지역"] == selected_region]

    risk_level = "고위험" if selected_score >= 67 else "주의" if selected_score >= 34 else "관찰"
    return {
        "year": year,
        "has_observation": True,
        "risk_score": selected_score,
        "risk_level": risk_level,
        "observations": int(len(selected_frame)),
        "positive_observations": int((selected_frame["발생값"] > 0).sum()),
        "region": selected_region,
    }


@app.get("/api/year-comparison")
def year_comparison(
    pest: str = Query(...),
    crop: str | None = Query(None),
    region: str | None = Query(None),
) -> dict:
    items = [
        _year_comparison_item(2024, pest, crop, region),
        _year_comparison_item(2025, pest, crop, region),
        _year_comparison_item(2026, pest, crop, region),
    ]
    scores = {item["year"]: item["risk_score"] for item in items}

    delta = None
    direction = "비교 자료 부족"
    if scores[2024] is not None and scores[2026] is not None:
        delta = int(scores[2026] - scores[2024])
        direction = "증가" if delta > 0 else "감소" if delta < 0 else "변화 없음"

    return {
        "pest": pest,
        "crop": crop or "전체",
        "region": region or "전체",
        "year_comparison": items,
        "comparison_delta": delta,
        "comparison_direction": direction,
        "source_years": [2024, 2025, 2026],
        "note": "각 연도 안에서 조사 지표를 95백분위 기준으로 표준화한 상대 위험지수입니다.",
        "source": "승인 NCPMS SVC51·52 2024·2025·2026 예찰자료",
    }


def _region_risk_stats(
    year: int,
    pest: str,
    crop: str | None,
) -> dict[str, dict]:
    source = OBSERVATIONS_BY_YEAR.get(year)
    if source is None or source.empty:
        return {}

    key = clean_name(pest)
    frame = source[source["병해충기본명"] == key].copy()
    if crop and crop != "전체":
        frame = frame[frame["작물"] == crop]
    if frame.empty:
        return {}

    work = normalized_rows(frame)
    grouped = work.groupby("지역", as_index=False).agg(
        relative_risk=("정규화값", "mean"),
        observations=("발생값", "size"),
        positive_observations=("발생값", lambda values: int((values > 0).sum())),
    )
    grouped["score"] = (grouped["relative_risk"] * 100).round().astype(int)

    return {
        str(row["지역"]): {
            "score": int(row["score"]),
            "observations": int(row["observations"]),
            "positive_observations": int(row["positive_observations"]),
        }
        for _, row in grouped.iterrows()
    }


@app.get("/api/region-risk-comparison")
def region_risk_comparison(
    pest: str = Query(...),
    crop: str | None = Query(None),
) -> dict:
    stats_2024 = _region_risk_stats(2024, pest, crop)
    stats_2026 = _region_risk_stats(2026, pest, crop)

    regions = []
    for name in REGION_UNIVERSE:
        item_2024 = stats_2024.get(name)
        item_2026 = stats_2026.get(name)
        score_2024 = item_2024["score"] if item_2024 else None
        score_2026 = item_2026["score"] if item_2026 else None
        delta = (
            int(score_2026 - score_2024)
            if score_2024 is not None and score_2026 is not None
            else None
        )

        regions.append(
            {
                "name": name,
                "score_2024": score_2024,
                "score_2026": score_2026,
                "delta": delta,
                "observations_2024": item_2024["observations"] if item_2024 else 0,
                "observations_2026": item_2026["observations"] if item_2026 else 0,
                "positive_observations_2024": (
                    item_2024["positive_observations"] if item_2024 else 0
                ),
                "positive_observations_2026": (
                    item_2026["positive_observations"] if item_2026 else 0
                ),
            }
        )

    return {
        "pest": pest,
        "crop": crop or "전체",
        "years": [2024, 2026],
        "regions": regions,
        "note": "각 연도 안에서 조사 지표를 95백분위 기준으로 표준화한 지역별 상대 위험지수입니다.",
        "source": "NCPMS SVC52 2024·2026 예찰자료",
    }


# ---------------------------------------------------------------------------
# 2027 상대 위험 전망
# 실제 관측·발생확률과 구분되는 보수적 추세 전망 전용 API입니다.
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def _forecast_data() -> pd.DataFrame:
    spatiotemporal_forecast = load_spatiotemporal_forecast()
    if not spatiotemporal_forecast.empty:
        return spatiotemporal_forecast
    weather_forecast = load_weather_forecast()
    if not weather_forecast.empty:
        return weather_forecast
    if not FORECAST_PATH.exists():
        return generate_forecast_csv()
    return pd.read_csv(FORECAST_PATH, encoding="utf-8-sig")


@lru_cache(maxsize=1)
def _forecast_validation() -> dict:
    return {
        "ncpms": validate_source_data(),
        "references": validate_reference_data(),
        "weather_stage5": load_stage5_validation(),
        "research_stage6": load_stage6_validation(),
        "spatiotemporal_stage7": spatiotemporal_validation_summary(),
    }


def _weighted_forecast_value(frame: pd.DataFrame, column: str) -> int | None:
    available = frame[frame[column].notna()].copy()
    if available.empty:
        return None
    weights = available["관측수"].astype(float).clip(lower=1)
    return int(round(float((available[column].astype(float) * weights).sum() / weights.sum())))


def _weighted_forecast_float(
    frame: pd.DataFrame,
    column: str,
    digits: int = 3,
) -> float | None:
    if column not in frame.columns:
        return None
    available = frame[frame[column].notna()].copy()
    if available.empty:
        return None
    weights = available["관측수"].astype(float).clip(lower=1)
    value = float((available[column].astype(float) * weights).sum() / weights.sum())
    return round(value, digits)


def _conservative_confidence(values: pd.Series) -> str:
    order = {"낮음": 0, "보통": 1, "높음": 2}
    labels = [str(value) for value in values.dropna()]
    return min(labels, key=lambda value: order.get(value, 0)) if labels else "낮음"


def _forecast_trend(score_2026: int | None, score_2027: int | None) -> str:
    if score_2026 is None or score_2027 is None:
        return "전망자료 부족"
    delta = score_2027 - score_2026
    return "증가" if delta >= 5 else "감소" if delta <= -5 else "유지"


def _forecast_risk_level(score: int | None) -> str:
    if score is None:
        return "전망자료 부족"
    return "고위험" if score >= 67 else "주의" if score >= 34 else "관찰"


def _forecast_region_rankings(frame: pd.DataFrame) -> list[dict]:
    rankings: list[dict] = []
    for region_name, region_frame in frame.groupby("지역"):
        score_2027 = _weighted_forecast_value(region_frame, "전망위험도_2027")
        if score_2027 is None:
            continue
        score_2024 = _weighted_forecast_value(region_frame, "위험도_2024")
        score_2026 = _weighted_forecast_value(region_frame, "위험도_2026")
        rankings.append(
            {
                "region": str(region_name),
                "score_2024": score_2024,
                "score_2026": score_2026,
                "forecast_score": score_2027,
                "trend": _forecast_trend(score_2026, score_2027),
                "confidence": _conservative_confidence(region_frame["신뢰도"]),
                "observation_count": int(region_frame["관측수"].sum()),
                "risk_level": _forecast_risk_level(score_2027),
            }
        )
    return sorted(
        rankings,
        key=lambda item: (item["forecast_score"], item["observation_count"]),
        reverse=True,
    )


def _forecast_management(
    pest: str,
    forecast_score: int | None,
) -> dict:
    profile = pest_profile(pest)
    category = str(profile.get("분류", "기타")).replace("\ufeff", "").strip()
    risk_level = _forecast_risk_level(forecast_score)
    level_steps = {
        "관찰": "정기 예찰과 예방관리를 유지하고 조사 결과를 누적 기록합니다.",
        "주의": "예찰주기를 단축하고 초기 방제 준비와 전문가 확인 시점을 점검합니다.",
        "고위험": "전문가 진단을 우선하고 해당 작물·대상에 등록된 방제수단을 검토합니다.",
        "전망자료 부족": "비교 가능한 예찰자료를 추가 확보하기 전에는 수치 전망으로 방제 강도를 결정하지 않습니다.",
    }
    management_steps = [level_steps[risk_level], *list(profile.get("관리단계", []))]
    natural_enemies = (
        recommendations(pest)
        if category == "해충" and str(profile.get("천적추천대상", "N")).upper() == "Y"
        else []
    )
    profile_caution = str(profile.get("관리주의", "")).strip()
    caution = " ".join(
        part
        for part in [MODEL_LIMITATION_WEATHER, profile_caution]
        if part
    )
    return {
        "category": category,
        "risk_level": risk_level,
        "management_type": f"{risk_level} · {profile.get('대응유형', '전문가 확인')}",
        "management_steps": management_steps,
        "management_caution": caution,
        "recommendations": natural_enemies,
    }


def _forecast_2027_uncached(
    pest: str = Query("벼물바구미"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
) -> dict:
    data = _forecast_data()
    pest_key = clean_name(pest)
    selected = data[data["병해충"].map(clean_name) == pest_key].copy()
    if crop and crop != "전체":
        selected = selected[selected["작물"] == crop]
    rankings_source = selected.copy()
    if region and region != "전체":
        selected = selected[selected["지역"] == region]

    score_2024 = _weighted_forecast_value(selected, "위험도_2024")
    score_2026 = _weighted_forecast_value(selected, "위험도_2026")
    score_2027 = _weighted_forecast_value(selected, "전망위험도_2027")
    score_2025 = None
    research = research_context(pest_key, crop, region)
    multiyear = research.get("multiyear_analysis", {})
    multiyear_series = {
        int(item.get("year")): item.get("score")
        for item in multiyear.get("series", [])
        if item.get("year") is not None
    }
    if multiyear.get("condition_available") and multiyear_series:
        score_2024 = int(round(multiyear_series[2024])) if multiyear_series.get(2024) is not None else score_2024
        score_2025 = int(round(multiyear_series[2025])) if multiyear_series.get(2025) is not None else None
        score_2026 = int(round(multiyear_series[2026])) if multiyear_series.get(2026) is not None else score_2026
        score_2027 = int(round(multiyear_series[2027])) if multiyear_series.get(2027) is not None else score_2027
    weather_support_index = _weighted_forecast_float(selected, "기상일치지수")
    weather_adjustment = _weighted_forecast_float(selected, "기상근거보정", digits=1)
    trend = _forecast_trend(score_2026, score_2027)
    confidence = _conservative_confidence(selected["신뢰도"]) if not selected.empty else "낮음"
    observation_count = int(selected["관측수"].sum()) if not selected.empty else 0
    if multiyear.get("condition_available"):
        confidence = str(multiyear.get("confidence", "낮음"))
        observation_count = sum(int(item.get("source_rows", 0) or 0) for item in multiyear.get("series", []) if item.get("year") != 2027)
    source_years = sorted(
        {
            int(year)
            for value in selected["근거연도"].dropna().astype(str)
            for year in re.findall(r"2024|2026", value)
        }
    ) if not selected.empty else []
    if multiyear.get("condition_available"):
        source_years = [2024, 2025, 2026]
    management = _forecast_management(pest_key, score_2027)
    weather = weather_context(pest_key, crop, region)
    spatiotemporal = spatiotemporal_validation_summary()
    available = score_2027 is not None
    basis_samples = selected["전망근거"].dropna().astype(str).unique().tolist()
    if available:
        confidence_reason = (
            basis_samples[0]
            if len(selected) == 1 and basis_samples
            else (
                f"선택 범위 {len(selected)}개 작물·지역 조합의 전망을 관측수로 가중 집계하고, "
                f"포함 조합 중 가장 보수적인 신뢰도인 '{confidence}'을 적용했습니다."
            )
        )
        forecast_message = (
            f"2027 상대 위험 전망 점수는 {score_2027}점이며 2026년 대비 {trend} 신호입니다. "
            "실제 발생 확률이나 확정 관측값이 아닙니다."
        )
    else:
        confidence_reason = (
            basis_samples[0]
            if basis_samples
            else "선택 조건과 일치하는 양년 공통 조사단위가 없습니다."
        )
        forecast_message = INSUFFICIENT_MESSAGE

    return {
        "forecast_year": 2027,
        "pest": pest,
        "crop": crop or "전체",
        "region": region or "전체",
        "category": management["category"],
        "has_forecast": available,
        "score_2024": score_2024,
        "score_2025": score_2025,
        "score_2026": score_2026,
        "forecast_score": score_2027,
        "trend": trend,
        "risk_level": management["risk_level"],
        "confidence": confidence,
        "confidence_reason": confidence_reason,
        "source_years": source_years,
        "observation_count": observation_count,
        "forecast_message": forecast_message,
        "forecast_basis": (
            multiyear.get("summary", {}).get("selection_rule")
            if multiyear.get("condition_available")
            else (basis_samples[0] if len(basis_samples) == 1 else forecast_summary(data)["model"])
        ),
        "model_version": (
            "F27-3Y-BT1"
            if multiyear.get("condition_available")
            else (
                str(selected["모델버전"].dropna().iloc[0])
                if not selected.empty and "모델버전" in selected.columns and selected["모델버전"].notna().any()
                else "F27 기본 완화추세"
            )
        ),
        "weather_data_status": weather["weather_data_status"],
        "weather_support_index": weather_support_index,
        "weather_adjustment": weather_adjustment,
        "weather_relationships": weather["weather_relationships"],
        "monthly_outlook": weather["monthly_outlook"],
        "monthly_available_count": weather.get("monthly_available_count", 0),
        "weather_note": weather["weather_note"],
        "weather_source": weather.get("weather_source", ""),
        "aws_minute_archive": aws_minute_archive_status(),
        "research_evidence": research,
        "spatiotemporal_validation": spatiotemporal,
        "forecast_limitations": MODEL_LIMITATION_WEATHER,
        "disclaimer": multiyear.get("disclaimer") if multiyear.get("condition_available") else FORECAST_DISCLAIMER,
        "management_type": management["management_type"],
        "management_steps": management["management_steps"],
        "management_caution": management["management_caution"],
        "recommendations": management["recommendations"],
        "comparison_series": [
            {"year": 2024, "kind": "실제 예찰", "score": score_2024},
            {"year": 2025, "kind": "실제 예찰", "score": score_2025},
            {"year": 2026, "kind": "실제 예찰", "score": score_2026},
            {"year": 2027, "kind": "상대 위험 전망", "score": score_2027},
        ],
        "region_rankings": multiyear.get("region_rankings") or _forecast_region_rankings(rankings_source),
        "source": f"NCPMS SVC51·52 2024·2025·2026 예찰자료 / 기상청 APIHub ASOS·해양·예특보·융합·세계·산업특화 / {stage7_source_path() or stage5_source_path()}",
    }


@lru_cache(maxsize=128)
def _forecast_2027_cached(
    pest: str,
    crop: str | None,
    region: str | None,
) -> dict:
    """Reuse an immutable forecast result for repeated public-screen requests."""
    return _forecast_2027_uncached(pest=pest, crop=crop, region=region)


@app.get("/api/forecast/2027")
def forecast_2027(
    pest: str = Query("벼물바구미"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
) -> dict:
    return _forecast_2027_cached(pest, crop, region)


@app.get("/api/forecast/2027/summary")
def forecast_2027_summary() -> dict:
    data = _forecast_data()
    research = research_summary()
    multiyear = research.get("multiyear_analysis", {})
    legacy_summary = forecast_summary(data)
    if multiyear.get("status") == "complete":
        legacy_summary["model"] = {
            "selected": multiyear.get("selected_model_name"),
            "selected_code": multiyear.get("selected_model"),
            "baselines": ["최근연도 유지", "3개년 가중수준", "완화된 추세"],
            "selection_reason": multiyear.get("selection_rule"),
            "validation": (
                f"2024·2025년만으로 2026년을 가린 블라인드 백테스트, "
                f"엄격 공통단위 {int(multiyear.get('common_three_year_units', 0) or 0):,}개, "
                f"MAE {multiyear.get('selected_mae')}"
            ),
        }
        legacy_summary["disclaimer"] = (
            "2027년 값은 NCPMS 2024·2025 완전연도와 2026 부분연도의 동일 조사단위를 "
            "백테스트한 데이터 기반 상대 위험 전망이며 실제 발생확률 또는 확정 발생값이 아닙니다."
        )
        legacy_summary["limitation"] = (
            "2026년은 부분연도이며 외부 농가 전향 실증 전 단계입니다. 자료 없음은 실제 0으로 "
            "대체하지 않았고, 모델 선택은 2026 재현오차와 단순성 우선 규칙을 따릅니다."
        )
        legacy_summary["analysis_scope"] = {
            "source_years": [2024, 2025, 2026],
            "year_status": multiyear.get("year_status", {}),
            "analysis_unit_rows": multiyear.get("analysis_unit_rows", 0),
            "common_three_year_units": multiyear.get("common_three_year_units", 0),
            "bootstrap_repeats": multiyear.get("bootstrap_repeats", 0),
            "mae_ci95": multiyear.get("selected_mae_ci95", []),
        }
    return {
        "forecast_year": 2027,
        "csv": stage7_source_path() or stage5_source_path(),
        **legacy_summary,
        "data_validation": _forecast_validation(),
        "research_summary": research,
        "spatiotemporal_validation": spatiotemporal_validation_summary(),
    }


def _judge_impact_uncached(
    pest: str = Query("복숭아순나방"),
    crop: str | None = Query("복숭아"),
    region: str | None = Query(None),
    cultivation_mode: str = Query("전체"),
    refresh: bool = Query(False),
) -> dict:
    """Return a one-minute, evidence-gated walkthrough for judges and field users."""
    if refresh:
        clear_decision_cache()
        clear_research_cache()
        clear_work_safety_cache()
        clear_smartfarm_evidence_cache()
    forecast = forecast_2027(pest=pest, crop=crop, region=region)
    smartfarm = smartfarm_evidence(crop=crop or "전체", region=region or "전체")
    research = research_context(clean_name(pest), crop, region)
    summary_data = research.get("summary", {})
    multiyear = research.get("multiyear_analysis", {})
    decision = decision_context(
        pest=clean_name(pest),
        crop=crop or "전체",
        region=region or "전체",
        cultivation_mode=cultivation_mode,
        forecast_score=forecast.get("forecast_score"),
        risk_level=forecast.get("risk_level", "자료 부족"),
        confidence=forecast.get("confidence", "낮음"),
        recommendations=forecast.get("recommendations", []),
        management_steps=forecast.get("management_steps", []),
        management_caution=forecast.get("management_caution", ""),
        weather_support_index=forecast.get("weather_support_index"),
    )
    enemy = decision.get("natural_enemy", {})
    enemy_focus = enemy.get("radar_focus", {})
    safety = decision.get("safety", {})
    relative_exposure = safety.get("relative_exposure", {})
    pesticide = decision.get("pesticide", {})
    district = decision.get("district_network", {})
    gates = decision.get("decision_gates", [])
    ready_gates = sum(1 for gate in gates if gate.get("ready"))
    # This endpoint receives no economics or verified field gates.
    release_state = "자료 부족"
    strict_units = int(multiyear.get("summary", {}).get("common_three_year_units", 0) or 0)
    selected_mae = multiyear.get("summary", {}).get("selected_mae")
    total_evidence = int(summary_data.get("total_evidence_rows", 0) or 0)
    stages = [
        {
            "id": "evidence",
            "number": "01",
            "title": "근거 잠금",
            "state": "검증 통과" if strict_units else "자료 확인 필요",
            "headline": f"3개년 엄격 공통단위 {strict_units:,}개",
            "detail": f"총 {total_evidence:,}개 근거행에서 실제 0과 결측을 분리했습니다.",
            "tone": "green" if strict_units else "gray",
        },
        {
            "id": "backtest",
            "number": "02",
            "title": "2026 블라인드 재현",
            "state": "내부 후향검증",
            "headline": f"MAE {selected_mae:.2f}" if isinstance(selected_mae, (int, float)) else "조건별 검증자료 부족",
            "detail": "2024·2025년만 보고 2026년을 재현했으며, 실제 발생확률이 아닌 상대위험 오차입니다.",
            "tone": "blue" if isinstance(selected_mae, (int, float)) else "gray",
        },
        {
            "id": "smartfarm",
            "number": "03",
            "title": "스마트팜 작기 맥락",
            "state": (smartfarm.get("selected_condition") or {}).get("data_status", "자료 확인 필요"),
            "headline": (
                f"선택 조건 {(smartfarm.get('selected_condition') or {}).get('matched_seasons', 0):,}작기 · "
                f"전체 {(smartfarm.get('official_summary') or {}).get('farm_season_rows', 0):,}작기"
            ),
            "detail": (
                "공식 작기 시작·종료월로 생육단계와 센서 확인 시점을 좁히되, "
                "동일 필지키나 대조시험 없이 방사일·방제효과를 자동 확정하지 않습니다."
            ),
            "tone": "green" if smartfarm.get("available") else "gray",
        },
        {
            "id": "forecast",
            "number": "04",
            "title": "2027 위험 신호",
            "state": forecast.get("risk_level", "자료 부족"),
            "headline": (
                f"{forecast.get('forecast_score')}점 · {forecast.get('trend', '유지')}"
                if forecast.get("forecast_score") is not None
                else "전망자료 부족"
            ),
            "detail": forecast.get("forecast_message", forecast.get("disclaimer", "")),
            "tone": "red" if forecast.get("risk_level") == "고위험" else "orange" if forecast.get("risk_level") == "주의" else "green",
        },
        {
            "id": "release",
            "number": "05",
            "title": "천적 도입 타당성 근거",
            "state": release_state,
            "headline": (
                f"{enemy_focus.get('ready_gate_count', 0)}/{enemy_focus.get('total_gate_count', 5)}개 천적 근거 관문 점등"
                if enemy_focus.get("selected_condition_applicable")
                else f"공식 효과 참고사례 · {enemy_focus.get('enemy_name', '근거 탐색 중')}"
            ),
            "detail": enemy_focus.get("interpretation") or enemy.get("caution", "검증된 대상해충·이용조건·현장환경을 함께 확인합니다."),
            "tone": "green" if enemy_focus.get("release_ready") else "orange" if enemy_focus.get("available") else "gray",
        },
        {
            "id": "action",
            "number": "06",
            "title": "현장·행정 실행",
            "state": "실행팩 준비",
            "headline": f"시군구 {int(district.get('district_count', 0) or 0)}곳 · 등록농약 {int(pesticide.get('matched_rows', 0) or 0):,}건",
            "detail": "예찰·물리·생물·등록농약·농작업 안전을 한 번에 내보낼 수 있습니다.",
            "tone": "blue",
        },
    ]
    return {
        "status": "complete",
        "selected_condition": {
            "pest": pest,
            "crop": crop or "전체",
            "region": region or "전체",
            "cultivation_mode": cultivation_mode,
        },
        "stages": stages,
        "natural_enemy_focus": enemy_focus,
        "smartfarm_context": {
            "available": smartfarm.get("available", False),
            "coverage": (smartfarm.get("source") or {}).get("coverage"),
            "official_farms": (smartfarm.get("official_summary") or {}).get("farm_count", 0),
            "official_seasons": (smartfarm.get("official_summary") or {}).get("farm_season_rows", 0),
            "selected_seasons": (smartfarm.get("selected_condition") or {}).get("matched_seasons", 0),
            "busiest_start_month": (smartfarm.get("timing_context") or {}).get("busiest_start_month"),
            "request_count": (smartfarm.get("collection_validation") or {}).get("requests", 0),
            "request_failures": (smartfarm.get("collection_validation") or {}).get("failure", 0),
            "claim_boundary": smartfarm.get("claim_boundary", {}),
        },
        "headline_metrics": {
            "total_evidence_rows": total_evidence,
            "analysis_unit_rows": int(multiyear.get("summary", {}).get("analysis_unit_rows", 0) or 0),
            "common_three_year_units": strict_units,
            "backtest_mae": selected_mae,
            "backtest_mae_ci95": multiyear.get("summary", {}).get("selected_mae_ci95", []),
            "forecast_score": forecast.get("forecast_score"),
            "forecast_level": forecast.get("risk_level"),
            "release_state": release_state,
            "ready_gates": ready_gates,
            "total_gates": len(gates),
            "relative_safety_signal": relative_exposure.get("latest", {}).get("work_adjustment_signal"),
            "relative_safety_score": relative_exposure.get("latest", {}).get("relative_exposure_score"),
            "smartfarm_seasons": (smartfarm.get("official_summary") or {}).get("farm_season_rows", 0),
            "smartfarm_selected_seasons": (smartfarm.get("selected_condition") or {}).get("matched_seasons", 0),
        },
        "economic_scenario": {
            "status": "interactive_ready",
            "formula": FORMULAS["net"],
            "formulas": FORMULAS,
            "required_inputs": list(AdoptionRequest.model_fields["economics"].annotation.model_fields),
            "interpretation": DISCLAIMER,
        },
        "prospective_validation": {
            "status": "collection_protocol_ready",
            "design": "동일 작물·병해충·재배유형에서 천적 투입군과 무처리 또는 표준관리 비교군을 사전 등록",
            "minimum_fields": [
                "공개농가ID", "조사일", "시도", "시군구", "작물", "병해충", "재배유형",
                "시험군", "천적명", "방사량", "방사횟수", "투입전밀도", "투입후밀도",
                "농약사용비", "천적비", "추가예찰비", "수확량", "관찰자", "사진해시",
            ],
            "claim_rule": "처리·대조군, 사전 밀도, 반복, 비용·수량과 교란요인을 검토한 뒤 시험조건 내 효과를 평가합니다. 입력행 확보만으로 인과효과를 확정하지 않습니다.",
            "protocols": [
                {
                    "id": "natural_enemy_trial",
                    "label": "천적 처리·대조 실증",
                    "filename": "공생AI_천적_처리대조_사전등록.csv",
                    "design": "동일 작물·병해충·재배유형에서 천적 투입군과 무처리 또는 표준관리 비교군을 사전 등록",
                    "fields": [
                        "공개농가ID", "조사일", "시도", "시군구", "작물", "병해충", "재배유형",
                        "시험군", "천적명", "방사량", "방사횟수", "투입전밀도", "투입후밀도",
                        "농약사용비", "천적비", "추가예찰비", "수확량", "관찰자", "사진해시",
                    ],
                },
                {
                    "id": "field_linkage",
                    "label": "익명 필지 공통키",
                    "filename": "공생AI_익명필지_연결대장.csv",
                    "design": "개인정보를 제외한 연구용 익명 농가·필지키로 NCPMS·스마트팜·토양·기상 관찰을 전향 연결",
                    "fields": [
                        "공개농가ID", "익명필지ID", "PNU_공개가능시", "시도", "시군구", "읍면동",
                        "작물", "재배유형", "시설유형", "작기ID", "관측시작일", "관측종료일",
                        "NCPMS관측ID", "스마트팜시설ID", "토양검정ID", "위치공개수준", "동의상태",
                    ],
                },
                {
                    "id": "machinery_exposure",
                    "label": "농기계 노출분모",
                    "filename": "공생AI_농기계_노출분모_사전등록.csv",
                    "design": "사고 건수만이 아니라 기계별 실제 작업시간·경사·기상·보호조치를 함께 기록해 노출분모를 확보",
                    "fields": [
                        "공개농가ID", "익명작업ID", "작업일", "작업시작시각", "작업종료시각", "시도", "시군구",
                        "농기계종류", "작업유형", "작업시간_분", "경사도_구간", "노면상태", "강수상태",
                        "풍속구간", "조도구간", "보호구", "동승자", "안전점검완료", "이상징후", "사고발생여부",
                    ],
                },
            ],
        },
        "claim_boundary": {
            "accident_probability": False,
            "causal_effect": False,
            "external_validation_complete": False,
            "message": "현재는 검증된 상대위험·상대노출·현장 의사결정 기능이며 확률·인과효과·외부실증 결과로 과장하지 않습니다.",
        },
        "source": "NCPMS 2024·2025·2026, KMA APIHub, KOSHA, 공식 천적·농약·스마트팜·KOSIS 근거",
    }


@lru_cache(maxsize=128)
def _judge_impact_cached(
    pest: str,
    crop: str | None,
    region: str | None,
    cultivation_mode: str,
) -> dict:
    """Reuse the fully verified 60-second judge path for identical conditions."""
    return _judge_impact_uncached(
        pest=pest,
        crop=crop,
        region=region,
        cultivation_mode=cultivation_mode,
        refresh=False,
    )


@app.get("/api/analysis/judge-impact")
def judge_impact(
    pest: str = Query("복숭아순나방"),
    crop: str | None = Query("복숭아"),
    region: str | None = Query(None),
    cultivation_mode: str = Query("전체"),
    refresh: bool = Query(False),
) -> dict:
    if refresh:
        _forecast_2027_cached.cache_clear()
        _judge_impact_cached.cache_clear()
        return _judge_impact_uncached(
            pest=pest,
            crop=crop,
            region=region,
            cultivation_mode=cultivation_mode,
            refresh=True,
        )
    return _judge_impact_cached(pest, crop, region, cultivation_mode)


@app.get("/api/smartfarm/evidence")
def get_smartfarm_evidence(
    crop: str | None = Query(None),
    region: str | None = Query(None),
    refresh: bool = Query(False),
) -> dict:
    """Return traceable SmartFarm Korea crop-season evidence without exposing credentials."""
    if refresh:
        clear_smartfarm_evidence_cache()
    return smartfarm_evidence(crop=crop or "전체", region=region or "전체")


@app.get("/api/decision-support")
def integrated_decision_support(
    pest: str = Query("벼물바구미"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
    cultivation_mode: str = Query("전체"),
    refresh: bool = Query(False),
) -> dict:
    """Return an evidence-gated field and policy action console."""
    if refresh:
        clear_decision_cache()
    forecast = forecast_2027(pest=pest, crop=crop, region=region)
    return decision_context(
        pest=clean_name(pest),
        crop=crop or "전체",
        region=region or "전체",
        cultivation_mode=cultivation_mode,
        forecast_score=forecast["forecast_score"],
        risk_level=forecast["risk_level"],
        confidence=forecast["confidence"],
        recommendations=forecast["recommendations"],
        management_steps=forecast["management_steps"],
        management_caution=forecast["management_caution"],
        weather_support_index=forecast["weather_support_index"],
    )


@app.get("/api/manual/field-action")
def field_action_manual(
    pest: str = Query("벼물바구미"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
    cultivation_mode: str = Query("전체"),
    refresh: bool = Query(False),
) -> dict:
    """Return a large-text field manual derived from validated decision evidence."""
    decision = integrated_decision_support(
        pest=pest,
        crop=crop,
        region=region,
        cultivation_mode=cultivation_mode,
        refresh=refresh,
    )
    return build_field_manual(decision)


@app.get("/api/pesticides/registered")
def registered_pesticides(
    pest: str = Query("전체"),
    crop: str = Query("전체"),
    mode_of_action: str = Query(""),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    refresh: bool = Query(False),
) -> dict:
    """Return official pesticide registrations without auto-prescribing a product."""
    if refresh:
        clear_decision_cache()
    return pesticide_catalogue(
        pest=clean_name(pest),
        crop=crop or "전체",
        mode_of_action=mode_of_action,
        limit=limit,
        offset=offset,
    )


@app.get("/api/pesticides/registered/{registration_number}")
def registered_pesticide_detail(
    registration_number: str,
    refresh: bool = Query(False),
) -> dict:
    """Return one official pesticide registration as a digital product passport."""
    if refresh:
        clear_decision_cache()
    return pesticide_product_detail(registration_number)


@app.get("/api/safety/work-risk")
def work_safety_risk(
    region: str = Query("전체"),
    year: int | None = Query(None, ge=2024, le=2027),
    month: int | None = Query(None, ge=1, le=12),
    refresh: bool = Query(False),
) -> dict:
    """Return an ASOS-based relative work exposure signal, never an accident probability."""
    if refresh:
        clear_work_safety_cache()
    return safety_risk_context(region=region or "전체", year=year, month=month)


@app.get("/api/forecast/2027/spatiotemporal-validation")
def forecast_2027_spatiotemporal_validation(refresh: bool = Query(False)) -> dict:
    """Return the audited six-domain spatial, temporal and unit gate."""
    if refresh:
        clear_spatiotemporal_cache()
        _forecast_data.cache_clear()
        _forecast_validation.cache_clear()
    return spatiotemporal_validation_summary()


@app.get("/api/safety/guidance")
def agricultural_safety_guidance(refresh: bool = Query(False)) -> dict:
    """Return validated official work and machinery safety checklist guidance."""
    if refresh:
        clear_safety_cache()
    return safety_guidance_summary()


@app.get("/api/analysis/research")
def analysis_research(
    pest: str = Query("벼물바구미"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
    refresh: bool = Query(False),
) -> dict:
    """Return leakage-guarded Stage 6 evidence without exposing heavy raw rows."""
    if refresh:
        clear_research_cache()
    return research_context(clean_name(pest), crop, region)


@app.get("/api/analysis/research/summary")
def analysis_research_summary(refresh: bool = Query(False)) -> dict:
    if refresh:
        clear_research_cache()
    return research_summary()


@app.get("/api/analysis/ecological-evidence")
def analysis_ecological_evidence(
    year: int | None = Query(None, ge=2016, le=2024),
    region: str | None = Query(None),
    species: str | None = Query(None),
    limit: int = Query(300, ge=25, le=1000),
    refresh: bool = Query(False),
) -> dict:
    """Return evidence-gated ecology layers without exposing heavy raw files or secrets."""
    if refresh:
        clear_ecological_evidence_cache()
    return ecological_evidence_context(
        year=year,
        region=region,
        species=species,
        limit=limit,
    )


@app.get("/api/forecast/2027/weather")
def forecast_2027_weather(
    pest: str = Query("벼물바구미"),
    crop: str | None = Query(None),
    region: str | None = Query(None),
) -> dict:
    """Return ASOS evidence and non-imputed monthly outlook for one condition."""
    return {
        "forecast_year": 2027,
        "pest": pest,
        "crop": crop or "전체",
        "region": region or "전체",
        **weather_context(clean_name(pest), crop, region),
        "aws_minute_archive": aws_minute_archive_status(),
        "disclaimer": FORECAST_DISCLAIMER,
    }


@app.get("/api/weather/aws-minute/status")
def weather_aws_minute_status() -> dict:
    return aws_minute_archive_status()


@app.get("/api/weather/observations/status")
def weather_observations_status(refresh: bool = Query(False)) -> dict:
    """Return lightweight ASOS, AWS and marine archive completion metadata."""
    if refresh:
        clear_observation_cache()
    archive = kma_archive_summary()
    canonical_aws = aws_minute_archive_status()
    legacy_aws = archive.get("surface", {}).get("AWS", {})
    if canonical_aws.get("status") == "complete":
        aggregate = canonical_aws.get("latest_aggregate_snapshot", {})
        archive = {
            **archive,
            "surface": {
                **archive.get("surface", {}),
                "AWS": {
                    "status": "complete",
                    "rows": int(canonical_aws.get("observation_rows", 0) or 0),
                    "valid_rows": int(canonical_aws.get("observation_rows", 0) or 0),
                    "stations": int(aggregate.get("unique_stations", 0) or 0),
                    "completed_windows": int(canonical_aws.get("completed_windows", 0) or 0),
                    "completion_percent": float(canonical_aws.get("completion_rate_percent", 0) or 0),
                    "first_observation": aggregate.get("first_time"),
                    "last_observation": aggregate.get("last_time"),
                    "resolution": "1분",
                    "storage_policy": canonical_aws.get("storage_policy"),
                    "legacy_priority_checkpoint": legacy_aws,
                },
            },
        }
    return archive


@app.get("/api/weather/observations/map")
def weather_observations_map(
    domain: str = Query("all"),
    type_code: str | None = Query(None),
    limit: int = Query(2000, ge=1, le=5000),
    refresh: bool = Query(False),
) -> dict:
    """Return latest real observations and station locations for the web map."""
    normalized_domain = domain.strip().lower()
    if normalized_domain not in {"all", "surface", "marine"}:
        raise HTTPException(
            status_code=400,
            detail="domain은 all, surface, marine 중 하나여야 합니다.",
        )
    if refresh:
        clear_observation_cache()
    return kma_observation_map(
        domain=normalized_domain,
        type_code=type_code,
        limit=limit,
    )


@app.get("/api/spatial-evidence")
def spatial_evidence(
    province: str | None = Query(None),
    district: str | None = Query(None),
    mode: str = Query("crop"),
    livestock_species: str | None = Query(None),
    year: str | None = Query(None),
    refresh: bool = Query(False),
) -> dict:
    """Return lightweight national→province→district public evidence layers."""
    if mode not in {"crop", "livestock"}:
        raise HTTPException(status_code=400, detail="mode는 crop 또는 livestock이어야 합니다.")
    if refresh:
        clear_spatial_evidence_cache()
    return spatial_evidence_context(
        province=province,
        district=district,
        mode=mode,
        livestock_species=livestock_species,
        year=year,
    )
