const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function component(file, overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../app', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const load = (name) => name in overrides ? overrides[name] : name.endsWith('.css') ? new Proxy({}, { get: (_, key) => key }) : require(name);
  new Function('require', 'module', 'exports', compiled)(load, module, module.exports);
  return module.exports.default;
}

test('risk graph renders real points on server, including zero and a single round', () => {
  const Chart = component('risk-trend-chart.tsx');
  for (const data of [[{round:1,score:0},{round:2,score:70}], [{round:3,score:0}]]) {
    const html = renderToStaticMarkup(React.createElement(Chart, { data }));
    assert.match(html, /<polyline/);
    assert.match(html, /<circle/);
    assert.match(html, /viewBox="0 0 700 250"/);
    for (const point of data) assert.ok(html.includes(`${point.round}회: ${point.score}점`));
  }
});

test('empty or invalid trend is explicit, not a fabricated zero curve', () => {
  const Chart = component('risk-trend-chart.tsx');
  for (const data of [[], [{ round: 1, score: NaN }]]) {
    const html = renderToStaticMarkup(React.createElement(Chart, { data }));
    assert.ok(html.includes('예찰 시계열 자료가 없습니다'));
    assert.ok(!html.includes('<polyline'));
  }
});

function renderReview(review = null, extra = {}) {
  const fields = ['untreated_loss','saved_control','enemy_cost','labor_cost','monitoring_cost','other_cost','effect_low','effect_base','effect_high'];
  const Component = component('adoption-review.tsx', { './adoption-review-context': {
    ECONOMIC_FIELDS: fields.map(key => [key, key, key.startsWith('effect_') ? '%' : '원']),
    useAdoptionReview: () => ({ review, economics: Object.fromEntries(fields.map(key=>[key,null])),
      field: { temperature:null,humidity:null,environment:'unknown',rainfall:'unknown',wind:'unknown',chemical_residue:'unknown',pest_observed:false,crop_stage_checked:false },
      cultivationMode:'미확인',enemyName:null,enemies:[],loading:false,error:null, ...extra }),
  }});
  return renderToStaticMarkup(React.createElement(Component));
}

test('initial review shows all 8 stages, all inputs, and never highlights +0 won', () => {
  const html = renderReview();
  assert.ok(html.includes('경제성 입력 필요'));
  assert.ok(!html.includes('+0원'));
  assert.equal((html.match(/<h4>/g) ?? []).length, 8);
  assert.equal((html.match(/type="number"/g) ?? []).length, 11);
  assert.ok(html.includes('사용자 가정값'));
  assert.ok(html.includes('약제 잔효'));
});

test('each decision is displayed with its reason and a non-command notice', () => {
  for (const status of ['자료 부족','현장 적용 검토 보류','경제성 낮음','현장 실증 필요','도입 검토 후보']) {
    const html = renderReview({ status, reason:'시험용 판단 사유', missing:['추가 현장자료'], decision_notice:'실제 방사 명령이 아닙니다.', disclaimer:'사용자 가정 시나리오',
      tracks: { surveillance:{score:99,level:'고위험',action:'예찰 강화',meaning:'피해확률 아님'},
        evidence:{checks:{},official:{},reported_points:[],grade:'부분 근거',source_grade:null},
        economics:{complete:false,status:'경제성 입력 필요',formulas:{},rounding:'원 단위 반올림'} } });
    assert.ok(html.includes(status)); assert.ok(html.includes('시험용 판단 사유'));
    assert.ok(html.includes('실제 방사 명령이 아닙니다.'));
  }
});

test('network failures expose retry and do not fabricate a candidate', () => {
  const html = renderReview(null, {error:'HTTP 503',retry:()=>{}});
  assert.ok(html.includes('HTTP 503'));assert.ok(html.includes('다시 계산'));
  assert.ok(!html.includes('<strong>도입 검토 후보</strong>'));
});
