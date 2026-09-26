"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  AudioLines,
  CheckCircle2,
  Download,
  Pause,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import styles from "./judge-impact-theater.module.css";
import brightStyles from "./judge-impact-theater-bright.module.css";
import { fetchHeroBootstrap, type HeroBootstrapPayload } from "./hero-bootstrap-client";
import { downloadTextFile, primeSpeechSynthesis, speakKorean, stopSpeech } from "./browser-actions";
import AdoptionReview from "./adoption-review";

type ImpactTone = "green" | "blue" | "orange" | "red" | "gray";

type ImpactStage = {
  id: string;
  number: string;
  title: string;
  state: string;
  headline: string;
  detail: string;
  tone: ImpactTone;
};

type NaturalEnemyGate = {
  id: string;
  label: string;
  ready: boolean;
  state: string;
};

type EffectTrajectoryPoint = {
  group: string;
  day: number | null;
  metric: string;
  reported_percent: number | null;
  direct_control: boolean;
  causal_interpretation_allowed: boolean;
  source_sentence: string;
  source: string;
  source_url: string | null;
};

type EffectTrajectory = {
  available: boolean;
  points: EffectTrajectoryPoint[];
  point_count?: number;
  groups?: string[];
  direct_control_available: boolean;
  group_comparison_available: boolean;
  display_mode?: string;
  generalized_effect_percent?: number | null;
  interpretation: string;
};

type NaturalEnemyFocus = {
  available: boolean;
  scope: "selected_condition" | "official_reference";
  scope_label: string;
  selected_condition_applicable: boolean;
  release_ready: boolean;
  release_signal: string;
  enemy_name: string;
  crop: string;
  target_pest: string;
  when: string;
  dose: string;
  cycle: string;
  environment: string;
  effect_highlight: string;
  stop_condition: string;
  evidence_grade: string;
  effect_evidence_tier: string;
  effect_evidence_ladder: Array<{
    id: "A" | "B" | "C";
    label: string;
    state: string;
    ready: boolean;
    meaning: string;
  }>;
  literature_evidence: {
    available: boolean;
    title: string | null;
    conditions: string | null;
    finding: string | null;
    application_note: string | null;
    doi: string | null;
    url: string | null;
  };
  source: string;
  source_url: string | null;
  source_row: number | null;
  trajectory: EffectTrajectory;
  gates: NaturalEnemyGate[];
  ready_gate_count: number;
  total_gate_count: number;
  interpretation: string;
};

type JudgeImpact = {
  status: string;
  selected_condition: {
    pest: string;
    crop: string;
    region: string;
    cultivation_mode: string;
  };
  stages: ImpactStage[];
  natural_enemy_focus: NaturalEnemyFocus;
  smartfarm_context: {
    available: boolean;
    coverage: string | null;
    official_farms: number;
    official_seasons: number;
    selected_seasons: number;
    busiest_start_month: number | null;
    request_count: number;
    request_failures: number;
  };
  headline_metrics: {
    total_evidence_rows: number;
    analysis_unit_rows: number;
    common_three_year_units: number;
    backtest_mae: number | null;
    backtest_mae_ci95: number[];
    forecast_score: number | null;
    forecast_level: string;
    release_state: string;
    ready_gates: number;
    total_gates: number;
    relative_safety_signal: string | null;
    relative_safety_score: number | null;
    smartfarm_seasons: number;
    smartfarm_selected_seasons: number;
  };
  economic_scenario: {
    status: string;
    formula: string;
    required_inputs: string[];
    interpretation: string;
  };
  prospective_validation: {
    status: string;
    design: string;
    minimum_fields: string[];
    claim_rule: string;
    protocols: Array<{
      id: string;
      label: string;
      filename: string;
      design: string;
      fields: string[];
    }>;
  };
  claim_boundary: {
    accident_probability: boolean;
    causal_effect: boolean;
    external_validation_complete: boolean;
    message: string;
  };
  source: string;
};

