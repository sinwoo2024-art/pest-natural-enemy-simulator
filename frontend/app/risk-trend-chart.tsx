type Point = { round: number; score: number };

// A fixed viewBox renders on the server too: no measured container or hydration required.
export default function RiskTrendChart({ data }: { data: Point[] }) {
  const points = data.filter((p) => Number.isFinite(p.round) && Number.isFinite(p.score))
    .slice().sort((a, b) => a.round - b.round);
  if (!points.length) return <div className="noChart">선택 조건의 예찰 시계열 자료가 없습니다.</div>;
  const first = Math.min(1, points[0].round);
  const last = Math.max(8, points[points.length - 1].round);
  const x = (round: number) => 40 + (round - first) / (last - first) * 620;
  const y = (score: number) => 210 - Math.max(0, Math.min(100, score)) * 1.8;
  const line = points.map((p) => `${x(p.round)},${y(p.score)}`).join(" ");
  return (
    <svg viewBox="0 0 700 250" role="img" aria-label={`조사회차별 상대 위험도: ${points.map((p) => `${p.round}회 ${p.score}점`).join(", ")}`} style={{ display: "block", width: "100%", height: "100%" }}>
      {[0, 25, 50, 75, 100].map((score) => <g key={score}>
        <line x1="40" x2="660" y1={y(score)} y2={y(score)} stroke="#e5e9e3" />
        <text x="30" y={y(score) + 4} textAnchor="end" fontSize="12" fill="#69756d">{score}</text>
      </g>)}
      <polygon points={`${x(points[0].round)},210 ${line} ${x(points[points.length - 1].round)},210`} fill="#df6f2b" fillOpacity="0.16" />
      <polyline points={line} fill="none" stroke="#d96522" strokeWidth="3" strokeLinejoin="round" />
      {points.map((p) => <g key={p.round}>
        <circle cx={x(p.round)} cy={y(p.score)} r="4" fill="#d96522"><title>{`${p.round}회: ${p.score}점`}</title></circle>
        <text x={x(p.round)} y={y(p.score) - 10} textAnchor="middle" fontSize="12" fill="#9b481c">{p.score}</text>
        <text x={x(p.round)} y="235" textAnchor="middle" fontSize="12" fill="#69756d">{p.round}회</text>
      </g>)}
    </svg>
  );
}
