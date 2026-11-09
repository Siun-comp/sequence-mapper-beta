// SPDX-License-Identifier: GPL-2.0-or-later
// Per-primer state of every shown record. Counts are records; they are not prevalence or importance.
import {expandRow,GAP} from './alignment.mjs';
import {MASK,siteForm,reverseComplement} from './primer.mjs';
export const CAT=Object.freeze({MATCH:0,MM1:1,MM2:2,INDEL:3,UNRESOLVED:4,UNCOVERED:5});
export const CAT_LABEL=Object.freeze(['일치','1 mismatch','2개 이상 mismatch','indel 포함','판정 불가(N 등)','구간 미포함']);
export const END3_FLAG=8,RULE_FLAG=16;
export const DEFAULT_RULE=Object.freeze({end3:5,maxMismatch:1});
const TOP_VARIANTS=30,YIELD_EVERY=4096;

export function classify(row,ins,p,end3){
 const {start,masks,strand}=p,L=masks.length;let mm=0,unresolved=false,indel=false,e3=false;
 for(let k=0;k<L;k++){const x=row[start+k];
  if(!x)return CAT.UNCOVERED;
  if(x===GAP){indel=true;continue;}
  if(k&&ins[start+k])indel=true;
  const m=MASK[x],want=masks[k];
  if(!(m&want)){mm++;if(strand>0?k>=L-end3:k<end3)e3=true;}
  else if(m&~want)unresolved=true;}
 const flag=e3?END3_FLAG:0;
 if(indel)return CAT.INDEL|flag;if(mm>1)return CAT.MM2|flag;if(unresolved)return CAT.UNRESOLVED|flag;if(mm===1)return CAT.MM1|flag;return CAT.MATCH;
}
// User rule: the last end3 bases at the 3' end match exactly and the whole primer has at most maxMismatch mismatches.
// Perfect matches pass. Indels, uncovered bases and bases that cannot be resolved do not.
export function passesRule(row,ins,p,{end3,maxMismatch}){
 const {start,masks,strand}=p,L=masks.length;let mm=0;
 for(let k=0;k<L;k++){const x=row[start+k];if(!x||x===GAP||(k&&ins[start+k]))return false;
  const m=MASK[x],want=masks[k];if(m&~want){if(m&want)return false;if(strand>0?k>=L-end3:k<end3)return false;if(++mm>maxMismatch)return false;}}
 return true;
}
// Generator: yields the records done so far, so the worker can stop between slices.
export function* computeBinding(S,order,primers,refLength,{end3=3,rule=DEFAULT_RULE,reference=null}={}){
 const P=primers.filter(p=>p.site).map(p=>({id:p.id,name:p.name,set:p.set,sequence:p.sequence,start:p.site.start,end:p.site.end,strand:p.site.strand,masks:Uint8Array.from(siteForm(p),c=>MASK[c.charCodeAt(0)]),counts:[0,0,0,0,0,0],end3:0,rule:0,variants:new Map()}));
 const rows=order.length,n=rows+(reference?1:0),row=new Uint8Array(refLength),ins=new Uint32Array(refLength),cats=new Uint8Array(P.length*n),dec=new TextDecoder();
 for(let v=0;v<n;v++){
  let ok=true;if(v<rows)ok=expandRow(S,order[v],row,ins);else{row.set(reference);ins.fill(0);}
  for(let j=0;j<P.length;j++){const p=P[j],pass=ok&&passesRule(row,ins,p,rule),c=(ok?classify(row,ins,p,end3):CAT.UNCOVERED)|(pass?RULE_FLAG:0),cat=c&7;cats[j*n+v]=c;p.counts[cat]++;if(c&END3_FLAG)p.end3++;if(pass)p.rule++;
   if(cat!==CAT.UNCOVERED){let key=dec.decode(row.subarray(p.start,p.end));for(let k=1;k<p.masks.length;k++)if(ins[p.start+k])key+=`\t${k}:${ins[p.start+k]}`;p.variants.set(key,(p.variants.get(key)||0)+1);}}
  if((v+1)%YIELD_EVERY===0)yield v+1;
 }
 const result=P.map(p=>{const list=[...p.variants].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1));
  return {id:p.id,name:p.name,set:p.set,start:p.start,end:p.end,strand:p.strand,total:n,counts:p.counts,end3:p.end3,rule:p.rule,variantCount:list.length,
   variants:list.slice(0,TOP_VARIANTS).map(([s,count])=>{const [body,...tags]=s.split('\t'),seq=body.replaceAll('\0','.'),marks=tags.map(t=>t.split(':').map(Number));return {sequence:markInsertions(p.strand>0?seq:reverseComplementSafe(seq),marks,p.strand),count,differences:differences(body,p.masks)+marks.reduce((a,m)=>a+m[1],0)};})};});
 return {result,cats,n,end3,rule,reference:!!reference};
}
// An insertion inside the site appears as (+n); only its length is kept per row.
function markInsertions(seq,marks,strand){let out=seq;for(const [at,n] of marks.map(([k,n])=>[strand>0?k:seq.length-k,n]).sort((a,b)=>b[0]-a[0]))out=`${out.slice(0,at)}(+${n})${out.slice(at)}`;return out;}
function differences(s,masks){let d=0;for(let k=0;k<masks.length;k++){const c=s.charCodeAt(k);if(c===GAP||!(MASK[c]&masks[k]))d++;}return d;}
const reverseComplementSafe=s=>s.includes('-')?[...s].reverse().map(c=>c==='-'?'-':reverseComplement(c)).join(''):reverseComplement(s);
export function runToEnd(gen){let x=gen.next();while(!x.done)x=gen.next();return x.value;}
// A counted reference is the extra last row and has no record position.
// Record positions of one table cell. cat is a category, 'end3' for any 3' mismatch, or 'rule' for the user rule.
export function recordsInCell(cats,n,primerIndex,order,cat){const out=[],base=primerIndex*n,rows=Math.min(n,order.length);for(let v=0;v<rows;v++){const c=cats[base+v];if(cat==='end3'?c&END3_FLAG:cat==='rule'?c&RULE_FLAG:(c&7)===cat)out.push(order[v]);}return Uint32Array.from(out);}
export const BINDING_NOTE='서열 비교 결과입니다. 증폭 성공을 뜻하지 않습니다. 건수는 수집 레코드 수이며 유행 비율이나 중요도가 아닙니다.';
