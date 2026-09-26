"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { createCsvFallbackOptions, CSV_FALLBACK_REGIONS } from "./fallback-catalog";
import RegionalRiskMap, { type RegionalRiskResponse } from "./region-risk-map";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

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
  pest_years?: Record<string, number[]>;
  comparable_pests?: string[];
  comparison_priority_rule?: string;
  pest_categories?: Record<string, string>;
  pest_groups?: PestGroup[];
};

type ConnectionStatus = "checking" | "connected" | "partial" | "offline";
type Enemy = {
  name: string;
  scientific_name: string;
  type: string;
  target: string;
  usage: string;
  source: string;
};

type YearComparisonItem = {
  year: number;
  has_observation: boolean;
  risk_score: number | null;
  risk_level: string;
  observations: number;
  positive_observations: number;
  region: string;
};

type YearComparisonResponse = {
  pest: string;
  crop: string;
  region: string;
  year_comparison: YearComparisonItem[];
  comparison_delta: number | null;
  comparison_direction: string;
  note: string;
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

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText || "요청 실패"}`);
  }
  return response.json() as Promise<T>;
}

function isSummary(value: unknown): value is Summary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<Summary>;
  return [
    summary.observations,
    summary.crops,
    summary.pests,
    summary.regions,
    summary.natural_enemies,
    summary.positive_observations,
  ].every((item) => typeof item === "number");
}

function isOptions(value: unknown): value is Options {
  if (!value || typeof value !== "object") return false;
  const options = value as Partial<Options>;
  return Array.isArray(options.crops) && Array.isArray(options.regions) && Array.isArray(options.pests);
}

function isCompareData(value: unknown): value is CompareData {
  if (!value || typeof value !== "object") return false;
  const compare = value as Partial<CompareData>;
  return Boolean(compare["2024"] && compare["2026"] && compare.change);
}

function isRegionalRiskResponse(value: unknown): value is RegionalRiskResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<RegionalRiskResponse>;
  if (
    typeof data.pest !== "string" ||
    typeof data.crop !== "string" ||
    typeof data.note !== "string" ||
    typeof data.source !== "string" ||
    !Array.isArray(data.years) ||
    !Array.isArray(data.regions)
  ) return false;

  return data.regions.every((item) => {
    const scoreIsValid = (score: unknown) => score === null || typeof score === "number";
    return Boolean(
      item &&
      typeof item.name === "string" &&
      scoreIsValid(item.score_2024) &&
      scoreIsValid(item.score_2026) &&
      scoreIsValid(item.delta) &&
      typeof item.observations_2024 === "number" &&
      typeof item.observations_2026 === "number" &&
      typeof item.positive_observations_2024 === "number" &&
      typeof item.positive_observations_2026 === "number"
    );
  });
}

function mergeWithCsvCatalog(apiOptions: Options): Options {
  const fallback = createCsvFallbackOptions();
  const categories: Record<string, string> = { ...fallback.pest_categories };

  for (const group of apiOptions.pest_groups ?? []) {
    for (const item of group.items) categories[item] = group.category;
  }
  Object.assign(categories, apiOptions.pest_categories ?? {});

  const pests = Array.from(new Set([...fallback.pests, ...apiOptions.pests]))
    .sort((left, right) => left.localeCompare(right, "ko"));
  const categoryOrder = ["해충", "병해", "바이러스", "선충", "기타", "기타·미분류"];
  const groups = new Map<string, string[]>();

  for (const pest of pests) {
    const category = categories[pest] ?? "기타·미분류";
    const items = groups.get(category) ?? [];
    items.push(pest);
    groups.set(category, items);
  }

  const orderedCategories = [
    ...categoryOrder.filter((category) => groups.has(category)),
    ...Array.from(groups.keys()).filter((category) => !categoryOrder.includes(category)),
  ];

  return {
    crops: Array.from(new Set([...fallback.crops, ...apiOptions.crops])).sort((left, right) => left.localeCompare(right, "ko")),
    regions: Array.from(new Set([...fallback.regions, ...apiOptions.regions])).sort((left, right) => left.localeCompare(right, "ko")),
    pests,
    pest_years: apiOptions.pest_years,
    comparable_pests: apiOptions.comparable_pests?.filter((item) => pests.includes(item)),
    comparison_priority_rule: apiOptions.comparison_priority_rule,
    pest_categories: categories,
    pest_groups: orderedCategories.map((category) => ({
      category,
      items: (groups.get(category) ?? []).sort((left, right) => left.localeCompare(right, "ko")),
    })),
  };
}

export default function Home() {
  const [yearComparison, setYearComparison] = useState<YearComparisonResponse | null>(null);
  const [summary, setSummary] = useState<Summary>(fallbackSummary);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [options, setOptions] = useState<Options>(() => createCsvFallbackOptions());
  const [availableRegions, setAvailableRegions] = useState<string[]>(() => [...CSV_FALLBACK_REGIONS]);
  const [pest, setPest] = useState("벼물바구미");
  const [crop, setCrop] = useState("전체");
  const [region, setRegion] = useState("전체");
  const [result, setResult] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [conditionLoading, setConditionLoading] = useState(false);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [connectionMessage, setConnectionMessage] = useState("NCPMS API 연결을 확인하고 있습니다.");
  const [regionRiskData, setRegionRiskData] = useState<RegionalRiskResponse | null>(null);
  const [regionRiskError, setRegionRiskError] = useState<string | null>(null);
  const [regionRiskLoading, setRegionRiskLoading] = useState(false);
  const [selectedMapRegion, setSelectedMapRegion] = useState<string | null>(null);
  const regionRequestSequence = useRef(0);

  async function refreshAvailableRegions(nextCrop: string, nextPest: string) {
    const requestSequence = ++regionRequestSequence.current;
    const params = new URLSearchParams();
    if (nextCrop !== "전체") params.set("crop", nextCrop);
    if (nextPest) params.set("pest", nextPest);

    setConditionLoading(true);
    setConditionError(null);
    try {
      const query = params.toString();
      const nextOptions = await fetchJson<Options>(`${API}/api/options${query ? `?${query}` : ""}`);
      if (!isOptions(nextOptions)) throw new Error("조건별 지역 응답 형식이 올바르지 않습니다.");
      if (requestSequence !== regionRequestSequence.current) return;

      setAvailableRegions(nextOptions.regions);
      setOptions((current) => ({
        ...current,
        pest_years: nextOptions.pest_years ?? current.pest_years,
        comparable_pests: nextOptions.comparable_pests ?? current.comparable_pests,
        comparison_priority_rule: nextOptions.comparison_priority_rule ?? current.comparison_priority_rule,
      }));
      setRegion((current) => (
        current !== "전체" && !nextOptions.regions.includes(current) ? "전체" : current
      ));
    } catch (error) {
      if (requestSequence === regionRequestSequence.current) {
        setConditionError(`지역 목록 갱신 실패 · 이전 목록 유지 (${messageFromError(error)})`);
      }
    } finally {
      if (requestSequence === regionRequestSequence.current) setConditionLoading(false);
    }
  }

  async function handleCropChange(nextCrop: string) {
    setCrop(nextCrop);
    setResult(null);
    setYearComparison(null);
    setSimulationError(null);
    await refreshAvailableRegions(nextCrop, pest);
  }

  async function handlePestChange(nextPest: string) {
    setPest(nextPest);
    setResult(null);
    setYearComparison(null);
    setSimulationError(null);
    await refreshAvailableRegions(crop, nextPest);
  }

  function handleRegionChange(nextRegion: string) {
    setRegion(nextRegion);
    setResult(null);
    setYearComparison(null);
    setSimulationError(null);
    if (nextRegion !== "전체") setSelectedMapRegion(nextRegion);
  }

  async function runSimulation(
    nextPest = pest,
    nextCrop = crop,
    nextRegion = region,
  ) {
    if (!nextPest) {
      setSimulationError("분석할 병해충을 선택하세요.");
      return;
    }

    setLoading(true);
    setSimulationError(null);
    try {
      const params = new URLSearchParams({ pest: nextPest });
      if (nextCrop !== "전체") params.set("crop", nextCrop);
      if (nextRegion !== "전체") params.set("region", nextRegion);
      const simulation = await fetchJson<Simulation>(`${API}/api/simulate?${params.toString()}`);
      setResult(simulation);
    } catch (error) {
      setResult(null);
      setSimulationError(`분석 요청 실패 · ${messageFromError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      const [summaryResult, optionsResult, compareResult] = await Promise.allSettled([
        fetchJson<unknown>(`${API}/api/summary`, controller.signal),
        fetchJson<unknown>(`${API}/api/options`, controller.signal),
        fetchJson<unknown>(`${API}/api/compare`, controller.signal),
      ]);
      if (controller.signal.aborted) return;

      const failures: string[] = [];
      let successCount = 0;

      if (summaryResult.status === "fulfilled" && isSummary(summaryResult.value)) {
        setSummary(summaryResult.value);
        successCount += 1;
      } else {
        failures.push("요약");
      }

      if (optionsResult.status === "fulfilled" && isOptions(optionsResult.value) && optionsResult.value.pests.length > 0) {
        const fullCatalog = mergeWithCsvCatalog(optionsResult.value);
        setOptions(fullCatalog);
        setAvailableRegions(optionsResult.value.regions.length ? optionsResult.value.regions : fullCatalog.regions);
        successCount += 1;
      } else {
        failures.push("전체 병해충 목록");
      }

      if (compareResult.status === "fulfilled" && isCompareData(compareResult.value)) {
        setCompare(compareResult.value);
        successCount += 1;
      } else {
        failures.push("연도 요약 비교");
      }

      if (successCount === 3) {
        setConnectionStatus("connected");
        setConnectionMessage("NCPMS API와 모든 초기 데이터가 연결되었습니다.");
      } else if (successCount > 0) {
        setConnectionStatus("partial");
        setConnectionMessage(`${failures.join("·")} 요청 실패 · 로컬 전체 카탈로그 안전망 사용`);
      } else {
        setConnectionStatus("offline");
        setConnectionMessage("API 연결 실패 · 2024·2026 CSV·천적 DB 전체 병해충 목록 안전망 사용");
      }

      await runSimulation("벼물바구미", "전체", "전체");
    }

    void loadInitialData();
    return () => controller.abort();
    // 최초 연결 점검은 마운트 시 한 번만 수행합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pest) {
      setRegionRiskData(null);
      setRegionRiskError(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ pest });
    if (crop !== "전체") params.set("crop", crop);
    setRegionRiskLoading(true);
    setRegionRiskError(null);
    setRegionRiskData(null);

    fetchJson<unknown>(
      `${API}/api/region-risk-comparison?${params.toString()}`,
      controller.signal,
    )
      .then((data) => {
        if (!isRegionalRiskResponse(data)) throw new Error("지역 비교 응답 형식이 올바르지 않습니다.");
        setRegionRiskData(data);
        setSelectedMapRegion((current) => {
          if (current && data.regions.some((item) => item.name === current)) return current;
          const firstObserved = data.regions.find(
            (item) => item.score_2024 !== null || item.score_2026 !== null,
          );
          return firstObserved?.name ?? data.regions[0]?.name ?? null;
        });
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setRegionRiskError(messageFromError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRegionRiskLoading(false);
      });

    return () => controller.abort();
  }, [pest, crop]);

  const regionComparisonRows = useMemo(() => {
    const rows = (regionRiskData?.regions ?? []).filter(
      (item) => item.score_2024 !== null || item.score_2026 !== null,
    );

    return rows
      .sort((left, right) => {
        const leftComparable = left.delta !== null ? 1 : 0;
        const rightComparable = right.delta !== null ? 1 : 0;
        if (leftComparable !== rightComparable) return rightComparable - leftComparable;

        const deltaGap = Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0);
        if (deltaGap !== 0) return deltaGap;

        return Math.max(right.score_2024 ?? -1, right.score_2026 ?? -1)
          - Math.max(left.score_2024 ?? -1, left.score_2026 ?? -1);
      })
      .slice(0, 5);
  }, [regionRiskData]);
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


  useEffect(() => {
    if (!result) {
      setYearComparison(null);
      return;
    }

    const query = new URLSearchParams({ pest: result.pest });
    if (crop && crop !== "전체") query.set("crop", crop);
    if (region && region !== "전체") query.set("region", region);

    const controller = new AbortController();
    setYearComparison(null);
    fetchJson<YearComparisonResponse>(
      `${API}/api/year-comparison?${query.toString()}`,
      controller.signal,
    )
      .then((data: YearComparisonResponse) => setYearComparison(data))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setYearComparison(null);
      });

    return () => controller.abort();
  }, [result?.pest, crop, region]);

  const connectionLabel = {
    checking: "NCPMS 연결 확인 중",
    connected: "NCPMS API 연결",
    partial: "NCPMS 일부 연결",
    offline: "CSV 목록 모드",
  }[connectionStatus];

  const comparablePestSet = new Set(options.comparable_pests ?? []);
  const comparablePests = options.pests.filter((item) => comparablePestSet.has(item));
  const remainingPestGroups = (options.pest_groups ?? [])
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !comparablePestSet.has(item)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark"><Leaf size={20} /></span><span>공생의 알고리즘 <b>AI</b></span></div>
        <nav><a href="#overview">현황</a><a href="#simulator">시뮬레이터</a><a href="#risk-map">지역 비교</a><a href="#evidence">분석 근거</a></nav>
        <div className={`dataBadge ${connectionStatus}`} title={connectionMessage}><span /> {connectionLabel}</div>
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

      <div className={`connectionNotice ${connectionStatus}`} role="status">
        <span aria-hidden="true" />
        <strong>{connectionLabel}</strong>
        <p>{connectionMessage}</p>
        <small>병해충 전체 {options.pests.length.toLocaleString("ko-KR")}개 유지</small>
      </div>

      {compare && (
  <section className="yearCompareSection" id="year-compare">
    <div className="yearCompareHeading">
      <div>
        <p className="yearCompareEyebrow">YEARLY DATA COMPARISON</p>
        <h2>2024·2026 NCPMS 예찰 데이터 비교</h2>
      </div>

      <p>
        연도별 예찰자료의 수집량과 분석 범위를 같은 항목으로 비교합니다.
      </p>
    </div>

    <div className="yearCompareGrid">
      <article className="yearCompareCard">
        <span className="yearCompareLabel">예찰 데이터</span>

        <div className="yearCompareValues">
          <div>
            <small>2024년</small>
            <strong>
              {compare["2024"].observations.toLocaleString("ko-KR")}
            </strong>
          </div>

          <span className="yearCompareArrow">→</span>

          <div>
            <small>2026년</small>
            <strong>
              {compare["2026"].observations.toLocaleString("ko-KR")}
            </strong>
          </div>
        </div>

        <p className="yearCompareChange">
          +{(
            compare["2026"].observations -
            compare["2024"].observations
          ).toLocaleString("ko-KR")}건
        </p>
      </article>

      <article className="yearCompareCard">
       
        <span className="yearCompareLabel">병해충 종류</span>

        <div className="yearCompareValues">
          <div>
            <small>2024년</small>
            <strong>{compare["2024"].pests}</strong>
          </div>

          <span className="yearCompareArrow">→</span>

          <div>
            <small>2026년</small>
            <strong>{compare["2026"].pests}</strong>
          </div>
        </div>

        <p className="yearCompareChange">
          +{compare["2026"].pests - compare["2024"].pests}종
        </p>
      </article>

      <article className="yearCompareCard yearCompareCardWide">
        <span className="yearCompareLabel">예찰 지역</span>

        <div className="yearCompareValues">
          <div>
            <small>2024년</small>
            <strong>{compare["2024"].regions}</strong>
          </div>

          <span className="yearCompareArrow">→</span>

          <div>
            <small>2026년</small>
            <strong>{compare["2026"].regions}</strong>
          </div>
        </div>

        <p className="yearCompareChange">
          +{compare["2026"].regions - compare["2024"].regions}개 지역
        </p>
      </article>
    </div>

    <p className="yearCompareNote">
      ※ 연도별 수집 건수와 분석 범위의 비교이며, 실제 병해충 발생량이
      같은 비율로 증가했다는 의미는 아닙니다.
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
              <select value={crop} onChange={(event) => void handleCropChange(event.target.value)}>
                <option value="전체">전체</option>
                {options.crops.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              대상 병해충
              <select value={pest} onChange={(event) => void handlePestChange(event.target.value)}>
                {comparablePests.length > 0 && (
                  <optgroup label={`↔ 양년 비교 가능 · 우선 (${comparablePests.length})`}>
                    {comparablePests.map((item) => (
                      <option key={`comparable-${item}`} value={item}>↔ {item}</option>
                    ))}
                  </optgroup>
                )}
                {remainingPestGroups.length ? remainingPestGroups.map((group) => (
                  <optgroup key={group.category} label={`전체 목록 · ${group.category} (${group.items.length})`}>
                    {group.items.map((item) => <option key={item} value={item}>{item}</option>)}
                  </optgroup>
                )) : options.pests.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <small className="catalogMeta">
                전체 {options.pests.length.toLocaleString("ko-KR")}개 유지 · ↔ 표시는 2024·2026 양년 조사자료 보유
              </small>
            </label>
            <div className="comparisonPriorityNote" role="note">
              <span>비교 우선 알고리즘</span>
              <p>
                <b>같은 이름으로 두 CSV에 모두 조사 행이 있는 병해충을 맨 위에 표시</b>합니다.
                발생값 0도 실제 조사로 포함하며, 한쪽 자료가 없으면 지도에 ‘—’로 그대로 공개합니다.
              </p>
            </div>
            <label>
              지역
              <select
                aria-busy={conditionLoading}
                value={region}
                onChange={(event) => handleRegionChange(event.target.value)}
              >
                <option value="전체">전체</option>
                {availableRegions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            {conditionError && <p className="conditionError" role="alert">{conditionError}</p>}
            <button onClick={() => runSimulation()} disabled={loading}>{loading ? "데이터 분석 중…" : "AI 위험도 분석 실행"}<ArrowRight size={17} /></button>
            <div className="sourceNote"><Database size={15} /><span>{connectionLabel}<br /><b>{connectionStatus === "offline" ? "로컬 전체 목록 안전망" : "실제 예찰자료 기반"}</b></span></div>
          </aside>

          <div className="resultsPanel">
            {!result ? (
              <div className={`emptyState${simulationError ? " isError" : ""}`} role={simulationError ? "alert" : "status"}>
                <Activity size={32} />
                <b>{loading ? "실제 예찰자료를 분석하고 있습니다." : simulationError ? "분석 결과를 불러오지 못했습니다." : "조건을 선택하고 위험도 분석을 실행하세요."}</b>
                <span>{simulationError ?? "전체 병해충 목록과 조건별 지역 목록은 서로 독립적으로 유지됩니다."}</span>
              </div>
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
                    <div className="cardHeader">
                      <div><small>2024 ↔ 2026 지역 비교</small><b>변화폭이 큰 지역 한눈에 보기</b></div>
                      <MapPinned size={17} />
                    </div>
                    <div className="regionCompareLegend" aria-label="연도별 막대 범례">
                      <span><i className="year2024" />2024</span>
                      <span><i className="year2026" />2026</span>
                      <small>양년 비교 가능 지역 우선 · 절대 변화폭 순</small>
                    </div>
                    {regionRiskLoading ? (
                      <div className="regionCompareState">실제 CSV에서 양년 지역 비교를 계산하고 있습니다…</div>
                    ) : regionRiskError ? (
                      <div className="regionCompareState isError">지역 비교를 불러오지 못했습니다. 아래 지도에서 연결 상태를 확인하세요.</div>
                    ) : regionComparisonRows.length ? (
                      <div className="regionCompareRows">
                        {regionComparisonRows.map((item, index) => (
                          <button
                            className="regionCompareRow"
                            key={item.name}
                            onClick={() => setSelectedMapRegion(item.name)}
                            type="button"
                          >
                            <div className="regionCompareName">
                              <span>{String(index + 1).padStart(2, "0")}</span>
                              <b>{item.name}</b>
                              <strong className={item.delta === null ? "deltaMuted" : item.delta > 0 ? "deltaUp" : item.delta < 0 ? "deltaDown" : "deltaFlat"}>
                                {item.delta === null ? "비교 불가" : item.delta > 0 ? `▲ +${item.delta}` : item.delta < 0 ? `▼ ${item.delta}` : "― 0"}
                              </strong>
                            </div>
                            <div className="regionCompareBar">
                              <span>2024</span>
                              <i><em className="year2024" style={{ width: `${item.score_2024 ?? 0}%` }} /></i>
                              <b>{item.score_2024 ?? "—"}</b>
                            </div>
                            <div className="regionCompareBar">
                              <span>2026</span>
                              <i><em className="year2026" style={{ width: `${item.score_2026 ?? 0}%` }} /></i>
                              <b>{item.score_2026 ?? "—"}</b>
                            </div>
                            <small>
                              조사값 {item.observations_2024.toLocaleString("ko-KR")}건 → {item.observations_2026.toLocaleString("ko-KR")}건
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="regionCompareState">선택 조건의 지역별 관측자료가 없습니다.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <RegionalRiskMap
        data={regionRiskData}
        error={regionRiskError}
        loading={regionRiskLoading}
        onSelectRegion={setSelectedMapRegion}
        selectedRegion={selectedMapRegion}
      />

      {yearComparison && (
        <section className="yearDetailSection" id="year-comparison">
          <div className="yearDetailInner">
            <div className="yearDetailHeading">
              <div>
                <small>SELECTED CONDITION COMPARISON</small>
                <h2>선택 조건 2024 ↔ 2026 비교</h2>
              </div>
              <p>같은 병해충·작물·지역 조건을 각 연도 내부의 95백분위 기준으로 표준화한 결과입니다.</p>
            </div>
            <div className="yearDetailGrid">
              {yearComparison.year_comparison.map((item) => (
                <article className="yearDetailCard" key={item.year}>
                  <span>{item.year}년</span>
                  <div><strong>{item.risk_score ?? "—"}</strong><small>{item.has_observation ? "점" : "자료 없음"}</small></div>
                  <p>{item.risk_level} · {item.region}</p>
                  <small>조사값 {item.observations.toLocaleString("ko-KR")}건 · 양성 {item.positive_observations.toLocaleString("ko-KR")}건</small>
                </article>
              ))}
              <article className="yearDetailCard yearDetailSummary">
                <span>변화 요약</span>
                <strong>{yearComparison.comparison_direction}</strong>
                <p>
                  {yearComparison.comparison_delta === null
                    ? "두 연도 중 한쪽에 비교 가능한 예찰자료가 없습니다."
                    : `2024년 대비 ${yearComparison.comparison_delta > 0 ? "+" : ""}${yearComparison.comparison_delta}점`}
                </p>
              </article>
            </div>
            <p className="yearDetailNote">※ {yearComparison.note} 출처: {yearComparison.source}. 절대 발생량의 직접 비교가 아니라 연도별 상대 위험도 비교입니다.</p>
          </div>
        </section>
      )}

      <section className="recommendSection" id="evidence">
        <div className="sectionHeading light">
          <div><span className="sectionNumber">03</span><div><p>{result?.is_natural_enemy_target === false ? "TYPE-SPECIFIC RESPONSE" : "NATURAL ENEMY MATCH"}</p><h2>{result?.is_natural_enemy_target === false ? (result.category === "선충" ? "식물기생선충 관리 안내" : `${result.category} 관리 안내`) : "추천 천적곤충과 활용 근거"}</h2></div></div>
          <p>{result?.is_natural_enemy_target === false ? <>천적곤충을 잘못 연결하지 않고 병해충 유형에 맞는<br />예찰·재배환경·전문가 확인 중심의 대응을 안내합니다.</> : <>단순 이름 매칭이 아니라 대상해충·이용방법·공식 출처를<br />함께 제시해 설명 가능한 추천을 만듭니다.</>}</p>
        </div>
        {result && (
          <div className="responseRouteStatus">
            <CheckCircle2 size={20} />
            <div>
              <small>RESPONSE ROUTE CONNECTED</small>
              <b>
                {result.pest} → {result.is_natural_enemy_target
                  ? `천적곤충 추천 ${result.recommendations.length}건`
                  : `${result.category} 통합관리 프로토콜`}
              </b>
              <p>
                {result.is_natural_enemy_target
                  ? "대상해충명이 천적 DB의 적용 대상과 일치한 결과입니다."
                  : result.category === "해충"
                    ? "직접 일치하는 천적 근거가 없어 임의 추천하지 않고 해충 통합관리 경로로 연결합니다."
                    : `${result.category}은 천적곤충 유무가 아니라 진단·예방·환경·등록 방제 경로로 연결됩니다.`}
              </p>
            </div>
            <span>{result.is_natural_enemy_target ? "천적 연결" : "유형별 대응 연결"}</span>
          </div>
        )}
        <div className="enemyGrid">
          {result?.is_natural_enemy_target && result.recommendations.slice(0, 3).map((enemy, index) => <article className="enemyCard" key={`${enemy.name}-${index}`}><div className="enemyIcon"><Bug size={24} /></div><span className="rank">추천 {String(index + 1).padStart(2, "0")}</span><h3>{enemy.name}</h3><i>{enemy.scientific_name}</i><div className="tags"><span>{enemy.type}</span><span>{enemy.source}</span></div><p>{enemy.usage && enemy.usage !== "nan" ? enemy.usage.slice(0, 150) + (enemy.usage.length > 150 ? "…" : "") : `${enemy.target} 방제에 활용 가능한 천적곤충입니다.`}</p><footer><CheckCircle2 size={16} /> 대상해충 매칭 확인</footer></article>)}
          {result?.is_natural_enemy_target && result.recommendations.length === 0 && <div className="emptyEnemies">현재 DB에서 연결된 천적곤충을 찾지 못했습니다. 대상해충을 다시 확인하거나 천적 DB의 근거를 추가하세요.</div>}
          {result && !result.is_natural_enemy_target && (
            <article className="managementResponseCard">
              <div className="managementRouteHeader">
                <span><ShieldCheck size={24} /></span>
                <div>
                  <small>{result.pest} 대응 경로</small>
                  <h3>{result.category} · {displayedResponseType}</h3>
                </div>
                <strong>연결 완료</strong>
              </div>
              <p className="managementMessage">
                {displayedManagementMessage}
              </p>
              {displayedManagementSteps.length ? (
                <ol className="managementSteps">
                  {displayedManagementSteps.map((step, index) => (
                    <li key={`${index}-${step}`}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {displayedManagementCaution ? (
                <p className="managementCaution">
                  ※ 현장 적용 주의: {displayedManagementCaution}
                </p>
              ) : null}
              {displayedManagementEvidence ? (
                <small className="managementEvidence">
                  근거: {displayedManagementEvidence}
                </small>
              ) : null}
            </article>
          )}
          {!result && <div className="emptyEnemies">병해충을 선택하고 위험도 분석을 실행하면 유형별 대응 결과가 표시됩니다.</div>}
        </div>
      </section>

      <footer className="footer"><div className="brand"><span className="brandMark"><Leaf size={18} /></span><span>공생의 알고리즘 AI</span></div><p>데이터로 예방하고, 자연으로 방제합니다.</p><span>Prototype · NCPMS 2024·2026</span></footer>

      </main>
  );
}
