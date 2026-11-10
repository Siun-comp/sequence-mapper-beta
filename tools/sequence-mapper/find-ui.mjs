// SPDX-License-Identifier: GPL-2.0-or-later
// Find bar. Reference, consensus and names are searched at once; all rows stream from the analysis worker,
// so the first hit shows as soon as it is found and the rest keep arriving behind it.
import {parseQuery,buildForms,findInTarget,FIND_LIMITS,HIT_STRIDE} from './core/find.mjs';
import {toDisplay} from './core/alignment.mjs';
import {endOf} from './core/annotation-export.mjs';
import {accessionOf} from './core/parse.mjs';
const $=id=>document.getElementById(id);

export function setupFind(host){
 const F={scope:'consensus',data:new Int32Array(HIT_STRIDE*256),count:0,index:-1,labels:[]},input=$('find-seq');
 let key='',runId=0,running=null,pending=0,progress=0,outside=0,capped=false;
 const options=()=>({bothStrands:$('find-both').checked,queryAmbiguity:$('find-ambiguity-query').checked,sequenceAmbiguity:$('find-ambiguity-sequence').checked,maxMismatch:Number($('find-mismatch').value)||0});
 const scope=()=>$('find-scope').value;
 const keyNow=()=>JSON.stringify([input.value.trim(),scope(),options(),scope()==='names'?host.primers().length:0]);
 function put(row,c0,c1,strand,mismatches){const need=(F.count+1)*HIT_STRIDE;if(need>F.data.length){const d=new Int32Array(F.data.length*2);d.set(F.data);F.data=d;}F.data.set([row,c0,c1,strand,mismatches],F.count*HIT_STRIDE);F.count++;}
 function append(flat){const n=flat.length/HIT_STRIDE;for(let k=0;k<n;k++){const o=k*HIT_STRIDE;put(flat[o],flat[o+1],flat[o+2],flat[o+3],flat[o+4]);}}
 const hit=i=>{const d=F.data,o=i*HIT_STRIDE;return {row:d[o],c0:d[o+1],c1:d[o+2],strand:d[o+3],mismatches:d[o+4],label:F.labels[i]};};
 function stop(){if(running){host.analysis()?.postMessage({type:'find-cancel'});running=null;}pending=0;}
 function blank(){F.count=0;F.index=-1;F.labels=[];progress=0;outside=0;capped=false;}
 function paint(){host.viewer.setFound(key&&F.count?F:null);render();}
 function refPosition(c,dir){const {refOfCol,total}=host.cols();for(;c>=0&&c<total;c+=dir)if(refOfCol[c]>=0)return toDisplay(refOfCol[c]);return null;}
 function where(h){
  if(h.label)return h.label;
  const single=host.single(),L=host.reference().length,a=single?h.c0+1:refPosition(h.c0,1),z=single?endOf({end:h.c1},L):refPosition(h.c1-1,-1),parts=[];
  if(h.row>=0)parts.push(`${(h.row+1).toLocaleString()}번 ${accessionOf(host.rowName(h.row))}`);
  parts.push(a===null||z===null?'insertion 열':`위치 ${a.toLocaleString()}–${z.toLocaleString()}`,h.strand>0?'+':'−');
  if(h.mismatches)parts.push(`mismatch ${h.mismatches}`);return parts.join(' · ');
 }
 function render(){
  const parts=[];let failed=false;
  if(running)parts.push(`찾는 중 ${Math.round(progress*100)}%`);
  if(key&&F.count)parts.push(`${F.index>=0?(F.index+1).toLocaleString()+' / ':''}${F.count.toLocaleString()}건${capped?' (상한)':''}`);
  else if(key&&!running){parts.push('찾지 못했습니다.');failed=true;}
  if(key&&F.index>=0)parts.push(where(hit(F.index)));
  if(outside&&!running)parts.push(`정렬 밖 ${outside.toLocaleString()}건 제외`);
  $('find-state').textContent=parts.join(' · ');$('find-state').classList.toggle('alert',failed);
  $('find-only').hidden=!!running||!F.count||!['rows','names'].includes(F.scope)||!hasRows();$('find-clear').hidden=!key;
 }
 const hasRows=()=>{for(let i=0;i<F.count;i++)if(F.data[i*HIT_STRIDE]>=0)return true;return false;};
 function show(){
  const h=hit(F.index);host.showTab('viewer');host.viewer.setFoundIndex(F.index);host.viewer.setActivePrimer(h.primer??null);
  if(F.scope==='names')host.viewer.setSelected(h.row);
  if(h.row>=0)host.viewer.scrollToRow(h.row);if(h.c0>=0)host.viewer.scrollToColumn((h.c0+h.c1)/2);render();
 }
 function step(dir){
  if(!F.count){if(running)pending=dir;return;}
  if(running&&dir>0&&F.index+1>=F.count){pending=dir;return;}
  F.index=F.index<0?(dir>0?0:F.count-1):(F.index+dir+F.count)%F.count;show();
 }
 function start({jump}){
  stop();blank();key='';F.scope=scope();const raw=input.value.trim();
  if(!raw||!host.ready()){paint();return;}
  if(F.scope==='names')searchNames(raw);
  else{const o=options(),q=parseQuery(raw,o.maxMismatch);
   if(q.error){paint();$('find-state').textContent=q.error;$('find-state').classList.add('alert');return;}
   if(F.scope==='rows'){key=keyNow();running=`find-${++runId}`;pending=jump?1:0;host.analysis().postMessage({type:'find',id:running,sequence:q.sequence,order:host.order(),options:o});paint();return;}
   const base=F.scope==='reference'?host.reference():host.consensus(),n=base.length,round=host.circular()&&q.sequence.length>1;let target=base;if(round){target=new Uint8Array(n+q.sequence.length-1);target.set(base);target.set(base.subarray(0,q.sequence.length-1),n);}
   const r=findInTarget(target,buildForms(q.sequence,o),o),{colOf}=host.cols();capped=r.capped;
   for(const h of r.hits){if(h.start>=n)continue;put(-1,colOf[h.start],h.end>n?h.end:colOf[h.end-1]+1,h.strand,h.mismatches);}}
  key=keyNow();paint();if(jump&&F.count)step(1);
 }
 function searchNames(raw){
  const q=raw.toLowerCase(),order=host.order();
  const {colOf}=host.cols(),n0=host.reference().length,last=e=>e>n0?e:colOf[e-1]+1;
  for(const p of host.primers()){if(p.site&&p.name.toLowerCase().includes(q)){put(-1,colOf[p.site.start],last(p.site.end),p.site.strand,p.site.mismatches);F.labels[F.count-1]=`Primer ${p.name}`;}}
  for(const f of host.annotations()){if(`${f.type} ${f.label}`.toLowerCase().includes(q)){const r=f.ranges[0];put(-1,colOf[r.start],last(r.end),f.strand,0);F.labels[F.count-1]=`${f.type} ${f.label}`;}}
  for(let n=0;n<order.length&&F.count<FIND_LIMITS.maxHits;n++){const name=host.nameOf(order[n]);if(name.toLowerCase().includes(q)){put(n,-1,-1,0,0);F.labels[F.count-1]=`${(n+1).toLocaleString()}번 ${accessionOf(name)}`;}}
 }
 function go(dir){if(keyNow()!==key){start({jump:true});return;}step(dir);}
 function afterBatch(){
  host.viewer.setFound(F.count?F:null);
  if(pending&&(F.index+1<F.count||(!running&&F.count))){const d=pending;pending=0;step(d);return;}
  if(!running)pending=0;render();
 }
 const reset=()=>{stop();key='';blank();paint();};
 // Keys that confirm or cancel an IME (e.g. Korean) composition belong to the IME, not to search.
 input.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){e.preventDefault();go(e.shiftKey?-1:1);}else if(e.key==='Escape'){e.preventDefault();reset();host.viewer.scroller.focus({preventScroll:true});}});
 $('find-next').addEventListener('click',()=>go(1));$('find-prev').addEventListener('click',()=>go(-1));$('find-clear').addEventListener('click',()=>{input.value='';reset();input.focus();});
 for(const id of ['find-scope','find-both','find-ambiguity-query','find-ambiguity-sequence','find-mismatch'])$(id).addEventListener('change',()=>{$('find-options').hidden=scope()==='names';if(input.value.trim())start({jump:true});else reset();});
 $('find-only').addEventListener('click',()=>{const order=host.order(),rows=new Set();for(let i=0;i<F.count;i++){const r=F.data[i*HIT_STRIDE];if(r>=0)rows.add(order[r]);}host.forceRecords([...rows],'찾은 서열');});
 // The canvas is invisible to the browser's own find, so Ctrl+F comes here. A second press in the box gives the browser find back.
 addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.shiftKey||e.altKey||e.key.toLowerCase()!=='f'||!host.ready()||document.querySelector('dialog[open]')||document.activeElement===input)return;e.preventDefault();host.showTab('viewer');input.focus();input.select();});
 return {reset,
  // One sequence has no consensus and no rows.
  setSingle(on){for(const o of $('find-scope').options)o.hidden=on&&['consensus','rows'].includes(o.value);$('find-scope').value=on?'reference':'consensus';$('find-options').hidden=false;},
  // Columns and rows change with the filter, so old hits are dropped before the new view is drawn.
  hold(){if(key){stop();blank();host.viewer.setFound(null);$('find-state').textContent='다시 찾는 중…';}},
  onView(){if(key)start({jump:false});},
  handle(d){
   if(d.type==='find-progress'){if(d.id!==running)return true;append(d.hits);progress=d.done/d.total;afterBatch();return true;}
   if(d.type==='find-done'){if(d.id!==running)return true;append(d.hits);running=null;outside=d.outside;capped=d.capped;afterBatch();return true;}
   return false;}};
}
