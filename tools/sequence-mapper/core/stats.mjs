// SPDX-License-Identifier: GPL-2.0-or-later
// Position statistics over a chosen set of records. The reference itself is never counted.
import {expandRow,countRow,identityOf,recordLength,coversBase,STRIDE,REF,QS,QE,HITS,GAP} from './alignment.mjs';
const SLOT=new Uint8Array(256).fill(4);SLOT[65]=0;SLOT[67]=1;SLOT[71]=2;SLOT[84]=3;SLOT[GAP]=5; // A C G T other deletion
const IUPAC={1:'A',2:'C',4:'G',8:'T',3:'M',5:'R',9:'W',6:'S',10:'Y',12:'K',7:'V',11:'H',13:'D',14:'B',15:'N'};
export const POSITION_DEFINITIONS=Object.freeze({
 coverage:'위치를 덮는 서열 수. 정렬 구간 안의 deletion을 포함하고, 정렬 밖은 세지 않습니다. Reference 자신은 세지 않습니다.',
 called:'그 위치에서 A/C/G/T로 읽힌 서열 수.',
 identity:'위치별 최다 염기 수 ÷ (A+C+G+T+deletion). 비교 서열끼리 얼마나 같은지를 나타내며 Reference 일치율이 아닙니다. N 등 혼합염기는 분모에서 뺍니다.',
 variant:'Reference와 다른 판독(치환, deletion)이 1개 이상인 위치. N 등 혼합염기는 세지 않고, insertion은 따로 셉니다. Reference 자신은 세지 않습니다.',
 alignment:'각 서열을 Reference 좌표에 배치한 결과입니다. insertion끼리는 서로 다시 정렬하지 않습니다. 역위나 원점이 다른 서열은 주 정렬 구간만 표시합니다.',
 consensus:'기본은 현재 표시 서열의 최다 염기입니다. 기준 %를 정하면 많은 염기부터 더해 A/C/G/T 판독의 그 비율에 도달할 때까지의 염기를 IUPAC 코드로 표시합니다. 같은 수의 염기는 함께 포함합니다. deletion이 최다이면 -, 덮는 서열이 없으면 표시하지 않습니다. Reference는 포함하지 않습니다.'});

const BASES=[1,2,4,8];
// percent 0 keeps only the most frequent base. Bases with equal counts always enter together, so the result never depends on input order.
function codeAt(counts,b,percent){
 const d=counts[b+5];let max=0,total=0;for(let k=0;k<4;k++){const v=counts[b+k];total+=v;if(v>max)max=v;}
 if(d>max)return GAP;if(!max)return 78;
 let mask=0,level=max,sum=0;
 for(;;){let next=0;for(let k=0;k<4;k++){const v=counts[b+k];if(v===level){mask|=BASES[k];sum+=v;}else if(v<level&&v>next)next=v;}if(!next||sum*100>=percent*total)break;level=next;}
 return IUPAC[mask].charCodeAt(0);
}
export function buildConsensus(counts,coverage,percent=0){const L=coverage.length,out=new Uint8Array(L);for(let r=0;r<L;r++)if(coverage[r])out[r]=codeAt(counts,r*6,percent);return out;}
export function computeStats(S,order,refLength,percent=0){
 const L=refLength,row=new Uint8Array(L),ins=new Uint32Array(L+1),counts=new Uint32Array(L*6),insMax=new Uint32Array(L+1),insRows=new Uint32Array(L+1);
 for(let n=0;n<order.length;n++){const i=order[n];if(!expandRow(S,i,row,ins))continue;
  for(let r=0;r<L;r++){const x=row[r];if(x)counts[r*6+SLOT[x]]++;const m=ins[r];if(m){insRows[r]++;if(m>insMax[r])insMax[r]=m;}}
  const tail=ins[L];if(tail){insRows[L]++;if(tail>insMax[L])insMax[L]=tail;}}
 const coverage=new Uint32Array(L),called=new Uint32Array(L),identity=new Float32Array(L),consensus=new Uint8Array(L);
 for(let r=0;r<L;r++){const b=r*6,a=counts[b],c=counts[b+1],g=counts[b+2],t=counts[b+3],o=counts[b+4],d=counts[b+5];
  const acgt=a+c+g+t,max=Math.max(a,c,g,t);coverage[r]=acgt+o+d;called[r]=acgt;
  identity[r]=acgt+d?Math.max(max,d)/(acgt+d):NaN;
  if(coverage[r])consensus[r]=codeAt(counts,b,percent);}
 return {coverage,called,identity,consensus,counts,insMax,insRows};
}
// True when a read at this position disagrees with the code it is compared to. Ambiguous reads stay out, and an N position says nothing.
const READ_BASES=[65,67,71,84];
export function differsFrom(counts,r,code){if(!code||code===78)return false;const b=r*6;for(let k=0;k<4;k++)if(counts[b+k]&&!coversBase(code,READ_BASES[k]))return true;return counts[b+5]>0&&code!==GAP;}
// Per-record numbers for the table and filters. Six ints per record.
export const RS=6,RS_MATCH=0,RS_MISMATCH=1,RS_AMBIG=2,RS_INS=3,RS_DEL=4,RS_REFEND=5;
export function computeRecordStats(S,ref){
 const n=S.offs.length-1,out=new Int32Array(n*RS);
 for(let i=0;i<n;i++){const c=countRow(S,i,ref),b=i*RS;out[b]=c.match;out[b+1]=c.mismatch;out[b+2]=c.ambiguous;out[b+3]=c.insertion;out[b+4]=c.deletion;out[b+5]=c.refEnd;}
 return out;
}
export function identityFromStats(R,i){const b=i*RS;return identityOf({match:R[b],mismatch:R[b+1],insertion:R[b+3],deletion:R[b+4]});}
export function queryCoverage(S,i){const m=S.meta,b=i*STRIDE,len=recordLength(S,i);return m[b+REF]>=0&&len?(m[b+QE]-m[b+QS])/len:0;}
export function referenceCoverage(S,R,i,refLength){const b=i*STRIDE;return S.meta[b+REF]>=0?(R[i*RS+RS_REFEND]-S.meta[b+REF])/refLength:0;}
export const PARTIAL_QUERY_COVERAGE=.95;
// Separate states on purpose; none of them is folded into another.
export function statusOf(S,i){
 const r=S.meta[i*STRIDE+REF];if(r===-2)return 'skipped';if(r<0)return 'unmapped';
 return queryCoverage(S,i)<PARTIAL_QUERY_COVERAGE?'partial':'mapped';
}
export const STATUS_LABEL=Object.freeze({mapped:'정렬됨',partial:'일부만 정렬',unmapped:'정렬 안 됨',skipped:'입력 오류로 제외'});
export function summarize(S){
 const n=S.offs.length-1,c={mapped:0,partial:0,unmapped:0,skipped:0,multi:0,reverse:0};
 for(let i=0;i<n;i++){c[statusOf(S,i)]++;const b=i*STRIDE;if(S.meta[b+HITS]>1)c.multi++;if(S.meta[b+REF]>=0&&S.meta[b+1])c.reverse++;}
 return c;
}
export {QS,QE};
