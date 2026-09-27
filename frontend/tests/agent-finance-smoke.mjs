import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
async function get(path) {
  const r = await fetch(base + path, {signal: AbortSignal.timeout(30000), cache:'no-store'});
  assert.equal(r.status,200,path); return r;
}
const home = await (await get('/')).text();
assert.ok(home.includes('구매 승인 에이전트 준비화면'));
assert.ok(home.includes('/agent-finance?'));
const html = await (await get('/agent-finance?crop='+encodeURIComponent('복숭아'))).text();
for (const label of ['구매 제안 생성','전체 에이전트 STOP','지정 테스트넷 정보 대기 중','Kiln 호출 횟수: 0','복숭아']) assert.ok(html.includes(label),label);
const status = await (await get('/api/kiln/status')).json();
assert.equal(status.callable,false);
assert.equal(status.connection_verified,false);
assert.equal(status.model,'Qwen3-32B');
async function action(session, action, scenario='user') {
  const response = await fetch(base+'/api/agent-finance/review',{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
    body:JSON.stringify({session_id:session, action, scenario})});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.status,'STOP');assert.equal(data.kiln_call_count,0);
  assert.equal(data.blockchain_execution,'없음');assert.equal(data.proposal,null);
  assert.equal(data.payment_allowed,false);assert.equal(data.audit.tokens,'제공되지 않음');
  assert.equal(data.audit.kiln_called,false);assert.ok(data.audit.audit_id);
  return data;
}
for(const [scenario,code] of [['normal',status.code],['over_budget','RULE_BUDGET'],['unapproved_seller','RULE_SELLER']]) {
  assert.equal((await action(randomUUID(),'generate',scenario)).code,code);
}
const session=randomUUID();
assert.equal((await action(session,'approve')).code,'NO_VERIFIED_PROPOSAL');
assert.equal((await action(session,'stop')).code,'AGENT_STOPPED');
assert.equal((await action(session,'generate')).code,'AGENT_STOPPED');
console.log('PASS: public finance HTML/status, three rule scenarios, approval guard, persistent STOP; Kiln=0, blockchain=none');
