"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Database, MapPinned, PawPrint, Radar, RotateCcw, ShieldCheck, Sprout } from "lucide-react";
import styles from "./spatial-evidence-map.module.css";

type MapShape = { code: string; name: string; province?: string; path: string };
type HubCard = {
  province: string; district: string; type: string; crop: string; case_count: number;
  coordinate_count: number; display_name: string; public_level: string; source: string;
  individual_farm: boolean;
};
type LivestockCard = {
  축종명: string; 지표구분: string; 값: number | null; 값상태: string; 단위: string;
  시도명: string; 시군구명: string; 전국대비비중: number | null; 기준연도: string;
};
type PublicExample = {
  case_id: string; kind: string; province: string; district: string; town: string;
  crop: string; variety: string; cultivation: string; facility: string; years: string[];
  cycle_count: number; data_modules: string[]; public_label: string; source: string;
  is_anonymised_farm_case: boolean; contains_owner_name: boolean;
  coordinate: { latitude: number | null; longitude: number | null } | null;
};
type MapPoint = {
  case_id: string; kind: string; x: number; y: number; province: string; district: string;
  town: string; crop: string; source: string;
};
type SpatialResponse = {
  available: boolean;
  scope: { level: "province" | "district"; province: string; district: string | null };
  map: { view_box: string; shapes: MapShape[] };
  public_hubs: HubCard[];
  public_examples: PublicExample[];
  map_points: MapPoint[];
  available_years: string[];
  selected_year: string | null;
  livestock: LivestockCard[];
  livestock_species: string[];
  district_hub_counts: Record<string, number>;
  summary: {
    province_count: number; district_count: number; public_hub_count: number;
    selected_public_hub_rows: number; selected_livestock_rows: number;
    selected_public_example_rows: number; selected_anonymised_smartfarm_cases: number;
    selected_mapped_observation_points: number;
  };
  source_note: string;
  integrity_notice: string;
  interpretation_caution: string;
};

const REGION_TO_PROVINCE: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도",
};
const PROVINCE_TO_REGION = Object.fromEntries(
  Object.entries(REGION_TO_PROVINCE).map(([regionName, provinceName]) => [provinceName, regionName]),
) as Record<string, string>;

function signal(value: number | null) {
  if (value === null) return { label: "자료 없음", tone: "none" };
  if (value >= 10) return { label: "전국 비중 높음", tone: "high" };
  if (value >= 3) return { label: "전국 비중 중간", tone: "medium" };
  return { label: "전국 비중 낮음", tone: "low" };
}

