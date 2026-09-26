"""2027년 병해충 상대 위험 전망 데이터 생성기.

2024·2026 NCPMS SVC52 원자료만 사용한다. 2025년 농지 좌표 자료 등 조사
체계가 다른 자료는 학습·전망에 결합하지 않는다. 전망은 발생 확률이 아니라
두 시점의 상대 위험 변화에 표본 축소와 상·하한을 적용한 설명 가능한 지수다.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
FORECAST_PATH = DATA_DIR / "forecast_2027.csv"
SOURCE_YEARS = (2024, 2026)
UNIT_COLUMNS = ["병해충기본명", "작물", "지역", "조사회차"]
FORECAST_COLUMNS = [
    "작물",
    "병해충",
    "유형",
    "지역",
    "위험도_2024",
    "위험도_2026",
    "전망위험도_2027",
    "추세",
    "신뢰도",
    "관측수",
    "근거연도",
    "전망근거",
    "대응유형",
]
MODEL_LIMITATION = (
    "2024·2026 두 개 연도의 NCPMS 예찰자료만 사용한 상대 위험 전망으로, "
    "기상·재배면적·방제 변화와 2027년 실제 발생을 확정하지 않습니다."
)
FORECAST_DISCLAIMER = (
    "2027년 값은 2024·2026년 NCPMS 예찰자료의 변화 추세를 이용한 "
    "상대 위험 전망이며 실제 발생을 확정하는 예측값이 아닙니다."
)
INSUFFICIENT_MESSAGE = (
    "해당 조건의 비교 가능한 예찰자료가 부족하여 2027년 전망을 제공하지 않습니다."
)


def clean_name(value: object) -> str:
    """지표 괄호와 모든 공백을 제거해 기존 API와 같은 기본명을 만든다."""
    if pd.isna(value):
        return ""
    return re.sub(r"\([^)]*\)", "", str(value)).replace(" ", "").strip()


def indicator_name(value: object) -> str:
    match = re.search(r"\(([^)]*)\)", str(value))
    return match.group(1).strip() if match else "발생값"


def load_raw_year(year: int) -> pd.DataFrame:
    path = DATA_DIR / f"ncpms_SVC52_{year}.csv"
    frame = pd.read_csv(path, encoding="utf-8-sig")
    required = {
        "작물", "조사연도", "조사회차", "병해충", "지역", "발생값",
    }
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"{path.name} 필수 열 누락: {', '.join(missing)}")

    frame = frame.copy()
    frame["병해충기본명"] = frame["병해충"].map(clean_name)
    frame["지표"] = frame["병해충"].map(indicator_name)
    # 결측과 실제 0을 구분하기 위해 여기서는 fillna(0)를 하지 않는다.
    frame["발생값_수치"] = pd.to_numeric(frame["발생값"], errors="coerce")
    return frame


def _name_diagnostics(frame: pd.DataFrame) -> dict[str, Any]:
    raw_names = sorted(str(value) for value in frame["병해충"].dropna().unique())
    base_to_raw: dict[str, list[str]] = {}
    alias_roots: dict[str, set[str]] = {}
    for raw in raw_names:
        base = clean_name(raw)
        base_to_raw.setdefault(base, []).append(raw)
        alias_root = re.sub(r"(?:1|2)화기$", "", base)
        if alias_root != base:
            alias_roots.setdefault(alias_root, set()).add(base)

    return {
        "leading_or_trailing_space_names": [
            name for name in raw_names if name != name.strip()
        ],
        "names_containing_spaces": [name for name in raw_names if " " in name],
        "parenthetical_indicator_names": [
            name for name in raw_names if re.search(r"\([^)]*\)", name)
        ],
        "normalized_name_collisions": {
            base: names
            for base, names in base_to_raw.items()
            if len(names) > 1
        },
        "potential_generation_aliases": {
            root: sorted(names)
            for root, names in alias_roots.items()
        },
    }


def validate_source_data() -> dict[str, Any]:
    """원본을 바꾸지 않고 스키마·비교 가능성·명칭 문제를 진단한다."""
    frames = {year: load_raw_year(year) for year in SOURCE_YEARS}
    yearly: dict[str, Any] = {}

    for year, frame in frames.items():
        numeric = frame["발생값_수치"]
        yearly[str(year)] = {
            "file": f"ncpms_SVC52_{year}.csv",
            "encoding": "utf-8-sig",
            "rows": int(len(frame)),
            "columns": list(frame.columns[: len(frame.columns) - 3]),
            "dtypes": {
                column: str(dtype)
                for column, dtype in frame.iloc[:, : len(frame.columns) - 3].dtypes.items()
            },
            "pests_detailed": int(frame["병해충"].nunique(dropna=True)),
            "pests_basic": int(frame["병해충기본명"].nunique(dropna=True)),
            "crops": int(frame["작물"].nunique(dropna=True)),
            "regions": int(frame["지역"].nunique(dropna=True)),
            "survey_round_min": (
                int(frame["조사회차"].min()) if frame["조사회차"].notna().any() else None
            ),
            "survey_round_max": (
                int(frame["조사회차"].max()) if frame["조사회차"].notna().any() else None
            ),
            "occurrence_missing": int(numeric.isna().sum()),
            "occurrence_zero": int(numeric.eq(0).sum()),
            "occurrence_positive": int(numeric.gt(0).sum()),
            "exact_duplicate_rows": int(frame.iloc[:, : len(frame.columns) - 3].duplicated().sum()),
            "name_diagnostics": _name_diagnostics(frame),
        }

    dimensions = {
        "pests": "병해충기본명",
        "crops": "작물",
        "regions": "지역",
    }


    overlap: dict[str, Any] = {}
    for label, column in dimensions.items():
        values_2024 = set(frames[2024][column].dropna().astype(str))
        values_2026 = set(frames[2026][column].dropna().astype(str))
        overlap[label] = {
            "common_count": len(values_2024 & values_2026),
            "common": sorted(values_2024 & values_2026),
            "only_2024_count": len(values_2024 - values_2026),
            "only_2024": sorted(values_2024 - values_2026),
            "only_2026_count": len(values_2026 - values_2024),
            "only_2026": sorted(values_2026 - values_2024),
        }

    unit_sets = {
        year: set(map(tuple, frame[UNIT_COLUMNS].drop_duplicates().itertuples(index=False, name=None)))
        for year, frame in frames.items()
    }
    common_units = unit_sets[2024] & unit_sets[2026]
    comparable_rows: dict[str, Any] = {}
    for year, frame in frames.items():
        row_units = list(map(tuple, frame[UNIT_COLUMNS].itertuples(index=False, name=None)))
        comparable_count = sum(unit in common_units for unit in row_units)
        comparable_rows[str(year)] = {
            "comparable_rows": int(comparable_count),
            "non_comparable_rows": int(len(frame) - comparable_count),
        }

    return {
        "source_scope": "NCPMS SVC52 2024·2026 전국 예찰자료만 사용",
        "excluded_from_training": [
            "farmmap_좌표연단위_2025.json",
            "farmmap_좌표연단위_2025_01-08.json",
        ],
        "yearly": yearly,
        "overlap": overlap,
        "comparison_unit": "병해충기본명 × 작물 × 지역 × 조사회차",
        "common_unit_count": len(common_units),
        "only_2024_unit_count": len(unit_sets[2024] - unit_sets[2026]),
        "only_2026_unit_count": len(unit_sets[2026] - unit_sets[2024]),
        "row_comparability": comparable_rows,
        "zero_and_missing_policy": (
            "발생값 0은 실제 관측으로 유지하고, 숫자 변환이 불가능한 값과 결측은 "
            "0으로 대체하지 않고 점수 산정에서 제외합니다."
        ),
        "alias_policy": (
            "괄호 안 지표와 공백만 기본명 정리에 사용합니다. 이화명나방 1·2화기처럼 "
            "의미가 달라질 수 있는 후보는 검증된 별칭표 없이 자동 병합하지 않습니다."
        ),
    }


def validate_reference_data() -> dict[str, Any]:
    """분류·천적 DB의 실제 열과 인코딩을 전망 API 연결 전에 확인한다."""
    sources: list[tuple[str, str, pd.DataFrame]] = [
        (
            "병해충분류DB.csv",
            "utf-8-sig",
            pd.read_csv(DATA_DIR / "병해충분류DB.csv", encoding="utf-8-sig"),
        ),
        (
            "천적곤충현황.csv",
            "cp949",
            pd.read_csv(DATA_DIR / "천적곤충현황.csv", encoding="cp949"),
        ),
        (
            "천적확장DB.csv",
            "utf-8-sig",
            pd.read_csv(DATA_DIR / "천적확장DB.csv", encoding="utf-8-sig"),
        ),
        (
            "병해충_천적DB.xlsx::천적곤충",
            "xlsx/header=1",
            pd.read_excel(
                DATA_DIR / "병해충_천적DB.xlsx",
                sheet_name="천적곤충",
                header=1,
            ),
        ),
    ]
    return {
        name: {
            "encoding_or_sheet": encoding,
            "rows": int(len(frame)),
            "columns": [str(column) for column in frame.columns],
            "dtypes": {str(column): str(dtype) for column, dtype in frame.dtypes.items()},
        }
        for name, encoding, frame in sources
    }


def _normalize_year(frame: pd.DataFrame) -> pd.DataFrame:
    work = frame.copy()
    work["정규화값"] = np.nan
    valid = work["발생값_수치"].notna()
    group_columns = ["병해충기본명", "작물", "지표"]
    for _, indices in work.loc[valid].groupby(group_columns).groups.items():
        values = work.loc[indices, "발생값_수치"].astype(float)
        ceiling = float(values.quantile(0.95))
        if ceiling <= 0:
            ceiling = float(values.max())
        if ceiling > 0:
            work.loc[indices, "정규화값"] = (values / ceiling).clip(0, 1)
        else:
            # 실제 조사값이 전부 0인 그룹은 자료 없음이 아니라 0점이다.
            work.loc[indices, "정규화값"] = 0.0
    return work


def _unit_scores(frame: pd.DataFrame, year: int) -> pd.DataFrame:
    normalized = _normalize_year(frame)
    grouped = normalized.groupby(UNIT_COLUMNS, dropna=False, as_index=False).agg(
        **{
            f"score_{year}": ("정규화값", "mean"),
            f"observations_{year}": ("발생값_수치", "count"),
            f"missing_{year}": ("발생값_수치", lambda values: int(values.isna().sum())),
        }
    )
    return grouped


def _risk_level(score: float | int | None) -> str:
    if score is None or pd.isna(score):
        return "전망자료 부족"
    if score >= 67:
        return "고위험"
    if score >= 34:
        return "주의"
    return "관찰"


def _confidence(
    both_years: bool,
    common_units: int,
    observations: int,
    missing_rate: float,
    volatility: float | None,
) -> tuple[str, str]:
    volatility_value = 100.0 if volatility is None or np.isnan(volatility) else volatility
    facts = (
        f"양년 자료 {'있음' if both_years else '없음'}, 공통 조사단위 {common_units}개, "
        f"유효 관측 {observations}건, 결측률 {missing_rate * 100:.1f}%, "
        f"단위별 변화 변동성 {volatility_value:.1f}점"
    )
    if (
        both_years
        and common_units >= 4
        and observations >= 16
        and missing_rate <= 0.05
        and volatility_value <= 20
    ):
        return "높음", f"{facts}. 양년 반복관측·낮은 결측·낮은 변동성 기준을 충족합니다."
    if (
        both_years
        and common_units >= 2
        and observations >= 8
        and missing_rate <= 0.20
        and volatility_value <= 40
    ):
        return "보통", f"{facts}. 비교는 가능하지만 표본 또는 변동성에 불확실성이 남습니다."
    return "낮음", f"{facts}. 제한된 비교 단위 또는 변동성 때문에 보수적으로 낮게 평가합니다."


def _load_category_lookup() -> dict[str, str]:
    path = DATA_DIR / "병해충분류DB.csv"
    classes = pd.read_csv(path, encoding="utf-8-sig")
    return {
        clean_name(row["병해충기본명"]): str(row["분류"]).replace("\ufeff", "").strip()
        for _, row in classes.iterrows()
    }


@dataclass(frozen=True)
class RegionEvidence:
    pest: str
    crop: str
    region: str
    score_2024: float | None
    score_2026: float | None
    observations: int
    missing: int
    common_units: int
    volatility: float | None


def _region_evidence(merged: pd.DataFrame) -> list[RegionEvidence]:
    evidence: list[RegionEvidence] = []
    group_columns = ["병해충기본명", "작물", "지역"]
    for (pest, crop, region), group in merged.groupby(group_columns, dropna=False):
        score_2024_all = group["score_2024"].dropna()
        score_2026_all = group["score_2026"].dropna()
        paired = group.dropna(subset=["score_2024", "score_2026"])

        if not paired.empty:
            # 화면의 기존 연도별 상대위험도와 동일하게 각 연도의 전체 조사단위
            # 평균을 표시하되, 전망 가능 여부와 변동성은 공통 단위로 판단한다.
            score_2024 = float(score_2024_all.mean() * 100)
            score_2026 = float(score_2026_all.mean() * 100)
            unit_deltas = (paired["score_2026"] - paired["score_2024"]) * 100
            volatility = float(unit_deltas.std(ddof=0))
        else:
            score_2024 = (
                float(score_2024_all.mean() * 100) if not score_2024_all.empty else None
            )
            score_2026 = (
                float(score_2026_all.mean() * 100) if not score_2026_all.empty else None
            )
            volatility = None

        observations = int(
            group["observations_2024"].fillna(0).sum()
            + group["observations_2026"].fillna(0).sum()
        )
        missing = int(
            group["missing_2024"].fillna(0).sum()
            + group["missing_2026"].fillna(0).sum()
        )
        evidence.append(
            RegionEvidence(
                pest=str(pest),
                crop=str(crop),
                region=str(region),
                score_2024=score_2024,
                score_2026=score_2026,
                observations=observations,
                missing=missing,
                common_units=int(len(paired)),
                volatility=volatility,
            )
        )
    return evidence


def build_forecast_frame() -> pd.DataFrame:
    """전국 작물·병해충·지역 조합별 전망 레코드를 생성한다."""
    frames = {year: load_raw_year(year) for year in SOURCE_YEARS}
    units = {year: _unit_scores(frame, year) for year, frame in frames.items()}
    merged = units[2024].merge(units[2026], on=UNIT_COLUMNS, how="outer")
    evidence = _region_evidence(merged)
    category_lookup = _load_category_lookup()

    # 표본이 적은 지역은 같은 병해충·작물의 지역 중앙 추세 방향으로 축소한다.
    peer_deltas: dict[tuple[str, str], list[float]] = {}
    for item in evidence:
        if item.score_2024 is None or item.score_2026 is None or item.common_units == 0:
            continue
        peer_deltas.setdefault((item.pest, item.crop), [])
        peer_deltas[(item.pest, item.crop)].append(
            item.score_2026 - item.score_2024
        )
    peer_medians = {
        key: float(np.median(values))
        for key, values in peer_deltas.items()
    }

    records: list[dict[str, Any]] = []
    for item in evidence:
        category = category_lookup.get(item.pest, "기타")
        both_years = item.score_2024 is not None and item.score_2026 is not None
        total_rows = item.observations + item.missing
        missing_rate = item.missing / total_rows if total_rows else 1.0
        confidence, confidence_reason = _confidence(
            both_years=both_years,
            common_units=item.common_units,
            observations=item.observations,
            missing_rate=missing_rate,
            volatility=item.volatility,
        )

        forecast: int | None = None
        trend = "전망자료 부족"
        source_years = ""
        basis = f"{confidence_reason} {MODEL_LIMITATION}"
        if item.score_2024 is not None:
            source_years = "2024"
        if item.score_2026 is not None:
            source_years = "2026" if not source_years else "2024·2026"

        if both_years and item.common_units > 0:
            score_2024 = float(item.score_2024)
            score_2026 = float(item.score_2026)
            local_delta = score_2026 - score_2024
            peer_delta = peer_medians.get((item.pest, item.crop), 0.0)
            sample_weight = item.observations / (item.observations + 12.0)
            shrunk_delta = sample_weight * local_delta + (1 - sample_weight) * peer_delta

            persistence = score_2026
            weighted_average = 0.35 * score_2024 + 0.65 * score_2026
            # 2년 변화의 1년분(×0.5)을 다시 70%로 완화해 총 0.35배만 연장한다.
            projected_change = float(np.clip(0.35 * shrunk_delta, -20, 20))
            damped_trend = float(np.clip(score_2026 + projected_change, 0, 100))
            forecast = int(round(damped_trend))
            forecast_delta = forecast - int(round(score_2026))
            trend = "증가" if forecast_delta >= 5 else "감소" if forecast_delta <= -5 else "유지"
            basis = (
                f"기준선 비교: 2026 유지 {persistence:.1f}점, 2024·2026 가중평균 "
                f"{weighted_average:.1f}점, 선택 모델(완화 추세+표본 축소) {damped_trend:.1f}점. "
                f"지역 변화 {local_delta:+.1f}점을 표본가중치 {sample_weight:.2f}로 같은 "
                f"병해충·작물의 지역 중앙 변화 {peer_delta:+.1f}점 방향에 축소하고, "
                f"1년 연장 변화는 ±20점으로 제한했습니다. {confidence_reason} {MODEL_LIMITATION}"
            )

        records.append(
            {
                "작물": item.crop,
                "병해충": item.pest,
                "유형": category,
                "지역": item.region,
                "위험도_2024": (
                    int(round(item.score_2024)) if item.score_2024 is not None else pd.NA
                ),
                "위험도_2026": (
                    int(round(item.score_2026)) if item.score_2026 is not None else pd.NA
                ),
                "전망위험도_2027": forecast if forecast is not None else pd.NA,
                "추세": trend,
                "신뢰도": confidence,
                "관측수": item.observations,
                "근거연도": source_years,
                "전망근거": basis,
                "대응유형": _risk_level(forecast),
            }
        )

    result = pd.DataFrame.from_records(records, columns=FORECAST_COLUMNS)
    for column in ["위험도_2024", "위험도_2026", "전망위험도_2027"]:
        result[column] = result[column].astype("Int64")
    return result.sort_values(["병해충", "작물", "지역"], kind="stable").reset_index(drop=True)


def generate_forecast_csv(path: Path = FORECAST_PATH) -> pd.DataFrame:
    frame = build_forecast_frame()
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8-sig")
    return frame


def forecast_summary(frame: pd.DataFrame | None = None) -> dict[str, Any]:
    data = frame if frame is not None else build_forecast_frame()
    numeric = data["전망위험도_2027"].dropna()
    return {
        "rows": int(len(data)),
        "forecast_available": int(data["전망위험도_2027"].notna().sum()),
        "forecast_insufficient": int(data["전망위험도_2027"].isna().sum()),
        "pests": int(data["병해충"].nunique()),
        "crops": int(data["작물"].nunique()),
        "regions": int(data["지역"].nunique()),
        "confidence": {
            str(key): int(value)
            for key, value in data["신뢰도"].value_counts().to_dict().items()
        },
        "trends": {
            str(key): int(value)
            for key, value in data["추세"].value_counts().to_dict().items()
        },
        "risk_levels": {
            str(key): int(value)
            for key, value in data["대응유형"].value_counts().to_dict().items()
        },
        "forecast_min": int(numeric.min()) if not numeric.empty else None,
        "forecast_max": int(numeric.max()) if not numeric.empty else None,
        "model": {
            "selected": "완화된 선형추세 + 표본 축소",
            "baselines": ["2026년 값 유지", "2024·2026 가중평균", "완화된 선형추세"],
            "formula": (
                "2027 = clip(2026 + clip(0.35 × shrink(2026-2024, 지역 중앙변화), "
                "-20, 20), 0, 100)"
            ),
            "selection_reason": (
                "두 연도뿐이므로 복잡한 학습모델은 검증할 수 없습니다. 2026 유지와 "
                "가중평균을 기준선으로 함께 제시하고, 방향성은 반영하되 절반 연장·70% "
                "완화·표본 축소·변화폭 제한을 적용한 보수적 추세식을 선택했습니다."
            ),
        },
        "disclaimer": FORECAST_DISCLAIMER,
        "limitation": MODEL_LIMITATION,
    }


if __name__ == "__main__":
    generated = generate_forecast_csv()
    print(json.dumps({
        "data_validation": validate_source_data(),
        "reference_data": validate_reference_data(),
        "forecast": forecast_summary(generated),
        "output": str(FORECAST_PATH.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))
