type HeroCondition = {
  crop: string;
  pest: string;
  region: string;
};

export type HeroBootstrapPayload<TJudge, TWeather> = {
  complete: boolean;
  current: TJudge;
  featured: TJudge;
  weather: TWeather;
  errors?: Record<string, string>;
  generated_at?: string;
};

const CLIENT_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_CONDITION: HeroCondition = {
  crop: "복숭아",
  pest: "복숭아순나방",
  region: "전체",
};
const requestCache = new Map<string, {
  expiresAt: number;
  request: Promise<HeroBootstrapPayload<unknown, unknown>>;
}>();

/**
 * 표지와 60초 심사 경로가 동일한 분석 묶음을 한 번만 요청하도록 공유한다.
 * 진행 중인 Promise 자체를 저장하므로 동시에 마운트되어도 네트워크 요청은 하나다.
 */
export function fetchHeroBootstrap<TJudge, TWeather>(
  apiBase: string,
  condition: HeroCondition,
): Promise<HeroBootstrapPayload<TJudge, TWeather>> {
  const isDefault = condition.crop === DEFAULT_CONDITION.crop
    && condition.pest === DEFAULT_CONDITION.pest
    && condition.region === DEFAULT_CONDITION.region;
  const query = isDefault ? "?review=v1" : `?${new URLSearchParams({ ...condition, review: "v1" }).toString()}`;
  // 이 컴포넌트는 current·featured·weather 묶음을 사용하므로 일반 초기화
  // (/api/bootstrap)가 아니라 전용 응답 스키마의 hero-bootstrap을 호출해야 한다.
  const url = `${apiBase}/api/hero-bootstrap${query}`;
  const cached = requestCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.request as Promise<HeroBootstrapPayload<TJudge, TWeather>>;
  }

  let request: Promise<HeroBootstrapPayload<unknown, unknown>>;
  request = fetch(url, {
    headers: { Accept: "application/json" },
    // 표지와 심사 60초는 동일한 공식 분석 묶음이다. 브라우저·Next 캐시를
    // 허용해 재방문 시 검증된 응답을 즉시 재사용하고, 서버 캐시 만료 후 갱신한다.
    cache: "default",
  })
   .then(async (response) => {
  const raw = await response.json() as any;

  const payload = raw.hero ?? raw;

  if (
    !response.ok ||
    !payload?.complete ||
    !payload?.current ||
    !payload?.featured ||
    !payload?.weather
  ) {
    throw new Error(`bootstrap HTTP ${response.status}`);
  }

  return payload as HeroBootstrapPayload<unknown, unknown>;
})
    .catch((error: unknown) => {
      if (requestCache.get(url)?.request === request) requestCache.delete(url);
      throw error;
    });

  requestCache.set(url, { expiresAt: Date.now() + CLIENT_CACHE_MS, request });
  return request as Promise<HeroBootstrapPayload<TJudge, TWeather>>;
}
