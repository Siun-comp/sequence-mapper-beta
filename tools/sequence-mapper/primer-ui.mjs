// SPDX-License-Identifier: GPL-2.0-or-later
// Primer registration, list, binding table and selected-range analysis.
import {PLACEMENT_METHOD,MIN_PRIMER_LENGTH,MAX_PRIMER_LENGTH,MASK,parseText,detectColumns,buildPrimers,placePrimer,chooseHit,reverseComplement,mixedBases,normalizeSequence,findSites} from './core/primer.mjs';
import {CAT,CAT_LABEL,BINDING_NOTE,BINDING_METHOD,recordsInCell,variantParts,isWholeDeletion} from './core/binding.mjs';
import {readFirstSheet} from './core/xlsx-read.mjs';
import {DEFAULT_CONDITIONS,tmSummary,gcRange,selfDimerSummary} from './core/selection.mjs';
import {toDisplay} from './core/alignment.mjs';
import {referenceGenbank,primerGff3,primerCsv,primerRows,bindingCsv,endOf,PRIMER_COLUMNS} from './core/annotation-export.mjs';
import {excelSafe} from './core/export.mjs';
const $=id=>document.getElementById(id),dec=new TextDecoder();
// Above this much work the table waits for the button; measured about 1 second on the stage-1 PC.
const AUTO_BINDING_WORK=2e6,SELECTION_DELAY_MS=180,MAX_COPY_CELLS=30e6;
const el=(tag,props={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='data')Object.assign(e.dataset,v);else e[k]=v;}e.append(...kids.filter(x=>x!==null&&x!==undefined));return e;};
const pct=(n,total)=>total?(n/total*100).toFixed(1)+'%':'–';

