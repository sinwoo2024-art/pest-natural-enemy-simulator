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
