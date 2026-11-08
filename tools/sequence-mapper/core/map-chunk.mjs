// SPDX-License-Identifier: GPL-2.0-or-later
import {STRIDE,REF,REV,QS,QE,MAPQ,HITS,COFF,CN,UNMAPPED,SKIPPED} from './alignment.mjs';
import {FLAG} from './parse.mjs';
export const EXTRA_STRIDE=9;
const HEAD=10;
// Maps one chunk. Primary hits go to meta; other hits are kept in extra with CIGARs, never dropped.
export function mapChunk(mapper,pool,offs,flags){
 const n=offs.length-1,meta=new Int32Array(n*STRIDE),extra=[];let cig=new Uint32Array(1<<16),cn=0;
 const add=(v,p,c)=>{if(cn+c>cig.length){let m=cig.length*2;while(m<cn+c)m*=2;const x=new Uint32Array(m);x.set(cig.subarray(0,cn));cig=x;}for(let j=0;j<c;j++)cig[cn++]=v[p+j]>>>0;};
 for(let i=0;i<n;i++){const b=i*STRIDE;meta[b+COFF]=cn;
  if(flags[i]&(FLAG.INVALID|FLAG.EMPTY)){meta[b+REF]=SKIPPED;continue;}
  const {count,view:v}=mapper.mapRaw(pool.subarray(offs[i],offs[i+1]));
  if(!count){meta[b+REF]=UNMAPPED;continue;}
  let p=1,primary=-1,q=1;
  for(let h=0;h<count;h++){if(v[q+6]&2){primary=h;break;}q+=HEAD+v[q+9];}
  if(primary<0)primary=0;
  for(let h=0;h<count;h++){const c=v[p+9];
   if(h===primary){meta[b+REF]=v[p+1];meta[b+REV]=v[p];meta[b+QS]=v[p+3];meta[b+QE]=v[p+4];meta[b+MAPQ]=v[p+5];meta[b+HITS]=count;meta[b+COFF]=cn;meta[b+CN]=c;add(v,p+HEAD,c);}
   p+=HEAD+c;}
  p=1;
  for(let h=0;h<count;h++){const c=v[p+9];
   if(h!==primary){extra.push(i,v[p+1],v[p],v[p+3],v[p+4],v[p+5],v[p+6]&1,cn,c);add(v,p+HEAD,c);}
   p+=HEAD+c;}
 }
 return {meta,cig:cig.slice(0,cn),extra:Int32Array.from(extra),memoryBytes:mapper.memoryBytes};
}
// Joins chunk results; CIGAR offsets and record numbers shift to dataset positions.
export function mergeChunks(n,parts){
 const meta=new Int32Array(n*STRIDE),total=parts.reduce((s,x)=>s+x.cig.length,0),cig=new Uint32Array(total),ex=[];let c=0;
 const sorted=[...parts].sort((a,b)=>a.first-b.first);
 for(const x of sorted){cig.set(x.cig,c);const rows=x.meta.length/STRIDE;meta.set(x.meta,x.first*STRIDE);for(let r=x.first;r<x.first+rows;r++)meta[r*STRIDE+COFF]+=c;
  for(let e=0;e<x.extra.length;e+=EXTRA_STRIDE){ex.push(x.extra[e]+x.first);for(let k=1;k<EXTRA_STRIDE;k++)ex.push(x.extra[e+k]+(k===7?c:0));}
  c+=x.cig.length;}
 return {meta,cig,extra:Int32Array.from(ex)};
}
