// SPDX-License-Identifier: GPL-2.0-or-later
import {judge,judgeAligned,formatBases,formatBytes,formatDuration,repeatShare,REPEAT_WARNING_SHARE,LIMITS,BLOCKED_ADVICE} from './core/limits.mjs';
import {mergeChunks} from './core/map-chunk.mjs';
import {STRIDE,REF,REV,QS,QE,HITS,COFF,CN,samCigar,clips,toDisplay,fromDisplay,reverseComplementBytes,projectRow,recordLength,coversBase} from './core/alignment.mjs';
import {RS,RS_MATCH,RS_MISMATCH,RS_AMBIG,RS_INS,RS_DEL,RS_REFEND,statusOf,STATUS_LABEL,summarize,identityFromStats,queryCoverage,referenceCoverage,POSITION_DEFINITIONS} from './core/stats.mjs';
import {accessionOf,displayName,FLAG} from './core/parse.mjs';
import {exampleFiles} from './core/example.mjs';
import {alignedFastaBytes} from './core/export.mjs';
import {ENGINE,PARAMETERS} from './engine/engine.mjs';
import {Viewer} from './view/viewer.mjs';
import {setupPrimers} from './primer-ui.mjs';
import {setupFind} from './find-ui.mjs';
import {setupList} from './list-ui.mjs';
import {SequenceView} from './view/sequence-view.mjs';
import {parseFeatures,featureTypes} from './core/features.mjs';
import {gatherChunk,subsetData,MAX_LIST_BASES} from './core/list.mjs';
export const TOOL_VERSION='0.1.0-dev.1';
const $=id=>document.getElementById(id),dec=new TextDecoder();
const state={files:{reference:null,queries:[],aligned:null},loaded:null,S:null,R:null,order:null,workers:[],busy:false,analysis:null,statsId:0,cols:null,stats:null,navIndex:-1,selectedRecord:-1};
const viewer=new Viewer($('viewer'),{onHover:hover,onSelect:selectRow,onRange:r=>primers.onRange(r),onPrimer:id=>primers.onPrimerClick(id)});
const sequenceView=new SequenceView($('sequence-view'),{onHover:t=>{$('hover-line').textContent=t??'';},onRange:r=>primers.onRange(r),onPrimer:id=>primers.onPrimerClick(id)});
const activeView=()=>state.single?sequenceView:viewer,circular=()=>!!state.single&&state.loaded?.reference?.topology==='circular';
const primers=setupPrimers({get viewer(){return activeView();},circular,reference:()=>state.ref,consensus:()=>state.single?null:state.stats?.consensus??null,cols:()=>state.cols,ready:()=>!!state.stats,baseOrder:()=>state.baseOrder,analysis:()=>state.analysis,showTab,referenceInfo:()=>state.loaded.reference,referenceId:()=>state.refName,saveText,hoverText:t=>{$('hover-line').textContent=t;},forceRecords(list,label){state.forced=new Set(list);$('forced-text').textContent=`${label} ${list.length.toLocaleString()}건만 표시`;$('forced-chip').hidden=false;applyFilter(true);},project:(row,buf,c0,c1)=>projectRow(state.S,state.order[row],state.cols,buf,c0,c1),rowName:row=>accessionOf(state.names[state.order[row]])});
const find=setupFind({get viewer(){return activeView();},circular,single:()=>!!state.single,annotations:()=>state.annotations??[],analysis:()=>state.analysis,ready:()=>!!state.stats&&!$('result').hidden,cols:()=>state.cols,order:()=>state.order,reference:()=>state.ref,consensus:()=>state.stats.consensus,primers:()=>primers.state.list,nameOf:i=>state.names[i],rowName:row=>state.names[state.order[row]],showTab,forceRecords(list,label){state.forced=new Set(list);$('forced-text').textContent=`${label} ${list.length.toLocaleString()}건만 표시`;$('forced-chip').hidden=false;applyFilter(true);}});
const list=setupList({changed:updateJudge,view:openSingle});
function showTab(name){for(const n of ['viewer','primers','binding']){$('pane-'+n).hidden=n!==name;$('tab-'+n).setAttribute('aria-selected',n===name);}}
for(const n of ['viewer','primers','binding'])$('tab-'+n).addEventListener('click',()=>showTab(n));
$('forced-clear').addEventListener('click',()=>{state.forced=null;$('forced-chip').hidden=true;applyFilter(true);});

$('tool-version').textContent='v'+TOOL_VERSION;
$('support-range').textContent=`권장: 총 ${formatBases(LIMITS.recommendedBases)} 이하 · 주의: ${formatBases(LIMITS.maxBases)}까지 · 초과: 실행 불가 · Reference ${LIMITS.maxReferenceLength.toLocaleString()} nt까지. 이 범위는 목록에서 고른 서열 기준이며, 파일은 ${formatBases(MAX_LIST_BASES)}까지 읽어 목록에서 줄일 수 있습니다. 총 염기 수 = 서열 수 × 길이입니다. 권장 범위 끝에서 메모리 약 2.3 GB, 주의 범위 끝에서 약 4.3 GB를 썼습니다. Ryzen 5 5600·16 GB·합성 자료 측정이며 실제 자료와 PC에 따라 달라집니다. 반복 구간이 많은 reference는 훨씬 오래 걸릴 수 있습니다.`;
for(const [k,v] of Object.entries({Coverage:POSITION_DEFINITIONS.coverage,'Identity 막대':POSITION_DEFINITIONS.identity,Consensus:POSITION_DEFINITIONS.consensus,'서열별 identity':'match ÷ (match+mismatch+insertion+deletion). 혼합염기는 분모에서 뺍니다.','일부만 정렬':'서열 길이의 95% 미만만 정렬된 경우입니다.'})){const t=document.createElement('dt');t.textContent=k;const d=document.createElement('dd');d.textContent=v;$('definitions').append(t,d);}

