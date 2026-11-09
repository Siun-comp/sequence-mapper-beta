// SPDX-License-Identifier: GPL-2.0-or-later
// Alignment records. Internal coordinates are 0-based half-open; only the screen and exports use 1-based.
// S = {pool,offs,flags,meta,cig,extra}. meta holds STRIDE ints per record for its primary hit.
export const STRIDE=8,REF=0,REV=1,QS=2,QE=3,MAPQ=4,HITS=5,COFF=6,CN=7;
export const UNMAPPED=-1,SKIPPED=-2;
export const OP=Object.freeze({M:0,I:1,D:2,S:4,EQ:7,X:8});
export const OPS='MIDNSHP=X';
const COMP=new Uint8Array(256);
for(const [a,b] of Object.entries({A:'T',C:'G',G:'C',T:'A',R:'Y',Y:'R',S:'S',W:'W',K:'M',M:'K',B:'V',V:'B',D:'H',H:'D',N:'N'}))COMP[a.charCodeAt(0)]=b.charCodeAt(0);
export const GAP=45;
const CODE=new Uint8Array(256);for(const [k,v] of Object.entries({A:1,C:2,G:4,T:8,R:5,Y:10,S:6,W:9,K:12,M:3,B:14,D:13,H:11,V:7,N:15}))CODE[k.charCodeAt(0)]=v;
// True when every base meant by `base` is included in the consensus code.
export const coversBase=(code,base)=>!!CODE[code]&&!!CODE[base]&&!(CODE[base]&~CODE[code]);
export const complement=c=>COMP[c]||78;
export const toDisplay=pos0=>pos0+1;
export const fromDisplay=pos1=>pos1-1;
export function reverseComplementBytes(b){const o=new Uint8Array(b.length);for(let i=0,n=b.length;i<n;i++)o[i]=complement(b[n-1-i]);return o;}

export const isMapped=(S,i)=>S.meta[i*STRIDE+REF]>=0;
export const recordLength=(S,i)=>S.offs[i+1]-S.offs[i];
// Query position counted along the reference direction where the alignment starts.
function queryStart(S,i){const b=i*STRIDE;return S.meta[b+REV]?recordLength(S,i)-S.meta[b+QE]:S.meta[b+QS];}
function baseAt(S,i,q,rev,len,o){return rev?complement(S.pool[o+len-1-q]):S.pool[o+q];}

// Writes the record on reference coordinates. row[r]=base byte, 0=not covered, 45=deletion. ins[r]=inserted bases before r.
export function expandRow(S,i,row,ins){
 row.fill(0);ins.fill(0);const b=i*STRIDE;if(S.meta[b+REF]<0)return false;
 const rev=S.meta[b+REV],len=recordLength(S,i),o=S.offs[i];let q=queryStart(S,i),r=S.meta[b+REF];
 const c0=S.meta[b+COFF],c1=c0+S.meta[b+CN];
 for(let c=c0;c<c1;c++){const v=S.cig[c],l=v>>>4,op=v&15;
  if(op===OP.EQ||op===OP.X||op===OP.M){for(let k=0;k<l;k++)row[r+k]=baseAt(S,i,q+k,rev,len,o);r+=l;q+=l;}
  else if(op===OP.I){ins[r]+=l;q+=l;}
  else if(op===OP.D){row.fill(GAP,r,r+l);r+=l;}
 }
 return true;
}
// Display column of a query position counted along the reference direction. -1 outside the aligned part.
export function columnOfQuery(S,i,cols,pos){
 const b=i*STRIDE;if(S.meta[b+REF]<0)return -1;let q=queryStart(S,i),r=S.meta[b+REF];if(pos<q)return -1;
 const {colOf,insMax}=cols,c0=S.meta[b+COFF],c1=c0+S.meta[b+CN];
 for(let c=c0;c<c1;c++){const v=S.cig[c],l=v>>>4,op=v&15;
  if(op===OP.EQ||op===OP.X||op===OP.M){if(pos<q+l)return colOf[r+pos-q];r+=l;q+=l;}
  else if(op===OP.I){if(pos<q+l)return colOf[r]-(insMax[r]|0)+pos-q;q+=l;}
  else if(op===OP.D)r+=l;
 }
 return -1;
}
export function refEnd(S,i){const b=i*STRIDE;let r=S.meta[b+REF];const c0=S.meta[b+COFF],c1=c0+S.meta[b+CN];for(let c=c0;c<c1;c++){const v=S.cig[c],op=v&15;if(op===OP.EQ||op===OP.X||op===OP.M||op===OP.D)r+=v>>>4;}return r;}

