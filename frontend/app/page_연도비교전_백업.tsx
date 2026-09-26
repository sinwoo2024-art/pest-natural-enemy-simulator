"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bug,
  CheckCircle2,
  Database,
  Leaf,
  MapPinned,
  Microscope,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001";

type Summary = {
  observations: number;
  crops: number;
  pests: number;
  regions: number;
  natural_enemies: number;
  positive_observations: number;
};

type CompareData = {
  "2024": {
    observations: number;
    crops: number;
    pests: number;
    regions: number;
  };
  "2026": {
    observations: number;
    crops: number;
    pests: number;
    regions: number;
  };
  change: {
    observations: number;
    crops: number;
    pests: number;
    regions: number;
  };
};

type PestGroup = {
  category: string;
  items: string[];
};

type Options = {
  crops: string[];
  regions: string[];
  pests: string[];
  pest_categories?: Record<string, string>;
  pest_groups?: PestGroup[];
};
type Enemy = {
  name: string;
  scientific_name: string;
  type: string;
  target: string;
  usage: string;
  source: string;
};
type Simulation = {
  pest: string;
  crop: string;
  region: string;
  has_observation: boolean;
  category: string;
  response_type: string;
  is_natural_enemy_target: boolean;
  management_message: string;
  management_steps?: string[];
  management_caution?: string;
  management_evidence?: string;
  message: string;
  risk_score: number | null;
  risk_level: string;
  regions: { name: string; score: number }[];
  trend: { round: number; score: number }[];
  indicators: string[];
  recommendations: Enemy[];
};

type ManagementGuide = {
  responseType: string;
  message: string;
  steps: string[];
  caution: string;
  evidence: string;
};

// 백엔드 재시작이 늦어져 예전 한 줄 응답이 오더라도 유형별 전문 안내를 표시합니다.
const MANAGEMENT_GUIDES: Record<string, ManagementGuide> = {
  "병해": {
    responseType: "병원체 진단·재배환경·등록 방제 통합관리",
    message: "병징만으로 원인을 단정하지 않고 발생 양상과 재배환경을 함께 확인한 뒤 예방·환경·위생·등록 방제를 단계적으로 적용합니다.",
    steps: [
      "진단: 병반 형태, 발생 위치·확산 양상과 온도·습도·관수 조건을 확인하고 필요하면 전문기관에 진단을 의뢰합니다.",
      "예방: 건전 종자·묘와 저항성 품종을 우선하고 병원체의 전염 특성과 재배환경에 맞춰 윤작·배수·재식밀도·환기를 조정합니다.",
      "위생: 이병 잔재와 전염원을 제거하고 작업 도구·육묘장·관수원을 청결하게 관리합니다.",
      "방제: 예방적으로 또는 발생 초기에, 해당 작물과 대상 병해에 등록된 살균제·생물농약을 라벨과 안전사용기준에 따라 적용합니다.",
    ],
    caution: "곰팡이성·세균성·토양전염성 병해는 관리법이 다르므로 병원체 확인 전 임의 약제 사용을 피해야 합니다.",
    evidence: "농촌진흥청 농사로·NCPMS 병해충 정보 / 등록 농약 및 안전사용기준: 농약안전정보시스템",
  },
  "바이러스": {
    responseType: "감염원 제거·매개충·작업위생 통합관리",
    message: "바이러스는 감염 후 직접 치료가 어려우므로 건전 종묘, 감염원 제거, 매개충과 작업위생을 중심으로 확산을 차단합니다.",
    steps: [
      "진단: 모자이크·황화·왜화·괴저 증상과 포장 확산 양상을 확인하되 증상만으로 확진하지 않고, 필요하면 전문기관 진단을 통해 유사한 생리장해와 구분합니다.",
      "감염원 차단: 감염 의심주는 우선 격리하고 진단 결과나 공식 방제지침에 따라 제거합니다. 감염이 확인된 포기에서는 종자·삽수·모주를 채취하지 않습니다.",
      "매개충 관리: 해당 바이러스의 전염경로와 매개충을 확인하고, 예찰·방충망·기주잡초 관리와 등록 방제수단을 병행합니다.",
      "위생·예방: 무병 종자·묘를 사용하고 손·도구·농기구를 소독하며 주변 기주잡초와 자생식물을 관리합니다.",
    ],
    caution: "매개충 방제는 추가 전염을 줄이는 조치이며 이미 감염된 식물체를 치료하는 방법은 아닙니다.",
    evidence: "농촌진흥청 농사로·NCPMS 병해충 정보 / 등록 농약 및 안전사용기준: 농약안전정보시스템",
  },
  "선충": {
    responseType: "밀도진단·유입차단·기주관리·밀도억제",
    message: "식물기생선충은 의심 증상만으로 확진하지 않고, 토양·뿌리 시료를 통해 선충의 종류와 밀도를 확인한 뒤 건전 종묘, 포장위생, 기주관리와 등록 방제수단을 단계적으로 적용합니다.",
    steps: [
      "진단: 포장 내 불균일 생육, 황화·위조, 뿌리의 혹·갈변 등 의심 증상을 확인합니다. 증상만으로 확진하지 않고 토양·뿌리 시료를 채취해 선충의 종류와 밀도를 조사합니다.",
      "유입 차단: 건전 종묘와 오염되지 않은 상토를 사용하고, 오염 토양이 묻은 농기구·작업화·묘와 관개수·배수를 통한 포장 간 확산을 차단합니다.",
      "재배 관리: 확인된 선충의 종·레이스와 기주범위를 기준으로 비기주작물 윤작, 기주잡초 제거, 저항성 품종 또는 대목을 선택합니다.",
      "밀도 억제: 선충의 종류와 재배조건에 따라 태양열 소독, 담수, 시설 내 증기소독 등 물리·경종적 방법을 검토합니다. 약제는 해당 작물과 대상 선충에 등록된 제품만 라벨과 안전사용기준에 따라 사용합니다.",
    ],
    caution: "윤작과 저항성 품종의 효과는 선충의 종·레이스 및 포장 내 기주잡초에 따라 달라질 수 있으므로, 선충 동정과 밀도조사가 우선입니다.",
    evidence: "농촌진흥청 농사로 선충 진단·방제자료 / 등록 약제 확인: 농약안전정보시스템",
  },
};