function setError(m=''){$('error').textContent=m;}
function setBusy(on){state.busy=on;for(const id of ['load','example','load-aligned','run','file-reference','file-queries','file-aligned'])$(id).disabled=on;if(!on)refreshButtons();}
function refreshButtons(){$('load').disabled=!(state.files.queries?.length||state.files.reference)||tooLarge();$('load-aligned').disabled=!state.files.aligned;}
function progress(on,value=0,text=''){$('progress-box').hidden=!on;$('progress').value=value;$('progress-text').textContent=text;}

// File choice
function pick(kind,files){if(kind==='reference'){state.files.reference=files[0]??null;$('name-reference').textContent=files[0]?.name??'끌어다 놓아도 됩니다.';}else{state.files.queries=[...files];const n=files.length;$('name-queries').textContent=n?(n===1?files[0].name:`${n}개 파일`)+` · ${formatBases([...files].reduce((s,f)=>s+f.size,0))}`:'끌어다 놓아도 됩니다.';}$('input-report').hidden=true;setError();refreshButtons();precheck();}
const tooLarge=()=>(state.files.queries??[]).reduce((s,f)=>s+f.size,0)>MAX_LIST_BASES*1.05;
function precheck(){if(tooLarge())setError(`파일이 너무 커서 목록으로 읽을 수 없습니다. 읽기 상한은 ${formatBases(MAX_LIST_BASES)}입니다.\nGeneious에서 설계 구간만 잘라(crop) 가져오면 크게 줄어듭니다.`);}
$('file-reference').addEventListener('change',e=>pick('reference',e.target.files));
$('file-queries').addEventListener('change',e=>pick('queries',e.target.files));
$('file-aligned').addEventListener('change',e=>{state.files.aligned=e.target.files[0]??null;refreshButtons();});
for(const [id,kind] of [['drop-reference','reference'],['drop-queries','queries']]){const el=$(id);
 el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('is-over');});el.addEventListener('dragleave',()=>el.classList.remove('is-over'));
 el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('is-over');if(!state.busy)pick(kind,e.dataTransfer.files);});}
addEventListener('beforeunload',e=>{if(state.S||state.loaded||state.busy)e.preventDefault();});

