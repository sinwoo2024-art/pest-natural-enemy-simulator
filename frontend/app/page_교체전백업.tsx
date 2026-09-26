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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Summary = {
  observations: number;
  crops: number;
  pests: number;
  regions: number;
  natural_enemies: number;
  positive_observations: number;
};

type Options = { crops: string[]; regions: string[]; pests: string[] };
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
  message: string;
  risk_score: number | null;
  risk_level: string;
  regions: { name: string; score: number }[];
  trend: { round: number; score: number }[];
  indicators: string[];
  recommendations: Enemy[];
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
    Promise.all([fetch(`${API}/api/summary`), fetch(`${API}/api/options`)])
      .then(async ([summaryResponse, optionsResponse]) => {
        setSummary(await summaryResponse.json());
        setOptions(await optionsResponse.json());
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
  const riskColor = (score: number) => score >= 67 ? "danger" : score >= 34 ? "warning" : "safe";

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

      <section className="simulatorSection" id="simulator">
        <div className="sectionHeading">
          <div><span className="sectionNumber">01</span><div><p>DECISION SIMULATOR</p><h2>천적 방제 의사결정 시뮬레이터</h2></div></div>
          <p>선택한 조건을 실제 NCPMS 관측자료와 연결해<br />상대 위험도와 활용 가능한 천적을 찾습니다.</p>
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
}}>{options.pests.map((item) => <option key={item}>{item}</option>)}</select></label>
           
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
                  <div><span className="liveLabel"><i /> 분석 완료</span><h3>{result.pest}</h3><p>{result.region} · {result.crop}</p></div>
                  <div className={`riskGauge ${result.risk_score === null ? "muted" : riskColor(result.risk_score)}`}>
                    <span>{result.risk_score ?? "—"}</span><small>{result.risk_level}</small>
                  </div>
                </div>
                <div className="resultNotice"><CheckCircle2 size={16} /><span>{result.message}</span></div>
                <div className="analysisGrid">
                  <div className="chartCard">
                    <div className="cardHeader"><div><small>시계열 신호</small><b>조사회차별 상대 위험도</b></div><span>1–8회차</span></div>
                    {result.trend.length ? <div className="chartWrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={result.trend} margin={{ top: 10, right: 6, bottom: 0, left: -25 }}><defs><linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#df6f2b" stopOpacity={0.35} /><stop offset="100%" stopColor="#df6f2b" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e5e9e3" /><XAxis dataKey="round" tickFormatter={(v) => `${v}회`} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => [`${v}점`, "상대 위험도"]} /><Area type="monotone" dataKey="score" stroke="#d96522" strokeWidth={3} fill="url(#riskFill)" /></AreaChart></ResponsiveContainer></div> : <div className="noChart">예찰 시계열 자료 없음</div>}
                  </div>
                  <div className="regionCard">
                    <div className="cardHeader"><div><small>지역 비교</small><b>상위 위험지역</b></div><MapPinned size={17} /></div>
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
          <div><span className="sectionNumber">02</span><div><p>NATURAL ENEMY MATCH</p><h2>추천 천적곤충과 활용 근거</h2></div></div>
          <p>단순 이름 매칭이 아니라 대상해충·이용방법·공식 출처를<br />함께 제시해 설명 가능한 추천을 만듭니다.</p>
        </div>
        <div className="enemyGrid">
          {(result?.recommendations ?? []).slice(0, 3).map((enemy, index) => <article className="enemyCard" key={`${enemy.name}-${index}`}><div className="enemyIcon"><Bug size={24} /></div><span className="rank">추천 {String(index + 1).padStart(2, "0")}</span><h3>{enemy.name}</h3><i>{enemy.scientific_name}</i><div className="tags"><span>{enemy.type}</span><span>{enemy.source}</span></div><p>{enemy.usage && enemy.usage !== "nan" ? enemy.usage.slice(0, 150) + (enemy.usage.length > 150 ? "…" : "") : `${enemy.target} 방제에 활용 가능한 천적곤충입니다.`}</p><footer><CheckCircle2 size={16} /> 대상해충 매칭 확인</footer></article>)}
          {result && result.recommendations.length === 0 && <div className="emptyEnemies">현재 DB에서 연결된 천적곤충을 찾지 못했습니다.</div>}
        </div>
      </section>

      <footer className="footer"><div className="brand"><span className="brandMark"><Leaf size={18} /></span><span>공생의 알고리즘 AI</span></div><p>데이터로 예방하고, 자연으로 방제합니다.</p><span>Prototype · NCPMS 2026</span></footer>
    </main>
  );
}
