"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import styles from "./symbiosis-command-center.module.css";
import EcologicalRiskSignal from "./ecological-risk-signal";
import { downloadTextFile, openAppPage, primeSpeechSynthesis, speakKorean, stopSpeech } from "./browser-actions";

type Props = {
  apiBase: string;
  crop: string;
  pest: string;
  region: string;
};

type DecisionGate = {
  id: string;
  name: string;
  state: string;
  ready: boolean;
  evidence: string;
};

type MonthOutlook = {
  month: number;
  score: number | null;
  level: string;
  observation_count: number;
  evidence_rows: number;
  data_status: string;
};

type QuarterOutlook = {
  quarter: number;
  score: number | null;
  level: string;
  available_months: number;
  coverage: string;
};

type District = {
  name: string;
  source_rows: number;
  measured_values: number;
  positive_observations: number;
  actual_zero_observations: number;
  latest_observation_date: string | null;
  data_status: string;
};

type RepresentativeSite = {
  network_id: string;
  province: string;
  district: string;
  location: string;
  crop: string;
  survey_year: string;
  latitude: number | null;
  longitude: number | null;
  location_type: string;
  is_named_farm: boolean;
};

type CultivationMode = {
  code: string;
  name: string;
  facility: string;
  automation: string;
  description: string;
  data_rows: number;
  evidence_status: string;
};

type SafetyCategory = {
  name: string;
  rule_count: number;
  subcategories: string[];
  source_pages: number[];
  rules: string[];
};

type SafetyProtocol = {
  code: string;
  name: string;
  protective_equipment?: string[];
  prohibitions: string[];
  prevention?: string[];
  emergency_steps: string[];
  source: string;
};

type MachineryProtocol = SafetyProtocol & {
  pre_checks: string[];
  protective_devices: string[];
  safe_operations: string[];
};

type EnemyRecommendation = {
  name?: string;
  천적명?: string;
  scientific_name?: string;
  학명?: string;
  source?: string;
  출처?: string;
  timing_status: string;
  can_show_precise_timing: boolean;
  release_standard: Record<string, string | null>;
  effect_trajectory: EffectTrajectory;
};

type EffectPoint = {
  group: string;
  day: number | null;
  metric: string;
  reported_percent: number | null;
  direct_control: boolean;
  causal_interpretation_allowed: boolean;
  source_sentence: string;
  source: string;
  source_url: string;
};

type EffectTrajectory = {
  available: boolean;
  points: EffectPoint[];
  point_count?: number;
  groups?: string[];
  direct_control_available: boolean;
  group_comparison_available: boolean;
  display_mode?: string;
  generalized_effect_percent?: number | null;
  interpretation: string;
};

type DecisionResponse = {
  title: string;
  promise: string;
  selected_condition: {
    pest: string;
    crop: string;
    region: string;
    cultivation_mode: string;
  };
  forecast: {
    score: number | null;
    level: string;
    confidence: string;
  };
  decision_gates: DecisionGate[];
  cultivation: {
    selected: string;
    modes: CultivationMode[];
    criteria_rows: number;
    smartfarm_metadata_rows: number;
    selected_crop_metadata_rows: number;
    crop_examples: string[];
    greenhouse_types: string[];
    facility_types: string[];
    matched_regions: string[];
    matched_district_count: number;
    matched_district_examples: string[];
    source_fields: string[];
    data_status: string;
    risk_adjustment_applied: boolean;
    evidence_bridge: {
      available: boolean;
      rows: number;
      connected_rows?: number;
      grade_counts: Record<string, number>;
      best_grade: string;
      direct_field_key: boolean;
      risk_adjustment_allowed: boolean;
      matched_districts: string[];
      source_file?: string;
      purpose?: string;
      caution: string;
    };
    caution: string;
  };
  district_network: {
    status: string;
    row_count: number;
    district_count: number;
    districts: District[];
    indicators: Array<{ field_code: string; indicator_name: string; unit: string }>;
    observation_site_count: number;
    representative_sites: RepresentativeSite[];
    site_caution: string;
    risk_score_calculated: boolean;
    caution: string;
  };
  monthly_outlook: {
    months: MonthOutlook[];
    quarters: QuarterOutlook[];
    available_months: number;
    source_rows: number;
    caution: string;
  };
  natural_enemy: {
    connected: boolean;
    recommendations: EnemyRecommendation[];
    precise_timing_available: boolean;
    caution: string;
  };
  pesticide: {
    connected: boolean;
    registered_rows: number;
    matched_rows: number;
    unique_products: number;
    unique_brands: number;
    match_status: string;
    source_mode: string;
    source_date: string | null;
    source_file: string | null;
    modes: Array<{
      code: string;
      registered_rows: number;
      unique_products: number;
      unique_brands: number;
    }>;
    rotation_ready: boolean;
    rotation_message: string;
    products: Array<{
      crop: string | null;
      pest: string | null;
      registration_number: string | null;
      registration_date: string | null;
      product_name: string | null;
      brand_name: string | null;
      active_ingredient: string | null;
      ingredient_content: string | null;
      mode_of_action: string | null;
      use_type: string | null;
      formulation: string | null;
      method: string | null;
      dilution: string | null;
      amount: string | null;
      use_timing: string | null;
      safety_timing: string | null;
      use_count: string | null;
      harvest_interval_days: string | null;
      human_toxicity: string | null;
      fish_toxicity: string | null;
      company: string | null;
      registration_status: string;
    }>;
    api_key_required: boolean;
    api_key_status: string;
    sync_status: string;
    official_fields: string[];
    guide_url: string;
    application_url: string;
    search_url: string;
    caution: string;
  };
  safety: {
    official_checklist_rows: number;
    machinery_reference_rows: number;
    work_protocol_rows: number;
    category_counts: Record<string, number>;
    categories: SafetyCategory[];
    work_protocols: SafetyProtocol[];
    machinery: MachineryProtocol[];
    official_kosha_microdata_rows: number;
    kosha_observed_evidence: {
      available: boolean;
      period: string;
      observed_rows: number;
      annual_observations: Array<{ year: number; observed_rows: number }>;
      selected_region: string;
      selected_region_observed_rows: number | null;
      selected_region_offices: Array<{ office: string; observed_rows: number }>;
      top_occurrence_types: Array<{ type: string; observed_rows: number }>;
      is_accident_probability: boolean;
      source: string;
      caution: string;
    };
    predictive_accident_risk_available: boolean;
    relative_exposure: {
      available: boolean;
      status: string;
      observation_rows?: number;
      latest?: {
        date: string;
        region: string;
        relative_exposure_score: number | null;
        work_adjustment_signal: string;
        color: string;
        dominant_exposure: string;
        max_temperature_c: number | null;
        rainfall_mm: number | null;
        rainfall_actual_zero: string;
        max_wind_m_s: number | null;
        data_status: string;
      };
      recommended_checks?: string[];
      official_accident_policy_priorities?: Array<{
        category: string;
        item: string;
        value: number;
        unit: string;
        source_page: number;
        population: string;
      }>;
      is_accident_probability: boolean;
      method?: string;
      caution: string;
    };
    status: string;
    source: string;
    caution: string;
  };
  integrated_management: {
    surveillance: string[];
    physical: string[];
    biological: string[];
    chemical: string[];
    caution: string;
  };
  policy_action_pack: string[];
  effectiveness: {
    status: string;
    estimated_percent: number | null;
    can_compare_before_after: boolean;
    reported_trajectory_available: boolean;
    group_comparison_available: boolean;
    trajectory: EffectTrajectory;
    required_evidence: string[];
    caution: string;
  };
  future_innovation: {
    name: string;
    current_status: string;
    description: string;
    required_data: string[];
    implemented: string[];
    image_uploaded_to_server: boolean;
    diagnostic_model_active: boolean;
  };
  missing_data: string[];
  research_caution: string;
};

