"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  CloudSun,
  Database,
  Gauge,
  GitBranch,
  Globe2,
  LockKeyhole,
  Microscope,
  RadioTower,
  Scale,
  ShieldCheck,
  TimerReset,
  TriangleAlert,
  Waves,
} from "lucide-react";
import styles from "./research-analysis-lab.module.css";
import KilnStatusNotice from "./kiln-status";
import EcologicalRiskSignal, { labelFromScore } from "./ecological-risk-signal";
import EcologicalEvidenceLab from "./ecological-evidence-lab";

type Benchmark = {
  code: string;
  name: string;
  pair_count: number;
  mae: number | null;
  rmse: number | null;
  rank_correlation: number | null;
  selected: boolean;
};

type Feature = {
  feature: string;
  coefficient: number | null;
  evidence_count: number;
  grade: string;
  direction: string;
  importance: number | null;
};

type YearEvidence = {
  year: number;
  year_status: string;
  risk_score: number | null;
  analysis_units: number;
  source_observations: number;
  feature_completeness: number | null;
  lag_windows: {
    "7d_temperature": number | null;
    "14d_temperature": number | null;
    "30d_temperature": number | null;
    "30d_humidity": number | null;
    "30d_wind": number | null;
    "30d_rain": number | null;
  };
};

type ExtendedWeatherServices = {
  status: string;
  run_id?: string;
  tested?: number;
  approved?: number;
  actual_data?: number;
  direct_model_inputs?: number;
  categories: Array<{
    category: string;
    tested: number;
    approved: number;
    actual_data: number;
    response_rows: number;
  }>;
  services: Array<{
    category: string;
    service_id: string;
    name: string;
    http_status: number;
    rows: number;
    approved: boolean;
    actual_data: boolean;
    role: string;
    decision: string;
    reason: string;
    policy: string;
  }>;
  full_audit?: {
    status: string;
    run_id: string;
    official_endpoints: number;
    http_200: number;
    permission_denied: number;
    gateway_errors: number;
    timeouts: number;
    permission_application_group_count: number;
    app_context_connected: number;
    forecast_direct_inputs: number;
    integration_policy: string;
    category_summary: Array<{
      category: string;
      documented_endpoints: number;
      http_200: number;
      permission_denied: number;
      timeouts: number;
      layer_name: string;
      data_nature: string;
      analysis_role: string;
      app_context_connected: number;
      forecast_direct_inputs: number;
    }>;
    fusion_recheck?: {
      status: string;
      run_id: string;
      catalogued: number;
      live_http_200: number;
      permission_denied: number;
      gateway_pending: number;
      request_count: number;
      all_catalogued: boolean;
      all_live_validated: boolean;
      key_plaintext_persisted: boolean;
      report: string;
    };
  };
};

type ResearchResponse = {
  status: string;
  pest: string;
  crop: string;
  region: string;
  confidence: string;
  evidence_index: number | null;
  common_pair_count: number | null;
  weather_feature_completeness: number | null;
  core_lag_factors: string;
  forecast_interval: { lower: number | null; point: number | null; upper: number | null };
  summary: {
    run_id: string;
    total_evidence_rows: number;
    source_rows: { asos: number; ncpms: number; aws_valid: number; marine: number };
    derived_rows: {
      station_day: number;
      province_day: number;
      analysis_units: number;
      common_pairs: number;
      feature_relationships: number;
    };
    weather_join_percent: number;
    selected_baseline: string;
    selected_mae: number;
  };
  benchmarks: Benchmark[];
  top_features: Feature[];
  year_evidence: YearEvidence[];
  safeguards: Array<{ label: string; status: string; detail: string }>;
  extended_weather_services: ExtendedWeatherServices;
  multiyear_analysis?: {
    status: string;
    run_id?: string;
    condition_available?: boolean;
    condition_unit_count?: number;
    confidence?: string;
    forecast_score?: number | null;
    series: Array<{
      year: number;
      kind: string;
      year_status: string;
      score: number | null;
      source_rows: number;
    }>;
    benchmarks: Array<{
      code: string;
      name: string;
      unit_count: number;
      mae: number | null;
      rmse: number | null;
      rank_correlation: number | null;
      mae_ci95: Array<number | null>;
      selected: boolean;
      bootstrap_best_percent: number;
    }>;
    region_rankings?: Array<{
      region: string;
      score_2024: number | null;
      score_2025: number | null;
      score_2026: number | null;
      forecast_score: number;
      observation_count: number;
      confidence: string;
    }>;
    summary: {
      common_three_year_units?: number;
      year_rows?: Record<string, number>;
      year_status?: Record<string, string>;
      selected_model_name?: string;
      raw_mae_best_model?: string;
      statistical_tie?: boolean;
      selection_rule?: string;
      bootstrap_repeats?: number;
      selection_stability_percent?: number;
      top_two_combined_stability_percent?: number;
      selected_mae?: number;
      selected_mae_ci95?: number[];
      actual_zero_rows?: number;
      missing_occurrence_rows?: number;
      target_policy?: string;
    };
    disclaimer?: string;
  };
  model_tribunal?: {
    status: string;
    run_id?: string;
    common_spatiotemporal_pairs?: number;
    bootstrap_repeats?: number;
    candidate_models?: number;
    selected_model_name?: string;
    selected_mae?: number;
    selected_mae_ci95?: number[];
    leave_one_region_out_scenarios?: number;
    selection_stability_percent?: number;
    subgroup_error_rows?: number;
    feature_stability_rows?: number;
  };
  limitations: string;
  source: string;
};

