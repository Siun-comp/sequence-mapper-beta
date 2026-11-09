// SPDX-License-Identifier: GPL-2.0-or-later
import {RecordStore,readInto,readRecordInfo,summarizeFlags,duplicateIds} from '../core/parse.mjs';
import {recordFacts} from '../core/list.mjs';
import {alignedToRecords,alignedRowLength,findReferenceRow} from '../core/aligned-import.mjs';
import {readProject,checkDataset,decodeNames} from '../core/project.mjs';
const send=(m,t=[])=>self.postMessage(m,t);
async function loadMapping({reference,queries}){
 let seen=0,yardstick=null;const total=queries.reduce((s,f)=>s+f.size,0)+(reference?.size??0),onBytes=n=>{seen+=n;send({type:'progress',done:seen,total});};
 if(reference){const rs=new RecordStore(1<<20),rr=await readInto(rs,reference,0,{keepFeatures:true,onBytes}),ro=rs.finish();
  if(rr.errors.length)throw Error(`Reference ${reference.name}: ${rr.errors[0]}`);
  if(ro.names.length!==1)throw Error(`Reference 파일에는 서열 1개만 있어야 합니다. (현재 ${ro.names.length.toLocaleString()}개)`);
  if(ro.flags[0]&1)throw Error('Reference에 지원하지 않는 문자가 있습니다: '+ro.badChars.map(x=>x[0]).join(' '));
  yardstick={name:ro.names[0],sequence:ro.pool,features:rr.features,format:rr.format,source:rr.source,file:reference.name,flags:ro.flags[0]};}
 const store=new RecordStore(Math.max(1<<20,Math.min(total,2**31))),reports=[];
 for(let i=0;i<queries.length;i++)reports.push(await readInto(store,queries[i],i,{onBytes}));
 const q=store.finish(),counts=summarizeFlags(q.flags);
 return {reference:yardstick,data:q,facts:recordFacts(q),reports,counts,duplicates:duplicateIds(q.names),files:queries.map(f=>f.name)};
}
async function loadAligned({file,referenceName}){
 let seen=0;const store=new RecordStore(Math.max(1<<20,Math.min(file.size,2**31)),true),report=await readInto(store,file,0,{onBytes(n){seen+=n;send({type:'progress',done:seen,total:file.size});}});
 if(report.errors.length)throw Error(report.errors[0]);
 const raw=store.finish();if(raw.badChars.length)throw Error('정렬 파일에 지원하지 않는 문자가 있습니다: '+raw.badChars.map(x=>x[0]).join(' '));alignedRowLength(raw);
 const row=findReferenceRow(raw.names,referenceName),res=alignedToRecords(raw,row);
 return {reference:{name:res.reference.name,sequence:res.reference.sequence,features:null,format:'Aligned FASTA',source:null,file:file.name,flags:0},data:res.data,reports:[report],counts:summarizeFlags(res.data.flags),duplicates:duplicateIds(res.data.names),files:[file.name],columns:res.columns,rows:res.data.names.length+1};
}
async function loadProject({file}){
 const {manifest,sections:x}=await readProject(file.stream(),(done,total)=>send({type:'progress',done,total})),names=decodeNames(x.names),data={pool:x.pool,offs:x.offs,flags:x.flags,fileIdx:x.fileIdx,meta:x.meta,cig:x.cig,extra:x.extra,...(x.inputOrder?{inputOrder:x.inputOrder}:{})};
 checkDataset(data,x.ref.length,names.length);return {manifest,ref:x.ref,data:{...data,names},bindingCats:x.bindingCats??null,bindingOrder:x.bindingOrder??null};
}
self.onmessage=async({data:d})=>{
 try{if(d.mode==='record-info'){send({type:'done',result:await readRecordInfo(d.file,d.record)});return;}
  if(d.mode==='project'){const r=await loadProject(d);send({type:'done',result:r},[r.ref.buffer,r.data.pool.buffer,r.data.offs.buffer,r.data.flags.buffer,r.data.fileIdx.buffer,r.data.meta.buffer,r.data.cig.buffer,r.data.extra.buffer]);return;}
  const r=d.mode==='aligned'?await loadAligned(d):await loadMapping(d);
  const t=[r.data.pool.buffer,r.data.offs.buffer,r.data.flags.buffer,r.data.fileIdx.buffer];if(r.data.meta)t.push(r.data.meta.buffer,r.data.cig.buffer);if(r.facts)t.push(r.facts.ambiguous.buffer,r.facts.duplicate.buffer);
  send({type:'done',result:r},t);
 }catch(e){send({type:'error',message:e.message||String(e)});}
};
