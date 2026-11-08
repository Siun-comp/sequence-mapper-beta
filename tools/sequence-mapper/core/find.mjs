// SPDX-License-Identifier: GPL-2.0-or-later
// Sequence search for the find bar. Hits are locations of text in the data, not binding sites.
import {MASK,reverseComplement} from './primer.mjs';
import {STRIDE,REF,REV,GAP,columnOfQuery} from './alignment.mjs';
export const FIND_LIMITS=Object.freeze({minLength:4,maxLength:200,maxMismatch:3,maxHits:500000});
export const HIT_STRIDE=5;
const PLAIN=new Uint8Array(256);for(const c of 'ACGT')PLAIN[c.charCodeAt(0)]=1;
const LETTERS=[...'ACGTRYSWKMBDHVN'].map(c=>c.charCodeAt(0));

export function parseQuery(raw,maxMismatch=0){
 const s=String(raw??'').toUpperCase().replace(/^\s*5['′]?\s*-?\s*/,'').replace(/\s*-?\s*3['′]?\s*$/,'').replace(/\s+/g,'').replace(/U/g,'T');
 if(!s)return {error:'찾을 서열을 입력하세요.'};
 const bad=[...new Set([...s].filter(c=>!MASK[c.charCodeAt(0)]))];
 if(bad.length)return {error:`서열에 쓸 수 없는 문자: ${bad.join(' ')}. 이름을 찾으려면 범위를 이름으로 바꾸세요.`};
 if(s.length<FIND_LIMITS.minLength)return {error:`${FIND_LIMITS.minLength} nt 이상 입력하세요.`};
 if(s.length>FIND_LIMITS.maxLength)return {error:`${FIND_LIMITS.maxLength} nt까지 찾을 수 있습니다.`};
 if(maxMismatch*4>s.length)return {error:`mismatch ${maxMismatch}개를 허용하려면 ${maxMismatch*4} nt 이상이어야 합니다.`};
 return {sequence:s};
}
// One 256-entry row per pattern position, so the scan needs a single lookup per base whatever the options are.
export function matchTable(pattern,{queryAmbiguity=true,sequenceAmbiguity=true}={}){
 const table=new Uint8Array(pattern.length*256);
 for(let k=0;k<pattern.length;k++){const q=pattern.charCodeAt(k),qm=PLAIN[q]||queryAmbiguity?MASK[q]:0;
  for(const t of LETTERS){const tm=PLAIN[t]||sequenceAmbiguity?MASK[t]:0;if(q===t||qm&tm)table[k*256+t]=1;}}
 return table;
}
// Strand is relative to the screen. A reverse record is stored opposite to the screen, so it is scanned with the flipped forms.
export function buildForms(sequence,options={}){
 const rc=reverseComplement(sequence),length=sequence.length,fwd=matchTable(sequence,options),back=matchTable(rc,options),forms=[{strand:1,length,table:fwd}],flipped=[{strand:1,length,table:back}];
 if(options.bothStrands!==false&&rc!==sequence){forms.push({strand:-1,length,table:back});flipped.push({strand:-1,length,table:fwd});}
 forms.flipped=flipped;return forms;
}
// Appends start, end, strand, mismatches relative to from.
export function scan(bytes,from,to,form,maxMismatch,out){
 const {table,length,strand}=form;
 for(let p=from,e=to-length;p<=e;p++){let miss=0,k=0,t=0;for(;k<length;k++,t+=256)if(!table[t+bytes[p+k]]&&++miss>maxMismatch)break;if(k===length)out.push(p-from,p-from+length,strand,miss);}
}
// Reference or consensus. Gaps drop out so a site across a deletion is still found; positions map back to the target.
export function findInTarget(target,forms,{maxMismatch=0,limit=FIND_LIMITS.maxHits}={}){
 const bytes=new Uint8Array(target.length),pos=new Int32Array(target.length);let n=0;
 for(let i=0;i<target.length;i++)if(target[i]!==GAP){bytes[n]=target[i];pos[n++]=i;}
 const raw=[];for(const f of forms)scan(bytes,0,n,f,maxMismatch,raw);
 const hits=[];for(let k=0;k<raw.length;k+=4)hits.push({start:pos[raw[k]],end:pos[raw[k+1]-1]+1,strand:raw[k+2],mismatches:raw[k+3]});
 hits.sort((a,b)=>a.start-b.start||b.strand-a.strand);
 return {hits:hits.slice(0,limit),capped:hits.length>limit};
}
// Walks the shown rows in order without copying any record.
// Yields {done,hits}; hits is flat [viewRow,c0,c1,strand,mismatches]. Bases outside the alignment have no column and are only counted.
export function* findInRows(S,order,cols,forms,{maxMismatch=0,limit=FIND_LIMITS.maxHits,slice=2048}={}){
 let batch=[],total=0,outside=0,capped=false;const raw=[],row=[];
 for(let n=0;n<order.length;n++){const i=order[n],b=i*STRIDE;
  if(S.meta[b+REF]>=0){raw.length=0;const o=S.offs[i],len=S.offs[i+1]-o,rev=S.meta[b+REV];
   for(const f of rev?forms.flipped:forms)scan(S.pool,o,o+len,f,maxMismatch,raw);
   if(raw.length){row.length=0;
    for(let k=0;k<raw.length;k+=4){const a=rev?len-raw[k+1]:raw[k],z=rev?len-raw[k]:raw[k+1],c0=columnOfQuery(S,i,cols,a),c1=columnOfQuery(S,i,cols,z-1);if(c0<0||c1<0){outside++;continue;}row.push([n,c0,c1+1,raw[k+2],raw[k+3]]);}
    row.sort((p,q)=>p[1]-q[1]||q[3]-p[3]);
    for(const h of row){if(total>=limit){capped=true;break;}batch.push(...h);total++;}}}
  if(capped)break;
  if((n+1)%slice===0){yield {done:n+1,hits:batch};batch=[];}
 }
 return {hits:batch,total,outside,capped};
}
