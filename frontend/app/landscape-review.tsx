"use client";

import { useEffect, useState } from "react";
import { boundedFetchJson } from "./bounded-fetch";
import RiskTrendChart from "./risk-trend-chart";
import styles from "./landscape-review.module.css";
import ThresholdInputs, { EMPTY_CRITERION, EMPTY_EIL, type Criterion, type EilInputs, type ThresholdResult } from "./threshold-inputs";

const QUESTIONS = [
  ["cultivation", "노지 재배유형", ["미확인", "논", "밭", "과수원", "기타 노지"]],
  ["edge_vegetation", "포장 가장자리 식생", ["미확인", "있음", "없음"]],
  ["flowers", "꽃자원", ["미확인", "있음", "없음"]],
  ["refuge", "초생대·비경작지·피난처", ["미확인", "있음", "없음"]],
  ["woody_border", "방풍림·수림대·울타리", ["미확인", "있음", "없음"]],
  ["land_use", "주변 토지이용", ["미확인", "농경지", "산림", "도시", "혼합"]],
  ["recent_mowing", "최근 예초·제초", ["미확인", "있음", "없음"]],
  ["nonselective_insecticide", "최근 비선택성 살충제 사용", ["미확인", "있음", "없음"]],
  ["pest_survey", "현장 해충 밀도조사", ["미확인", "있음", "없음"]],
  ["enemy_observed", "현장 천적 관찰", ["미확인", "있음", "없음"]],
] as const;
type FieldInput = Record<typeof QUESTIONS[number][0], string> & {
  density: number | null; method: string; unit: string; survey_date: string | null;
  assumed_threshold: number | null; assumed_threshold_unit: string;
  site_name: string; sample_size:number|null;sample_unit:string;enemy_count:number|null;last_spray_date:string|null;
};
const emptyField = (): FieldInput => ({
  ...Object.fromEntries(QUESTIONS.map(([key]) => [key, "미확인"])),
  density: null, method: "", unit: "", survey_date: null, assumed_threshold: null, assumed_threshold_unit: "",
  site_name:"",sample_size:null,sample_unit:"",enemy_count:null,last_spray_date:null,
} as FieldInput);
type Source = { id: string; title: string; url: string; scope: string };
export type LandscapeResult = {
  status: string; reason: string; meaning: string; notice: string;
  surveillance: { score: number | null; level: string; trend: { round: number; score: number }[] };
  density: { complete: boolean }; landscape_grade: string; enemy_source_grade: string;
  enemies: { name: string; source_grade: string }[]; selected_enemy: string | null;
  evidence_status: string; source_notice: string; grade_definitions: Record<string, string>;
  threshold: ThresholdResult;
  weather?:{status:string;scope:string;points:{station_id:string;station_name:string;province:string;observed_at:string;air_temperature:number|null;rainfall:number|null;wind_speed:number|null}[]};
  used_data:string[];unused_data:string[];missing_data:string[];next_actions:string[];
  methods: { method: string; purpose: string; target: string; match: string; grade: string;
    sources: Source[]; domestic: string; limitation: string; field_check: string; action: string }[];
  sources: Source[]; climate: { ncpms: string; kma: string; relation: string; notice: string }; additional_data: string[];
};