type SafetyResponse = {
  status: string;
  run_id: string;
  source: {
    name: string;
    publication_year: number;
    page: string;
    api_key_required: boolean;
    source_rows: number;
    work_categories: number;
    machinery_rows: number;
  };
  open_api: {
    name: string;
    official_page: string;
    format: string;
    key_required: boolean;
    service_approval_required: boolean;
    development_review: string;
    production_review: string;
    nongsaro_key_status: string;
    public_data_key_status: string;
    key_note: string;
  };
  categories: Array<{
    name: string;
    rule_count: number;
    subcategories: string[];
    pages: number[];
    rules: string[];
  }>;
  machinery: Array<{
    code: string;
    name: string;
    pre_checks: string[];
    protective_devices: string[];
    protective_equipment: string[];
    safe_operations: string[];
    prohibitions: string[];
    emergency_steps: string[];
    source: string;
  }>;
  portal_catalogue: {
    status: string;
    run_id: string;
    source_name: string;
    source_page: string;
    api_key_required: boolean;
    page_count: number;
    content_count: number;
    publication_count: number;
    board_count: number;
    video_count: number;
    machinery_content_count: number;
    media_files_downloaded: number;
    integration_method: string;
  };
  knowledge_domains: Array<{
    name: string;
    content_count: number;
    content_types: string[];
    representative_titles: string[];
  }>;
  featured_contents: Array<{
    id: string;
    category: string;
    section: string;
    title: string;
    content_type: string;
    duration: string;
    published_at: string;
    official_url: string;
    download_available: boolean;
  }>;
  machinery_catalogue: Array<{
    name: string;
    content_count: number;
    examples: Array<{ title: string; content_type: string; official_url: string }>;
  }>;
  official_sections: Array<{ name: string; url: string }>;
  limitations: string;
};

const number = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("ko-KR");

const metric = (value: number | null | undefined, unit = "") =>
  value === null || value === undefined ? "자료 없음" : `${value.toLocaleString("ko-KR")}${unit}`;

