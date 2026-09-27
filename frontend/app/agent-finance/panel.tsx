"use client";

import { useRef, useState } from "react";
import KilnStatusNotice from "../kiln-status";
import styles from "./panel.module.css";

type Action = "generate" | "approve" | "reject" | "stop";
type Scenario = "user" | "normal" | "over_budget" | "unapproved_seller";
type Audit = { audit_id: string; created_at: string; action: Action; scenario: Scenario;
  checks: Record<string, boolean | null>; final_state: string; kiln_call_count: number };
type Result = { status: string; code: string; message: string; audit?: Audit; demo_notice?: string };
const initial: Result = { status: "STOP", code: "KILN_NOT_CONFIGURED", message: "Kiln 팀 계정 및 API 접근권한을 기다리고 있습니다." };
const checkLabels: Record<string, string> = { budget: "총예산", max_spend: "1회 지출 한도", seller: "허용 판매처", item: "허용 품목", deadline: "구매 기한", evidence: "천적 직접근거", human_approval: "사람 최종 승인", not_stopped: "STOP 해제" };
const resultFields = ["제안 품목", "판매처", "금액", "수수료", "수수료 포함 총액", "선택 이유", "사용된 농업 근거", "근거 등급", "남은 예산", "불확실성"];

export default function FinancePanel({ context }: { context: { crop: string; pest: string; region: string } }) {
  const [policy, setPolicy] = useState({ budget: "", max_spend: "", fee: "", sellers: "", items: "", deadline: "", forbid_auto_purchase: true, require_human_approval: true });
  const [result, setResult] = useState<Result>(initial);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [busy, setBusy] = useState(false);
  const [halted, setHalted] = useState(false);
  const session = useRef("");
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const stopLatch = useRef(false);
  const update = (key: string, value: string | boolean) => setPolicy(previous => ({ ...previous, [key]: value }));

  async function act(action: Action, scenario: Scenario = "user") {
    if (stopLatch.current && action !== "stop") return;
    if (action === "stop" || action === "reject") {
      stopLatch.current = true;
      setHalted(true);
      setResult({ status: "STOP", code: action === "stop" ? "AGENT_STOPPED" : "USER_REJECTED", message: "즉시 중단했습니다. 감사 기록 저장을 확인하고 있습니다." });
    }
    controller.current?.abort();
    const sequence = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    if (!session.current) session.current = crypto.randomUUID();
    setBusy(true);
    const timeout = setTimeout(() => abort.abort(), 10000);
    try {
      const list = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
      // Stop/reject must work even if current form input is invalid.
      const body = { session_id: session.current, action, scenario,
        policy: action === "stop" || action === "reject" ? {} : {
          ...policy, budget: policy.budget || null, max_spend: policy.max_spend || null,
          fee: policy.fee || null, sellers: list(policy.sellers), items: list(policy.items),
          deadline: policy.deadline ? new Date(policy.deadline).toISOString() : null,
        } };
      const response = await fetch("/api/agent-finance/review", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
      if (!response.ok) throw new Error("review unavailable");
      const payload: Result = await response.json();
      if (sequence !== generation.current) return;
      setResult(payload);
      if (payload.audit) setAudits(previous => [payload.audit!, ...previous].slice(0, 20));
    } catch {
      if (sequence === generation.current) setResult({ status: "STOP", code: stopLatch.current ? "AGENT_STOPPED" : "REQUEST_FAILED",
        message: "실행은 차단되어 있습니다. 요청 또는 감사 기록 저장을 확인하지 못했습니다. 연결과 입력값을 확인해 주세요." });
    } finally {
      clearTimeout(timeout);
      if (sequence === generation.current) setBusy(false);
    }
  }

  return <main className={styles.page}>
    <a href="/">← 공생AI 분석으로 돌아가기</a>
    <header className={styles.header}><span>AGENT FINANCE · PREPARATION ONLY</span>
      <h1>구매 승인 에이전트 준비화면</h1>
      <p>실제 금융서비스가 아닙니다. 실제 구매·결제·Kiln 추론·블록체인 실행은 아직 연결되지 않았습니다.</p>
      <KilnStatusNotice />
      <strong>지정 테스트넷 정보 대기 중</strong>
    </header>

    <section className={styles.card}><h2>농업 근거 전달 영역</h2>
      <p>선택 조건만 전달됩니다. 추가 근거는 검증된 원본 연결 전까지 자료 없음으로 유지합니다. NCPMS 상대위험을 실제 밀도나 구매 필요성으로 변환하지 않습니다.</p>
      <dl className={styles.grid}>
        {[ ["작물", context.crop], ["병해충", context.pest], ["지역", context.region],
          ["NCPMS 상대위험 신호", ""], ["실제 밀도 입력값", ""], ["추천 천적", ""], ["천적 근거 등급", ""], ["근거 출처", ""],
          ["불확실성", "직접 적용 가능성 미검증"], ["자료 부족 항목", "밀도·직접근거·가격·공식 공급처 검증 필요"] ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "자료 없음 · 전달 인터페이스 준비"}</dd></div>)}
      </dl>
    </section>

    <section className={styles.card}><h2>사용자 구매 조건</h2><p>비밀번호·API 키·개인정보를 입력하지 마세요. 금액 단위는 원이며 수수료도 직접 입력합니다.</p>
      <div className={styles.grid}>
        {([ ["budget", "총예산"], ["max_spend", "1회 최대 지출액"], ["fee", "예상 수수료"] ] as const).map(([key, label]) => <label key={key}>{label} (원)<input type="number" min="0" max="1000000000000" step="0.01" value={policy[key]} disabled={halted} onChange={event => update(key, event.target.value)} /></label>)}
        <label>구매 기한 (현지 시간)<input type="datetime-local" value={policy.deadline} disabled={halted} onChange={event => update("deadline", event.target.value)} /></label>
        <label>허용 판매처 목록<textarea placeholder="한 줄에 하나씩 입력" value={policy.sellers} disabled={halted} onChange={event => update("sellers", event.target.value)} /></label>
        <label>구매 가능한 천적·방제자재 목록<textarea placeholder="한 줄에 하나씩 입력" value={policy.items} disabled={halted} onChange={event => update("items", event.target.value)} /></label>
      </div>
      <label className={styles.check}><input type="checkbox" checked={policy.forbid_auto_purchase} disabled={halted} onChange={event => update("forbid_auto_purchase", event.target.checked)} />자동 구매 금지</label>
      <label className={styles.check}><input type="checkbox" checked={policy.require_human_approval} disabled={halted} onChange={event => update("require_human_approval", event.target.checked)} />사람의 최종 승인 필요</label>
      <p>체크 해제 여부와 무관하게 현재 자동 구매는 비활성화되며, 사람의 최종 승인 없는 실행은 항상 금지됩니다.</p>
      <div className={styles.actions}>
        <button disabled={busy || halted} onClick={() => act("generate")}>구매 제안 생성</button>
        <button disabled={busy || halted} onClick={() => act("approve")}>구매 승인</button>
        <button disabled={halted} onClick={() => act("reject")}>구매 거절</button>
        <button className={styles.stop} onClick={() => act("stop")}>전체 에이전트 STOP</button>
      </div>
      <p>승인 버튼도 실제 제안이 없으면 차단됩니다. STOP·거절 후에는 이 세션에서 재개할 수 없습니다.</p>
    </section>

    <section className={styles.card}><h2>일반 코드 규칙 데모</h2><p>규칙 검사용 입력: 예산·1회 한도 100원, 수수료 5원, 품목 금액 90원. 실제 판매·AI 제안이 아닙니다. 예산 초과는 금액 101원, 미승인 판매처는 허용 목록 밖으로 검사합니다. 정상 시나리오도 Kiln 미연결로 중단됩니다.</p>
      <div className={styles.actions}>{([ ["normal", "정상 시나리오"], ["over_budget", "예산 초과 차단"], ["unapproved_seller", "미승인 판매처 차단"] ] as const).map(([scenario, label]) => <button key={scenario} disabled={busy || halted} onClick={() => act("generate", scenario)}>{label}</button>)}</div>
    </section>

    <section className={styles.card} aria-live="polite"><h2>구매 제안 결과 · 연동 대기</h2>
      <div className={styles.status}><strong>{result.status} · {result.code}</strong><p>{result.message}</p><p>Kiln 호출 횟수: 0 · 블록체인 실행: 없음</p><p>{result.demo_notice}</p></div>
      <dl className={styles.grid}>{resultFields.map(label => <div key={label}><dt>{label}</dt><dd>연동 대기</dd></div>)}<div><dt>최종 상태</dt><dd>{result.status}</dd></div></dl>
    </section>

    <section className={styles.card}><h2>구매 에이전트 감사 기록</h2><p>실제 사용자 행동·규칙 검사만 기록합니다. Kiln 호출 여부: 아니오 · 토큰 사용량: 제공되지 않음 · 블록체인 실행: 없음.</p>
      <p>서버 로컬에 저장하며 화면에는 이번 방문의 최근 20건을 표시합니다. 자유입력 목록은 원문 대신 해시·개수로 보관합니다.</p>
      {audits.length === 0 ? <p>아직 기록된 행동이 없습니다.</p> : audits.map(audit => <article key={audit.audit_id} className={styles.audit}><strong>{audit.final_state}</strong><p>{audit.action} · {audit.scenario} · {audit.created_at}</p><small>감사 ID: {audit.audit_id}</small>
        <ul>{Object.entries(audit.checks).map(([key, value]) => <li key={key}>{checkLabels[key] || key}: {value === null ? "자료 없음" : value ? "통과" : "차단"}</li>)}</ul>
      </article>)}
    </section>
  </main>;
}
