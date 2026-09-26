"use client";

import { ECONOMIC_FIELDS, useAdoptionReview, type Gate } from "./adoption-review-context";
import styles from "./adoption-review.module.css";

const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원`;
const GATES = [["environment", "온습도·극한온도·천적 활동환경"], ["rainfall", "강우·시설 내 영향"], ["wind", "강풍·시설 내 영향"], ["chemical_residue", "약제 잔효·작업자 안전"]] as const;
const CHECKS: Record<string, string> = { pest_match: "대상 병해충", crop_match: "대상 작물", environment_match: "시험 재배환경", dose_available: "공식 방사량", timing_available: "공식 처리시기", repeats_available: "반복 횟수·간격", control_available: "처리군·대조군", effect_numeric_available: "효과 수치", source_available: "공식 처리조건 출처 (참고문헌과 별개)", domestic_context: "국내 적용 맥락" };

export default function AdoptionReview() {
  const { review, economics, setEconomics, field, setField, cultivationMode, setCultivationMode, enemyName, setEnemyName, enemies, loading, error, retry } = useAdoptionReview();
  const evidence = review?.tracks.evidence;
  const economy = review?.tracks.economics;
  return <section className={styles.review} aria-label="천적 도입 타당성 검토" id="adoption-review">
    <h3>근거 입력형 경제효과 비교 · 천적 도입 타당성</h3>
    <p>예찰·환경·효과 근거·사용자 경제성을 분리합니다. 각 결과를 하나의 점수로 합산하지 않습니다. 조건을 바꾸면 이전 조건의 입력값은 초기화됩니다.</p>
    <div className={styles.step}><h4>1. NCPMS 상대위험 신호</h4><p>{review ? `${review.tracks.surveillance.score ?? "—"}점 · ${review.tracks.surveillance.level}` : "신호 확인 중"}</p><small>{review?.tracks.surveillance.meaning ?? "실제 피해확률·예상 피해액·방사 필요성·경제효과가 아닙니다."}</small></div>
    <div className={styles.step}><h4>2. 예찰 행동</h4><p>{review?.tracks.surveillance.action ?? "현장 밀도와 피해 증상을 확인하세요."}</p></div>
    <div className={styles.step}><h4>3. 연결 천적과 근거 등급</h4>
      <label>검토할 천적<select value={enemyName ?? enemies[0]?.name ?? ""} onChange={(e) => { setEnemyName(e.target.value || null); setField((f) => ({ ...f, environment: "unknown", chemical_residue: "unknown" })); }}>
        {!enemies.length && <option value="">연결 근거 없음</option>}{enemies.map((enemy) => <option key={enemy.name} value={enemy.name}>{enemy.name}</option>)}
      </select></label>
      <label>현재 재배환경<select value={cultivationMode} onChange={(e) => { setCultivationMode(e.target.value); setField((f) => ({ ...f, environment: "unknown" })); }}>{["미확인", "시설", "노지", "스마트팜"].map((v) => <option key={v}>{v}</option>)}</select></label>
      <p>{evidence?.grade ?? "근거 확인 중"} · 원문 등급 {evidence?.source_grade ?? "미기재"}</p>
      <small>{evidence?.caution}</small>
    </div>
    <div className={styles.step}><h4>4. 공식 처리조건·효과자료</h4>
      <p>{evidence?.source_status}</p>
      {evidence?.references?.map((ref) => <div key={ref.url}>
        <p>{ref.scope} · {ref.enemy_name}</p>
        <a href={ref.url} target="_blank" rel="noreferrer">{ref.title ?? "참고문헌 원문"} ↗</a>
        <p>{ref.conditions}</p><small>{ref.note}</small>
      </div>)}
      <ul>{Object.entries(CHECKS).map(([key, label]) => <li key={key}>{label}: {evidence ? evidence.checks[key] ? "확인" : "미확보·불일치" : "확인 중"}</li>)}</ul>
      <dl>{[["source_crop", "원문 작물"], ["source_target_pest", "원문 병해충"], ["environment", "원문 시험환경"], ["release_amount", "공식 방사량"], ["timing_condition", "공식 처리시기"], ["release_schedule", "반복 횟수·간격"], ["trial_effect", "공식 시험 효과 서술"]].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{evidence?.official[key] ?? "미확보"}</dd></div>)}</dl>
      {evidence?.reported_points.map((point, i) => <p key={i}>{point.group} · {point.metric}: {point.reported_percent ?? "미확보"} (원문 보고값, 경제성 효과율로 자동 대입하지 않음)</p>)}
      {typeof evidence?.official.source_url === "string" && /^https?:\/\//.test(evidence.official.source_url) && <a href={evidence.official.source_url} target="_blank" rel="noreferrer">{evidence.official.source ?? "공식 근거"} 원문 열기 ↗</a>}
    </div>
    <div className={styles.step}><h4>5. 스마트팜·기상·약제 현장 관문</h4>
      <p>다음은 사용자 현장 확인값입니다. 공식 스마트팜·기상 관측은 기존 별도 영역에서 확인하며, 자동 센서 연동이나 NCPMS 점수 보정에 사용하지 않습니다.</p>
      <div className={styles.inputs}>
        {(["temperature", "humidity"] as const).map((key) => <label key={key}>{key === "temperature" ? "현장 기온 (℃)" : "현장 상대습도 (%)"}<input type="number" step="any" min={key === "temperature" ? -60 : 0} max={key === "temperature" ? 80 : 100} value={field[key] ?? ""} onChange={(e) => setField((f) => ({ ...f, [key]: e.target.value === "" ? null : Number(e.target.value), environment: "unknown" }))}/></label>)}
        {GATES.map(([key, label]) => <label key={key}>{label}<select value={field[key]} onChange={(e) => setField((f) => ({ ...f, [key]: e.target.value as Gate }))}><option value="unknown">미확인</option><option value="clear">현장 확인: 불리 조건 없음</option><option value="adverse">현장 확인: 불리 조건 있음</option></select></label>)}
      </div>
      <p>온습도 수치만으로 적합성을 자동 판정하지 않습니다. 선택 천적의 원문 조건·약제 이력과 현장을 확인한 뒤 관문을 입력하세요.</p>
      <label className={styles.check}><input type="checkbox" checked={field.pest_observed} onChange={(e) => setField((f) => ({ ...f, pest_observed: e.target.checked }))}/>현장 해충 밀도·발육단계 예찰 확인</label>
      <label className={styles.check}><input type="checkbox" checked={field.crop_stage_checked} onChange={(e) => setField((f) => ({ ...f, crop_stage_checked: e.target.checked }))}/>작물 생육단계 확인</label>
    </div>
    <div className={styles.step}><h4>6. 사용자 입력 경제성 계산</h4>
      <p>모든 값은 <b>사용자 가정값</b>입니다. 같은 면적·기간을 기준으로 입력하고, 방제비 절감액과 피해 회피액을 중복 계산하지 마세요. 비용 없음은 0으로 명시하세요. 공식 원문의 관측 비율은 일반화된 효과율이 아닙니다.</p>
      <div className={styles.inputs}>{ECONOMIC_FIELDS.map(([key, label, unit]) => <label key={key}>{label} ({unit})<input type="number" min="0" step="any" max={unit === "%" ? 100 : 1e15} value={economics[key] ?? ""} placeholder="미입력" onChange={(e) => setEconomics((v) => ({ ...v, [key]: e.target.value === "" ? null : Number(e.target.value) }))}/><small>사용자 가정값</small></label>)}</div>
      {!economy?.complete ? <p role="status">{economy?.status ?? "경제성 입력 필요"}</p> : <>
        <p>총도입비용 {money(economy.total_cost ?? 0)}</p>
        <div className={styles.tableWrap}><table><caption>사용자 효과 가정별 결과</caption><thead><tr><th>가정</th><th>효과율</th><th>회피피해액</th><th>총편익</th><th>순편익</th><th>BCR</th></tr></thead><tbody>{economy.scenarios.map((s) => <tr key={s.label}><th>{s.label}</th><td>{s.effect_percent}%</td><td>{money(s.avoided_loss)}</td><td>{money(s.total_benefit)}</td><td>{money(s.net_benefit)}</td><td>{s.bcr?.toFixed(2) ?? "산출 불가 (비용 0)"}</td></tr>)}</tbody></table></div>
        <p>손익분기 효과율: {economy.break_even_effect_percent == null ? "산출 불가" : `${economy.break_even_effect_percent.toFixed(2)}%`} · {economy.break_even_note}</p>
      </>}
      <details><summary>계산식·반올림 기준 확인 (입력값은 위에 표시)</summary>{Object.values(economy?.formulas ?? {}).map((formula) => <p key={formula}>{formula}</p>)}<p>{economy?.rounding}</p></details>
    </div>
    <div className={styles.verdict} aria-live="polite"><h4>7. 최종 상태와 이유</h4><strong>{loading ? "입력 조건 검토 중" : error ? "판단 자료 연결 실패" : review?.status ?? "자료 부족"}</strong><p>{error ?? review?.reason}</p>{error && <button type="button" onClick={retry}>다시 계산</button>}<p>{review?.decision_notice ?? "최종 결정은 농업인과 전문가가 현장 확인 후 수행합니다. 방사 명령이 아닙니다."}</p></div>
    <div className={styles.step}><h4>8. 추가로 필요한 자료</h4><ul>{(review?.missing ?? ["선택 조건의 근거와 입력값 확인"]).map((item) => <li key={item}>{item}</li>)}</ul>{review?.missing.length === 0 && <p>입력상 필수 관문 충족. 실제 적용 전 현장 재확인과 전문가 검토가 필요합니다.</p>}</div>
    <p className={styles.notice}>{review?.disclaimer ?? "본 결과는 사용자 비용·피해액·효과 가정의 시나리오 계산입니다. NCPMS 상대위험도는 피해확률이나 방제효과가 아닙니다. 공식 효과율은 생성하지 않습니다."}</p>
  </section>;
}
