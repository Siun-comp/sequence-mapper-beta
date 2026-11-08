// SPDX-License-Identifier: GPL-2.0-or-later
// Length, GC, Tm and self-dimer of a selected stretch. Tm and dimer models are the existing LabTools ones, imported unchanged.
import {duplex} from '../../oligo-thermodynamics/duplex-nn.mjs';
import {conditionsFromStrings} from '../../oligo-thermodynamics/conditions.mjs';
import {runAnalysis,expand,variantCount,formatDG,isWarning,LIMITS as DIMER_LIMITS} from '../../oligo-analysis/core.mjs';
export const DEFAULT_CONDITIONS=Object.freeze({temperature:'60',na:'50',k:'0',nh4:'0',mg:'3',dntp:'0.8',a:'200',b:'200'});
export const TM_RANGE=Object.freeze({min:2,max:60}),SELF_MAX_LENGTH=DIMER_LIMITS.length,SELF_MAX_VARIANTS=64;
const GC_CERTAIN=new Set('GCS'),GC_POSSIBLE=new Set('GCSRYKMBDHVN');
export function gcRange(seq){let lo=0,hi=0;for(const c of seq){if(GC_CERTAIN.has(c))lo++;if(GC_POSSIBLE.has(c))hi++;}return {min:lo/seq.length*100,max:hi/seq.length*100};}
export function tmSummary(seq,conditions){
 if(seq.length<TM_RANGE.min||seq.length>TM_RANGE.max)return {status:'na',reason:`Tm은 ${TM_RANGE.min}–${TM_RANGE.max} nt만 지원합니다.`};
 const count=variantCount(seq);if(count>DIMER_LIMITS.variants)return {status:'na',reason:`혼합염기 조합 ${count.toLocaleString()}종은 상한 ${DIMER_LIMITS.variants.toLocaleString()}종을 넘습니다.`};
 let c;try{c=conditionsFromStrings(conditions);}catch(e){return {status:'na',reason:e.message};}
 const values=[];let model='';
 for(const v of expand(seq)){const r=duplex(v,c);if(!Number.isFinite(r.tm))return {status:'na',reason:r.reason||'이 조건에서 Tm을 계산할 수 없습니다.'};values.push(r.tm);model=r.model;}
 const min=Math.min(...values),max=Math.max(...values);
 return {status:'ok',min,max,mean:values.reduce((a,b)=>a+b,0)/values.length,variants:count,model};
}
export function selfDimerSummary(seq){
 if(seq.length>SELF_MAX_LENGTH)return {status:'na',reason:`Self-dimer는 ${SELF_MAX_LENGTH} nt까지입니다.`};
 const count=variantCount(seq);if(count>SELF_MAX_VARIANTS)return {status:'na',reason:`혼합염기 조합 ${count.toLocaleString()}종은 실시간 계산 범위(${SELF_MAX_VARIANTS}종)를 넘습니다. Oligo-dimer analysis에서 확인하세요.`};
 const {pairs}=runAnalysis([{name:'선택 구간',sequence:seq,line:1}],'idt',{self:true,hetero:false,poly:false}),p=pairs[0];
 if(!p.structures.length)return {status:'none',variants:count};
 return {status:'ok',minimum:p.minimum,text:formatDG(p.minimum),warning:isWarning(p.minimum),structures:p.structures.length,variants:count,diagram:p.structures[0].diagram};
}
export function analyzeSelection(seq,conditions=DEFAULT_CONDITIONS){return {length:seq.length,gc:gcRange(seq),tm:tmSummary(seq,conditions),self:selfDimerSummary(seq)};}