const managementLabels: Record<string, { number: string; title: string; kicker: string }> = {
  surveillance: { number: "01", title: "예찰", kicker: "먼저 확인" },
  physical: { number: "02", title: "물리", kicker: "초기 억제" },
  biological: { number: "03", title: "생물", kicker: "근거 연결" },
  chemical: { number: "04", title: "등록농약", kicker: "라벨 준수" },
};

function tone(level: string, ready = true) {
  if (!ready || level.includes("없") || level.includes("부족") || level.includes("미연결")) return styles.missing;
  if (level.includes("고위험")) return styles.danger;
  if (level.includes("주의")) return styles.warning;
  if (level.includes("관찰") || level.includes("연결")) return styles.ready;
  return styles.neutral;
}

function displayValue(value: string | number | null | undefined, suffix = "") {
  return value === null || value === undefined || value === "" ? "자료 없음" : `${value}${suffix}`;
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function SymbiosisCommandCenter({ apiBase, crop, pest, region }: Props) {
  const [data, setData] = useState<DecisionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cultivationMode, setCultivationMode] = useState("전체");
  const [activeGate, setActiveGate] = useState("pressure");
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedPesticideMode, setSelectedPesticideMode] = useState("");
  const [selectedSafetyCategory, setSelectedSafetyCategory] = useState("");
  const [expandedTrack, setExpandedTrack] = useState("surveillance");
  const [selectedSite, setSelectedSite] = useState("");
  const [downloadComplete, setDownloadComplete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      pest,
      crop: crop || "전체",
      region: region || "전체",
      cultivation_mode: cultivationMode,
    });
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/decision-support?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`의사결정 API 오류 (${response.status})`);
        return (await response.json()) as DecisionResponse;
      })
      .then((payload) => {
        setData(payload);
        setSelectedDistrict(payload.district_network.districts[0]?.name ?? "");
        setSelectedSite("");
        setSelectedPesticideMode(payload.pesticide.modes[0]?.code ?? "");
        setSelectedSafetyCategory(payload.safety.categories[0]?.name ?? "");
        const firstAvailable = payload.monthly_outlook.months.find((item) => item.score !== null);
        setSelectedMonth(firstAvailable?.month ?? 1);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "의사결정 자료를 읽지 못했습니다.");
        setData(null);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiBase, crop, cultivationMode, pest, region]);

  useEffect(() => {
    primeSpeechSynthesis();
    return () => stopSpeech();
  }, []);

  const activeGateData = data?.decision_gates.find((item) => item.id === activeGate);
  const activeCultivationMode = data?.cultivation.modes.find((mode) => mode.name === cultivationMode);
  const activeMonth = data?.monthly_outlook.months.find((item) => item.month === selectedMonth);
  const activeDistrict = data?.district_network.districts.find((item) => item.name === selectedDistrict);
  const districtSites = useMemo(
    () => data?.district_network.representative_sites.filter((site) => site.district === selectedDistrict) ?? [],
    [data, selectedDistrict],
  );
  const activeSite = districtSites.find((site) => site.network_id === selectedSite) ?? districtSites[0];
  const activePesticideMode = data?.pesticide.modes.find((mode) => mode.code === selectedPesticideMode);
  const activeSafetyCategory = data?.safety.categories.find((item) => item.name === selectedSafetyCategory);
  const activeWorkProtocol = data?.safety.work_protocols.find((item) => item.name === selectedSafetyCategory);
  const activeMachinery = data?.safety.machinery[0];
  const safetyExposure = data?.safety.relative_exposure;
  const displayedPesticides = useMemo(() => {
    if (!data) return [];
    const matching = selectedPesticideMode
      ? data.pesticide.products.filter((product) => product.mode_of_action === selectedPesticideMode)
      : data.pesticide.products;
    return matching.slice(0, 6);
  }, [data, selectedPesticideMode]);
  const readiness = useMemo(
    () => data?.decision_gates.filter((item) => item.ready).length ?? 0,
    [data],
  );

  const selectAndSpeakSafety = (category: SafetyCategory) => {
    setSelectedSafetyCategory(category.name);
    const summary = category.rules.slice(0, 3).join(". ");
    speakKorean(`${category.name} 핵심 안전수칙입니다. ${summary}`, { rate: 0.92 });
  };

  const openPesticidePassport = (product: DecisionResponse["pesticide"]["products"][number]) => {
    if (!product.registration_number) return;
    const params = new URLSearchParams({ registration_number: product.registration_number });
    openAppPage(`/pesticide-detail?${params.toString()}`);
  };

  const downloadActionPack = () => {
    if (!data) return;
    const rows: Array<[string, string, string, string]> = [
      ["선택조건", "병해충", data.selected_condition.pest, "사용자 선택"],
      ["선택조건", "작물", data.selected_condition.crop, "사용자 선택"],
      ["선택조건", "지역", data.selected_condition.region, "사용자 선택"],
      ["선택조건", "재배유형", data.selected_condition.cultivation_mode, data.cultivation.data_status],
      ["2027전망", "상대위험 전망", displayValue(data.forecast.score, "점"), `${data.forecast.level} · 신뢰도 ${data.forecast.confidence}`],
      ...data.decision_gates.map((gate) => ["근거관문", gate.name, gate.state, gate.evidence] as [string, string, string, string]),
      ...data.district_network.districts.slice(0, 10).map((district) => [
        "시군구 조사망",
        district.name,
        `양성 ${district.positive_observations} · 실제0 ${district.actual_zero_observations}`,
        district.data_status,
      ] as [string, string, string, string]),
      ...data.natural_enemy.recommendations.slice(0, 8).map((enemy) => [
        "검증 천적",
        enemy.name ?? enemy.천적명 ?? "천적명 자료 없음",
        enemy.timing_status,
        enemy.source ?? enemy.출처 ?? "출처 자료 없음",
      ] as [string, string, string, string]),
      ...displayedPesticides.map((product) => [
        "등록농약 옵션",
        product.brand_name ?? product.product_name ?? "제품명 자료 없음",
        `작용기작 ${displayValue(product.mode_of_action)} · ${displayValue(product.use_timing)}`,
        `등록 ${displayValue(product.registration_number)} · 사용 전 최신 라벨 재확인`,
      ] as [string, string, string, string]),
      ...data.policy_action_pack.map((action, index) => ["행정 액션팩", `실행 ${index + 1}`, action, "관측·전망 근거 확인 필요"] as [string, string, string, string]),
      ...(activeSafetyCategory?.rules ?? []).slice(0, 8).map((rule) => ["작업 안전", activeSafetyCategory?.name ?? "공식수칙", rule, data.safety.source] as [string, string, string, string]),
      ...(safetyExposure?.latest ? [[
        "작업 안전 상대노출",
        `${safetyExposure.latest.date} ${safetyExposure.latest.region}`,
        `${safetyExposure.latest.work_adjustment_signal} · ${safetyExposure.latest.relative_exposure_score}점`,
        "동일 월 ASOS 상대순위 · 사고확률 아님",
      ] as [string, string, string, string]] : []),
      ["연구한계", "해석주의", data.research_caution, "자료 없음은 저위험으로 대체하지 않음"],
    ];
    const csv = [
      ["구분", "항목", "결과", "근거·주의"].map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\r\n");
    const safePest = pest.replace(/[^0-9A-Za-z가-힣_-]/g, "_");
    downloadTextFile(
      ["\uFEFF", csv],
      `공생AI_현장행정_액션팩_${safePest || "전체"}.csv`,
      "text/csv;charset=utf-8",
    );
    setDownloadComplete(true);
    window.setTimeout(() => setDownloadComplete(false), 2500);
  };

  return (
    <section className={styles.section} aria-labelledby="symbiosis-command-title">
      <header className={styles.header}>
        <div className={styles.sectionIndex}>04</div>
        <div>
          <p className={styles.eyebrow}>SYMBIOSIS DECISION COMMAND</p>
          <h2 id="symbiosis-command-title">천적 도입 타당성을 검토합니다</h2>
        </div>
        <p className={styles.headerCopy}>
          위험지역 지정에서 멈추지 않고, 예찰·천적·등록농약·안전작업을 같은 근거선 위에서
          현장 행동으로 전환합니다.
        </p>
      </header>

      <div className={styles.heroPanel}>
        <div className={styles.heroCopy}>
          <span className={styles.liveTag}>EVIDENCE-GATED FIELD ACTION</span>
          <h3>{data?.promise ?? "관측근거를 현장 행동으로 연결합니다."}</h3>
          <p>
            색이 켜졌다는 것은 자료가 있다는 뜻입니다. 자료 없음은 저위험이나 발생 없음으로 바꾸지 않습니다.
          </p>
        </div>
        <div className={styles.conditionStrip}>
          <div><span>병해충</span><strong>{pest}</strong></div>
          <div><span>작물</span><strong>{crop || "전체"}</strong></div>
          <div><span>지역</span><strong>{region || "전체"}</strong></div>
          <label>
            <span>재배유형</span>
            <select value={cultivationMode} onChange={(event) => setCultivationMode(event.target.value)}>
              <option value="전체">전체</option>
              {data?.cultivation.modes.map((mode) => (
                <option key={mode.code || mode.name} value={mode.name}>{mode.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? <div className={styles.stateBox}>근거자료를 연결하고 있습니다.</div> : null}
      {error ? <div className={`${styles.stateBox} ${styles.error}`}>{error}</div> : null}

      {data ? (
        <>
          <div className={styles.gateShell}>
            <div className={styles.gateHeading}>
              <div>
                <p className={styles.miniEyebrow}>EVIDENCE CONNECTIONS</p>
                <h3>도입 검토를 위한 자료 연결</h3>
              </div>
              <EcologicalRiskSignal
                className={styles.commandForecastSignal}
                mini
                score={data.forecast.score}
                title="2027 전망"
              />
              <div className={styles.readinessDial} aria-label={`근거 관문 ${readiness}/4 연결`}>
                <span>{readiness}</span><small>/ 4 자료 연결 · 도입 판정 아님</small>
              </div>
            </div>
            <div className={styles.gateGrid}>
              {data.decision_gates.map((gate, index) => (
                <button
                  className={`${styles.gate} ${tone(gate.state, gate.ready)} ${activeGate === gate.id ? styles.gateActive : ""}`}
                  key={gate.id}
                  onClick={() => setActiveGate(gate.id)}
                  type="button"
                >
                  <span className={styles.gateNumber}>0{index + 1}</span>
                  <strong>{gate.name}</strong>
                  <b>{gate.state}</b>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className={styles.gateEvidence}>
              <span>{activeGateData?.name}</span>
              <strong>{activeGateData?.evidence}</strong>
              <p>{activeGateData?.ready ? "현장 판단에 사용할 수 있는 근거가 연결되었습니다." : "근거가 보강되기 전에는 정밀 판단을 보류합니다."}</p>
            </div>
          </div>

          <article className={styles.cultivationConsole}>
            <div className={styles.cultivationHeading}>
              <div>
                <span>GROWING SYSTEM EVIDENCE SWITCH</span>
                <h3>노지 · 시설원예 · 스마트팜 근거 분리</h3>
              </div>
              <b>{data.cultivation.data_status}</b>
            </div>
            <div className={styles.cultivationModes}>
              {data.cultivation.modes.map((mode, index) => (
                <button
                  aria-pressed={cultivationMode === mode.name}
                  className={cultivationMode === mode.name ? styles.cultivationActive : ""}
                  key={mode.code}
                  onClick={() => setCultivationMode(mode.name)}
                  style={{ "--cultivation-hue": `${145 - index * 44}` } as CSSProperties}
                  type="button"
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{mode.name}</strong>
                  <small>{mode.facility}</small>
                  <b>{mode.evidence_status}</b>
                  <em>{mode.data_rows.toLocaleString("ko-KR")}행</em>
                </button>
              ))}
            </div>
            <div className={styles.cultivationEvidence}>
              <div><span>스마트팜 원천</span><strong>{data.cultivation.smartfarm_metadata_rows.toLocaleString("ko-KR")}행</strong></div>
              <div><span>선택 작물 일치</span><strong>{data.cultivation.selected_crop_metadata_rows.toLocaleString("ko-KR")}행</strong></div>
              <div><span>시도 연결</span><strong>{data.cultivation.matched_regions.length}개</strong></div>
              <div><span>시군구 연결</span><strong>{data.cultivation.matched_district_count}개</strong></div>
              <p>{data.cultivation.caution}</p>
            </div>
            <div className={styles.cultivationSelected}>
              <div>
                <span>선택 채널 해석</span>
                <strong>{activeCultivationMode?.name ?? "전체 재배유형"}</strong>
                <p>{activeCultivationMode?.description ?? "재배유형을 선택하면 해당 근거 범위가 표시됩니다."}</p>
              </div>
              <div>
                <span>선택 작물의 스마트팜 확인 지역</span>
                <p className={styles.locationChips}>
                  {data.cultivation.matched_district_examples.length
                    ? data.cultivation.matched_district_examples.map((district) => <b key={district}>{district}</b>)
                    : <b>직접 일치 지역 없음</b>}
                </p>
              </div>
            </div>
            <div className={styles.bridgeLedger}>
              <div>
                <span>SPATIOTEMPORAL EVIDENCE BRIDGE</span>
                <strong>{data.cultivation.evidence_bridge.best_grade}</strong>
                <small>{data.cultivation.evidence_bridge.purpose ?? "재배환경 맥락 연결"}</small>
              </div>
              <dl>
                <div><dt>선택 조건 원장</dt><dd>{data.cultivation.evidence_bridge.rows.toLocaleString("ko-KR")}행</dd></div>
                <div><dt>연결 근거</dt><dd>{(data.cultivation.evidence_bridge.connected_rows ?? 0).toLocaleString("ko-KR")}행</dd></div>
                <div><dt>직접 필지키</dt><dd>{data.cultivation.evidence_bridge.direct_field_key ? "확보" : "미확보"}</dd></div>
                <div><dt>점수 보정</dt><dd>{data.cultivation.evidence_bridge.risk_adjustment_allowed ? "허용" : "금지"}</dd></div>
              </dl>
              <div className={styles.bridgeGrades}>
                {Object.entries(data.cultivation.evidence_bridge.grade_counts).map(([grade, count]) => (
                  <span data-grade={grade} key={grade}><b>{grade}</b>{count.toLocaleString("ko-KR")}</span>
                ))}
              </div>
              <p>{data.cultivation.evidence_bridge.caution}</p>
            </div>
            <div className={styles.cultivationFields}>
              {data.cultivation.source_fields.map((field) => <span key={field}>{field}</span>)}
            </div>
          </article>

          <div className={styles.twoColumn}>
            <article className={styles.panel}>
              <div className={styles.panelTitle}>
                <div><span>01 · SEASON RADAR</span><h3>2027 월별 대응 레이더</h3></div>
                <b>{data.monthly_outlook.available_months}/12개월 근거</b>
              </div>
              <div className={styles.monthGrid}>
                {data.monthly_outlook.months.map((month) => (
                  <button
                    className={`${styles.monthTile} ${tone(month.level, month.score !== null)} ${selectedMonth === month.month ? styles.monthActive : ""}`}
                    key={month.month}
                    onClick={() => setSelectedMonth(month.month)}
                    type="button"
                  >
                    <span>{String(month.month).padStart(2, "0")}</span>
                    <strong>{month.level}</strong>
                    <b>{month.score === null ? "—" : `${month.score.toFixed(0)}점`}</b>
                    <i style={{ "--fill": `${month.score ?? 0}%` } as CSSProperties} />
                  </button>
                ))}
              </div>
              <div className={styles.monthDetail}>
                <div><span>선택 월</span><strong>{selectedMonth}월</strong></div>
                <div><span>전망 단계</span><strong>{activeMonth?.level ?? "자료 없음"}</strong></div>
                <div><span>관측근거</span><strong>{activeMonth?.observation_count ?? 0}건</strong></div>
                <p>{activeMonth?.data_status ?? "전망자료 부족"}</p>
              </div>
              <EcologicalRiskSignal
                className={styles.monthSignal}
                compact
                score={activeMonth?.score}
                title={`${selectedMonth}월 대응 신호`}
              />
              <div className={styles.quarterRail}>
                {data.monthly_outlook.quarters.map((quarter) => (
                  <div className={tone(quarter.level, quarter.score !== null)} key={quarter.quarter}>
                    <span>{quarter.quarter}분기</span>
                    <strong>{quarter.level}</strong>
                    <b>{quarter.score === null ? "—" : `${quarter.score.toFixed(0)}점`}</b>
                    <small>{quarter.coverage}</small>
                  </div>
                ))}
              </div>
              <p className={styles.caution}>{data.monthly_outlook.caution}</p>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelTitle}>
                <div><span>02 · DISTRICT DRILL-DOWN</span><h3>시군구 조사망 신호</h3></div>
                <b>{data.district_network.district_count}개 지역</b>
              </div>
              <div className={styles.districtBody}>
                <div className={styles.districtList}>
                  {data.district_network.districts.slice(0, 12).map((district, index) => (
                    <button
                      className={selectedDistrict === district.name ? styles.districtActive : ""}
                      key={district.name}
                      onClick={() => {
                        setSelectedDistrict(district.name);
                        setSelectedSite("");
                      }}
                      type="button"
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{district.name}</strong>
                      <b>{district.positive_observations} 신호</b>
                    </button>
                  ))}
                  {!data.district_network.districts.length ? <p className={styles.empty}>선택 조건과 일치하는 시군구 자료가 없습니다.</p> : null}
                </div>
                <div className={styles.districtDetail}>
                  <span>SELECTED DISTRICT</span>
                  <h4>{activeDistrict?.name ?? "미연결"}</h4>
                  <dl>
                    <div><dt>원천행</dt><dd>{activeDistrict?.source_rows ?? 0}</dd></div>
                    <div><dt>측정값</dt><dd>{activeDistrict?.measured_values ?? 0}</dd></div>
                    <div><dt>양성신호</dt><dd>{activeDistrict?.positive_observations ?? 0}</dd></div>
                    <div><dt>실제 0</dt><dd>{activeDistrict?.actual_zero_observations ?? 0}</dd></div>
                  </dl>
                  <p>최근 조사일 {displayValue(activeDistrict?.latest_observation_date)}</p>
                  <div className={styles.siteDrilldown}>
                    <div className={styles.sitePath}>
                      <span>{region || "전국"}</span><i>›</i><span>{activeDistrict?.name ?? "시군구 미선택"}</span><i>›</i><b>{districtSites.length}개 관측지점</b>
                    </div>
                    <div className={styles.siteConstellation} aria-label="공식 관측지점 선택">
                      {districtSites.map((site, index) => (
                        <button
                          aria-label={`${site.location || site.district} 관측지점 선택`}
                          className={(activeSite?.network_id === site.network_id) ? styles.siteActive : ""}
                          key={`${site.network_id}-${index}`}
                          onClick={() => setSelectedSite(site.network_id)}
                          title={`${site.crop || "작물 미상"} · ${site.location || site.district}`}
                          type="button"
                        ><span>{index + 1}</span></button>
                      ))}
                      {!districtSites.length ? <small>이 조건과 직접 일치하는 공식 관측지점이 없습니다.</small> : null}
                    </div>
                    {activeSite ? (
                      <div className={styles.siteCard}>
                        <span>OFFICIAL SURVEILLANCE NODE</span>
                        <strong>{activeSite.location || `${activeSite.province} ${activeSite.district}`}</strong>
                        <p>{activeSite.crop || "작물 미상"} · {activeSite.survey_year || "연도 미상"} · {activeSite.location_type || "예찰망"}</p>
                        <small>{activeSite.latitude !== null && activeSite.longitude !== null ? `${activeSite.latitude.toFixed(4)}, ${activeSite.longitude.toFixed(4)}` : "공개 좌표 없음"}</small>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className={styles.siteCaution}>{data.district_network.site_caution}</p>
              <p className={styles.caution}>{data.district_network.caution}</p>
            </article>
          </div>

          <article className={`${styles.panel} ${styles.fullPanel}`}>
            <div className={styles.panelTitle}>
              <div><span>03 · INTEGRATED PEST MANAGEMENT</span><h3>한 번에 읽는 통합방제 가이드</h3></div>
              <b>4단계 현장 루트</b>
            </div>
            <div className={styles.managementGrid}>
              {Object.entries(managementLabels).map(([key, label]) => {
                const entries = data.integrated_management[key as keyof Omit<typeof data.integrated_management, "caution">] as string[];
                return (
                  <button
                    className={`${styles.managementCard} ${expandedTrack === key ? styles.managementActive : ""}`}
                    key={key}
                    onClick={() => setExpandedTrack(key)}
                    type="button"
                  >
                    <span>{label.number}</span>
                    <small>{label.kicker}</small>
                    <strong>{label.title}</strong>
                    <b>{expandedTrack === key ? "−" : "+"}</b>
                  </button>
                );
              })}
            </div>
            <div className={styles.managementDetail}>
              <div>
                <span>ACTIVE PROTOCOL</span>
                <h4>{managementLabels[expandedTrack]?.title}</h4>
              </div>
              <ol>
                {(data.integrated_management[expandedTrack as keyof Omit<typeof data.integrated_management, "caution">] as string[]).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            {expandedTrack === "biological" ? (
              <div className={styles.enemyStrip}>
                <div>
                  <span>NATURAL ENEMY TIMING</span>
                  <strong>{data.natural_enemy.connected ? `${data.natural_enemy.recommendations.length}종 검증 연결` : "검증 연결 없음"}</strong>
                </div>
                {data.natural_enemy.recommendations.slice(0, 4).map((enemy) => (
                  <div key={enemy.name ?? enemy.천적명}>
                    <b>{enemy.name ?? enemy.천적명}</b>
                    <small>{enemy.scientific_name ?? enemy.학명 ?? "학명 자료 없음"}</small>
                    <em className={enemy.can_show_precise_timing ? styles.statusReady : styles.statusMissing}>{enemy.timing_status}</em>
                  </div>
                ))}
                <p>{data.natural_enemy.caution}</p>
              </div>
            ) : null}

            {expandedTrack === "chemical" ? (
              <div className={styles.pesticideStrip}>
                <div className={styles.pesticideSourceCard}>
                  <span>OFFICIAL REGISTRATION SNAPSHOT</span>
                  <strong>{data.pesticide.source_mode}</strong>
                  <small>기준일 {displayValue(data.pesticide.source_date)}</small>
                  <b>{data.pesticide.registered_rows.toLocaleString("ko-KR")}행 검증 연결</b>
                </div>
                <div className={styles.pesticideMatchCard}>
                  <span>EXACT CONDITION MATCH</span>
                  <strong>{data.pesticide.match_status}</strong>
                  <dl>
                    <div><dt>일치 등록행</dt><dd>{data.pesticide.matched_rows.toLocaleString("ko-KR")}</dd></div>
                    <div><dt>고유 품목</dt><dd>{data.pesticide.unique_products.toLocaleString("ko-KR")}</dd></div>
                    <div><dt>고유 상표</dt><dd>{data.pesticide.unique_brands.toLocaleString("ko-KR")}</dd></div>
                    <div><dt>작용기작</dt><dd>{data.pesticide.modes.length.toLocaleString("ko-KR")}</dd></div>
                  </dl>
                </div>
                <div className={styles.pesticideSyncCard}>
                  <span>DATA CURRENCY</span>
                  <strong>{data.pesticide.sync_status}</strong>
                  <small>현재 조회에는 API키가 필요하지 않습니다.</small>
                  <a href={data.pesticide.search_url} rel="noreferrer" target="_blank">공식 전체목록 재확인</a>
                </div>

                {data.pesticide.modes.length ? (
                  <div className={styles.modeConsole}>
                    <div className={styles.modeConsoleHeading}>
                      <div>
                        <span>MODE-OF-ACTION ROTATION CONSOLE</span>
                        <strong>같은 계통의 연속 사용을 피하기 위한 비교 레일</strong>
                      </div>
                      <b className={data.pesticide.rotation_ready ? styles.statusReady : styles.statusMissing}>
                        {data.pesticide.rotation_message}
                      </b>
                    </div>
                    <div className={styles.modeRail}>
                      {data.pesticide.modes.slice(0, 8).map((mode, index) => (
                        <button
                          aria-pressed={selectedPesticideMode === mode.code}
                          className={selectedPesticideMode === mode.code ? styles.modeActive : ""}
                          key={mode.code}
                          onClick={() => setSelectedPesticideMode(mode.code)}
                          style={{ "--mode-hue": `${24 + index * 31}` } as CSSProperties}
                          type="button"
                        >
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{mode.code}</strong>
                          <small>{mode.registered_rows}행 · {mode.unique_products}품목</small>
                          <i aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                    <div className={styles.activeModeSummary}>
                      <span>선택 작용기작</span>
                      <strong>{displayValue(activePesticideMode?.code)}</strong>
                      <p>
                        등록 {activePesticideMode?.registered_rows ?? 0}행 · 고유 품목 {activePesticideMode?.unique_products ?? 0}개 ·
                        고유 상표 {activePesticideMode?.unique_brands ?? 0}개
                      </p>
                    </div>
                  </div>
                ) : null}

                {displayedPesticides.length ? (
                  <div className={styles.productGrid}>
                    {displayedPesticides.map((product, index) => (
                      <article key={`${product.registration_number}-${product.brand_name}-${index}`}>
                        <div className={styles.productHeading}>
                          <span>{product.use_type ?? "용도 자료 없음"}</span>
                          <b>작용기작 {displayValue(product.mode_of_action)}</b>
                        </div>
                        <button
                          aria-label={`${product.brand_name ?? product.product_name ?? "제품"} 디지털 제품여권 새 창으로 열기`}
                          className={styles.productNameButton}
                          onClick={() => openPesticidePassport(product)}
                          type="button"
                        >
                          <strong>{product.brand_name ?? product.product_name ?? "제품명 자료 없음"}</strong>
                          <span>디지털 제품여권 새창 ↗</span>
                        </button>
                        <small>{displayValue(product.product_name)} · {displayValue(product.formulation)}</small>
                        <dl>
                          <div><dt>유효성분</dt><dd>{displayValue(product.active_ingredient)} {displayValue(product.ingredient_content)}</dd></div>
                          <div><dt>사용방법</dt><dd>{displayValue(product.method)}</dd></div>
                          <div><dt>사용적기</dt><dd>{displayValue(product.use_timing)}</dd></div>
                          <div><dt>희석·사용량</dt><dd>{displayValue(product.dilution)} · {displayValue(product.amount)}</dd></div>
                          <div className={styles.safetyRule}><dt>안전사용</dt><dd>{displayValue(product.safety_timing)} · {displayValue(product.use_count)}</dd></div>
                          <div><dt>독성</dt><dd>인축 {displayValue(product.human_toxicity)} · 어독 {displayValue(product.fish_toxicity)}</dd></div>
                        </dl>
                        <footer>
                          <span>등록 {displayValue(product.registration_number)}</span>
                          <span>{displayValue(product.company)}</span>
                        </footer>
                      </article>
                    ))}
                  </div>
                ) : <div className={styles.pesticideEmpty}>선택한 작물·병해충·작용기작과 정확히 일치하는 등록 옵션이 없습니다.</div>}

                <div className={styles.pesticideFields}>
                  {data.pesticide.official_fields.map((field) => <span key={field}>{field}</span>)}
                </div>
                <p>{data.pesticide.caution}</p>
              </div>
            ) : null}
          </article>

          <div className={styles.twoColumn}>
            <article className={`${styles.panel} ${styles.actionPanel}`}>
              <div className={styles.panelTitle}>
                <div><span>04 · POLICY ACTION PACK</span><h3>지자체·현장 실행안</h3></div>
                <button className={styles.policyDownloadButton} onClick={downloadActionPack} type="button">{downloadComplete ? "저장 요청 완료" : "현장·행정 CSV 내려받기"}</button>
              </div>
              <ol className={styles.actionList}>
                {data.policy_action_pack.map((action, index) => (
                  <li key={action}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>
                ))}
              </ol>
              <div className={styles.safetyBand}>
                <span>SAFE OPERATION GATE</span>
                <strong>{data.safety.status}</strong>
                <b>{data.safety.official_checklist_rows}개 공식 항목</b>
                <p>{data.safety.caution}</p>
              </div>
              {data.safety.kosha_observed_evidence?.available ? (
                <div className={styles.koshaEvidenceBand}>
                  <div className={styles.koshaEvidenceLead}>
                    <span>KOSHA OBSERVED MICRODATA</span>
                    <strong>{data.safety.official_kosha_microdata_rows.toLocaleString()}행</strong>
                    <small>{data.safety.kosha_observed_evidence.period} · 농업 재해자 실제 관측</small>
                  </div>
                  <div className={styles.koshaEvidenceRegion}>
                    <span>선택 지역 관측</span>
                    <strong>{data.safety.kosha_observed_evidence.selected_region}</strong>
                    <b>{data.safety.kosha_observed_evidence.selected_region_observed_rows == null
                      ? "전국 조건"
                      : `${data.safety.kosha_observed_evidence.selected_region_observed_rows.toLocaleString()}행`}</b>
                  </div>
                  <div className={styles.koshaEvidenceEvents}>
                    {data.safety.kosha_observed_evidence.top_occurrence_types.slice(0, 3).map((item, index) => (
                      <div key={item.type}>
                        <i aria-hidden="true" style={{ "--rank": index } as CSSProperties} />
                        <span>{item.type}</span>
                        <b>{item.observed_rows.toLocaleString()}</b>
                      </div>
                    ))}
                  </div>
                  <p>{data.safety.kosha_observed_evidence.caution}</p>
                </div>
              ) : null}
              <div className={styles.safetyConsole}>
                <div className={styles.safetyConsoleHeading}>
                  <div>
                    <span>PRE-WORK STOP RULE</span>
                    <strong>작업 전 안전 게이트</strong>
                  </div>
                  <b>사고확률 생성 안 함</b>
                </div>
                {safetyExposure?.available && safetyExposure.latest ? (
                  <div className={styles.exposureCommand}>
                    <div className={styles.exposureSignal} data-tone={safetyExposure.latest.color}>
                      <span>ASOS RELATIVE EXPOSURE</span>
                      <div className={styles.exposureOrb} aria-hidden="true"><i /></div>
                      <strong>{safetyExposure.latest.work_adjustment_signal}</strong>
                      <b>{displayValue(safetyExposure.latest.relative_exposure_score, "점")}</b>
                      <small>{safetyExposure.latest.date} · {safetyExposure.latest.region}</small>
                    </div>
                    <div className={styles.exposureTelemetry}>
                      <div><span>주요 노출</span><strong>{safetyExposure.latest.dominant_exposure}</strong></div>
                      <div><span>최고기온</span><strong>{displayValue(safetyExposure.latest.max_temperature_c, "℃")}</strong></div>
                      <div><span>강수</span><strong>{displayValue(safetyExposure.latest.rainfall_mm, "mm")}</strong><small>실제 0: {safetyExposure.latest.rainfall_actual_zero}</small></div>
                      <div><span>최대풍속</span><strong>{displayValue(safetyExposure.latest.max_wind_m_s, "m/s")}</strong></div>
                    </div>
                    <div className={styles.exposureActions}>
                      <span>지금 확인할 공식 안전수칙</span>
                      <ol>{(safetyExposure.recommended_checks ?? []).slice(0, 3).map((rule) => <li key={rule}>{rule}</li>)}</ol>
                    </div>
                    <div className={styles.accidentPriorityRail}>
                      {(safetyExposure.official_accident_policy_priorities ?? []).filter((item) => item.category === "기종" || item.item === "추락·전도").slice(0, 5).map((item) => (
                        <div key={`${item.category}-${item.item}`}>
                          <span>{item.category}</span><strong>{item.item}</strong><b>{item.value}{item.unit}</b>
                        </div>
                      ))}
                    </div>
                    <p className={styles.exposureCaution}>{safetyExposure.caution}</p>
                  </div>
                ) : (
                  <div className={styles.exposureUnavailable}>선택 조건의 실제 기상 관측이 없어 상대노출 신호를 만들지 않았습니다.</div>
                )}
                <div className={styles.safetyCategoryRail}>
                  {data.safety.categories.map((category, index) => (
                    <button
                      aria-pressed={selectedSafetyCategory === category.name}
                      className={selectedSafetyCategory === category.name ? styles.safetyCategoryActive : ""}
                      key={category.name}
                      onClick={() => selectAndSpeakSafety(category)}
                      style={{ "--safety-hue": `${18 + index * 25}` } as CSSProperties}
                      type="button"
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{category.name}</strong>
                      <small>{category.rule_count}개 수칙</small>
                      <i aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <div className={styles.safetyRulePanel}>
                  <div>
                    <span>선택 위험</span>
                    <h4>{activeSafetyCategory?.name ?? "공식 수칙"}</h4>
                    <button onClick={() => activeSafetyCategory && selectAndSpeakSafety(activeSafetyCategory)} type="button">🔊 핵심 듣기</button>
                  </div>
                  <ol>
                    {(activeSafetyCategory?.rules ?? []).slice(0, 3).map((rule) => <li key={rule}>{rule}</li>)}
                  </ol>
                </div>
                {activeWorkProtocol ? (
                  <div className={styles.stopRules}>
                    <span>작업 중지·금지 조건</span>
                    {(activeWorkProtocol.prohibitions.length ? activeWorkProtocol.prohibitions : ["원문에 별도 작업금지조건이 기재되지 않았습니다."]).map((rule) => <b key={rule}>{rule}</b>)}
                  </div>
                ) : null}
                {activeMachinery ? (
                  <div className={styles.machineGuard}>
                    <div><span>MACHINE GUARD</span><strong>{activeMachinery.name}</strong></div>
                    <ul>
                      {activeMachinery.pre_checks.slice(0, 1).map((rule) => <li key={rule}>{rule}</li>)}
                      {activeMachinery.safe_operations.slice(0, 1).map((rule) => <li key={rule}>{rule}</li>)}
                    </ul>
                  </div>
                ) : null}
                <small className={styles.safetySource}>근거: {data.safety.source}</small>
              </div>
            </article>

            <article className={`${styles.panel} ${styles.integrityPanel}`}>
              <div className={styles.panelTitle}>
                <div><span>05 · EVIDENCE INTEGRITY</span><h3>효과성과 한계 원장</h3></div>
                <b>{data.effectiveness.status}</b>
              </div>
              {data.effectiveness.trajectory.available ? (
                <div className={styles.effectTrajectory}>
                  <div className={styles.effectTrajectoryHeading}>
                    <div><span>OFFICIAL REPORTED TRAJECTORY</span><strong>공식 시험군 보고값 궤적</strong></div>
                    <b>{data.effectiveness.trajectory.direct_control_available ? "직접 대조" : "조건부 보고값"}</b>
                  </div>
                  <div className={styles.effectOrbit}>
                    {data.effectiveness.trajectory.points.slice(0, 16).map((point, index) => (
                      <div className={styles.effectPoint} key={`${point.group}-${point.day}-${point.metric}-${index}`}>
                        <span>{point.group}</span>
                        <i style={{ "--reported": `${Math.max(0, Math.min(100, point.reported_percent ?? 0))}%` } as CSSProperties} />
                        <strong>{point.reported_percent === null ? "자료 없음" : `${point.reported_percent}%`}</strong>
                        <small>{point.day === null ? "시점 미기재" : `${point.day}일`} · {point.metric}</small>
                      </div>
                    ))}
                  </div>
                  <p>{data.effectiveness.trajectory.interpretation}</p>
                </div>
              ) : (
                <div className={styles.effectLock}>
                  <div className={styles.lockIcon}>—</div>
                  <div><span>예상 방제효과</span><strong>수치 표시 보류</strong><p>처리군·무처리 대조군 검증 전에는 효과율을 만들지 않습니다.</p></div>
                </div>
              )}
              <div className={styles.requiredEvidence}>
                {data.effectiveness.required_evidence.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className={styles.scanSlot}>
                <span>IMPLEMENTED FIELD RESEARCH SLOT</span>
                <h4>{data.future_innovation.name}</h4>
                <p>{data.future_innovation.description}</p>
                <b>{data.future_innovation.current_status}</b>
                <div className={styles.scanImplemented}>
                  {data.future_innovation.implemented.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
            </article>
          </div>

          <details className={styles.missingLedger}>
            <summary>정확도를 더 높이기 위해 필요한 공식 데이터 {data.missing_data.length}종</summary>
            <ul>{data.missing_data.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
          <p className={styles.researchCaution}>{data.research_caution}</p>
        </>
      ) : null}
    </section>
  );
}
