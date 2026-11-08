// SPDX-License-Identifier: GPL-2.0-or-later
// Loader for the minimap2 WASM build. Sequences go through memory; no files, no threads, no network.
export const ENGINE=Object.freeze({name:'minimap2',version:'2.31',wasmSha256:'437f2b93b2f0f2dfaa5eb7482b269f5f2146db8b44497b4f28e7c0a619344fd1'});
// Stage-0 sensitivity results (docs/240): keeps 30% divergent and 100 nt queries; the asm20 preset lost both.
export const MAP_OPTIONS=Object.freeze({preset:'map-ont',k:11,w:3,minCnt:2,minChain:15,minDp:30,bw:0});
export const PARAMETERS=`-x ${MAP_OPTIONS.preset} -k ${MAP_OPTIONS.k} -w ${MAP_OPTIONS.w} -n ${MAP_OPTIONS.minCnt} -m ${MAP_OPTIONS.minChain} -s ${MAP_OPTIONS.minDp} --eqx`;
export async function createMapper(bytes){
 let e;
 const noFile=()=>8; // WASI EBADF: no preopened files exist
 const clock=(id,precision,ptr)=>{new DataView(e.memory.buffer).setBigUint64(ptr,BigInt(Math.round(performance.now()*1e6)),true);return 0;};
 const wasi=new Proxy({clock_time_get:clock,proc_exit(n){throw Error('매핑 엔진 종료 '+n);},fd_write(fd,iov,count,written){new DataView(e.memory.buffer).setUint32(written,0,true);return 0;}},{get:(t,k)=>t[k]??noFile});
 e=(await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:wasi})).instance.exports;e._initialize();
 const put=b=>{const p=e.mp_in(b.length+1);new Uint8Array(e.memory.buffer,p,b.length).set(b);return b.length;};
 return {
  setReference(ref,o=MAP_OPTIONS){const name=new TextEncoder().encode(o.preset+'\0'),np=e.malloc(name.length);new Uint8Array(e.memory.buffer,np,name.length).set(name);const st=e.mp_ref(put(ref),np,o.k,o.w,o.minCnt,o.minChain,o.minDp,o.bw);if(st)throw Error('Reference 색인 실패 '+st);},
  // Returns hits as packed ints: [rev,rs,re,qs,qe,mapq,flags,mlen,blen,ncig,cig...]; valid until the next call.
  mapRaw(seq){const n=e.mp_map(put(seq));return {count:n,view:new Int32Array(e.memory.buffer,e.mp_out())};},
  get memoryBytes(){return e.memory.buffer.byteLength;}
 };
}
