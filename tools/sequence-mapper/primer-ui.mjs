// SPDX-License-Identifier: GPL-2.0-or-later
// Primer registration, list, binding table and selected-range analysis.
import {parseText,detectColumns,buildPrimers,placePrimer,chooseHit,reverseComplement,mixedBases,normalizeSequence,findSites} from './core/primer.mjs';
import {CAT,CAT_LABEL,BINDING_NOTE,recordsInCell} from './core/binding.mjs';
import {readFirstSheet} from './core/xlsx-read.mjs';
import {DEFAULT_CONDITIONS,tmSummary,gcRange} from './core/selection.mjs';
import {toDisplay} from './core/alignment.mjs';
import {referenceGenbank,primerGff3,primerCsv,primerRows,bindingCsv,endOf,PRIMER_COLUMNS} from './core/annotation-export.mjs';
const $=id=>document.getElementById(id),dec=new TextDecoder();
// Above this much work the table waits for the button; measured about 1 second on the stage-1 PC.
const AUTO_BINDING_WORK=2e6,SELECTION_DELAY_MS=180,MAX_COPY_CELLS=30e6;
const el=(tag,props={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='data')Object.assign(e.dataset,v);else e[k]=v;}e.append(...kids.filter(x=>x!==null&&x!==undefined));return e;};
const pct=(n,total)=>total?(n/total*100).toFixed(1)+'%':'–';

