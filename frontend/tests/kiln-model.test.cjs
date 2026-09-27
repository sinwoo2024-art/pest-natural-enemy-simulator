const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../next.config.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function config(model) {
  const module = {exports:{}};
  new Function('module','exports','process',compiled)(module,module.exports,{env:{KILN_MODEL:model}});
  return module.exports.default;
}
test('Kiln model defaults to approved identifier and exposes no credential variables', () => {
  assert.deepEqual(config().env,{KILN_MODEL:'Qwen3-32B'});
  assert.deepEqual(config('Qwen3-32B').env,{KILN_MODEL:'Qwen3-32B'});
});
test('unsupported model configuration fails without echoing its value', () => {
  assert.throws(()=>config('unsupported-model'),error=>
    error.message.includes('KILN_MODEL must be Qwen3-32B') && !error.message.includes('unsupported-model'));
});
test('research screen explicitly says Kiln is pending, without a fake provider request', () => {
  const screen=fs.readFileSync(path.join(__dirname,'../app/research-analysis-lab.tsx'),'utf8');
  const notice=screen.match(/<aside aria-label="Kiln 연동 상태">([\s\S]*?)<\/aside>/)[1];
  assert.ok(notice.includes('process.env.KILN_MODEL'));
  assert.ok(notice.includes('Kiln 팀 계정 및 API 접근권한 대기 중'));
  assert.ok(notice.includes('연동 예정'));
  assert.doesNotMatch(notice,/fetch\(|tokens|energy|API_KEY/);
});
