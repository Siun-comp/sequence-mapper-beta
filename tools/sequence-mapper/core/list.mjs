// SPDX-License-Identifier: GPL-2.0-or-later
// Sequence list before mapping. Records stay in the pool; choosing and sorting work on index arrays.
import {accessionOf,FLAG} from './parse.mjs';
export const MAX_LIST_BASES=1.5e9;
export const REASON=Object.freeze({LENGTH:1,NAME:2,AMBIGUOUS:4,DUPLICATE:8});
export const REASON_LABEL=Object.freeze({[REASON.LENGTH]:'길이',[REASON.NAME]:'이름',[REASON.AMBIGUOUS]:'N·혼합염기',[REASON.DUPLICATE]:'중복'});
const PLAIN=new Uint8Array(256);for(const c of 'ACGT')PLAIN[c.charCodeAt(0)]=1;

// One pass over the pool, done once when the files are read.
export function recordFacts({pool,offs,names}){
 const n=names.length,ambiguous=new Uint32Array(n),duplicate=new Uint8Array(n),seen=new Set();
 for(let i=0;i<n;i++){let a=0;for(let p=offs[i],e=offs[i+1];p<e;p++)if(!PLAIN[pool[p]])a++;ambiguous[i]=a;const id=accessionOf(names[i]);if(seen.has(id))duplicate[i]=1;else seen.add(id);}
 return {ambiguous,duplicate};
}
export const lengthOf=(L,i)=>L.offs[i+1]-L.offs[i];
export const notMappable=(L,i)=>!!(L.flags[i]&(FLAG.INVALID|FLAG.EMPTY));
// Writes the reasons each record fails the conditions; 0 means it passes.
export function applyConditions(L,{name='',min=null,max=null,maxAmbiguous=null,firstOnly=false},reasons){
 const q=name.trim().toLowerCase();
 for(let i=0;i<L.names.length;i++){const len=lengthOf(L,i);let r=0;
  if((min!==null&&len<min)||(max!==null&&len>max))r|=REASON.LENGTH;
  if(q&&!L.names[i].toLowerCase().includes(q))r|=REASON.NAME;
  if(maxAmbiguous!==null&&len&&L.ambiguous[i]*100>maxAmbiguous*len)r|=REASON.AMBIGUOUS;
  if(firstOnly&&L.duplicate[i])r|=REASON.DUPLICATE;
  reasons[i]=r;}
 return reasons;
}
export function sortedIds(L,key='input',ascending=true){
 const n=L.names.length,ids=Array.from({length:n},(_,i)=>i),sign=ascending?1:-1;
 if(key==='name')ids.sort((a,b)=>sign*(L.names[a]<L.names[b]?-1:L.names[a]>L.names[b]?1:0)||a-b);
 else if(key==='length')ids.sort((a,b)=>sign*(lengthOf(L,a)-lengthOf(L,b))||a-b);
 else if(key==='ambiguous')ids.sort((a,b)=>sign*(L.ambiguous[a]-L.ambiguous[b])||a-b);
 else if(!ascending)ids.reverse();
 return Uint32Array.from(ids);
}
export function visibleIds(sorted,reasons,showExcluded){if(showExcluded)return sorted;return sorted.filter(i=>!reasons[i]);}
// Mapping set in input order. The reference row is the yardstick, so it is not compared with itself.
export function selectedIds(reasons,manual,reference=-1){const out=[];for(let i=0;i<reasons.length;i++)if(!reasons[i]&&!manual[i]&&i!==reference)out.push(i);return Uint32Array.from(out);}
export function lengthSummary(L,ids){
 if(!ids.length)return null;const v=new Uint32Array(ids.length);for(let k=0;k<ids.length;k++)v[k]=lengthOf(L,ids[k]);v.sort();const m=v.length>>1;
 return {min:v[0],median:v.length&1?v[m]:(v[m-1]+v[m])/2,max:v.at(-1)};
}
export function lengthHistogram(L,chosen,bins=48){
 const n=L.names.length;let min=Infinity,max=0;for(let i=0;i<n;i++){const l=lengthOf(L,i);if(!l)continue;if(l<min)min=l;if(l>max)max=l;}
 const all=new Uint32Array(bins),kept=new Uint32Array(bins);if(max===0)return {min:0,max:0,all,kept};const scale=max>min?bins/(max-min+1):0;
 const bin=l=>Math.min(bins-1,Math.floor((l-min)*scale));
 for(let i=0;i<n;i++){const l=lengthOf(L,i);if(l)all[bin(l)]++;}
 for(const i of chosen){const l=lengthOf(L,i);if(l)kept[bin(l)]++;}
 return {min,max,all,kept};
}
export function basesOf(L,ids){let total=0,mappable=0;for(const i of ids){const l=lengthOf(L,i);total+=l;if(!notMappable(L,i))mappable+=l;}return {total,mappable};}
// Copies records [first,last) of ids into one mapping chunk, about maxBases long.
export function gatherChunk(data,ids,first,maxBases){
 let last=first+1,bases=data.offs[ids[first]+1]-data.offs[ids[first]];
 while(last<ids.length&&bases<maxBases){bases+=data.offs[ids[last]+1]-data.offs[ids[last]];last++;}
 const pool=new Uint8Array(bases),offs=new Uint32Array(last-first+1),flags=new Uint8Array(last-first);let p=0;
 for(let k=first;k<last;k++){const i=ids[k],a=data.offs[i],b=data.offs[i+1];pool.set(data.pool.subarray(a,b),p);p+=b-a;offs[k-first+1]=p;flags[k-first]=data.flags[i];}
 return {pool,offs,flags,last};
}
export function subsetData(data,ids){
 const n=ids.length;let bases=0;for(const i of ids)bases+=data.offs[i+1]-data.offs[i];
 const pool=new Uint8Array(bases),offs=new Uint32Array(n+1),flags=new Uint8Array(n),fileIdx=new Uint16Array(n),names=new Array(n);let p=0;
 for(let k=0;k<n;k++){const i=ids[k],a=data.offs[i],b=data.offs[i+1];pool.set(data.pool.subarray(a,b),p);p+=b-a;offs[k+1]=p;flags[k]=data.flags[i];fileIdx[k]=data.fileIdx[i];names[k]=data.names[i];}
 return {...data,pool,offs,flags,fileIdx,names};
}