export default function ResearchAnalysisLab({
  apiBase,
  pest,
  crop,
  region,
}: {
  apiBase: string;
  pest: string;
  crop: string;
  region: string;
}) {
  const [data, setData] = useState<ResearchResponse | null>(null);
  const [safety, setSafety] = useState<SafetyResponse | null>(null);
  const [selectedSafety, setSelectedSafety] = useState("농업기계");
  const [protocolMode, setProtocolMode] = useState<"audit" | "uncertainty" | "decision">("audit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ pest });
    if (crop && crop !== "전체") params.set("crop", crop);
    if (region && region !== "전체") params.set("region", region);
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/analysis/research?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`연구분석 API ${response.status}`);
        return response.json();
      })
      .then((payload: ResearchResponse) => setData(payload))
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiBase, crop, pest, region]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/safety/guidance`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`안전자료 API ${response.status}`);
        return response.json();
      })
      .then((payload: SafetyResponse) => {
        setSafety(payload);
        setSelectedSafety((current) => (
          payload.categories.some((item) => item.name === current)
            ? current
            : payload.categories[0]?.name ?? ""
        ));
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setSafety(null);
      });
    return () => controller.abort();
  }, [apiBase]);

  const benchmarkMax = useMemo(
    () => Math.max(1, ...(data?.benchmarks.map((item) => item.mae ?? 0) ?? [1])),
    [data],
  );
  const evidenceAngle = Math.max(0, Math.min(100, data?.evidence_index ?? 0)) * 3.6;
  const interval = data?.forecast_interval;
  const fullAudit = data?.extended_weather_services?.full_audit;
  const selectedSafetyCategory = safety?.categories.find((item) => item.name === selectedSafety);
  const machinerySafety = safety?.machinery[0];
  const selectedBenchmark = data?.benchmarks.find((item) => item.selected);
  const intervalWidth = interval?.lower !== null && interval?.lower !== undefined
    && interval?.upper !== null && interval?.upper !== undefined
    ? Math.max(0, interval.upper - interval.lower)
    : null;
  const passedSafeguards = data?.safeguards.filter((item) => item.status === "통과").length ?? 0;
  const multiyear = data?.multiyear_analysis;
  const tribunal = data?.model_tribunal;
  const multiyearYears = multiyear?.summary.year_status
    ? Object.keys(multiyear.summary.year_status).length
    : 0;

  return (
    <section className={styles.section} id="research-lab" aria-busy={loading}>
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.index}>04</div>
          <div>
            <p>EXPLAINABLE AI · EVIDENCE ARCHITECTURE</p>
            <h2>대규모 연구분석 콘솔</h2>
          </div>
          <div className={styles.headerNote}>
            <BrainCircuit size={22} />
            <span>복잡한 모델보다 실제 재현오차가 낮은 기준선을 채택하고, AI는 근거 탐색과 불확실성 설명에 사용합니다.</span>
          </div>
        </header>

        <KilnStatusNotice apiBase={apiBase} financeHref={`/agent-finance?${new URLSearchParams({ crop, pest, region }).toString()}`} />

        {loading && <div className={styles.state}>225만 ASOS 시간자료 기반 연구근거를 불러오는 중입니다.</div>}
        {error && <div className={`${styles.state} ${styles.error}`}>{error}</div>}
        {!loading && !error && data?.status !== "complete" && (
          <div className={styles.state}>검증된 Stage 6 연구분석 산출물이 없습니다.</div>
        )}

        {!loading && !error && data?.status === "complete" && (
          <>
            <div className={styles.scaleBand}>
              <div className={styles.scaleLead}>
                <Database size={28} />
                <span>검증에 투입된 실제 근거 레코드</span>
                <strong>{number(data.summary.total_evidence_rows)}</strong>
                <small>브라우저에는 집계 결과만 전송 · 원본은 서버에서 추적</small>
              </div>
              <div className={styles.scaleItem}><b>ASOS</b><strong>{number(data.summary.source_rows.asos)}</strong><span>전국 시간관측 · 모델 직접 사용</span></div>
              <div className={styles.scaleItem}><b>AWS</b><strong>{number(data.summary.source_rows.aws_valid)}</strong><span>고해상도 부분기간 · 혼합 제외</span></div>
              <div className={styles.scaleItem}><b>NCPMS</b><strong>{number(data.summary.source_rows.ncpms)}</strong><span>실제 발생관측 · 0/결측 분리</span></div>
              <div className={styles.scaleItem}><b>해양</b><strong>{number(data.summary.source_rows.marine)}</strong><span>연안 맥락 부분기간 · 별도 보존</span></div>
            </div>

            <div className={styles.heroGrid}>
              <article className={styles.intervalCard}>
                <div className={styles.cardLabel}><Gauge size={18} /> 선택 조건 연구 신뢰구간</div>
                <div className={styles.condition}>{data.pest} · {data.crop} · {data.region}</div>
                <div className={styles.intervalNumbers}>
                  <span><small>하한</small>{number(interval?.lower)}</span>
                  <strong><small>2027 전망</small>{number(interval?.point)}</strong>
                  <span><small>상한</small>{number(interval?.upper)}</span>
                </div>
                <div className={styles.intervalTrack}>
                  {interval?.point !== null && interval?.point !== undefined && (
                    <>
                      <i style={{ left: `${interval.lower ?? 0}%`, width: `${(interval.upper ?? 0) - (interval.lower ?? 0)}%` }} />
                      <b style={{ left: `${interval.point}%` }} />
                    </>
                  )}
                </div>
                <EcologicalRiskSignal
                  className={styles.researchSignal}
                  compact
                  score={interval?.point}
                  title="2027 검증 전망 신호"
                />
                <p>2024·2025 완전연도와 2026 부분연도를 분리하고, 전망 구간으로 시간축 불확실성을 숨기지 않습니다.</p>
              </article>

              <article className={styles.evidenceDialCard}>
                <div className={styles.dial} style={{ "--dial": `${evidenceAngle}deg` } as React.CSSProperties}>
                  <div><strong>{metric(data.evidence_index)}</strong><span>근거지수</span></div>
                </div>
                <div>
                  <span className={`${styles.confidence} ${styles[`confidence${data.confidence}`]}`}>{data.confidence} 신뢰도</span>
                  <h3>공통 비교 {number(data.common_pair_count)}쌍</h3>
                  <p>기상특징 완전율 {metric(data.weather_feature_completeness, "%")}</p>
                  <small>핵심 시차근거: {data.core_lag_factors}</small>
                </div>
              </article>
            </div>

            <div className={styles.analysisGrid}>
              <article className={styles.benchmarkPanel}>
                <div className={styles.panelHeader}>
                  <div><TimerReset size={20} /><span>MODEL BENCHMARK</span></div>
                  <p>기존 양년 기준선과 3개년 후향검증을 분리 · MAE는 낮을수록 우수</p>
                </div>
                <div className={styles.benchmarks}>
                  {data.benchmarks.map((item) => (
                    <div className={`${styles.benchmark} ${item.selected ? styles.selected : ""}`} key={item.code}>
                      <div><span>{item.selected ? "채택" : "비교"}</span><b>{item.name}</b><small>{number(item.pair_count)}쌍</small></div>
                      <div className={styles.bar}><i style={{ width: `${Math.max(4, ((item.mae ?? 0) / benchmarkMax) * 100)}%` }} /></div>
                      <strong>{item.mae?.toFixed(3) ?? "—"}<small> MAE</small></strong>
                    </div>
                  ))}
                </div>
                <div className={styles.benchmarkConclusion}>
                  <ShieldCheck size={18} /> 복잡한 기상 아날로그보다 실제 오차가 낮은 <b>2024 값 유지 기준선</b>을 선택했습니다.
                </div>
              </article>

              <article className={styles.pipelinePanel}>
                <div className={styles.panelHeader}>
                  <div><Microscope size={20} /><span>ANALYTICAL PIPELINE</span></div>
                  <p>원본에서 앱 결과까지 추적 가능한 분석 축약</p>
                </div>
                <div className={styles.pipeline}>
                  <div><strong>{number(data.summary.source_rows.asos)}</strong><span>ASOS 시간행</span></div>
                  <i>→</i><div><strong>{number(data.summary.derived_rows.station_day)}</strong><span>지점·일</span></div>
                  <i>→</i><div><strong>{number(data.summary.derived_rows.analysis_units)}</strong><span>연구단위</span></div>
                  <i>→</i><div><strong>{number(data.summary.derived_rows.common_pairs)}</strong><span>공통쌍</span></div>
                </div>
                <div className={styles.pipelineStats}>
                  <span><CheckCircle2 size={16} /> 조사 전 기상 연결 {data.summary.weather_join_percent.toFixed(2)}%</span>
                  <span><CheckCircle2 size={16} /> 미래 시간 누수 0건</span>
                  <span><CheckCircle2 size={16} /> 시차특징 관계 {number(data.summary.derived_rows.feature_relationships)}개</span>
                </div>
              </article>
            </div>

            <article className={styles.protocolLedger}>
              <header className={styles.protocolHeader}>
                <div>
                  <GitBranch size={23} />
                  <span>REPRODUCIBLE RESEARCH PROTOCOL · F27-RX3</span>
                  <h3>심사위원 검증용 분석 프로토콜 원장</h3>
                </div>
                <nav aria-label="연구 프로토콜 보기 전환">
                  <button className={protocolMode === "audit" ? styles.protocolActive : ""} onClick={() => setProtocolMode("audit")} type="button">검증 설계</button>
                  <button className={protocolMode === "uncertainty" ? styles.protocolActive : ""} onClick={() => setProtocolMode("uncertainty")} type="button">불확실성</button>
                  <button className={protocolMode === "decision" ? styles.protocolActive : ""} onClick={() => setProtocolMode("decision")} type="button">판단 경계</button>
                </nav>
              </header>

              {protocolMode === "audit" && (
                <div className={styles.protocolBody}>
                  <div className={styles.protocolFlow} aria-label="분석 재현 흐름">
                    <div><b>01</b><strong>원천 동결</strong><span>NCPMS·ASOS 원본과 중복행 보존</span></div><i>→</i>
                    <div><b>02</b><strong>3년 공통단위</strong><span>작물×병해충×지역×회차×지표</span></div><i>→</i>
                    <div><b>03</b><strong>P95 척도</strong><span>연도 내 지도·3개년 공통척도 분리</span></div><i>→</i>
                    <div><b>04</b><strong>2026 백테스트</strong><span>2024·2025만 보고 2026을 가려 재현</span></div><i>→</i>
                    <div><b>05</b><strong>짝지은 경쟁</strong><span>3모델×1,000회 동일 재표본 MAE</span></div><i>→</i>
                    <div><b>06</b><strong>근거 잠금</strong><span>미확보 효과·확률·방사량 생성 금지</span></div>
                  </div>
                  {multiyear?.status === "complete" && (
                    <div className={styles.yearBacktest}>
                      <header>
                        <div>
                          <span>THREE-YEAR BLIND BACKTEST</span>
                          <strong>2024·2025 → 2026 가림검증 → 2027 전망</strong>
                        </div>
                        <b>{number(multiyear.summary.common_three_year_units)}개 엄격 공통단위</b>
                      </header>
                      <div className={styles.yearTrajectory}>
                        {multiyear.series.map((item, index) => {
                          const signal = item.score === null ? "#879b9a" : item.score >= 67 ? "#ff5b47" : item.score >= 34 ? "#ffb33d" : "#43dfad";
                          return (
                            <Fragment key={item.year}>
                              {index > 0 && <i>→</i>}
                              <section style={{ "--year-signal": signal } as CSSProperties}>
                                <span>{item.year_status}</span>
                                <b>{item.year}</b>
                                <strong>{item.score === null ? "자료 부족" : `${item.score.toFixed(1)}점`}</strong>
                                <em>{labelFromScore(item.score)}</em>
                                <small>{item.kind}</small>
                              </section>
                            </Fragment>
                          );
                        })}
                      </div>
                      <footer>
                        <div><span>채택 원칙</span><b>{multiyear.summary.selected_model_name}</b></div>
                        <div><span>2026 재현 MAE</span><b>{multiyear.summary.selected_mae?.toFixed(4) ?? "—"}</b></div>
                        <div><span>95% 구간</span><b>{multiyear.summary.selected_mae_ci95?.map((value) => value.toFixed(2)).join("–") ?? "—"}</b></div>
                        <div><span>재표본</span><b>{number(multiyear.summary.bootstrap_repeats)}회</b></div>
                        <p>{multiyear.summary.selection_rule}</p>
                      </footer>
                    </div>
                  )}
                  <div className={styles.protocolCards}>
                    <section>
                      <span>SELECTED BASELINE</span>
                      <strong>{multiyear?.summary.selected_model_name ?? selectedBenchmark?.name ?? data.summary.selected_baseline}</strong>
                      <p>3개년 공통 {number(multiyear?.summary.common_three_year_units ?? selectedBenchmark?.pair_count ?? data.common_pair_count)}단위 · MAE {multiyear?.summary.selected_mae?.toFixed(3) ?? selectedBenchmark?.mae?.toFixed(3) ?? data.summary.selected_mae.toFixed(3)}</p>
                    </section>
                    <section>
                      <span>FORECAST EQUATION</span>
                      <strong>백테스트 우승 + 단순성 동률 규칙</strong>
                      <code>S27 = S26 · MAE 개선폭 &lt; 0.25이면 복잡한 모델을 기각</code>
                    </section>
                    <section>
                      <span>LEAKAGE GUARD</span>
                      <strong>미래 정보 누수 0건</strong>
                      <p>조사 당일 이후 기상과 2027 미관측값은 학습·보정에 사용하지 않습니다.</p>
                    </section>
                    <section>
                      <span>REPRODUCIBILITY</span>
                      <strong>{passedSafeguards}/{data.safeguards.length} 검증관문 통과</strong>
                      <p>{number(tribunal?.bootstrap_repeats ?? multiyear?.summary.bootstrap_repeats)}회 재표본 · {number(tribunal?.leave_one_region_out_scenarios)}개 지역 제외검증 · 실행 ID {multiyear?.run_id ?? data.summary.run_id}</p>
                    </section>
                  </div>
                </div>
              )}

              {protocolMode === "uncertainty" && (
                <div className={styles.uncertaintyBody}>
                  <div className={styles.uncertaintyLead}>
                    <TriangleAlert size={30} />
                    <span>UNCERTAINTY BUDGET</span>
                    <h4>오차를 숨기지 않고 네 층으로 분해합니다</h4>
                    <p>2024·2025 완전연도와 2026 부분연도의 표본 불균형을 신뢰구간·재표본·완전율로 동시에 공개합니다.</p>
                  </div>
                  <div className={styles.uncertaintyGrid}>
                    <section><span>시간축</span><b>{multiyearYears || data.year_evidence.length}개 관측연도</b><p>2024·2025 완전연도 · 2026 부분연도 명시</p></section>
                    <section><span>표본축</span><b>{number(multiyear?.summary.common_three_year_units ?? data.common_pair_count)} 공통단위</b><p>세 연도 동일 조건만 백테스트에 승인</p></section>
                    <section><span>기상축</span><b>{metric(data.weather_feature_completeness, "%")}</b><div><i style={{ width: `${Math.max(0, Math.min(100, data.weather_feature_completeness ?? 0))}%` }} /></div><p>결측 기상은 0으로 대체하지 않음</p></section>
                    <section><span>전망구간</span><b>{intervalWidth === null ? "자료 없음" : `${intervalWidth}점 폭`}</b><div><i style={{ width: `${Math.max(0, Math.min(100, intervalWidth ?? 0))}%` }} /></div><p>{metric(interval?.lower)}–{metric(interval?.upper)} · 점추정 {metric(interval?.point)}</p></section>
                  </div>
                  <footer><Scale size={18} /><p><b>해석 원칙</b> 구간이 넓거나 근거 완전율이 낮으면 숫자를 더 정밀하게 보이게 만들지 않고, 현장 예찰 우선으로 전환합니다.</p></footer>
                </div>
              )}

              {protocolMode === "decision" && (
                <div className={styles.claimBoundary}>
                  <div className={styles.claimAllowed}>
                    <CheckCircle2 size={24} />
                    <span>RELEASED CLAIMS</span>
                    <h4>현재 자료로 말할 수 있음</h4>
                    <ul>
                      <li>2024·2025·2026 동일 조건의 상대위험 변화</li>
                      <li>2027 상대위험 전망과 보수적 신뢰구간</li>
                      <li>검증 DB에 직접 연결된 천적·등록농약 정보</li>
                      <li>관측지점·시군구·축산 집계의 공개 근거 위치</li>
                    </ul>
                  </div>
                  <div className={styles.claimLocked}>
                    <LockKeyhole size={24} />
                    <span>EVIDENCE-LOCKED CLAIMS</span>
                    <h4>추가 시험 전에는 잠금</h4>
                    <ul>
                      <li>실제 발생확률 또는 확정 발생 예보</li>
                      <li>처리·대조시험 없는 천적 방제효과율</li>
                      <li>작물·해충 조건이 없는 정량 방사량</li>
                      <li>농장·작업일시 공통키 없는 개인 사고확률</li>
                    </ul>
                  </div>
                  <footer>
                    <ShieldCheck size={19} />
                    <p><b>의사결정 출력</b> 위험색은 관찰·주의·고위험의 현장 우선순위를 뜻하며, 치료효과나 사고확률을 뜻하지 않습니다.</p>
                  </footer>
                </div>
              )}
            </article>

            <div className={styles.evidenceGrid}>
              <article className={styles.featurePanel}>
                <div className={styles.panelHeader}>
                  <div><Activity size={20} /><span>LAGGED WEATHER EVIDENCE</span></div>
                  <p>조사 당일을 제외한 7·14·30일 특징 · 연관성은 인과가 아님</p>
                </div>
                <div className={styles.features}>
                  {data.top_features.length ? data.top_features.map((item, index) => (
                    <div className={styles.feature} key={item.feature}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><b>{item.feature}</b><small>{item.direction} · {item.grade} · {number(item.evidence_count)}단위</small></div>
                      <strong className={(item.coefficient ?? 0) < 0 ? styles.negative : ""}>{item.coefficient === null ? "—" : `${item.coefficient > 0 ? "+" : ""}${item.coefficient.toFixed(3)}`}</strong>
                    </div>
                  )) : <p className={styles.empty}>선택 조건에서 해석 가능한 시차기상 근거가 부족합니다.</p>}
                </div>
              </article>

              <article className={styles.yearPanel}>
                <div className={styles.panelHeader}>
                  <div><Waves size={20} /><span>YEAR EVIDENCE MATRIX</span></div>
                  <p>같은 조건의 관측연도별 조사 전 환경</p>
                </div>
                <div className={styles.yearCards}>
                  {data.year_evidence.map((item) => (
                    <div className={styles.yearCard} key={item.year}>
                      <header><strong>{item.year}</strong><span>{item.year_status}</span></header>
                      <div className={styles.risk}><span>상대위험</span><b>{metric(item.risk_score)}</b></div>
                      <dl>
                        <div><dt>7일 기온</dt><dd>{metric(item.lag_windows["7d_temperature"], "℃")}</dd></div>
                        <div><dt>30일 기온</dt><dd>{metric(item.lag_windows["30d_temperature"], "℃")}</dd></div>
                        <div><dt>30일 습도</dt><dd>{metric(item.lag_windows["30d_humidity"], "%")}</dd></div>
                        <div><dt>30일 풍속</dt><dd>{metric(item.lag_windows["30d_wind"], "m/s")}</dd></div>
                      </dl>
                      <footer>{number(item.analysis_units)} 분석단위 · 완전율 {metric(item.feature_completeness, "%")}</footer>
                    </div>
                  ))}
                  {!data.year_evidence.length && <p className={styles.empty}>선택 조건의 연도별 연구단위가 없습니다.</p>}
                </div>
              </article>
            </div>

            {data.extended_weather_services?.status === "complete" && (
              <article className={styles.extensionPanel}>
                <div className={styles.extensionHeader}>
                  <div>
                    <CloudSun size={22} />
                    <span>KMA MULTI-DOMAIN VERIFICATION</span>
                    <h3>기상청 6개 승인 분야 실응답 검증</h3>
                  </div>
                  <p>
                    <strong>{number(fullAudit?.http_200 ?? data.extended_weather_services.actual_data)} / {number(fullAudit?.official_endpoints ?? data.extended_weather_services.tested)}</strong>
                    공식 endpoint 자동 권한 감사
                  </p>
                </div>

                <div className={styles.categoryGrid}>
                  {(fullAudit?.category_summary ?? data.extended_weather_services.categories.map((item) => ({
                    category: item.category,
                    documented_endpoints: item.tested,
                    http_200: item.actual_data,
                    permission_denied: item.tested - item.approved,
                    timeouts: 0,
                  }))).map((item, index) => (
                    <div className={styles.categoryCard} key={item.category}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><b>{item.category}</b><small>정상 {item.http_200}/{item.documented_endpoints} · 403 {item.permission_denied}</small></div>
                      <strong>{number(item.http_200)}<small> API</small></strong>
                    </div>
                  ))}
                </div>

                {fullAudit && fullAudit.permission_denied > 0 && (
                  <div className={styles.permissionNotice}>
                    <RadioTower size={18} />
                    <p><b>전수 감사에서 403 {number(fullAudit.permission_denied)}개 확인</b>예특보·산업특화는 전부 정상이며, 세계기상·융합기상의 미승인 부가 서비스는 공식 신청 그룹으로 분리했습니다.</p>
                    <span>504 {number(fullAudit.gateway_errors)}개 · 시간초과 {number(fullAudit.timeouts)}개</span>
                  </div>
                )}

                {fullAudit && fullAudit.permission_denied === 0 && (
                  <div className={styles.auditPass}>
                    <CheckCircle2 size={18} />
                    <p><b>여섯 분야 승인 누락 0개</b>{number(fullAudit.official_endpoints)}개 공식 endpoint를 다시 검사해 {number(fullAudit.http_200)}개가 정상 응답했습니다. 남은 {number(fullAudit.gateway_errors)}개는 승인 오류가 아닌 KMA 융합기상 게이트웨이 504입니다.</p>
                    <span>403 0 · 504 {number(fullAudit.gateway_errors)}</span>
                  </div>
                )}

                {fullAudit?.fusion_recheck && (
                  <div className={styles.fusionRecheck}>
                    <RadioTower size={18} />
                    <div>
                      <span>FUSION 45 ENDPOINT GATE</span>
                      <b>카탈로그 {number(fullAudit.fusion_recheck.catalogued)}/45 · 실응답 {number(fullAudit.fusion_recheck.live_http_200)}/45</b>
                      <small>공식 예시 매개변수로 {number(fullAudit.fusion_recheck.request_count)}회 집중 재검증 · 403 {number(fullAudit.fusion_recheck.permission_denied)} · KMA 504 대기 {number(fullAudit.fusion_recheck.gateway_pending)}</small>
                    </div>
                    <strong>{fullAudit.fusion_recheck.all_live_validated ? "전수 통과" : "승인 정상 · 게이트웨이 대기"}</strong>
                  </div>
                )}

                {fullAudit && (
                  <div className={styles.layerGrid}>
                    {fullAudit.category_summary.map((item, index) => (
                      <div className={styles.layerCard} key={`layer-${item.category}`}>
                        <header>
                          <span>LAYER {String(index + 1).padStart(2, "0")}</span>
                          <b>{item.data_nature}</b>
                        </header>
                        <h4>{item.layer_name}</h4>
                        <small>{item.category} · 실응답 {number(item.app_context_connected)} API</small>
                        <i>{item.forecast_direct_inputs > 0 ? `2027 직접 변수 ${item.forecast_direct_inputs}개` : "2027 보조 근거층"}</i>
                        <p>{item.analysis_role}</p>
                      </div>
                    ))}
                    <div className={styles.layerPolicy}>
                      <ShieldCheck size={22} />
                      <p><b>분석 고도화 연결 원칙</b>{fullAudit.integration_policy}</p>
                      <span><strong>{number(fullAudit.app_context_connected)}</strong> CONTEXT API</span>
                    </div>
                  </div>
                )}

                {!fullAudit && <div className={styles.serviceMatrix}>
                  {data.extended_weather_services.services.map((item) => (
                    <div className={`${styles.serviceRow} ${item.actual_data ? styles.serviceReady : styles.serviceHold}`} key={item.service_id}>
                      <div className={styles.serviceIdentity}>
                        {item.category === "세계기상" ? <Globe2 size={17} /> : <RadioTower size={17} />}
                        <span><b>{item.name}</b><small>{item.category} · {item.service_id}</small></span>
                      </div>
                      <div className={styles.serviceResult}>
                        <strong>{item.actual_data ? "실자료 확인" : item.http_status === 403 ? "승인 확인 필요" : "재검증 대기"}</strong>
                        <small>HTTP {item.http_status || "TIMEOUT"} · {number(item.rows)}행</small>
                      </div>
                      <p><b>{item.decision}</b>{item.reason}</p>
                    </div>
                  ))}
                </div>}

                <div className={styles.extensionPolicy}>
                  <ShieldCheck size={18} />
                  <p><b>모델 보호 원칙</b> 현재 응답은 시점별 스모크 검증이므로 2027 점수에 직접 투입하지 않습니다. 세계기상은 국내 결측 대체에 쓰지 않고, 융합격자는 ASOS 실측과 분리해 교차검증합니다.</p>
                  <span>직접 입력 {number(fullAudit?.forecast_direct_inputs ?? data.extended_weather_services.direct_model_inputs)}개 변수</span>
                </div>
              </article>
            )}

            {safety?.status === "complete" && (
              <article className={styles.safetyPanel}>
                <div className={styles.safetyHeader}>
                  <div>
                    <ShieldCheck size={24} />
                    <span>OFFICIAL FARM SAFETY KNOWLEDGE LAYER</span>
                    <h3>농작업·농기계 안전 의사결정층</h3>
                  </div>
                  <div className={styles.safetyCounters}>
                    <strong>{number(safety.source.source_rows)}<small> 공식 수칙</small></strong>
                    <strong>{number(safety.portal_catalogue.content_count)}<small> 공식 콘텐츠</small></strong>
                    <strong>{number(safety.portal_catalogue.publication_count)}<small> 간행물·연구자료</small></strong>
                  </div>
                </div>

                <div className={styles.safetySourceBand}>
                  <div><b>검증 체크리스트</b><span>{safety.source.name} · {safety.source.publication_year}년 · {number(safety.source.work_categories)}개 위험분류</span></div>
                  <div><b>공개 지식 카탈로그</b><span>{number(safety.portal_catalogue.page_count)}개 페이지 · 공개목록 {number(safety.portal_catalogue.board_count)}건 · 영상 {number(safety.portal_catalogue.video_count)}건</span></div>
                  <div className={safety.open_api.nongsaro_key_status === "설정됨" ? styles.keyReady : styles.keyPending}>
                    <b>확장 OpenAPI</b><span>{safety.open_api.nongsaro_key_status === "설정됨" ? "키 설정됨" : "승인 대기"}</span>
                  </div>
                </div>

                {safety.portal_catalogue.status === "complete" && (
                  <div className={styles.safetyCatalogue}>
                    <div className={styles.safetyCatalogueLead}>
                      <span>PUBLIC EVIDENCE CATALOGUE</span>
                      <h4>공식 안전지식 탐색 레이어</h4>
                      <p>사이트에 공개된 교육·간행물·연구성과를 출처와 이용조건이 유지되는 메타데이터로 연결했습니다. 대용량 영상은 앱에 복제하지 않고 공식 원문으로 이동합니다.</p>
                      <div>
                        {safety.official_sections.map((item) => (
                          <a href={item.url} key={item.name} target="_blank" rel="noreferrer">{item.name}<i>↗</i></a>
                        ))}
                      </div>
                      <small>CATALOGUE · {safety.portal_catalogue.run_id}</small>
                    </div>

                    <div className={styles.safetyKnowledgeMatrix}>
                      <header><span>EVIDENCE DOMAINS</span><b>{number(safety.knowledge_domains.length)}개 지식영역</b></header>
                      <div>
                        {safety.knowledge_domains.slice(0, 8).map((item, index) => (
                          <article key={item.name}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <b>{item.name}</b>
                            <strong>{number(item.content_count)}</strong>
                            <small>{item.content_types.join(" · ") || "공식 웹자료"}</small>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className={styles.safetyResourceFeed}>
                      <header><span>CURATED OFFICIAL SOURCES</span><b>최신·대표 근거</b></header>
                      <div>
                        {safety.featured_contents.slice(0, 8).map((item) => (
                          <a href={item.official_url} key={item.id} target="_blank" rel="noreferrer">
                            <span>{item.content_type}</span>
                            <b>{item.title}</b>
                            <small>{item.category} {item.published_at ? `· ${item.published_at}` : ""}</small>
                            <i>↗</i>
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className={styles.safetyMachineIndex}>
                      <header><span>MACHINERY INDEX</span><b>기종별 공식 근거</b></header>
                      <div>
                        {safety.machinery_catalogue.slice(0, 10).map((item) => (
                          <article key={item.name}>
                            <b>{item.name}</b>
                            <strong>{number(item.content_count)}</strong>
                            <small>{item.examples[0]?.title ?? "공식 안전자료"}</small>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className={styles.safetyWorkspace}>
                  <nav className={styles.safetyCategories} aria-label="농작업 안전 분류">
                    {safety.categories.map((item, index) => (
                      <button
                        type="button"
                        key={item.name}
                        className={item.name === selectedSafety ? styles.safetyCategoryActive : ""}
                        onClick={() => setSelectedSafety(item.name)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <b>{item.name}</b>
                        <small>{number(item.rule_count)}개 수칙</small>
                      </button>
                    ))}
                  </nav>

                  <div className={styles.safetyRules}>
                    <header>
                      <div><span>선택 위험분류</span><h4>{selectedSafetyCategory?.name}</h4></div>
                      <small>원문 {selectedSafetyCategory?.pages.join(", ")}쪽 · 점수화하지 않은 공식 예방항목</small>
                    </header>
                    <ol>
                      {selectedSafetyCategory?.rules.map((rule) => <li key={rule}>{rule}</li>)}
                    </ol>
                  </div>

                  <aside className={styles.machineSafety}>
                    <span>MACHINERY SAFETY GATE</span>
                    <h4>{machinerySafety?.name}</h4>
                    <div><b>사용 전 점검</b>{machinerySafety?.pre_checks.slice(0, 3).map((rule) => <p key={rule}>{rule}</p>)}</div>
                    <div><b>필수 보호</b>{[...(machinerySafety?.protective_devices ?? []), ...(machinerySafety?.protective_equipment ?? [])].slice(0, 3).map((rule) => <p key={rule}>{rule}</p>)}</div>
                    <div><b>금지·정지 조건</b>{machinerySafety?.prohibitions.slice(0, 3).map((rule) => <p key={rule}>{rule}</p>)}</div>
                  </aside>
                </div>

                <div className={styles.safetyCaution}>
                  <ShieldCheck size={18} />
                  <p><b>안전 해석 원칙</b>{safety.limitations}</p>
                  <a href={safety.open_api.official_page} target="_blank" rel="noreferrer">공식 API 신청 페이지</a>
                </div>
              </article>
            )}

            <div className={styles.safeguards}>
              {data.safeguards.map((item) => (
                <div key={item.label}><CheckCircle2 size={18} /><span><b>{item.label}</b><small>{item.detail}</small></span><strong>{item.status}</strong></div>
              ))}
            </div>

            <footer className={styles.footer}>
              <ShieldCheck size={20} />
              <p><b>연구 해석 한계</b>{data.limitations}</p>
              <span>검증 실행: {data.summary.run_id}</span>
            </footer>
          </>
        )}
        <EcologicalEvidenceLab apiBase={apiBase} />
      </div>
    </section>
  );
}