// Reading
function load(message){
 setError();$('input-report').hidden=true;setBusy(true);progress(true,0,'파일을 읽는 중…');
 const w=new Worker('workers/load-worker.mjs',{type:'module'});state.workers=[w];
 return new Promise((resolve,reject)=>{w.onmessage=({data:d})=>{if(d.type==='progress'){$('progress').value=d.done/d.total;return;}w.terminate();state.workers=[];d.type==='done'?resolve(d.result):reject(Error(d.message));};w.onerror=e=>{w.terminate();reject(Error(e.message));};w.postMessage(message);})
  .finally(()=>{progress(false);setBusy(false);});
}
function report(r){
 const lines=$('report-list');lines.replaceChildren();const li=(t,c)=>{const x=document.createElement('li');x.textContent=t;if(c)x.className=c;lines.append(x);};
 const total=r.data.pool.length,n=r.data.names.length;
 for(const p of r.reports)li(`${p.file}: ${p.records.toLocaleString()}개 레코드 · ${formatBases(p.bases)} (${p.format??'형식 미확인'})`+(p.errors.length?` · ${p.errors[0]}`:''),p.errors.length?'bad':'');
 li(`총 ${n.toLocaleString()}개 · ${formatBases(total)}`);
 const c=r.counts;
 if(c.invalid)li(`지원하지 않는 문자가 있는 서열 ${c.invalid.toLocaleString()}개는 매핑에서 제외합니다.`,'bad');
 if(c.empty)li(`빈 서열 ${c.empty.toLocaleString()}개는 제외합니다.`,'bad');
 if(c.rna)li(`U를 T로 바꾼 서열 ${c.rna.toLocaleString()}개가 있습니다.`,'warn');
 if(c.gap&&!r.columns)li(`gap(-)이 있는 서열 ${c.gap.toLocaleString()}개에서 gap을 뺐습니다. 이미 정렬된 파일이면 "이미 정렬한 파일 읽기"를 쓰세요.`,'warn');
 if(r.duplicates)li(`같은 ID가 ${r.duplicates.toLocaleString()}건 있습니다. 모두 별도 서열로 유지합니다.`,'warn');
 $('input-report').hidden=false;list.open(r);
}
// Follows the list: what will be mapped decides the estimate, not what was read.
function updateJudge(){
 const box=$('judge'),ref=list.referenceBytes(),{total,mappable}=list.bases(),run=$('run');box.replaceChildren();
 if(!ref){box.className='judge caution';const p=document.createElement('p');p.textContent='Reference를 정하면 예상 시간을 보여 드립니다.';box.append(p);run.disabled=true;run.textContent='매핑 실행';return;}
 const j=judge({totalBases:total,referenceLength:ref.length});box.className='judge '+j.level;
 const p=document.createElement('p');p.textContent=j.level==='ok'?`권장 범위 안입니다. 예상 시간 약 ${formatDuration(j.estimate.fastest)}~${formatDuration(j.estimate.typical)}.`:j.level==='caution'?`주의 범위입니다. 예상 시간 약 ${formatDuration(j.estimate.typical)}, 길면 ${formatDuration(j.estimate.slowest)}.`:'지원 범위를 넘어 실행할 수 없습니다.';box.append(p);
 for(const m of j.messages){const x=document.createElement('p');x.textContent=m;box.append(x);}
 if(state.repeatFor!==ref.length+':'+ref[0]+ref[ref.length>>1]){state.repeatFor=ref.length+':'+ref[0]+ref[ref.length>>1];state.repeat=repeatShare(ref);}
 const rep=state.repeat;if(rep>=REPEAT_WARNING_SHARE){const x=document.createElement('p');x.textContent=`Reference의 ${Math.round(rep*100)}%가 반복 구간입니다. 매핑이 예상보다 수십 배 이상 오래 걸릴 수 있습니다. 진행 중 남은 시간을 확인하고 필요하면 취소하세요.`;box.append(x);if(j.level==='ok')box.className='judge caution';}
 if(j.level==='blocked'){const u=document.createElement('ul');for(const a of BLOCKED_ADVICE){const x=document.createElement('li');x.textContent=a;u.append(x);}box.append(u);}
 run.disabled=j.level==='blocked'||!mappable;run.textContent=j.level==='caution'?'주의를 확인하고 매핑 실행':'매핑 실행';
}
async function readFiles(files){
 // A lone file in the reference slot is simply one sequence to look at.
 const only=!files.queries.length;
 try{const r=await load({mode:'mapping',reference:only?null:files.reference,queries:only?[files.reference]:files.queries});state.source={queries:only?[files.reference]:files.queries};state.loaded=r;state.list=r;report(r);if(r.data.names.length===1&&!r.reference&&!(r.data.flags[0]&(FLAG.INVALID|FLAG.EMPTY))&&r.data.pool.length<=LIMITS.maxSingleLength)await openSingle(0);return r;}
 catch(e){if(e.message!=='cancelled')setError(e.message);return null;}
}
$('load').addEventListener('click',()=>readFiles(state.files));
$('example').addEventListener('click',async()=>{const f=exampleFiles();$('name-reference').textContent=f.reference.name;$('name-queries').textContent=f.queries[0].name;if(await readFiles(f))runMapping();});
$('load-aligned').addEventListener('click',async()=>{
 try{const r=await load({mode:'aligned',file:state.files.aligned,referenceName:$('aligned-reference').value});
  const j=judgeAligned({rows:r.rows,columns:r.columns});if(j.level==='blocked')throw Error(j.messages[0]);
  state.loaded=r;$('input-report').hidden=true;const parameters=`Aligned FASTA 읽기 (${r.columns.toLocaleString()}열, 매핑 안 함)`;await showResult(r,{meta:r.data.meta,cig:r.data.cig,extra:r.data.extra},parameters,0);
 }catch(e){setError(e.message);}
});
$('reset').addEventListener('click',()=>{if(state.S&&!confirm('현재 결과를 지웁니다. 계속할까요?'))return;location.reload();});

