// SPDX-License-Identifier: GPL-2.0-or-later
export const FIELDS=['temperature','na','k','nh4','mg','dntp','a','b'];
const decimal=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
function numberFromInput(value){
 const s=String(value??'').trim();
 return decimal.test(s)&&Number.isFinite(Number(s))?Number(s):NaN;
}
export function conditionFieldIssue(field,value){
 const n=numberFromInput(value);
 if(!Number.isFinite(n))return {field,code:'number'};
 if(field==='temperature'&&(n<0||n>100))return {field,code:'temperature-range'};
 if(['a','b'].includes(field)?n<=0:n<0)return {field,code:'concentration-range'};
 return null;
}
export function conditionIssue(input){
 for(const field of FIELDS){
  const issue=conditionFieldIssue(field,input[field]);
  if(issue)return issue;
 }
 const sum=['na','k','nh4'].reduce((a,k)=>a+numberFromInput(input[k]),0);
 return !Number.isFinite(sum)||sum===0&&numberFromInput(input.mg)===0?{field:'na',code:'salt-domain'}:null;
}
export function conditionsFromStrings(input){
 const c={};
 for(const k of FIELDS){const n=numberFromInput(input[k]);if(!Number.isFinite(n))throw new Error('온도·이온·A/B 농도의 모든 수치 칸을 유한한 수로 입력하세요.');c[k]=n;}
 if(c.temperature<=-273.15)throw new Error('절대온도는 0 K보다 커야 합니다. 입력 가능 여부는 실측 검증 범위를 뜻하지 않습니다.');
 if(['na','k','nh4','mg','dntp'].some(k=>c[k]<0)||c.a<=0||c.b<=0)throw new Error('이온은 0 이상, 각 가닥 농도는 0보다 커야 합니다.');
 if(c.na+c.k+c.nh4<=0&&c.mg<=0)throw new Error('현재 염 모델의 로그 정의역에 들어가지 않습니다. 이온 입력을 확인하세요.');
 if(!Number.isFinite(c.na+c.k+c.nh4))throw new Error('단가염 합계가 유한한 수의 범위를 벗어납니다.');
 return {...c,temperatureK:c.temperature+273.15,monoMm:c.na+c.k+c.nh4};
}
