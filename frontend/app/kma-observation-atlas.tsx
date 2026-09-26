"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { boundedFetchJson } from "./bounded-fetch";
import { Database, MapPin, RefreshCw, ThermometerSun, Waves, Wind } from "lucide-react";
import styles from "./kma-observation-atlas.module.css";

type ObservationPoint = {
  domain: "surface" | "marine";
  type_code: string;
  type_name: string;
  station_id: string;
  station_name: string;
  latitude: number;
  longitude: number;
  province: string;
  district: string;
  observed_at: string;
  wave_height: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  gust_speed: number | null;
  water_temperature: number | null;
  air_temperature: number | null;
  pressure: number | null;
  humidity: number | null;
  rainfall: number | null;
  ground_temperature: number | null;
  sunshine: number | null;
  solar_radiation: number | null;
  data_status: string;
};

type ArchiveStatus = {
  surface: {
    ASOS: { status: string; rows: number; stations: number; last_observation?: string };
    AWS: { status: string; rows: number; valid_rows: number; completed_windows: number; last_observation?: string };
  };
  marine: {
    status: string;
    rows: number;
    valid_rows: number;
    completed_hours: number;
    planned_hours: number;
    remaining_hours: number;
    completion_percent: number;
    type_rows: Record<string, number>;
  };
  extended_services: {
    tested: number;
    approved: number;
    actual_data: number;
    categories: Record<string, { tested: number; approved: number; data: number }>;
  };
};

type ObservationResponse = {
  total_points: number;
  points: ObservationPoint[];
  archive: ArchiveStatus;
  note: string;
};

const FILTERS = [
  { code: "all", label: "전체" },
  { code: "surface", label: "지상관측" },
  { code: "B", label: "해양기상부이" },
  { code: "C", label: "파고부이" },
  { code: "L", label: "등표" },
  { code: "N", label: "조위" },
  { code: "F", label: "연안방재" },
  { code: "D", label: "표류부이" },
  { code: "G", label: "파랑계" },
  { code: "J", label: "기상선" },
];

const TYPE_COLORS: Record<string, string> = {
  SFC: "#f36b21",
  AWS: "#ffb63d",
  B: "#007c84",
  C: "#2d72d2",
  D: "#725bd5",
  L: "#00a884",
  N: "#0d5f77",
  F: "#dd4466",
  G: "#45a3df",
  J: "#24364b",
};

const TYPE_SHORT: Record<string, string> = {
  SFC: "ASOS",
  AWS: "AWS",
  B: "부이",
  C: "파고",
  D: "표류",
  L: "등표",
  N: "조위",
  F: "방재",
  G: "파랑",
  J: "기상",
};

function statusLabel(status: string) {
  if (status === "complete") return "전체 완료";
  if (status === "request_cap_reached") return "장기수집 진행 중";
  if (status === "running") return "수집 중";
  return "상태 확인 필요";
}

function display(value: number | null, unit: string) {
  return value === null ? "자료 없음" : `${value.toLocaleString("ko-KR")}${unit}`;
}

