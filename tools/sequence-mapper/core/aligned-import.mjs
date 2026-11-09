// SPDX-License-Identifier: GPL-2.0-or-later
// Reads an existing alignment (equal-length gapped rows) without mapping.
// One row is the reference; every other row becomes a record with a CIGAR against it.
import {STRIDE,REF,REV,QS,QE,MAPQ,HITS,COFF,CN,UNMAPPED,OP,GAP} from './alignment.mjs';
export function alignedRowLength(store){
 const n=store.offs.length-1;if(n<2)throw Error('정렬 파일에는 reference를 포함해 2행 이상이 필요합니다.');
 const w=store.offs[1]-store.offs[0];
 for(let i=1;i<n;i++)if(store.offs[i+1]-store.offs[i]!==w)throw Error(`${i+1}번째 행 길이가 다릅니다. 공통 열로 맞춘 정렬 파일이 아닙니다. (${store.names[i].slice(0,60)})`);
 if(!w)throw Error('정렬 행이 비어 있습니다.');
 return w;
}
export function findReferenceRow(names,query){
 const q=(query||'').trim().toLowerCase();if(!q)return 0;
 const hits=[];names.forEach((n,i)=>{if(n.toLowerCase().includes(q))hits.push(i);});
 if(!hits.length)throw Error(`기준 행 이름 “${query}”을 찾지 못했습니다.`);
 if(hits.length>1)throw Error(`기준 행 이름 “${query}”이 ${hits.length.toLocaleString()}개 행과 일치합니다. 더 구체적으로 입력하세요.`);
 return hits[0];
}
export function alignedToRecords(store,refRow){
 const width=alignedRowLength(store),rows=store.offs.length-1,R=store.pool.subarray(store.offs[refRow],store.offs[refRow]+width);
 const refBytes=[];for(let c=0;c<width;c++)if(R[c]!==GAP)refBytes.push(R[c]);
 if(!refBytes.length)throw Error('기준 행에 염기가 없습니다.');
 const n=rows-1,pool=new Uint8Array(store.pool.length),offs=new Uint32Array(n+1),meta=new Int32Array(n*STRIDE),names=[],flags=new Uint8Array(n),fileIdx=new Uint16Array(n),inputOrder=new Uint32Array(n);let cig=new Uint32Array(1<<16),cn=0,w=0,out=0;
 const push=(op,len)=>{if(cn===cig.length){const x=new Uint32Array(cn*2);x.set(cig);cig=x;}cig[cn++]=len*16+op;};
 for(let row=0;row<rows;row++){if(row===refRow)continue;
  const s=store.offs[row],b=out*STRIDE;names.push(store.names[row]);flags[out]=store.flags[row];fileIdx[out]=store.fileIdx[row];inputOrder[out]=row+1;
  let first=-1,last=-1;for(let c=0;c<width;c++)if(store.pool[s+c]!==GAP){if(first<0)first=c;last=c;}
  meta[b+COFF]=cn;
  if(first<0){meta[b+REF]=UNMAPPED;offs[++out]=w;continue;}
  let r=0;for(let c=0;c<first;c++)if(R[c]!==GAP)r++;
  let op=-1,run=0,q0=w,start=r;
  // A row beginning inside a reference gap starts with an insertion; report the next reference position as its start.
  const emit=()=>{if(run){push(op,run);run=0;}};
  for(let c=first;c<=last;c++){const x=store.pool[s+c],y=R[c];let o;
   if(y===GAP){if(x===GAP)continue;o=OP.I;}else if(x===GAP){o=OP.D;}else{o=x===y?OP.EQ:OP.X;}
   if(o!==op){emit();op=o;}run++;if(x!==GAP)pool[w++]=x;}
  emit();
  meta[b+REF]=start;meta[b+REV]=0;meta[b+QS]=0;meta[b+QE]=w-q0;meta[b+MAPQ]=255;meta[b+HITS]=1;meta[b+CN]=cn-meta[b+COFF];offs[++out]=w;
 }
 return {reference:{name:store.names[refRow],sequence:Uint8Array.from(refBytes)},data:{pool:pool.slice(0,w),offs,flags,fileIdx,names,inputOrder,meta,cig:cig.slice(0,cn),extra:new Int32Array(0)},columns:width};
}