export default function LandscapeReview({ apiBase, crop, pest, region }: { apiBase: string; crop: string; pest: string; region: string }) {
  const [field, setField] = useState<FieldInput>(emptyField);
  const [enemy, setEnemy] = useState<string | null>(null);
  const [response, setResponse] = useState<{ key: string; data: LandscapeResult } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [criterion,setCriterion]=useState<Criterion>(EMPTY_CRITERION);
  const [eil,setEil]=useState<EilInputs>(EMPTY_EIL);
  const [mode,setMode]=useState<"direct"|"eil">("direct");
  const body = JSON.stringify({ crop, pest, region, enemy_name: enemy, field, threshold_mode:mode, criterion, eil });
  const result = response?.key === body ? response.data : null;
  const failure = error?.key === body ? error.message : null;
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    const timer = setTimeout(() => {
      boundedFetchJson<LandscapeResult>(`${apiBase}/api/landscape-review`, controller.signal, 15_000,
        { method: "POST", headers: { "Content-Type": "application/json" }, body })
        .then((data) => {
          if (!data?.surveillance || !data?.threshold || !Array.isArray(data.methods) || !Array.isArray(data.enemies)) throw new Error("경관관리 응답 형식 오류");
          if (!controller.signal.aborted) setResponse({ key: body, data });
        })
        .catch((e: unknown) => { if (!controller.signal.aborted) setError({ key: body, message: e instanceof Error ? e.message : "연결 실패" }); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [apiBase, body, retry]);
  const update = (key: keyof FieldInput, value: string | number | null) => setField((current) => ({ ...current, [key]: value }));
  return <section className={styles.section} id="landscape-review" aria-labelledby="landscape-title">
    <header className={styles.heading}><span>OPEN-FIELD CONSERVATION · 핵심 트랙</span><h2 id="landscape-title">노지 경관관리</h2><p>{crop} · {pest} · {region} — 현재 선택 조건에 한정한 조사·보전관리 검토</p></header>
    <div className={styles.verdict} aria-live="polite"><strong>{failure ? "연결 실패 · 판단 보류" : result?.status ?? "경관조사 우선 · 자료 확인 중"}</strong><p>{failure ?? result?.reason ?? "실제 밀도와 경관조건을 입력하기 전에는 관리방법을 확정하지 않습니다. (요청 제한시간 15초)"}</p>{failure && <button type="button" onClick={() => { setResponse(null); setError(null); setRetry((v) => v + 1); }}>다시 시도</button>}</div>
    <div className={styles.step}><h3>1. NCPMS 노지 상대위험 신호</h3><p>{result ? `${result.surveillance.score ?? "—"}점 · ${result.surveillance.level}` : "선택 조건의 NCPMS 자료 확인 중"} · 2026 조사회차별 상대위험</p>
      {result && <RiskTrendChart data={result.surveillance.trend} />}
      <label>경관 검토 대상 천적<select value={enemy ?? response?.data.selected_enemy ?? ""} onChange={(e) => setEnemy(e.target.value || null)}><option value="">연결 천적 확인</option>{response?.data.enemies.map((item) => <option key={item.name} value={item.name}>{item.name} · 원문 {item.source_grade}</option>)}</select></label>
      <p>연결 천적 원문 등급: {result?.enemy_source_grade ?? "미기재"} / 경관관리 등급: {result?.landscape_grade ?? "자료 부족"}</p><small>{result?.source_notice ?? "천적 방사·시험 근거 등급을 경관관리 효과 등급으로 전용하지 않습니다."}</small>
    </div>
    <div className={styles.step}><h3>2. 현재 위험신호의 의미</h3><p>NCPMS 상대위험도는 실제 해충 개체수, 피해확률 또는 경제적 피해수준이 아닙니다.</p><p>NCPMS 2024~2026: 단기 연도·지역·조사회차별 패턴. KMA 장기자료: 기상 배경과 장기 기후경향 검토. 관계는 탐색적 연관성 검토에 한정합니다.</p><b>현재 NCPMS 분석기간만으로 장기 기후변화에 따른 해충 발생 변화를 확정할 수 없습니다. 현재 결과는 단기 예찰·기상 연계 탐색 결과입니다.</b></div>
    <div className={styles.step}><h3>3. 실제 해충 밀도조사와 경제적 피해기준</h3>
      <div className={styles.inputs}>
        <label>조사 지역 또는 필지명<input maxLength={200} value={field.site_name} placeholder="미입력 · 개인정보는 적지 마세요" onChange={e=>update('site_name',e.target.value)}/></label>
        <label>조사 대상 작물<input readOnly value={crop}/><small>상단 작물 선택과 연결</small></label><label>대상 병해충<input readOnly value={pest}/><small>상단 병해충 선택과 연결</small></label>
        <label>조사 면적 또는 조사 주수<input type="number" min="0" step="any" value={field.sample_size??''} placeholder="미입력" onChange={e=>update('sample_size',e.target.value===''?null:Number(e.target.value))}/></label>
        <label>조사 규모 단위<select value={field.sample_unit} onChange={e=>update('sample_unit',e.target.value)}><option value="">미입력</option>{['m²','ha','주','잎'].map(u=><option key={u}>{u}</option>)}</select></label>
        <label>천적 관찰 개체수<input type="number" min="0" step="1" value={field.enemy_count??''} placeholder="미입력 (실측 0과 구분)" onChange={e=>update('enemy_count',e.target.value===''?null:Number(e.target.value))}/><small>동일 조사규모 내 관찰 개체수 (마리), 해충 밀도와 합산하지 않음</small></label>
        <label>마지막 약제 처리일<input type="date" value={field.last_spray_date??''} onChange={e=>update('last_spray_date',e.target.value||null)}/></label>
        <label>현장 조사 실제 해충 밀도<input type="number" min="0" max="1000000000000" step="any" value={field.density ?? ""} placeholder="미입력 (실측 0은 0 입력)" onChange={(e) => update("density", e.target.value === "" ? null : Number(e.target.value))}/><small>사용자 현장 조사값 · NCPMS 점수 환산 아님</small></label>
        <label>조사방법<input maxLength={200} value={field.method} placeholder="미확인" onChange={(e) => update("method", e.target.value)}/></label>
        <label>조사 단위<input maxLength={100} value={field.unit} placeholder="미확인 (예: 마리/잎)" onChange={(e) => update("unit", e.target.value)}/></label>
        <label>조사일<input type="date" value={field.survey_date ?? ""} onChange={(e) => update("survey_date", e.target.value || null)}/><small>미선택: 미확인 · 미래 조사일은 허용하지 않음</small></label>
        <label>비공식 기준 메모 (선택)<input type="number" min="0" max="1000000000000" step="any" value={field.assumed_threshold ?? ""} placeholder="미입력" onChange={(e) => update("assumed_threshold", e.target.value === "" ? null : Number(e.target.value))}/><small>사용자 가정값 · 공식 기준이나 방제 판단에 사용하지 않음</small></label>
        <label>사용자 가정 기준의 단위<input maxLength={100} value={field.assumed_threshold_unit} placeholder="미확인" onChange={(e) => update("assumed_threshold_unit", e.target.value)}/></label>
      </div>
      <div className={styles.signalCards}>
        <article><h4>실제 해충 밀도</h4><p>{field.density==null?'미입력':`${field.density} ${field.unit||'(단위 미입력)'}`}</p><small>사용자 현장 조사값 · NCPMS와 분리</small></article>
        <article><h4>경제적 피해수준 또는 방제 기준</h4><p>{result?.threshold.selected_value==null?'자료 없음':`${result.threshold.selected_value} ${result.threshold.selected_unit}`}</p><small>사용자 입력 기준·가정값 · 공식 인증 아님</small></article>
        <article><h4>기상 관측 신호</h4><p>{result?.weather?.status??'별도 기상자료 확인 중'}</p>{result?.weather?.points.map((point)=><p key={point.station_id}>{point.station_name} ({point.province}) · {point.observed_at||'시각 미확인'}<br/>기온 {point.air_temperature??'자료 없음'} ℃ · 강수 {point.rainfall??'자료 없음'} mm · 풍속 {point.wind_speed??'자료 없음'} m/s</p>)}<small>{result?.weather?.scope}</small><p><a href="#kma-observations">기상 관측 원자료 보기</a></p></article>
      </div>
      <ThresholdInputs criterion={criterion} eil={eil} mode={mode} onCriterion={setCriterion} onEil={setEil} onMode={setMode} result={result?.threshold}/>
    </div>
    <div className={styles.step}><h3>4. 주변 경관과 천적 서식처 조사</h3><p>사용자 현장 확인값입니다. 모르는 항목은 미확인으로 남겨 주세요. 선택 조건 변경 시 입력을 초기화합니다. 검토 요청은 서버로 전송되며 저장하지 않습니다.</p><div className={styles.inputs}>{QUESTIONS.map(([key, label, values]) => <label key={key}>{label}<select value={field[key]} onChange={(e) => update(key, e.target.value)}>{values.map((v) => <option key={v}>{v}</option>)}</select></label>)}</div></div>
    <div className={styles.step}><h3>5. 천적 보호 경관관리 검토사항</h3><p>{result?.evidence_status ?? "선택 조건의 근거 확인 중"}</p>
      {!result?.methods.length && <p>현재 조건에 적용 가능한 검토사항을 아직 제시할 수 없습니다. 밀도·경관조사와 대상 천적 근거를 확인해 주세요.</p>}
      {result?.methods.map((method) => <article className={styles.method} key={method.method}><h4>{method.method} · {method.grade}</h4><dl>{[["기대 목적", method.purpose], ["대상", method.target], ["선택 조건 일치", method.match], ["국내 적용", method.domestic], ["한계", method.limitation], ["추가 현장 확인", method.field_check]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{method.action} · 정확한 폭·면적·식물종·예초 간격 기준은 미확보</p>{method.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</article>)}
    </div>
    <div className={styles.step}><h3>6. 천적·경관관리 근거 등급과 출처</h3><p>A: 동일 작물·해충·환경의 공식 처리·대조 시험 / B: 공식·동료심사 조건부 근거 / C: 현장 검증이 필요한 간접 근거 / 자료 없음: 확인 가능한 출처 없음</p><p>현재 등록 문헌은 일반 지침·경관 반응의 이질성 자료입니다. 국내 동일 조건의 A·B 근거로 자동 승격하지 않습니다. 천적 원문 등급과 경관관리 등급은 별개입니다.</p>{result?.sources.map((source) => <p key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><br/><small>{source.scope}</small></p>)}</div>
    <div className={styles.step}><h3>판단에 사용한 자료·사용하지 않은 자료</h3><div className={styles.signalCards}>{([['사용한 자료',result?.used_data],['사용하지 않은 자료',result?.unused_data],['부족한 자료',result?.missing_data],['다음 현장 조사 행동',result?.next_actions]] as const).map(([label,items])=><article key={label}><h4>{label}</h4><ul>{(items??['현재 입력 검토 중']).map(item=><li key={item}>{item}</li>)}</ul></article>)}</div></div>
    <div className={styles.step}><h3>7. 적용 한계와 추가 현장 확인</h3><p>꽃자원과 비경작 식생이 일부 해충에도 유리할 수 있습니다. 실행 전 대상 병해충과 천적의 반응을 함께 확인해야 합니다.</p><ul>{(result?.additional_data ?? ["실제 밀도·방법·단위·조사일", "경관조건·천적 동정·약제 이력", "국내 동일 조건 처리·대조 근거"]).map((item) => <li key={item}>{item}</li>)}</ul><p>{result?.notice ?? "자동 작업명령이나 효과 보장이 아닙니다. 노지 경관관리·천적 구입방사 경제성·스마트팜은 별개 트랙입니다."}</p><a href="#adoption-review">별도 천적 구입·방사 경제성 시나리오</a> · <a href="#smartfarm-release-window">스마트팜 확장 연구 트랙</a></div>
  </section>;
}
