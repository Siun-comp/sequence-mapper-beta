// SPDX-License-Identifier: GPL-2.0-or-later
// Canvas alignment viewer. Only the visible rows and columns are drawn, whatever the record count.
import {projectRow,GAP,coversBase} from '../core/alignment.mjs';
import {displayName} from '../core/parse.mjs';
export const ZOOMS=Object.freeze([14,10,7,5,4,3.5,2,1,.5,.35]);
// Letters fit down to 4 px per base. Below that each base is still its own coloured cell, until bases share pixels.
const GLYPH_MIN=4,PAINT_MIN=3,WHEEL_STEP=40;
const DEFAULT_NAME_W=260,MIN_NAME_W=120,MAX_NAME_W=640,ROW=16,LANE=18,MAX_LANES=8,H={overview:20,ruler:24,consensus:16,coverage:36,identity:14,reference:16};
const BASE_TOP=H.overview+H.ruler+H.consensus+H.coverage+H.identity+H.reference;
const COLOR={A:'#c2453f',C:'#2f6fb3',G:'#b8831f',T:'#2f8f5b',other:'#7a6aa8',gap:'#59697b'};
const TINT={A:'#efc9c6',C:'#c6d9ec',G:'#ecdcb9',T:'#c3e3d1'};
const baseColor=c=>COLOR[String.fromCharCode(c)]??COLOR.other,baseTint=c=>TINT[String.fromCharCode(c)]??'#d8d2e6';
const FONT='"Cascadia Mono",Consolas,"Liberation Mono","Courier New",monospace',UI='"Segoe UI","Malgun Gothic",sans-serif';
export class Viewer{
 constructor(host,{onHover,onSelect,onRange,onPrimer,onZoom}={}){
  Object.assign(this,{onHover,onSelect,onRange,onPrimer,onZoom,host});this.wheelSum=0;this.scroller=host.querySelector('.viewer-scroll');this.spacer=host.querySelector('.viewer-spacer');this.canvas=host.querySelector('canvas');this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.nameW=DEFAULT_NAME_W;this.cell=ZOOMS[0];this.mode='all';this.nameMode='both';this.compare='reference';this.selected=-1;this.mark=-1;this.data=null;this.queued=false;this.lastFrameMs=0;this.primers=[];this.lanes=0;this.top=BASE_TOP;this.range=null;this.drag=null;this.pointer=null;this.activePrimer=null;this.found=null;this.consLabel='Consensus';
  this.scroller.addEventListener('scroll',()=>this.request(),{passive:true});this.scroller.addEventListener('wheel',e=>this.wheel(e),{passive:false});
  new ResizeObserver(()=>this.resize()).observe(this.scroller);
  this.canvas.addEventListener('mousemove',e=>this.move(e));this.canvas.addEventListener('mouseleave',()=>this.onHover?.(null));this.canvas.addEventListener('mousedown',e=>this.down(e));this.canvas.addEventListener('dblclick',()=>{const q=this.lastPrimer;if(q&&performance.now()-q.t<800)this.onPrimerEdit?.(q.id);});addEventListener('mouseup',e=>this.up(e));addEventListener('mousemove',e=>{if(this.drag&&!this.drag.resize){this.pointer=e;this.follow();}});
  this.scroller.addEventListener('keydown',e=>this.key(e));this.resize();
 }
 setData(d){this.data=d;this.buf=new Uint8Array(d.cols.total+1);this.refRow=new Uint8Array(d.cols.total);this.consRow=new Uint8Array(d.cols.total);
  for(let r=0;r<d.ref.length;r++){this.refRow[d.cols.colOf[r]]=d.ref[r];this.consRow[d.cols.colOf[r]]=d.stats.consensus[r];}
  this.layoutPrimers();this.updateSize();this.request();}
 setConsensus(values,label){for(let r=0;r<values.length;r++)this.consRow[this.data.cols.colOf[r]]=values[r];this.consLabel=label;this.request();}
 setPrimers(list){this.primers=list;this.layoutPrimers();this.updateSize();this.request();}
 setActivePrimer(id){this.activePrimer=id;this.request();}
 setFound(f){this.found=f;this.request();}
 setFoundIndex(i){if(this.found)this.found.index=i;this.request();}
 setZoom(index){const col=this.centerColumn();this.cell=ZOOMS[index];this.layoutPrimers();this.updateSize();this.scrollToColumn(col,true);this.request();}
 // Ctrl+wheel and trackpad pinch. A mouse notch is one step; a pinch sends small deltas, so they add up first.
 wheel(e){if(!e.ctrlKey||!this.data)return;e.preventDefault();const dy=e.deltaMode===1?e.deltaY*40:e.deltaMode===2?e.deltaY*400:e.deltaY;if(dy*this.wheelSum<0)this.wheelSum=0;this.wheelSum+=dy;if(Math.abs(this.wheelSum)<WHEEL_STEP)return;const from=ZOOMS.indexOf(this.cell),to=Math.max(0,Math.min(ZOOMS.length-1,from+Math.sign(this.wheelSum)));this.wheelSum=0;if(to===from)return;const px=e.clientX-this.scroller.getBoundingClientRect().left,at=px>this.nameW?px-this.nameW:(this.width-this.nameW)/2,col=(this.scroller.scrollLeft+at)/this.cell;this.cell=ZOOMS[to];this.layoutPrimers();this.updateSize();this.scroller.scrollLeft=Math.max(0,col*this.cell-at);this.request();this.onZoom?.(to);}
 setMode(m){this.mode=m;this.request();}
 setNameMode(m){this.nameMode=m;this.request();}
 setCompare(c){this.compare=c;this.request();}
 setSelected(viewRow){this.selected=viewRow;this.request();}
 setMark(col){this.mark=col;this.request();}
 setNameWidth(w){this.nameW=Math.max(MIN_NAME_W,Math.min(MAX_NAME_W,Math.round(w)));this.updateSize();this.request();}
 clearRange(){this.range=null;this.request();}
 centerColumn(){return this.cell?(this.scroller.scrollLeft+(this.width-this.nameW)/2)/this.cell:0;}
 updateSize(){if(!this.data)return;this.scroller.style.scrollPaddingLeft=this.nameW+'px';this.spacer.style.width=this.nameW+this.data.cols.total*this.cell+'px';this.spacer.style.height=this.top+this.data.order.length*ROW+'px';}
 resize(){const d=devicePixelRatio||1,w=this.scroller.clientWidth,h=this.scroller.clientHeight;this.width=w;this.height=h;this.canvas.width=w*d;this.canvas.height=h*d;this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';this.dpr=d;this.atlas=null;this.request();}
 scrollToColumn(col,center=true){const w=this.width-this.nameW;this.scroller.scrollLeft=Math.max(0,col*this.cell-(center?w/2:0));}
 scrollToRow(row){this.scroller.scrollTop=Math.max(0,row*ROW-(this.height-this.top)/2);}
 request(){if(this.queued)return;this.queued=true;requestAnimationFrame(()=>{this.queued=false;const t=performance.now();this.draw();this.lastFrameMs=performance.now()-t;});}
 // Overlapping arrows go to separate lanes; a lane also keeps room for the name.
 layoutPrimers(){
  const d=this.data;if(!d){this.lanes=0;this.top=BASE_TOP;return;}
  const x=this.ctx;x.font=`11px ${UI}`;const ends=[],shown=this.primers.filter(p=>p.visible).map(p=>({...p,c0:d.cols.colOf[p.start],c1:d.cols.colOf[p.end-1]+1})).sort((a,b)=>a.c0-b.c0||a.c1-b.c1);
  for(const p of shown){const room=Math.max(p.c1,p.c0+(x.measureText(p.name).width+14)/this.cell);let lane=ends.findIndex(e=>e<=p.c0);if(lane<0)lane=ends.length<MAX_LANES?ends.length:MAX_LANES-1;ends[lane]=room;p.lane=lane;}
  this.shown=shown;this.lanes=ends.length;this.top=BASE_TOP+this.lanes*LANE;
 }
 glyphs(){
  if(this.atlas&&this.atlasCell===this.cell)return this.atlas;
  const d=this.dpr,cw=Math.ceil(this.cell*d),rh=ROW*d,codes=[...'ACGTRYSWKMBDHVN-'],c=new OffscreenCanvas(cw*codes.length,rh*2),x=c.getContext('2d');
  const small=this.cell<9;x.font=`${Math.round((this.cell>=10?11.5:Math.max(6,this.cell*1.4))*d)}px ${FONT}`;x.textAlign='center';x.textBaseline='middle';
  codes.forEach((ch,i)=>{const cx=i*cw+cw/2,cy=rh/2+d*.5;x.fillStyle=small&&ch!=='-'?baseColor(ch.charCodeAt(0)):'#6d7d8c';x.fillText(ch,cx,cy);x.fillStyle=ch==='-'?'#aeb9c4':baseColor(ch.charCodeAt(0));x.fillRect(i*cw,rh,cw,rh);x.fillStyle=ch==='-'?'#23364d':'#fff';x.fillText(ch,cx,rh+cy);});
  this.atlas=c;this.atlasCell=this.cell;this.atlasIndex=new Int16Array(256).fill(-1);codes.forEach((ch,i)=>{this.atlasIndex[ch.charCodeAt(0)]=i;});return c;
 }
 draw(){
  const x=this.ctx,w=this.width,h=this.height,d=this.data,TOP=this.top;x.setTransform(this.dpr,0,0,this.dpr,0,0);x.fillStyle='#fff';x.fillRect(0,0,w,h);if(!d)return;
  const cell=this.cell,c0=Math.max(0,Math.floor(this.scroller.scrollLeft/cell)),c1=Math.min(d.cols.total,c0+Math.ceil((w-this.nameW)/cell)+2),off=-(this.scroller.scrollLeft-c0*cell),r0=Math.floor(this.scroller.scrollTop/ROW),yoff=-(this.scroller.scrollTop-r0*ROW),rows=Math.ceil((h-TOP)/ROW)+1;
  this.view={c0,c1,off,r0,yoff};
  x.save();x.beginPath();x.rect(this.nameW,TOP,w-this.nameW,h-TOP);x.clip();
  this.insertionBands(x,c0,c1,off,TOP,h-TOP);
  const cmp=this.compare==='consensus'?this.consRow:this.refRow;
  for(let v=0;v<rows;v++){const n=r0+v;if(n>=d.order.length)break;const y=TOP+v*ROW+yoff,i=d.order[n];
   if(n===this.selected){x.fillStyle='#fdf3d0';x.fillRect(this.nameW,y,w-this.nameW,ROW);}else if(n&1){x.fillStyle='#fafbfd';x.fillRect(this.nameW,y,w-this.nameW,ROW);}
   projectRow(d.S,i,d.cols,this.buf,c0,c1);this.rowCells(x,this.buf,c0,c1,off,y,cmp);}
  this.foundRows(x,r0,rows,yoff,c0,c1,off);this.rangeRows(x,r0,rows,yoff,c0,off);
  x.restore();
  x.fillStyle='#f8fafc';x.fillRect(0,0,w,TOP);x.fillStyle='#fff';x.fillRect(0,TOP,this.nameW,h-TOP);
  this.names(x,r0,rows,yoff);this.tracks(x,c0,c1,off);
  x.save();x.beginPath();x.rect(this.nameW,H.overview,w-this.nameW,h-H.overview);x.clip();
  const band=(a,b,fill,stroke)=>{const px=this.nameW+off+(a-c0)*cell,wd=Math.max((b-a)*cell,2);if(fill){x.fillStyle=fill;x.fillRect(px,H.overview,wd,h-H.overview);}if(stroke){x.strokeStyle=stroke;x.lineWidth=1;x.strokeRect(px-.5,H.overview,wd+1,h-H.overview);}};
  const ap=this.shown?.find(p=>p.id===this.activePrimer);if(ap)band(ap.c0,ap.c1,'rgba(63,154,99,.13)');
  this.rangeTracks(x,c0,off);
  if(this.mark>=c0&&this.mark<c1)band(this.mark,this.mark+1,null,'#23364d');
  this.foundTrack(x,c0,c1,off,band);
  x.restore();
  x.fillStyle=this.drag?.resize?'#344e6b':'#d3dce5';x.fillRect(this.nameW-1,0,2,h);x.strokeStyle='#d3dce5';x.lineWidth=1;x.beginPath();x.moveTo(this.nameW+.5,0);x.lineTo(this.nameW+.5,h);x.moveTo(0,TOP-.5);x.lineTo(w,TOP-.5);x.stroke();
 }
 // Hits are flat [row,c0,c1,strand,mismatches]; rows ascend, so only the visible rows are touched.
 rangeBox(x,c0,off,y,hh){const r=this.range,px=this.nameW+off+(r.c0-c0)*this.cell,wd=Math.max((r.c1-r.c0)*this.cell,2);x.fillStyle='rgba(52,78,107,.2)';x.fillRect(px,y,wd,hh);x.strokeStyle='#344e6b';x.lineWidth=1;x.strokeRect(px-.5,y-.5,wd+1,hh+1);}
 rangeRows(x,r0,rows,yoff,c0,off){const r=this.range;if(!r||r.to<0)return;const a=Math.max(r.from,r0),b=Math.min(r.to,r0+rows-1);if(a<=b)this.rangeBox(x,c0,off,this.top+(a-r0)*ROW+yoff,(b-a+1)*ROW);}
 rangeTracks(x,c0,off){const r=this.range;if(!r)return;const cons=H.overview+H.ruler+this.lanes*LANE;if(r.from<=-2)this.rangeBox(x,c0,off,cons,H.consensus);if(r.from<=-1&&r.to>=-1)this.rangeBox(x,c0,off,cons+H.consensus+H.coverage+H.identity,H.reference);}
 foundBox(x,a,b,c0,off,y,hh,current){const px=this.nameW+off+(a-c0)*this.cell,wd=Math.max((b-a)*this.cell,2);if(current){x.fillStyle='rgba(255,190,0,.38)';x.fillRect(px,y,wd,hh);}x.strokeStyle=current?'#a34b00':'#d98a00';x.lineWidth=current?2:1;x.strokeRect(px+.5,y+.5,wd-1,hh-1);}
 foundRows(x,r0,rows,yoff,c0,c1,off){
  const f=this.found;if(!f)return;const d=f.data;let lo=0,hi=f.count;while(lo<hi){const m=(lo+hi)>>1;if(d[m*5]<r0)lo=m+1;else hi=m;}
  for(let k=lo;k<f.count;k++){const o=k*5,row=d[o];if(row>=r0+rows)break;if(row<0||d[o+1]<0||d[o+2]<=c0||d[o+1]>=c1)continue;this.foundBox(x,d[o+1],d[o+2],c0,off,this.top+(row-r0)*ROW+yoff,ROW,k===f.index);}
 }
 foundTrack(x,c0,c1,off,band){
  const f=this.found;if(!f||f.scope==='rows'||f.scope==='names')return;const d=f.data,y=H.overview+H.ruler+this.lanes*LANE+(f.scope==='consensus'?0:H.consensus+H.coverage+H.identity),hh=f.scope==='consensus'?H.consensus:H.reference;
  for(let k=0;k<f.count;k++){const o=k*5;if(d[o+2]<=c0||d[o+1]>=c1)continue;if(k===f.index)band(d[o+1],d[o+2],'rgba(255,190,0,.14)');this.foundBox(x,d[o+1],d[o+2],c0,off,y,hh,k===f.index);}
 }
 insertionBands(x,c0,c1,off,y,hh){const {refOfCol}=this.data.cols,cell=this.cell;x.fillStyle='#fff6da';for(let c=c0;c<c1;c++)if(refOfCol[c]<0)x.fillRect(this.nameW+off+(c-c0)*cell,y,Math.max(cell,1),hh);}
 rowCells(x,b,c0,c1,off,y,cmp){
  const cell=this.cell,n=c1-c0,loose=this.compare==='consensus';
  if(cell>=GLYPH_MIN){const a=this.glyphs(),d=this.dpr,cw=Math.ceil(cell*d),rh=ROW*d,idx=this.atlasIndex,dots=this.mode==='diff';
   for(let k=0;k<n;k++){const v=b[k];if(!v)continue;const same=v===cmp[c0+k]||(v===GAP&&!cmp[c0+k])||(loose&&coversBase(cmp[c0+k],v)),px=this.nameW+off+k*cell;
    if(same&&dots){x.fillStyle='#b9c4cf';x.fillRect(px+cell/2-.75,y+ROW/2,1.5,1.5);continue;}
    const g=idx[v];if(g<0)continue;x.drawImage(a,g*cw,same?0:rh,cw,rh,px,y,cell,ROW);}
   return;}
  if(cell>=PAINT_MIN){const dots=this.mode==='diff';for(let k=0;k<n;k++){const v=b[k];if(!v)continue;const c=cmp[c0+k],same=v===c||(v===GAP&&!c)||(loose&&coversBase(c,v));if(v===GAP&&same)continue;x.fillStyle=v===GAP?'#59697b':same?(dots?'#dbe2e9':baseTint(v)):baseColor(v);x.fillRect(Math.floor(this.nameW+off+k*cell),y+1,Math.ceil(cell),ROW-2);}return;}
  const step=Math.max(1,Math.floor(1/cell)),hgt=ROW-2;
  for(let k=0;k<n;k+=step){let cov=0,diff=0,gap=0,base=0;for(let j=k;j<k+step&&j<n;j++){const v=b[j];if(!v)continue;cov=1;if(v===GAP){if(cmp[c0+j])gap=1;}else if(v!==cmp[c0+j]&&!(loose&&coversBase(cmp[c0+j],v))){diff=1;base=v;}}
   if(!cov)continue;const px=this.nameW+off+k*cell,wd=Math.max(cell*step,1);
   x.fillStyle=diff?baseColor(base):gap?'#59697b':'#dbe2e9';x.fillRect(px,y+1,wd,hgt);}
 }
 names(x,r0,rows,yoff){const d=this.data,TOP=this.top;x.save();x.beginPath();x.rect(0,TOP,this.nameW,this.height-TOP);x.clip();x.font=`12px ${UI}`;x.textBaseline='middle';x.textAlign='left';
  for(let v=0;v<rows;v++){const n=r0+v;if(n>=d.order.length)break;const y=TOP+v*ROW+yoff,i=d.order[n];if(n===this.selected){x.fillStyle='#fdf3d0';x.fillRect(0,y,this.nameW,ROW);}else if(n&1){x.fillStyle='#fafbfd';x.fillRect(0,y,this.nameW,ROW);}x.fillStyle=d.S.meta[i*8]<0?'#8d99a5':'#23364d';x.fillText(this.fit(x,`${n+1}. ${displayName(d.names[i],this.nameMode)}`,this.nameW-10),6,y+ROW/2+.5);}
  x.restore();}
 fit(x,s,max){if(s.length>90)s=s.slice(0,90);if(x.measureText(s).width<=max)return s;let lo=0,hi=s.length;while(lo<hi){const m=(lo+hi+1)>>1;if(x.measureText(s.slice(0,m)+'…').width<=max)lo=m;else hi=m-1;}return s.slice(0,lo)+'…';}
 arrows(x,y,c0,c1,off){
  const cell=this.cell;x.font=`11px ${UI}`;x.textBaseline='middle';x.textAlign='left';
  for(const p of this.shown??[]){if(p.c1<c0||p.c0>c1)continue;const left=this.nameW+off+(p.c0-c0)*cell,right=this.nameW+off+(p.c1-c0)*cell,top=y+p.lane*LANE+2,hh=LANE-4,mid=top+hh/2,head=Math.min(7,Math.max(2,(right-left)/2));
   x.beginPath();if(p.strand>0){x.moveTo(left,top);x.lineTo(right-head,top);x.lineTo(right,mid);x.lineTo(right-head,top+hh);x.lineTo(left,top+hh);}else{x.moveTo(right,top);x.lineTo(left+head,top);x.lineTo(left,mid);x.lineTo(left+head,top+hh);x.lineTo(right,top+hh);}x.closePath();
   x.fillStyle=p.mismatches?'#8a9a3a':'#3f9a63';x.fill();if(p.id===this.activePrimer){x.strokeStyle='#1d3b2a';x.lineWidth=1.5;x.stroke();}
   const tw=x.measureText(p.name).width;if(tw+head+6<right-left){x.fillStyle='#fff';x.fillText(p.name,left+(p.strand>0?4:head+3),mid+.5);}else{x.fillStyle='#23364d';x.fillText(p.name,right+3,mid+.5);}}
 }
 tracks(x,c0,c1,off){
  const d=this.data,cell=this.cell,{refOfCol,total}=d.cols,cov=d.stats.coverage,idn=d.stats.identity,maxCov=d.maxCoverage||1,TOP=this.top;let y=0;
  x.font=`12px ${UI}`;x.textBaseline='middle';x.textAlign='left';
  const label=(t,hh)=>{x.fillStyle='#59697b';x.fillText(t,6,y+hh/2+.5);};
  const ow=this.width-this.nameW-2;label('전체 위치',H.overview);const L=cov.length;x.fillStyle='#e7ecf1';x.fillRect(this.nameW+1,5,ow,10);x.fillStyle='#9fb2c4';
  for(let p=0;p<ow;p+=2){const r=Math.min(L-1,Math.floor(p/ow*L));const f=cov[r]/maxCov;x.fillRect(this.nameW+1+p,15-10*f,2,10*f);}
  for(const p of this.shown??[]){x.fillStyle=p.mismatches?'#8a9a3a':'#3f9a63';x.fillRect(this.nameW+1+p.c0/total*ow,1,Math.max(2,(p.c1-p.c0)/total*ow),18);}
  x.strokeStyle='#344e6b';x.lineWidth=1;x.strokeRect(this.nameW+1+c0/total*ow+.5,3.5,Math.max(3,(c1-c0)/total*ow),13);y+=H.overview;
  x.save();x.beginPath();x.rect(this.nameW,0,this.width-this.nameW,TOP);x.clip();
  const unit=[1,2,5,10,20,50,100,200,500,1000,2000,5000,10000].find(u=>u*cell>=70)||20000;x.fillStyle='#23364d';x.font=`11px ${UI}`;
  for(let c=c0;c<c1;c++){const r=refOfCol[c],px=this.nameW+off+(c-c0)*cell;if(r<0){x.fillStyle='#b8831f';x.fillRect(px,y+H.ruler-7,Math.max(cell,1),6);x.fillStyle='#23364d';continue;}const pos=r+1;if(pos%unit===0||pos===1){x.fillRect(px,y+H.ruler-6,1,5);x.fillText(pos.toLocaleString(),px+2,y+9);}}
  y+=H.ruler;this.arrows(x,y,c0,c1,off);y+=this.lanes*LANE;
  this.seqTrack(x,this.consRow,y,H.consensus,c0,c1,off,this.refRow);y+=H.consensus;
  x.fillStyle='#8fa8bf';const step=Math.max(1,Math.floor(1/cell));for(let c=c0;c<c1;c+=step){const r=refOfCol[c];if(r<0)continue;const f=cov[r]/maxCov,hh=(H.coverage-4)*f;x.fillRect(this.nameW+off+(c-c0)*cell,y+H.coverage-2-hh,Math.max(cell*step,1),hh);}y+=H.coverage;
  for(let c=c0;c<c1;c+=step){const r=refOfCol[c];if(r<0)continue;let v=1;for(let j=c;j<c+step&&j<c1;j++){const q=refOfCol[j];if(q>=0&&idn[q]<v)v=idn[q];}x.fillStyle=Number.isNaN(idn[r])?'#e7ecf1':v>=1?'#3f9a63':v<.3?'#c2453f':'#b5a93a';x.fillRect(this.nameW+off+(c-c0)*cell,y+1,Math.max(cell*step,1),H.identity-2);}y+=H.identity;
  this.seqTrack(x,this.refRow,y,H.reference,c0,c1,off,this.consRow);
  x.restore();
  y=H.overview;x.font=`12px ${UI}`;x.textBaseline='middle';x.textAlign='left';x.fillStyle='#f8fafc';x.fillRect(0,y,this.nameW,TOP-y);
  for(const [t,hh] of [['좌표 (reference)',H.ruler],...(this.lanes?[['Primer',this.lanes*LANE]]:[]),[this.consLabel,H.consensus],[`Coverage (최대 ${maxCov.toLocaleString()})`,H.coverage],['보존도',H.identity]]){label(t,hh);y+=hh;}
  x.fillStyle='#fdf8e6';x.fillRect(0,y,this.nameW,H.reference);x.fillStyle='#23364d';x.fillText(this.fit(x,'Reference: '+displayName(d.refFull??d.refName,this.nameMode),this.nameW-10),6,y+H.reference/2+.5);
 }
 seqTrack(x,seq,y,hh,c0,c1,off,other){const cell=this.cell;
  if(cell>=GLYPH_MIN){const a=this.glyphs(),d=this.dpr,cw=Math.ceil(cell*d),rh=ROW*d;for(let c=c0;c<c1;c++){const v=seq[c];if(!v)continue;const g=this.atlasIndex[v];if(g<0)continue;x.drawImage(a,g*cw,v===other[c]?0:rh,cw,rh,this.nameW+off+(c-c0)*cell,y,cell,hh);}return;}
  if(cell>=PAINT_MIN){for(let c=c0;c<c1;c++){const v=seq[c];if(!v||v===GAP)continue;x.fillStyle=v===other[c]?baseTint(v):baseColor(v);x.fillRect(Math.floor(this.nameW+off+(c-c0)*cell),y+1,Math.ceil(cell),hh-2);}return;}
  const step=Math.max(1,Math.floor(1/cell));for(let c=c0;c<c1;c+=step){let diff=0,has=0;for(let j=c;j<c+step&&j<c1;j++){if(seq[j]){has=1;if(seq[j]!==other[j])diff=seq[j];}}if(!has)continue;x.fillStyle=diff?baseColor(diff):'#dbe2e9';x.fillRect(this.nameW+off+(c-c0)*cell,y+1,Math.max(cell*step,1),hh-2);}}
 locate(e){const b=this.canvas.getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top,v=this.view;if(!v||!this.data)return null;
  const TOP=this.top,col=px>=this.nameW?v.c0+Math.floor((px-this.nameW-v.off)/this.cell):-1,row=py>=TOP?v.r0+Math.floor((py-TOP-v.yoff)/ROW):-1,laneTop=H.overview+H.ruler,inLanes=py>=laneTop&&py<laneTop+this.lanes*LANE,consTop=laneTop+this.lanes*LANE,refTop=consTop+H.consensus+H.coverage+H.identity;
  let primer=null;if(inLanes&&col>=0){const lane=Math.floor((py-laneTop)/LANE);primer=this.shown?.find(p=>p.lane===lane&&col>=p.c0&&col<p.c1)??null;}
  return {px,py,col:col<this.data.cols.total?col:-1,row:row<this.data.order.length?row:-1,primer,track:py<H.overview?'overview':py>=consTop&&py<consTop+H.consensus?'consensus':py>=TOP?'row':py>=refTop?'reference':'other'};}
 nearSplit(p){return p&&Math.abs(p.px-this.nameW)<=4;}
 move(e){const p=this.locate(e);if(this.drag?.resize){if(p)this.setNameWidth(p.px);return;}this.canvas.style.cursor=this.nearSplit(p)?'col-resize':'';if(this.drag)return;this.onHover?.(p);}
 down(e){if(e.button)return;const p=this.locate(e);if(!p)return;if(this.nearSplit(p)){e.preventDefault();this.drag={resize:true};this.request();return;}if(p.track==='overview'&&p.px>=this.nameW){this.scrollToColumn((p.px-this.nameW)/(this.width-this.nameW)*this.data.cols.total);return;}
  if(p.primer){this.lastPrimer={id:p.primer.id,t:performance.now()};this.onPrimer?.(p.primer.id);return;}
  if(p.col<0){if(p.row>=0)this.onSelect?.(p.row);return;}
  if(p.track==='other')return;
  e.preventDefault();this.drag={start:p.col,lane:p.track==='consensus'?-2:p.track==='reference'?-1:p.row,moved:false,row:p.row};this.pointer=e;this.scroller.focus({preventScroll:true});}
 // Screen point to column and lane, held inside the data. Lanes in screen order: -2 consensus, -1 reference, 0.. shown rows.
 pointAt(e){const b=this.canvas.getBoundingClientRect(),v=this.view,d=this.data,px=Math.max(this.nameW,Math.min(this.width-1,e.clientX-b.left)),py=e.clientY-b.top,cons=H.overview+H.ruler+this.lanes*LANE,ref=cons+H.consensus+H.coverage+H.identity,col=Math.max(0,Math.min(d.cols.total-1,v.c0+Math.floor((px-this.nameW-v.off)/this.cell)));let lane=py<ref?-2:-1;if(py>=this.top&&d.order.length)lane=Math.max(0,Math.min(d.order.length-1,v.r0+Math.floor((py-this.top-v.yoff)/ROW)));return {col,lane,px,py};}
 extend({col,lane}){const d=this.drag;if(col!==d.start||lane!==d.lane)d.moved=true;if(!d.moved)return;const from=Math.min(lane,d.lane),to=Math.max(lane,d.lane),next={c0:Math.min(d.start,col),c1:Math.max(d.start,col)+1,from,to,source:from!==to?'multi':from===-2?'consensus':from===-1?'reference':'row',row:from===to&&from>=0?from:-1},r=this.range;if(r&&r.c0===next.c0&&r.c1===next.c1&&r.from===from&&r.to===to)return;this.range=next;this.request();this.onRange?.(next);}
 // Holding the pointer at an edge keeps scrolling, so rows off screen can join the selection.
 follow(){this.extend(this.pointAt(this.pointer));if(this.following)return;this.following=true;const tick=()=>{if(!this.drag||this.drag.resize){this.following=false;return;}const s=this.scroller,{px,py}=this.pointAt(this.pointer),l=s.scrollLeft,t=s.scrollTop;if(py>this.height-14)s.scrollTop+=ROW;else if(py>=this.top&&py<this.top+8)s.scrollTop-=ROW;if(px>this.width-14)s.scrollLeft+=Math.max(this.cell*2,8);else if(px<this.nameW+8)s.scrollLeft-=Math.max(this.cell*2,8);if(s.scrollLeft!==l||s.scrollTop!==t){this.draw();this.extend(this.pointAt(this.pointer));}requestAnimationFrame(tick);};requestAnimationFrame(tick);}
 up(){const d=this.drag;if(!d)return;this.drag=null;if(d.resize){this.request();return;}if(!d.moved&&d.row>=0)this.onSelect?.(d.row);}
 key(e){const s=this.scroller,stepX=this.cell*10,page=this.height-this.top-ROW,map={ArrowLeft:[-stepX,0],ArrowRight:[stepX,0],ArrowUp:[0,-ROW],ArrowDown:[0,ROW],PageUp:[0,-page],PageDown:[0,page]},m=map[e.key];if(m){e.preventDefault();s.scrollBy(m[0],m[1]);}}
}
export const LAYOUT=Object.freeze({ROW,BASE_TOP});
