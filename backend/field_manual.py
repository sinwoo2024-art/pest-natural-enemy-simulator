"""Build an elderly-friendly, evidence-locked field action manual.

The module only reorganises already validated decision-support outputs. It does
not estimate accident probability, pesticide efficacy, or natural-enemy dose.
"""

from __future__ import annotations

from typing import Any


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_text(item) for item in value if _text(item)]


def _action_clock(score: int | float | None, safety: dict[str, Any]) -> dict[str, Any]:
    latest = safety.get("latest") if isinstance(safety, dict) else None
    latest = latest if isinstance(latest, dict) else {}
    work_signal = _text(latest.get("work_adjustment_signal"))
    if score is None:
        state, color, title = "evidence_first", "gray", "자료를 먼저 확인하세요"
        instruction = "비교 가능한 전망자료가 없어 방제 강도를 정하지 않습니다. 현장 예찰과 전문가 확인을 먼저 진행하세요."
    elif "조정" in work_signal:
        state, color, title = "safety_hold", "red", "작업 조건을 먼저 다시 확인하세요"
        instruction = "기상 상대노출 신호가 작업조정 검토 수준입니다. 작업시간·장비·보호구를 확인한 뒤 방제 순서를 결정하세요."
    elif float(score) >= 67:
        state, color, title = "field_check_priority", "red", "현장 확인을 우선하세요"
        instruction = "상대위험 전망이 높은 구간입니다. 발생을 확정하지 말고 대상 병해충과 밀도를 먼저 확인하세요."
    elif float(score) >= 34:
        state, color, title = "shorten_scouting_review", "orange", "예찰 주기 단축을 검토하세요"
        instruction = "상대위험 전망이 주의 구간입니다. 같은 지점·같은 방법으로 예찰 기록을 비교하세요."
    else:
        state, color, title = "routine_scouting", "green", "정기 예찰을 유지하세요"
        instruction = "상대위험 전망이 관찰 구간입니다. 자료 없음과 실제 0을 구분해 기록을 이어가세요."
    return {
        "state": state,
        "color": color,
        "title": title,
        "instruction": instruction,
        "forecast_score": score,
        "work_adjustment_signal": work_signal or "자료 없음",
        "weather_reference_date": latest.get("date"),
        "is_occurrence_probability": False,
        "is_accident_probability": False,
    }


def _product_card(product: dict[str, Any]) -> dict[str, Any]:
    return {
        "registration_number": product.get("registration_number"),
        "brand_name": product.get("brand_name"),
        "product_name": product.get("product_name"),
        "active_ingredient": product.get("active_ingredient"),
        "mode_of_action": product.get("mode_of_action"),
        "dilution": product.get("dilution"),
        "amount": product.get("amount"),
        "use_timing": product.get("use_timing"),
        "safety_timing": product.get("safety_timing"),
        "use_count": product.get("use_count"),
        "human_toxicity": product.get("human_toxicity"),
        "fish_toxicity": product.get("fish_toxicity"),
        "registration_status": product.get("registration_status"),
        "decision": "공식 등록 후보 확인",
        "is_prescription": False,
    }


