"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Bug,
  CloudRain,
  CheckCircle2,
  Eye,
  Hand,
  Leaf,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
  Printer,
  ShieldAlert,
  Square,
  Sun,
  Tractor,
  Volume2,
  Wind,
} from "lucide-react";
import styles from "./field-action-manual.module.css";
import safetyStyles from "./field-safety-signal.module.css";
import { primeSpeechSynthesis, speakKorean, stopSpeech } from "./browser-actions";

type ManualStep = {
  id: string;
  number: string;
  title: string;
  short_title: string;
  color: "blue" | "gold" | "green" | "orange";
  state: "ready" | "verify" | "blocked";
  headline: string;
  actions: string[];
  checklist: string[];
  stop_conditions: string[];
  evidence: string;
  precise_timing_available?: boolean;
  matched_rows?: number;
  recommendations?: Array<Record<string, unknown>>;
  products?: Array<{
    registration_number: string | null;
    brand_name: string | null;
    product_name: string | null;
    active_ingredient: string | null;
    mode_of_action: string | null;
    dilution: string | null;
    amount: string | null;
    use_timing: string | null;
    safety_timing: string | null;
    use_count: string | null;
    registration_status: string | null;
    is_prescription: boolean;
  }>;
};

type ManualResponse = {
  status: string;
  manual_version: string;
  title: string;
  audience: string;
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
    is_confirmed_probability: boolean;
  };
  action_clock: {
    state: string;
    color: "gray" | "green" | "orange" | "red";
    title: string;
    instruction: string;
    forecast_score: number | null;
    work_adjustment_signal: string;
    weather_reference_date: string | null;
    is_occurrence_probability: boolean;
    is_accident_probability: boolean;
  };
  steps: ManualStep[];
  action_locks: Array<{
    id: string;
    name: string;
    open: boolean;
    status: string;
    reason: string;
  }>;
  work_safety_copilot: {
    available: boolean;
    latest: {
      date: string;
      relative_exposure_score: number | null;
      work_adjustment_signal: string;
      color: string;
      dominant_exposure: string;
      max_temperature_c: number | null;
      rainfall_mm: number | null;
      max_wind_m_s: number | null;
    } | null;
    checks: string[];
    official_accident_evidence_rows: number;
    official_accident_evidence: Array<{
      evidence_id: string;
      category: string;
      item: string;
      value: number | null;
      unit: string;
      population: string;
      display: string;
      source: string;
      is_accident_probability: boolean;
    }>;
    is_accident_probability: boolean;
    method: string | null;
    caution: string;
  };
  plain_language: Record<string, string>;
  innovation: {
    name: string;
    difference: string;
    non_claims: string[];
  };
  research_caution: string;
};

const icons = {
  surveillance: Eye,
  physical: Hand,
  biological: Leaf,
  chemical: BadgeCheck,
};

const cleanVoiceText = (text: string) => text.replace(/[·→↔]/g, ", ").replace(/\s+/g, " ").trim();

const enemyName = (item: Record<string, unknown>) =>
  String(item.name ?? item["천적명"] ?? item.scientific_name ?? "천적명 자료 없음");

const enemyEvidence = (item: Record<string, unknown>) =>
  (item.release_standard ?? {}) as Record<string, string | number | null>;

