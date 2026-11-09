// SPDX-License-Identifier: GPL-2.0-or-later
// Holds its own copy of the dataset so filtering and exports never freeze the screen.
import {computeStats,computeRecordStats,buildConsensus} from '../core/stats.mjs';
import {buildColumns} from '../core/alignment.mjs';
import {summaryCsv,samFile,alignedFasta,selectedFasta} from '../core/export.mjs';
import {computeBinding} from '../core/binding.mjs';
import {writeProject,encodeNames} from '../core/project.mjs';
import {findInRows,buildForms} from '../core/find.mjs';
let ctx=null,ack=null,bindingRun=0,findRun=0;
const KINDS={summary:summaryCsv,sam:samFile,aligned:alignedFasta,fasta:selectedFasta};
// Waits for the page to store each block, so a slow disk cannot pile blocks up in memory.
const stored=()=>new Promise(r=>{ack=r;});
self.onmessage=async({data:d})=>{
 if(d.type==='ack'){ack?.(d.stop);ack=null;return;}
 if(d.type==='binding-cancel'){bindingRun++;return;}
 if(d.type==='find-cancel'){findRun++;return;}
 try{
  if(d.type==='init'){const R=computeRecordStats(d.S,d.ref);ctx={...d,R};self.postMessage({type:'init-done',R});return;}
  if(d.type==='stats'){const stats=computeStats(ctx.S,d.order,ctx.ref.length,d.percent);ctx.stats=stats;ctx.cols=buildColumns(stats.insMax,ctx.ref.length);
   self.postMessage({type:'stats-done',id:d.id,stats,cols:ctx.cols});return;}
  if(d.type==='consensus'){ctx.stats.consensus=buildConsensus(ctx.stats.counts,ctx.stats.coverage,d.percent);self.postMessage({type:'consensus-done',id:d.id,consensus:ctx.stats.consensus});return;}
  if(d.type==='binding'){const run=++bindingRun,gen=computeBinding(ctx.S,d.order,d.primers,ctx.ref.length,{...d.options,reference:d.options.includeReference?ctx.ref:null});
   // Yields between slices so a cancel message can arrive.
   for(;;){const x=gen.next();if(x.done){self.postMessage({type:'binding-done',id:d.id,...x.value},[x.value.cats.buffer]);return;}
    await new Promise(r=>setTimeout(r));if(run!==bindingRun)return;self.postMessage({type:'binding-progress',id:d.id,done:x.value,total:d.order.length});}}
  if(d.type==='find'){const run=++findRun,gen=findInRows(ctx.S,d.order,ctx.cols,buildForms(d.sequence,d.options),d.options);
   for(;;){const x=gen.next();if(x.done){const hits=Int32Array.from(x.value.hits);self.postMessage({type:'find-done',id:d.id,hits,outside:x.value.outside,capped:x.value.capped},[hits.buffer]);return;}
    const hits=Int32Array.from(x.value.hits);self.postMessage({type:'find-progress',id:d.id,done:x.value.done,total:d.order.length,hits},[hits.buffer]);await new Promise(r=>setTimeout(r));if(run!==findRun)return;}}
  if(d.type==='project-save'){const {S,ref,names}=ctx,sections={ref,pool:S.pool,offs:S.offs,flags:S.flags,fileIdx:S.fileIdx,meta:S.meta,cig:S.cig,extra:S.extra,names:encodeNames(names),...(S.inputOrder?{inputOrder:S.inputOrder}:{}),...d.extra};
   // Compression runs on the calling thread, so saving stays here and the page keeps responding.
   const sink={write:async b=>{const bytes=b.slice();self.postMessage({type:'export-block',id:d.id,bytes,project:true},[bytes.buffer]);if(await stored())throw Error('저장을 중단했습니다.');}};
   const size=await writeProject(d.info,sections,sink,(done,total)=>self.postMessage({type:'project-progress',done,total}));self.postMessage({type:'project-done',size});return;}
  if(d.type==='export'){let sent=0;for(const block of KINDS[d.kind](ctx,d.order,d.options)){const bytes=new TextEncoder().encode(block);sent+=bytes.length;self.postMessage({type:'export-block',id:d.id,bytes,sent},[bytes.buffer]);if(await stored())return;}
   self.postMessage({type:'export-done',id:d.id,sent});}
 }catch(e){self.postMessage({type:'error',id:d.id,message:e.message||String(e)});}
};