// Identity = match/(match+mismatch+insertion+deletion). Bases that are not plain A/C/G/T on either side are ambiguous and leave the denominator.
const PLAIN=new Uint8Array(256);for(const c of 'ACGT')PLAIN[c.charCodeAt(0)]=1;
export function countRow(S,i,ref){
 const b=i*STRIDE,res={match:0,mismatch:0,ambiguous:0,insertion:0,deletion:0,refEnd:0};if(S.meta[b+REF]<0)return res;
 const rev=S.meta[b+REV],len=recordLength(S,i),o=S.offs[i];let q=queryStart(S,i),r=S.meta[b+REF];
 const c0=S.meta[b+COFF],c1=c0+S.meta[b+CN];
 for(let c=c0;c<c1;c++){const v=S.cig[c],l=v>>>4,op=v&15;
  if(op===OP.EQ||op===OP.X||op===OP.M){for(let k=0;k<l;k++){const x=baseAt(S,i,q+k,rev,len,o),y=ref[r+k];if(!PLAIN[x]||!PLAIN[y])res.ambiguous++;else if(x===y)res.match++;else res.mismatch++;}r+=l;q+=l;}
  else if(op===OP.I){res.insertion+=l;q+=l;}
  else if(op===OP.D){res.deletion+=l;r+=l;}
 }
 res.refEnd=r;return res;
}
export const identityOf=c=>{const d=c.match+c.mismatch+c.insertion+c.deletion;return d?c.match/d:null;};

// Display columns: every reference position plus all insertion columns seen in any row.
// insMax[L], when present, holds columns after the last reference position.
export function buildColumns(insMax,L=insMax.length){
 const colOf=new Int32Array(L+1);let c=0;for(let r=0;r<L;r++){c+=insMax[r];colOf[r]=c++;}c+=insMax[L]|0;colOf[L]=c;
 const refOfCol=new Int32Array(c).fill(-1);for(let r=0;r<L;r++)refOfCol[colOf[r]]=r;
 return {colOf,refOfCol,insMax,total:c};
}
// Fills out for columns [c0,c1): base byte, 0=not covered, 45=gap. Rows without an insertion get gaps in insertion columns inside their span.
export function projectRow(S,i,cols,out,c0,c1){
 out.fill(0,0,c1-c0);const b=i*STRIDE;if(S.meta[b+REF]<0)return;
 const rev=S.meta[b+REV],len=recordLength(S,i),o=S.offs[i],{colOf,insMax}=cols,start=S.meta[b+REF];let q=queryStart(S,i),r=start;
 const put=(c,v)=>{if(c>=c0&&c<c1)out[c-c0]=v;};
 const padBefore=p=>{const m=insMax[p];if(m&&p>start){const e=colOf[p];for(let c=e-m;c<e;c++)if(c>=c0&&c<c1&&!out[c-c0])out[c-c0]=GAP;}};
 const ci=S.meta[b+COFF],ce=ci+S.meta[b+CN];
 for(let c=ci;c<ce;c++){const v=S.cig[c],l=v>>>4,op=v&15;
  if(op===OP.EQ||op===OP.X||op===OP.M){
   if(colOf[r]>=c1)break;
   if(colOf[r+l]<c0){r+=l;q+=l;continue;}
   for(let k=0;k<l;k++){padBefore(r+k);put(colOf[r+k],baseAt(S,i,q+k,rev,len,o));}r+=l;q+=l;}
  else if(op===OP.I){const first=colOf[r]-insMax[r];for(let k=0;k<l;k++)put(first+k,baseAt(S,i,q+k,rev,len,o));q+=l;}
  else if(op===OP.D){for(let k=0;k<l;k++){padBefore(r+k);put(colOf[r+k],GAP);}r+=l;}
 }
}

// SAM CIGAR with soft clips, reference direction. =/X collapse to M unless exact is requested.
export function samCigar(cig,off,n,leftClip,rightClip,exact=false){
 const parts=[];if(leftClip)parts.push(leftClip+'S');let run=0;
 for(let c=off;c<off+n;c++){const v=cig[c],l=v>>>4,op=v&15;
  if(!exact&&(op===OP.EQ||op===OP.X||op===OP.M)){run+=l;continue;}
  if(run){parts.push(run+'M');run=0;}parts.push(l+OPS[op]);}
 if(run)parts.push(run+'M');if(rightClip)parts.push(rightClip+'S');return parts.join('');
}
export const clips=(length,reverse,qStart,qEnd)=>reverse?[length-qEnd,qStart]:[qStart,length-qEnd];
