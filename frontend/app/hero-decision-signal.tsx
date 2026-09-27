"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bug,
  Clock3,
  CloudSun,
  Crosshair,
  MapPinned,
  Radar,
  ScanLine,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import styles from "./hero-decision-signal.module.css";
import { fetchHeroBootstrap, type HeroBootstrapPayload } from "./hero-bootstrap-client";
import { primeSpeechSynthesis, speakKorean, stopSpeech as stopBrowserSpeech } from "./browser-actions";

type EvidenceGate = {
  id: string;
  label: string;
  ready: boolean;
  state: string;
};

type NaturalEnemyFocus = {
  available: boolean;
  scope: "selected_condition" | "official_reference" | string;
  scope_label: string;
  selected_condition_applicable: boolean;
  release_ready: boolean;
  release_signal: string;
  enemy_name: string;
  when: string;
  dose: string;
  cycle: string;
  environment: string;
  effect_highlight: string;
  ready_gate_count: number;
  total_gate_count: number;
  gates: EvidenceGate[];
  effect_evidence_tier?: "A" | "B" | "C" | string;
};

type JudgeImpact = {
  selected_condition: {
    pest: string;
    crop: string;
    region: string;
  };
  stages: Array<{
    id: string;
    headline: string;
  }>;
  natural_enemy_focus: NaturalEnemyFocus;
  headline_metrics: {
    forecast_score: number | null;
    forecast_level: string;
  };
};

type WeatherLayer = {
  category: string;
  official_endpoints: number;
  http_200: number;
  direct_score_input: boolean;
  role: string;
};

type WeatherContext = {
  weather_support_index: number | null;
  weather_data_status: string;
  spatiotemporal_validation?: {
    context_domain_count: number;
    direct_score_domain_count: number;
    layers: WeatherLayer[];
  };
};

type Props = {
  apiBase: string;
  crop: string;
  pest: string;
  region: string;
  initialPayload?: HeroBootstrapPayload<unknown, unknown> | null;
  onReadinessChange?: (state: HeroReadinessState) => void;
};

export type HeroReadinessState = "loading" | "ready" | "error";

const FEATURED = {
  pest: "점박이응애",
  crop: "고추",
  region: "전체",
};

function compactTiming(value: string, cycle: string) {
  const source = `${value} ${cycle}`.replace(/\s+/g, " ");
  const parts: string[] = [];
  if (/발생\s*초기/.test(source)) parts.push("발생 초기");
  const interval = source.match(/\d+\s*[∼~\-–]\s*\d+\s*일\s*간격/);
  if (interval) parts.push(interval[0].replace(/\s+/g, ""));
  const repeat = source.match(/\d+\s*회\s*방사/);
  if (repeat) parts.push(repeat[0].replace(/\s+/g, " "));
  return parts.length ? Array.from(new Set(parts)).join(" · ") : "공식 원문에서 현장 조건 확인";
}

function compactEnvironment(value: string) {
  const source = value.replace(/\s+/g, " ");
  const humidity = source.match(/(?:약\s*)?\d+%\s*이상의\s*습도/);
  const range = source.match(/\d+\s*[~∼\-–]\s*\d+℃[^,.|]{0,20}/);
  if (humidity) return `${humidity[0]} 선호`;
  if (range) return range[0].trim();
  return "현장 온·습도 확인";
}

function actionCoverage(data: JudgeImpact | null) {
  const headline = data?.stages.find((stage) => stage.id === "action")?.headline ?? "";
  const district = headline.match(/시군구\s*\d+곳/);
  return district?.[0] ?? "전국 공식 근거";
}

function toneFor(level: string) {
  if (level.includes("고위험")) return "danger";
  if (level.includes("주의")) return "warning";
  if (level.includes("관찰")) return "safe";
  return "missing";
}