const fallbackSummary: Summary = {
  observations: 12698,
  crops: 14,
  pests: 198,
  regions: 15,
  natural_enemies: 31,
  positive_observations: 1947,
};

export default function Home() {
  const [summary, setSummary] = useState<Summary>(fallbackSummary);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [options, setOptions] = useState<Options>({ crops: [], regions: [], pests: [] });
  const [pest, setPest] = useState("담배거세미나방");
  const [crop, setCrop] = useState("전체");
  const [region, setRegion] = useState("전체");
  const [result, setResult] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCropChange(nextCrop: string) {
  setCrop(nextCrop);

  try {
    const params = new URLSearchParams();

    if (nextCrop !== "전체") {
      params.set("crop", nextCrop);
    }

    const url = params.toString()
      ? `${API}/api/options?${params.toString()}`
      : `${API}/api/options`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("작물별 병해충 목록 요청 실패");
    }

    const nextOptions: Options = await response.json();
    setOptions(nextOptions);

    const nextPest = nextOptions.pests.includes(pest)
      ? pest
      : nextOptions.pests[0] ?? "";

    setPest(nextPest);
    setResult(null);
  } catch (error) {
    console.error(error);
  }
}

async function runSimulation(
  nextPest = pest,
  nextCrop = crop,
  nextRegion = region
) {
  setLoading(true);

  try {
    const params = new URLSearchParams({ pest: nextPest });

    if (nextCrop !== "전체") {
      params.set("crop", nextCrop);
    }

    if (nextRegion !== "전체") {
      params.set("region", nextRegion);
    }

    const response = await fetch(
      `${API}/api/simulate?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error("분석 요청 실패");
    }

    setResult(await response.json());
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
     Promise.all([
    fetch(`${API}/api/summary`),
    fetch(`${API}/api/options`),
    fetch(`${API}/api/compare`)
  ])
      .then(async ([summaryResponse, optionsResponse, compareResponse]) => {
        setSummary(await summaryResponse.json());
        setOptions(await optionsResponse.json());
        setCompare(await compareResponse.json());
        return runSimulation();
      })
      .catch(() => setOptions({
        crops: ["고추", "논벼", "콩"],
        regions: ["경기도", "충청남도", "제주특별자치도"],
        pests: ["담배거세미나방", "톱다리개미허리노린재", "벼멸구", "복숭아혹진딧물", "대만총채벌레"],
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topRegions = useMemo(() => result?.regions.slice(0, 5) ?? [], [result]);
  const noObservedOccurrence = Boolean(
    result?.has_observation &&
    result.regions.length > 0 &&
    result.regions.every((item) => item.score === 0)
  );
  const riskColor = (score: number) => score >= 67 ? "danger" : score >= 34 ? "warning" : "safe";
  const managementGuide = result
    ? MANAGEMENT_GUIDES[result.category.replace(/^\uFEFF/, "").trim()]
    : undefined;
  const displayedResponseType = managementGuide?.responseType ?? result?.response_type ?? "";
  const displayedManagementMessage = managementGuide?.message ?? result?.management_message ?? "";
  const displayedManagementSteps = managementGuide?.steps ?? result?.management_steps ?? [];
  const displayedManagementCaution = managementGuide?.caution ?? result?.management_caution ?? "";
  const displayedManagementEvidence = managementGuide?.evidence ?? result?.management_evidence ?? "";

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark"><Leaf size={20} /></span><span>공생의 알고리즘 <b>AI</b></span></div>
        <nav><a href="#overview">현황</a><a href="#simulator">시뮬레이터</a><a href="#evidence">분석 근거</a></nav>
        <div className="dataBadge"><span /> NCPMS 2026 연결</div>
      </header>

      <section className="hero" id="overview">
        <div className="heroGrid" />
        <div className="heroContent">
          <div className="eyebrow"><Sparkles size={15} /> 자연이 키운 수호자</div>
          <h1>병해충 위험을 읽고,<br /><em>천적의 타이밍</em>을 찾습니다.</h1>
          <p>지역별 예찰 데이터와 천적곤충 생태정보를 연결해<br />농가가 바로 활용할 수 있는 생물학적 방제 의사결정을 제공합니다.</p>
          <a className="primaryButton" href="#simulator">위험도 분석 시작 <ArrowRight size={18} /></a>
        </div>
        <div className="heroVisual" aria-label="위험 분석 개념도">
          <div className="orbit orbitOne" />
          <div className="orbit orbitTwo" />
          <div className="core"><ShieldCheck size={35} /><b>AI 방제 코어</b><small>데이터 기반 의사결정</small></div>
          <div className="floatCard cardA"><Activity size={18} /><span><small>예찰 신호</small><b>12,698건</b></span></div>
          <div className="floatCard cardB"><Bug size={18} /><span><small>천적곤충</small><b>31종</b></span></div>
          <div className="floatCard cardC"><MapPinned size={18} /><span><small>분석 지역</small><b>15개</b></span></div>
        </div>
      </section>

      <section className="statsStrip">
        {[
          { Icon: Database, value: summary.observations.toLocaleString(), label: "NCPMS 관측 데이터" },
          { Icon: Microscope, value: summary.pests.toString(), label: "병해충 조사항목" },
          { Icon: MapPinned, value: summary.regions.toString(), label: "예찰 지역" },
          { Icon: Bug, value: summary.natural_enemies.toString(), label: "공식 천적곤충" },
        ].map(({ Icon, value, label }) => (
          <div className="stat" key={label}><Icon size={21} /><div><b>{value}</b><span>{label}</span></div></div>
        ))}
      </section>

      {compare && (
  <section>
    <h2>2024년 vs 2026년 비교</h2>

    <p>
      관측 데이터: {compare["2024"].observations.toLocaleString()}
      {" → "}
      {compare["2026"].observations.toLocaleString()}
    </p>

    <p>
      병해충: {compare["2024"].pests}
      {" → "}
      {compare["2026"].pests}
    </p>

    <p>
      지역: {compare["2024"].regions}
      {" → "}
      {compare["2026"].regions}
    </p>
  </section>
)}

      <section className="simulatorSection" id="simulator">
        <div className="sectionHeading">
          <div><span className="sectionNumber">01</span><div><p>DECISION SIMULATOR</p><h2>병해충 대응 의사결정 시뮬레이터</h2></div></div>
          <p>선택한 조건을 실제 NCPMS 관측자료와 연결해<br />상대 위험도와 유형별 대응방법을 찾습니다.</p>
        </div>

        <div className="simulatorGrid">
          <aside className="controlPanel">
            <div className="panelTitle"><span><BarChart3 size={18} /></span><div><b>분석 조건</b><small>대상 환경을 선택하세요</small></div></div>
            <label>
  작물
  <select
    value={crop}
    onChange={async (e) => {
      const nextCrop = e.target.value;
      setCrop(nextCrop);

      const url =
        nextCrop === "전체"
          ? `${API}/api/options`
          : `${API}/api/options?crop=${encodeURIComponent(nextCrop)}`;

      const response = await fetch(url);
      const nextOptions: Options = await response.json();

      setOptions(nextOptions);

      if (!nextOptions.pests.includes(pest)) {
        setPest(nextOptions.pests[0] ?? "");
      }

      setResult(null);
    }}
  >
    <option>전체</option>
    {options.crops.map((item) => (
      <option key={item}>{item}</option>
    ))}
  </select>
</label>
            <label>대상 병해충<select value={pest} onChange={async (e) => {
  const nextPest = e.target.value;
  setPest(nextPest);

  const params = new URLSearchParams();
  params.set("pest", nextPest);

  if (crop !== "전체") {
    params.set("crop", crop);
  }

  const response = await fetch(
    `${API}/api/options?${params.toString()}`
  );
  const nextOptions: Options = await response.json();

  setOptions(nextOptions);

  if (
    region !== "전체" &&
    !nextOptions.regions.includes(region)
  ) {
    setRegion("전체");
  }

  setResult(null);
}}>{options.pest_groups?.length ? options.pest_groups.map((group) => (
  <optgroup key={group.category} label={`${group.category} (${group.items.length})`}>
    {group.items.map((item) => <option key={item}>{item}</option>)}
  </optgroup>
)) : options.pests.map((item) => <option key={item}>{item}</option>)}</select></label>
           
<label>지역<select value={region} onChange={(e) => setRegion(e.target.value)}><option>전체</option>{options.regions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button onClick={() => runSimulation()} disabled={loading}>{loading ? "데이터 분석 중…" : "AI 위험도 분석 실행"}<ArrowRight size={17} /></button>
            <div className="sourceNote"><Database size={15} /><span>NCPMS SVC52 2026<br /><b>실제 예찰자료 기반</b></span></div>
          </aside>

          <div className="resultsPanel">
            {!result ? (
              <div className="emptyState"><Activity size={32} /><b>서버를 실행하면 실제 분석 결과가 표시됩니다.</b><span>현재 화면은 데이터 연결을 기다리고 있습니다.</span></div>
            ) : (
              <>
                <div className="resultTop">
                  <div><span className="liveLabel"><i /> 분석 완료</span><h3>{result.pest}</h3><p>{result.category} · {result.response_type}<br />{result.region} · {result.crop}</p></div>
                  <div className={`riskGauge ${result.risk_score === null ? "muted" : riskColor(result.risk_score)}`}>
                    <span>{result.risk_score ?? "—"}</span><small>{noObservedOccurrence ? "발생 없음" : result.risk_level}</small>
                  </div>
                </div>
                <div className="resultNotice"><CheckCircle2 size={16} /><span>{noObservedOccurrence ? "현재 예찰자료에서 발생이 관찰되지 않았습니다." : result.message}<br /><b>{result.management_message}</b></span></div>
                <div className="analysisGrid">
                  <div className="chartCard">
                    <div className="cardHeader"><div><small>시계열 신호</small><b>조사회차별 상대 위험도</b></div><span>1–8회차</span></div>
                    {result.trend.length ? <div className="chartWrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={result.trend} margin={{ top: 10, right: 6, bottom: 0, left: -25 }}><defs><linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#df6f2b" stopOpacity={0.35} /><stop offset="100%" stopColor="#df6f2b" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e5e9e3" /><XAxis dataKey="round" tickFormatter={(v) => `${v}회`} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => [`${v}점`, "상대 위험도"]} /><Area type="monotone" dataKey="score" stroke="#d96522" strokeWidth={3} fill="url(#riskFill)" /></AreaChart></ResponsiveContainer></div> : <div className="noChart">예찰 시계열 자료 없음</div>}
                  </div>
                  <div className="regionCard">
                    <div className="cardHeader"><div><small>{noObservedOccurrence ? "조사 범위" : "지역 비교"}</small><b>{noObservedOccurrence ? "예찰 지역" : "상위 위험지역"}</b></div><MapPinned size={17} /></div>
                    <div className="regionList">{topRegions.length ? topRegions.map((item, index) => <div className="regionRow" key={item.name}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.name}</b><i><em style={{ width: `${item.score}%` }} /></i></div><strong>{item.score}</strong></div>) : <p className="noData">현재 예찰자료가 없습니다.</p>}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="recommendSection" id="evidence">
        <div className="sectionHeading light">
          <div><span className="sectionNumber">02</span><div><p>{result?.is_natural_enemy_target === false ? "TYPE-SPECIFIC RESPONSE" : "NATURAL ENEMY MATCH"}</p><h2>{result?.is_natural_enemy_target === false ? (result.category === "선충" ? "식물기생선충 관리 안내" : `${result.category} 관리 안내`) : "추천 천적곤충과 활용 근거"}</h2></div></div>
          <p>{result?.is_natural_enemy_target === false ? <>천적곤충을 잘못 연결하지 않고 병해충 유형에 맞는<br />예찰·재배환경·전문가 확인 중심의 대응을 안내합니다.</> : <>단순 이름 매칭이 아니라 대상해충·이용방법·공식 출처를<br />함께 제시해 설명 가능한 추천을 만듭니다.</>}</p>
        </div>
        <div className="enemyGrid">
          {result?.is_natural_enemy_target && result.recommendations.slice(0, 3).map((enemy, index) => <article className="enemyCard" key={`${enemy.name}-${index}`}><div className="enemyIcon"><Bug size={24} /></div><span className="rank">추천 {String(index + 1).padStart(2, "0")}</span><h3>{enemy.name}</h3><i>{enemy.scientific_name}</i><div className="tags"><span>{enemy.type}</span><span>{enemy.source}</span></div><p>{enemy.usage && enemy.usage !== "nan" ? enemy.usage.slice(0, 150) + (enemy.usage.length > 150 ? "…" : "") : `${enemy.target} 방제에 활용 가능한 천적곤충입니다.`}</p><footer><CheckCircle2 size={16} /> 대상해충 매칭 확인</footer></article>)}
          {result?.is_natural_enemy_target && result.recommendations.length === 0 && <div className="emptyEnemies">현재 DB에서 연결된 천적곤충을 찾지 못했습니다. 대상해충을 다시 확인하거나 천적 DB의 근거를 추가하세요.</div>}
          {result && !result.is_natural_enemy_target && (
            <div className="emptyEnemies">
              <b>{result.category} · {displayedResponseType}</b>
              <p style={{ margin: "14px auto 18px", maxWidth: "780px", lineHeight: 1.75 }}>
                {displayedManagementMessage}
              </p>
              {displayedManagementSteps.length ? (
                <ol style={{ margin: "0 auto", maxWidth: "780px", paddingLeft: "24px", textAlign: "left", lineHeight: 1.85 }}>
                  {displayedManagementSteps.map((step, index) => (
                    <li key={`${index}-${step}`} style={{ marginBottom: "8px" }}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {displayedManagementCaution ? (
                <p style={{ margin: "18px auto 8px", maxWidth: "780px", padding: "12px 14px", border: "1px solid rgba(255,255,255,0.2)", textAlign: "left", lineHeight: 1.65 }}>
                  ※ 현장 적용 주의: {displayedManagementCaution}
                </p>
              ) : null}
              {displayedManagementEvidence ? (
                <small style={{ display: "block", marginTop: "12px", opacity: 0.78 }}>
                  근거: {displayedManagementEvidence}
                </small>
              ) : null}
            </div>
          )}
          {!result && <div className="emptyEnemies">병해충을 선택하고 위험도 분석을 실행하면 유형별 대응 결과가 표시됩니다.</div>}
        </div>
      </section>

      <footer className="footer"><div className="brand"><span className="brandMark"><Leaf size={18} /></span><span>공생의 알고리즘 AI</span></div><p>데이터로 예방하고, 자연으로 방제합니다.</p><span>Prototype · NCPMS 2026</span></footer>
    </main>
  );
}
