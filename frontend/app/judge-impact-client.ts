type JudgeImpactCondition = {
  pest: string;
  crop?: string | null;
  region?: string | null;
  cultivationMode?: string;
};

type CacheEntry = {
  expiresAt: number;
  request: Promise<unknown>;
};

const CACHE_TTL_MS = 60_000;
const requestCache = new Map<string, CacheEntry>();

export function buildJudgeImpactUrl(apiBase: string, condition: JudgeImpactCondition) {
  const params = new URLSearchParams({
    pest: condition.pest,
    cultivation_mode: condition.cultivationMode ?? "전체",
  });
  if (condition.crop && condition.crop !== "전체") params.set("crop", condition.crop);
  if (condition.region && condition.region !== "전체") params.set("region", condition.region);
  return `${apiBase}/api/analysis/judge-impact?${params.toString()}`;
}

export function fetchJudgeImpact<T>(url: string): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(url);
  if (cached && cached.expiresAt > now) return cached.request as Promise<T>;

  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json() as Promise<T>;
    })
    .catch((error) => {
      requestCache.delete(url);
      throw error;
    });
  requestCache.set(url, { expiresAt: now + CACHE_TTL_MS, request });
  return request;
}
