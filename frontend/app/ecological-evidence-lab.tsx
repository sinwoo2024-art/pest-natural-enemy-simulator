"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Beaker,
  Bug,
  CheckCircle2,
  Database,
  FileSearch,
  MapPinned,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import styles from "./ecological-evidence-lab.module.css";

type MapPoint = {
  id: string;
  year: number;
  class_name: string;
  region: string;
  district: string | null;
  species: string;
  scientific_name: string;
  latitude: number;
  longitude: number;
  data_status: string;
  ncpms_exact_match: boolean;
};

type Ranking = {
  region: string;
  record_count: number;
  species_count: number;
  district_count: number;
  latest_year: number;
  ncpms_exact_match_records: number;
};

type EnemyEvidence = {
  name: string | null;
  scientific_name: string | null;
  report_count: number;
  mention_count: number;
  evidence_type: string;
  release_timing_evidence: boolean;
  effect_evidence: boolean;
};

type EvidenceGate = {
  id: string;
  source: string;
  volume: string;
  spatiotemporal_unit: string;
  use_grade: string;
  direct_2027_input: boolean;
  app_visibility: string;
  reason: string;
};

type EcologyResponse = {
  status: string;
  available: boolean;
  run_id: string;
  selected: { year: number | null; region: string; species: string };
  filters: { years: number[]; regions: string[]; species: string[] };
  summary: {
    distribution_rows: number;
    selected_rows: number;
    species_count: number;
    region_count: number;
    district_count: number;
    coordinate_count: number;
    ncpms_exact_match_rows: number;
    insect_reports: number;
    insect_report_pages: number;
    natural_enemy_document_matches: number;
    radiation_sample_rows: number;
    radioactivity_report_count: number;
    agchm_spec_rows: number;
  };
  map: {
    point_count: number;
    total_filtered_points: number;
    sampling: string;
    points: MapPoint[];
  };
  regional_rankings: Ranking[];
  natural_enemy_evidence: EnemyEvidence[];
  radiation_research_sandbox: {
    available: boolean;
    source_rows: number;
    dose_groups: Array<{
      dose: string;
      dose_gy: number | null;
      observation_count: number | null;
      development_state_count: number | null;
      numeric_value_count: number | null;
      field_management_model_input: boolean;
    }>;
    field_recommendation_allowed: boolean;
    caution: string;
  };
  pesticide_safety_connector: {
    manual_available: boolean;
    services: string[];
    operations: string[];
    spec_rows: number;
    api_called: boolean;
    key_value_exposed: boolean;
    status: string;
  };
  evidence_gate: EvidenceGate[];
  model_policy: {
    direct_2027_inputs_added: number;
    context_layers_added: number;
    excluded_sources: string[];
    reason: string;
  };
  limitations: string[];
};

const count = (value: number | null | undefined) =>
  value === null || value === undefined ? "자료 없음" : value.toLocaleString("ko-KR");

const pointColor = (point: MapPoint) => {
  if (point.ncpms_exact_match) return "#ff6b35";
  if (point.class_name.includes("곤충")) return "#f3b33d";
  if (point.class_name.includes("식물")) return "#42b883";
  return "#4d8bc9";
};

const mapX = (longitude: number) => Math.max(4, Math.min(96, ((longitude - 124) / 8) * 100));
const mapY = (latitude: number) => Math.max(4, Math.min(96, 100 - ((latitude - 32) / 7.8) * 100));

