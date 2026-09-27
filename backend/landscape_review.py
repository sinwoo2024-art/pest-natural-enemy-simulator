"""Independent, non-prescriptive open-field conservation review.

No conversion from surveillance scores to density, EIL, efficacy or release rate.
Sources were checked against publisher/government originals; generic evidence
is never promoted to a local crop/pest/enemy treatment-control trial.
"""
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

try:
    from .economic_threshold import Criterion, EilInputs, review_threshold
except ImportError:
    from economic_threshold import Criterion, EilInputs, review_threshold

CLIMATE_NOTICE = "현재 NCPMS 분석기간만으로 장기 기후변화에 따른 해충 발생 변화를 확정할 수 없습니다. 현재 결과는 단기 예찰·기상 연계 탐색 결과입니다. 장기 병해충 자료 부족으로 기후변화 인과효과는 판정하지 않음"
SMARTFARM_BOUNDARY = {
    "track": "스마트팜 확장 연구 트랙",
    "facility_pest_density": None,
    "facility_release_density": None,
    "optimal_release_timing": None,
    "ncpms_score_combined": False,
    "notice": "스마트팜 자료는 작기·시설환경을 확인하기 위한 별도 확장 연구 트랙입니다. NCPMS 노지 상대위험도를 이용해 시설 내 해충 발생밀도, 방사밀도 또는 최적 방사 시점을 추정하지 않습니다.",
}
SOURCES = [
    {"id": "nrcs2014", "title": "USDA NRCS — Common Beneficial Insects and their Habitat (2014)",
     "url": "https://www.nrcs.usda.gov/plantmaterials/txpmctn12248.pdf",
     "scope": "미국 텍사스 유용곤충·먹이·서식처 일반 지침; 국내 동일 조건 처리·대조 근거 아님",
     "verified": True},
    {"id": "karp2018", "title": "Karp et al. (2018), Crop pests and predators exhibit inconsistent responses to surrounding landscape composition",
     "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6099893/",
     "doi": "10.1073/pnas.1800042115",
     "scope": "경관과 해충·천적 반응의 이질성을 보고한 다지역 연구; 현장 효과를 보장하지 않음",
     "verified": True},
]
GRADES = {
    "A": "동일 작물·해충·환경의 공식 처리·대조 실험",
    "B": "공식 자료 또는 동료심사 논문의 조건부 근거",
    "C": "일반적인 보전적 생물방제 원칙 또는 현장 실증이 필요한 제안",
    "자료 없음": "확인 가능한 출처가 없음 또는 현재 조건에 연결할 수 있는 근거 없음",
}
Answer = Literal["미확인", "있음", "없음"]


