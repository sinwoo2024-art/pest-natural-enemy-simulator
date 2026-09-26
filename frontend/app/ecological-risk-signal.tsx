"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import styles from "./ecological-risk-signal.module.css";

type SignalTone = "observe" | "caution" | "high" | "missing";

type Props = {
  score: number | null | undefined;
  title?: string;
  compact?: boolean;
  mini?: boolean;
  interactive?: boolean;
  className?: string;
};

const SIGNALS: Record<SignalTone, { label: string; action: string; index: number }> = {
  observe: { label: "관찰", action: "정기 예찰 유지", index: 0 },
  caution: { label: "주의", action: "예찰 간격 단축", index: 1 },
  high: { label: "고위험", action: "즉시 진단·대응 검토", index: 2 },
  missing: { label: "자료 없음", action: "비교 가능한 자료 확보", index: -1 },
};

export function toneFromScore(score: Props["score"]): SignalTone {
  if (score === null || score === undefined || !Number.isFinite(score)) return "missing";
  if (score >= 67) return "high";
  if (score >= 34) return "caution";
  return "observe";
}

export function labelFromScore(score: Props["score"]) {
  return SIGNALS[toneFromScore(score)].label;
}

function formatScore(score: Props["score"]) {
  if (score === null || score === undefined || !Number.isFinite(score)) return "—";
  const numeric = Number(score);
  return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)}점`;
}

export default function EcologicalRiskSignal({
  score,
  title = "생태 위험 신호",
  compact = false,
  mini = false,
  interactive = true,
  className = "",
}: Props) {
  const [pulse, setPulse] = useState(false);
  const tone = toneFromScore(score);
  const signal = SIGNALS[tone];
  const scoreText = formatScore(score);
  const scorePercent = tone === "missing" ? 0 : Math.max(0, Math.min(100, Number(score)));

  const activate = () => {
    if (tone === "missing") return;
    setPulse(false);
    window.requestAnimationFrame(() => setPulse(true));
  };

  const body: ReactNode = (
    <>
      <span className={styles.beacon} aria-hidden="true">
        <span className={styles.orbit}><i /><i /><i /></span>
        <i className={signal.index === 0 ? styles.lit : ""}><em /></i>
        <i className={signal.index === 1 ? styles.lit : ""}><em /></i>
        <i className={signal.index === 2 ? styles.lit : ""}><em /></i>
        <b />
      </span>
      <span className={styles.copy}>
        <small>{title}</small>
        <strong>{signal.label}</strong>
        <span>{scoreText}</span>
        <em>{signal.action}</em>
      </span>
      <span className={styles.scoreRail} aria-hidden="true"><i /></span>
    </>
  );

  const classes = `${styles.signal} ${styles[tone]} ${compact ? styles.compact : ""} ${mini ? styles.mini : ""} ${pulse ? styles.pulse : ""} ${className}`;
  const style = { "--score": `${scorePercent}%` } as CSSProperties;
  const ariaLabel = `${title}: ${signal.label}, ${scoreText}. ${signal.action}`;

  if (!interactive) {
    return <div aria-label={ariaLabel} className={classes} data-signal-system="symbiosis-prism-v2" data-tone={tone} role="img" style={style}>{body}</div>;
  }

  return (
    <button
      aria-label={ariaLabel}
      className={classes}
      data-signal-system="symbiosis-prism-v2"
      data-tone={tone}
      onAnimationEnd={() => setPulse(false)}
      onClick={activate}
      style={style}
      title={tone === "missing" ? "자료 없음은 실제 0과 다릅니다." : "눌러서 현재 위험 신호를 확인하세요."}
      type="button"
    >{body}</button>
  );
}