export function setupPrimers(host){
 const P={list:[],nextId:1,options:{maxMismatch:3,end3:3,end3Exact:0,ruleEnd3:5,ruleMismatch:1},binding:null,stale:true,running:false,runId:0,draft:null,conditions:{...DEFAULT_CONDITIONS},range:null,selectionId:0};
 const worker=new Worker('workers/selection-worker.mjs',{type:'module'});

 // Placement
 const search={get maxMismatch(){return P.options.maxMismatch;},get end3Exact(){return P.options.end3Exact;}};
 function place(p){return p.manual||p.locked?p:placePrimer(p,host.reference(),host.consensus(),{maxMismatch:P.options.maxMismatch,end3Exact:P.options.end3Exact,circular:host.circular()});}
 const siteText=s=>`${toDisplay(s.start).toLocaleString()}–${endOf(s,host.reference().length).toLocaleString()}`;
 // Tm and GC depend on the sequence and the conditions only, and the list redraws often.
 const metricCache=new Map();
 function metrics(p){const key=p.sequence+'|'+JSON.stringify(P.conditions);let m=metricCache.get(key);if(!m){const t=tmSummary(p.sequence,P.conditions),g=gcRange(p.sequence);m={tm:t.status==='ok'?(t.variants>1?`${t.min.toFixed(1)}–${t.max.toFixed(1)}`:t.mean.toFixed(1)):'N/A',gc:g.min===g.max?g.min.toFixed(1):`${g.min.toFixed(1)}–${g.max.toFixed(1)}`};if(metricCache.size>2000)metricCache.clear();metricCache.set(key,m);}return m;}
 function changed({rerun=true}={}){P.list=P.list.map(place);refreshViewer();renderList();markStale();if(rerun)maybeAuto();}
 function refreshViewer(){host.viewer.setPrimers(P.list.filter(p=>p.site).map(p=>({id:p.id,name:p.name,start:p.site.start,end:p.site.end,strand:p.site.strand,mismatches:p.site.mismatches,visible:p.visible})));}
 function add(primers){for(const p of primers)P.list.push({...p,id:P.nextId++});changed();$('primer-count').textContent=P.list.length?`(${P.list.length})`:'';}
 function statusText(p){if(!p.site)return '위치 없음';const parts=[];if(p.manual)parts.push('직접 지정');if(p.site.source==='consensus')parts.push('Consensus에서 찾음');if(p.site.end>host.reference().length)parts.push('원점 걸침');parts.push(p.site.mismatches?`mismatch ${p.site.mismatches}`:'일치');if(p.hits?.length>1)parts.push(`위치 ${p.hits.length}곳`);return parts.join(' · ');}
 function renderList(){
  const body=$('primer-rows');body.replaceChildren();$('primer-empty').hidden=P.list.length>0;
  for(const p of P.list){const tr=el('tr',{class:p.id===host.viewer.activePrimer?'is-active':''});
   const show=el('input',{type:'checkbox',checked:p.visible,ariaLabel:p.name+' 표시',onchange(){p.visible=show.checked;refreshViewer();}});
   const where=p.site?siteText(p.site):'–',m=metrics(p);
   const cell=el('td',{class:'num'},where);
   if(p.hits?.length>1){const sel=el('select',{ariaLabel:p.name+' 위치 선택',onchange(){const q=chooseHit(p,+sel.value);Object.assign(p,{site:q.site,locked:true});refreshViewer();markStale();maybeAuto();}});p.hits.slice(0,20).forEach((h,i)=>sel.append(el('option',{value:i,selected:h.start===p.site.start&&h.strand===p.site.strand,textContent:`${toDisplay(h.start).toLocaleString()} (${h.strand>0?'+':'−'}, mm ${h.mismatches})`})));cell.replaceChildren(sel);}
   tr.append(el('td',{},show),el('td',{},p.set||'–'),el('td',{},el('button',{type:'button',class:'link',textContent:p.name,disabled:!p.site,onclick(){focus(p.id);}})),el('td',{class:'mono'},p.sequence),el('td',{class:'num'},String(p.sequence.length)),el('td',{class:'num'},String(mixedBases(p.sequence))),el('td',{class:'num'},m.tm),el('td',{class:'num'},m.gc),cell,el('td',{},p.site?(p.site.strand>0?'+':'−'):'–'),el('td',{class:p.site?'':'bad'},statusText(p)),el('td',{},el('button',{type:'button',textContent:'삭제',ariaLabel:p.name+' 삭제',onclick(){P.list=P.list.filter(x=>x!==p);changed();$('primer-count').textContent=P.list.length?`(${P.list.length})`:'';}})));
   body.append(tr);}
 }
 function focus(id){const p=P.list.find(x=>x.id===id);if(!p?.site)return;host.showTab('viewer');host.viewer.setActivePrimer(id);host.viewer.scrollToColumn(host.cols().colOf[p.site.start]);renderList();host.hoverText(`${p.name} · ${siteText(p.site)} · ${p.site.strand>0?'+':'−'} · ${p.sequence}`);}

 // Registration dialog
 const dialog=$('primer-dialog');
 $('open-primer').addEventListener('click',()=>{P.draft=null;$('primer-paste').value='';$('primer-file').value='';$('primer-preview').hidden=true;$('primer-error').textContent='';$('primer-add').disabled=true;dialog.showModal();});
 $('primer-cancel').addEventListener('click',()=>dialog.close());
 function preview(rows){
  $('primer-error').textContent='';if(!rows.length){$('primer-preview').hidden=true;$('primer-add').disabled=true;return;}
  const map=detectColumns(rows),width=Math.max(...rows.slice(0,50).map(r=>r.length));P.draft={rows,map};
  for(const [id,key,optional] of [['map-name','name',false],['map-sequence','sequence',false],['map-set','set',true]]){const s=$(id);s.replaceChildren();if(optional)s.append(el('option',{value:-1,textContent:'사용 안 함'}));for(let c=0;c<width;c++)s.append(el('option',{value:c,textContent:map.header?`${c+1}열: ${rows[0][c]??''}`:`${c+1}열`}));s.value=map[key]??-1;}
  $('map-header').checked=map.header;$('primer-preview').hidden=false;updateDraft();
 }
 function updateDraft(){
  const d=P.draft;if(!d)return;d.map={header:$('map-header').checked,name:+$('map-name').value,sequence:+$('map-sequence').value,set:+$('map-set').value};
  const r=buildPrimers(d.rows,d.map,{defaultSet:$('primer-set').value.trim(),existing:P.list});d.result=r;
  const t=$('primer-preview-rows');t.replaceChildren(...r.primers.slice(0,8).map(p=>el('tr',{},el('td',{},p.set||'–'),el('td',{},p.name),el('td',{class:'mono'},p.sequence))));
  const renamed=r.primers.filter(p=>p.renamed).length;
  $('primer-preview-note').textContent=`등록 ${r.primers.length.toLocaleString()}개`+(r.primers.length>8?' (앞 8개 표시)':'')+(renamed?` · 같은 이름 ${renamed}개는 번호를 붙입니다`:'')+(r.errors.length?` · 오류 ${r.errors.length}행`:'');
  $('primer-error').textContent=r.errors.slice(0,6).join('\n')+(r.errors.length>6?`\n외 ${r.errors.length-6}행`:'');$('primer-add').disabled=!r.primers.length;
 }
 $('primer-paste').addEventListener('input',e=>preview(parseText(e.target.value).rows));
 $('primer-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(/\.xlsx$/i.test(f.name))preview(await readFirstSheet(await f.arrayBuffer()));else preview(parseText(await f.text()).rows);}catch(x){$('primer-error').textContent=x.message;}});
 for(const id of ['map-name','map-sequence','map-set','map-header','primer-set'])$(id).addEventListener('input',updateDraft);
 $('primer-add').addEventListener('click',()=>{if(P.draft?.result)add(P.draft.result.primers);dialog.close();host.showTab('primers');});

 // Search options
 for(const [id,key] of [['opt-mismatch','maxMismatch'],['opt-end3-exact','end3Exact'],['opt-end3','end3'],['opt-rule-end3','ruleEnd3'],['opt-rule-mismatch','ruleMismatch']])$(id).addEventListener('change',e=>{const v=Number(e.target.value),max=key==='ruleEnd3'?30:10;if(!Number.isInteger(v)||v<0||v>max){e.target.value=P.options[key];return;}P.options[key]=v;changed();});

 // Binding table
 function markStale(){P.stale=true;$('binding-state').textContent=P.binding?'조건이 바뀌었습니다. 재분석이 필요합니다.':'';$('binding-state').classList.toggle('stale',!!P.binding);}
 const placed=()=>P.list.filter(p=>p.site);
 function maybeAuto(){if(!placed().length||!host.ready()||!host.baseOrder().length)return;if(host.baseOrder().length*placed().length<=AUTO_BINDING_WORK)run();}
 function run(){
  const primers=placed().map(p=>({id:p.id,name:p.name,set:p.set,sequence:p.sequence,site:{start:p.site.start,end:p.site.end,strand:p.site.strand}}));if(!primers.length){$('binding-state').textContent='위치가 정해진 primer가 없습니다.';return;}
  if(P.running)host.analysis().postMessage({type:'binding-cancel'});
  P.running=true;const id=++P.runId,order=host.baseOrder();P.order=order;$('binding-run').disabled=true;$('binding-cancel').hidden=false;$('binding-state').classList.remove('stale');$('binding-state').textContent='분석 중…';
  host.analysis().postMessage({type:'binding',id,order,primers,options:{end3:P.options.end3,rule:{end3:P.options.ruleEnd3,maxMismatch:P.options.ruleMismatch}}});
 }
 function done(d){if(d.id!==P.runId)return;P.running=false;P.binding=d;P.stale=false;$('binding-run').disabled=false;$('binding-cancel').hidden=true;$('binding-state').textContent=`${d.n.toLocaleString()}개 서열 · primer ${d.result.length}개 분석 완료`;renderBinding();}
 function handle(d){if(d.type==='binding-progress'){if(d.id===P.runId)$('binding-state').textContent=`분석 중 ${d.done.toLocaleString()} / ${d.total.toLocaleString()}`;return true;}if(d.type==='binding-done'){done(d);return true;}return false;}
 $('binding-run').addEventListener('click',run);
 $('binding-cancel').addEventListener('click',()=>{host.analysis().postMessage({type:'binding-cancel'});P.running=false;P.runId++;$('binding-run').disabled=false;$('binding-cancel').hidden=true;$('binding-state').textContent='분석을 취소했습니다.';});
 const COLS=[[CAT.MATCH,'일치'],['rule','조건 충족'],[CAT.MM1,'1 mismatch'],[CAT.MM2,'2+ mismatch'],['end3',"3′ mismatch"],[CAT.INDEL,'indel 포함'],[CAT.UNRESOLVED,'판정 불가'],[CAT.UNCOVERED,'구간 미포함']];
 const value=(t,c)=>c==='end3'?t.end3:c==='rule'?t.rule:t.counts[c];
 const ruleText=r=>`3′ 끝 ${r.end3} nt 완전일치, 전체 mismatch ${r.maxMismatch}개 이하`;
 function renderBinding(){
  const b=P.binding,body=$('binding-rows');body.replaceChildren();$('binding-empty').hidden=!!b;$('binding-copy').disabled=!b;$('binding-csv').disabled=!b;if(!b)return;$('binding-end3').textContent=`3′ mismatch는 3′ 끝 ${b.end3} nt 안의 mismatch 건수이고, 조건 충족은 ${ruleText(b.rule)}인 서열 수입니다. 완전일치를 포함하며 indel·판정 불가·구간 미포함은 제외합니다. 두 칸은 다른 칸과 겹칩니다.`;
  b.result.forEach((t,index)=>{const tr=el('tr',{},el('td',{},t.set||'–'),el('td',{},el('button',{type:'button',class:'link',textContent:t.name,onclick(){focus(t.id);}})),el('td',{class:'num'},t.total.toLocaleString()));
   for(const [c,label] of COLS){const n=value(t,c);tr.append(el('td',{class:'num'},n?el('button',{type:'button',class:'link cell',title:label+' 서열만 보기',ariaLabel:`${t.name} ${label} ${n}건 보기`,onclick(){show(index,c,label);},textContent:n.toLocaleString()}):'0',el('small',{},' '+pct(n,t.total))));}
   tr.append(el('td',{},el('button',{type:'button',textContent:`변이형 ${t.variantCount.toLocaleString()}`,onclick(){variants(t);}})));body.append(tr);});
 }
 function show(index,c,label){const b=P.binding,t=b.result[index],list=recordsInCell(b.cats,b.n,index,P.order,c);host.forceRecords(list,`${t.name} · ${label}`);focus(t.id);}
 function variants(t){$('variant-title').textContent=`${t.name} 구간 변이형 (5′→3′, primer 방향)`;$('variant-note').textContent=`서로 다른 형태 ${t.variantCount.toLocaleString()}개`+(t.variantCount>t.variants.length?` 중 많은 순서 ${t.variants.length}개`:'')+'. 건수는 레코드 수입니다.';$('variant-rows').replaceChildren(...t.variants.map(v=>el('tr',{},el('td',{class:'mono'},v.sequence),el('td',{class:'num'},v.count.toLocaleString()),el('td',{class:'num'},pct(v.count,t.total)),el('td',{class:'num'},String(v.differences)))));$('variant-dialog').showModal();}
 $('variant-close').addEventListener('click',()=>$('variant-dialog').close());
 $('binding-csv').addEventListener('click',()=>host.saveText('binding_summary.csv','text/csv',bindingCsv(P.binding,COLS,value,`조건 충족: ${ruleText(P.binding.rule)}. ${BINDING_NOTE}`)));
 function tableText(){const b=P.binding,head=['Set','Primer','대상 서열',...COLS.map(c=>c[1])],rows=b.result.map(t=>[t.set,t.name,t.total,...COLS.map(([c])=>value(t,c))]);return {head,rows};}
 // Excel keeps the columns from the HTML form; the plain text is the fallback.
 async function copyTable(head,rows,note,status){const text=[head,...rows].map(r=>r.join('\t')).join('\n')+(note?`\n${note}`:'');const cell=(t,v)=>{const x=document.createElement(t);x.textContent=v;x.style.cssText="font:9pt 'Malgun Gothic'";return x.outerHTML;};const html=`<table>${[head.map(h=>cell('th',h)).join(''),...rows.map(r=>r.map(v=>cell('td',v)).join(''))].map(r=>`<tr>${r}</tr>`).join('')}</table>`;
  try{await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);status.textContent='표를 복사했습니다.';}catch{try{await navigator.clipboard.writeText(text);status.textContent='표를 일반 텍스트로 복사했습니다.';}catch{status.textContent='복사에 실패했습니다.';}}}
 $('binding-copy').addEventListener('click',()=>{const {head,rows}=tableText();copyTable(head,rows,`조건 충족: ${ruleText(P.binding.rule)}\n${BINDING_NOTE}`,$('binding-state'));});
 const exportOptions=()=>({length:host.reference().length,metrics});
 $('primer-copy').addEventListener('click',()=>copyTable(PRIMER_COLUMNS,primerRows(P.list,exportOptions()),'',$('primer-state')));

 // Selected range
 let timer=0;
 // Lanes in screen order: -2 consensus, -1 reference, 0.. shown rows. The single sequence screen sends a reference range without lanes.
 const firstLane=r=>r.from??-1,laneCount=r=>r.from===undefined?1:r.to-r.from+1;
 const laneName=lane=>lane===-2?'Consensus':lane===-1?'Reference':host.rowName(lane);
 function laneBytes(lane,r,buf){const c=host.cols();buf.fill(0);if(lane>=0)host.project(lane,buf,r.c0,r.c1);else{const src=lane===-2?host.consensus():host.reference();for(let k=0;k<r.c1-r.c0;k++){const q=c.refOfCol[r.c0+k];buf[k]=q>=0?src[q]:0;}}return buf;}
 // Columns stay intact when copying: a base, or - where this lane has none.
 function laneText(lane,r,buf){laneBytes(lane,r,buf);for(let k=0;k<buf.length;k++)if(!buf[k])buf[k]=45;return dec.decode(buf);}
 const reverseGapped=s=>s.split('-').map(reverseComplement).reverse().join('-');
 function copyText(){const r=P.range,n=laneCount(r),w=r.c1-r.c0;if(n*w>MAX_COPY_CELLS)return {error:`선택이 ${n.toLocaleString()}줄로 너무 큽니다. 내보내기의 Aligned FASTA를 쓰세요.`};const buf=new Uint8Array(w);
  if(n===1){const t=laneText(firstLane(r),r,buf);return {text:$('selection-strand').value==='-'?reverseGapped(t):t};}
  const out=[];for(let k=0;k<n;k++){const lane=r.from+k;out.push(`>${laneName(lane)}\n${laneText(lane,r,buf)}\n`);}return {text:out.join('')};}
 function onRange(r){P.range=r;const c=host.cols(),n=laneCount(r),buf=new Uint8Array(r.c1-r.c0);let a=r.c0,b=r.c1-1;while(a<r.c1&&c.refOfCol[a]<0)a++;while(b>=r.c0&&c.refOfCol[b]<0)b--;
  const start=a<r.c1?c.refOfCol[a]:-1,end=b>=r.c0?c.refOfCol[b]+1:-1,where=start>=0?toDisplay(start).toLocaleString()+'–'+end.toLocaleString():'insertion 열';
  $('selection').hidden=false;$('selection').classList.toggle('is-multi',n>1);$('selection-state').textContent='';clearTimeout(timer);
  if(n>1){P.selection=null;$('selection-where').textContent=`${n.toLocaleString()}줄 · ${where}`;$('selection-seq').textContent='';$('selection-length').textContent=`${buf.length.toLocaleString()} 열`;return;}
  const lane=firstLane(r),shown=laneText(lane,r,buf),seq=shown.replaceAll('-','');
  P.selection={seq,start,end,source:r.source};
  $('selection-where').textContent=`${laneName(lane)} · ${where}`;
  $('selection-seq').textContent=shown.length>90?shown.slice(0,90)+'…':shown;$('selection-length').textContent=seq.length===shown.length?`${seq.length} nt`:`${seq.length} nt (열 ${shown.length})`;
  for(const id of ['selection-gc','selection-tm','selection-self'])$(id).textContent='…';$('selection-self').classList.remove('warn');
  timer=setTimeout(analyze,SELECTION_DELAY_MS);}
 function orient(){return $('selection-strand').value==='-'?reverseComplementSafe(P.selection.seq):P.selection.seq;}
 const reverseComplementSafe=s=>reverseComplement(s);
 function analyze(){const s=P.selection;if(!s?.seq)return;if(!/^[ACGTRYSWKMBDHVN]+$/.test(s.seq))return;worker.postMessage({id:++P.selectionId,sequence:orient(),conditions:P.conditions});}
 worker.onmessage=({data:d})=>{if(d.id!==P.selectionId)return;if(d.error){$('selection-tm').textContent='오류: '+d.error;return;}const r=d.result,g=r.gc;
  $('selection-gc').textContent=g.min===g.max?`${g.min.toFixed(1)}%`:`${g.min.toFixed(1)}–${g.max.toFixed(1)}%`;
  const t=r.tm;$('selection-tm').textContent=t.status==='ok'?(t.variants>1?`${t.min.toFixed(1)}–${t.max.toFixed(1)} °C · 평균 ${t.mean.toFixed(1)} · 변이 ${t.variants}종`:`${t.mean.toFixed(1)} °C`):`N/A (${t.reason})`;$('selection-tm').title=t.model??'';
  const f=r.self;$('selection-self').textContent=f.status==='ok'?`최저 ${f.text} kcal/mol · 구조 ${f.structures.toLocaleString()}개`+(f.variants>1?` · 변이 ${f.variants}종`:'')+(f.warning?' · ≤ −9 경고':''):f.status==='none'?'검출 구조 없음':`N/A (${f.reason})`;$('selection-self').classList.toggle('warn',!!f.warning);};
 $('selection-strand').addEventListener('change',analyze);
 $('selection-clear').addEventListener('click',()=>{host.viewer.clearRange();$('selection').hidden=true;P.selection=null;});
 $('selection-copy').addEventListener('click',async()=>{const c=copyText();if(c.error){$('selection-state').textContent=c.error;return;}try{await navigator.clipboard.writeText(c.text);$('selection-state').textContent='복사했습니다.';}catch{$('selection-state').textContent='복사에 실패했습니다.';}});
 // The copy event needs no clipboard permission. Text fields and text the user selected keep the normal copy.
 document.addEventListener('copy',e=>{const a=document.activeElement;if(!P.range||$('selection').hidden||$('pane-viewer').hidden||document.querySelector('dialog[open]')||a?.matches?.('input:not([type=checkbox]),textarea')||String(getSelection()))return;const c=copyText();if(c.error){$('selection-state').textContent=c.error;return;}e.clipboardData.setData('text/plain',c.text);e.preventDefault();$('selection-state').textContent='복사했습니다.';});
 $('selection-add').addEventListener('click',()=>{const s=P.selection;if(!s?.seq)return;const n=normalizeSequence(orient());if(n.error){$('selection-state').textContent=n.error;return;}if(s.start<0||s.end-s.start!==s.seq.length){$('selection-state').textContent='insertion이나 deletion이 포함된 구간은 위치를 고정할 수 없습니다. Primer 등록에서 서열로 입력하세요.';return;}
  const name=$('selection-name').value.trim();if(!name){$('selection-state').textContent='이름을 입력하세요.';$('selection-name').focus();return;}
  const strand=$('selection-strand').value==='-'?-1:1,form=strand>0?n.sequence:reverseComplement(n.sequence),hit=findSites(host.reference().subarray(s.start,s.end),n.sequence,{maxMismatch:n.sequence.length}).find(h=>h.strand===strand);
  add([{name,set:$('selection-set').value.trim(),sequence:n.sequence,visible:true,manual:true,hits:[],placed:'found',site:{start:s.start,end:s.end,strand,mismatches:hit?.mismatches??0,source:s.source==='consensus'?'consensus':'reference'},form}]);$('selection-state').textContent=`${name}을 등록했습니다.`;$('selection-name').value='';});
 // Tm conditions
 for(const [k,v] of Object.entries(P.conditions)){const i=$('tm-'+k);i.value=v;i.addEventListener('input',()=>{P.conditions[k]=i.value;analyze();renderList();});}
 function exportText(kind){const ref=host.referenceInfo();if(kind==='genbank')return ['reference_annotated.gb','text/plain',referenceGenbank({reference:ref,primers:P.list})];if(kind==='gff')return ['primer_annotations.gff3','text/plain',primerGff3({referenceId:host.referenceId(),referenceLength:ref.sequence.length,primers:P.list,circular:host.circular()})];return ['primer_sets.csv','text/csv',primerCsv(P.list,exportOptions())];}
 function snapshot(){const b=P.binding;return {state:{list:P.list.map(({hits,...p})=>({...p,hits:(hits??[]).slice(0,20)})),nextId:P.nextId,options:P.options,conditions:P.conditions,binding:b?{result:b.result,n:b.n,end3:b.end3,rule:b.rule,stale:P.stale}:null},cats:b?.cats??null,order:b?P.order:null};}
 function restore(saved,cats,order){P.list=saved.list;P.nextId=saved.nextId;P.options={...P.options,...saved.options};P.conditions={...P.conditions,...saved.conditions};
  for(const [id,k] of [['opt-mismatch','maxMismatch'],['opt-end3-exact','end3Exact'],['opt-end3','end3'],['opt-rule-end3','ruleEnd3'],['opt-rule-mismatch','ruleMismatch']])$(id).value=P.options[k];for(const [k,v] of Object.entries(P.conditions))$('tm-'+k).value=v;
  $('primer-count').textContent=P.list.length?`(${P.list.length})`:'';P.binding=saved.binding&&cats?{...saved.binding,cats}:null;P.order=order;P.stale=saved.binding?.stale??true;P.restored=true;}
 // Sites found under the old shape no longer hold, so chosen positions are searched again.
 function onTopology(){P.list=P.list.map(p=>p.manual&&p.site.end<=host.reference().length?p:{...p,locked:false,manual:false});changed({rerun:false});}
 return {handle,onRange,exportText,snapshot,restore,onTopology,onData(){if(P.restored){P.restored=false;refreshViewer();renderList();renderBinding();$('binding-state').textContent=P.binding?(P.stale?'조건이 바뀌었습니다. 재분석이 필요합니다.':'저장된 결과입니다.'):'';return;}P.binding=null;P.list=P.list.map(place);refreshViewer();renderList();},onConsensus(){if(P.list.some(p=>!p.manual&&p.site?.source!=='reference'))changed({rerun:false});},onFilter(){if(P.list.length){markStale();maybeAuto();}},onPrimerClick:focus,state:P,search,renderBinding};
}