// Mapping
async function engineBytes(){
 const res=await fetch('engine/mm2.wasm',{cache:'no-store'});if(!res.ok)throw Error('매핑 엔진 파일을 불러오지 못했습니다.');
 const bytes=await res.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==ENGINE.wasmSha256)throw Error('매핑 엔진 파일의 해시가 맞지 않습니다.');return bytes;
}
function stopWorkers(){for(const w of state.workers)w.terminate();state.workers=[];}
// A reference picked from the list carries its annotation only if its GenBank file is read once more.
async function recordReference(r,i){
 const d=r.data,sequence=d.pool.slice(d.offs[i],d.offs[i+1]),f=d.fileIdx[i],file=state.source.queries[f],format=r.reports[f].format;let info={features:null,source:null};
 if(format==='GenBank'){let first=i;while(first>0&&d.fileIdx[first-1]===f)first--;info=await load({mode:'record-info',file,record:i-first});}
 return {name:d.names[i],sequence,format,file:file.name,flags:d.flags[i],...info};
}
const chosenReference=r=>list.fromList()?recordReference(r,list.record()):Promise.resolve(r.reference);
const NO_RECORDS=()=>({pool:new Uint8Array(0),offs:new Uint32Array(1),flags:new Uint8Array(0),fileIdx:new Uint16Array(0),names:[]});
// One sequence with no comparison set runs through the same result path with zero records, so primers, find and saving need no second copy.
async function openSingle(i){
 const r=state.list;try{const reference=await recordReference(r,i);reference.topology=reference.source?.topology??'linear';$('input-report').hidden=false;
  await showResult({reference,data:NO_RECORDS(),files:r.files,single:true},{meta:new Int32Array(0),cig:new Uint32Array(0),extra:new Int32Array(0)},'단일 서열 보기 (매핑 안 함)',0);
 }catch(e){$('input-report').hidden=false;setError(e.message);}
}
async function runMapping(){
 const r=state.list;let reference;try{reference=await chosenReference(r);}catch(e){$('input-report').hidden=false;setError(e.message);return;}
 const ids=list.selected(),n=ids.length,excluded=list.excluded(),count=Math.max(1,Math.min(4,(navigator.hardwareConcurrency||4)-1)),CHUNK_BASES=4e6;
 setError();setBusy(true);$('input-report').hidden=true;progress(true,0,'매핑 준비 중…');const t0=performance.now();let cancelled=false;
 const parts=[];let next=0,done=0;
 const finish=async()=>{stopWorkers();setBusy(false);progress(false);$('input-panel').open=false;const m=mergeChunks(n,parts),data=n===r.data.names.length?r.data:subsetData(r.data,ids),mapped={...r,reference,data,excluded};list.close();state.list=null;await showResult(mapped,m,PARAMETERS,(performance.now()-t0)/1000);};
 const fail=e=>{stopWorkers();setBusy(false);progress(false);$('input-report').hidden=false;if(!cancelled)setError('매핑 실패: '+e);};
 $('cancel').onclick=()=>{cancelled=true;stopWorkers();setBusy(false);progress(false);$('input-report').hidden=false;setError('매핑을 취소했습니다. 결과는 저장되지 않았습니다.');};
 const feed=w=>{if(next>=n)return false;const first=next,c=gatherChunk(r.data,ids,first,CHUNK_BASES);next=c.last;w.postMessage({type:'map',pool:c.pool,offs:c.offs,flags:c.flags,first},[c.pool.buffer,c.offs.buffer,c.flags.buffer]);return true;};
 engineBytes().then(wasm=>{if(cancelled)return;let active=count;
  for(let k=0;k<count;k++){const w=new Worker('workers/map-worker.mjs',{type:'module'});state.workers.push(w);w.onerror=e=>fail(e.message);
   w.onmessage=({data:d})=>{
    if(d.type==='error'){fail(d.message);return;}
    if(d.type==='done'){parts.push(d);done+=d.meta.length/STRIDE;const el=(performance.now()-t0)/1000,left=done?el*(n-done)/done:0;$('progress').value=done/n;$('progress-text').textContent=`${done.toLocaleString()} / ${n.toLocaleString()} · 경과 ${formatDuration(el)} · 남은 시간 약 ${formatDuration(left)}`;}
    if(!feed(w)&&--active===0)finish();};
   w.postMessage({type:'init',wasm,reference:reference.sequence});}
 }).catch(e=>fail(e.message));
}
$('run').addEventListener('click',runMapping);