export default function FieldActionManual({
  apiBase,
  crop,
  pest,
  region,
}: {
  apiBase: string;
  crop: string;
  pest: string;
  region: string;
}) {
  const [data, setData] = useState<ManualResponse | null>(null);
  const [activeStep, setActiveStep] = useState("surveillance");
  const [showEvidence, setShowEvidence] = useState(false);
  const [showSafetyEvidence, setShowSafetyEvidence] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ pest, crop: crop || "전체", region: region || "전체" });
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/manual/field-action?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`현장 매뉴얼 API ${response.status}`);
        return response.json();
      })
      .then((payload: ManualResponse) => {
        setData(payload);
        setActiveStep("surveillance");
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiBase, crop, pest, region]);

  useEffect(() => {
    primeSpeechSynthesis();
    return () => stopSpeech();
  }, []);

  const current = data?.steps.find((step) => step.id === activeStep) ?? data?.steps[0];
  const riskLabel = useMemo(() => {
    const score = data?.forecast.score;
    if (score === null || score === undefined) return "자료 부족";
    if (score >= 67) return "높음";
    if (score >= 34) return "중간";
    return "낮음";
  }, [data]);

  const speak = () => {
    if (!data || !current) return;
    const script = [
      `${current.number}단계, ${current.title}.`,
      current.headline,
      ...current.actions,
      "확인할 내용입니다.",
      ...current.checklist,
      "중지 조건입니다.",
      ...current.stop_conditions,
    ].join(" ");
    speakKorean(cleanVoiceText(script), {
      rate: 0.88,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const speakSafety = () => {
    if (!data) return;
    const latest = data.work_safety_copilot.latest;
    const script = [
      `작업 전 안전 신호는 ${latest?.work_adjustment_signal ?? "관측자료 없음"}입니다.`,
      latest ? `주요 노출은 ${latest.dominant_exposure}, 최고기온 ${latest.max_temperature_c ?? "자료 없음"}도, 강수량 ${latest.rainfall_mm ?? "자료 없음"}밀리미터, 최대풍속 ${latest.max_wind_m_s ?? "자료 없음"}미터 매 초입니다.` : "현재 기상 관측자료가 없습니다.",
      "지금 확인할 행동입니다.",
      ...data.work_safety_copilot.checks,
      "이 신호는 개인 사고확률이나 법적 작업중지 판정이 아닙니다.",
    ].join(" ");
    speakKorean(cleanVoiceText(script), {
      rate: 0.86,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const stopVoice = () => {
    stopSpeech();
    setSpeaking(false);
  };

  const printManual = () => {
    document.body.classList.add("field-manual-print");
    const cleanup = () => document.body.classList.remove("field-manual-print");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  if (loading) return <section className={styles.shell} id="field-manual"><div className={styles.state}>현장 매뉴얼을 준비하고 있습니다.</div></section>;
  if (error || !data || !current) return <section className={styles.shell} id="field-manual"><div className={styles.state}>{error || "현장 매뉴얼 자료가 없습니다."}</div></section>;

  const ActiveIcon = icons[current.id as keyof typeof icons] ?? Eye;
  const safetyLatest = data.work_safety_copilot.latest;
  const safetyTone = String(safetyLatest?.color ?? "amber").toLowerCase();
  const accidentEvidence = data.work_safety_copilot.official_accident_evidence ?? [];
  const machineryEvidence = accidentEvidence.find((item) => /농기계|기계/.test(`${item.category} ${item.item}`));
  const machineryPatterns = accidentEvidence
    .filter((item) => /농기계|경운기|트랙터|관리기|예초기|추락|전도|넘어짐|끼임/.test(`${item.category} ${item.item}`))
    .slice(0, 5);

  return (
    <section className={styles.shell} id="field-manual">
      <header className={styles.header}>
        <div className={styles.sectionNumber}>ACT</div>
        <div className={styles.titleBlock}>
          <p>FIELD ACTION MANUAL · EASY VIEW</p>
          <h2>{data.title}</h2>
          <span>분석 화면과 분리된 현장용 안내입니다. 색과 문장을 먼저 보고, 필요한 단계만 여세요.</span>
        </div>
        <div className={styles.tools}>
          <button type="button" onClick={speaking ? stopVoice : speak}>{speaking ? <Square size={17}/> : <Volume2 size={18}/>} {speaking ? "읽기 중지" : "선택 단계 읽기"}</button>
          <button type="button" onClick={printManual}><Printer size={18}/> 한 장 인쇄</button>
        </div>
      </header>

      <div className={styles.conditionBar}>
        <div><span>병해충</span><b>{data.selected_condition.pest}</b></div>
        <div><span>작물</span><b>{data.selected_condition.crop}</b></div>
        <div><span>지역</span><b>{data.selected_condition.region}</b></div>
        <div className={`${styles.signalStatus} ${styles[data.action_clock.color]}`}><span>상대위험 신호</span><b>{riskLabel}</b><small>{data.forecast.confidence} 신뢰도</small></div>
      </div>

      <article className={`${styles.actionSignal} ${styles[data.action_clock.color]}`}>
        <div className={styles.lightCode} aria-label={`${riskLabel} 상태`}><i/><i/><i/></div>
        <div><span>ACTION SIGNAL</span><h3>{data.action_clock.title}</h3><p>{data.action_clock.instruction}</p></div>
        <aside><b>{riskLabel}</b><span>{data.action_clock.work_adjustment_signal}</span><small>발생확률·사고확률 아님</small></aside>
      </article>

      <nav className={styles.stepRail} aria-label="현장 방제 단계">
        {data.steps.map((step) => {
          const Icon = icons[step.id as keyof typeof icons] ?? Eye;
          return (
            <button
              type="button"
              key={step.id}
              className={`${styles.stepButton} ${styles[step.color]} ${activeStep === step.id ? styles.active : ""}`}
              onClick={() => { stopVoice(); setActiveStep(step.id); }}
              aria-pressed={activeStep === step.id}
            >
              <span>{step.number}</span><Icon size={21}/><div><small>{step.short_title}</small><b>{step.title}</b></div><i>{step.state === "blocked" ? "근거 확인" : step.state === "verify" ? "현장 확인" : "단계 열림"}</i>
            </button>
          );
        })}
      </nav>

      <div className={styles.manualGrid}>
        <article className={`${styles.stepDetail} ${styles[current.color]}`}>
          <header><span>{current.number}</span><ActiveIcon size={28}/><div><small>{current.short_title}</small><h3>{current.headline}</h3></div></header>
          <div className={styles.actionList}>
            <h4><PlayCircle size={18}/> 이렇게 하세요</h4>
            {current.actions.length ? current.actions.map((action) => <p key={action}>{action}</p>) : <p>현재 조건에 사용할 수 있는 검증 안내가 없습니다.</p>}
          </div>
          <div className={styles.checkGrid}>
            {current.checklist.map((item) => <span key={item}><CheckCircle2 size={17}/>{item}</span>)}
          </div>
          <div className={styles.stopBox}><ShieldAlert size={21}/><div><b>여기서는 멈추세요</b>{current.stop_conditions.map((item) => <p key={item}>{item}</p>)}</div></div>
        </article>

        <aside className={styles.sidePanel}>
          <div className={styles.lockHeader}><LockKeyhole size={20}/><span><small>EVIDENCE LOCK</small><b>근거가 열린 단계만 실행</b></span></div>
          <div className={styles.lockList}>
            {data.action_locks.map((lock) => <button type="button" key={lock.id} onClick={() => setShowEvidence(true)} className={lock.open ? styles.open : styles.closed}><i /><span><b>{lock.name}</b><small>{lock.status}</small></span><strong>{lock.open ? "열림" : "잠김"}</strong></button>)}
          </div>
          <button className={styles.evidenceToggle} type="button" onClick={() => setShowEvidence((value) => !value)}>{showEvidence ? <PauseCircle size={17}/> : <PlayCircle size={17}/>} {showEvidence ? "근거 설명 닫기" : "왜 이렇게 표시됐나요?"}</button>
          {showEvidence && <div className={styles.evidenceExplanation}>{data.action_locks.map((lock) => <p key={lock.id}><b>{lock.name}</b>{lock.reason}</p>)}</div>}
        </aside>
      </div>

      {current.id === "biological" && (
        <article className={styles.optionPanel}>
          <header><Bug size={20}/><div><span>BIOLOGICAL OPTIONS</span><h3>검증된 천적 연결</h3></div><b>{current.precise_timing_available ? "공식 처리조건 연결 · 도입 판단 별도" : "도입 검토 · 공식 처리조건 부족"}</b></header>
          <div>{(current.recommendations ?? []).length ? current.recommendations?.map((item, index) => {
            const evidence = enemyEvidence(item);
            const exact = Boolean(item.can_show_precise_timing);
            const effect = Boolean(item.effect_evidence_available);
            return (
              <div className={exact ? styles.quantifiedEnemy : styles.partialEnemy} key={`${enemyName(item)}-${index}`}>
                <span>{String(index + 1).padStart(2,"0")} · {exact ? "정량 근거" : "부분 근거"}</span>
                <b>{enemyName(item)}</b>
                <small>{String(item.timing_status ?? "조건 확인 필요")}</small>
                <dl className={styles.enemyEvidenceGrid}>
                  <div><dt>투입 시작 조건</dt><dd>{evidence.timing_condition || "원문 명시값 없음"}</dd></div>
                  <div><dt>방사량·비율</dt><dd>{evidence.release_amount || "원문 명시값 없음"}</dd></div>
                  <div><dt>간격·횟수</dt><dd>{evidence.release_schedule || "원문 명시값 없음"}</dd></div>
                  <div><dt>환경·작업 조건</dt><dd>{evidence.environment || "원문 명시값 없음"}</dd></div>
                  <div><dt>중지·전환 조건</dt><dd>{evidence.stop_condition || "원문 명시값 없음"}</dd></div>
                  <div><dt>공식 시험결과</dt><dd>{effect ? evidence.trial_effect : "선택 조건과 일치하는 정량효과 없음"}</dd></div>
                </dl>
                <i>해당 작물·해충·초기밀도의 조건부 공식 근거 · 처방이나 효과 보장값이 아님</i>
              </div>
            );
          }) : <p>현재 선택 조건에 검증된 천적 연결이 없습니다. 임의 추천하지 않습니다.</p>}</div>
        </article>
      )}

      {current.id === "chemical" && (
        <article className={styles.optionPanel}>
          <header><BadgeCheck size={20}/><div><span>REGISTERED PESTICIDE LABEL</span><h3>등록제품 표시사항 확인</h3></div><b>{(current.matched_rows ?? 0).toLocaleString("ko-KR")}행 정확일치</b></header>
          <div className={styles.productGrid}>{(current.products ?? []).length ? current.products?.map((product, index) => <div key={`${product.registration_number}-${index}`}><span>{product.mode_of_action || "기작 자료 없음"}</span><b>{product.brand_name || product.product_name || "제품명 자료 없음"}</b><small>등록 {product.registration_number || "자료 없음"}</small><dl><div><dt>희석·사용량</dt><dd>{product.dilution || product.amount || "자료 없음"}</dd></div><div><dt>사용적기</dt><dd>{product.use_timing || "자료 없음"}</dd></div><div><dt>안전기준</dt><dd>{product.safety_timing || "자료 없음"} · {product.use_count || "횟수 자료 없음"}</dd></div></dl><i>처방이 아닌 공식 등록 후보</i></div>) : <p>작물·병해충이 정확히 일치하는 등록제품 자료가 없습니다.</p>}</div>
        </article>
      )}

      <article className={safetyStyles.safetyCopilot} data-tone={safetyTone}>
        <header className={safetyStyles.header}>
          <ShieldAlert size={24}/>
          <div><span>WORK SAFETY SIGNAL</span><h3>오늘 작업 안전 신호</h3></div>
          <button type="button" onClick={speaking ? stopVoice : speakSafety}>{speaking ? <Square size={17}/> : <Volume2 size={18}/>} {speaking ? "음성 중지" : "신호 음성 설명"}</button>
        </header>

        <div className={safetyStyles.board} aria-live="polite">
          <button className={safetyStyles.core} type="button" onClick={() => setShowSafetyEvidence((value) => !value)} aria-expanded={showSafetyEvidence}>
            <i aria-hidden="true"/>
            <small>지금 판단</small>
            <strong>{safetyLatest?.work_adjustment_signal ?? "관측자료 없음"}</strong>
            <span>{safetyLatest?.dominant_exposure ?? "기상 확인 필요"}</span>
            <b>{showSafetyEvidence ? "근거 닫기" : "눌러서 근거 보기"}</b>
          </button>

          <div className={safetyStyles.beacons}>
            <button type="button" data-level={(safetyLatest?.max_temperature_c ?? 0) >= 33 ? "alert" : "safe"} onClick={() => setShowSafetyEvidence(true)}>
              <Sun aria-hidden="true"/><span>더위</span><strong>{safetyLatest?.max_temperature_c ?? "-"}℃</strong>
            </button>
            <button type="button" data-level={(safetyLatest?.rainfall_mm ?? 0) > 0 ? "watch" : "safe"} onClick={() => setShowSafetyEvidence(true)}>
              <CloudRain aria-hidden="true"/><span>비</span><strong>{safetyLatest?.rainfall_mm ?? "-"}mm</strong>
            </button>
            <button type="button" data-level={(safetyLatest?.max_wind_m_s ?? 0) >= 8 ? "alert" : (safetyLatest?.max_wind_m_s ?? 0) >= 5 ? "watch" : "safe"} onClick={() => setShowSafetyEvidence(true)}>
              <Wind aria-hidden="true"/><span>바람</span><strong>{safetyLatest?.max_wind_m_s ?? "-"}m/s</strong>
            </button>
            <button type="button" data-level="pattern" onClick={() => setShowSafetyEvidence(true)}>
              <Tractor aria-hidden="true"/><span>농기계</span><strong>{machineryEvidence?.value ?? "확인"}{machineryEvidence?.unit ?? ""}</strong>
            </button>
          </div>
        </div>

        <div className={safetyStyles.now}>
          {data.work_safety_copilot.checks.slice(0, 3).map((item, index) => <button type="button" key={item} onClick={() => setShowSafetyEvidence(true)}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b></button>)}
        </div>

        {machineryPatterns.length > 0 && <section className={safetyStyles.machineStage} aria-label="공식 농기계 사고 관측 패턴">
          <div className={safetyStyles.machineIntro}>
            <Tractor aria-hidden="true"/>
            <span>농기계 안전</span>
            <strong>작업 전 확인</strong>
            <small>공식 관측 비중 · 개인 사고확률 아님</small>
          </div>
          <div className={safetyStyles.machineOrbit}>
            {machineryPatterns.map((item) => (
              <button key={item.evidence_id} type="button" onClick={() => setShowSafetyEvidence(true)} title={item.source}>
                <i style={{ "--value": `${Math.min(100, Math.max(0, Number(item.value ?? 0)))}%` } as React.CSSProperties}/>
                <b>{item.item}</b>
                <strong>{item.value ?? "-"}{item.unit}</strong>
              </button>
            ))}
          </div>
        </section>}

        {showSafetyEvidence && <div className={safetyStyles.drawer}>
          <section>
            <span>지금 할 일</span>
            {data.work_safety_copilot.checks.map((item) => <p key={item}><CheckCircle2 size={17}/>{item}</p>)}
          </section>
          <section>
            <span>공식 관측 패턴 · 사고확률 아님</span>
            <div className={safetyStyles.pulseGrid}>
              {(data.work_safety_copilot.official_accident_evidence ?? []).slice(0, 6).map((item) => (
                <div key={item.evidence_id}><i style={{ "--value": `${Math.min(100, Math.max(0, Number(item.value ?? 0)))}%` } as React.CSSProperties}/><b>{item.item}</b><strong>{item.value ?? "-"}{item.unit}</strong></div>
              ))}
            </div>
          </section>
        </div>}
        <footer className={safetyStyles.footer}>색상 신호는 작업 전 확인 순서를 보여줍니다. 개인 사고확률이나 법적 작업중지 판정은 아닙니다.</footer>
      </article>

      <footer className={styles.footer}><Leaf size={20}/><div><b>{data.innovation.name}</b><span>{data.innovation.difference}</span></div><small>{data.manual_version}</small></footer>
    </section>
  );
}
