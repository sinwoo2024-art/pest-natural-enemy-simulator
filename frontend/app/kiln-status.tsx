"use client";

import { useEffect, useState } from "react";

type KilnStatus = { configured: boolean; model: string; connection_verified: boolean;
  callable: boolean; last_call_success: boolean | null; last_error_summary: string | null };

export default function KilnStatusNotice({ apiBase = "", financeHref }: { apiBase?: string; financeHref?: string }) {
  const [status, setStatus] = useState<KilnStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Read-only status. Never requests a proposal or consumes model tokens.
    fetch(`${apiBase}/api/kiln/status`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("status"); return response.json(); })
      .then(value => { if (active) setStatus(value); })
      .catch(() => { if (active) setError(true); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [apiBase]);
  return <aside aria-label="Kiln 연동 상태" style={{ padding: "16px 0", lineHeight: 1.8 }}>
    <strong>Kiln · Qwen3-32B 연동 예정</strong>
    <p>Kiln 팀 계정 및 API 접근권한 대기 중</p>
    <p>{error ? "연결 상태 조회 실패 · 새로고침하여 다시 확인해 주세요." : status
      ? `설정 ${status.configured ? "있음" : "없음"} · 실제 연결 ${status.connection_verified ? "검증됨" : "미검증"} · 마지막 호출 ${status.last_call_success === null ? "없음" : status.last_call_success ? "성공" : "실패"}`
      : "연결 상태 확인 중"}</p>
    {status?.last_error_summary && <p>오류 요약: {status.last_error_summary}</p>}
    {financeHref && <a href={financeHref} style={{ display: "inline-block", padding: "10px 16px", borderRadius: 8, background: "#dc6b23", color: "white", fontWeight: 800 }}>구매 승인 에이전트 준비화면</a>}
  </aside>;
}
