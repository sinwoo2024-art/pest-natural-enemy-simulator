"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, CalendarRange, Check, Database, Gauge, Leaf, MapPinned, Radio, ShieldCheck, Square, ThermometerSun, Volume2 } from "lucide-react";
import styles from "./smartfarm-release-window.module.css";
import brightStyles from "./smartfarm-release-window-bright.module.css";
import { primeSpeechSynthesis, speakKorean, stopSpeech } from "./browser-actions";
import { useAdoptionReview } from "./adoption-review-context";
import { boundedFetchJson } from "./bounded-fetch";

type Props = { apiBase: string; crop: string; pest: string; region: string };

type Enemy = {
  name?: string;
  scientific_name?: string;
  timing_status: string;
  can_show_precise_timing: boolean;
  release_standard: {
    timing_condition?: string | null;
    release_amount?: string | null;
    release_schedule?: string | null;
    environment?: string | null;
    stop_condition?: string | null;
    source?: string | null;
  };
  applicability?: { pest_match: boolean; crop_match: boolean; condition: string };
};

type Payload = {
  cultivation: {
    smartfarm_metadata_rows: number;
    selected_crop_metadata_rows: number;
    matched_district_count: number;
    matched_district_examples: string[];
    greenhouse_types: string[];
    facility_types: string[];
    caution: string;
  };
  natural_enemy: { recommendations: Enemy[]; caution: string };
};

type SmartfarmEvidence = {
  available: boolean;
  source?: { provider: string; service: string; coverage: string; document_url?: string | null };
  collection_validation?: { requests: number; success: number; failure: number; credential_raw_recorded: boolean };
  official_summary?: {
    farm_count: number;
    farm_season_rows: number;
    season_date_rows: number;
    crop_count: number;
    province_count: number;
    district_count: number;
    management_output_observed_seasons: number;
    management_cost_observed_seasons: number;
  };
  selected_condition?: {
    crop: string;
    region: string;
    matched_seasons: number;
    matched_anonymised_cases: number;
    year_count: number;
    province_count: number;
    district_count: number;
    data_status: string;
  };
  timing_context?: {
    monthly_profile: { month: number; season_starts: number; season_ends: number }[];
    busiest_start_month: number | null;
    busiest_end_month: number | null;
    interpretation: string;
  };
  economic_observations?: {
    output_observed_seasons: number;
    cost_observed_seasons: number;
    income_value_observations: number;
    causal_effect_available: boolean;
    interpretation: string;
  };
  approval?: {
    approved_count: number;
    checked_count: number;
    services: { code: string; name: string; approved: boolean; state: string; document_url?: string | null }[];
    caution: string;
  };
  claim_boundary?: {
    direct_ncpms_field_link: boolean;
    natural_enemy_causal_effect: boolean;
    economic_causal_effect: boolean;
    allowed_use: string;
    prohibited_claim: string;
  };
};

type Range = { min: number; max: number; unit: string } | null;

function extractRange(text: string, kind: "temperature" | "humidity"): Range {
  const escaped = text.replaceAll("∼", "~").replaceAll("–", "-");
  const patterns = kind === "temperature"
    ? [/(?:온도|기온)[^\d-]*(-?\d+(?:\.\d+)?)\s*(?:~|-)\s*(-?\d+(?:\.\d+)?)\s*(?:℃|°C|도)/i,
       /(-?\d+(?:\.\d+)?)\s*(?:~|-)\s*(-?\d+(?:\.\d+)?)\s*(?:℃|°C)/i]
    : [/(?:습도|상대습도)[^\d]*?(\d+(?:\.\d+)?)\s*(?:~|-)\s*(\d+(?:\.\d+)?)\s*%/i];
  for (const pattern of patterns) {
    const match = escaped.match(pattern);
    if (match) return { min: Number(match[1]), max: Number(match[2]), unit: kind === "temperature" ? "℃" : "%" };
  }
  return null;
}

