const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const mod = {exports:{}};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/bounded-fetch.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports',source)(mod.exports);
const {boundedFetchJson} = mod.exports;

test('bounded POST preserves the body and times out the same as GET', async () => {
  const original=global.fetch;
  try {
    global.fetch=async (url,init)=>{assert.equal(init.method,'POST');assert.equal(init.body,'{"field":{}}');assert.equal(init.cache,'no-store');return {ok:true,json:async()=>({status:'경관조사 우선'})};};
    assert.equal((await boundedFetchJson('/api/landscape-review',undefined,100,{method:'POST',body:'{"field":{}}'})).status,'경관조사 우선');
  } finally {global.fetch=original;}
});

test('unresponsive transport times out and a subsequent retry succeeds', async () => {
  const original = global.fetch;
  try {
    global.fetch = () => new Promise(()=>{});
    await assert.rejects(boundedFetchJson('/test',undefined,20), /제한시간 초과/);
    global.fetch = async () => ({ok:true,json:async()=>({points:[]})});
    assert.deepEqual(await boundedFetchJson('/test',undefined,100), {points:[]});
  } finally {global.fetch=original;}
});
test('timeout also covers stalled response body', async () => {
  const original = global.fetch;
  try {
    global.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
    await assert.rejects(boundedFetchJson('/test',undefined,20), /제한시간 초과/);
  } finally {global.fetch=original;}
});
test('HTTP and invalid JSON failures reject without false empty-data success', async () => {
  const original=global.fetch;
  try {
    global.fetch=async()=>({ok:false,status:503});
    await assert.rejects(boundedFetchJson('/test'), /503/);
    global.fetch=async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid JSON');}});
    await assert.rejects(boundedFetchJson('/test'), /invalid JSON/);
  } finally {global.fetch=original;}
});
test('selection change cancellation is distinct from timeout', async () => {
  const original=global.fetch;
  try {
    global.fetch=()=>new Promise(()=>{});
    const controller=new AbortController();
    const pending=boundedFetchJson('/test',controller.signal,100);
    controller.abort();
    await assert.rejects(pending, {name:'AbortError'});
  } finally {global.fetch=original;}
});