// Results
async function showResult(r,m,parameters,seconds){
 state.parameters=parameters;state.fileNames=r.files;state.single=!!r.single;state.loaded=r;$('result').classList.toggle('is-single',state.single);for(const e of document.querySelectorAll('.single-only'))e.hidden=!state.single;$('back-to-list').hidden=!state.list;const S={pool:r.data.pool,offs:r.data.offs,flags:r.data.flags,fileIdx:r.data.fileIdx,meta:m.meta,cig:m.cig,extra:m.extra};
 state.S=S;state.names=r.data.names;state.ref=r.reference.sequence;state.refName=accessionOf(r.reference.name);
 state.primersReady=false;state.baseOrder=null;state.forced=null;$('forced-chip').hidden=true;state.selectedRecord=-1;viewer.clearRange();sequenceView.clearRange();$('selection').hidden=true;
 const parsed=parseFeatures(r.reference.features,state.ref.length);state.annotations=parsed.list;find.setSingle(state.single);$('tab-viewer').textContent=state.single?'서열 화면':'정렬 화면';if(state.single)openSequenceView(r,parsed);
 find.reset();state.analysis?.terminate();const a=new Worker('workers/analysis-worker.mjs',{type:'module'});state.analysis=a;
 progress(true,0,'위치별 통계 계산 중…');$('cancel').onclick=null;
 await new Promise((res,rej)=>{a.onmessage=({data:d})=>{if(d.type==='init-done'){state.R=d.R;res();}else if(d.type==='error')rej(Error(d.message));};a.onerror=e=>rej(Error(e.message));
  a.postMessage({type:'init',S,ref:state.ref,names:r.data.names,files:r.files,refId:state.refName.replace(/[^!-~]/g,'_')||'reference',refLength:state.ref.length,meta:{engine:ENGINE.version,parameters,tool:TOOL_VERSION}});});
 a.onmessage=analysisMessage;
 if(state.single){progress(false);singleSummary();$('result').hidden=false;$('input-panel').open=false;applyFilter(true);return;}
 const c=summarize(S),total=r.data.names.length;
 const stat=(label,value,alert)=>{const d=document.createElement('div'),b=document.createElement('b');d.className='stat'+(alert?' alert':'');b.textContent=value;d.append(label+' ',b);return d;};
 $('summary-line').replaceChildren(stat('Reference',`${state.refName} · ${state.ref.length.toLocaleString()} nt`),stat('서열',total.toLocaleString()),stat('정렬됨',c.mapped.toLocaleString()),stat('일부만 정렬',c.partial.toLocaleString()),stat('정렬 안 됨',c.unmapped.toLocaleString(),c.unmapped>0),stat('입력 오류',c.skipped.toLocaleString(),c.skipped>0),stat('역방향',c.reverse.toLocaleString()),stat('복수 위치',c.multi.toLocaleString()),...(r.excluded?[stat('목록에서 제외',r.excluded.toLocaleString())]:[]),...(seconds?[stat('매핑 시간',formatDuration(seconds))]:[]));
 $('result').hidden=false;$('input-panel').open=false;applyFilter(true);
}
function singleSummary(){const r=state.loaded.reference,d=document.createElement('div'),b=document.createElement('b');d.className='stat';b.textContent=`${displayName(r.name).slice(0,100)} · ${r.sequence.length.toLocaleString()} nt · ${r.topology==='circular'?'원형':'선형'}`;d.append('서열 ',b);$('summary-line').replaceChildren(d);}
function drawAnnotations(){const off=state.hiddenTypes;sequenceView.setAnnotations(state.annotations.filter(f=>!off.has(f.type)));}
function openSequenceView(r,parsed){
 const types=featureTypes(parsed.list),box=$('annotation-types');state.hiddenTypes=new Set(types.filter(t=>!t.visible).map(t=>t.type));box.replaceChildren(...types.map(t=>{const l=document.createElement('label'),c=document.createElement('input');l.className='check';c.type='checkbox';c.checked=t.visible;c.addEventListener('change',()=>{c.checked?state.hiddenTypes.delete(t.type):state.hiddenTypes.add(t.type);drawAnnotations();});l.append(c,` ${t.type} (${t.count})`);return l;}));
 $('annotation-panel').hidden=!types.length;$('annotation-note').textContent=parsed.skipped?`위치를 해석하지 못한 annotation ${parsed.skipped}개는 표시하지 않습니다. 내보낼 때는 그대로 유지합니다.`:'';
 $('topology').value=r.reference.topology??'linear';$('show-complement').checked=false;sequenceView.setComplement(false);sequenceView.setData(r.reference.sequence);drawAnnotations();
}
$('topology').addEventListener('change',e=>{state.loaded.reference.topology=e.target.value;singleSummary();find.reset();primers.onTopology();});
$('show-complement').addEventListener('change',e=>sequenceView.setComplement(e.target.checked));
function singleGo(){const p=Number($('single-goto').value),L=state.ref.length;if(!Number.isInteger(p)||p<1||p>L){$('single-state').textContent=`1–${L.toLocaleString()} 사이로 입력하세요.`;return;}$('single-state').textContent='';sequenceView.setMark(p-1);sequenceView.scrollToColumn(p-1);}
$('single-goto-button').addEventListener('click',singleGo);$('single-goto').addEventListener('keydown',e=>{if(e.key==='Enter')singleGo();});
$('back-to-list').addEventListener('click',()=>{find.reset();$('result').hidden=true;$('input-panel').open=true;state.single=false;state.stats=null;});
async function saveText(name,type,text){try{const sink=await sinkFor(name,type);await sink.write(new TextEncoder().encode(text));await sink.close();$('export-state').textContent=`${name} 저장 완료`;}catch(e){if(e.name!=='AbortError')setError(e.message);}}
document.querySelectorAll('[data-annotation]').forEach(b=>b.addEventListener('click',()=>{const [name,type,text]=primers.exportText(b.dataset.annotation);saveText(name,type,text);}));
function currentOrder(){
 const {S,R,names}=state,n=names.length,q=$('search').value.trim().toLowerCase(),min=$('min-identity').value===''?null:Number($('min-identity').value)/100,allowed=new Set([...document.querySelectorAll('[data-status]')].filter(x=>x.checked).map(x=>x.dataset.status)),keep=[];
 for(let i=0;i<n;i++){if(!allowed.has(statusOf(S,i)))continue;if(q&&!names[i].toLowerCase().includes(q))continue;if(min!==null){const v=identityFromStats(R,i);if(v===null||v<min)continue;}keep.push(i);}
 const s=$('sort').value;
 if(s==='name')keep.sort((a,b)=>names[a]<names[b]?-1:names[a]>names[b]?1:a-b);
 else if(s!=='input'){const v=new Float64Array(n);for(const i of keep)v[i]=identityFromStats(R,i)??-1;const sign=s==='identity-asc'?1:-1;keep.sort((a,b)=>sign*(v[a]-v[b])||a-b);}
 return Uint32Array.from(keep);
}
const sameOrder=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
let filterTimer=0;
function consensusPercent(){const v=$('consensus-percent').value;if(v!=='custom')return Number(v);const n=Number($('consensus-custom').value);return Number.isFinite(n)&&n>=1&&n<=100?n:0;}
const consensusLabel=()=>{const p=consensusPercent();return p?`Consensus ${p}%`:'Consensus';};
function consensusChanged(){$('consensus-custom').hidden=$('consensus-percent').value!=='custom';if(!state.analysis||!state.stats)return;state.consensusId=(state.consensusId||0)+1;state.analysis.postMessage({type:'consensus',id:state.consensusId,percent:consensusPercent()});}
$('consensus-percent').addEventListener('change',consensusChanged);$('consensus-custom').addEventListener('change',consensusChanged);
function applyFilter(now=false){clearTimeout(filterTimer);filterTimer=setTimeout(()=>{
 find.hold();const base=currentOrder(),same=state.baseOrder&&sameOrder(state.baseOrder,base);state.baseOrder=base;const order=state.forced?base.filter(i=>state.forced.has(i)):base;state.order=order;state.baseChanged=!same;state.statsId++;viewer.setSelected(-1);$('detail').hidden=true;$('filter-line').textContent=`표시 ${order.length.toLocaleString()} / 전체 ${state.names.length.toLocaleString()} · Consensus 계산 중…`;
 viewer.clearRange();$('selection').hidden=true;state.analysis.postMessage({type:'stats',id:state.statsId,order,percent:consensusPercent()});
},now?0:200);}
function analysisMessage({data:d}){
 if(primers.handle(d)||find.handle(d))return;
 if(d.type==='consensus-done'){if(d.id!==state.consensusId)return;state.stats.consensus=d.consensus;viewer.setConsensus(d.consensus,consensusLabel());state.variable=null;state.navIndex=-1;primers.onConsensus();find.onView();return;}
 if(d.type==='stats-done'){if(d.id!==state.statsId)return;progress(false);state.stats=d.stats;state.cols=d.cols;let max=0;for(const v of d.stats.coverage)if(v>max)max=v;
  viewer.consLabel=consensusLabel();viewer.setData({S:state.S,names:state.names,order:state.order,cols:d.cols,stats:d.stats,ref:state.ref,refName:state.refName,refFull:state.loaded.reference.name,maxCoverage:max});
  if(!state.primersReady){state.primersReady=true;primers.onData();}else if(state.baseChanged){primers.onConsensus();primers.onFilter();}
  let ins=0;for(const v of d.stats.insRows)if(v)ins++;let variable=0;for(const v of d.stats.identity)if(v<1)variable++;state.variable=null;state.navIndex=-1;$('nav-state').textContent='';updateNavScope();
  if(state.restoreScroll){const v=state.restoreScroll;state.restoreScroll=null;requestAnimationFrame(()=>{viewer.scroller.scrollLeft=v.left;viewer.scroller.scrollTop=v.top;});}
  $('filter-line').textContent=state.single?'':`표시 ${state.order.length.toLocaleString()} / 전체 ${state.names.length.toLocaleString()} · 변이 위치 ${variable.toLocaleString()} · insertion 위치 ${ins.toLocaleString()}`;find.onView();return;}
 if(d.type==='export-block'){Promise.resolve().then(()=>state.exportSink?.write(d.bytes)).then(()=>state.analysis.postMessage({type:'ack'}),e=>{state.analysis.postMessage({type:'ack',stop:true});state.exportSink?.abort();state.exportSink=null;$('export-state').textContent='';setError('저장 실패: '+(e.name==='QuotaExceededError'?'저장 공간이 부족합니다.':e.message));$('project-state').textContent='';$('save-project').disabled=false;});if(!d.project)$('export-state').textContent=`저장 중 ${formatBytes(d.sent)}…`;return;}
 if(d.type==='export-done'){state.exportSink?.close(d.sent);return;}
 if(d.type==='project-progress'){$('project-state').textContent=`저장 중 ${Math.round(d.done/d.total*100)}%`;return;}
 if(d.type==='project-done'){projectSaved(d.size);return;}
 if(d.type==='error'){$('export-state').textContent='';$('project-state').textContent='';$('save-project').disabled=false;state.projectSave=null;if(d.message!=='저장을 중단했습니다.')setError(d.message);state.exportSink?.abort();}
}
for(const id of ['search','min-identity'])$(id).addEventListener('input',()=>applyFilter());
$('sort').addEventListener('change',()=>applyFilter());
document.querySelectorAll('[data-status]').forEach(x=>x.addEventListener('change',()=>applyFilter()));
$('zoom').addEventListener('input',e=>viewer.setZoom(+e.target.value));
$('name-mode').addEventListener('change',e=>viewer.setNameMode(e.target.value));
$('compare').addEventListener('change',e=>{viewer.setCompare(e.target.value);state.variable=null;state.navIndex=-1;});
$('diff-only').addEventListener('change',e=>viewer.setMode(e.target.checked?'diff':'all'));
function goTo(){const p=Number($('goto').value);if(!Number.isInteger(p)||p<1||p>state.ref.length){$('nav-state').textContent=`1–${state.ref.length.toLocaleString()} 사이로 입력하세요.`;return;}const c=state.cols.colOf[fromDisplay(p)];viewer.setMark(c);viewer.scrollToColumn(c);}
$('goto-button').addEventListener('click',goTo);$('goto').addEventListener('keydown',e=>{if(e.key==='Enter')goTo();});

