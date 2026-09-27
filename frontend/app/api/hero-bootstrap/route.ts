import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

const BACKEND_API_URL = (process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const BACKEND_TIMEOUT_MS = 20_000;
const MEMORY_CACHE_MS = 60 * 60 * 1000;
const DISK_CACHE_FRESH_MS = 24 * 60 * 60 * 1000;
const DISK_CACHE_MAX_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const FEATURED = { crop: "고추", pest: "점박이응애", region: "전체" };
const WORKSPACE_ROOT = process.cwd().toLowerCase().endsWith("frontend")
  ? resolve(process.cwd(), "..")
  : process.cwd();
const PERSISTENT_CACHE_DIR = resolve(WORKSPACE_ROOT, "data", "cache", "hero-bootstrap");

type HeroBootstrapPayload = {
  complete: boolean;
  elapsed_ms: number;
  current: unknown | null;
  featured: unknown | null;
  weather: unknown | null;
  errors: Record<string, string>;
};

type PersistentCacheEntry = {
  stored_at: number;
  payload: HeroBootstrapPayload;
};

const memoryCache = new Map<string, { expiresAt: number; payload: HeroBootstrapPayload }>();
const inFlight = new Map<string, Promise<HeroBootstrapPayload>>();

function queryFor(crop: string, pest: string, region: string) {
  return new URLSearchParams({ crop, pest, region }).toString();
}

function cacheFileFor(key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return resolve(PERSISTENT_CACHE_DIR, `${digest}.json`);
}

async function readPersistentCache(key: string) {
  try {
    const raw = await readFile(cacheFileFor(key), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistentCacheEntry>;
    if (!parsed.stored_at || !parsed.payload?.complete) return null;
    const ageMs = Date.now() - parsed.stored_at;
    if (ageMs < 0 || ageMs > DISK_CACHE_MAX_STALE_MS) return null;
    return { ageMs, payload: parsed.payload };
  } catch {
    return null;
  }
}

async function writePersistentCache(key: string, payload: HeroBootstrapPayload) {
  await mkdir(PERSISTENT_CACHE_DIR, { recursive: true });
  const entry: PersistentCacheEntry = { stored_at: Date.now(), payload };
  await writeFile(cacheFileFor(key), JSON.stringify(entry), "utf8");
}

async function fetchBackend(path: string, signal: AbortSignal) {
  const response = await fetch(`${BACKEND_API_URL}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function buildHeroBootstrap(crop: string, pest: string, region: string): Promise<HeroBootstrapPayload> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  const errors: Record<string, string> = {};

  try {
    const selectedQuery = queryFor(crop, pest, region);
    const featuredQuery = queryFor(FEATURED.crop, FEATURED.pest, FEATURED.region);
    const currentRequest = fetchBackend(`/api/analysis/judge-impact?${selectedQuery}`, controller.signal);
    const featuredRequest = crop === FEATURED.crop && pest === FEATURED.pest && region === FEATURED.region
      ? currentRequest
      : fetchBackend(`/api/analysis/judge-impact?${featuredQuery}`, controller.signal);
    const weatherRequest = fetchBackend(`/api/forecast/2027?${selectedQuery}`, controller.signal);

    const [currentResult, featuredResult, weatherResult] = await Promise.allSettled([
      currentRequest,
      featuredRequest,
      weatherRequest,
    ]);

    const current = currentResult.status === "fulfilled" ? currentResult.value : null;
    const featured = featuredResult.status === "fulfilled" ? featuredResult.value : null;
    const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
    if (currentResult.status === "rejected") errors.current = String(currentResult.reason);
    if (featuredResult.status === "rejected") errors.featured = String(featuredResult.reason);
    if (weatherResult.status === "rejected") errors.weather = String(weatherResult.reason);

    return {
      complete: Boolean(current && featured && weather),
      elapsed_ms: Date.now() - startedAt,
      current,
      featured,
      weather,
      errors,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildAndCache(key: string, crop: string, pest: string, region: string) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  let pending: Promise<HeroBootstrapPayload>;
  pending = buildHeroBootstrap(crop, pest, region)
    .then(async (payload) => {
      if (payload.complete) {
        memoryCache.set(key, { expiresAt: Date.now() + MEMORY_CACHE_MS, payload });
        await writePersistentCache(key, payload).catch(() => undefined);
      }
      return payload;
    })
    .finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });
  inFlight.set(key, pending);
  return pending;
}

export async function GET(request: NextRequest) {
  const crop = request.nextUrl.searchParams.get("crop")?.trim() || "복숭아";
  const pest = request.nextUrl.searchParams.get("pest")?.trim() || "복숭아순나방";
  const region = request.nextUrl.searchParams.get("region")?.trim() || "전체";
  const key = `adoption-review-v1\u0000${crop}\u0000${pest}\u0000${region}`;
  const cached = memoryCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      status: cached.payload.complete ? 200 : 503,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
        "X-Hero-Bootstrap-Cache": "HIT",
      },
    });
  }

  const persistent = await readPersistentCache(key);
  if (persistent) {
    memoryCache.set(key, { expiresAt: Date.now() + MEMORY_CACHE_MS, payload: persistent.payload });
    if (persistent.ageMs > DISK_CACHE_FRESH_MS) {
      void buildAndCache(key, crop, pest, region).catch(() => undefined);
    }
    return NextResponse.json(persistent.payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400",
        "X-Hero-Bootstrap-Cache": persistent.ageMs > DISK_CACHE_FRESH_MS ? "STALE" : "DISK",
      },
    });
  }

  try {
    const payload = await buildAndCache(key, crop, pest, region);
    return NextResponse.json(payload, {
      status: payload.complete ? 200 : 503,
      headers: {
        "Cache-Control": payload.complete
          ? "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
        "X-Hero-Bootstrap-Cache": "MISS",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({
      complete: false,
      elapsed_ms: 0,
      current: null,
      featured: null,
      weather: null,
      errors: { request: error instanceof Error ? error.message : "unknown error" },
    } satisfies HeroBootstrapPayload, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