def build_field_manual(decision: dict[str, Any]) -> dict[str, Any]:
    forecast = decision.get("forecast", {})
    management = decision.get("integrated_management", {})
    enemies = decision.get("natural_enemy", {})
    pesticide = decision.get("pesticide", {})
    safety = decision.get("safety", {})
    relative_exposure = safety.get("relative_exposure", {}) if isinstance(safety, dict) else {}
    recommendations = enemies.get("recommendations", []) if isinstance(enemies, dict) else []
    products = pesticide.get("products", []) if isinstance(pesticide, dict) else []
    matched_pesticides = int(pesticide.get("matched_rows", 0) or 0) if isinstance(pesticide, dict) else 0
    enemy_connected = bool(enemies.get("connected")) if isinstance(enemies, dict) else False
    precise_timing = bool(enemies.get("precise_timing_available")) if isinstance(enemies, dict) else False
    effect_evidence = bool(enemies.get("effect_evidence_available")) if isinstance(enemies, dict) else False

    surveillance_actions = _list(management.get("surveillance"))
    physical_actions = _list(management.get("physical"))
    biological_actions = _list(management.get("biological"))
    chemical_actions = _list(management.get("chemical"))
    safety_checks = _list(relative_exposure.get("recommended_checks"))
    if not safety_checks:
        safety_checks = ["작업 전 보호구·농기계 방호장치·작업 동선을 확인하세요."]

    steps = [
        {
            "id": "surveillance",
            "number": "1",
            "title": "먼저 확인하기",
            "short_title": "예찰",
            "color": "blue",
            "state": "ready",
            "headline": "병해충과 피해 흔적을 같은 자리에서 확인하세요",
            "actions": surveillance_actions or ["피해 증상·충체·발생 위치를 사진과 수치로 기록하세요."],
            "checklist": ["대상 병해충 확인", "발생 위치 표시", "실제 0과 미조사 분리", "사진·날짜 기록"],
            "stop_conditions": ["대상 병해충이 확실하지 않으면 다음 단계로 넘어가지 않습니다."],
            "evidence": "NCPMS 예찰자료와 선택 조건",
        },
        {
            "id": "physical",
            "number": "2",
            "title": "초기에 줄이기",
            "short_title": "물리적 방제",
            "color": "gold",
            "state": "verify",
            "headline": "피해 부위·잔재물·유입 경로를 먼저 관리하세요",
            "actions": physical_actions or ["피해 부위를 제거하고 방충망·트랩 등 작물과 병해충에 맞는 물리 수단을 검토하세요."],
            "checklist": ["피해 부위 제거 가능 여부", "트랩·방충망 상태", "도구 세척", "재유입 경로 확인"],
            "stop_conditions": ["작물 손상이나 작업자 위험이 커지는 물리 조치는 중단하세요."],
            "evidence": "병해충 유형별 통합관리 원칙",
        },
        {
            "id": "biological",
            "number": "3",
            "title": "천적 근거 확인하기",
            "short_title": "생물적 방제",
            "color": "green",
            "state": "ready" if enemy_connected else "blocked",
            "headline": "검증된 대상해충 연결이 있을 때만 천적을 검토하세요" if enemy_connected else "현재 조건에는 검증된 천적 연결이 없습니다",
            "actions": biological_actions,
            "checklist": [
                f"검증 천적 연결 {len(recommendations)}건",
                "대상해충 정확일치 확인",
                "현재 해충 밀도 확인",
                "공급기관·전문가의 현장 기준 확인",
            ],
            "stop_conditions": [
                (
                    "표시된 방사량·간격은 공식 원문의 해당 작물·해충 조건에서만 검토합니다."
                    if precise_timing
                    else "정량 투입시험 근거가 없으면 정확한 방사량을 표시하지 않습니다."
                ),
                "현재 해충 밀도·온습도·작물 생육조건이 원문 조건과 다르면 투입을 확정하지 않습니다.",
            ],
            "evidence": enemies.get("caution") if isinstance(enemies, dict) else "천적 DB 미연결",
            "precise_timing_available": precise_timing,
            "effect_evidence_available": effect_evidence,
            "recommendations": recommendations[:5],
        },
        {
            "id": "chemical",
            "number": "4",
            "title": "등록사항 확인하기",
            "short_title": "등록농약",
            "color": "orange",
            "state": "ready" if matched_pesticides > 0 else "blocked",
            "headline": "작물·병해충 정확일치 등록제품의 표시사항을 확인하세요" if matched_pesticides > 0 else "정확히 일치하는 등록제품 자료가 없습니다",
            "actions": chemical_actions,
            "checklist": ["등록번호", "작용기작", "희석배수·사용량", "사용적기·횟수", "수확 전 안전사용기준"],
            "stop_conditions": ["최신 등록상태와 제품 라벨을 확인하지 못하면 사용을 결정하지 않습니다."],
            "evidence": pesticide.get("caution") if isinstance(pesticide, dict) else "등록자료 미연결",
            "matched_rows": matched_pesticides,
            "products": [_product_card(product) for product in products[:6]],
        },
    ]

    action_locks = [
        {
            "id": "target",
            "name": "대상 확인 잠금",
            "open": forecast.get("score") is not None,
            "status": "현장 확인 필요" if forecast.get("score") is not None else "전망자료 부족",
            "reason": "전망 점수는 발생 확정값이 아니므로 예찰 확인 뒤에만 다음 단계로 이동합니다.",
        },
        {
            "id": "enemy",
            "name": "천적 근거 잠금",
            "open": enemy_connected,
            "status": "대상해충 연결" if enemy_connected else "검증 연결 없음",
            "reason": "천적명 유사성이 아니라 검증 DB의 대상해충 연결 여부를 사용합니다.",
        },
        {
            "id": "timing",
            "name": "공식 처리조건 확인",
            "open": precise_timing,
            "status": "공식 처리조건 연결" if precise_timing else "정량시험 필요",
            "reason": "대상해충·이용작물과 방사량·간격의 원문 보유 여부입니다. 도입 여부는 환경·효과 근거·사용자 경제성을 별도로 검토해야 합니다.",
        },
        {
            "id": "pesticide",
            "name": "등록 표시 잠금",
            "open": matched_pesticides > 0,
            "status": f"정확일치 {matched_pesticides:,}행" if matched_pesticides > 0 else "정확일치 없음",
            "reason": "작물·병해충 정확일치와 최신 제품 라벨을 모두 확인해야 합니다.",
        },
        {
            "id": "work",
            "name": "작업 안전 잠금",
            "open": bool(relative_exposure.get("available")),
            "status": _text(relative_exposure.get("latest", {}).get("work_adjustment_signal")) or "관측자료 없음",
            "reason": "실제 ASOS 기반 상대노출과 공식 안전수칙이며 사고확률은 아닙니다.",
        },
    ]

    return {
        "status": "complete",
        "manual_version": "2026.08-evidence-lock-v2",
        "title": "한눈에 보는 현장 방제 매뉴얼",
        "audience": "고령 농업인·현장지도사·지자체 방제 담당자",
        "selected_condition": decision.get("selected_condition", {}),
        "forecast": {
            "score": forecast.get("score"),
            "level": forecast.get("level"),
            "confidence": forecast.get("confidence"),
            "is_confirmed_probability": False,
        },
        "action_clock": _action_clock(forecast.get("score"), relative_exposure),
        "steps": steps,
        "action_locks": action_locks,
        "work_safety_copilot": {
            "available": bool(relative_exposure.get("available")),
            "latest": relative_exposure.get("latest"),
            "checks": safety_checks[:6],
            "official_accident_evidence": safety.get("official_accident_policy_priorities", []),
            "official_accident_evidence_rows": safety.get("official_accident_evidence_rows", 0),
            "is_accident_probability": False,
            "method": relative_exposure.get("method"),
            "caution": relative_exposure.get("caution") or safety.get("caution"),
        },
        "plain_language": {
            "first": "대상을 확인하세요.",
            "second": "사람과 작물에 부담이 적은 방법부터 검토하세요.",
            "third": "천적은 연결 근거와 현장 조건을 확인하세요.",
            "fourth": "농약은 등록번호와 제품 라벨을 마지막에 다시 확인하세요.",
        },
        "accessibility": {
            "large_text": True,
            "one_step_at_a_time": True,
            "printable": True,
            "browser_read_aloud": True,
        },
        "innovation": {
            "name": "근거 잠금형 현장 실행창",
            "difference": "위험도를 보여주는 데서 끝나지 않고, 예찰·천적·농약·작업안전의 근거가 충족된 단계만 열어 줍니다.",
            "non_claims": ["발생확률", "사고확률", "근거 없는 방제효과율", "근거 없는 천적 방사량"],
        },
        "missing_data": decision.get("missing_data", []),
        "research_caution": decision.get("research_caution"),
    }