export default function KmaObservationAtlas({ apiBase }: { apiBase: string }) {
  const [data, setData] = useState<ObservationResponse | null>(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<ObservationPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  async function load(refresh = false) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await boundedFetchJson<ObservationResponse>(
        `${apiBase}/api/weather/observations/map?domain=all&limit=5000${refresh ? "&refresh=true" : ""}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!Array.isArray(next.points) || !next.archive) throw new Error("응답 형식 오류");
      setData(next);
      setSelected((current) => next.points.find((point) => current && point.domain === current.domain && point.type_code === current.type_code && point.station_id === current.station_id) ?? next.points.find((point) => point.domain === "marine") ?? next.points[0] ?? null);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "관측자료 연결 실패");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
    // 최초 경량 자료는 한 번만 요청합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const filtered = useMemo(() => {
    const points = data?.points ?? [];
    if (filter === "all") return points;
    if (filter === "surface") return points.filter((point) => point.domain === "surface");
    return points.filter((point) => point.domain === "marine" && point.type_code === filter);
  }, [data, filter]);

  const plotted = filtered.filter(
    (point) => point.longitude >= 123 && point.longitude <= 132 && point.latitude >= 31 && point.latitude <= 39.5,
  );
  const outside = filtered.length - plotted.length;
  const archive = data?.archive;

  return (
    <section className={styles.section} id="kma-observations">
      <div className={styles.heading}>
        <div className={styles.number}>05</div>
        <div>
          <p>KMA OBSERVATION ATLAS</p>
          <h2>지상·해양 관측 통합 아틀라스</h2>
        </div>
        <div className={styles.headingCopy}>
          기상청 APIHub 실제 관측을 서버 원본과 경량 공간자료로 분리해 보존합니다.
          결측값은 보간하지 않고 실제 0은 그대로 유지합니다.
        </div>
      </div>

      {archive && (
        <div className={styles.statusGrid}>
          <article>
            <span className={styles.statusIcon}><ThermometerSun size={20} /></span>
            <div><small>ASOS 시간 관측</small><strong>{archive.surface.ASOS.rows.toLocaleString("ko-KR")}행</strong></div>
            <b className={styles.complete}>{statusLabel(archive.surface.ASOS.status)}</b>
          </article>
          <article>
            <span className={styles.statusIcon}><Wind size={20} /></span>
            <div><small>AWS 전국 매분 관측</small><strong>{archive.surface.AWS.valid_rows.toLocaleString("ko-KR")}행</strong></div>
            <b>{statusLabel(archive.surface.AWS.status)}</b>
          </article>
          <article>
            <span className={`${styles.statusIcon} ${styles.marineIcon}`}><Waves size={20} /></span>
            <div><small>해양 통합 시간 관측</small><strong>{archive.marine.valid_rows.toLocaleString("ko-KR")}행</strong></div>
            <b>{archive.marine.completion_percent.toFixed(2)}%</b>
          </article>
          <article>
            <span className={styles.statusIcon}><Database size={20} /></span>
            <div><small>확장 API 승인 검증</small><strong>{archive.extended_services.approved}/{archive.extended_services.tested} 서비스</strong></div>
            <b>{archive.extended_services.actual_data}개 자료 확인</b>
          </article>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="관측망 유형">
          {FILTERS.map((item) => (
            <button
              className={filter === item.code ? styles.active : ""}
              key={item.code}
              onClick={() => setFilter(item.code)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button className={styles.refresh} disabled={loading} onClick={() => void load(true)} type="button">
          <RefreshCw size={15} /> {loading ? "연결 중 (최대 15초)" : error ? "다시 시도" : "최신 상태"}
        </button>
      </div>

      {error ? (
        <div className={styles.error} role="alert">관측 API를 불러오지 못했습니다: {error}</div>
      ) : (
        <div className={styles.atlasGrid} aria-busy={loading}>
          {!loading && !filtered.length && <p role="status">선택한 관측망의 자료가 없습니다. ‘최신 상태’로 다시 확인할 수 있습니다.</p>}
          <div className={styles.mapPanel}>
            <div className={styles.mapHeader}>
              <div><small>LIGHTWEIGHT SPATIAL VIEW</small><strong>좌표 확인 관측망 {filtered.length.toLocaleString("ko-KR")}개</strong></div>
              <span><i /> 실제 좌표</span>
            </div>
            <div className={styles.map} aria-label="대한민국 지상 및 해양 관측 지점 지도">
              <div className={styles.peninsula} aria-hidden="true" />
              <span className={`${styles.seaLabel} ${styles.west}`}>서해</span>
              <span className={`${styles.seaLabel} ${styles.east}`}>동해</span>
              <span className={`${styles.seaLabel} ${styles.south}`}>남해</span>
              {plotted.map((point) => (
                <button
                  aria-label={`${point.type_name} ${point.station_name || point.station_id}`}
                  className={`${styles.point} ${selected?.domain === point.domain && selected?.type_code === point.type_code && selected?.station_id === point.station_id ? styles.selected : ""}`}
                  data-kind={TYPE_SHORT[point.type_code] ?? "기타"}
                  key={`${point.domain}-${point.type_code}-${point.station_id}`}
                  onClick={() => setSelected(point)}
                  style={{
                    backgroundColor: TYPE_COLORS[point.type_code] ?? "#173f35",
                    left: `${((point.longitude - 123) / 9) * 100}%`,
                    top: `${((39.5 - point.latitude) / 8.5) * 100}%`,
                  }}
                  type="button"
                />
              ))}
            </div>
            <p className={styles.mapNote}>
              화면 범위 밖 이동 관측 {outside.toLocaleString("ko-KR")}건도 API 응답에는 유지됩니다. 지도점은 최신 경량값이며 전체 원문은 서버에 보존됩니다.
            </p>
          </div>

          <aside className={styles.detailPanel}>
            {selected ? (
              <>
                <div className={styles.detailTop}>
                  <span><MapPin size={19} /></span>
                  <div><small>{selected.domain === "surface" ? "지상 관측" : "해양 관측"} · {selected.type_name}</small><h3>{selected.station_name || `지점 ${selected.station_id}`}</h3></div>
                </div>
                <dl className={styles.metrics}>
                  <div><dt>관측 시각</dt><dd>{selected.observed_at || "지점정보만 보유"}</dd></div>
                  <div><dt>위치</dt><dd>{selected.province || `${selected.latitude.toFixed(3)}°, ${selected.longitude.toFixed(3)}°`}</dd></div>
                  <div><dt>기온</dt><dd>{display(selected.air_temperature, "℃")}</dd></div>
                  <div><dt>습도</dt><dd>{display(selected.humidity, "%")}</dd></div>
                  <div><dt>풍속</dt><dd>{display(selected.wind_speed, "m/s")}</dd></div>
                  <div><dt>강수</dt><dd>{display(selected.rainfall, "mm")}</dd></div>
                  <div><dt>수온</dt><dd>{display(selected.water_temperature, "℃")}</dd></div>
                  <div><dt>유의파고</dt><dd>{display(selected.wave_height, "m")}</dd></div>
                </dl>
                <p className={styles.dataState}><Database size={15} /> {selected.data_status || "자료상태 미표기"}</p>
              </>
            ) : (
              <div className={styles.empty}>지도에서 관측 지점을 선택하세요.</div>
            )}
          </aside>
        </div>
      )}

      <div className={styles.disclaimer}>
        <strong>수집 범위 원칙</strong>
        <span>국내 지상·해양 실제 관측을 우선 사용합니다. 세계기상 자료는 국내 자료와 시공간 기준이 맞는 경우에만 별도 보조 근거로 검토하며 국내 결측을 임의 대체하지 않습니다.</span>
      </div>
      {archive?.extended_services.categories && (
        <div className={styles.auditStrip}>
          {Object.entries(archive.extended_services.categories).map(([category, value]) => (
            <span key={category}><b>{category}</b> 승인 {value.approved}/{value.tested} · 자료 {value.data}</span>
          ))}
        </div>
      )}
    </section>
  );
}
