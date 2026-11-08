// SPDX-License-Identifier: GPL-2.0-or-later
import {createMapper} from '../engine/engine.mjs';
import {mapChunk} from '../core/map-chunk.mjs';
let mapper;
self.onmessage=async({data:d})=>{
 try{
  if(d.type==='init'){mapper=await createMapper(d.wasm);mapper.setReference(d.reference);self.postMessage({type:'ready'});return;}
  const r=mapChunk(mapper,d.pool,d.offs,d.flags);
  self.postMessage({type:'done',first:d.first,...r},[r.meta.buffer,r.cig.buffer,r.extra.buffer]);
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}
};