// Variant navigation: the selected row if any, otherwise every variable position.
function updateNavScope(){$('nav-scope').textContent=state.selectedRecord>=0?'(선택한 서열)':'(전체 위치)';}
function variantColumns(){
 if(state.variable)return state.variable;const out=[],{colOf,refOfCol,total}=state.cols;
 if(state.selectedRecord>=0){const b=new Uint8Array(total),loose=$('compare').value==='consensus',cmp=loose?state.stats.consensus:state.ref;projectRow(state.S,state.selectedRecord,state.cols,b,0,total);for(let c=0;c<total;c++){const v=b[c];if(!v)continue;const r=refOfCol[c];if(r<0?v!==45:v!==cmp[r]&&!(loose&&coversBase(cmp[r],v)))out.push(c);}}
 else{const id=state.stats.identity;for(let r=0;r<state.ref.length;r++)if(id[r]<1)out.push(colOf[r]);}
 return state.variable=out;
}
function step(dir){const v=variantColumns();if(!v.length){$('nav-state').textContent='변이가 없습니다.';return;}state.navIndex=(state.navIndex+dir+v.length)%v.length;if(state.navIndex<0)state.navIndex=0;const c=v[state.navIndex],r=state.cols.refOfCol[c];viewer.setMark(c);viewer.scrollToColumn(c);$('nav-state').textContent=`${(state.navIndex+1).toLocaleString()} / ${v.length.toLocaleString()} · ${r<0?'insertion 열':'위치 '+toDisplay(r).toLocaleString()}`;}
$('next-diff').addEventListener('click',()=>step(1));$('prev-diff').addEventListener('click',()=>step(-1));

