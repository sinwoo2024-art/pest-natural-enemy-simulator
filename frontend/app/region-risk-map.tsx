export type RegionalRiskItem = {
  name: string;
  score_2024: number | null;
  score_2026: number | null;
  delta: number | null;
  observations_2024: number;
  observations_2026: number;
  positive_observations_2024: number;
  positive_observations_2026: number;
};

export type RegionalRiskResponse = {
  pest: string;
  crop: string;
  years: [2024, 2026] | number[];
  regions: RegionalRiskItem[];
  note: string;
  source: string;
};

type RegionalRiskMapProps = {
  data: RegionalRiskResponse | null;
  error: string | null;
  loading: boolean;
  onRetry?: () => void;
  selectedRegion: string | null;
  onSelectRegion: (region: string) => void;
};

const MAP_TILES = [
  { name: "경기도", short: "경기", area: "gg" },
  { name: "강원특별자치도", short: "강원", area: "gw" },
  { name: "인천광역시", short: "인천", area: "ic" },
  { name: "충청북도", short: "충북", area: "cb" },
  { name: "경상북도", short: "경북", area: "gb" },
  { name: "충청남도", short: "충남", area: "cn" },
  { name: "세종특별자치시", short: "세종", area: "sj" },
  { name: "대구광역시", short: "대구", area: "dg" },
  { name: "대전광역시", short: "대전", area: "dj" },
  { name: "전북특별자치도", short: "전북", area: "jb" },
  { name: "울산광역시", short: "울산", area: "us" },
  { name: "전남광주통합특별시", short: "전남·광주", area: "jn" },
  { name: "경상남도", short: "경남", area: "gn" },
  { name: "부산광역시", short: "부산", area: "bs" },
  { name: "제주특별자치도", short: "제주", area: "jj" },
] as const;

function scoreClass(score: number | null) {
  if (score === null) return "riskTileNoData";
  if (score >= 67) return "riskTileHigh";
  if (score >= 34) return "riskTileCaution";
  return "riskTileObserve";
}

function scoreFor(item: RegionalRiskItem | undefined, year: 2024 | 2026) {
  if (!item) return null;
  return year === 2024 ? item.score_2024 : item.score_2026;
}

function deltaLabel(delta: number | null) {
  if (delta === null) return "비교 불가";
  if (delta === 0) return "변화 없음";
  return `${delta > 0 ? "+" : ""}${delta}점`;
}

function RiskTileMap({
  data,
  onSelectRegion,
  selectedRegion,
  year,
}: {
  data: RegionalRiskResponse;
  onSelectRegion: (region: string) => void;
  selectedRegion: string | null;
  year: 2024 | 2026;
}) {
  const byName = new Map(data.regions.map((item) => [item.name, item]));

  return (
    <article className="riskMapYearCard" aria-labelledby={`risk-map-${year}-title`}>
      <div className="riskMapYearHeading">
        <span>{year}</span>
        <div>
          <h3 id={`risk-map-${year}-title`}>{year}년 상대위험도</h3>
          <p>같은 연도 안의 95백분위 표준화 점수</p>
        </div>
      </div>
      <div className="koreaTileMap" role="group" aria-label={`${year}년 시도별 상대위험도`}>
        {MAP_TILES.map((tile) => {
          const item = byName.get(tile.name);
          const score = scoreFor(item, year);
          const isSelected = selectedRegion === tile.name;
          return (
            <button
              aria-label={`${year}년 ${tile.name} 상대위험도 ${score === null ? "자료 없음" : `${score}점`}`}
              aria-pressed={isSelected}
              className={`riskTile mapArea-${tile.area} ${scoreClass(score)}${isSelected ? " isSelected" : ""}`}
              key={tile.name}
              onClick={() => onSelectRegion(tile.name)}
              type="button"
            >
              <span>{tile.short}</span>
              <strong>{score ?? "—"}</strong>
            </button>
          );
        })}
      </div>
    </article>
  );
}

