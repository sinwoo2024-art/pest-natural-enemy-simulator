import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const condition = { crop: '복숭아', pest: '복숭아순나방', region: '전체' };
async function json(path, payload) {
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(60000),
    ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
  });
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return response.json();
}

const missing = await json('/api/adoption-review', condition);
assert.equal(missing.status, '자료 부족');
assert.equal(missing.tracks.economics.status, '경제성 입력 필요');
assert.equal(missing.tracks.evidence.generalized_effect_percent, null);
assert.equal(missing.automatic_release, false);
assert.ok(missing.tracks.evidence.references.some(ref => ref.url.includes('pubmed.ncbi.nlm.nih.gov')));
assert.ok(!missing.missing.includes('근거 원문 출처 미확보'));
const held = await json('/api/adoption-review', { ...condition, field: { wind: 'adverse' } });
assert.equal(held.status, '현장 적용 검토 보류');
assert.equal(held.tracks.surveillance.score, missing.tracks.surveillance.score);
assert.equal(held.tracks.environment.risk_adjustment_applied, false);
console.log('PASS: public adoption tracks, missing inputs, adverse-condition hold');

const query = new URLSearchParams(condition);
const simulation = await json(`/api/simulate?${query}`);
assert.ok(simulation.trend.length > 0);
assert.ok(simulation.recommendations.length > 0);
const regional = await json(`/api/region-risk-comparison?${query}`);
assert.ok(regional.regions.length > 0);
const forecast = await json(`/api/forecast/2027?${query}`);
assert.ok('forecast_score' in forecast);
const smartfarm = await json(`/api/smartfarm/evidence?${query}`);
assert.equal(smartfarm.claim_boundary.economic_causal_effect, false);
assert.equal(smartfarm.claim_boundary.ncpms_score_combined, false);
assert.equal(smartfarm.claim_boundary.facility_pest_density, null);
assert.equal(smartfarm.claim_boundary.facility_release_density, null);
assert.equal(smartfarm.claim_boundary.optimal_release_timing, null);
assert.equal(smartfarm.official_summary.farm_count, 238);
assert.equal(smartfarm.official_summary.farm_season_rows, 651);
const landscape = await json('/api/landscape-review', condition);
assert.equal(landscape.status, '경관조사 우선');
assert.equal(landscape.surveillance.score, simulation.risk_score);
assert.deepEqual(landscape.surveillance.trend, simulation.trend);
assert.equal(landscape.density.value, null);
assert.equal(landscape.threshold.official_value, null);
assert.equal(landscape.threshold.eil, null);
assert.equal(landscape.automatic_action, false);
assert.equal(landscape.threshold.eil_result.status, 'EIL 계산 근거 부족');
assert.ok(Array.isArray(landscape.weather.points));
const eilInput = { C:100,V:10,I:2,D:0.5,K:0.5,C_unit:'원/m²',V_unit:'원/kg',I_unit:'cm²/마리',D_unit:'kg/cm²',K_unit:'비율(0~1)' };
const scenario = await json('/api/landscape-review', {...condition, threshold_mode:'eil', eil:eilInput});
assert.equal(scenario.threshold.eil, 20);
assert.equal(scenario.threshold.official_value, null);
assert.equal(scenario.status, '경관조사 우선');
const incompatible = await json('/api/landscape-review', {...condition, threshold_mode:'eil', eil:{...eilInput,D_unit:'kg/피해단위'}});
assert.equal(incompatible.threshold.eil, null);
console.log('PASS: compatible EIL only, missing landscape cannot be promoted, weather separate');
assert.equal((await json('/api/options')).pests.length, 190);
console.log('PASS: landscape survey-first, no inferred density/EIL, 190 pests and separate smartfarm track');
console.log('PASS: simulation trend, recommendations, regional comparison, forecast, separate smartfarm evidence');

// Prewarm the two reference analyses before the short bootstrap bundle deadline.
await json(`/api/analysis/judge-impact?${query}`);
await json(`/api/analysis/judge-impact?${new URLSearchParams({crop:'고추',pest:'점박이응애',region:'전체'})}`);
const hero = await json('/api/hero-bootstrap?review=v1');
assert.equal(hero.complete, true);
assert.equal(hero.current.natural_enemy_focus.release_ready, false);
assert.equal(hero.current.headline_metrics.release_state, '자료 부족');
for (let i = 0; i < 2; i++) {
  const page = await fetch(base, { signal: AbortSignal.timeout(60000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('천적 도입 타당성'));
  assert.ok(html.includes('어디서 · 어떤 조건에서 · 어떤 천적'));
  assert.ok(html.includes('viewBox="0 0 700 250"'));
  assert.ok(html.includes('id="adoption-review"'));
  assert.ok(html.includes('id="landscape-review"'));
  const cover = html.match(/<section class="hero" id="overview">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(cover?.includes('60초 의사결정 레이더'));
  assert.ok(cover.includes('핵심 · 노지 위험·경관관리'));
  assert.ok(cover.includes('시설·스마트팜 · 환경·생육·작기 분석'));
  assert.ok(cover.includes('향후 확장 · 시설 해충밀도·천적효과 검증'));
  assert.ok(!cover.includes('핵심 분석 트랙: 노지'));
  assert.ok(!cover.includes('NCPMS 노지 예찰자료와 기상자료로'));
  assert.ok(!cover.includes('핵심 트랙: 노지 경관관리'));
  assert.ok(html.includes('현재 NCPMS 분석기간만으로 장기 기후변화'));
  assert.ok(html.includes('경제적 기준 검토 방식'));
  assert.ok(html.includes('천적 보호 경관관리'));
  assert.ok(html.includes('스마트팜 확장 연구 트랙'));
  assert.ok(!html.includes('next-devtools'));
  assert.ok(!html.includes('방사 검토창 열림'));
  if (i === 0) {
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(url => url.startsWith('/_next/'));
    const results = await Promise.all(scripts.map(async url => (await fetch(base + url, { signal: AbortSignal.timeout(30000) })).status));
    assert.ok(results.length > 0 && results.every(status => status === 200));
    console.log(`PASS: ${results.length} production script assets`);
  }
}
console.log('PASS: two public HTML responses contain the graph and new review, no old release claim');