// Hover and row detail
function hover(p){
 const line=$('hover-line');if(!p||p.col<0||!state.stats){line.textContent='';return;}
 const r=state.cols.refOfCol[p.col];let t=r<0?'insertion 열':`위치 ${toDisplay(r).toLocaleString()} · ref ${String.fromCharCode(state.ref[r])}`;
 if(r>=0){const s=state.stats;t+=` · consensus ${s.consensus[r]?String.fromCharCode(s.consensus[r]):'없음'} · coverage ${s.coverage[r].toLocaleString()} · A/C/G/T 판독 ${s.called[r].toLocaleString()} · identity ${Number.isNaN(s.identity[r])?'–':(s.identity[r]*100).toFixed(1)+'%'}`;}
 else{let q=p.col;while(q<state.cols.total&&state.cols.refOfCol[q]<0)q++;const at=state.cols.refOfCol[q];if(at>=0)t+=` · 위치 ${toDisplay(at).toLocaleString()} 앞 · 해당 서열 ${state.stats.insRows[at].toLocaleString()}개`;}
 if(p.row>=0){const i=state.order[p.row],b=new Uint8Array(1);projectRow(state.S,i,state.cols,b,p.col,p.col+1);t+=` · ${accessionOf(state.names[i])}: ${b[0]?String.fromCharCode(b[0]):'정렬 밖'}`;}
 line.textContent=t;
}
function selectRow(row){
 const i=state.order[row],{S,R}=state;state.selectedRecord=i;state.variable=null;state.navIndex=-1;updateNavScope();viewer.setSelected(row);const b=i*STRIDE,m=S.meta,mapped=m[b+REF]>=0,len=recordLength(S,i),st=statusOf(S,i),id=identityFromStats(R,i),c=i*RS;
 $('detail').hidden=false;$('detail-title').textContent=displayName(state.names[i]).slice(0,200);$('copy-state').textContent='';
 const facts=[['상태',STATUS_LABEL[st]],['길이',len.toLocaleString()+' nt']];
 if(mapped){const [l,rt]=clips(len,!!m[b+REV],m[b+QS],m[b+QE]),cg=samCigar(S.cig,m[b+COFF],m[b+CN],l,rt);facts.push(['방향',m[b+REV]?'역방향 (−)':'정방향 (+)'],['Reference 위치',`${toDisplay(m[b+REF]).toLocaleString()}–${R[c+RS_REFEND].toLocaleString()}`],['서열 위치',`${(m[b+QS]+1).toLocaleString()}–${m[b+QE].toLocaleString()}`],['Identity',id===null?'–':(id*100).toFixed(2)+'%'],['Mismatch',R[c+RS_MISMATCH]],['Insertion / Deletion',`${R[c+RS_INS]} / ${R[c+RS_DEL]}`],['혼합염기',R[c+RS_AMBIG]],['Query coverage',(queryCoverage(S,i)*100).toFixed(1)+'%'],['Reference coverage',(referenceCoverage(S,R,i,state.ref.length)*100).toFixed(1)+'%'],['정렬 위치 수',m[b+HITS]],['CIGAR',cg.length>120?cg.slice(0,120)+'…':cg]);}
 const dl=$('detail-list');dl.replaceChildren(...facts.map(([k,v])=>{const w=document.createElement('div'),t=document.createElement('dt'),d=document.createElement('dd');t.textContent=k;d.textContent=v;w.append(t,d);return w;}));
}
async function copyRecord(oriented){const i=state.selectedRecord;if(i<0)return;let raw=state.S.pool.subarray(state.S.offs[i],state.S.offs[i+1]);if(oriented&&state.S.meta[i*STRIDE+REF]>=0&&state.S.meta[i*STRIDE+REV])raw=reverseComplementBytes(raw);try{await navigator.clipboard.writeText(`>${state.names[i]}\n${dec.decode(raw)}\n`);$('copy-state').textContent='복사했습니다.';}catch{$('copy-state').textContent='복사에 실패했습니다. 브라우저 권한을 확인하세요.';}}
$('copy-original').addEventListener('click',()=>copyRecord(false));$('copy-oriented').addEventListener('click',()=>copyRecord(true));

