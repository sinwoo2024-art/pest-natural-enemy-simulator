"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Database, MapPinned, ShieldCheck, Square, Volume2 } from "lucide-react";
import styles from "./smartfarm-release-window.module.css";
import brightStyles from "./smartfarm-release-window-bright.module.css";
import { primeSpeechSynthesis, speakKorean, stopSpeech } from "./browser-actions";
import { boundedFetchJson } from "./bounded-fetch";

type Props = { apiBase: string; crop: string; pest: string; region: string };
type SmartfarmEvidence = {
  available: boolean;
  source?: { provider: string; service: string; coverage: string; document_url?: string | null };
  collection_validation?: { requests: number; success: number; failure: number };
  official_summary?: { farm_count: number; farm_season_rows: number; district_count: number; province_count: number; management_output_observed_seasons: number };
  selected_condition?: { matched_seasons: number; district_count: number; data_status: string };
  timing_context?: { monthly_profile: { month: number; season_starts: number; season_ends: number }[]; busiest_start_month: number | null; interpretation: string };
  economic_observations?: { output_observed_seasons: number; interpretation: string };
  approval?: { approved_count: number; checked_count: number; services: { code: string; name: string; approved: boolean; state: string; document_url?: string | null }[]; caution: string };
  claim_boundary?: { prohibited_claim?: string; notice?: string };
};

