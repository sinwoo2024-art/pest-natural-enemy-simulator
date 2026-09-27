// Bound the entire request, including JSON decoding. Cancellation never leaves
// a loading state pending even if a transport fails to reject on abort.
export async function boundedFetchJson<T>(url: string, signal?: AbortSignal, timeoutMs = 15_000, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  let rejectAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(timedOut
      ? new Error(`${Math.ceil(timeoutMs / 1000)}초 응답 제한시간 초과 · 연결 실패`)
      : new DOMException("요청 취소", "AbortError"));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`연결 실패 · HTTP ${response.status}`);
        return await response.json() as T;
      })(),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
