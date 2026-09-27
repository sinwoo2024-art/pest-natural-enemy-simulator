const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file, overrides={}) {
  const source=fs.readFileSync(path.join(__dirname,'../app',file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  const dependency=name=>name in overrides?overrides[name]:name.endsWith('.css')?new Proxy({},{get:(_,key)=>key}):name==='./threshold-inputs'?load('threshold-inputs.tsx',{},true):name==='./risk-trend-chart'?{default:()=>null}:name==='./bounded-fetch'?{}:name==='./browser-actions'?{}:require(name);
  new Function('require','module','exports',code)(dependency,module,module.exports);
  return arguments[2]?module.exports:module.exports.default;
}
test('landscape renders seven steps and unknown/default input without fake density or threshold',()=>{
  const Component=load('landscape-review.tsx');
  const html=renderToStaticMarkup(React.createElement(Component,{apiBase:'',crop:'고추',pest:'점박이응애',region:'전체'}));
  assert.equal((html.match(/<h3>/g)||[]).length,8);
  assert.ok(html.includes('경관조사 우선'));
  assert.ok(html.includes('공식 경제적 피해기준 미확보'));
  assert.ok(html.includes('사용자 가정값'));
  assert.ok(html.includes('단기 예찰·기상 연계 탐색 결과'));
  assert.ok(html.includes('해충에도 유리'));
  assert.ok(html.includes('조사일'));
  assert.equal((html.match(/<select/g)||[]).length,13);
  assert.ok(!html.includes('value="0"'));
});
test('smartfarm shows separated track even before data arrives and has no adoption dependency',()=>{
  const Component=load('smartfarm-release-window.tsx');
  const html=renderToStaticMarkup(React.createElement(Component,{apiBase:'',crop:'고추',pest:'점박이응애',region:'전체'}));
  assert.ok(html.includes('스마트팜 확장 연구 트랙'));
  assert.ok(html.includes('최적 방사 시점을 추정하지 않습니다'));
  const source=fs.readFileSync(path.join(__dirname,'../app/smartfarm-release-window.tsx'),'utf8');
  assert.ok(!source.includes('useAdoptionReview'));
  assert.ok(!source.includes('/api/decision-support'));
  assert.ok(source.includes('/api/smartfarm/evidence'));
});
test('landscape errors show retry, not a previously valid recommendation',()=>{
  let state=0;
  const body=JSON.stringify({crop:'고추',pest:'점박이응애',region:'전체',enemy_name:null,field:{cultivation:'미확인',edge_vegetation:'미확인',flowers:'미확인',refuge:'미확인',woody_border:'미확인',land_use:'미확인',recent_mowing:'미확인',nonselective_insecticide:'미확인',pest_survey:'미확인',enemy_observed:'미확인',density:null,method:'',unit:'',survey_date:null,assumed_threshold:null,assumed_threshold_unit:''}});
  const Component=load('landscape-review.tsx',{react:{...React,useState(initial){state++;return [state===4?{key:updatedBody,message:'HTTP 503'}:typeof initial==='function'?initial():initial,()=>{}];}}});
  const initial=JSON.parse(body);
  Object.assign(initial.field,{site_name:'',sample_size:null,sample_unit:'',enemy_count:null,last_spray_date:null});
  const {EMPTY_CRITERION,EMPTY_EIL}=load('threshold-inputs.tsx',{},true);
  const updatedBody=JSON.stringify({...initial,threshold_mode:'direct',criterion:EMPTY_CRITERION,eil:EMPTY_EIL});
  const html=renderToStaticMarkup(React.createElement(Component,{apiBase:'',crop:'고추',pest:'점박이응애',region:'전체'}));
  assert.ok(html.includes('HTTP 503'));assert.ok(html.includes('다시 시도'));assert.ok(!html.includes('<strong>현장 실증 후보'));
});

test('EIL input exposes variables and units without default numeric assumptions',()=>{
  const {default:Component,EMPTY_CRITERION,EMPTY_EIL}=load('threshold-inputs.tsx',{},true);
  const html=renderToStaticMarkup(React.createElement(Component,{criterion:EMPTY_CRITERION,eil:EMPTY_EIL,mode:'eil',onCriterion:()=>{},onEil:()=>{},onMode:()=>{}}));
  assert.ok(html.includes('EIL = C / (V × I × D × K)'));
  assert.ok(html.includes('EIL 계산 근거 부족'));
  assert.equal((html.match(/type="number"/g)||[]).length,5);
  assert.ok(!html.includes('value="0"'));
  assert.ok(html.includes('경제적 방제수준(ET)'));
});
