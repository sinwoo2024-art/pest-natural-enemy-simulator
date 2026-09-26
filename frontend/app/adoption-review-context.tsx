"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const ECONOMIC_FIELDS = [
  ["untreated_loss", "예상 무처리 피해액·수량/품질 손실액", "원"],
  ["saved_control", "기존 방제비 절감 예상액", "원"],
  ["enemy_cost", "천적 구입비", "원"],
  ["labor_cost", "방사·투입 작업비", "원"],
  ["monitoring_cost", "추가 예찰비", "원"],
  ["other_cost", "기타 적용비용", "원"],
  ["effect_low", "예상 효과 하한", "%"],
  ["effect_base", "예상 효과 기준값", "%"],
  ["effect_high", "예상 효과 상한", "%"],
] as const;
export type EconomicKey = typeof ECONOMIC_FIELDS[number][0];
export type Gate = "unknown" | "clear" | "adverse";
export type FieldConditions = {
  temperature: number | null; humidity: number | null;
  environment: Gate; rainfall: Gate; wind: Gate; chemical_residue: Gate;
  pest_observed: boolean; crop_stage_checked: boolean;
};
export type Review = {
  status: "자료 부족" | "현장 적용 검토 보류" | "경제성 낮음" | "현장 실증 필요" | "도입 검토 후보";
  reason: string; missing: string[]; disclaimer: string; decision_notice: string;
  enemies: { name: string; scientific_name?: string }[];
  tracks: {
    surveillance: { score: number | null; level: string; action: string; meaning: string };
    environment: { meaning: string; origin: string; all_checked: boolean };
    evidence: {
      enemy_name: string | null; grade: string; source_grade: string | null; checks: Record<string, boolean>;
      official: Record<string, string | number | null>; missing: string[]; caution: string;
      source_status?: string;
      references?: { title: string | null; url: string; conditions: string | null; note: string | null; enemy_name: string | null; scope: string }[];
      reported_points: { group: string; metric: string; reported_percent: number | null; source_url: string | null }[];
    };
    economics: {
      complete: boolean; status: string; input_origin: string; formulas: Record<string, string>; rounding: string;
      total_cost?: number; break_even_effect_percent?: number | null; break_even_note?: string;
      scenarios: { label: string; effect_percent: number; avoided_loss: number; total_benefit: number; net_benefit: number; bcr: number | null }[];
    };
  };
};
function useReviewState(apiBase: string, crop: string, pest: string, region: string) {
  const [economics, setEconomics] = useState<Record<EconomicKey, number | null>>(() => Object.fromEntries(ECONOMIC_FIELDS.map(([key]) => [key, null])) as Record<EconomicKey, number | null>);
  const [field, setField] = useState<FieldConditions>({ temperature: null, humidity: null, environment: "unknown", rainfall: "unknown", wind: "unknown", chemical_residue: "unknown", pest_observed: false, crop_stage_checked: false });
  const [cultivationMode, setCultivationMode] = useState("미확인");
  const [enemyName, setEnemyName] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify({ crop, pest, region, economics, field, cultivationMode, enemyName, retry });
  const [resolvedKey, setResolvedKey] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    let timeout: ReturnType<typeof setTimeout>;
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${apiBase}/api/adoption-review`, {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
          body: JSON.stringify({ crop, pest, region, cultivation_mode: cultivationMode, enemy_name: enemyName, economics, field }),
        });
        if (!response.ok) throw new Error(response.status === 422 ? "입력 범위를 확인하세요. 비용은 0 이상, 효과율은 0~100%입니다." : `HTTP ${response.status}`);
        const payload: Review = await response.json();
        if (!controller.signal.aborted) { setReview(payload); setResolvedKey(requestKey); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "판단 자료 연결 실패");
        else if (!disposed) setError("응답 시간이 초과되었습니다. 다시 계산해 주세요.");
      } finally { clearTimeout(timeout); if (!disposed) setLoading(false); }
    }, 250);
    let disposed = false;
    return () => { disposed = true; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [apiBase, crop, pest, region, economics, field, cultivationMode, enemyName, retry, requestKey]);
  return { economics, setEconomics, field, setField, cultivationMode, setCultivationMode, enemyName, setEnemyName,
    review: resolvedKey === requestKey ? review : null, enemies: review?.enemies ?? [],
    loading: loading || (!error && resolvedKey !== requestKey), error, retry: () => setRetry((v) => v + 1) };
}
const Context = createContext<ReturnType<typeof useReviewState> | null>(null);
export function AdoptionReviewProvider({ children, apiBase, crop, pest, region }: { children: ReactNode; apiBase: string; crop: string; pest: string; region: string }) {
  return <Context.Provider value={useReviewState(apiBase, crop, pest, region)}>{children}</Context.Provider>;
}
export function useAdoptionReview() {
  const context = useContext(Context);
  if (!context) throw new Error("AdoptionReviewProvider is required");
  return context;
}