export default function SmartfarmReleaseWindow({ apiBase, crop, pest, region }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [officialEvidence, setOfficialEvidence] = useState<SmartfarmEvidence | null>(null);
  const { review, field, setField, enemyName, setEnemyName, loading: reviewLoading, error: reviewError } = useAdoptionReview();
  const { temperature, humidity, pest_observed: pestObserved, crop_stage_checked: cropStageChecked } = field;
  const chemicalCleared = field.chemical_residue === "clear";
  const [showEvidence, setShowEvidence] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ pest, crop: crop || "전체", region: region || "전체", cultivation_mode: "스마트팜" });
    const evidenceQuery = new URLSearchParams({ crop: crop || "전체", region: region || "전체" });
    setLoading(true);
    setLoadError(null);
    setEvidenceError(null);
    setData(null);
    setOfficialEvidence(null);
    Promise.all([
      boundedFetchJson<Payload>(`${apiBase}/api/decision-support?${query}`, controller.signal),
      boundedFetchJson<SmartfarmEvidence>(`${apiBase}/api/smartfarm/evidence?${evidenceQuery}`, controller.signal)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setEvidenceError(error instanceof Error ? error.message : "스마트팜 자료 연결 실패");
          return null;
        }),
    ])
      .then(([payload, evidence]: [Payload, SmartfarmEvidence | null]) => {
        if (controller.signal.aborted) return;
        if (!payload?.cultivation || !Array.isArray(payload?.natural_enemy?.recommendations)) throw new Error("연결 실패 · 응답 형식 오류");
        setData(payload);
        setOfficialEvidence(evidence);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) { setData(null); setLoadError(error instanceof Error ? error.message : "연결 실패"); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, crop, pest, region, retry]);

  const enemy = enemyName ? data?.natural_enemy.recommendations.find((item) => item.name === enemyName) : data?.natural_enemy.recommendations[0];
  const environmentText = [enemy?.release_standard.environment, enemy?.release_standard.timing_condition].filter(Boolean).join(" · ");
  const temperatureRange = useMemo(() => extractRange(environmentText, "temperature"), [environmentText]);
  const humidityRange = useMemo(() => extractRange(environmentText, "humidity"), [environmentText]);
  const targetFits = Boolean(review?.tracks.evidence.checks.pest_match && review?.tracks.evidence.checks.crop_match);
  const environmentAssessed = field.environment !== "unknown";
  const environmentFits = field.environment === "clear";
  const monthlyProfile = officialEvidence?.timing_context?.monthly_profile ?? [];
  const maxMonthlyCount = Math.max(1, ...monthlyProfile.map((item) => Math.max(item.season_starts, item.season_ends)));
  const missingApprovals = officialEvidence?.approval?.services.filter((service) => !service.approved) ?? [];
  const windowState = {
    level: reviewLoading ? "검토 중" : review?.status ?? "자료 부족",
    tone: review?.status === "도입 검토 후보" ? "green" : review?.status === "현장 적용 검토 보류" ? "red" : "amber",
    message: reviewError ?? review?.reason ?? "근거와 사용자 입력 경제성·현장조건을 확인합니다.",
  };

  const gates = [
    { name: "초기 해충 확인", ready: pestObserved, detail: pestObserved ? "현장 관찰 입력" : "미입력" },
    { name: "작물·대상 일치", ready: targetFits, detail: enemy?.applicability?.condition ?? "직접 근거 없음" },
    { name: "시설 환경 적합", ready: environmentFits, unknown: !environmentAssessed, detail: environmentAssessed ? `${temperature}℃ · ${humidity}%` : "수치 기준 미확보" },
    { name: "안전·생육 확인", ready: cropStageChecked && chemicalCleared, detail: cropStageChecked && chemicalCleared ? "작업자 확인 완료" : "확인 필요" },
  ];

  const speakWindow = () => {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const script = [
      `천적 도입 타당성 검토 상태는 ${windowState.level}입니다. 실제 방사 명령이 아닙니다.`,
      windowState.message,
      enemy ? `검증 천적은 ${enemy.name ?? enemy.scientific_name ?? "이름 확인 필요"}입니다.` : "직접 연결된 천적이 없습니다.",
      enemy?.release_standard.timing_condition ?? "투입 시작 조건은 공식 원문 확인이 필요합니다.",
      enemy?.release_standard.release_amount ?? "방사량은 공식 원문 확인이 필요합니다.",
      enemy?.release_standard.release_schedule ?? "반복 간격은 공식 원문 확인이 필요합니다.",
    ].join(" ");
    speakKorean(script, {
      rate: .86,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  useEffect(() => {
    primeSpeechSynthesis();
    return () => stopSpeech();
  }, []);

  return (
    <section className={`${styles.section} ${brightStyles.shell}`} id="smartfarm-release-window" aria-labelledby="smartfarm-window-title">
      <header className={styles.heading}>
        <span className={styles.number}>GATE</span>
        <div><p>NATURAL ENEMY ADOPTION REVIEW</p><h2 id="smartfarm-window-title">천적 도입 검토 구간</h2></div>
        <p>천적은 물리적으로 언제든 방사할 수 있습니다. 이 화면은 예찰·생태·경제 조건에 따른 <b>검토 우선 구간</b>을 제시하며, 환경 적합성만으로 효과나 경제성을 확정하지 않습니다.</p>
      </header>

      {loading ? <div className={styles.loading}>스마트팜·천적 근거를 연결하고 있습니다. (최대 15초)</div> : null}
      {!loading && (loadError || evidenceError) ? <div className={styles.loading} role="alert">{loadError ?? evidenceError} <button type="button" onClick={() => setRetry((v) => v + 1)}>다시 시도</button></div> : null}
      {!loading && !loadError && !evidenceError && !officialEvidence?.available ? <div className={styles.loading} role="status">선택 조건의 스마트팜 자료 없음 <button type="button" onClick={() => setRetry((v) => v + 1)}>다시 시도</button></div> : null}
      {data ? <div className={styles.console} data-part="console" data-tone={windowState.tone}>
        {officialEvidence?.available ? <div className={styles.officialRibbon} data-part="ribbon">
          <span><Database size={16}/> 스마트팜코리아 공식 API</span>
          <strong>{officialEvidence.source?.coverage} · {officialEvidence.official_summary?.farm_count.toLocaleString("ko-KR")}농가 · {officialEvidence.official_summary?.farm_season_rows.toLocaleString("ko-KR")}작기</strong>
          <small>실요청 {officialEvidence.collection_validation?.requests.toLocaleString("ko-KR")}회 / 실패 {officialEvidence.collection_validation?.failure.toLocaleString("ko-KR")}회 / 인증키 원문 저장 0건</small>
        </div> : null}
        <div className={styles.signalTools} data-part="tools">
          <button type="button" onClick={speakWindow}>{speaking ? <Square size={16}/> : <Volume2 size={18}/>} {speaking ? "음성 중지" : "현재 신호 음성"}</button>
          <button type="button" aria-expanded={showEvidence} onClick={() => setShowEvidence((value) => !value)}>{showEvidence ? "근거 닫기" : "공식 근거 자세히"}</button>
        </div>
        <div className={styles.orbitPanel} data-part="orbit">
          <div className={styles.rings} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.core} data-part="core"><Radio size={24}/><span>현재 신호</span><strong>{windowState.level}</strong><small>확률이 아닌 근거 게이트</small></div>
          {gates.map((gate, index) => <div className={styles.orbitGate} data-part="gate" data-ready={gate.ready} data-unknown={gate.unknown} key={gate.name} style={{ "--gate": index } as React.CSSProperties}>
            {gate.ready ? <Check size={15}/> : <span>{index + 1}</span>}<b>{gate.name}</b><small>{gate.detail}</small>
          </div>)}
        </div>

        <div className={styles.controlPanel} data-part="control">
          <div className={styles.statusMessage}><span>{windowState.level}</span><p>{windowState.message}</p></div>
          <p><a href="#adoption-review">현장 관문·경제성 입력과 최종 판단 근거 확인 ↑</a></p>
          <div className={styles.enemySelector}>
            <label><Bug size={18}/><span>연결 천적</span><select value={enemy?.name ?? ""} onChange={(event) => { setEnemyName(event.target.value || null); setField((f) => ({ ...f, environment: "unknown", chemical_residue: "unknown" })); }}>
              {data.natural_enemy.recommendations.length
                ? data.natural_enemy.recommendations.map((item, index) => <option key={`${item.name}-${index}`} value={item.name}>{item.name ?? item.scientific_name ?? `천적 ${index + 1}`}</option>)
                : <option value="">직접 연결 없음</option>}
            </select></label>
            <b>{enemy?.timing_status ?? "정량 투입 근거 미확보"}</b>
          </div>
          <div className={styles.sensorGrid}>
            <label><ThermometerSun size={18}/><span>사용자 현장 기온 (℃)</span><input min="-60" max="80" step="any" type="number" value={temperature ?? ""} placeholder="미입력" onChange={(event) => setField((f) => ({ ...f, temperature: event.target.value === "" ? null : Number(event.target.value), environment: "unknown" }))}/><small>{temperatureRange ? `원문 보고 범위 ${temperatureRange.min}~${temperatureRange.max}${temperatureRange.unit} · 자동 적합 판정 아님` : "공식 수치 범위 없음"}</small></label>
            <label><Gauge size={18}/><span>사용자 현장 상대습도 (%)</span><input min="0" max="100" step="any" type="number" value={humidity ?? ""} placeholder="미입력" onChange={(event) => setField((f) => ({ ...f, humidity: event.target.value === "" ? null : Number(event.target.value), environment: "unknown" }))}/><small>{humidityRange ? `원문 보고 범위 ${humidityRange.min}~${humidityRange.max}${humidityRange.unit} · 자동 적합 판정 아님` : "공식 수치 범위 없음"}</small></label>
          </div>
          <div className={styles.checkGrid}>
            <button aria-pressed={pestObserved} onClick={() => setField((f) => ({ ...f, pest_observed: !f.pest_observed }))} type="button"><Bug size={17}/><span>초기 해충 관찰</span><b>{pestObserved ? "확인" : "미확인"}</b></button>
            <button aria-pressed={cropStageChecked} onClick={() => setField((f) => ({ ...f, crop_stage_checked: !f.crop_stage_checked }))} type="button"><Leaf size={17}/><span>생육단계 확인</span><b>{cropStageChecked ? "확인" : "미확인"}</b></button>
            <a href="#adoption-review"><ShieldCheck size={17}/><span>농약·작업자 안전</span><b>{chemicalCleared ? "불리 조건 없음 확인" : field.chemical_residue === "adverse" ? "불리 조건 있음" : "미확인"} · 관문 입력</b></a>
          </div>
          <div className={styles.releaseEvidence}>
            <div><span>방사량 원문</span><strong>{enemy?.release_standard.release_amount || "미확보"}</strong></div>
            <div><span>반복·간격</span><strong>{enemy?.release_standard.release_schedule || "미확보"}</strong></div>
            <div><span>중지·전환</span><strong>{enemy?.release_standard.stop_condition || "원문 명시 없음"}</strong></div>
          </div>
        </div>

        {showEvidence ? <aside className={styles.evidencePanel} data-part="evidence">
          <div><span>공식 익명 농가</span><strong>{officialEvidence?.official_summary?.farm_count.toLocaleString("ko-KR") ?? data.cultivation.smartfarm_metadata_rows.toLocaleString("ko-KR")}곳</strong><small>농장주·정확한 주소는 표시하지 않음</small></div>
          <div><span>선택 조건 작기</span><strong>{officialEvidence?.selected_condition?.matched_seasons.toLocaleString("ko-KR") ?? data.cultivation.selected_crop_metadata_rows.toLocaleString("ko-KR")}건</strong><small>{officialEvidence?.selected_condition?.data_status ?? "기존 메타데이터 일치"}</small></div>
          <div><span>공식 공간 범위</span><strong>{officialEvidence?.official_summary?.district_count ?? data.cultivation.matched_district_count}개 시군구</strong><small>{officialEvidence?.official_summary ? `${officialEvidence.official_summary.province_count}개 시도 · 전체 원천 범위` : data.cultivation.matched_district_examples.slice(0, 4).join(" · ")}</small></div>
          <div><span>경영 관측 작기</span><strong>{officialEvidence?.official_summary?.management_output_observed_seasons ?? 0}건</strong><small>천적 인과효과가 아닌 관측 유무</small></div>
          <p>사용자 입력값은 검토 계산을 위해 서버로 전송되며 저장하지 않습니다. 이 신호는 방제효과율·발생확률·자동처방이 아니며 NCPMS 위험점수에 합산하지 않습니다.</p>
        </aside> : null}

        {officialEvidence?.available && showEvidence ? <div className={styles.officialEvidence} data-part="official-evidence">
          <div className={styles.evidenceTitle}>
            <div><span>JUDGE EVIDENCE SPINE</span><h3>작기 맥락으로 천적 확인 시점을 좁힙니다</h3></div>
            <p>작기 분포 → 생육단계 확인 → 센서 적합성 → 천적 원문 → 현장 행동의 순서입니다. 작기 최빈월을 방사일로 오인하지 않습니다.</p>
          </div>
          <div className={styles.evidenceStats}>
            <div><CalendarRange size={18}/><span>작기 시작 집중월</span><strong>{officialEvidence.timing_context?.busiest_start_month ? `${officialEvidence.timing_context.busiest_start_month}월` : "자료 부족"}</strong></div>
            <div><MapPinned size={18}/><span>선택 조건 공간</span><strong>{officialEvidence.selected_condition?.district_count ?? 0}개 시군구</strong></div>
            <div><Database size={18}/><span>선택 조건 경영관측</span><strong>{officialEvidence.economic_observations?.output_observed_seasons ?? 0}작기</strong></div>
            <div data-warning={missingApprovals.length > 0}><ShieldCheck size={18}/><span>서비스 승인</span><strong>{officialEvidence.approval?.approved_count ?? 0}/{officialEvidence.approval?.checked_count ?? 0}</strong></div>
          </div>
          <div className={styles.monthlyPulse} data-part="monthly" aria-label="공식 스마트팜 작기 시작·종료 월 분포">
            {monthlyProfile.map((item) => <div key={item.month} title={`${item.month}월 시작 ${item.season_starts}건, 종료 ${item.season_ends}건`}>
              <span><i style={{ height: `${Math.max(4, item.season_starts / maxMonthlyCount * 100)}%` }}/><b style={{ height: `${Math.max(4, item.season_ends / maxMonthlyCount * 100)}%` }}/></span>
              <small>{item.month}</small>
            </div>)}
          </div>
          <div className={styles.legend}><span><i/>작기 시작</span><span><b/>작기 종료</span><p>{officialEvidence.timing_context?.interpretation}</p></div>
          {missingApprovals.length ? <div className={styles.approvalNotice}><b>추가 활용신청 필요 {missingApprovals.length}개</b><span>{missingApprovals.map((item) => item.name).join(" · ")}</span><small>현재 승인된 작기별 데이터만 분석에 사용했습니다.</small></div> : null}
          <p className={styles.claimBoundary}><b>분석 경계</b> {officialEvidence.claim_boundary?.prohibited_claim}</p>
        </div> : null}
      </div> : null}
    </section>
  );
}