export default function SmartfarmReleaseWindow({ apiBase, crop, region }: Props) {
  const [response, setResponse] = useState<{ key: string; data: SmartfarmEvidence } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [retry, setRetry] = useState(0);
  const query = new URLSearchParams({ crop: crop || "전체", region: region || "전체" }).toString();
  const data = response?.key === query ? response.data : null;
  const failure = error?.key === query ? error.message : null;
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    boundedFetchJson<SmartfarmEvidence>(`${apiBase}/api/smartfarm/evidence?${query}`, controller.signal)
      .then((payload) => {
        if (typeof payload?.available !== "boolean") throw new Error("스마트팜 응답 형식 오류");
        if (!controller.signal.aborted) setResponse({ key: query, data: payload });
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError({ key: query, message: e instanceof Error ? e.message : "연결 실패" }); });
    return () => controller.abort();
  }, [apiBase, query, retry]);
  useEffect(() => { primeSpeechSynthesis(); return () => stopSpeech(); }, []);
  const speak = () => {
    if (speaking) { stopSpeech(); setSpeaking(false); return; }
    speakKorean(`스마트팜 확장 연구 트랙입니다. 작기와 시설환경 자료이며 시설 해충 밀도자료가 아닙니다. NCPMS 위험도와 점수를 합산하지 않습니다. ${data?.source?.coverage ?? "기간 확인 필요"}. ${data?.official_summary?.farm_count ?? "자료 미확보"}농가, ${data?.official_summary?.farm_season_rows ?? "자료 미확보"}작기.`,
      { rate: .86, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };
  const monthly = data?.timing_context?.monthly_profile ?? [];
  const maximum = Math.max(1, ...monthly.flatMap((row) => [row.season_starts, row.season_ends]));
  const missing = data?.approval?.services.filter((s) => !s.approved) ?? [];
  return <section className={`${styles.section} ${brightStyles.shell}`} id="smartfarm-release-window" aria-labelledby="smartfarm-window-title">
    <header className={styles.heading}><span className={styles.number}>EXT</span><div><p>SEPARATE RESEARCH TRACK</p><h2 id="smartfarm-window-title">스마트팜 확장 연구 트랙</h2></div><p>스마트팜 자료는 작기·시설환경을 확인하기 위한 별도 확장 연구 트랙입니다. NCPMS 노지 상대위험도를 이용해 시설 내 해충 발생밀도, 방사밀도 또는 최적 방사 시점을 추정하지 않습니다.</p></header>
    {!data && !failure && <div className={styles.loading}>스마트팜 작기·시설환경 자료 연결 중 (최대 15초)</div>}
    {failure && <div className={styles.loading} role="alert">{failure} <button type="button" onClick={() => { setResponse(null); setError(null); setRetry((v) => v + 1); }}>다시 시도</button></div>}
    {data && !data.available && <div className={styles.loading} role="status">선택 조건의 스마트팜 자료 없음 <button type="button" onClick={() => { setResponse(null); setRetry((v) => v + 1); }}>다시 시도</button></div>}
    {data?.available && <div className={styles.console} data-part="console" data-tone="amber">
      <div className={styles.officialRibbon} data-part="ribbon"><span><Database size={16}/> 스마트팜코리아 공식 API</span><strong>{data.source?.coverage} · {data.official_summary?.farm_count.toLocaleString("ko-KR")}농가 · {data.official_summary?.farm_season_rows.toLocaleString("ko-KR")}작기</strong><small>해충 발생밀도 자료가 아닌 작기·시설환경 맥락 자료</small></div>
      <div className={styles.signalTools} data-part="tools"><button type="button" onClick={speak}>{speaking ? <Square size={16}/> : <Volume2 size={18}/>} {speaking ? "음성 중지" : "자료 설명 음성"}</button><button type="button" aria-expanded={showEvidence} onClick={() => setShowEvidence((v) => !v)}>{showEvidence ? "근거 닫기" : "공식 근거 자세히"}</button></div>
      <div className={styles.orbitPanel} data-part="orbit"><div className={styles.rings} aria-hidden="true"><i/><i/><i/></div><div className={styles.core} data-part="core"><Database size={24}/><span>핵심 트랙과 분리</span><strong>확장 연구</strong><small>해충 밀도자료 미확보</small></div></div>
      <div className={styles.controlPanel} data-part="control"><div className={styles.statusMessage}><span>작기·시설환경 맥락 확인</span><p>{crop} · {region} · {data.selected_condition?.data_status ?? "선택 조건 확인 필요"}</p></div>
        <div className={styles.releaseEvidence}><div><span>시설 해충 밀도</span><strong>실제 자료 미확보</strong></div><div><span>NCPMS 위험점수</span><strong>합산하지 않음</strong></div><div><span>방사밀도·최적 시점</span><strong>산출하지 않음</strong></div></div>
        <p>향후 실제 스마트팜 해충 밀도자료 확보 후 검증 예정입니다. 작기 시작 집중월은 방사 시점이 아닙니다.</p><p>천적 원문 처리조건과 사용자 현장 관문은 <a href="#adoption-review">별도 천적 구입·방사 경제성 시나리오</a>에서 확인합니다.</p><p>{data.economic_observations?.interpretation}</p>
      </div>
      {showEvidence && <div className={styles.officialEvidence} data-part="official-evidence"><div className={styles.evidenceTitle}><div><span>SMARTFARM DATA CONTEXT</span><h3>공식 작기 분포와 시설환경 맥락</h3></div><p>작기·지역·경영 관측 유무만 확인합니다. NCPMS 위험도나 해충 밀도·방사 효과와 연결하지 않습니다.</p></div>
        <div className={styles.evidenceStats}><div><CalendarRange size={18}/><span>작기 시작 집중월 (방사 시점 아님)</span><strong>{data.timing_context?.busiest_start_month ? `${data.timing_context.busiest_start_month}월` : "자료 부족"}</strong></div><div><MapPinned size={18}/><span>선택 작기 / 시군구</span><strong>{data.selected_condition?.matched_seasons ?? "—"} / {data.selected_condition?.district_count ?? "—"}</strong></div><div><Database size={18}/><span>경영 관측 작기</span><strong>{data.economic_observations?.output_observed_seasons ?? "—"}</strong></div><div><ShieldCheck size={18}/><span>서비스 승인</span><strong>{data.approval?.approved_count ?? "—"}/{data.approval?.checked_count ?? "—"}</strong></div></div>
        <div className={styles.monthlyPulse} data-part="monthly" aria-label="공식 스마트팜 작기 시작·종료 월 분포">{monthly.map((row) => <div key={row.month} title={`${row.month}월 시작 ${row.season_starts}건, 종료 ${row.season_ends}건`}><span><i style={{ height: `${row.season_starts / maximum * 100}%`, minHeight: row.season_starts ? 4 : 0 }}/><b style={{ height: `${row.season_ends / maximum * 100}%`, minHeight: row.season_ends ? 4 : 0 }}/></span><small>{row.month}</small></div>)}</div>
        <div className={styles.legend}><span><i/>작기 시작</span><span><b/>작기 종료</span><p>{data.timing_context?.interpretation}</p></div>
        {missing.length > 0 && <div className={styles.approvalNotice}><b>추가 활용신청 필요 {missing.length}개</b><span>{missing.map((s) => s.name).join(" · ")}</span><small>현재 승인된 작기별 자료만 사용</small></div>}
        <p>수집 요청 {data.collection_validation?.requests ?? "—"}회 / 실패 {data.collection_validation?.failure ?? "—"}회 · 공개 자료는 익명 사례로만 표시합니다.</p>
        <p className={styles.claimBoundary}><b>분석 경계</b> {data.claim_boundary?.prohibited_claim}</p>
        {data.source?.document_url && <a href={data.source.document_url} target="_blank" rel="noreferrer">스마트팜코리아 원문 ↗</a>}
      </div>}
    </div>}
  </section>;
}