export default function EcologicalEvidenceLab({ apiBase }: { apiBase: string }) {
  const [data, setData] = useState<EcologyResponse | null>(null);
  const [year, setYear] = useState("전체");
  const [region, setRegion] = useState("전체");
  const [species, setSpecies] = useState("전체");
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "360" });
    if (year !== "전체") params.set("year", year);
    if (region !== "전체") params.set("region", region);
    if (species !== "전체") params.set("species", species);
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/analysis/ecological-evidence?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`공식 생태근거 API ${response.status}`);
        return response.json();
      })
      .then((payload: EcologyResponse) => setData(payload))
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiBase, region, species, year]);

  const rankingMax = useMemo(
    () => Math.max(1, ...(data?.regional_rankings.map((item) => item.record_count) ?? [1])),
    [data],
  );

  if (loading && !data) {
    return <section className={styles.shell}><div className={styles.state}>공식 생태·실험 근거를 검증하고 있습니다.</div></section>;
  }
  if (error || !data?.available) {
    return <section className={styles.shell}><div className={styles.state}>{error || "Stage 13 공식 근거가 없습니다."}</div></section>;
  }

  return (
    <section className={styles.shell} id="ecological-evidence-lab" aria-busy={loading}>
      <div className={styles.signal} aria-hidden="true" />
      <header className={styles.hero}>
        <div className={styles.heroIndex}>05</div>
        <div>
          <p>OFFICIAL EVIDENCE GATE · SPATIOTEMPORAL CONTEXT</p>
          <h2>생태 근거 오케스트레이션 랩</h2>
          <span>공식 분포·육상곤충 문헌·실험 샘플을 한 화면에서 추적하되, 예측에 쓸 수 없는 자료는 점수에서 자동 차단합니다.</span>
        </div>
        <aside>
          <Sparkles size={23} />
          <strong>독립 근거층 {data.model_policy.context_layers_added}</strong>
          <small>2027 점수 직접 추가 {data.model_policy.direct_2027_inputs_added}</small>
        </aside>
      </header>

      <div className={styles.filterBar}>
        <label>조사연도<select value={year} onChange={(event) => setYear(event.target.value)}><option>전체</option>{data.filters.years.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>시도<select value={region} onChange={(event) => setRegion(event.target.value)}><option>전체</option>{data.filters.regions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>관측종<select value={species} onChange={(event) => setSpecies(event.target.value)}><option>전체</option>{data.filters.species.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div><span>선택 관측기록</span><strong>{count(data.summary.selected_rows)}</strong><small>0은 실제 0건, 자료 없음과 분리</small></div>
      </div>

      <div className={styles.statGrid}>
        <article><Database /><span>공식 분포기록</span><strong>{count(data.summary.distribution_rows)}</strong><small>2016–2024 원천행 보존</small></article>
        <article><Bug /><span>관측 종</span><strong>{count(data.summary.species_count)}</strong><small>{count(data.summary.region_count)}개 시도 · {count(data.summary.district_count)}개 시군구</small></article>
        <article><FileSearch /><span>육상곤충 보고서</span><strong>{count(data.summary.insect_reports)}</strong><small>{count(data.summary.insect_report_pages)}쪽 전수 색인</small></article>
        <article><CheckCircle2 /><span>천적 종명 문헌일치</span><strong>{count(data.summary.natural_enemy_document_matches)}</strong><small>정확일치 · 효과율 근거 아님</small></article>
      </div>

      <div className={styles.mapGrid}>
        <article className={styles.mapPanel}>
          <header><div><MapPinned size={21} /><span>OBSERVATION COORDINATE FIELD</span></div><p>관측 좌표 플롯 · 위험확률 히트맵이 아닙니다</p></header>
          <div className={styles.mapCanvas}>
            <svg viewBox="0 0 100 100" role="img" aria-label="공식 생태계교란생물 관측 좌표 분포">
              <defs>
                <radialGradient id="ecology-glow"><stop offset="0" stopColor="#ffcf68" stopOpacity=".9"/><stop offset="1" stopColor="#ff6b35" stopOpacity="0"/></radialGradient>
              </defs>
              <path className={styles.land} d="M48 3 L60 8 65 20 61 31 69 43 62 55 67 66 59 76 54 92 44 96 39 85 41 70 34 59 38 47 32 36 40 24 39 11Z" />
              <path className={styles.island} d="M26 91c5-4 12-4 17 0-4 5-13 6-17 0Z" />
              {data.map.points.map((point) => (
                <g key={`${point.id}-${point.year}`} onMouseEnter={() => setHovered(point)} onMouseLeave={() => setHovered(null)}>
                  {point.ncpms_exact_match && <circle className={styles.pointHalo} cx={mapX(point.longitude)} cy={mapY(point.latitude)} r="2.2" fill="url(#ecology-glow)" />}
                  <circle className={styles.point} cx={mapX(point.longitude)} cy={mapY(point.latitude)} r={point.ncpms_exact_match ? 0.9 : 0.65} fill={pointColor(point)} tabIndex={0} />
                </g>
              ))}
            </svg>
            <div className={styles.mapLegend}><span><i className={styles.orange}/>NCPMS 명칭 정확일치</span><span><i className={styles.green}/>식물</span><span><i className={styles.gold}/>곤충</span></div>
            <div className={styles.mapTip}>
              {hovered ? <><b>{hovered.species}</b><span>{hovered.region} {hovered.district ?? "시군구 자료 없음"}</span><small>{hovered.year} · {hovered.scientific_name}</small></> : <><b>{count(data.map.point_count)}개 좌표 표시</b><span>전체 {count(data.map.total_filtered_points)}건 중 결정표본</span><small>점에 마우스를 올려 원천 맥락 확인</small></>}
            </div>
          </div>
        </article>

        <article className={styles.rankingPanel}>
          <header><span>REGIONAL OBSERVATION COVERAGE</span><b>지역별 공식 관측범위</b><small>기록량은 위험 순위가 아니라 조사 근거의 범위입니다.</small></header>
          <div>
            {data.regional_rankings.slice(0, 9).map((item, index) => (
              <button type="button" key={item.region} onClick={() => setRegion(item.region)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{item.region}</b><i><em style={{ width: `${Math.max(3, (item.record_count / rankingMax) * 100)}%` }} /></i><small>{item.species_count}종 · {item.district_count}개 시군구</small></div>
                <strong>{count(item.record_count)}</strong>
              </button>
            ))}
          </div>
        </article>
      </div>

      <article className={styles.gatePanel}>
        <header><ShieldAlert size={22}/><div><span>EVIDENCE ADMISSIBILITY MATRIX</span><h3>자료를 많이 넣되, 과학적으로 섞지 않는 분석 게이트</h3></div><p>{data.model_policy.reason}</p></header>
        <div className={styles.gateGrid}>
          {data.evidence_gate.map((item) => (
            <div key={item.id} className={item.direct_2027_input ? styles.direct : item.use_grade === "모델 제외" ? styles.excluded : styles.context}>
              <span>{item.use_grade}</span><h4>{item.source}</h4><b>{item.volume}</b><small>{item.spatiotemporal_unit}</small><p>{item.reason}</p><i>{item.direct_2027_input ? "2027 점수 반영" : "2027 점수 비반영"}</i>
            </div>
          ))}
        </div>
      </article>

      <div className={styles.evidenceGrid}>
        <article className={styles.enemyPanel}>
          <header><Bug size={21}/><div><span>NATURAL ENEMY DOCUMENT EVIDENCE</span><h3>천적 종명 문헌 교차검증</h3></div></header>
          <div>
            {data.natural_enemy_evidence.slice(0, 8).map((item, index) => (
              <div key={`${item.name}-${item.scientific_name}`}>
                <span>{String(index + 1).padStart(2, "0")}</span><p><b>{item.name ?? item.scientific_name}</b><small>{item.scientific_name}</small></p><strong>{item.report_count}<small> 보고서</small></strong><i>분포 문헌 근거</i>
              </div>
            ))}
          </div>
          <footer><ShieldAlert size={17}/>종명이 확인돼도 투입 적기·방사량·방제효과는 별도 정량시험 없이는 표시하지 않습니다.</footer>
        </article>

        <article className={styles.sandboxPanel}>
          <header><Beaker size={21}/><div><span>RESEARCH SANDBOX</span><h3>방사선 조사 해충 실험 샘플</h3></div></header>
          <div className={styles.doseGrid}>{data.radiation_research_sandbox.dose_groups.map((item) => <div key={item.dose}><span>{item.dose}</span><strong>{count(item.observation_count)}</strong><small>관측</small></div>)}</div>
          <p>{data.radiation_research_sandbox.caution}</p>
          <div className={styles.connector}><Database size={18}/><span><b>농약 안전사용지침 OpenAPI 규격</b>{data.pesticide_safety_connector.spec_rows}개 명세 · {data.pesticide_safety_connector.operations.length}개 오퍼레이션</span><strong>연결 준비</strong></div>
        </article>
      </div>

      <footer className={styles.footer}>
        <ShieldAlert size={20}/><div><b>연구윤리 보호장치</b>{data.limitations.map((item) => <span key={item}>{item}</span>)}</div><small>{data.run_id}</small>
      </footer>
    </section>
  );
}
