const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../app/hero-track-summary.module.css'), 'utf8');
const cover = source.split('<div className="heroContent">')[1].split('<div className="heroScanner">')[0];

test('cover keeps heading and CTA and has exactly three non-interactive track rows', () => {
  assert.ok(cover.includes('<h1>노지 병해충 위험을 읽고,<br /><em>천적 보호 경관관리</em>를 <span className={heroTrackStyles.predicate}>검토합니다.</span></h1>'));
  assert.match(css, /\.predicate\s*\{\s*white-space:\s*nowrap;\s*\}/);
  assert.ok(cover.includes('<a className="primaryButton" href="#judge-impact">60초 의사결정 레이더 <ArrowRight size={18} /></a>'));
  const summary = cover.match(/<ul[^>]*aria-label="분석 트랙 요약"[^>]*>([\s\S]*?)<\/ul>/)[1];
  assert.deepEqual([...summary.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(m => m[1]), [
    '핵심 · 노지 위험·경관관리', '시설·스마트팜 · 환경·생육·작기 분석', '향후 확장 · 시설 해충밀도·천적효과 검증',
  ]);
  assert.doesNotMatch(summary, /<(?:a|button|nav)\b/);
  assert.doesNotMatch(cover, /핵심 분석 트랙: 노지|NCPMS 노지 예찰자료와 기상자료로/);
});

test('summary styling is scoped, vertical and wrapping without clipping or hero/CTA overrides', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /white-space:\s*normal/);
  assert.match(css, /\.summary > \.primary\s*\{\s*color:\s*#f1a264;/);
  assert.doesNotMatch(css.replace(/\.predicate\s*\{[^}]*\}/, ''), /overflow:\s*hidden|white-space:\s*nowrap|text-overflow|\.heroScanner|\.primaryButton|position:\s*absolute/);
});