export default function HeroDecisionSignal({
  apiBase,
  crop,
  pest,
  region,
  initialPayload,
  onReadinessChange,
}: Props) {
  const initialCurrent = (initialPayload?.current ?? null) as JudgeImpact | null;
  const initialFeatured = (initialPayload?.featured ?? null) as JudgeImpact | null;
  const initialWeather = (initialPayload?.weather ?? null) as WeatherContext | null;
  const [current, setCurrent] = useState<JudgeImpact | null>(initialCurrent);
  const [featured, setFeatured] = useState<JudgeImpact | null>(initialFeatured);
  const [weather, setWeather] = useState<WeatherContext | null>(initialWeather);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [featuredIlluminated, setFeaturedIlluminated] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const skipInitialRequest = useRef(Boolean(initialPayload?.complete && initialCurrent && initialFeatured));
  useEffect(() => {
    if (skipInitialRequest.current) {
      skipInitialRequest.current = false;
      onReadinessChange?.("ready");
      return;
    }
    let cancelled = false;
    setCurrentError(null);
    onReadinessChange?.("loading");
    fetchHeroBootstrap<JudgeImpact, WeatherContext>(apiBase, { crop, pest, region })
      .then((data) => {
        if (cancelled) return;
        setCurrent(data.current);
        setFeatured(data.featured);
        setWeather(data.weather);
        onReadinessChange?.("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCurrent(null);
        setFeatured(null);
        setWeather(null);
        setCurrentError("의사결정 묶음 API 응답 실패");
        onReadinessChange?.("error");
      });
    return () => { cancelled = true; };
  }, [apiBase, crop, pest, region, onReadinessChange]);

  useEffect(() => {
    primeSpeechSynthesis();
    return () => stopBrowserSpeech();
  }, []);

  const direct = Boolean(current?.natural_enemy_focus.selected_condition_applicable);
  const enemyConnected = Boolean(current?.natural_enemy_focus.available);
  const evidenceTier = current?.natural_enemy_focus.effect_evidence_tier ?? (direct ? "A" : enemyConnected ? "C" : "-");
  const evidenceGrade = evidenceTier.match(/[ABC]/)?.[0] ?? "-";
  const currentTone = toneFor(current?.headline_metrics.forecast_level ?? "자료 부족");
  const currentCommand = useMemo(() => ({
    where: current?.selected_condition.region === "전체" ? "전국 조건" : current?.selected_condition.region ?? region,
    pest: current?.selected_condition.pest ?? pest,
    weather: weather?.weather_support_index === null || weather?.weather_support_index === undefined
      ? "현장 온·습도 대입"
      : `ASOS 연관 ${weather.weather_support_index.toFixed(0)}`,
    enemy: enemyConnected ? current?.natural_enemy_focus.enemy_name ?? "확인 중" : "연결 근거 없음",
    timing: enemyConnected && current
      ? compactTiming(current.natural_enemy_focus.when, current.natural_enemy_focus.cycle)
      : "예찰 후 직접 근거 확인",
    action: enemyConnected ? current?.natural_enemy_focus.release_signal ?? "현장 확인" : "예찰·물리·등록농약 우선",
  }), [current, enemyConnected, pest, region, weather]);
  const shortLabel = (value: string, maximum = 7) => {
    const normalized = value.replace(/[·,:()]/g, " ").replace(/\s+/g, " ").trim();
    return normalized.length > maximum ? normalized.slice(0, maximum) : normalized || "-";
  };
  const timingWindow = currentCommand.timing.match(/\d+\s*[~～-]\s*\d+\s*일/)?.[0];
  const circleCommand = {
    where: shortLabel(currentCommand.where.replace(/\s*조건$/, ""), 6),
    pest: shortLabel(currentCommand.pest, 7),
    weather: currentCommand.weather.startsWith("ASOS") ? "ASOS" : "현장",
    enemy: enemyConnected ? shortLabel(currentCommand.enemy.replace(/^연결\s*/, ""), 7) : "미연결",
    timing: timingWindow ?? (direct ? "투입검토" : "현장확인"),
  };

  const featuredTiming = featured
    ? compactTiming(featured.natural_enemy_focus.when, featured.natural_enemy_focus.cycle)
    : "공식 근거 불러오는 중";
  const featuredEnvironment = featured
    ? compactEnvironment(featured.natural_enemy_focus.environment)
    : "환경조건 확인 중";
  const weatherLayers = weather?.spatiotemporal_validation?.layers ?? [];
  const visibleWeatherLayers = ["지상관측", "예특보", "융합기상", "산업특화"]
    .map((category) => weatherLayers.find((layer) => layer.category === category))
    .filter((layer): layer is WeatherLayer => Boolean(layer));

  function stopSpeech() {
    stopBrowserSpeech();
    setSpeaking(false);
  }

  function speakDecision() {
    setSpeechError("");
    const message = [
      `선택 조건은 ${crop}, ${pest}, ${region}입니다.`,
      `위험 신호는 ${current?.headline_metrics.forecast_level ?? "분석 중"}입니다.`,
      `연결 천적은 ${currentCommand.enemy}입니다.`,
      `공식 원문 처리시기는 ${currentCommand.timing}입니다. 현재 현장의 최적 방사 시점이 아닙니다.`,
      `근거 등급은 ${evidenceTier}입니다.`,
      `지금 할 일은 ${currentCommand.action}입니다.`,
    ].join(" ");
    speakKorean(message, {
      rate: 0.92,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: (message) => { setSpeaking(false); setSpeechError(message); },
    });
  }

  function illuminateFeaturedEvidence() {
    setFeaturedIlluminated((value) => !value);
    if (!featured) return;
    setSpeechError("");
    speakKorean(
      `A급 공식 시험 근거입니다. 점박이응애와 고추 조건에서 ${featured.natural_enemy_focus.enemy_name}의 현장 적용 근거를 별도 점등했습니다. 작물별 2027 전망과 시험 근거는 섞지 않습니다.`,
      {
        rate: 0.92,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
        onError: (message) => { setSpeaking(false); setSpeechError(message); },
      },
    );
  }

  return (
    <div className={styles.console} aria-label="노지 상대위험과 천적 근거 참고 신호">
      <div className={styles.scan} aria-hidden="true" />
      <header className={styles.header}>
        <span><Radar size={16} /> LIVE ACTION PRISM</span>
        <b>어디서 · 어떤 조건에서 · 어떤 천적</b>
        <button type="button" className={styles.voiceButton} onClick={speaking ? stopSpeech : speakDecision}>
          {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {speaking ? "중지" : "음성"}
        </button>
      </header>
      {speechError && <p className={styles.speechStatus} role="alert">{speechError}</p>}

      <section className={styles.current} aria-live="polite">
        <div className={styles.signalTop}>
          <div>
            <small>현재 선택 조건</small>
            <strong>{crop} · {pest} · {region}</strong>
          </div>
          <span className={styles.level} data-tone={currentTone}>
            <i aria-hidden="true" />
            {currentError ? "연결 확인" : current?.headline_metrics.forecast_level ?? "분석 중"}
          </span>
        </div>

        <div className={styles.commandRail}>
          <article title={currentCommand.where}><MapPinned size={17} /><small>WHERE</small><b>{circleCommand.where}</b></article>
          <ArrowRight size={14} aria-hidden="true" />
          <article title={currentCommand.pest}><Bug size={17} /><small>PEST</small><b>{circleCommand.pest}</b></article>
          <ArrowRight size={14} aria-hidden="true" />
          <article className={styles.weatherNode} title={currentCommand.weather}><CloudSun size={17} /><small>WEATHER</small><b>{circleCommand.weather}</b></article>
          <ArrowRight size={14} aria-hidden="true" />
          <article data-evidence={evidenceTier} title={`근거 등급 ${evidenceTier} · ${currentCommand.enemy}`}><Crosshair size={17} /><small>ENEMY</small><b>{circleCommand.enemy}</b></article>
          <ArrowRight size={14} aria-hidden="true" />
          <article data-evidence={evidenceTier} title={`공식 원문 조건: ${currentCommand.timing}`}><Clock3 size={17} /><small>원문 처리시기</small><b>{circleCommand.timing}</b></article>
        </div>

        <div className={styles.verdict} data-direct={enemyConnected}>
          {enemyConnected ? <BadgeCheck size={19} /> : <ShieldAlert size={19} />}
          <div><small>ACT · 지금 할 일</small><b>{currentCommand.action}</b></div>
          <span className={styles.evidenceBadge} data-tier={evidenceTier} aria-label={`근거 등급 ${evidenceTier}`} title={`근거 등급 ${evidenceTier}`}>
            {evidenceGrade}
          </span>
        </div>
      </section>

      <section className={styles.weatherConstellation} aria-label="기상 6개 분야 검증 상태">
        <div className={styles.weatherTitle}>
          <span><CloudSun size={15} /> ECO-WEATHER GATE</span>
          <small>
            {weather?.spatiotemporal_validation
              ? `${weather.spatiotemporal_validation.direct_score_domain_count}개 점수 직접 · ${weather.spatiotemporal_validation.context_domain_count - weather.spatiotemporal_validation.direct_score_domain_count}개 교차검증`
              : "시공간·단위 검증 불러오는 중"}
          </small>
        </div>
        <div className={styles.weatherLayers}>
          {visibleWeatherLayers.length ? visibleWeatherLayers.map((layer) => (
            <span data-direct={layer.direct_score_input} key={layer.category} title={layer.role}>
              <i aria-hidden="true" />
              <b>{layer.category}</b>
              <small>{layer.http_200}/{layer.official_endpoints}</small>
            </span>
          )) : <p>지상관측·예특보·융합기상·산업특화 근거층 확인 중</p>}
        </div>
        <p>예특보는 작업 안전, 500m 융합기상은 공간 공백, 산업특화는 일사·생육 맥락을 검증합니다. 검증 전에는 위험점수에 직접 합산하지 않습니다.</p>
      </section>

      <section className={styles.featured} data-illuminated={featuredIlluminated}>
        <div className={styles.featuredLabel}>
          <span><ScanLine size={15} /> 공식 직접근거 시범 신호</span>
          <small>현재 선택과 혼합하지 않음</small>
        </div>
        <div className={styles.featuredGrid}>
          <div><small>어디서</small><b>{actionCoverage(featured)}</b></div>
          <div><small>어떤 천적</small><b>{featured?.natural_enemy_focus.enemy_name ?? "불러오는 중"}</b></div>
          <div><small>기상·시설 조건</small><b>{featuredEnvironment}</b></div>
          <div><small>언제</small><b>{featuredTiming}</b></div>
          <div className={styles.gates}>
            <small>직접근거</small>
            <b>{featured ? `${featured.natural_enemy_focus.ready_gate_count}/${featured.natural_enemy_focus.total_gate_count} 관문` : "확인 중"}</b>
          </div>
        </div>
        <div className={styles.featuredFoot}>
          <p>
            <b>점박이응애 · 고추</b>
            <span>작물별 2027 전망은 자료 부족 · 천적 시험근거와 분리 표시</span>
          </p>
          <button type="button" onClick={illuminateFeaturedEvidence} disabled={!featured}>
            A급 근거 점등 <ScanLine size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
