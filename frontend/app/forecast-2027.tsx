"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Beaker,
  Bug,
  CalendarRange,
  CheckCircle2,
  CloudRain,
  Database,
  Droplets,
  MapPinned,
  Minus,
  ShieldCheck,
  ThermometerSun,
  Volume2,
  Wind,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EcologicalRiskSignal, { labelFromScore } from "./ecological-risk-signal";
import { primeSpeechSynthesis, speakKorean, stopSpeech } from "./browser-actions";

type ForecastRecommendation = {
  name: string;
  scientific_name: string;
  type: string;
  target: string;
  usage: string;
  source: string;
  evidence_status?: string;
  application_level?: string;
};

type ForecastSeriesItem = {
  year: number;
  kind: string;
  score: number | null;
};

type ForecastRegion = {
  region: string;
  score_2024: number | null;
  score_2025?: number | null;
  score_2026: number | null;
  forecast_score: number;
  trend: string;
  confidence: string;
  observation_count: number;
  risk_level: string;
};

type WeatherRelationship = {
  factor: string;
  coefficient: number | null;
  evidence_count: number;
  grade: string;
  direction: string;
};

type MonthlyOutlook = {
  month: number;
  forecast_score: number | null;
  observation_count: number;
  source_years: number[];
  data_status: string;
};

type SpatiotemporalLayer = {
  category: string;
  official_endpoints: number;
  http_200: number;
  permission_denied: number;
  observed_rows: number;
  spatial_validation: string;
  temporal_validation: string;
  unit_validation: string;
  direct_variables: string;
  direct_score_input: boolean;
  context_connected: boolean;
  role: string;
  limitation: string;
  decision: string;
};

type SpatiotemporalValidation = {
  status: string;
  run_id: string;
  context_domain_count: number;
  direct_score_domain_count: number;
  context_domains: string[];
  direct_score_domains: string[];
  direct_variables: string[];
  score_change_rows: number;
  policy: string;
  layers: SpatiotemporalLayer[];
};

type ForecastBacktest = {
  status: string;
  condition_available: boolean;
  summary: {
    common_three_year_units?: number;
    selected_model_name?: string;
    raw_mae_best_model?: string;
    statistical_tie?: boolean;
    selection_rule?: string;
    bootstrap_repeats?: number;
    selection_stability_percent?: number;
    top_two_combined_stability_percent?: number;
    selected_mae?: number;
    selected_mae_ci95?: number[];
  };
};

type ForecastResponse = {
  forecast_year: number;
  pest: string;
  crop: string;
  region: string;
  category: string;
  has_forecast: boolean;
  score_2024: number | null;
  score_2025?: number | null;
  score_2026: number | null;
  forecast_score: number | null;
  trend: string;
  risk_level: string;
  confidence: string;
  confidence_reason: string;
  source_years: number[];
  observation_count: number;
  forecast_message: string;
  forecast_basis: string | {
    selected?: string;
    formula?: string;
    selection_reason?: string;
  };
  model_version: string;
  weather_data_status: string;
  weather_support_index: number | null;
  weather_adjustment: number | null;
  weather_relationships: WeatherRelationship[];
  monthly_outlook: MonthlyOutlook[];
  monthly_available_count: number;
  weather_note: string;
  weather_source: string;
  spatiotemporal_validation: SpatiotemporalValidation;
  research_evidence?: {
    multiyear_analysis?: ForecastBacktest;
  };
  aws_minute_archive: {
    status: string;
    run_id?: string;
    observation_rows: number;
    request_count?: number;
    completed_windows?: number;
    priority_windows?: number;
    completion_rate_percent?: number;
    storage_policy?: string;
    latest_aggregate_snapshot?: {
      source_rows: number;
      unique_stations: number;
      first_time: string | null;
      last_time: string | null;
      station_join_rate_percent: number | null;
    } | null;
  };
  forecast_limitations: string;
  disclaimer: string;
  management_type: string;
  management_steps: string[];
  management_caution: string;
  recommendations: ForecastRecommendation[];
  comparison_series: ForecastSeriesItem[];
  region_rankings: ForecastRegion[];
  source: string;
};

