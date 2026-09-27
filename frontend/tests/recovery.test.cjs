const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const read=name=>fs.readFileSync(path.join(__dirname,'../app',name),'utf8');
function client(fetcher){
  const module={exports:{}};
  const compiled=ts.transpileModule(read('hero-bootstrap-client.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','exports','setTimeout',compiled)(()=>({boundedFetchJson:fetcher}),module.exports,fn=>{fn();return 0});
  return module.exports.fetchHeroBootstrap;
}
const condition={crop:'복숭아',pest:'복숭아순나방',region:'전체'};
const payload={complete:true,current:{id:'current'},featured:{id:'featured'},weather:{id:'weather'}};
test('shared deep analysis retries once, deduplicates consumers and caches only success',async()=>{
  let calls=0;
  const fetcher=client(async(url,signal,deadline)=>{assert.match(url,/hero-bootstrap/);assert.equal(deadline,25000);if(++calls===1)throw Error('HTTP 503');return payload;});
  const [a,b]=await Promise.all([fetcher('',condition),fetcher('',condition)]);
  assert.deepEqual(a,payload);assert.deepEqual(b,payload);assert.equal(calls,2);
  await fetcher('',condition);assert.equal(calls,2);
});
test('failed shared requests are evicted and can recover without reloading the page',async()=>{
  let fail=true,calls=0;
  const fetcher=client(async()=>{calls++;if(fail)throw Error('HTTP 503');return payload;});
  await assert.rejects(fetcher('',condition),/503/);assert.equal(calls,2);
  fail=false;assert.deepEqual(await fetcher('',condition),payload);assert.equal(calls,3);
});
test('partial bundles never become a fabricated completed result',async()=>{
  const fetcher=client(async()=>({...payload,weather:null}));
  await assert.rejects(fetcher('',condition),/누락/);
});
test('recommendation section precedes regional map and changed conditions trigger non-scrolling analysis',()=>{
  const page=read('page.tsx');
  assert.equal((page.match(/id="evidence"/g)||[]).length,1);
  assert.ok(page.indexOf('id="analysis-output"')<page.indexOf('id="evidence"'));
  assert.ok(page.indexOf('id="evidence"')<page.indexOf('<RegionalRiskMap'));
  assert.match(page,/runSimulation\(pest, crop, region, false\)/);
  assert.match(page,/if \(nextRegion === region\) return/);
  assert.ok(page.includes('현재 조건 다시 분석'));
});
test('missing evidence is collapsed, not removed or upgraded',()=>{
  const page=read('adoption-review.tsx');
  assert.match(page,/<details className=\{styles.step\}><summary>판정 이유/);
  assert.ok(page.includes('원래 판정:'));
  assert.ok(page.includes('review?.missing'));
});
