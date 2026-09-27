"use client";

export const EMPTY_CRITERION = {value:null as number|null, unit:"", crop:"", pest:"", source:"", region:"", cultivation:""};
export const EMPTY_EIL = {C:null as number|null,V:null as number|null,I:null as number|null,D:null as number|null,K:null as number|null,C_unit:"",V_unit:"",I_unit:"",D_unit:"",K_unit:"",source:""};
export type Criterion = typeof EMPTY_CRITERION;
export type EilInputs = typeof EMPTY_EIL;
export type ThresholdResult = {status:string; origin:string; source:string|null; source_verified:boolean; numeric_comparable:boolean; comparison:string|null; selected_value:number|null; selected_unit:string; missing:string[]; eil_note:string; eil_result:{status:string;value:number|null;unit:string|null;note:string;formula_source:string}};
const VARIABLES = [
  ["C","방제비용",["원/m²","원/ha","원/주","원/잎"]],
  ["V","농산물 단위가치",["원/kg"]],
  ["I","해충 개체당 피해량",["cm²/마리","피해단위/마리"]],
  ["D","피해량당 수량 손실",["kg/cm²","kg/피해단위"]],
  ["K","방제효율",["비율(0~1)"]],
] as const;
export default function ThresholdInputs({criterion,eil,mode,onCriterion,onEil,onMode,result}: {
  criterion:Criterion;eil:EilInputs;mode:"direct"|"eil";onCriterion:(value:Criterion)=>void;onEil:(value:EilInputs)=>void;onMode:(value:"direct"|"eil")=>void;result?:ThresholdResult;
}) {
  return <div>
    <label>경제적 기준 검토 방식<select value={mode} onChange={e=>onMode(e.target.value as "direct"|"eil")}><option value="direct">방식 A · 공식 기준 직접 입력 (원문 미검증)</option><option value="eil">방식 B · EIL 계산</option></select></label>
    {mode==="direct"?<fieldset><legend>출처·단위·대상·적용조건을 함께 입력하세요</legend>
      <label>기준값<input type="number" min="0" step="any" value={criterion.value??""} placeholder="미입력" onChange={e=>onCriterion({...criterion,value:e.target.value===""?null:Number(e.target.value)})}/></label>
      {([['unit','기준 단위'],['crop','기준 대상 작물'],['pest','기준 대상 병해충'],['source','기준 출처 (문헌·문서·URL)'],['region','기준 적용 지역 (또는 재배조건 입력)'],['cultivation','기준 재배조건 (논·밭·과수원 등)']] as const).map(([key,label])=><label key={key}>{label}<input maxLength={key==='source'?500:100} value={criterion[key]} placeholder="미입력" onChange={e=>onCriterion({...criterion,[key]:e.target.value})}/></label>)}
      <p>출처나 단위가 없으면 출처 확인 필요입니다. 출처를 기재해도 서버가 공식 원문을 인증한 것은 아닙니다. 작물·병해충·적용조건·단위가 맞을 때만 사용자 입력 기준과 수치 비교합니다.</p>
    </fieldset>:<fieldset><legend>EIL = C / (V × I × D × K)</legend>
      {VARIABLES.map(([key,label,units])=><div key={key}><label>{key}: {label}<input type="number" min={key==='C'?0:undefined} max={key==='K'?1:1e12} step="any" value={eil[key]??""} placeholder="미입력" onChange={e=>onEil({...eil,[key]:e.target.value===""?null:Number(e.target.value)})}/></label><label>{key} 단위<select value={eil[`${key}_unit`]} onChange={e=>onEil({...eil,[`${key}_unit`]:e.target.value})}><option value="">미입력</option>{units.map(u=><option key={u}>{u}</option>)}</select></label></div>)}
      <label>EIL 입력 근거·출처<input maxLength={500} value={eil.source} placeholder="미입력 · 출처 없는 값은 사용자 가정값" onChange={e=>onEil({...eil,source:e.target.value})}/></label>
      <p>I와 D의 피해단위는 같아야 합니다. 피해단위를 선택하면 동일한 피해 정의로 조사한 값만 입력하세요. C의 면적·주수 단위가 결과 밀도의 분모가 됩니다. K는 백분율이 아닌 0 초과 1 이하의 비율입니다. 미입력을 0으로 대체하거나 단위를 자동 환산하지 않습니다.</p>
      <p>결과: {result?.eil_result?.value==null?'EIL 계산 근거 부족':`${result.eil_result.value.toLocaleString('ko-KR',{maximumSignificantDigits:8})} ${result.eil_result.unit} · 사용자 입력 EIL 시나리오`}</p>
      <p>{result?.eil_result?.note??'EIL은 이론적 경제적 피해수준입니다. 선형 피해–손실 관계 및 현장 적용을 검증해야 하며 경제적 방제수준(ET)·방제 명령으로 전용하지 않습니다.'}</p>
      <a href="https://ipmworld.umn.edu/pedigo" target="_blank" rel="noreferrer">계산식 출처: Pedigo · University of Minnesota IPM 교재 ↗</a>
    </fieldset>}
    <p role="status">{result?.status??'공식 경제적 피해기준 미확보 · 출처 확인 필요'}</p>
    <p>{result?.numeric_comparable?result.comparison:'밀도·단위·대상·적용조건이 충족되지 않아 비교하지 않습니다.'}</p>
    <p>{result?.origin??'사용자 입력값이며 공식 기준으로 자동 인정하지 않습니다.'}</p>
  </div>;
}