type Forecast2027Props = {
  apiBase: string;
  crop: string;
  pest: string;
  region: string;
  onSelectRegion?: (region: string) => void;
};

const REQUIRED_DISCLAIMER = "2027년 값은 NCPMS 2024·2025 완전연도와 2026 부분연도의 공통 조사단위를 이용한 상대 위험 전망이며 실제 발생확률 또는 확정 발생값이 아닙니다.";
const INSUFFICIENT_MESSAGE = "해당 조건의 비교 가능한 예찰자료가 부족하여 2027년 전망을 제공하지 않습니다.";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

function isForecastResponse(value: unknown): value is ForecastResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ForecastResponse>;
  return (
    data.forecast_year === 2027 &&
    typeof data.pest === "string" &&
    typeof data.has_forecast === "boolean" &&
    Array.isArray(data.comparison_series) &&
    Array.isArray(data.region_rankings) &&
    Array.isArray(data.weather_relationships) &&
    Array.isArray(data.monthly_outlook) &&
    Array.isArray(data.spatiotemporal_validation?.layers) &&
    Array.isArray(data.management_steps) &&
    Array.isArray(data.recommendations)
  );
}

const FORECAST_MAP_TILES = [
  { name: "경기도", short: "경기", area: "gg" },
  { name: "강원특별자치도", short: "강원", area: "gw" },
  { name: "인천광역시", short: "인천", area: "ic" },
  { name: "충청북도", short: "충북", area: "cb" },
  { name: "경상북도", short: "경북", area: "gb" },
  { name: "충청남도", short: "충남", area: "cn" },
  { name: "세종특별자치시", short: "세종", area: "sj" },
  { name: "대구광역시", short: "대구", area: "dg" },
  { name: "대전광역시", short: "대전", area: "dj" },
  { name: "전북특별자치도", short: "전북", area: "jb" },
  { name: "울산광역시", short: "울산", area: "us" },
  { name: "전남광주통합특별시", short: "전남·광주", area: "jn" },
  { name: "경상남도", short: "경남", area: "gn" },
  { name: "부산광역시", short: "부산", area: "bs" },
  { name: "제주특별자치도", short: "제주", area: "jj" },
] as const;

function forecastMapScoreClass(score: number | null) {
  if (score === null) return "riskTileNoData";
  if (score >= 67) return "riskTileHigh";
  if (score >= 34) return "riskTileCaution";
  return "riskTileObserve";
}

function WeatherIcon({ factor }: { factor: string }) {
  if (factor === "기온") return <ThermometerSun size={19} />;
  if (factor === "습도") return <Droplets size={19} />;
  if (factor === "강수량") return <CloudRain size={19} />;
  return <Wind size={19} />;
}

function trendClass(trend: string) {
  if (trend === "증가") return "isIncreasing";
  if (trend === "감소") return "isDecreasing";
  if (trend === "유지") return "isStable";
  return "isInsufficient";
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "증가") return <ArrowUpRight size={18} />;
  if (trend === "감소") return <ArrowDownRight size={18} />;
  return <Minus size={18} />;
}

function basisText(basis: ForecastResponse["forecast_basis"]) {
  if (typeof basis === "string") return basis;
  return [basis.selected, basis.formula, basis.selection_reason].filter(Boolean).join(" · ");
}

