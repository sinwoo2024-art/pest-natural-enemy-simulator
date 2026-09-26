import "server-only";

import type { InitialPageData, ServerInitialBootstrap } from "./initial-page-context";
import type { HeroBootstrapPayload } from "./hero-bootstrap-client";

const BACKEND_API_URL = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const INTERNAL_FRONTEND_URL = (process.env.INTERNAL_FRONTEND_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const INITIAL_CONDITION = { crop: "복숭아", pest: "복숭아순나방", region: "전체" } as const;
const CACHE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 1_800;

let memoryCache: { value: InitialPageData; expiresAt: number } | null = null;
let inFlight: Promise<InitialPageData | null> | null = null;

function queryFor(condition: { crop: string; pest: string; region: string }) {
  return new URLSearchParams({
    year: "2026",
    crop: condition.crop,
    pest: condition.pest,
    region: condition.region,
  }).toString();
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return await response.json() as T;
}

function fetchBackend<T>(path: string, signal: AbortSignal): Promise<T> {
  return fetchJson<T>(`${BACKEND_API_URL}${path}`, signal);
}

async function buildInitialPageData(): Promise<InitialPageData | null> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const selectedQuery = queryFor(INITIAL_CONDITION);

  try {
    const [bootstrapResult, heroResult] = await Promise.allSettled([
      fetchBackend<ServerInitialBootstrap>(`/api/bootstrap?${selectedQuery}`, controller.signal),
      fetchJson<HeroBootstrapPayload<unknown, unknown>>(
        `${INTERNAL_FRONTEND_URL}/api/hero-bootstrap?review=v1`,
        controller.signal,
      ),
    ]);
    if (bootstrapResult.status !== "fulfilled") throw bootstrapResult.reason;

    const hero = heroResult.status === "fulfilled" && heroResult.value.complete
      ? heroResult.value
      : memoryCache?.value.hero ?? null;
    const value: InitialPageData = {
      condition: INITIAL_CONDITION,
      bootstrap: bootstrapResult.value,
      hero,
      generated_at: new Date().toISOString(),
    };
    memoryCache = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch {
    return memoryCache?.value ?? null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function getInitialPageData(): Promise<InitialPageData | null> {
  if (memoryCache && memoryCache.expiresAt > Date.now()) return memoryCache.value;
  if (!inFlight) {
    inFlight = buildInitialPageData().finally(() => { inFlight = null; });
  }
  return await inFlight;
}