type Props = {
  apiBase: string;
  crop: string;
  pest: string;
  region: string;
  initialPayload?: HeroBootstrapPayload<unknown, unknown> | null;
};

const TOUR_INTERVAL_MS = 8000;


function quoteCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function compactTiming(value: string) {
  if (!value || /미확보|미확인|자료/.test(value)) return "확인 필요";
  if (/발생\s*초기|초기/.test(value)) return "발생 초기";
  const interval = value.match(/(\d+)\s*[~～-]\s*(\d+)\s*일/);
  if (interval) return `${interval[1]}–${interval[2]}일`;
  if (/월/.test(value)) return value.match(/\d+월/)?.[0] ?? "적기";
  return "적기 확인";
}

export default function JudgeImpactTheater({ apiBase, crop, pest, region, initialPayload }: Props) {
  const initialData = (initialPayload?.current ?? null) as JudgeImpact | null;
  const [data, setData] = useState<JudgeImpact | null>(initialData);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touring, setTouring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [downloadedProtocol, setDownloadedProtocol] = useState("");
  const stageRef = useRef<HTMLElement | null>(null);
  const skipInitialRequest = useRef(Boolean(initialPayload?.complete && initialData?.stages?.length));

  useEffect(() => {
    if (skipInitialRequest.current) {
      skipInitialRequest.current = false;
      return;
    }
    let cancelled = false;

    setError(null);
    fetchHeroBootstrap<JudgeImpact, unknown>(apiBase, { pest, crop, region })
      .then(({ current: payload }) => {
        if (cancelled) return;
        if (!Array.isArray(payload.stages) || payload.stages.length === 0) {
          throw new Error("심사 경로 데이터가 비어 있습니다.");
        }
        setData(payload);
        setActiveIndex(0);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "통합 분석을 불러오지 못했습니다.");
      });

    return () => { cancelled = true; };
  }, [apiBase, crop, pest, region]);

  useEffect(() => {
    if (!touring || !data) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current >= data.stages.length - 1) {
          setTouring(false);
          return current;
        }
        return current + 1;
      });
    }, TOUR_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [data, touring]);

  useEffect(() => {
    primeSpeechSynthesis();
    return () => stopSpeech();
  }, []);

  const activeStage = data?.stages[activeIndex] ?? null;
  const effectProof = useMemo(() => {
    const trajectory = data?.natural_enemy_focus.trajectory;
    const numericPoints = (trajectory?.points ?? []).filter(
      (point) => point.day !== null && point.reported_percent !== null
        && Number.isFinite(point.reported_percent),
    );
    const days = [...new Set(numericPoints.map((point) => point.day as number))]
      .sort((left, right) => right - left);
    const comparisonDay = days.find((day) => (
      new Set(numericPoints.filter((point) => point.day === day).map((point) => point.group)).size >= 2
    ));
    const sameDay = comparisonDay === undefined
      ? []
      : numericPoints.filter((point) => point.day === comparisonDay);
    const controlPattern = /무방사|무처리|대조/;
    const control = sameDay.find((point) => controlPattern.test(point.group)) ?? null;
    const treatment = sameDay.find((point) => !controlPattern.test(point.group)) ?? null;
    const directComparison = Boolean(
      trajectory?.direct_control_available && control && treatment
        && control.metric === treatment.metric,
    );
    const controlValue = control?.reported_percent ?? null;
    const treatmentValue = treatment?.reported_percent ?? null;
    const observedGapPercent = directComparison && controlValue !== null && controlValue > 0
      && treatmentValue !== null && treatmentValue <= controlValue
      ? ((controlValue - treatmentValue) / controlValue) * 100
      : null;
    const scaleMax = Math.max(controlValue ?? 0, treatmentValue ?? 0, 1);

    return {
      available: Boolean(trajectory?.available),
      directComparison,
      comparisonDay: comparisonDay ?? null,
      control,
      treatment,
      observedGapPercent,
      controlBar: controlValue === null ? 0 : Math.max(8, (controlValue / scaleMax) * 100),
      treatmentBar: treatmentValue === null ? 0 : Math.max(8, (treatmentValue / scaleMax) * 100),
      interpretation: trajectory?.interpretation ?? "구조화된 공식 시험 수치가 없습니다.",
    };
  }, [data]);
  const effectEvidenceLadder = data?.natural_enemy_focus.effect_evidence_ladder?.length
    ? data.natural_enemy_focus.effect_evidence_ladder
    : [
      { id: "A" as const, label: "직접 대조", state: effectProof.directComparison ? "확인" : "미확보", ready: effectProof.directComparison, meaning: "같은 조건의 처리군과 무처리 대조구 비교" },
      { id: "B" as const, label: "공식 문헌", state: effectProof.available ? "연결" : "미확보", ready: effectProof.available, meaning: "공식 시험자료 또는 논문 조건" },
      { id: "C" as const, label: "현장 검증", state: "설계 준비", ready: true, meaning: "처리·대조·밀도·비용 전향 기록" },
    ];

  function selectStage(index: number) {
    setTouring(false);
    setActiveIndex(index);
    stopSpeech();
    setSpeaking(false);
  }

  function toggleTour() {
    if (!data) return;
    if (touring) {
      setTouring(false);
      return;
    }
    if (activeIndex >= data.stages.length - 1) setActiveIndex(0);
    setTouring(true);
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function speakActiveStage() {
    if (!activeStage) return;
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const focus = data?.natural_enemy_focus;
    const focusNarration = focus?.available
      ? `${focus.scope_label}. 천적 ${focus.enemy_name}. 원문 처리시기 ${focus.when}. 원문 방사 기준 ${focus.dose}. 반복 기준 ${focus.cycle}. 효과 근거 ${focus.effect_highlight}. ${focus.interpretation}`
      : "선택 조건에 연결되는 공식 천적 근거가 없습니다.";
    speakKorean(
      `${activeStage.title}. ${activeStage.state}. ${activeStage.headline}. ${activeStage.detail}. ${focusNarration}`,
      {
        rate: 0.92,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      },
    );
  }

  function speakEnemyEvidence() {
    if (!data) return;
    const enemy = data.natural_enemy_focus;
    speakKorean(
      `${enemy.enemy_name}. 언제, ${enemy.when}. 환경, ${enemy.environment}. 얼마나, ${enemy.dose}. 반복, ${enemy.cycle}. 확인된 근거, ${enemy.effect_highlight}. 중지 조건, ${enemy.stop_condition}. ${enemy.interpretation}`,
      {
        rate: 0.93,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      },
    );
  }

  function downloadProtocol(protocolId = "natural_enemy_trial") {
    if (!data) return;
    const protocol = data.prospective_validation.protocols?.find((item) => item.id === protocolId);
    const fields = protocol?.fields ?? data.prospective_validation.minimum_fields;
    const design = protocol?.design ?? data.prospective_validation.design;
    const header = fields.map(quoteCsv).join(",");
    const guide = fields.map(() => "").join(",");
    const metadata = [
      `# 설계,${quoteCsv(design)}`,
      `# 판정규칙,${quoteCsv(data.prospective_validation.claim_rule)}`,
      header,
      guide,
    ].join("\r\n");
    downloadTextFile(
      ["\ufeff", metadata],
      protocol?.filename ?? "공생AI_전향실증_수집양식.csv",
      "text/csv;charset=utf-8",
    );
    setDownloadedProtocol(protocolId);
    window.setTimeout(() => setDownloadedProtocol((current) => current === protocolId ? "" : current), 2500);
  }

  return (
    <section className={`${styles.theater} ${brightStyles.shell}`} id="judge-impact" ref={stageRef}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}><Sparkles size={15} /> SYMBIOSIS DECISION RADAR</span>
          <h2>언제 도입을 검토할 것인가, <em>근거와 경제성</em>을 확인합니다</h2>
          <p>
            3개년 관측·2026 블라인드 백테스트·기상·스마트팜 자료를 구분하고,
            공식 처리·대조 시험과 사용자 입력 경제성을 독립적으로 검토합니다.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.tourButton} type="button" onClick={toggleTour} disabled={!data}>
            {touring ? <Pause size={18} /> : <Play size={18} />}
            {touring ? "심사 경로 일시정지" : "60초 심사 경로 시작"}
          </button>
          <button className={styles.voiceButton} type="button" onClick={speakActiveStage} disabled={!activeStage}>
            {speaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
            {speaking ? "읽기 중지" : "결정 신호 음성"}
          </button>
        </div>
      </header>

      {!data && <article className={styles.economicCard}><AdoptionReview /></article>}

      {error ? (
        <div className={styles.error} role="alert">통합 분석 연결 실패 · {error}</div>
      ) : !data || !activeStage ? (
        <div className={styles.loading}><Activity size={22} /> 3개년 근거를 결합하고 있습니다.</div>
      ) : (
        <>
          <section className={styles.rubricLock} data-part="rubric" aria-label="공식 심사 항목 대응 구조">
            <div>
              <small>OFFICIAL JUDGING RUBRIC · 배점은 획득점수가 아닌 공식 평가 비중입니다</small>
              <strong>효과성과 정책 활용을 최우선으로 잠근 분석 구조</strong>
            </div>
            {[
              ["25", "효과성·정책"],
              ["20", "AI 활용"],
              ["20", "데이터 활용"],
              ["20", "분석 완성도"],
              ["15", "창의성"],
            ].map(([weight, label]) => (
              <span key={label}><b>{weight}</b><i>{label}</i></span>
            ))}
          </section>

          <div className={styles.stageRail} data-part="rail" aria-label="분석 단계">
            {data.stages.map((stage, index) => (
              <button
                className={index === activeIndex ? styles.stageButtonActive : styles.stageButton}
                data-tone={stage.tone}
                key={stage.id}
                onClick={() => selectStage(index)}
                type="button"
                aria-current={index === activeIndex ? "step" : undefined}
              >
                <span>{stage.number}</span>
                <b>{stage.title}</b>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>

          <section className={styles.impactCommand} data-part="command" aria-label="한눈에 보는 천적 투입 의사결정">
            <div className={styles.commandLead} data-signal="risk" title={`${data.selected_condition.region} · ${data.selected_condition.crop}`}>
              <small>위험</small>
              <strong data-level={data.headline_metrics.forecast_level}>{data.headline_metrics.forecast_level || "자료 부족"}</strong>
              <span>{data.selected_condition.region} · {data.selected_condition.crop}</span>
            </div>
            <div data-signal="enemy" title={data.natural_enemy_focus.scope_label}>
              <small>천적</small>
              <strong>{data.natural_enemy_focus.selected_condition_applicable ? data.natural_enemy_focus.enemy_name : "직접 연결 없음"}</strong>
              <span>{data.natural_enemy_focus.selected_condition_applicable ? data.natural_enemy_focus.scope_label : "선택 조건에는 임의 추천하지 않음"}</span>
            </div>
            <div data-signal="timing" title={data.natural_enemy_focus.when}>
              <small>원문 처리시기</small>
              <strong>{data.natural_enemy_focus.selected_condition_applicable ? compactTiming(data.natural_enemy_focus.when) : "예찰 먼저"}</strong>
              <span>{data.natural_enemy_focus.selected_condition_applicable ? data.natural_enemy_focus.cycle : "공식 참고 근거는 아래에서 분리 표시"}</span>
            </div>
            <div data-signal="proof" title={data.natural_enemy_focus.evidence_grade}>
              <small>근거</small>
              <strong>{effectProof.directComparison ? "대조 확인" : effectProof.available ? "문헌 근거" : "검증 필요"}</strong>
              <span>{data.natural_enemy_focus.evidence_grade}</span>
            </div>
            <div className={styles.commandVerdict} data-signal="action" data-ready={data.natural_enemy_focus.release_ready} title={`${data.natural_enemy_focus.ready_gate_count}/${data.natural_enemy_focus.total_gate_count} 근거 관문`}>
              <small>행동</small>
              <strong>{data.natural_enemy_focus.selected_condition_applicable ? data.natural_enemy_focus.release_signal : "예찰 우선"}</strong>
              <span>{data.natural_enemy_focus.ready_gate_count}/{data.natural_enemy_focus.total_gate_count} 근거 관문</span>
            </div>
          </section>

          <section
            className={styles.effectSignature}
            data-part="effect"
            data-direct={effectProof.directComparison}
            aria-label="공식 천적 시험 효과 서명"
          >
            <header>
              <div>
                <small>EFFECT SIGNATURE · 공식 근거를 한눈에</small>
                <h3>{data.natural_enemy_focus.enemy_name} 투입 판단의 효과 근거</h3>
              </div>
              <span>{data.natural_enemy_focus.effect_evidence_tier ?? (effectProof.directComparison ? "A 직접 대조" : effectProof.available ? "B 공식 시험·문헌" : "C 현장 검증 설계")}</span>
            </header>
            <div className={brightStyles.effectEvidenceLadder} aria-label="천적 효과 근거 수준">
              {effectEvidenceLadder.map((step) => (
                <article data-ready={step.ready} data-tier={step.id} key={step.id} title={step.meaning}>
                  <i aria-hidden="true" />
                  <b>{step.id}</b>
                  <strong>{step.label}</strong>
                  <span>{step.state}</span>
                </article>
              ))}
            </div>
            {data.natural_enemy_focus.literature_evidence?.available && (
              <details className={brightStyles.literatureEvidence}>
                <summary>동료심사 논문 조건 보기</summary>
                <div>
                  <strong>{data.natural_enemy_focus.literature_evidence.title}</strong>
                  <span>{data.natural_enemy_focus.literature_evidence.conditions}</span>
                  <p>{data.natural_enemy_focus.literature_evidence.finding}</p>
                  <small>{data.natural_enemy_focus.literature_evidence.application_note}</small>
                  {data.natural_enemy_focus.literature_evidence.url && (
                    <a href={data.natural_enemy_focus.literature_evidence.url} target="_blank" rel="noreferrer">
                      논문 확인 · DOI {data.natural_enemy_focus.literature_evidence.doi}
                    </a>
                  )}
                </div>
              </details>
            )}
            {effectProof.directComparison && effectProof.control && effectProof.treatment ? (
              <div className={styles.effectSignatureBody}>
                <article className={styles.effectControlColumn}>
                  <small>{effectProof.control.group}</small>
                  <div className={styles.effectBarTrack} aria-hidden="true">
                    <i style={{ "--effect-fill": `${effectProof.controlBar}%` } as CSSProperties} />
                  </div>
                  <strong>{effectProof.control.reported_percent?.toLocaleString("ko-KR")}</strong>
                  <span>{effectProof.control.metric}</span>
                </article>
                <div className={styles.effectDeltaPulse}>
                  <small>{effectProof.comparisonDay}일 공식 관측 격차</small>
                  <strong>
                    {effectProof.observedGapPercent === null
                      ? "직접 비교 확인"
                      : `${effectProof.observedGapPercent.toFixed(1)}% 낮음`}
                  </strong>
                  <span>시험조건 한정 · 보편적 방제효과율 아님</span>
                </div>
                <article className={styles.effectTreatmentColumn}>
                  <small>{effectProof.treatment.group}</small>
                  <div className={styles.effectBarTrack} aria-hidden="true">
                    <i style={{ "--effect-fill": `${effectProof.treatmentBar}%` } as CSSProperties} />
                  </div>
                  <strong>{effectProof.treatment.reported_percent?.toLocaleString("ko-KR")}</strong>
                  <span>{effectProof.treatment.metric}</span>
                </article>
                <aside>
                  <small>NEXT ACTION</small>
                  <strong>{data.natural_enemy_focus.release_signal}</strong>
                  <p>{data.natural_enemy_focus.when}</p>
                  <b>{data.natural_enemy_focus.dose}</b>
                </aside>
              </div>
            ) : (
              <div className={styles.effectSignatureFallback}>
                <div>
                  <small>공식 시험에서 확인된 내용</small>
                  <strong>{data.natural_enemy_focus.effect_highlight}</strong>
                </div>
                <span>{effectProof.interpretation}</span>
                <b>직접 처리·대조 수치가 없으면 효과율을 생성하지 않습니다.</b>
              </div>
            )}
            <footer>
              <span>{data.natural_enemy_focus.crop} · {data.natural_enemy_focus.target_pest}</span>
              <p>{effectProof.interpretation}</p>
              <b>{data.natural_enemy_focus.evidence_grade}</b>
            </footer>
          </section>

          <div className={styles.radarGrid} data-part="radar" data-tone={activeStage.tone}>
            <div className={styles.radarScene} aria-label="천적 투입 근거 관문 레이더">
              <div className={styles.plane} aria-hidden="true">
                <div className={styles.orbitOne} />
                <div className={styles.orbitTwo} />
                <div className={styles.orbitThree} />
                <div className={styles.scanBeam} />
              </div>
              {data.natural_enemy_focus.gates.map((gate, index) => (
                <div
                  className={gate.ready ? styles.evidenceNodeReady : styles.evidenceNodeHold}
                  data-part="radar-node"
                  data-gate={gate.id}
                  data-ready={gate.ready}
                  key={gate.id}
                  style={{ "--node-index": index } as CSSProperties}
                >
                  <i aria-hidden="true" />
                  <b>{gate.label}</b>
                  <small>{gate.state}</small>
                </div>
              ))}
              <div className={styles.core} data-part="radar-core">
                <Radar size={31} />
                <small>{data.natural_enemy_focus.selected_condition_applicable ? "DIRECT EFFECT RADAR" : "EVIDENCE LENS"}</small>
                <strong>{data.natural_enemy_focus.enemy_name}</strong>
                <b>{data.natural_enemy_focus.release_signal}</b>
                <span>{data.natural_enemy_focus.ready_gate_count}/{data.natural_enemy_focus.total_gate_count} GATES</span>
              </div>
            </div>

            <article className={styles.activeCard} data-part="active-card" aria-live="polite">
              <div className={styles.activeTop}>
                <span>{activeStage.number}</span>
                <div>
                  <small>{activeStage.state}</small>
                  <h3>{activeStage.title}</h3>
                </div>
              </div>
              <strong className={styles.activeHeadline}>{activeStage.headline}</strong>
              <p>{activeStage.detail}</p>
              <div className={styles.conditionLine}>
                <span>{data.selected_condition.crop}</span>
                <span>{data.selected_condition.pest}</span>
                <span>{data.selected_condition.region}</span>
              </div>
            </article>

            <aside className={styles.signalStack} data-part="signal-stack">
              <div>
                <small>근거 잠금</small>
                <b>{data.headline_metrics.total_evidence_rows.toLocaleString("ko-KR")}</b>
                <span>공식 근거행</span>
              </div>
              <div>
                <small>백테스트</small>
                <b>{data.headline_metrics.backtest_mae?.toFixed(2) ?? "자료 부족"}</b>
                <span>2026 상대위험 MAE</span>
              </div>
              <div>
                <small>천적 게이트</small>
                <b>{data.headline_metrics.ready_gates}/{data.headline_metrics.total_gates}</b>
                <span>{data.headline_metrics.release_state}</span>
              </div>
              <div>
                <small>스마트팜 작기</small>
                <b>{data.smartfarm_context.official_seasons.toLocaleString("ko-KR")}</b>
                <span>{data.smartfarm_context.coverage} · 선택조건 {data.smartfarm_context.selected_seasons.toLocaleString("ko-KR")}건</span>
              </div>
              <div>
                <small>농작업 안전</small>
                <b>{data.headline_metrics.relative_safety_signal ?? "자료 부족"}</b>
                <span>
                  {data.headline_metrics.relative_safety_score === null
                    ? "확률로 환산하지 않음"
                    : `상대노출 ${data.headline_metrics.relative_safety_score.toFixed(1)}`}
                </span>
              </div>
            </aside>
          </div>

          <section className={styles.timingEvidence} data-part="timing" data-scope={data.natural_enemy_focus.scope}>
            <header>
              <div>
                <small>{data.natural_enemy_focus.scope === "selected_condition" ? "CONDITION-MATCHED RELEASE WINDOW" : "OFFICIAL EFFECT EVIDENCE LENS"}</small>
                <h3>{data.natural_enemy_focus.enemy_name} · 원문 처리조건과 효과 근거</h3>
              </div>
              <button className={styles.voiceButton} type="button" onClick={speakEnemyEvidence}>
                <Volume2 size={17} /> 핵심 듣기
              </button>
            </header>
            <div className={styles.evidenceSequence}>
              <article>
                <b>01</b><small>언제</small><strong>{data.natural_enemy_focus.when}</strong>
                <details><summary>근거 열기</summary><p>{data.natural_enemy_focus.environment}</p></details>
              </article>
              <i aria-hidden="true" />
              <article>
                <b>02</b><small>얼마나</small><strong>{data.natural_enemy_focus.dose}</strong>
                <details><summary>근거 열기</summary><p>{data.natural_enemy_focus.cycle}</p></details>
              </article>
              <i aria-hidden="true" />
              <article className={styles.effectEvidence}>
                <b>03</b><small>무엇이 확인됐나</small><strong>{data.natural_enemy_focus.effect_highlight}</strong>
                <details><summary>근거 열기</summary><p>{data.natural_enemy_focus.crop} · {data.natural_enemy_focus.target_pest}</p></details>
              </article>
              <i aria-hidden="true" />
              <article>
                <b>04</b><small>언제 멈추나</small><strong>{data.natural_enemy_focus.stop_condition}</strong>
                <details><summary>근거 열기</summary><p>재예찰 결과를 다음 투입 판단에 다시 입력</p></details>
              </article>
            </div>
            <footer>
              <details><summary>전체 해석 보기</summary><p>{data.natural_enemy_focus.interpretation}</p></details>
              {data.natural_enemy_focus.source_url ? (
                <a href={data.natural_enemy_focus.source_url} target="_blank" rel="noreferrer">
                  공식 원문 확인 · {data.natural_enemy_focus.source}
                </a>
              ) : <span>출처 · {data.natural_enemy_focus.source}</span>}
            </footer>
          </section>

          <div className={styles.decisionDeck} data-part="decision">
            <article className={styles.economicCard}>
              <AdoptionReview />
            </article>

            <article className={styles.validationCard}>
              <div className={styles.cardTitle}>
                <ShieldCheck size={22} />
                <div><small>PROSPECTIVE VALIDATION</small><h3>대회 이후 현장 실증을 바로 시작하는 설계</h3></div>
              </div>
              <p>{data.prospective_validation.design}</p>
              <div className={styles.protocolFlow}>
                <span>사전 등록</span><i />
                <span>처리·대조</span><i />
                <span>밀도·비용</span><i />
                <span>효과 판정</span>
              </div>
              <div className={styles.protocolDownloads}>
                {(data.prospective_validation.protocols ?? []).map((protocol) => (
                  <button type="button" key={protocol.id} onClick={() => downloadProtocol(protocol.id)}>
                    <Download size={17} /> {downloadedProtocol === protocol.id ? "저장 요청 완료" : protocol.label}
                  </button>
                ))}
              </div>
              <small>{data.prospective_validation.claim_rule}</small>
            </article>
          </div>

          <div className={styles.integrityBar} data-part="integrity">
            <CheckCircle2 size={18} />
            <div>
              <b>과장 방지 잠금</b>
              <span>{data.claim_boundary.message}</span>
            </div>
            <AudioLines size={20} />
          </div>
        </>
      )}
    </section>
  );
}
