import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HEALTH_TIMEOUT_MS = 5_000;

export async function GET() {
  const backendApiUrl = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000")
    .replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendApiUrl}/api/health`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "error", detail: `백엔드 health 응답 오류 (${response.status})` },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { status: "error", detail: "백엔드 health 응답 형식이 올바르지 않습니다." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    const detail = controller.signal.aborted
      ? "백엔드 health 확인 시간 초과"
      : "백엔드 API에 연결할 수 없습니다.";
    return NextResponse.json(
      { status: "error", detail },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