export default function Forecast2027({
  apiBase,
  crop,
  pest,
  region,
  onSelectRegion,
}: Forecast2027Props) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEnemy, setActiveEnemy] = useState("");

  function speakForecastSummary() {
    if (!data) return;
    const forecastSignal = data.has_forecast
      ? `2027년 상대 위험 전망은 ${data.risk_level}, 추세는 ${data.trend}, 신뢰도는 ${data.confidence}입니다.`
      : "이 조건은 정확한 수치 전망을 보류합니다. 자료가 없다는 뜻을 발생하지 않음으로 해석하지 않습니다.";
    const enemySignal = data.recommendations.length
      ? `검증된 천적 후보는 ${data.recommendations[0].name}입니다.`
      : "직접 연결된 천적은 확인되지 않았습니다.";
    speakKorean(
      `${data.region} ${data.crop} ${data.pest}. ${forecastSignal} ${enemySignal} ${data.management_type} 단계로 안내합니다.`,
      { rate: 0.92 },
    );
  }

  function speakNaturalEnemy(item: ForecastRecommendation) {
    setActiveEnemy(item.name);
    const usage = item.usage && item.usage !== "nan" ? item.usage : "공식 출처에서 이용방법을 다시 확인하세요.";
    speakKorean(
      `${item.name}. 대상 해충은 ${item.target}입니다. 적용 수준은 ${item.application_level || "자료 기재 없음"}입니다. ${usage}`,
      { rate: 0.9 },
    );
  }

  useEffect(() => {
    primeSpeechSynthesis();
    return () => stopSpeech();
  }, []);

  useEffect(() => {
    if (!pest) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ pest });
    if (crop !== "전체") params.set("crop", crop);
    if (region !== "전체") params.set("region", region);

    setLoading(true);
    setError(null);
    fetch(`${apiBase}/api/forecast/2027?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText || "요청 실패"}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!isForecastResponse(payload)) throw new Error("2027 전망 응답 형식이 올바르지 않습니다.");
        setData(payload);
      })
      .catch((fetchError: unknown) => {
        if (fetchError && typeof fetchError === "object" && "name" in fetchError && fetchError.name === "AbortError") return;
        setData(null);
        setError(errorMessage(fetchError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [apiBase, crop, pest, region]);

  const chartData = useMemo(() => {
    const byYear = new Map(data?.comparison_series.map((item) => [item.year, item.score]) ?? []);
    const score2026 = byYear.get(2026) ?? null;
    return [
      { year: "2024", actual: byYear.get(2024) ?? null, forecast: null },
      { year: "2025", actual: byYear.get(2025) ?? null, forecast: null },
      { year: "2026", actual: score2026, forecast: score2026 },
      { year: "2027", actual: null, forecast: byYear.get(2027) ?? null },
    ];
  }, [data]);

  const rankings = data?.region_rankings.slice(0, 7) ?? [];
  const highestForecast = rankings[0]?.forecast_score ?? 100;
  const backtest = data?.research_evidence?.multiyear_analysis;

  return (
    <section className={`forecastSection${data && !data.has_forecast ? " forecastUnavailableMode" : ""}`} id="forecast-2027" aria-busy={loading}>
      <div className="forecastBackdrop" aria-hidden="true" />
      <div className="forecastInner">
        <div className="sectionHeading forecastHeading">
          <div>
            <span className="sectionNumber">F27</span>
            <div>
              <p>EXPLAINABLE RISK FORECAST</p>
              <h2>2027 병해충 상대 위험 전망</h2>
            </div>
          </div>
          <p>2024·2025년으로 2026년을 가려 맞힌 후, 1,000회 재표본 검증을 통과한 보수적 연구용 전망입니다.</p>
        </div>

        <div className="forecastDisclaimer" role="note">
          <AlertTriangle size={21} />
          <div>
            <b>전망값 해석 원칙</b>
            <p>{data?.disclaimer || REQUIRED_DISCLAIMER}</p>
          </div>
        </div>

        {loading ? (
          <div className="forecastState" role="status">
            <Beaker size={28} />
            <b>2024·2025·2026 공통 조사단위를 후향검증하고 있습니다.</b>
            <span>공통 P95 정규화 · 2026 블라인드 검증 · 1,000회 재표본 중</span>
          </div>
        ) : error ? (
          <div className="forecastState isError" role="alert">
            <AlertTriangle size={28} />
            <b>2027 전망 API를 불러오지 못했습니다.</b>
            <span>{error}</span>
          </div>
        ) : data ? (
          <>
            <div className="forecastContextBar">
              <div><small>병해충</small><strong>{data.pest}</strong></div>
              <div><small>유형</small><strong>{data.category}</strong></div>
              <div><small>작물·지역</small><strong>{data.crop} · {data.region}</strong></div>
              <div><small>근거 연도</small><strong>{data.source_years.length ? data.source_years.join(" · ") : "자료 부족"}</strong></div>
              <div><small>유효 관측</small><strong>{data.observation_count.toLocaleString("ko-KR")}건</strong></div>
              <div><small>분석 모델</small><strong>{data.model_version}</strong></div>
              <button className="forecastVoiceButton" onClick={speakForecastSummary} type="button"><Volume2 size={17} /> 음성 설명</button>
            </div>

            {!data.has_forecast && (
              <div className="forecastInsufficient forecastEvidenceGate" role="status">
                <div className="forecastHoldCore"><Database size={24} /><small>NUMERIC FORECAST HOLD</small><b>수치 전망 보류</b></div>
                <div className="forecastHoldSignals" aria-label="전망 가능 여부 근거 신호">
                  <span data-tone={data.observation_count > 0 ? "ready" : "hold"}><i />관측 {data.observation_count > 0 ? "연결" : "보강"}</span>
                  <span data-tone={data.recommendations.length ? "ready" : "hold"}><i />천적 {data.recommendations.length ? "연결" : "검증"}</span>
                  <span data-tone="action"><i />행동 예찰</span>
                </div>
                <div><b>{INSUFFICIENT_MESSAGE}</b><p>빈 그래프와 12개의 반복 표시는 숨겼습니다. 실제 0은 그대로 보존하고, 이 조건은 예찰·천적 근거·현장 검증 경로만 안내합니다.</p></div>
                <button onClick={speakForecastSummary} type="button"><Volume2 size={17} /> 이 판단 듣기</button>
              </div>
            )}

            <div className="forecastScoreStage" aria-live="polite">
              <article className="forecastScoreCard observed">
                <span>ACTUAL SURVEILLANCE</span>
                <small>2024 실제 예찰값</small>
                <EcologicalRiskSignal className="forecastEcoSignal" compact score={data.score_2024} title="2024 관측 신호" />
                <p>{data.score_2024 === null ? "비교 자료 없음" : "연도 내부 상대위험도"}</p>
              </article>
              <ArrowRight className="forecastStageArrow" size={26} aria-hidden="true" />
              <article className="forecastScoreCard observed middleYear">
                <span>ACTUAL SURVEILLANCE</span>
                <small>2025 실제 예찰값</small>
                <EcologicalRiskSignal className="forecastEcoSignal" compact score={data.score_2025 ?? null} title="2025 관측 신호" />
                <p>{data.score_2025 === null || data.score_2025 === undefined ? "비교 자료 없음" : "2026 가림검증 입력"}</p>
              </article>
              <ArrowRight className="forecastStageArrow" size={26} aria-hidden="true" />
              <article className="forecastScoreCard observed latest">
                <span>ACTUAL SURVEILLANCE</span>
                <small>2026 실제 예찰값</small>
                <EcologicalRiskSignal className="forecastEcoSignal" compact score={data.score_2026} title="2026 관측 신호" />
                <p>{data.score_2026 === null ? "비교 자료 없음" : "최신 관측 기준점"}</p>
              </article>
              <ArrowRight className="forecastStageArrow" size={26} aria-hidden="true" />
              <article className={`forecastScoreCard projected ${data.has_forecast ? "hasForecast" : ""}`}>
                <span>EXPLAINABLE FORECAST</span>
                <small>2027 상대 위험 전망</small>
                <EcologicalRiskSignal className="forecastEcoSignal forecastEcoProjected" score={data.forecast_score} title="2027 전망 신호" />
                <div className={`forecastTrend ${trendClass(data.trend)}`}>
                  <TrendIcon trend={data.trend} /> {data.trend}
                </div>
              </article>
            </div>

            {backtest?.status === "complete" && (
              <article className="forecastBacktestPanel" aria-label="2026 블라인드 백테스트 신뢰성 검증">
                <header>
                  <div>
                    <small>BLIND 2026 BACKTEST · REPRODUCIBILITY GATE</small>
                    <h3>2024·2025만 보고 2026을 얼마나 재현했는가</h3>
                  </div>
                  <span className={backtest.summary.statistical_tie ? "isConservative" : "isWinner"}>
                    {backtest.summary.statistical_tie ? "과적합 방지 선택" : "최저 오차 선택"}
                  </span>
                </header>
                <div className="forecastBacktestMetrics">
                  <div><small>엄격 공통단위</small><strong>{(backtest.summary.common_three_year_units ?? 0).toLocaleString("ko-KR")}</strong><span>작물×병해충×지역×회차×지표</span></div>
                  <div><small>선택 모델</small><strong>{backtest.summary.selected_model_name ?? "자료 부족"}</strong><span>단순성 우선 규칙 적용</span></div>
                  <div><small>2026 MAE</small><strong>{backtest.summary.selected_mae?.toFixed(2) ?? "—"}</strong><span>95% CI {backtest.summary.selected_mae_ci95?.map((value) => value.toFixed(2)).join("–") ?? "—"}</span></div>
                  <div><small>짝지은 재표본</small><strong>{(backtest.summary.bootstrap_repeats ?? 0).toLocaleString("ko-KR")}회</strong><span>상위 2모델 합산 안정성 {backtest.summary.top_two_combined_stability_percent?.toFixed(1) ?? "—"}%</span></div>
                </div>
                <p>{backtest.summary.selection_rule}</p>
              </article>
            )}

            <div className="forecastSignalStrip">
              <div className={`forecastSignal ${trendClass(data.trend)}`}>
                <small>추세 신호</small>
                <strong><TrendIcon trend={data.trend} />{data.trend}</strong>
              </div>
              <div className={`forecastSignal confidence-${data.confidence}`}>
                <small>전망 신뢰도</small>
                <strong><BadgeCheck size={18} />{data.confidence}</strong>
              </div>
              <div className="forecastSignal">
                <small>대응 수준</small>
                <strong><ShieldCheck size={18} />{data.risk_level}</strong>
              </div>
              <div className="forecastSignal weather-linked">
                <small>기상 근거</small>
                <strong><CloudRain size={18} />{data.weather_data_status === "linked" ? "ASOS 연결" : "자료 제한"}</strong>
              </div>
            </div>

            {data.spatiotemporal_validation.status === "complete" && (
              <article className="forecastSpatiotemporalPanel">
                <div className="forecastSpatiotemporalHeader">
                  <div>
                    <small>SPATIOTEMPORAL EVIDENCE GATE · F27-RX3</small>
                    <h3>6개 기상 분야 시공간·단위 검증 연결</h3>
                    <p>분석 근거는 모두 유지하고, 같은 지역·이전 시점·물리단위를 확인한 자료만 점수 근거로 승인합니다.</p>
                  </div>
                  <div className="forecastSpatiotemporalCounts">
                    <span><b>{data.spatiotemporal_validation.context_domain_count}</b>근거층 연결</span>
                    <span><b>{data.spatiotemporal_validation.direct_score_domain_count}</b>점수 직접 분야</span>
                  </div>
                </div>
                <div className="forecastSpatiotemporalGrid">
                  {data.spatiotemporal_validation.layers.map((layer, index) => (
                    <section className={layer.direct_score_input ? "isDirect" : "isContext"} key={layer.category}>
                      <header>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <b>{layer.decision}</b>
                      </header>
                      <h4>{layer.category}</h4>
                      <p>{layer.role}</p>
                      <dl>
                        <div><dt>공간</dt><dd>{layer.spatial_validation}</dd></div>
                        <div><dt>시간</dt><dd>{layer.temporal_validation}</dd></div>
                        <div><dt>단위</dt><dd>{layer.unit_validation}</dd></div>
                      </dl>
                      <footer>
                        <span>HTTP 200 {layer.http_200}/{layer.official_endpoints}</span>
                        <strong>{layer.direct_score_input ? layer.direct_variables : "보조 근거"}</strong>
                      </footer>
                    </section>
                  ))}
                </div>
                <div className="forecastSpatiotemporalPolicy">
                  <ShieldCheck size={19} />
                  <p><b>점수 보존 검증</b>{data.spatiotemporal_validation.policy} · 검증으로 임의 변경된 전망 행 {data.spatiotemporal_validation.score_change_rows.toLocaleString("ko-KR")}건</p>
                </div>
              </article>
            )}

            <div className="forecastAnalysisGrid">
              <article className="forecastChartPanel">
                <div className="forecastPanelHeader">
                  <div><small>OBSERVED → HELD-OUT TEST → PROJECTED</small><h3>2024 → 2025 → 2026 검증 → 2027 전망</h3></div>
                  <span>점수 0–100</span>
                </div>
                <div className="forecastChart">
                  <ResponsiveContainer key={`${data.pest}-${data.crop}-${data.region}`} width="100%" height="100%" minWidth={280} minHeight={260}>
                    <LineChart data={chartData} margin={{ top: 20, right: 24, bottom: 8, left: -14 }}>
                      <CartesianGrid vertical={false} stroke="#dce5de" />
                      <XAxis dataKey="year" axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => [`${value ?? "—"}점`, "상대 위험"]} />
                      <Line type="monotone" dataKey="actual" name="실제 예찰" stroke="#174b31" strokeWidth={4} dot={{ r: 6, fill: "#174b31" }} connectNulls />
                      <Line type="monotone" dataKey="forecast" name="2027 전망" stroke="#ed6b2c" strokeWidth={4} strokeDasharray="8 6" dot={{ r: 7, fill: "#ed6b2c" }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="forecastChartLegend"><span><i className="actualLine" />실제 NCPMS 예찰 상대값 · 빈 연도는 보간값 아님</span><span><i className="projectedLine" />검증 후 선택된 보수 전망</span></div>
              </article>

              <article className="forecastRankingPanel">
                <div className="forecastPanelHeader">
                  <div><small>REGIONAL PRIORITY</small><h3>지역별 2027 전망 순위</h3></div>
                  <MapPinned size={20} />
                </div>
                {rankings.length ? (
                  <div className="forecastRankingList">
                    {rankings.map((item, index) => (
                      <button key={item.region} type="button" onClick={() => onSelectRegion?.(item.region)}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <b>{item.region}</b>
                          <i><em style={{ width: `${Math.max(3, item.forecast_score / Math.max(highestForecast, 1) * 100)}%` }} /></i>
                          <small>{item.confidence} 신뢰 · 관측 {item.observation_count.toLocaleString("ko-KR")}건</small>
                        </div>
                        <EcologicalRiskSignal
                          className="forecastRankSignal"
                          interactive={false}
                          mini
                          score={item.forecast_score}
                          title="전망"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="forecastPanelEmpty">비교 가능한 지역 전망이 없습니다.</div>
                )}
              </article>
            </div>

            <div className="forecastWeatherGrid">
              <article className="forecastMonthlyPanel">
                <div className="forecastPanelHeader">
                  <div><small>SEASONAL EVIDENCE WINDOW</small><h3>2027 월별 상대위험 전망</h3></div>
                  <CalendarRange size={21} />
                </div>
                <div className="forecastMonthlyChart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.monthly_outlook} margin={{ top: 20, right: 22, bottom: 8, left: -14 }}>
                      <CartesianGrid vertical={false} stroke="#dce5de" />
                      <XAxis dataKey="month" tickFormatter={(value) => `${value}월`} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
                      <Tooltip
                        labelFormatter={(value) => `${value}월`}
                        formatter={(value) => [`${value ?? "자료 부족"}${value === null ? "" : "점"}`, "상대위험 전망"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast_score"
                        name="월별 전망"
                        stroke="#e9672c"
                        strokeWidth={4}
                        dot={{ r: 5, fill: "#fff", stroke: "#e9672c", strokeWidth: 3 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="forecastMonthlySignals" aria-label="2027 월별 전망 신호">
                  {data.monthly_outlook.map((item) => (
                    <EcologicalRiskSignal
                      interactive={false}
                      key={item.month}
                      mini
                      score={item.forecast_score}
                      title={`${item.month}월`}
                    />
                  ))}
                </div>
                <p className="forecastWeatherNote">
                  관측 계절형이 있는 {data.monthly_available_count}개월만 표시합니다. 빈 구간은 0점이 아니라 전망자료 부족입니다.
                </p>
              </article>

              <article className="forecastWeatherPanel">
                <div className="forecastPanelHeader">
                  <div><small>WEATHER ASSOCIATION EVIDENCE</small><h3>발생값과 기상요인의 관계</h3></div>
                  <CloudRain size={21} />
                </div>
                {data.weather_relationships.length ? (
                  <div className="forecastWeatherFactors">
                    {data.weather_relationships.slice(0, 4).map((item) => (
                      <div key={item.factor}>
                        <span><WeatherIcon factor={item.factor} /></span>
                        <section>
                          <small>{item.factor} · {item.grade}</small>
                          <strong>{item.coefficient === null ? "—" : `${item.coefficient > 0 ? "+" : ""}${item.coefficient.toFixed(2)}`}</strong>
                          <p>{item.direction} · 비교 {item.evidence_count.toLocaleString("ko-KR")}단위</p>
                        </section>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="forecastPanelEmpty">선택 조건의 기상 연관성 근거가 부족합니다.</div>
                )}
                <div className="forecastArchiveStatus">
                  <Database size={21} />
                  <div>
                    <small>NATIONWIDE AWS MINUTE ARCHIVE</small>
                    <b>전국 AWS 매분 원자료 서버 보존</b>
                    <p>
                      현재 {data.aws_minute_archive.observation_rows.toLocaleString("ko-KR")}행 ·
                      {" "}{data.aws_minute_archive.completed_windows?.toLocaleString("ko-KR") ?? 0}/{data.aws_minute_archive.priority_windows?.toLocaleString("ko-KR") ?? 0}구간
                      {data.aws_minute_archive.latest_aggregate_snapshot
                        ? ` · 집계 ${data.aws_minute_archive.latest_aggregate_snapshot.unique_stations.toLocaleString("ko-KR")}지점`
                        : ""}
                    </p>
                  </div>
                </div>
                <p className="forecastWeatherNote">{data.weather_note}</p>
                <p className="forecastWeatherNote">
                  선택 조건의 기상 일치지수 {data.weather_support_index === null ? "산출 불가" : data.weather_support_index.toFixed(3)}
                  {data.weather_adjustment === null ? "" : ` · 보수적 점수 보정 ${data.weather_adjustment > 0 ? "+" : ""}${data.weather_adjustment.toFixed(1)}점`}
                </p>
              </article>
            </div>

            <article className="forecastMapPanel">
              <div className="forecastPanelHeader">
                <div><small>2027 REGIONAL OUTLOOK MAP</small><h3>지역별 2027 전망 위험지도</h3></div>
                <MapPinned size={21} />
              </div>
              <div className="forecastMapLayout">
                <div className="koreaTileMap forecastTileMap" role="group" aria-label="2027년 시도별 상대위험 전망">
                  {FORECAST_MAP_TILES.map((tile) => {
                    const item = data.region_rankings.find((entry) => entry.region === tile.name);
                    const score = item?.forecast_score ?? null;
                    const selected = data.region === tile.name;
                    return (
                      <button
                        aria-label={`2027년 ${tile.name} 상대위험 전망 ${score === null ? "자료 없음" : `${score}점`}`}
                        aria-pressed={selected}
                        className={`riskTile mapArea-${tile.area} ${forecastMapScoreClass(score)}${selected ? " isSelected" : ""}`}
                        key={tile.name}
                        onClick={() => onSelectRegion?.(tile.name)}
                        type="button"
                      >
                        <span>{tile.short}</span>
                        <strong>{score ?? "—"}</strong>
                        <small>{labelFromScore(score)}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="forecastMapNarrative">
                  <span>MAP READING GUIDE</span>
                  <h4>순위와 위치를 한눈에</h4>
                  <p>지역 타일을 선택하면 기존 2024·2026 지도, 전망 점수, 월별 곡선과 대응 안내가 같은 조건으로 갱신됩니다.</p>
                  <div className="riskLegend">
                    <span><i className="legendObserve" />관찰 0–33</span>
                    <span><i className="legendCaution" />주의 34–66</span>
                    <span><i className="legendHigh" />고위험 67–100</span>
                    <span><i className="legendNoData" />전망자료 부족</span>
                  </div>
                </div>
              </div>
            </article>

            <div className="forecastEvidenceGrid">
              <article className="forecastEvidenceCard">
                <span><Beaker size={18} /> 모델 선택 근거</span>
                <h3>완화 추세 + 표본 축소</h3>
                <p>{basisText(data.forecast_basis)}</p>
              </article>
              <article className="forecastEvidenceCard">
                <span><BadgeCheck size={18} /> 신뢰도 산정</span>
                <h3>{data.confidence} 신뢰도</h3>
                <p>{data.confidence_reason}</p>
              </article>
            </div>

            <article className="forecastManagementPanel">
              <div className="forecastManagementTitle">
                <div><ShieldCheck size={25} /><span><small>RISK-ADAPTIVE RESPONSE</small><h3>{data.management_type}</h3></span></div>
                <strong>{data.risk_level}</strong>
              </div>
              <ol>
                {data.management_steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
              </ol>
              <p className="forecastManagementCaution"><AlertTriangle size={17} />{data.management_caution}</p>
            </article>

            {data.category === "해충" ? (
              <div className="forecastEnemyEvidence">
                <div className="forecastPanelHeader">
                  <div><small>VERIFIED NATURAL-ENEMY LINK</small><h3>검증된 천적곤충 연결</h3></div>
                  <Bug size={21} />
                </div>
                {data.recommendations.length ? (
                  <div className="forecastEnemyGrid">
                    {data.recommendations.slice(0, 3).map((item, index) => (
                      <article data-active={activeEnemy === item.name} key={`${item.name}-${index}`}>
                        <span>{item.evidence_status || "근거 확인"}</span>
                        <h4>{item.name}</h4>
                        <i>{item.scientific_name}</i>
                        <dl>
                          <div><dt>천적유형</dt><dd>{item.type}</dd></div>
                          <div><dt>대상해충</dt><dd>{item.target}</dd></div>
                          <div><dt>적용수준</dt><dd>{item.application_level || "자료 기재 없음"}</dd></div>
                        </dl>
                        <div className="forecastEnemyActions">
                          <button aria-pressed={activeEnemy === item.name} onClick={() => speakNaturalEnemy(item)} type="button"><Volume2 size={16} /> {activeEnemy === item.name ? "근거 점등 중" : "핵심 듣기"}</button>
                          <details>
                            <summary>공식 이용방법 보기</summary>
                            <p>{item.usage && item.usage !== "nan" ? item.usage : "출처 자료 확인 필요"}</p>
                          </details>
                        </div>
                        <footer><CheckCircle2 size={15} />{item.source}</footer>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="forecastNoEnemy">
                    <Bug size={22} />
                    <div><b>직접 연결된 검증 천적 없음</b><p>유사 이름이나 같은 분류군이라는 이유로 임의의 천적을 추천하지 않습니다.</p></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="forecastNoEnemy isCategoryRule">
                <ShieldCheck size={22} />
                <div><b>{data.category} 유형에는 천적곤충을 추천하지 않습니다.</b><p>위의 유형별 진단·예방·환경·등록 방제 경로를 따릅니다.</p></div>
              </div>
            )}

            <div className="forecastLimitations">
              <AlertTriangle size={18} />
              <div><b>전망 한계</b><p>{data.forecast_limitations}</p><small>출처: {data.source}</small></div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
