// SPDX-License-Identifier: GPL-2.0-or-later
// Project file: gzip of [magic][manifest length][manifest JSON][binary sections]. Written and read as streams.
import {STRIDE,REF,QS,QE,COFF,CN,OP} from './alignment.mjs';
export const MAGIC='JSUMAP1\n',FORMAT='jsu-sequence-mapper',SCHEMA=1,MAX_SECTION_BYTES=4e9;
const TYPES={u8:Uint8Array,u16:Uint16Array,u32:Uint32Array,i32:Int32Array},SLICE=1<<23,enc=new TextEncoder(),dec=new TextDecoder();
const kindOf=a=>Object.entries(TYPES).find(([,T])=>a instanceof T)?.[0];
const bytesOf=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
export async function sha256(view){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',view))].map(x=>x.toString(16).padStart(2,'0')).join('');}

export async function writeProject(info,sections,sink,onProgress=()=>{}){
 const list=[];let total=0;
 for(const [name,array] of Object.entries(sections)){const kind=kindOf(array);if(!kind)throw Error('저장할 수 없는 자료 형식: '+name);list.push({name,kind,bytes:array.byteLength,sha256:await sha256(bytesOf(array))});total+=array.byteLength;}
 const manifest=enc.encode(JSON.stringify({format:FORMAT,schema:SCHEMA,...info,sections:list})),head=new Uint8Array(MAGIC.length+4);
 head.set(enc.encode(MAGIC));new DataView(head.buffer).setUint32(MAGIC.length,manifest.length,true);
 const gz=new CompressionStream('gzip'),writer=gz.writable.getWriter(),reader=gz.readable.getReader();let written=0;
 const drain=(async()=>{for(;;){const {done,value}=await reader.read();if(done)return;await sink.write(value);written+=value.length;}})();
 try{
  await writer.write(head);await writer.write(manifest);let done=0;
  for(const array of Object.values(sections)){const b=bytesOf(array);for(let p=0;p<b.length;p+=SLICE){await writer.ready;await writer.write(b.slice(p,p+SLICE));done+=Math.min(SLICE,b.length-p);onProgress(done,total);}}
  await writer.close();await drain;
 }catch(e){await writer.abort(e).catch(()=>{});await drain.catch(()=>{});throw e;}
 return written;
}
export async function readProject(stream,onProgress=()=>{}){
 const reader=stream.pipeThrough(new DecompressionStream('gzip')).getReader();
 let carry=new Uint8Array(0);
 const fill=async need=>{while(carry.length<need){let r;try{r=await reader.read();}catch{throw Error('프로젝트 파일이 손상되었거나 끝까지 저장되지 않았습니다.');}if(r.done)throw Error('프로젝트 파일이 끝까지 저장되지 않았습니다.');const x=new Uint8Array(carry.length+r.value.length);x.set(carry);x.set(r.value,carry.length);carry=x;}};
 const take=async n=>{await fill(n);const out=carry.subarray(0,n);carry=carry.subarray(n);return out;};
 const magic=dec.decode(await take(MAGIC.length));if(magic!==MAGIC)throw Error('Sequence Mapper 프로젝트 파일이 아닙니다.');
 const size=new DataView((await take(4)).slice().buffer).getUint32(0,true);if(size>1<<28)throw Error('프로젝트 머리글이 비정상입니다.');
 let manifest;try{manifest=JSON.parse(dec.decode(await take(size)));}catch{throw Error('프로젝트 머리글을 읽을 수 없습니다.');}
 if(manifest.format!==FORMAT)throw Error('Sequence Mapper 프로젝트 파일이 아닙니다.');
 if(manifest.schema>SCHEMA)throw Error(`더 새로운 버전(형식 ${manifest.schema})의 프로젝트입니다. 도구를 새로고침하세요.`);
 if(!Number.isInteger(manifest.schema)||!Array.isArray(manifest.sections))throw Error('프로젝트 머리글이 비정상입니다.');
 const total=manifest.sections.reduce((s,x)=>s+x.bytes,0),out={};let done=0;
 for(const s of manifest.sections){const T=TYPES[s.kind];if(!T||!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>MAX_SECTION_BYTES||s.bytes%T.BYTES_PER_ELEMENT)throw Error('프로젝트 구획 정보가 비정상입니다: '+s.name);
  const b=new Uint8Array(s.bytes);let p=0;if(carry.length){const n=Math.min(carry.length,s.bytes);b.set(carry.subarray(0,n));carry=carry.subarray(n);p=n;}
  while(p<s.bytes){let r;try{r=await reader.read();}catch{throw Error('프로젝트 파일이 손상되었거나 끝까지 저장되지 않았습니다.');}if(r.done)throw Error('프로젝트 파일이 끝까지 저장되지 않았습니다.');const n=Math.min(r.value.length,s.bytes-p);b.set(r.value.subarray(0,n),p);p+=n;if(n<r.value.length)carry=r.value.subarray(n);done+=n;onProgress(done,total);}
  if(await sha256(b)!==s.sha256)throw Error(`프로젝트 내용이 손상되었습니다: ${s.name}`);
  out[s.name]=new T(b.buffer);}
 return {manifest,sections:out};
}
// Checks the links between sections, so a damaged or hand-made file cannot send the viewer out of bounds.
export function checkDataset(S,refLength,nameCount){
 const n=S.offs.length-1;if(n!==nameCount)throw Error('서열 수와 이름 수가 맞지 않습니다.');if(S.meta.length!==n*STRIDE)throw Error('정렬 기록 수가 맞지 않습니다.');if(S.offs[n]!==S.pool.length)throw Error('서열 길이 기록이 맞지 않습니다.');
 for(let i=0;i<n;i++){if(S.offs[i+1]<S.offs[i])throw Error('서열 위치 기록이 맞지 않습니다.');const b=i*STRIDE,r=S.meta[b+REF];if(r<0)continue;
  if(r>=refLength||S.meta[b+COFF]<0||S.meta[b+CN]<0||S.meta[b+COFF]+S.meta[b+CN]>S.cig.length||S.meta[b+QS]<0||S.meta[b+QE]>S.offs[i+1]-S.offs[i])throw Error(`${i+1}번째 서열의 정렬 기록이 맞지 않습니다.`);
  let onRef=0,onQuery=0;for(let c=S.meta[b+COFF],e=c+S.meta[b+CN];c<e;c++){const v=S.cig[c],l=v>>>4,op=v&15;if(op===OP.EQ||op===OP.X||op===OP.M){onRef+=l;onQuery+=l;}else if(op===OP.I)onQuery+=l;else if(op===OP.D)onRef+=l;}
  if(r+onRef>refLength||onQuery>S.offs[i+1]-S.offs[i])throw Error(`${i+1}번째 서열의 정렬 길이가 맞지 않습니다.`);}
 const x=S.extra??[];if(x.length%9)throw Error('추가 정렬 기록이 맞지 않습니다.');for(let e=0;e<x.length;e+=9)if(x[e]<0||x[e]>=n||x[e+7]<0||x[e+8]<0||x[e+7]+x[e+8]>S.cig.length)throw Error('추가 정렬 기록이 맞지 않습니다.');
 if(S.inputOrder&&S.inputOrder.length!==n)throw Error('입력 순서 기록이 맞지 않습니다.');
}
export const encodeNames=names=>enc.encode(names.join('\n'));
export const decodeNames=bytes=>bytes.length?dec.decode(bytes).split('\n'):[];
