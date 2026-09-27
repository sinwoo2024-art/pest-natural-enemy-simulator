const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const app=path.join(__dirname,'../app');
function load(file,overrides={}) {
  const source=fs.readFileSync(path.join(app,file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  const dep=name=>name in overrides?overrides[name]:name.endsWith('.css')?new Proxy({},{get:(_,key)=>key}):name==='../kiln-status'?{default:()=>null}:require(name);
  new Function('require','module','exports',code)(dep,module,module.exports);
  return module.exports.default;
}
test('finance SSR is pending, blank proposal, zero calls and no invented transaction',()=>{
  const Component=load('agent-finance/panel.tsx');
  const html=renderToStaticMarkup(React.createElement(Component,{context:{crop:'복숭아',pest:'복숭아순나방',region:'전체'}}));
  for(const text of ['KILN_NOT_CONFIGURED','Kiln 호출 횟수: 0','블록체인 실행: 없음','지정 테스트넷 정보 대기 중','총예산','1회 최대 지출액','구매 제안 생성','전체 에이전트 STOP','예산 초과 차단','미승인 판매처 차단','연동 대기']) assert.ok(html.includes(text),text);
  assert.ok(!html.includes('트랜잭션 성공'));
});
test('main and research import graphs cannot reach a proposal POST or provider',()=>{
  function walk(file,seen=new Set()) {
    if(seen.has(file)) return ''; seen.add(file);
    const src=fs.readFileSync(file,'utf8');
    const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let all=src;
    for(const node of ast.statements) if(ts.isImportDeclaration(node)) {
      const name=node.moduleSpecifier.text;
      if(name.startsWith('.')) for(const ext of ['.tsx','.ts','/index.tsx']) {
        const target=path.resolve(path.dirname(file),name+ext);
        if(fs.existsSync(target)){all+='\n'+walk(target,seen);break;}
      }
    }
    return all;
  }
  for(const file of ['page.tsx','research-analysis-lab.tsx']) {
    const all=walk(path.join(app,file));
    assert.doesNotMatch(all,/\/api\/agent-finance\/review|KILN_API_KEY|KILN_API_BASE_URL/);
  }
  const research=fs.readFileSync(path.join(app,'research-analysis-lab.tsx'),'utf8');
  assert.match(research,/financeHref=\{`\/agent-finance\?/);
});
test('status mounts and selection remounts only fetch read-only status', async()=>{
  const requests=[]; const effects=[];
  const Component=load('kiln-status.tsx',{react:{...React,useEffect(fn){effects.push(fn)},useState(v){return[v,()=>{}]}}});
  const saved=global.fetch;
  global.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>({configured:false,connection_verified:false,last_call_success:null})}};
  try {
    for(let i=0;i<4;i++) Component({apiBase:''});
    const cleanups=effects.map(fn=>fn());
    await new Promise(resolve=>setImmediate(resolve));
    cleanups.forEach(fn=>fn());
    assert.equal(requests.length,4);
    for(const req of requests){assert.equal(req.url,'/api/kiln/status');assert.equal(req.options.method,undefined);}
  } finally {global.fetch=saved;}
});
test('finance proposal POST is event-only and STOP aborts stale responses',()=>{
  const src=fs.readFileSync(path.join(app,'agent-finance/panel.tsx'),'utf8');
  assert.doesNotMatch(src,/useEffect|KILN_API_KEY|KILN_API_BASE_URL/);
  assert.match(src,/onClick=\{\(\) => act\("generate"\)/);
  assert.match(src,/controller.current\?\.abort\(\)/);
  assert.match(src,/sequence !== generation.current/);
  assert.match(src,/stopLatch.current = true/);
});

test('actual button handlers send no request on render, and STOP wins over a late response',async()=>{
  const states=[];
  const Component=load('agent-finance/panel.tsx',{react:{...React,
    useState(value){const index=states.length;states.push(value);return[value,next=>{states[index]=typeof next==='function'?next(states[index]):next}]},
    useRef(value){return{current:value}}}});
  const calls=[];let releaseGenerate;
  const saved=global.fetch;
  global.fetch=(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body,signal:options.signal});
    if(body.action==='generate') return new Promise(resolve=>{releaseGenerate=()=>resolve({ok:true,json:async()=>({status:'STOP',code:'KILN_NOT_CONFIGURED',message:'test-only'})})});
    return Promise.resolve({ok:true,json:async()=>({status:'STOP',code:'AGENT_STOPPED',message:'test-only'})});
  };
  function find(node,label){
    if(!node||typeof node!=='object')return null;
    if(node.type==='button'&&node.props.children===label)return node;
    for(const child of React.Children.toArray(node.props?.children)){const match=find(child,label);if(match)return match;}
    return null;
  }
  try {
    const tree=Component({context:{crop:'',pest:'',region:''}});
    assert.equal(calls.length,0);
    const generating=find(tree,'구매 제안 생성').props.onClick();
    assert.equal(calls.length,1);
    await find(tree,'전체 에이전트 STOP').props.onClick();
    assert.equal(calls[0].signal.aborted,true);
    releaseGenerate();await generating;
    assert.equal(states[1].code,'AGENT_STOPPED');
    await find(tree,'구매 승인').props.onClick();
    assert.equal(calls.length,2);
    assert.ok(calls.every(call=>call.url==='/api/agent-finance/review'));
  } finally {global.fetch=saved;}
});
