import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_API_URL = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const BACKEND_TIMEOUT_MS = 4_500;
// 연도별 관측·분석 묶음은 요청마다 변하지 않으므로 검증된 실제 응답을
// 길게 보존해 공개 도메인의 반복 방문에서 즉시 반환합니다.
const MEMORY_CACHE_MS = 60 * 60 * 1000;

type BootstrapPayload = {
  complete: boolean;
  elapsed_ms: number;
  health: unknown | null;
  summary: unknown | null;
  options: unknown | null;
  compare: unknown | null;
  filtered_options: unknown | null;
  simulation: unknown | null;
  errors: Record<string, string>;
};

const memoryCache = new Map<string, { expiresAt: number; payload: BootstrapPayload }>();
const inFlight = new Map<string, Promise<BootstrapPayload>>();

async function buildBootstrap(crop: string, pest: string): Promise<BootstrapPayload> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  const query = new URLSearchParams({ year: "2026", crop, pest, region: "전체" });

  try {
    // 백엔드가 미리 가열하고 캐시하는 통합 엔드포인트를 한 번만 호출합니다.
    // 연결 상태와 첫 분석자료가 같은 응답에서 함께 도착합니다.
    const response = await fetch(`${BACKEND_API_URL}/api/bootstrap?${query.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`백엔드 통합 API HTTP ${response.status}`);

    const data = await response.json() as Partial<BootstrapPayload>;
    const requiredKeys: Array<keyof BootstrapPayload> = [
      "health",
      "summary",
      "options",
      "compare",
      "filtered_options",
      "simulation",
    ];
    const missing = requiredKeys.filter((key) => data[key] === null || data[key] === undefined);
    if (missing.length > 0) throw new Error(`통합 응답 누락: ${missing.join(", ")}`);

    return {
      complete: data.complete === true && missing.length === 0,
      elapsed_ms: Math.round(performance.now() - startedAt),
      health: data.health ?? null,
      summary: data.summary ?? null,
      options: data.options ?? null,
      compare: data.compare ?? null,
      filtered_options: data.filtered_options ?? null,
      simulation: data.simulation ?? null,
      errors: data.errors ?? {},
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  // 첫 화면의 실제 기본 조건과 반드시 같아야 합니다. 실행기가 이 URL을
  // 미리 호출하므로 첫 방문자는 계산을 기다리지 않고 검증된 캐시를 받습니다.
  const crop = request.nextUrl.searchParams.get("crop")?.trim() || "복숭아";
  const pest = request.nextUrl.searchParams.get("pest")?.trim() || "복숭아순나방";
  const cacheKey = `${crop}\u0000${pest}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      { ...cached.payload, cache: "hit" },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
          "X-Bootstrap-Cache": "HIT",
        },
      },
    );
  }

  let pending = inFlight.get(cacheKey);
  if (!pending) {
    pending = buildBootstrap(crop, pest);
    inFlight.set(cacheKey, pending);
  }

  try {
    const payload = await pending;
    if (payload.complete) {
      memoryCache.set(cacheKey, { expiresAt: now + MEMORY_CACHE_MS, payload });
    }
    return NextResponse.json(
      { ...payload, cache: "miss" },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
          "X-Bootstrap-Cache": "MISS",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "통합 API 요청 실패";
    const payload: BootstrapPayload = {
      complete: false,
      elapsed_ms: 0,
      health: null,
      summary: null,
      options: null,
      compare: null,
      filtered_options: null,
      simulation: null,
      errors: { bootstrap: message },
    };
    return NextResponse.json(payload, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    inFlight.delete(cacheKey);
  }
}