// Export: stream to a chosen file when the browser allows it, otherwise build a Blob from parts.
const EXPORT={sam:['mapping.sam','text/plain'],summary:['mapping_summary.csv','text/csv'],aligned:['aligned.fasta','text/plain'],fasta:['selected_sequences.fasta','text/plain']};
async function sinkFor(name,type){
 if(window.showSaveFilePicker){const h=await showSaveFilePicker({suggestedName:name});const w=await h.createWritable();return {write:b=>w.write(b),close:()=>w.close(),abort:()=>w.abort()};}
 const parts=[];return {write:b=>parts.push(b),close:n=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(parts,{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);},abort(){parts.length=0;}};
}
document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',async()=>{
 const kind=b.dataset.export,[name,type]=EXPORT[kind];
 if(kind==='aligned'){const bytes=alignedFastaBytes(state.order.length,state.cols.total);if(bytes>1e9&&!confirm(`Aligned FASTA가 약 ${formatBytes(bytes)}로 큽니다. insertion 열 ${(state.cols.total-state.ref.length).toLocaleString()}개가 모든 행에 포함되기 때문입니다. 표시 서열을 줄이면 작아집니다. 계속할까요?`))return;}
 try{const sink=await sinkFor(name,type);const close=sink.close;sink.close=async n=>{await close(n);$('export-state').textContent=`${name} 저장 완료 (${formatBytes(n)}) · ${state.order.length.toLocaleString()}개 서열`;};state.exportSink=sink;
  $('export-state').textContent='내보내는 중…';state.analysis.postMessage({type:'export',kind,id:Date.now(),order:state.order,options:{includeConsensus:$('export-consensus').checked}});
 }catch(e){if(e.name!=='AbortError')setError(e.message);}
}));
// Project file
function viewState(){return {search:$('search').value,sort:$('sort').value,minIdentity:$('min-identity').value,status:Object.fromEntries([...document.querySelectorAll('[data-status]')].map(x=>[x.dataset.status,x.checked])),zoom:$('zoom').value,consensusPercent:$('consensus-percent').value,consensusCustom:$('consensus-custom').value,nameWidth:viewer.nameW,nameMode:$('name-mode').value,compare:$('compare').value,diffOnly:$('diff-only').checked,scrollLeft:viewer.scroller.scrollLeft,scrollTop:viewer.scroller.scrollTop};}
function applyView(v){$('consensus-percent').value=v.consensusPercent??'0';$('consensus-custom').value=v.consensusCustom??'';$('consensus-custom').hidden=$('consensus-percent').value!=='custom';$('search').value=v.search;$('sort').value=v.sort;$('min-identity').value=v.minIdentity;document.querySelectorAll('[data-status]').forEach(x=>{x.checked=!!v.status[x.dataset.status];});$('zoom').value=v.zoom;viewer.setZoom(+v.zoom);if(v.nameWidth)viewer.setNameWidth(v.nameWidth);$('name-mode').value=v.nameMode??'both';viewer.setNameMode($('name-mode').value);$('compare').value=v.compare;viewer.setCompare(v.compare);$('diff-only').checked=v.diffOnly;viewer.setMode(v.diffOnly?'diff':'all');state.restoreScroll={left:v.scrollLeft,top:v.scrollTop};}
async function saveProject(){
 const name=(state.refName||'mapping').replace(/[^\w.-]+/g,'_')+'.jsumap';let sink;try{sink=await sinkFor(name,'application/octet-stream');}catch(e){if(e.name!=='AbortError')setError(e.message);return;}
 const p=primers.snapshot(),ref=state.loaded.reference;state.exportSink=sink;state.projectSave={name,started:performance.now()};$('save-project').disabled=true;$('project-state').textContent='저장 중…';
 state.analysis.postMessage({type:'project-save',id:0,extra:p.cats?{bindingCats:p.cats,bindingOrder:p.order}:{},info:{tool:TOOL_VERSION,engine:ENGINE.version,parameters:state.parameters,createdAt:new Date().toISOString(),reference:{name:ref.name,features:ref.features,format:ref.format,source:ref.source,file:ref.file,flags:ref.flags,topology:ref.topology},files:state.fileNames,columns:state.loaded.columns??null,excluded:state.loaded.excluded??0,single:!!state.single,state:{primers:p.state,view:viewState()}}});
}
async function projectSaved(size){const s=state.projectSave;state.projectSave=null;await state.exportSink?.close();$('save-project').disabled=false;$('export-state').textContent='';$('project-state').textContent=`${s.name} 저장 완료 (${formatBytes(size)}, ${formatDuration((performance.now()-s.started)/1000)})`;}
async function openProject(file){
 if(state.S&&!confirm('현재 작업을 닫고 프로젝트를 엽니다. 계속할까요?'))return;
 try{const x=await load({mode:'project',file}),m=x.manifest,r={reference:{...m.reference,sequence:x.ref},data:x.data,files:m.files,columns:m.columns,excluded:m.excluded,single:m.single};state.list=null;
  primers.restore(m.state.primers,x.bindingCats,x.bindingOrder);applyView(m.state.view);$('name-reference').textContent=m.reference.file;
  await showResult(r,{meta:x.data.meta,cig:x.data.cig,extra:x.data.extra},m.parameters,0);$('project-state').textContent=`${file.name} 열기 완료 · 저장 도구 v${m.tool} · ${m.createdAt.slice(0,10)}`;
 }catch(e){setError('프로젝트를 열 수 없습니다: '+e.message);}
}
$('save-project').addEventListener('click',saveProject);
$('file-project').addEventListener('change',e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value='';});
window.__sequenceMapper={state,viewer,sequenceView,get primers(){return primers.state;},openProject};