export function setupPrimers(host){
 const P={list:[],nextId:1,options:{maxMismatch:3,end3:3,end3Exact:0,ruleEnd3:5,ruleMismatch:1},binding:null,includeReference:false,stale:true,selected:new Set(),anchor:null,undo:null,editTarget:null,running:false,runId:0,draft:null,conditions:{...DEFAULT_CONDITIONS},range:null,selectionId:0};
 const worker=new Worker('workers/selection-worker.mjs',{type:'module'});

 // Placement
 const search={get maxMismatch(){return P.options.maxMismatch;},get end3Exact(){return P.options.end3Exact;}};
 function place(p){return p.manual||p.locked?p:placePrimer(p,host.reference(),host.consensus(),{maxMismatch:P.options.maxMismatch,end3Exact:P.options.end3Exact,circular:host.circular()});}
 const siteText=s=>`${toDisplay(s.start).toLocaleString()}–${endOf(s,host.reference().length).toLocaleString()}`;
 // Tm and GC depend on the sequence and the conditions only, and the list redraws often.
 const metricCache=new Map();
 function metrics(p){const key=p.sequence+'|'+JSON.stringify(P.conditions);let m=metricCache.get(key);if(!m){const t=tmSummary(p.sequence,P.conditions),g=gcRange(p.sequence);m={self:selfOf(p.sequence).text,tm:t.status==='ok'?(t.variants>1?`${t.min.toFixed(1)}–${t.max.toFixed(1)}`:t.mean.toFixed(1)):'N/A',gc:g.min===g.max?g.min.toFixed(1):`${g.min.toFixed(1)}–${g.max.toFixed(1)}`};if(metricCache.size>2000)metricCache.clear();metricCache.set(key,m);}return m;}
 const selfCache=new Map();
 function selfOf(seq){let s=selfCache.get(seq);if(!s){const f=selfDimerSummary(seq);s=f.status==='ok'?{text:f.text,warn:!!f.warning}:{text:f.status==='none'?'없음':'N/A',warn:false};if(selfCache.size>2000)selfCache.clear();selfCache.set(seq,s);}return s;}
 function changed({rerun=true}={}){P.list=P.list.map(place);refreshViewer();renderList();markStale();if(rerun)maybeAuto();}
 function refreshViewer(){host.viewer.setPrimers(P.list.filter(p=>p.site).map(p=>({id:p.id,name:p.name,start:p.site.start,end:p.site.end,strand:p.site.strand,mismatches:p.site.mismatches+(p.site.unresolved??0),visible:p.visible})));}
 function add(primers){for(const p of primers)P.list.push({...p,id:P.nextId++});changed();$('primer-count').textContent=P.list.length?`(${P.list.length})`:'';}
 function statusText(p){if(!p.site)return '위치 없음';const parts=[];if(p.manual)parts.push('직접 지정');if(p.site.source==='consensus')parts.push('Consensus에서 찾음');if(p.site.end>host.reference().length)parts.push('원점 걸침');const unsure=p.site.unresolved??0;if(p.site.mismatches)parts.push(`mismatch ${p.site.mismatches}`);if(unsure)parts.push(`판정 불가 염기 ${unsure}개`);if(!p.site.mismatches&&!unsure)parts.push('일치');if(p.hits?.length>1){const tied=new Set(p.hits.filter(h=>h.mismatches===p.site.mismatches&&(h.unresolved??0)===unsure).map(h=>h.start)).size;parts.push(tied>1?`위치 ${p.hits.length}곳 (같은 점수 ${tied}곳)`:`위치 ${p.hits.length}곳`);}return parts.join(' · ');}
 function renderList(){
  const body=$('primer-rows');body.replaceChildren();$('primer-empty').hidden=P.list.length>0;
  for(const id of [...P.selected])if(!P.list.some(p=>p.id===id))P.selected.delete(id);
  for(const p of P.list){const tr=el('tr',{class:(p.id===host.viewer.activePrimer?'is-active ':'')+(P.selected.has(p.id)?'is-picked':''),data:{id:p.id}});
   const show=el('input',{type:'checkbox',checked:p.visible,ariaLabel:p.name+' 표시',onchange(){p.visible=show.checked;refreshViewer();}});
   const where=p.site?siteText(p.site):'–',m=metrics(p);
   const cell=el('td',{class:'num'},where);
   if(p.hits?.length>1){const sel=el('select',{ariaLabel:p.name+' 위치 선택',onchange(){const q=chooseHit(p,+sel.value);Object.assign(p,{site:q.site,locked:true});refreshViewer();markStale();maybeAuto();}});p.hits.slice(0,20).forEach((h,i)=>sel.append(el('option',{value:i,selected:h.start===p.site.start&&h.strand===p.site.strand,textContent:`${toDisplay(h.start).toLocaleString()} (${h.strand>0?'+':'−'}, mm ${h.mismatches}${h.unresolved?`, 판정 불가 ${h.unresolved}`:''})`})));cell.replaceChildren(sel);}
   const self=selfOf(p.sequence);
   tr.append(el('td',{class:'handle',title:'끌어서 순서 변경',ariaHidden:'true'},'⋮⋮'),el('td',{},show),el('td',{},p.set||'–'),el('td',{},el('button',{type:'button',class:'link',textContent:p.name,disabled:!p.site,onclick(){focus(p.id);}})),el('td',{class:'mono'},p.sequence),el('td',{class:'num'},String(p.sequence.length)),el('td',{class:'num'},String(mixedBases(p.sequence))),el('td',{class:'num'},m.tm),el('td',{class:'num'},m.gc),el('td',{class:'num'+(self.warn?' warn':''),title:self.warn?'≤ −9 kcal/mol':''},self.text),cell,el('td',{class:'dir'},p.site?(p.site.strand>0?'+':'−'):'–'),el('td',{class:p.site?'':'bad'},statusText(p)),el('td',{class:'actions'},el('button',{type:'button',textContent:'수정',ariaLabel:p.name+' 수정',onclick(){openEdit(p.id);}}),el('button',{type:'button',textContent:'삭제',ariaLabel:p.name+' 삭제',onclick(){P.list=P.list.filter(x=>x!==p);P.selected.delete(p.id);if(P.editTarget===p.id)P.editTarget=null;changed();$('primer-count').textContent=P.list.length?`(${P.list.length})`:'';}})));
   body.append(tr);}
  updateOrderButtons();
 }
 function focus(id){const p=P.list.find(x=>x.id===id);if(!p?.site)return;host.showTab('viewer');host.viewer.setActivePrimer(id);host.viewer.scrollToColumn(host.cols().colOf[p.site.start]);renderList();host.hoverText(`${p.name} · ${siteText(p.site)} · ${p.site.strand>0?'+':'−'} · ${p.sequence}`);}

 // Registration dialog
 const dialog=$('primer-dialog');
 $('open-primer').addEventListener('click',()=>{P.draft=null;$('primer-paste').value='';$('primer-file').value='';$('primer-preview').hidden=true;$('primer-error').textContent='';$('primer-add').disabled=true;dialog.showModal();});
 $('primer-cancel').addEventListener('click',()=>dialog.close());
 function preview(rows){
  $('primer-error').textContent='';if(!rows.length){$('primer-preview').hidden=true;$('primer-add').disabled=true;return;}
  const map=detectColumns(rows),width=Math.max(...rows.slice(0,50).map(r=>r.length));P.draft={rows,map,type:map.type};
  for(const [id,key,optional] of [['map-name','name',false],['map-sequence','sequence',false],['map-set','set',true]]){const s=$(id);s.replaceChildren();if(optional)s.append(el('option',{value:-1,textContent:'사용 안 함'}));for(let c=0;c<width;c++)s.append(el('option',{value:c,textContent:map.header?`${c+1}열: ${rows[0][c]??''}`:`${c+1}열`}));s.value=map[key]??-1;}
  $('map-header').checked=map.header;$('primer-preview').hidden=false;updateDraft();
 }
 function updateDraft(){
  const d=P.draft;if(!d)return;d.map={header:$('map-header').checked,name:+$('map-name').value,sequence:+$('map-sequence').value,set:+$('map-set').value,type:d.type};
  const r=buildPrimers(d.rows,d.map,{defaultSet:$('primer-set').value.trim(),existing:P.list});d.result=r;
  const t=$('primer-preview-rows');t.replaceChildren(...r.primers.slice(0,8).map(p=>el('tr',{},el('td',{},p.set||'–'),el('td',{},p.name),el('td',{class:'mono'},p.sequence))));
  const renamed=r.primers.filter(p=>p.renamed).length;
  $('primer-preview-note').textContent=`등록 ${r.primers.length.toLocaleString()}개`+(r.primers.length>8?' (앞 8개 표시)':'')+(renamed?` · 같은 이름 ${renamed}개는 번호를 붙입니다`:'')+(r.skipped?` · primer가 아닌 주석 ${r.skipped.toLocaleString()}행은 읽지 않음`:'')+(r.errors.length?` · 오류 ${r.errors.length}행`:'');
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
  host.analysis().postMessage({type:'binding',id,order,primers,options:{end3:P.options.end3,includeReference:P.includeReference,rule:{end3:P.options.ruleEnd3,maxMismatch:P.options.ruleMismatch}}});
 }
 function done(d){if(d.id!==P.runId)return;P.running=false;d.method=BINDING_METHOD;P.legacy=false;P.binding=d;P.stale=false;$('binding-run').disabled=false;$('binding-cancel').hidden=true;$('binding-state').textContent=`${d.n.toLocaleString()}개 서열${d.reference?'(Reference 포함)':''} · primer ${d.result.length}개 분석 완료`;renderBinding();}
 function handle(d){if(d.type==='binding-progress'){if(d.id===P.runId)$('binding-state').textContent=`분석 중 ${d.done.toLocaleString()} / ${d.total.toLocaleString()}`;return true;}if(d.type==='binding-done'){done(d);return true;}return false;}
 $('binding-run').addEventListener('click',run);
 $('binding-cancel').addEventListener('click',()=>{host.analysis().postMessage({type:'binding-cancel'});P.running=false;P.runId++;$('binding-run').disabled=false;$('binding-cancel').hidden=true;$('binding-state').textContent='분석을 취소했습니다.';});
 const COLS=[[CAT.MATCH,'일치'],['rule','조건 충족'],[CAT.MM1,'1 mismatch'],[CAT.MM2,'2+ mismatch'],['end3',"3′ mismatch"],[CAT.INDEL,'indel 포함'],[CAT.UNRESOLVED,'판정 불가'],[CAT.UNCOVERED,'구간 미포함']];
 const value=(t,c)=>c==='end3'?t.end3:c==='rule'?t.rule:t.counts[c];
 const ruleText=r=>`3′ 끝 ${r.end3} nt 완전일치, 전체 mismatch ${r.maxMismatch}개 이하`,refNote=b=>b.reference?'대상 서열에는 목록에서 지정한 Reference 1건이 포함됩니다. ':'';
 function renderBinding(){
  const b=P.binding,body=$('binding-rows');body.replaceChildren();$('binding-empty').hidden=!!b;$('binding-copy').disabled=!b;$('binding-csv').disabled=!b;$('binding-scope').textContent=b?host.scopeText(P.order,b.reference):'';if(!b)return;$('binding-end3').textContent=`${refNote(b)}3′ mismatch는 3′ 끝 ${b.end3} nt 안의 mismatch 건수이고, 조건 충족은 ${ruleText(b.rule)}인 서열 수입니다. 완전일치를 포함하며 indel·판정 불가·구간 미포함은 제외합니다. 두 칸은 다른 칸과 겹칩니다.`;
  for(const {t,index} of bindingView(b)){const tr=el('tr',{},el('td',{},t.set||'–'),el('td',{},el('button',{type:'button',class:'link',textContent:t.name,onclick(){focus(t.id);}})),el('td',{class:'num'},t.total.toLocaleString()));
   for(const [c,label] of COLS){const n=value(t,c);tr.append(el('td',{class:'num'},n?el('button',{type:'button',class:'link cell',title:label+' 서열만 보기',ariaLabel:`${t.name} ${label} ${n}건 보기`,onclick(){show(index,c,label);},textContent:n.toLocaleString()}):'0',el('small',{},' '+pct(n,t.total))));}
   tr.append(el('td',{},el('button',{type:'button',textContent:`변이형 ${t.variantCount.toLocaleString()}`,onclick(){variants(t);}})));body.append(tr);}
 }
 // Rows in the primer list order; results of deleted primers come last until the next analysis.
 function bindingView(b){const pos=new Map(b.result.map((t,i)=>[t.id,i])),out=[];const push=i=>{const t=b.result[i],p=P.list.find(x=>x.id===t.id);out.push({t:p?{...t,name:p.name,set:p.set}:t,index:i});};for(const p of P.list){const i=pos.get(p.id);if(i!==undefined){push(i);pos.delete(p.id);}}for(const i of pos.values())push(i);return out;}
 function show(index,c,label){const b=P.binding,t=b.result[index],list=recordsInCell(b.cats,b.n,index,P.order,c);host.forceRecords(list,`${t.name} · ${label}`);focus(t.id);}
 function variants(t){const primer=t.primer??P.list.find(p=>p.id===t.id)?.sequence??'',miss=t.counts[CAT.UNCOVERED],evaluated=t.total-miss;
  $('variant-title').textContent=`${t.name} 구간 변이형 (5′→3′, primer 방향)`;
  $('variant-note').textContent=`서로 다른 형태 ${t.variantCount.toLocaleString()}개`+(t.variantCount>t.variants.length?` 중 많은 순서 ${t.variants.length}개`:'')+`. 비율은 구간을 평가한 ${evaluated.toLocaleString()}건 기준이며 구간 미포함 ${miss.toLocaleString()}건은 제외합니다. 건수는 레코드 수입니다. Primer와 다른 염기·deletion(-)·insertion(+n)은 붉은색, N 등 판정 불가 염기는 노란색입니다. insertion은 위치와 길이만 구분하므로 삽입된 염기가 달라도 한 형태로 셉니다. 확정 차이는 확정 mismatch와 indel 길이의 합이며, 판정 불가 염기는 세지 않으므로 0이어도 완전일치가 아닐 수 있습니다. 구간 전체 deletion은 결합 현황에서 indel 포함으로 셉니다.`;
  const seqCell=v=>{const td=el('td',{class:'mono'});if(isWholeDeletion(v.sequence)){td.append(el('span',{class:'var-del var-whole',textContent:'구간 전체 deletion'}),` (${v.sequence.length} nt)`);return td;}const parts=primer&&variantParts(v.sequence,primer);if(!parts){td.textContent=v.sequence;return td;}for(const x of parts)td.append(x.kind?el('span',{class:`var-${x.kind}`,textContent:x.text}):x.text);return td;};
  const head=primer?[el('tr',{class:'variant-ref'},el('td',{class:'mono',textContent:primer}),el('td',{class:'num',textContent:'Primer'}),el('td',{}),el('td',{}))]:[];
  $('variant-rows').replaceChildren(...head,...t.variants.map(v=>el('tr',{},seqCell(v),el('td',{class:'num'},v.count.toLocaleString()),el('td',{class:'num'},pct(v.count,evaluated)),el('td',{class:'num'},String(v.differences)))));$('variant-dialog').showModal();}
 $('variant-close').addEventListener('click',()=>$('variant-dialog').close());
 $('binding-csv').addEventListener('click',()=>host.saveText('binding_summary.csv','text/csv',bindingCsv({...P.binding,result:bindingView(P.binding).map(x=>x.t)},COLS,value,`${host.scopeText(P.order,P.binding.reference)}. ${refNote(P.binding)}조건 충족: ${ruleText(P.binding.rule)}. ${BINDING_NOTE}`)));
 function tableText(){const b=P.binding,head=['Set','Primer','대상 서열',...COLS.map(c=>c[1])],rows=bindingView(b).map(x=>x.t).map(t=>[t.set,t.name,t.total,...COLS.map(([c])=>value(t,c))]);return {head,rows};}
 // Excel keeps the columns from the HTML form; the plain text is the fallback.
 async function copyTable(head,rawRows,note,status){const rows=rawRows.map(r=>r.map(excelSafe)),text=[head,...rows].map(r=>r.join('\t')).join('\n')+(note?`\n${note}`:'');const cell=(t,v)=>{const x=document.createElement(t);x.textContent=v;x.style.cssText="font:9pt 'Malgun Gothic'";return x.outerHTML;};const html=`<table>${[head.map(h=>cell('th',h)).join(''),...rows.map(r=>r.map(v=>cell('td',v)).join(''))].map(r=>`<tr>${r}</tr>`).join('')}</table>`;
  try{await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);status.textContent='표를 복사했습니다.';}catch{try{await navigator.clipboard.writeText(text);status.textContent='표를 일반 텍스트로 복사했습니다.';}catch{status.textContent='복사에 실패했습니다.';}}}
 $('binding-copy').addEventListener('click',()=>{const {head,rows}=tableText();copyTable(head,rows,`${host.scopeText(P.order,P.binding.reference)}\n${refNote(P.binding)}조건 충족: ${ruleText(P.binding.rule)}\n${BINDING_NOTE}`,$('binding-state'));});
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
 function copyText(reverse=false){const r=P.range,n=laneCount(r),w=r.c1-r.c0;if(n*w>MAX_COPY_CELLS)return {error:`선택이 ${n.toLocaleString()}줄로 너무 큽니다. 내보내기의 Aligned FASTA를 쓰세요.`};const buf=new Uint8Array(w);
  if(n===1){const t=laneText(firstLane(r),r,buf);return {text:reverse?reverseGapped(t):t};}
  const out=[];for(let k=0;k<n;k++){const lane=r.from+k;out.push(`${laneText(lane,r,buf)}\n`);}return {text:out.join('')};}
 function onRange(r){P.range=r;P.selectionId++;const c=host.cols(),n=laneCount(r),buf=new Uint8Array(r.c1-r.c0);let a=r.c0,b=r.c1-1;while(a<r.c1&&c.refOfCol[a]<0)a++;while(b>=r.c0&&c.refOfCol[b]<0)b--;
  const start=a<r.c1?c.refOfCol[a]:-1,end=b>=r.c0?c.refOfCol[b]+1:-1,where=start>=0?toDisplay(start).toLocaleString()+'–'+end.toLocaleString():'insertion 열';
  $('selection').hidden=false;$('selection').classList.toggle('is-multi',n>1);$('selection-state').textContent='';clearTimeout(timer);
  if(n>1){P.selection=null;$('selection-where').textContent=`${n.toLocaleString()}줄 · ${where}`;$('selection-seq').textContent='';$('selection-length').textContent=`${buf.length.toLocaleString()} 열`;return;}
  const lane=firstLane(r),shown=laneText(lane,r,buf),seq=shown.replaceAll('-','');
  P.selection={seq,start,end,source:r.source};
  $('selection-where').textContent=`${laneName(lane)} · ${where}`;
  $('selection-seq').textContent=shown.length>90?shown.slice(0,90)+'…':shown;$('selection-length').textContent=seq.length===shown.length?`${seq.length} nt`:`${seq.length} nt (열 ${shown.length})`;
  for(const id of ['selection-gc','selection-tm','selection-self'])$(id).textContent='…';$('selection-self').classList.remove('warn');
  timer=setTimeout(analyze,SELECTION_DELAY_MS);updateReplace();}
 function orient(){return $('selection-strand').value==='-'?reverseComplementSafe(P.selection.seq):P.selection.seq;}
 const reverseComplementSafe=s=>reverseComplement(s);
 function analyze(){const s=P.selection;if(!s?.seq||!/^[ACGTRYSWKMBDHVN]+$/.test(s.seq)){for(const id of ['selection-gc','selection-tm','selection-self'])$(id).textContent='–';return;}worker.postMessage({id:++P.selectionId,sequence:orient(),conditions:P.conditions});}
 worker.onmessage=({data:d})=>{if(d.id!==P.selectionId)return;if(d.error){$('selection-tm').textContent='오류: '+d.error;return;}const r=d.result,g=r.gc;
  $('selection-gc').textContent=g.min===g.max?`${g.min.toFixed(1)}%`:`${g.min.toFixed(1)}–${g.max.toFixed(1)}%`;
  const t=r.tm;$('selection-tm').textContent=t.status==='ok'?(t.variants>1?`${t.min.toFixed(1)}–${t.max.toFixed(1)} °C · 평균 ${t.mean.toFixed(1)} · 변이 ${t.variants}종`:`${t.mean.toFixed(1)} °C`):`N/A (${t.reason})`;$('selection-tm').title=t.model??'';
  const f=r.self;$('selection-self').textContent=f.status==='ok'?`최저 ${f.text} kcal/mol · 구조 ${f.structures.toLocaleString()}개`+(f.variants>1?` · 변이 ${f.variants}종`:'')+(f.warning?' · ≤ −9 경고':''):f.status==='none'?'검출 구조 없음':`N/A (${f.reason})`;$('selection-self').classList.toggle('warn',!!f.warning);};
 $('selection-strand').addEventListener('change',()=>{$('selection-dialog-seq').textContent=orient();analyze();});
 const clearSelection=()=>{host.viewer.clearRange();$('selection').hidden=true;P.selection=null;updateReplace();};
 $('selection-clear').addEventListener('click',clearSelection);
 // Esc keeps its meaning in dialogs and text fields; the find box handles its own.
 document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented||$('selection').hidden||document.querySelector('dialog[open]')||document.activeElement?.matches?.('input:not([type=checkbox],[type=range]),textarea,select'))return;clearSelection();});
 const copyButton=reverse=>async()=>{const c=copyText(reverse);if(c.error){$('selection-state').textContent=c.error;return;}try{await navigator.clipboard.writeText(c.text);$('selection-state').textContent=reverse?'역상보를 복사했습니다.':'복사했습니다.';}catch{$('selection-state').textContent='복사에 실패했습니다.';}};
 $('selection-copy').addEventListener('click',copyButton(false));$('selection-copy-rc').addEventListener('click',copyButton(true));
 // The copy event needs no clipboard permission. Text fields and text the user selected keep the normal copy.
 document.addEventListener('copy',e=>{const a=document.activeElement;if(!P.range||$('selection').hidden||$('pane-viewer').hidden||document.querySelector('dialog[open]')||a?.matches?.('input:not([type=checkbox]),textarea')||String(getSelection()))return;const c=copyText();if(c.error){$('selection-state').textContent=c.error;return;}e.clipboardData.setData('text/plain',c.text);e.preventDefault();$('selection-state').textContent='복사했습니다.';});
 // The strand choice lives in the dialog, so a closed dialog always means the shown strand.
 const addDialog=$('selection-dialog');
 $('selection-open-add').addEventListener('click',()=>{const s=P.selection;if(!s?.seq)return;if(s.start<0||s.end-s.start!==s.seq.length){$('selection-state').textContent='insertion이나 deletion이 포함된 구간은 위치를 고정할 수 없습니다. Primer 등록에서 서열로 입력하세요.';return;}$('selection-dialog-where').textContent=$('selection-where').textContent;$('selection-dialog-seq').textContent=orient();$('selection-dialog-error').textContent='';addDialog.showModal();$('selection-name').focus();});
 $('selection-cancel').addEventListener('click',()=>addDialog.close());
 addDialog.addEventListener('close',()=>{if($('selection-strand').value==='+')return;$('selection-strand').value='+';analyze();});
 $('selection-add').addEventListener('click',()=>{const s=P.selection;if(!s?.seq)return;const n=normalizeSequence(orient());if(n.error){$('selection-dialog-error').textContent=n.error;return;}
  const name=$('selection-name').value.trim();if(!name){$('selection-dialog-error').textContent='이름을 입력하세요.';$('selection-name').focus();return;}
  const strand=$('selection-strand').value==='-'?-1:1,form=strand>0?n.sequence:reverseComplement(n.sequence),hit=findSites(host.reference().subarray(s.start,s.end),n.sequence,{maxMismatch:n.sequence.length}).find(h=>h.strand===strand);
  add([{name,set:$('selection-set').value.trim(),sequence:n.sequence,visible:true,manual:true,hits:[],placed:'found',site:{start:s.start,end:s.end,strand,mismatches:hit?.mismatches??0,unresolved:hit?.unresolved??0,source:s.source==='consensus'?'consensus':'reference'},form}]);addDialog.close();$('selection-state').textContent=`${name}을 등록했습니다.`;$('selection-name').value='';});
 // Row selection and order. Moving keeps the relative order of the chosen rows; the binding table is only redrawn.
 const listIds=()=>P.list.map(p=>p.id),picked=()=>P.list.filter(p=>P.selected.has(p.id));
 function updateOrderButtons(){const n=P.selected.size;for(const id of ['order-top','order-up','order-down','order-bottom'])$(id).disabled=!n;$('order-undo').disabled=!P.undo;$('order-state').textContent=n?`${n}개 선택`:'';}
 function paint(){for(const tr of $('primer-rows').children)tr.classList.toggle('is-picked',P.selected.has(+tr.dataset.id));updateOrderButtons();}
 function setOrder(next){const before=listIds();if(next.length===before.length&&next.every((p,i)=>p.id===before[i]))return false;P.undo=before;P.list=next;renderList();renderBinding();return true;}
 function moveBy(dir){const a=[...P.list],on=x=>P.selected.has(x.id);if(dir<0){for(let i=1;i<a.length;i++)if(on(a[i])&&!on(a[i-1]))[a[i-1],a[i]]=[a[i],a[i-1]];}else{for(let i=a.length-2;i>=0;i--)if(on(a[i])&&!on(a[i+1]))[a[i],a[i+1]]=[a[i+1],a[i]];}setOrder(a);}
 function moveTo(end){const chosen=picked(),rest=P.list.filter(p=>!P.selected.has(p.id));setOrder(end<0?[...chosen,...rest]:[...rest,...chosen]);}
 // index counts positions in the full list, 0..n, as shown while dragging.
 function insertAt(moving,index){const ids=new Set(moving.map(p=>p.id));let k=0;for(let i=0;i<index&&i<P.list.length;i++)if(!ids.has(P.list[i].id))k++;const rest=P.list.filter(p=>!ids.has(p.id));setOrder([...rest.slice(0,k),...moving,...rest.slice(k)]);}
 function groupBySet(){const first=new Map();P.list.forEach((p,i)=>{if(!first.has(p.set))first.set(p.set,i);});setOrder(P.list.map((p,i)=>[p,i]).sort((a,b)=>first.get(a[0].set)-first.get(b[0].set)||a[1]-b[1]).map(x=>x[0]));}
 function undoOrder(){const back=P.undo;if(!back)return;const byId=new Map(P.list.map(p=>[p.id,p])),next=back.map(id=>byId.get(id)).filter(Boolean);for(const p of P.list)if(!back.includes(p.id))next.push(p);P.list=next;P.undo=null;renderList();renderBinding();}
 $('order-top').addEventListener('click',()=>moveTo(-1));$('order-bottom').addEventListener('click',()=>moveTo(1));$('order-up').addEventListener('click',()=>moveBy(-1));$('order-down').addEventListener('click',()=>moveBy(1));$('order-group').addEventListener('click',groupBySet);$('order-undo').addEventListener('click',undoOrder);
 const rowsEl=$('primer-rows'),controls='input,button,select,a,td.handle';
 rowsEl.addEventListener('mousedown',e=>{if((e.shiftKey||e.ctrlKey||e.metaKey)&&!e.target.closest(controls))e.preventDefault();});
 rowsEl.addEventListener('click',e=>{const tr=e.target.closest('tr[data-id]');if(!tr||e.target.closest(controls))return;if(!e.shiftKey&&String(getSelection()))return;const id=+tr.dataset.id,multi=e.ctrlKey||e.metaKey;
  if(e.shiftKey&&P.anchor!==null){const a=P.list.findIndex(p=>p.id===P.anchor),b=P.list.findIndex(p=>p.id===id);if(a>=0&&b>=0){if(!multi)P.selected.clear();for(let i=Math.min(a,b);i<=Math.max(a,b);i++)P.selected.add(P.list[i].id);paint();return;}}
  if(multi){if(P.selected.has(id))P.selected.delete(id);else P.selected.add(id);}else{P.selected.clear();P.selected.add(id);}P.anchor=id;paint();});
 // Dragging uses pointer events so the drop line and the edge scrolling stay under our control.
 rowsEl.addEventListener('pointerdown',e=>{const h=e.target.closest('td.handle');if(!h||e.button)return;e.preventDefault();const id=+h.parentElement.dataset.id;if(!P.selected.has(id)){P.selected.clear();P.selected.add(id);P.anchor=id;paint();}
  const moving=picked(),wrap=rowsEl.closest('.table-wrap');let y=e.clientY,drop=null,raf=0;document.body.classList.add('is-dragging');for(const tr of rowsEl.children)tr.classList.toggle('is-moving',P.selected.has(+tr.dataset.id));
  const unmark=()=>{for(const tr of rowsEl.children)tr.classList.remove('drop-before','drop-after');};
  const mark=()=>{unmark();const list=[...rowsEl.children];let i=list.length;for(let k=0;k<list.length;k++){const r=list[k].getBoundingClientRect();if(y<r.top+r.height/2){i=k;break;}}drop=i;if(i<list.length)list[i].classList.add('drop-before');else list.at(-1)?.classList.add('drop-after');};
  const tick=()=>{const r=wrap.getBoundingClientRect();if(y<r.top+28)wrap.scrollTop-=12;else if(y>r.bottom-28)wrap.scrollTop+=12;mark();raf=requestAnimationFrame(tick);};
  const move=ev=>{y=ev.clientY;};
  const finish=apply=>{cancelAnimationFrame(raf);removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',cancel);document.body.classList.remove('is-dragging');unmark();for(const tr of rowsEl.children)tr.classList.remove('is-moving');P.drag=null;if(apply&&drop!==null)insertAt(moving,drop);};
  const up=()=>finish(true),cancel=()=>finish(false);P.drag={cancel};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',cancel);tick();});
 // Runs before the selection Esc handler, so Esc in the list only clears the list.
 document.addEventListener('keydown',e=>{if($('pane-primers').hidden||document.querySelector('dialog[open]'))return;if(e.key==='Escape'&&P.drag){P.drag.cancel();e.preventDefault();return;}if(document.activeElement?.matches?.('input:not([type=checkbox]),textarea,select'))return;
  if(e.key==='Escape'&&P.selected.size){P.selected.clear();paint();e.preventDefault();return;}
  if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')&&P.selected.size){e.preventDefault();moveBy(e.key==='ArrowUp'?-1:1);rowsEl.querySelector('tr.is-picked')?.scrollIntoView({block:'nearest'});}},true);

 // Primer edit. Ends and moves take bases from the reference and fix the site; a typed sequence is searched again.
 const editor=$('edit-dialog');let E=null,editTimer=0;
 const byId=id=>P.list.find(p=>p.id===id);
 function refAt(i){const r=host.reference(),L=r.length;if(host.circular())return r[((i%L)+L)%L];return i>=0&&i<L?r[i]:0;}
 function refSlice({start,end,strand}){let s='';for(let i=start;i<end;i++)s+=String.fromCharCode(refAt(i));return strand>0?s:reverseComplement(s);}
 function siteFacts(seq,site){if(!site)return null;let target='';for(let i=site.start;i<site.end;i++)target+=String.fromCharCode(refAt(i)||78);const h=findSites(Uint8Array.from(target,c=>c.charCodeAt(0)),seq,{maxMismatch:seq.length}).find(x=>x.strand===site.strand);return {mismatches:h?.mismatches??0,unresolved:h?.unresolved??0};}
 function openEdit(id,range=null){const p=byId(id);if(!p)return;P.editTarget=null;updateReplace();
  E={id,mode:'none',sequence:p.sequence,site:p.site?{start:p.site.start,end:p.site.end,strand:p.site.strand}:null};
  if(range){E.site={start:range.start,end:range.end,strand:p.site?.strand??1};E.sequence=refSlice(E.site);E.mode='range';}
  $('edit-name').value=p.name;$('edit-set').value=p.set;$('edit-seq').value=E.sequence;$('edit-error').textContent='';$('edit-title').textContent=`Primer 수정 · ${p.name}`;if(!editor.open)editor.showModal();drawEdit();}
 function drawEdit(){
  const box=$('edit-context'),s=E.site,L=host.reference().length,seq=E.sequence,cons=host.consensus();box.replaceChildren();
  const nudge=!!s&&(host.circular()||s.end<=L);for(const id of ['edit-ext5','edit-trim5','edit-ext3','edit-trim3','edit-left','edit-right'])$(id).disabled=!nudge;$('edit-flip').disabled=!seq;
  if(s){const pad=15,a=s.start-pad,b=s.end+pad,form=s.strand>0?seq:reverseComplement(seq),w=Math.max(9,String(L).length+1),line=(label,text)=>{box.append(el('span',{class:'lab'},label.padEnd(12)),...text,'\n');};
   const pos=i=>{const v=host.circular()?((i%L)+L)%L:i;return v>=0&&v<L?v:-1;},num=i=>{const v=pos(i);return v<0?'':String(v+1);};
   line('',[el('span',{class:'lab'},num(a).padEnd(w)+' '.repeat(Math.max(0,s.start-a-w))+num(s.start).padEnd(Math.max(1,s.end-s.start))+num(s.end-1))]);
   const refSpans=[],consSpans=[],priSpans=[];for(let i=a;i<b;i++){const inSite=i>=s.start&&i<s.end,c=refAt(i),ch=c?String.fromCharCode(c):' ';refSpans.push(el('span',{class:inSite?'on':''},ch));if(cons){const v=pos(i),k=v>=0?cons[v]:0;consSpans.push(el('span',{class:inSite?'on':''},k?String.fromCharCode(k):' '));}
    if(!inSite){priSpans.push(' ');continue;}const pc=form[i-s.start],t=MASK[c],m=MASK[pc.charCodeAt(0)];priSpans.push(el('span',{class:!t||!(t&m)?'mm':t&~m?'uk':''},pc));}
   line('Reference',refSpans);if(cons)line('Consensus',consSpans);line(`Primer (${s.strand>0?'+':'−'})`,priSpans);}
  else box.append(el('span',{class:'lab'},'위치를 찾지 못했습니다. 저장하면 위치 없음으로 남습니다.'));
  const m=metrics({sequence:seq}),f=siteFacts(seq,s),self=selfOf(seq),parts=[`길이 ${seq.length} nt`,`Tm ${m.tm} °C`,`GC ${m.gc}%`,`Self-dimer ${self.text}${self.warn?' (≤ −9)':''}`];if(s)parts.push(`${toDisplay(s.start).toLocaleString()}–${endOf(s,L).toLocaleString()} ${s.strand>0?'+':'−'}`,f.mismatches?`mismatch ${f.mismatches}`:'',f.unresolved?`판정 불가 ${f.unresolved}`:'',!f.mismatches&&!f.unresolved?'Reference와 일치':'');
  $('edit-facts').textContent=parts.filter(Boolean).join(' · ');
  $('edit-mode').textContent=E.mode==='range'?'이 위치에 고정합니다 (직접 지정).':E.mode==='typed'?'입력한 서열로 위치를 다시 찾았습니다. 저장하면 이 위치를 사용합니다.':s?'서열을 바꾸지 않으면 위치를 유지합니다.':'';}
 function nudge(kind){const s={...E.site},plus=s.strand>0,L=host.reference().length;
  if(kind==='ext5'){if(plus)s.start--;else s.end++;}else if(kind==='trim5'){if(plus)s.start++;else s.end--;}else if(kind==='ext3'){if(plus)s.end++;else s.start--;}else if(kind==='trim3'){if(plus)s.end--;else s.start++;}else if(kind==='left'){s.start--;s.end--;}else{s.start++;s.end++;}
  const len=s.end-s.start;if(len<MIN_PRIMER_LENGTH||len>MAX_PRIMER_LENGTH){$('edit-error').textContent=`길이는 ${MIN_PRIMER_LENGTH}–${MAX_PRIMER_LENGTH} nt입니다.`;return;}
  if(!host.circular()&&(s.start<0||s.end>L)){$('edit-error').textContent='Reference 끝을 넘을 수 없습니다.';return;}if(host.circular()){if(s.start<0){s.start+=L;s.end+=L;}else if(s.start>=L){s.start-=L;s.end-=L;}}
  E.site=s;E.sequence=refSlice(s);E.mode='range';$('edit-seq').value=E.sequence;$('edit-error').textContent='';drawEdit();}
 for(const k of ['ext5','trim5','ext3','trim3','left','right'])$('edit-'+k).addEventListener('click',()=>nudge(k));
 $('edit-flip').addEventListener('click',()=>{E.sequence=reverseComplement(E.sequence);if(E.site){E.site={...E.site,strand:-E.site.strand};if(E.mode!=='typed')E.mode='range';}else E.mode='typed';$('edit-seq').value=E.sequence;drawEdit();});
 $('edit-seq').addEventListener('input',()=>{clearTimeout(editTimer);editTimer=setTimeout(()=>{const n=normalizeSequence($('edit-seq').value);if(n.error){$('edit-error').textContent=n.error;return;}$('edit-error').textContent='';if(n.sequence===E.sequence)return;E.sequence=n.sequence;E.mode='typed';const q=placePrimer({sequence:n.sequence},host.reference(),host.consensus(),{maxMismatch:P.options.maxMismatch,end3Exact:P.options.end3Exact,circular:host.circular()});E.site=q.site?{start:q.site.start,end:q.site.end,strand:q.site.strand}:null;drawEdit();},150);});
 $('edit-cancel').addEventListener('click',()=>editor.close());
 $('edit-pick').addEventListener('click',()=>{const p=byId(E.id);editor.close();P.editTarget=p.id;host.showTab('viewer');host.hoverText(`${p.name}: 정렬 화면에서 새 구간을 끌면 왼쪽에 바꾸기 버튼이 나옵니다.`);updateReplace();});
 $('edit-save').addEventListener('click',()=>{clearTimeout(editTimer);const p=byId(E.id);if(!p){editor.close();return;}const name=$('edit-name').value.trim(),set=$('edit-set').value.trim();
  if(!name){$('edit-error').textContent='이름을 입력하세요.';return;}if(P.list.some(x=>x.id!==p.id&&x.set===set&&x.name===name)){$('edit-error').textContent='같은 Set에 같은 이름이 있습니다.';return;}
  const n=normalizeSequence($('edit-seq').value);if(n.error){$('edit-error').textContent=n.error;return;}if(n.sequence!==E.sequence&&E.mode!=='typed'){E.sequence=n.sequence;E.mode='typed';}
  let next;if(E.mode==='range'){const f=siteFacts(n.sequence,E.site);next={...p,name,set,sequence:n.sequence,manual:true,locked:false,hits:[],site:{...E.site,mismatches:f.mismatches,unresolved:f.unresolved,source:'reference'}};}
  else if(E.mode==='typed')next={...p,name,set,sequence:n.sequence,manual:false,locked:false,hits:[],site:null};else next={...p,name,set};
  P.list=P.list.map(x=>x.id===p.id?next:x);editor.close();if(E.mode==='none'){refreshViewer();renderList();renderBinding();}else changed();$('primer-state').textContent=`${name}을 수정했습니다.`;});
 function updateReplace(){const b=$('selection-replace'),p=P.editTarget!==null?byId(P.editTarget):null,ok=!!p&&!!P.selection?.seq;b.hidden=!ok;if(ok)b.textContent=`${p.name}을 이 구간으로 바꾸기`;}
 $('selection-replace').addEventListener('click',()=>{const s=P.selection;if(!s?.seq)return;if(s.start<0||s.end-s.start!==s.seq.length){$('selection-state').textContent='insertion이나 deletion이 포함된 구간은 위치를 고정할 수 없습니다.';return;}if(s.end-s.start<MIN_PRIMER_LENGTH||s.end-s.start>MAX_PRIMER_LENGTH){$('selection-state').textContent=`길이는 ${MIN_PRIMER_LENGTH}–${MAX_PRIMER_LENGTH} nt입니다.`;return;}openEdit(P.editTarget,{start:s.start,end:s.end});});
 // Tm conditions
 for(const [k,v] of Object.entries(P.conditions)){const i=$('tm-'+k);i.value=v;i.addEventListener('input',()=>{P.conditions[k]=i.value;analyze();renderList();});}
 function exportText(kind){const ref=host.referenceInfo();if(kind==='genbank')return ['reference_annotated.gb','text/plain',referenceGenbank({reference:ref,primers:P.list})];if(kind==='gff')return ['primer_annotations.gff3','text/plain',primerGff3({referenceId:host.referenceId(),referenceLength:ref.sequence.length,primers:P.list,circular:host.circular()})];return ['primer_sets.csv','text/csv',primerCsv(P.list,exportOptions())];}
 function snapshot(){const b=P.binding;return {state:{list:P.list.map(({hits,...p})=>({...p,hits:(hits??[]).slice(0,20)})),nextId:P.nextId,options:P.options,conditions:P.conditions,includeReference:P.includeReference,placementMethod:PLACEMENT_METHOD,binding:b?{result:b.result,n:b.n,end3:b.end3,rule:b.rule,reference:!!b.reference,method:b.method??BINDING_METHOD,stale:P.stale}:null},cats:b?.cats??null,order:b?P.order:null};}
 function restore(saved,cats,order){P.includeReference=!!saved.includeReference;P.list=saved.list;P.nextId=saved.nextId;P.options={...P.options,...saved.options};P.conditions={...P.conditions,...saved.conditions};
  for(const [id,k] of [['opt-mismatch','maxMismatch'],['opt-end3-exact','end3Exact'],['opt-end3','end3'],['opt-rule-end3','ruleEnd3'],['opt-rule-mismatch','ruleMismatch']])$(id).value=P.options[k];for(const [k,v] of Object.entries(P.conditions))$('tm-'+k).value=v;
  $('primer-count').textContent=P.list.length?`(${P.list.length})`:'';P.binding=saved.binding&&cats?{...saved.binding,cats}:null;P.order=order;P.stale=saved.binding?.stale??true;P.restored=true;
  // Results and sites from an older rule set stay visible but are not presented as current.
  P.legacy=!!P.binding&&(saved.binding.method??1)<BINDING_METHOD;if(P.legacy)P.stale=true;P.relocate=(saved.placementMethod??1)<PLACEMENT_METHOD;}
 // Sites found under the old shape no longer hold, so chosen positions are searched again.
 function onTopology(){P.list=P.list.map(p=>p.manual&&p.site.end<=host.reference().length?p:{...p,locked:false,manual:false});changed({rerun:false});}
 return {handle,onRange,exportText,snapshot,restore,onTopology,edit:id=>openEdit(id),onData(){if(P.restored){P.restored=false;if(P.relocate){P.relocate=false;P.list=P.list.map(place);}refreshViewer();renderList();renderBinding();$('binding-state').textContent=P.binding?(P.legacy?'이전 버전 기준으로 계산한 결과입니다. 재분석이 필요합니다.':P.stale?'조건이 바뀌었습니다. 재분석이 필요합니다.':'저장된 결과입니다.'):'';$('binding-state').classList.toggle('stale',!!P.binding&&P.stale);return;}P.includeReference=host.referenceInList();P.binding=null;P.list=P.list.map(place);refreshViewer();renderList();},onConsensus(){if(P.list.some(p=>!p.manual&&p.site?.source!=='reference'))changed({rerun:false});},onFilter(){if(P.list.length){markStale();maybeAuto();}},onPrimerClick:focus,state:P,search,renderBinding};
}