export default function RegionalRiskMap({
  data,
  error,
  loading,
  onRetry,
  selectedRegion,
  onSelectRegion,
}: RegionalRiskMapProps) {
  const selected = data?.regions.find((item) => item.name === selectedRegion) ?? null;
  const comparableRegions = (data?.regions ?? []).filter((item) => item.delta !== null);
  const largestIncrease = [...comparableRegions]
    .filter((item) => (item.delta ?? 0) > 0)
    .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0))[0] ?? null;
  const largestDecrease = [...comparableRegions]
    .filter((item) => (item.delta ?? 0) < 0)
    .sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0))[0] ?? null;

  return (
    <section className="riskMapSection" id="risk-map" aria-busy={loading}>
      <div className="sectionHeading">
        <div>
          <span className="sectionNumber">02</span>
          <div>
            <p>REGIONAL RISK MAP</p>
            <h2>2024·2026 지역별 상대위험도</h2>
          </div>
        </div>
        <p>
          선택한 병해충과 작물 조건을 실제 연도별 CSV에서 계산해<br />
          같은 색상 구간으로 나란히 비교합니다.
        </p>
      </div>

      {loading ? (
        <div className="riskMapState" role="status">지역별 CSV 위험도를 불러오는 중입니다…</div>
      ) : error ? (
        <div className="riskMapState isError" role="alert">
          <b>지역 비교 자료를 불러오지 못했습니다.</b>
          <span>{error}</span>
          {onRetry && <button type="button" onClick={onRetry}>다시 시도</button>}
        </div>
      ) : data && data.regions.length > 0 ? (
        <>
          <div className="riskMapContext">
            <div><small>대상 병해충</small><strong>{data.pest}</strong></div>
            <div><small>작물</small><strong>{data.crop}</strong></div>
            <p id="tile-map-description">시도 위치를 단순화한 타일 지도입니다. 타일을 누르거나 Tab·Enter 키로 선택해 상세값을 확인하세요.</p>
          </div>
          <div className="riskInsightStrip" aria-label="지역 변화 핵심 요약">
            <article>
              <small>양년 직접 비교 가능</small>
              <strong>{comparableRegions.length}<span> / {data.regions.length}개 지역</span></strong>
              <p>두 연도 모두 조사 행이 있는 지역</p>
            </article>
            <article className="increase">
              <small>상대위험도 최대 상승</small>
              <strong>{largestIncrease ? largestIncrease.name : "—"}</strong>
              <p>{largestIncrease ? `▲ +${largestIncrease.delta}점` : "상승 지역 없음"}</p>
            </article>
            <article className="decrease">
              <small>상대위험도 최대 하락</small>
              <strong>{largestDecrease ? largestDecrease.name : "—"}</strong>
              <p>{largestDecrease ? `▼ ${largestDecrease.delta}점` : "하락 지역 없음"}</p>
            </article>
          </div>
          <div className="riskMapYearsGrid" aria-describedby="tile-map-description">
            <RiskTileMap data={data} onSelectRegion={onSelectRegion} selectedRegion={selectedRegion} year={2024} />
            <RiskTileMap data={data} onSelectRegion={onSelectRegion} selectedRegion={selectedRegion} year={2026} />
          </div>
          <div className="riskLegend" aria-label="상대위험도 범례">
            <span><i className="legendObserve" />관찰 0–33</span>
            <span><i className="legendCaution" />주의 34–66</span>
            <span><i className="legendHigh" />고위험 67–100</span>
            <span><i className="legendNoData" />자료 없음</span>
          </div>
          {selected ? (
            <article className="riskRegionDetail" aria-live="polite">
              <div className="riskRegionTitle">
                <div><small>선택 지역</small><h3>{selected.name}</h3></div>
                <strong className={selected.delta === null ? "deltaMuted" : selected.delta > 0 ? "deltaUp" : selected.delta < 0 ? "deltaDown" : "deltaFlat"}>
                  {deltaLabel(selected.delta)}
                </strong>
              </div>
              <div className="riskRegionMetrics">
                <div>
                  <span>2024</span><strong>{selected.score_2024 ?? "—"}</strong><small>{selected.score_2024 === null ? "자료 없음" : "점"}</small>
                  <p>관측 {selected.observations_2024.toLocaleString("ko-KR")}건 · 양성 {selected.positive_observations_2024.toLocaleString("ko-KR")}건</p>
                </div>
                <div>
                  <span>2026</span><strong>{selected.score_2026 ?? "—"}</strong><small>{selected.score_2026 === null ? "자료 없음" : "점"}</small>
                  <p>관측 {selected.observations_2026.toLocaleString("ko-KR")}건 · 양성 {selected.positive_observations_2026.toLocaleString("ko-KR")}건</p>
                </div>
              </div>
            </article>
          ) : (
            <div className="riskMapState">지도에서 상세 비교할 지역을 선택하세요.</div>
          )}
          <p className="riskMapFootnote">※ {data.note} 출처: {data.source}. 자료 없음은 0점과 구분합니다.</p>
        </>
      ) : (
        <div className="riskMapState">선택 조건에 비교 가능한 지역 자료가 없습니다. {onRetry && <button type="button" onClick={onRetry}>다시 시도</button>}</div>
      )}
    </section>
  );
}