class LandscapeField(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    cultivation: Literal["미확인", "논", "밭", "과수원", "기타 노지"] = "미확인"
    edge_vegetation: Answer = "미확인"
    flowers: Answer = "미확인"
    refuge: Answer = "미확인"
    woody_border: Answer = "미확인"
    land_use: Literal["미확인", "농경지", "산림", "도시", "혼합"] = "미확인"
    recent_mowing: Answer = "미확인"
    nonselective_insecticide: Answer = "미확인"
    pest_survey: Answer = "미확인"
    enemy_observed: Answer = "미확인"
    density: float | None = Field(None, ge=0, le=1e12)
    method: str = Field("", max_length=200)
    unit: str = Field("", max_length=100)
    survey_date: date | None = None
    assumed_threshold: float | None = Field(None, ge=0, le=1e12)
    assumed_threshold_unit: str = Field("", max_length=100)
    site_name: str = Field("", max_length=200)
    sample_size: float | None = Field(None, gt=0, le=1e12)
    sample_unit: str = Field("", max_length=40)
    enemy_count: int | None = Field(None, ge=0, le=1000000000)
    last_spray_date: date | None = None

    @field_validator("survey_date", "last_spray_date")
    @classmethod
    def not_future(cls, value):
        if value and value > date.today():
            raise ValueError("조사일은 미래일 수 없습니다.")
        return value

    @field_validator("method", "unit", "assumed_threshold_unit")
    @classmethod
    def clean_text(cls, value):
        return value.strip()


class LandscapeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crop: str = Field(min_length=1, max_length=100)
    pest: str = Field(min_length=1, max_length=100)
    region: str = Field(default="전체", min_length=1, max_length=100)
    enemy_name: str | None = Field(default=None, max_length=100)
    field: LandscapeField = Field(default_factory=LandscapeField)
    threshold_mode: Literal["direct", "eil"] = "direct"
    criterion: Criterion = Field(default_factory=Criterion)
    eil: EilInputs = Field(default_factory=EilInputs)


def landscape_state(survey_ready: bool, landscape_ready: bool, evidence_linked: bool,
                    direct_local_trial: bool = False, threshold_ready: bool = False) -> tuple[str, str]:
    if not landscape_ready:
        return "경관조사 우선", "주변 경관조건을 먼저 확인해야 합니다."
    if not survey_ready or not threshold_ready:
        return "근거자료 부족", "실제 밀도·조사방법·단위·조사일 또는 비교 가능한 경제적 기준이 부족합니다."
    if not evidence_linked:
        return "근거자료 부족", "선택한 병해충·천적에 연결할 경관관리 근거를 확보하지 못했습니다."
    if direct_local_trial:
        return "현장 실증 후보", "직접근거와 현장조건의 연결 후에도 실제 효과 검증이 필요합니다."
    return "보전관리 조건부 검토", "일반 근거만 연결됩니다. 작물·지역·천적 종·환경의 직접 효과는 미확인입니다."


def review_landscape(request: LandscapeRequest, risk: dict, enemies: list[dict]) -> dict:
    field = request.field
    selected = next((e for e in enemies if e.get("name") == request.enemy_name), None)
    if request.enemy_name is None and enemies:
        selected = enemies[0]
    name = (selected or {}).get("name", "")
    # Only an explicitly described prey/guild relation in NRCS pp. 3–6.
    # This is a group-level reference, not a species-specific efficacy match.
    linked = bool(selected and "진딧물" in request.pest and
                  any(group in name for group in ("무당벌레", "풀잠자리", "꽃등에")))
    grade = "C" if linked else "자료 없음"
    survey_ready = (field.pest_survey == "있음" and field.density is not None and
                    field.method not in ("", "미확인") and field.unit not in ("", "미확인") and
                    field.survey_date is not None)
    keys = ("cultivation", "edge_vegetation", "flowers", "refuge", "woody_border",
            "land_use", "recent_mowing", "nonselective_insecticide", "enemy_observed")
    unknown = [key for key in keys if getattr(field, key) == "미확인"]
    landscape_ready = (len(unknown) < 5 and field.cultivation != "미확인" and
                       field.enemy_observed != "미확인")
    threshold = review_threshold(request.criterion, request.eil, request.threshold_mode,
                                 request.crop, request.pest, request.region, field.cultivation,
                                 field.density, field.unit)
    # No verified local landscape treatment-control record is registered yet.
    status, reason = landscape_state(bool(survey_ready), landscape_ready, linked, threshold_ready=threshold["ready"])
    methods = []
    habitat = any(getattr(field, k) == "있음" for k in ("edge_vegetation", "flowers", "refuge"))
    if status == "보전관리 조건부 검토" and not (habitat or field.woody_border == "있음"):
        status, reason = "근거자료 부족", "보전관리 후보와 연결할 실제 서식처 조건이 확인되지 않았습니다."
    candidates = [
        (field.edge_vegetation == "있음", "포장 가장자리 천적 서식처 보전 검토", "기존 서식처와 이동 경로 확인", "식생의 기주해충·천적 동시 조사"),
        (field.flowers == "있음", "꽃자원과 먹이자원 관리 검토", "먹이·은신처 이용 여부 확인", "개화기와 대상 천적의 먹이 이용·해충 증가 여부"),
        (field.refuge == "있음", "초생대·비경작지·피난처 보전 검토", "피난처 이용 여부 확인", "비경작 식생의 병해충 기주 가능성"),
        (habitat and field.recent_mowing == "있음", "선택적·구역별 예초 검토", "서식처 교란 여부 조사", "예초 전후 천적·해충 조사; 구역과 간격 기준 미확보"),
        (field.nonselective_insecticide == "있음", "천적 활동과 약제 사용 충돌 확인", "천적 노출 가능성 점검", "제품명·유효성분·사용일·천적별 독성 및 잔효 공식자료"),
        (field.nonselective_insecticide != "미확인", "비선택성 살충제 영향 확인", "약제 이력과 관찰 결과 대조", "사용하지 않았어도 주변 비산·과거 사용 이력 확인"),
        (field.woody_border == "있음" or field.land_use in ("산림", "혼합"), "주변 서식처 연결성 조사", "경관의 단절·연결 관계 확인", "주변 토지이용·장벽·천적과 해충 이동 확인"),
        (bool(survey_ready), "천적과 해충의 정기 동시 모니터링 검토", "같은 방법·단위로 변동 기록", "조사 위치·방법·단위·날짜·천적 동정과 무처리 비교구 검토"),
        (bool(survey_ready) and threshold["ready"], "처리구와 비교구를 둔 현장 검증 검토", "처리 전·후 밀도 차이를 같은 조사방법으로 확인", "무처리 비교구·조사기간·천적 종·실제 약제 이력을 기록"),
    ]
    if linked:
        for enabled, method, purpose, check in candidates:
            if not enabled:
                continue
            methods.append({"method": method, "purpose": purpose,
                "target": f"{request.crop} · {request.pest} · {name}",
                "match": "진딧물–천적 기능군의 일반 연결만 확인. 작물·지역·종·노지 환경 직접 일치 미확인",
                "grade": grade, "sources": SOURCES,
                "domestic": "국외 일반 지침; 국내 적용 가능성은 현장 실증 필요",
                "limitation": "꽃자원·비경작 식생이 일부 해충에도 유리할 수 있음. 경관관리 효과를 보장하지 않음",
                "field_check": check, "quantitative_specification": None,
                "action": "실행 권고 아님 · 조사 후 검토"})
    return {
        "track": "NCPMS 기반 노지 경관관리", "status": status, "reason": reason,
        "selected_condition": {"crop": request.crop, "pest": request.pest, "region": request.region},
        "surveillance": {"year": 2026, "score": risk.get("risk_score"), "level": risk.get("risk_level"),
                         "trend": risk.get("trend", []), "has_observation": risk.get("has_observation", False)},
        "meaning": "NCPMS 상대위험도는 실제 해충 개체수, 피해확률 또는 경제적 피해수준이 아닙니다.",
        "density": {"value": field.density, "method": field.method or "미확인", "unit": field.unit or "미확인",
                    "date": field.survey_date, "origin": "사용자 현장 조사값", "complete": bool(survey_ready)},
        "threshold": {**threshold, "user_assumption": field.assumed_threshold,
                      "user_assumption_unit": field.assumed_threshold_unit, "user_assumption_label": "사용자 가정값 · 공식 기준 아님"},
        "used_data": ["NCPMS 상대위험·조사회차 패턴 (실측 밀도와 별개)", "입력된 현장 조사·경관조건", "연결 가능한 천적 기능군의 일반 출처", "입력 경제적 기준의 단위·조건 또는 EIL 변수 검토"],
        "unused_data": ["스마트팜 작기자료: 노지 밀도·점수 보정에 사용 안 함", "NCPMS 점수: 밀도·피해확률·EIL 산출에 사용 안 함", "기상 관측: 경관관리 점수·방사일 산출에 사용 안 함", "사용자 출처: 서버가 공식 원문으로 인증하지 않음"],
        "missing_data": (["실제 밀도·방법·단위·조사일"] if not survey_ready else []) +
                        (["경관조건·천적 관찰"] if not landscape_ready else []) +
                        (["비교 가능한 경제적 기준·단위·대상조건"] if not threshold["ready"] else []) +
                        (["선택 병해충·천적의 경관관리 근거"] if not linked else []) + ["국내 동일 조건의 직접 처리·대조 경관관리 효과"],
        "next_actions": ["미입력 경관조건과 실제 조사 면적·주수 기록", "동일 단위로 해충·천적의 처리 전·후 밀도 조사", "기준 원문과 작물·병해충·적용조건 확인", "전문가와 처리구·비교구를 둔 현장 검증 설계"],
        "field": field.model_dump(mode="json"), "unknown_fields": unknown,
        "enemies": [{"name": e.get("name"), "source_grade": (e.get("release_standard") or {}).get("evidence_grade") or "미기재"} for e in enemies],
        "selected_enemy": name or None,
        "enemy_source_grade": ((selected or {}).get("release_standard") or {}).get("evidence_grade") or "미기재",
        "landscape_grade": grade, "grade_definitions": GRADES,
        "source_notice": "연결 천적의 방사·시험 근거 등급과 경관관리 근거 등급은 별개입니다.",
        "methods": methods, "sources": SOURCES,
        "evidence_status": "일반 근거만 연결" if linked else "검증 가능한 공식 근거 미확보: 현재 선택 조건의 경관관리 직접·조건부 근거",
        "climate": {"ncpms": "2024~2026 단기 연도·지역·조사회차별 상대위험 패턴",
                    "kma": "장기자료는 기상 배경·장기 기후경향 검토용", "relation": "탐색적 연관성 검토; 인과관계 미확정", "notice": CLIMATE_NOTICE},
        "additional_data": ["실제 밀도·조사방법·단위·조사일", "천적 종 동정·관찰 기록", "가장자리·꽃·피난처·수림대·토지이용 조사", "예초·약제 사용 이력", "동일 조건 경관관리 처리·대조 및 국내 검증 자료", "작물·병해충·생육단계·조사단위가 일치하는 공식 경제적 피해기준"],
        "automatic_action": False, "effect_percent": None,
        "notice": "모든 결과는 검토사항이며 자동 작업명령이나 효과 보장이 아닙니다. NCPMS·경관관리·구입방사 경제성·스마트팜 점수를 합산하지 않습니다.",
    }