export default function SpatialEvidenceMap({ apiBase, region, onSelectRegion }: { apiBase: string; region: string; onSelectRegion?: (region: string) => void }) {
  const [mode, setMode] = useState<"crop" | "livestock">("crop");
  const [province, setProvince] = useState("전국");
  const [district, setDistrict] = useState("");
  const [species, setSpecies] = useState("");
  const [year, setYear] = useState("");
  const [caseView, setCaseView] = useState<"examples" | "aggregate">("examples");
  const [depthOn, setDepthOn] = useState(true);
  const [motionOn, setMotionOn] = useState(true);
  const [selectedCase, setSelectedCase] = useState<PublicExample | null>(null);
  const [activePoint, setActivePoint] = useState<MapPoint | null>(null);
  const [data, setData] = useState<SpatialResponse | null>(null);
  const [error, setError] = useState("");
  const insightRef = useRef<HTMLElement | null>(null);

  function revealDetails() {
    window.requestAnimationFrame(() => {
      insightRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  useEffect(() => {
    const mapped = REGION_TO_PROVINCE[region] ?? (Object.values(REGION_TO_PROVINCE).includes(region) ? region : "");
    if (mapped) {
      setProvince(mapped);
      setDistrict("");
    }
  }, [region]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ mode, province });
    if (district) params.set("district", district);
    if (species) params.set("livestock_species", species);
    if (year) params.set("year", year);
    setError("");
    fetch(`${apiBase}/api/spatial-evidence?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SpatialResponse>;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "공간 근거자료를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [apiBase, district, mode, province, species, year]);

  useEffect(() => {
    setSelectedCase(null);
    setActivePoint(null);
  }, [district, province, year]);

  const shapeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const hub of data?.public_hubs ?? []) {
      const key = province === "전국" ? hub.province : hub.district;
      counts.set(key, (counts.get(key) ?? 0) + hub.case_count);
    }
    return counts;
  }, [data, province]);
  const maxShapeCount = Math.max(1, ...shapeCounts.values());
  const livestock = useMemo(() => {
    const rows = data?.livestock ?? [];
    return rows.filter((row) => row.지표구분 === "사육농가").sort((a, b) => (b.값 ?? -1) - (a.값 ?? -1));
  }, [data]);

  function selectShape(shape: MapShape) {
    if (province === "전국") {
      setProvince(shape.name);
      setDistrict("");
      onSelectRegion?.(PROVINCE_TO_REGION[shape.name] ?? shape.name);
    } else {
      setDistrict(shape.name);
    }
    revealDetails();
  }

  return (
    <section className={styles.section} id="spatial-evidence">
      <header className={styles.header}>
        <div><span>4D PUBLIC EVIDENCE CONSTELLATION</span><h2>시공간 농업 근거 성좌</h2></div>
        <p>3D 공간 레이어와 4D 연도축을 움직여 시도·시군구·공개 관측점·익명 스마트팜 사례를 함께 검증합니다.</p>
      </header>

      <div className={styles.modeBar} role="tablist" aria-label="지도 자료 전환">
        <button aria-selected={mode === "crop"} className={mode === "crop" ? styles.active : ""} onClick={() => setMode("crop")} role="tab"><Sprout size={18} /> 작물·예찰망</button>
        <button aria-selected={mode === "livestock"} className={mode === "livestock" ? styles.active : ""} onClick={() => setMode("livestock")} role="tab"><PawPrint size={18} /> 축산 공식집계</button>
        <button aria-pressed={depthOn} className={depthOn ? styles.dimensionOn : ""} onClick={() => setDepthOn((value) => !value)} type="button">3D 깊이 {depthOn ? "ON" : "OFF"}</button>
        <button aria-pressed={motionOn} className={motionOn ? styles.dimensionOn : ""} onClick={() => setMotionOn((value) => !value)} type="button">4D 흐름 {motionOn ? "ON" : "정지"}</button>
        <div className={styles.breadcrumb}>
          <button onClick={() => { setProvince("전국"); setDistrict(""); onSelectRegion?.("전체"); }} type="button">전국</button>
          {province !== "전국" && <><i>›</i><button onClick={() => setDistrict("")} type="button">{province}</button></>}
          {district && <><i>›</i><strong>{district}</strong></>}
        </div>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : (
        <div className={styles.layout}>
          <div className={styles.mapPanel}>
            <div className={styles.mapTitle}><MapPinned size={18} /><b>{district || province}</b><span>{province === "전국" ? "시도를 누르세요" : "시군구를 누르세요"}</span></div>
            <div className={`${styles.mapStage} ${depthOn ? styles.depthOn : ""} ${motionOn ? styles.motionOn : styles.motionOff}`}>
            <svg aria-label={`${province} 행정구역 선택 지도`} className={styles.map} role="img" viewBox={data?.map.view_box ?? "0 0 1000 1000"}>
              {(data?.map.shapes ?? []).map((shape) => {
                const count = shapeCounts.get(shape.name) ?? 0;
                const intensity = count / maxShapeCount;
                const selected = district === shape.name;
                return <path
                  aria-label={`${shape.name}, 공개 근거 ${count.toLocaleString("ko-KR")}건`}
                  className={`${styles.shape} ${selected ? styles.selectedShape : ""}`}
                  d={shape.path} key={shape.code}
                  onClick={() => selectShape(shape)}
                  style={{ "--shape-fill": `hsl(${154 - intensity * 128} 48% ${70 - intensity * 22}%)` } as CSSProperties}
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectShape(shape); }}
                />;
              })}
              <g aria-label="공개 예찰지점 성좌" className={styles.pointLayer}>
                {(data?.map_points ?? []).map((point, index) => <g key={`${point.case_id}-${index}`}>
                  <circle className={styles.pointHalo} cx={point.x} cy={point.y} r={motionOn ? 8 : 5} />
                  <circle
                    aria-label={`${point.district} ${point.crop || "작물 미기재"} 공개 예찰지점`}
                    className={`${styles.evidencePoint} ${activePoint?.case_id === point.case_id ? styles.activeEvidencePoint : ""}`}
                    cx={point.x} cy={point.y} onClick={() => { setActivePoint(point); revealDetails(); }} r={4.2} tabIndex={0}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setActivePoint(point); revealDetails(); } }}
                  />
                </g>)}
              </g>
            </svg>
            </div>
            {activePoint && <div className={styles.pointCallout}><small>PUBLIC POINT</small><b>{activePoint.district} {activePoint.town}</b><span>{activePoint.crop || "작물 미기재"}</span><button onClick={() => setActivePoint(null)} type="button">닫기</button></div>}
            <div className={styles.timeRail}>
              <strong>4D 연도축</strong>
              <button className={!year ? styles.activeYear : ""} onClick={() => setYear("")} type="button">전체</button>
              {(data?.available_years ?? []).map((item) => <button className={year === item ? styles.activeYear : ""} key={item} onClick={() => setYear(item)} type="button">{item}</button>)}
              <span>{year ? `${year}년 스마트팜 사례 필터` : "전체 연도 근거"}</span>
            </div>
            <div className={styles.mapLegend}><span><i className={styles.lowDot} /> 공개 근거 적음</span><span><i className={styles.highDot} /> 공개 근거 많음</span><small>색은 위험도가 아니라 공개 관측·사례의 상대 밀도입니다.</small></div>
          </div>

          <aside className={styles.insightPanel} ref={insightRef}>
            <div className={styles.scopeCard}>
              <Radar size={20} /><div><small>현재 탐색 범위</small><b>{district || province}</b><span>{mode === "crop" ? `공개 근거 ${data?.summary.selected_public_hub_rows ?? 0}행` : `축산 지표 ${data?.summary.selected_livestock_rows ?? 0}행`}</span></div>
              <button aria-label="전국으로 초기화" onClick={() => { setProvince("전국"); setDistrict(""); onSelectRegion?.("전체"); }}><RotateCcw size={17} /></button>
            </div>
            <div className={styles.selectionAnnouncement} aria-live="polite">
              <i aria-hidden="true" />
              <b>{district || province}</b>
              <span>{mode === "crop" ? "공개 농업 사례" : "축산 공식 집계"}</span>
            </div>

            {mode === "crop" ? (
              <>
                <div className={styles.caseSwitch}>
                  <button className={caseView === "examples" ? styles.active : ""} onClick={() => setCaseView("examples")} type="button">공개 사례</button>
                  <button className={caseView === "aggregate" ? styles.active : ""} onClick={() => setCaseView("aggregate")} type="button">지역 집계</button>
                </div>
                {selectedCase && <article className={styles.caseInspector}>
                  <button aria-label="사례 상세 닫기" onClick={() => setSelectedCase(null)} type="button">×</button>
                  <small>{selectedCase.kind}</small><h3>{selectedCase.case_id}</h3>
                  <b>{selectedCase.district || selectedCase.province} · {selectedCase.crop || "작물 미기재"}</b>
                  <p>{selectedCase.facility || selectedCase.cultivation || "재배유형 미기재"}{selectedCase.variety ? ` · ${selectedCase.variety}` : ""}</p>
                  <div>{selectedCase.data_modules.map((item) => <span key={item}>{item}</span>)}</div>
                  <em>{selectedCase.public_label} · 소유자명 미노출</em>
                </article>}
                <div className={`${styles.cardList} ${styles.caseDeck}`}>
                  {caseView === "examples" ? (data?.public_examples ?? []).slice(0, 30).map((item) => (
                    <button className={styles.caseCard} key={item.case_id} onClick={() => { setSelectedCase(item); revealDetails(); }} type="button">
                      <span className={styles.typeSignal} data-type={item.kind}><i />{item.kind}</span>
                      <h3>{item.district || item.province || "전국"}</h3>
                      <p>{item.crop || "작물 미기재"}{item.facility ? ` · ${item.facility}` : ""}</p>
                      <small>{item.years.length ? `${item.years.join("·")}년` : item.town || "공개 위치"} · {item.cycle_count.toLocaleString("ko-KR")}개 기록</small>
                      <b className={styles.privacyBadge}>{item.is_anonymised_farm_case ? "익명 농가 단위 · 소유자 미노출" : "공개 예찰점 · 개별농가 아님"}</b>
                    </button>
                  )) : (data?.public_hubs ?? []).slice(0, 30).map((hub, index) => (
                    <article className={styles.hubCard} key={`${hub.province}-${hub.district}-${hub.type}-${hub.crop}-${index}`}>
                      <span className={styles.typeSignal} data-type={hub.type}><i />{hub.type}</span>
                      <h3>{hub.district || hub.province || "전국"}</h3>
                      <p>{hub.crop || "작물 미기재"} · {hub.case_count.toLocaleString("ko-KR")}건</p>
                      <small>{hub.public_level}</small>
                      <b className={styles.privacyBadge}>공개 관측 근거 · 개별농가 아님</b>
                    </article>
                  ))}
                  {caseView === "examples" && !data?.public_examples.length && <p className={styles.empty}>선택 지역에 연결된 공개 사례가 없습니다.</p>}
                  {caseView === "aggregate" && !data?.public_hubs.length && <p className={styles.empty}>선택 지역에 연결된 공개 관측 집계가 없습니다.</p>}
                </div>
              </>
            ) : (
              <>
                <label className={styles.speciesSelect}>축종 선택<select value={species} onChange={(event) => setSpecies(event.target.value)}><option value="">전체 축종</option>{data?.livestock_species.map((item) => <option key={item}>{item}</option>)}</select></label>
                <div className={styles.cardList}>
                  {livestock.slice(0, 18).map((row) => {
                    const state = signal(row.전국대비비중);
                    return <article className={styles.livestockCard} data-tone={state.tone} key={`${row.축종명}-${row.지표구분}`}>
                      <span className={styles.signalLamp}><i /><b>{state.label}</b></span>
                      <h3>{row.축종명}</h3>
                      <p>{row.값 === null ? "자료 없음" : `${row.값.toLocaleString("ko-KR")} ${row.단위 || "가구"}`}</p>
                      <small>{row.전국대비비중 === null ? "전국 공식 기준" : `전국 대비 ${row.전국대비비중}%`} · {row.기준연도}</small>
                    </article>;
                  })}
                  {!livestock.length && <p className={styles.empty}>선택 범위에 공개된 축산 집계가 없습니다.</p>}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <footer className={styles.evidenceFooter}>
        <ShieldCheck size={19} /><div><b>시공간 근거를 움직여도 개인정보 원칙은 고정됩니다</b><p>{data?.integrity_notice} {data?.interpretation_caution}</p><small>{data?.source_note}</small></div><Database size={20} />
      </footer>
    </section>
  );
}
