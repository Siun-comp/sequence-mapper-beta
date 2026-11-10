// SPDX-License-Identifier: GPL-2.0-or-later
// One sequence in wrapped lines with annotations and primers above it. Offers the calls the primer and find code make on the alignment viewer.
const MARGIN=66,RIGHT=16,LANE=17,BASE_H=18,TICK_H=16,GAP=14,TOP_PAD=6;
const COLOR={A:'#c2453f',C:'#2f6fb3',G:'#b8831f',T:'#2f8f5b'},OTHER='#7a6aa8';
const TYPE_COLOR={CDS:'#d9a441',gene:'#7a9cc6',promoter:'#6fb08b',terminator:'#c77d7d',rep_origin:'#a98cc9',primer_bind:'#6fae8a',misc_feature:'#9aa7b4',regulatory:'#6fb08b'};
const FONT='13px "Cascadia Mono",Consolas,"Liberation Mono","Courier New",monospace',UI='11px "Segoe UI","Malgun Gothic",sans-serif',COMPLEMENT={65:84,67:71,71:67,84:65};
const pieces=(start,end,L)=>end>L?[{start,end:L},{start:0,end:end-L}]:[{start,end}];

export class SequenceView{
 constructor(host,{onHover,onRange,onPrimer}={}){
  Object.assign(this,{onHover,onRange,onPrimer});this.scroller=host.querySelector('.viewer-scroll');this.spacer=host.querySelector('.viewer-spacer');this.canvas=host.querySelector('canvas');this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.sequence=null;this.primers=[];this.annotations=[];this.lines=[];this.range=null;this.mark=-1;this.found=null;this.activePrimer=null;this.showComplement=false;this.queued=false;this.drag=null;this.per=60;this.lastFrameMs=0;
  this.ctx.font=FONT;this.cw=Math.ceil(this.ctx.measureText('A').width)+2;
  this.scroller.addEventListener('scroll',()=>this.request(),{passive:true});new ResizeObserver(()=>this.resize()).observe(this.scroller);
  this.canvas.addEventListener('mousemove',e=>this.move(e));this.canvas.addEventListener('mouseleave',()=>this.onHover?.(null));this.canvas.addEventListener('mousedown',e=>this.down(e));this.canvas.addEventListener('dblclick',()=>{const q=this.lastPrimer;if(q&&performance.now()-q.t<800)this.onPrimerEdit?.(q.id);});addEventListener('mouseup',()=>this.up());this.resize();
 }
 get length(){return this.sequence?.length??0;}
 setData(sequence){this.sequence=sequence;this.range=null;this.mark=-1;this.found=null;this.layout();}
 setAnnotations(list){this.annotations=list;this.layout();}
 setPrimers(list){this.primers=list;this.layout();}
 setComplement(on){this.showComplement=on;this.layout();}
 setActivePrimer(id){this.activePrimer=id;this.request();}
 setFound(f){this.found=f;this.request();}
 setFoundIndex(i){if(this.found)this.found.index=i;this.request();}
 setMark(pos){this.mark=pos;this.request();}
 setSelected(){}
 scrollToRow(){}
 clearRange(){this.range=null;this.request();}
 // Called right after the tab opens, before the resize observer has run.
 scrollToColumn(col){if(this.scroller.clientWidth!==this.width)this.resize();const n=this.lineOf(Math.floor(col)%Math.max(this.length,1)),l=this.lines[n];if(l)this.scroller.scrollTop=Math.max(0,l.y-this.height/3);}
 lineOf(pos){return Math.floor(pos/this.per);}
 resize(){const d=devicePixelRatio||1,w=this.scroller.clientWidth,h=this.scroller.clientHeight;this.width=w;this.height=h;this.canvas.width=w*d;this.canvas.height=h*d;this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';this.dpr=d;this.layout();}
 request(){if(this.queued)return;this.queued=true;requestAnimationFrame(()=>{this.queued=false;const t=performance.now();this.draw();this.lastFrameMs=performance.now()-t;});}
 // Lines keep their own lanes, so a busy line grows and a plain one stays short. Primers sit next to the bases.
 layout(){
  const L=this.length;if(!L||!this.width){this.lines=[];this.request();return;}
  this.per=Math.max(10,Math.floor((this.width-MARGIN-RIGHT)/this.cw/10)*10);const per=this.per,count=Math.ceil(L/per),buckets=Array.from({length:count},()=>[]);
  const add=(item,spans)=>{const first=spans[0],last=spans.at(-1);for(const r of spans)for(let n=this.lineOf(r.start);n<=this.lineOf(r.end-1);n++){const s=Math.max(r.start,n*per),e=Math.min(r.end,(n+1)*per);buckets[n].push({item,s,e,range:r,head:item.strand>0?r===last&&e===r.end:item.strand<0?r===first&&s===r.start:false});}};
  for(const p of this.primers)if(p.visible)add({kind:'primer',strand:p.strand,id:p.id,label:p.name,color:p.mismatches?'#8a9a3a':'#3f9a63',start:p.start,end:p.end,mismatches:p.mismatches},pieces(p.start,p.end,L));
  for(const f of this.annotations)add({kind:'annotation',strand:f.strand,id:f.id,label:f.label,type:f.type,color:TYPE_COLOR[f.type]??'#a7b4c1',ranges:f.ranges},[...f.ranges].sort((a,b)=>a.start-b.start));
  let y=TOP_PAD;this.lines=buckets.map((list,n)=>{
   const ends=[];list.sort((a,b)=>(a.item.kind==='primer'?0:1)-(b.item.kind==='primer'?0:1)||a.s-b.s||b.e-a.e);
   for(const p of list){let lane=ends.findIndex(e=>e<=p.s);if(lane<0)lane=ends.length;ends[lane]=p.e;p.lane=lane;}
   const lanes=ends.length,h=lanes*LANE+BASE_H+(this.showComplement?BASE_H:0)+TICK_H+GAP,line={start:n*per,end:Math.min(L,(n+1)*per),y,lanes,list,h};y+=h;return line;});
  this.total=y;this.spacer.style.height=y+'px';this.request();
 }
 x(pos,line){return MARGIN+(pos-line.start)*this.cw;}
 baseY(line){return line.y+line.lanes*LANE;}
 firstVisible(top){let lo=0,hi=this.lines.length-1;while(lo<hi){const m=(lo+hi)>>1;if(this.lines[m].y+this.lines[m].h<=top)lo=m+1;else hi=m;}return lo;}
 draw(){
  const x=this.ctx,w=this.width,h=this.height;x.setTransform(this.dpr,0,0,this.dpr,0,0);x.fillStyle='#fff';x.fillRect(0,0,w,h);if(!this.lines.length)return;
  const top=this.scroller.scrollTop;x.save();x.translate(0,-top);
  for(let n=this.firstVisible(top);n<this.lines.length;n++){const l=this.lines[n];if(l.y>top+h)break;this.drawLine(x,l);}
  x.restore();
 }
 drawLine(x,l){
  const seq=this.sequence,cw=this.cw,by=this.baseY(l);
  for(const p of l.list)this.drawPiece(x,l,p);
  this.highlights(x,l,by);
  x.font=FONT;x.textAlign='center';x.textBaseline='middle';
  for(let i=l.start;i<l.end;i++){const v=seq[i],c=String.fromCharCode(v),cx=this.x(i,l)+cw/2;x.fillStyle=COLOR[c]??OTHER;x.fillText(c,cx,by+BASE_H/2);if(this.showComplement){const q=COMPLEMENT[v];x.fillStyle='#8d99a5';x.fillText(q?String.fromCharCode(q):c,cx,by+BASE_H*1.5);}}
  const ty=by+BASE_H*(this.showComplement?2:1);x.strokeStyle='#c4cfd9';x.lineWidth=1;x.beginPath();x.moveTo(MARGIN,ty+.5);x.lineTo(this.x(l.end,l),ty+.5);x.stroke();
  x.font=UI;x.fillStyle='#59697b';x.textBaseline='top';
  for(let i=l.start;i<l.end;i++){const pos=i+1;if(pos%10===0||i===l.start){const px=this.x(i,l)+cw/2;x.fillRect(px,ty,1,3);x.textAlign='center';if(pos%10===0)x.fillText(pos.toLocaleString(),px,ty+3);}}
  x.textAlign='right';x.textBaseline='middle';x.fillStyle='#8d99a5';x.fillText((l.start+1).toLocaleString(),MARGIN-8,by+BASE_H/2);
 }
 drawPiece(x,l,p){
  const a=this.x(p.s,l),b=this.x(p.e,l),y=l.y+(l.lanes-1-p.lane)*LANE+1,hh=LANE-3,mid=y+hh/2,it=p.item,head=p.head?Math.min(7,(b-a)/2):0;
  x.beginPath();if(it.strand>=0){x.moveTo(a,y);x.lineTo(b-head,y);x.lineTo(b,mid);x.lineTo(b-head,y+hh);x.lineTo(a,y+hh);}else{x.moveTo(b,y);x.lineTo(a+head,y);x.lineTo(a,mid);x.lineTo(a+head,y+hh);x.lineTo(b,y+hh);}x.closePath();x.fillStyle=it.color;x.fill();
  if(it.kind==='primer'&&it.id===this.activePrimer){x.strokeStyle='#1d3b2a';x.lineWidth=1.5;x.stroke();}
  x.font=UI;x.textAlign='left';x.textBaseline='middle';const room=b-a-head-8;if(room>12){const t=this.fit(x,it.label,room);x.fillStyle=it.kind==='primer'?'#fff':'#1f2d3a';x.fillText(t,a+(it.strand<0?head+4:4),mid+.5);}
 }
 fit(x,s,max){if(x.measureText(s).width<=max)return s;let lo=0,hi=s.length;while(lo<hi){const m=(lo+hi+1)>>1;if(x.measureText(s.slice(0,m)+'…').width<=max)lo=m;else hi=m-1;}return lo?s.slice(0,lo)+'…':'';}
 box(x,l,start,end,y,fill,stroke,width=1){const s=Math.max(start,l.start),e=Math.min(end,l.end);if(s>=e)return;const a=this.x(s,l),wd=(e-s)*this.cw;if(fill){x.fillStyle=fill;x.fillRect(a,y,wd,BASE_H);}if(stroke){x.strokeStyle=stroke;x.lineWidth=width;x.strokeRect(a+.5,y+.5,wd-1,BASE_H-1);}}
 highlights(x,l,by){
  const L=this.length;
  if(this.range)this.box(x,l,this.range.c0,this.range.c1,by,'rgba(52,78,107,.2)');
  const f=this.found;if(f&&f.scope!=='names')for(let k=0;k<f.count;k++){const o=k*5,now=k===f.index;for(const r of pieces(f.data[o+1],f.data[o+2],L))this.box(x,l,r.start,r.end,by,now?'rgba(255,190,0,.42)':null,now?'#a34b00':'#d98a00',now?2:1);}
  if(this.mark>=l.start&&this.mark<l.end)this.box(x,l,this.mark,this.mark+1,by,null,'#23364d',1.5);
 }
 locate(e){
  const b=this.canvas.getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top+this.scroller.scrollTop;if(!this.lines.length)return null;const l=this.lines[this.firstVisible(py)];if(py<l.y||py>l.y+l.h)return {l,pos:-1,piece:null};
  const pos=Math.min(l.end-1,Math.max(l.start,l.start+Math.floor((px-MARGIN)/this.cw))),inside=px>=MARGIN&&px<this.x(l.end,l),by=this.baseY(l);let piece=null;
  if(py<by&&inside){const lane=l.lanes-1-Math.floor((py-l.y)/LANE);piece=l.list.find(p=>p.lane===lane&&pos>=p.s&&pos<p.e)??null;}
  return {l,pos:inside?pos:-1,piece,onBases:py>=by&&py<by+BASE_H*(this.showComplement?2:1)};
 }
 hoverText(p){if(!p||p.pos<0)return null;const seq=this.sequence,parts=[`위치 ${(p.pos+1).toLocaleString()} · ${String.fromCharCode(seq[p.pos])}`];if(p.piece){const it=p.piece.item;parts.push(`${it.kind==='primer'?'Primer':it.type} ${it.label}`);}return parts.join(' · ');}
 move(e){const p=this.locate(e);if(this.drag&&p?.pos>=0){this.extend(p.pos);return;}this.canvas.style.cursor=p?.piece?'pointer':p?.onBases?'text':'';this.onHover?.(this.hoverText(p));}
 down(e){
  if(e.button)return;const p=this.locate(e);if(!p||p.pos<0)return;
  if(p.piece){const it=p.piece.item;if(it.kind==='primer'){this.lastPrimer={id:it.id,t:performance.now()};this.onPrimer?.(it.id);}else{const r=p.piece.range;this.range={c0:r.start,c1:r.end,source:'reference',row:-1};this.request();this.onRange?.(this.range);}return;}
  if(!p.onBases)return;e.preventDefault();this.drag={start:p.pos,moved:false};this.scroller.focus({preventScroll:true});
 }
 extend(pos){const d=this.drag;if(pos!==d.start)d.moved=true;if(!d.moved)return;this.range={c0:Math.min(d.start,pos),c1:Math.max(d.start,pos)+1,source:'reference',row:-1};this.request();this.onRange?.(this.range);}
 up(){this.drag=null;}
}
