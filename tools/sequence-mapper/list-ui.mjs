// SPDX-License-Identifier: GPL-2.0-or-later
// Sequence list shown before mapping. Only the rows on screen exist in the page, however many records there are.
import {REASON_LABEL,applyConditions,sortedIds,visibleIds,selectedIds,lengthSummary,lengthHistogram,basesOf,lengthOf,notMappable} from './core/list.mjs';
import {FLAG,displayName} from './core/parse.mjs';
import {formatBases,LIMITS} from './core/limits.mjs';
const $=id=>document.getElementById(id),dec=new TextDecoder(),ROW=27,POOL=22,PREVIEW=300;

export function setupList(host){
 let L=null,data=null,reasons=null,manual=null,reference=-1,fileReference=null,sorted=null,view=null,sortKey='input',ascending=true,timer=0,chosen=new Uint32Array(0);
 const body=$('list-rows'),scroller=$('list-scroll'),spacer=$('list-spacer'),rows=[];
 function buildRows(){if(rows.length)return;for(let k=0;k<POOL;k++){const row=document.createElement('div'),check=document.createElement('input'),no=document.createElement('span'),name=document.createElement('button'),len=document.createElement('span'),amb=document.createElement('span'),status=document.createElement('span'),actions=document.createElement('span'),pick=document.createElement('button'),view=document.createElement('button');
  row.className='list-row';check.type='checkbox';name.type=pick.type=view.type='button';name.className='list-name';no.className=len.className=amb.className='num';status.className='list-status';pick.className='list-pick';pick.textContent='기준';view.className='list-view';view.textContent='보기';actions.className='list-actions';actions.append(pick,view);row.append(check,no,name,len,amb,status,actions);body.append(row);rows.push({row,check,no,name,len,amb,status,pick,view});}}
 const number=id=>{const v=$(id).value;return v===''?null:Number(v);};
 const conditions=()=>({name:$('list-name').value,min:number('list-min'),max:number('list-max'),maxAmbiguous:number('list-ambiguous'),firstOnly:$('list-first').checked});
 function statusOf(i){
  if(i===reference)return ['Reference','is-ref'];
  if(L.flags[i]&FLAG.INVALID)return ['지원하지 않는 문자','bad'];if(L.flags[i]&FLAG.EMPTY)return ['빈 서열','bad'];
  if(reasons[i]){const t=Object.entries(REASON_LABEL).filter(([b])=>reasons[i]&b).map(x=>x[1]).join(', ');return ['조건 제외: '+t,'off'];}
  if(manual[i])return ['직접 제외','off'];return [L.duplicate[i]?'같은 accession':'','warn'];
 }
 function drawRows(){
  if(!L)return;const first=Math.floor(scroller.scrollTop/ROW);body.style.transform=`translateY(${first*ROW}px)`;
  rows.forEach((r,k)=>{const n=first+k,i=view[n];r.row.hidden=n>=view.length;if(n>=view.length)return;const [text,cls]=statusOf(i),off=!!reasons[i]||!!manual[i]||i===reference;
   r.row.dataset.id=i;r.row.className='list-row'+(off?' is-off':'')+(i===reference?' is-ref':'');r.check.checked=!manual[i]&&!reasons[i]&&i!==reference;r.check.disabled=!!reasons[i]||i===reference;r.check.setAttribute('aria-label',`${L.names[i].slice(0,60)} 포함`);
   r.no.textContent=(i+1).toLocaleString();r.name.textContent=displayName(L.names[i]);r.name.title=L.names[i];r.len.textContent=lengthOf(L,i).toLocaleString();r.amb.textContent=L.ambiguous[i]?L.ambiguous[i].toLocaleString():'';r.status.textContent=text;r.status.className='list-status '+cls;r.pick.hidden=!!fileReference;r.pick.disabled=notMappable(L,i)||i===reference;r.view.disabled=notMappable(L,i)||lengthOf(L,i)>LIMITS.maxSingleLength;r.view.title=r.view.disabled?'이 서열은 단일 서열 화면으로 볼 수 없습니다.':'이 서열만 열어 primer 위치를 봅니다.';});
 }
 function drawHistogram(){
  const c=$('list-histogram'),d=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;if(!w)return;c.width=w*d;c.height=h*d;const x=c.getContext('2d'),s=lengthHistogram(L,chosen);x.scale(d,d);const bars=s.all.length,bw=w/bars;let top=1;for(const v of s.all)if(v>top)top=v;
  const height=v=>v?Math.max(1.5,Math.sqrt(v/top)*(h-1)):0;
  for(let k=0;k<bars;k++){x.fillStyle='#d3dce5';const a=height(s.all[k]);x.fillRect(k*bw,h-a,Math.max(bw-1,1),a);x.fillStyle='#4f7ea6';const b=height(s.kept[k]);x.fillRect(k*bw,h-b,Math.max(bw-1,1),b);}
  $('list-range').textContent=s.max?`${s.min.toLocaleString()} – ${s.max.toLocaleString()} nt`:'';
 }
 function drawCounts(){
  const s=lengthSummary(L,chosen),b=basesOf(L,chosen),out=L.names.length-chosen.length-(reference>=0?1:0);
  $('list-counts').textContent=`전체 ${L.names.length.toLocaleString()} · 매핑 ${chosen.length.toLocaleString()} · 제외 ${out.toLocaleString()} · ${formatBases(b.total)}`+(s?` · 길이 최소 ${s.min.toLocaleString()} / 중앙 ${Math.round(s.median).toLocaleString()} / 최대 ${s.max.toLocaleString()}`:'');
  const ref=fileReference??(reference>=0?{name:L.names[reference],length:lengthOf(L,reference)}:null),t=$('list-reference');
  t.textContent=ref?`Reference: ${displayName(ref.name).slice(0,120)} · ${(ref.length??ref.sequence.length).toLocaleString()} nt`+(fileReference?' (Reference 파일)':''):'Reference를 정하세요. 표의 기준 버튼을 누르면 됩니다.';t.classList.toggle('alert',!ref);
 }
 function selection(){chosen=selectedIds(reasons,manual,reference);drawCounts();drawHistogram();host.changed();}
 function refresh(){if(!L)return;applyConditions(L,conditions(),reasons);view=visibleIds(sorted,reasons,$('list-hidden').checked);spacer.style.height=view.length*ROW+'px';$('list-empty').hidden=view.length>0;if(scroller.scrollTop>view.length*ROW)scroller.scrollTop=0;drawRows();selection();}
 function sortBy(key){if(sortKey===key)ascending=!ascending;else{sortKey=key;ascending=key!=='ambiguous';}sorted=sortedIds(L,key,ascending);document.querySelectorAll('[data-sort]').forEach(b=>{const on=b.dataset.sort===key;b.classList.toggle('is-on',on);b.closest('[role=columnheader]')?.setAttribute('aria-sort',on?(ascending?'ascending':'descending'):'none');});refresh();}
 scroller.addEventListener('scroll',()=>requestAnimationFrame(drawRows),{passive:true});
 body.addEventListener('click',e=>{const row=e.target.closest('.list-row');if(!row)return;const i=Number(row.dataset.id);
  if(e.target.matches('input')){manual[i]=e.target.checked?0:1;drawRows();selection();}
  else if(e.target.matches('.list-pick')){reference=i;drawRows();selection();}
  else if(e.target.matches('.list-view'))host.view(i);
  else if(e.target.matches('.list-name')){const s=L.offs[i],len=lengthOf(L,i);$('list-preview').textContent=`${L.names[i].slice(0,120)}\n${dec.decode(L.pool.subarray(s,s+Math.min(len,PREVIEW)))}${len>PREVIEW?` … (${len.toLocaleString()} nt)`:''}`;$('list-preview').hidden=false;}});
 for(const id of ['list-name','list-min','list-max','list-ambiguous'])$(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(refresh,150);});
 for(const id of ['list-first','list-hidden'])$(id).addEventListener('change',refresh);
 document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>sortBy(b.dataset.sort)));
 const setShown=v=>{for(const i of view)if(!reasons[i])manual[i]=v;drawRows();selection();};
 $('list-all').addEventListener('click',()=>setShown(0));$('list-none').addEventListener('click',()=>setShown(1));
 addEventListener('resize',()=>{if(L)drawHistogram();});
 return {
  open(r){
   buildRows();data=r.data;L={names:data.names,offs:data.offs,flags:data.flags,pool:data.pool,...r.facts};const n=L.names.length;reasons=new Uint8Array(n);manual=new Uint8Array(n);reference=-1;fileReference=r.reference;sortKey='input';ascending=true;sorted=sortedIds(L);
   for(const id of ['list-name','list-min','list-max','list-ambiguous'])$(id).value='';$('list-first').checked=false;$('list-hidden').checked=false;$('list-preview').hidden=true;scroller.scrollTop=0;
   document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('is-on',b.dataset.sort==='input'));refresh();},
  close(){L=data=reasons=manual=sorted=view=null;chosen=new Uint32Array(0);rows.length=0;body.replaceChildren();},
  selected:()=>chosen,
  bases:()=>basesOf(L,chosen),
  // Length and bytes of the yardstick, without its annotation, for the support check.
  referenceBytes(){if(fileReference)return fileReference.sequence;return reference>=0?data.pool.subarray(data.offs[reference],data.offs[reference+1]):null;},
  fromList:()=>reference>=0&&!fileReference,
  record:()=>reference,
  // Dropped from the mapping by choice; the reference row is not counted as dropped.
  excluded:()=>L.names.length-chosen.length-(reference>=0?1:0),
 };
}
