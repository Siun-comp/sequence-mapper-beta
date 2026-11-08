// SPDX-License-Identifier: GPL-2.0-or-later
// Streaming FASTA/GenBank reader working on bytes, so large inputs never become one JS string.
export const FLAG=Object.freeze({INVALID:1,RNA:2,EMPTY:4,LOWER:8,GAP:16});
const OUT=new Uint8Array(256);
for(const c of 'ACGTRYSWKMBDHVN'){OUT[c.charCodeAt(0)]=c.charCodeAt(0);OUT[c.toLowerCase().charCodeAt(0)]=c.charCodeAt(0);}
const U=85,u=117,T=84,GAP=45,DOT=46,N=78;
const isSpace=c=>c===32||c===9||c===13||c===10;
const isDigit=c=>c>=48&&c<=57;
const latin=new TextDecoder('utf-8');

export class RecordStore{
 constructor(capacity=1<<20,keepGaps=false){this.pool=new Uint8Array(capacity);this.size=0;this.count=0;this.offs=new Uint32Array(1024);this.flags=new Uint8Array(1024);this.fileIdx=new Uint16Array(1024);this.names=[];this.keepGaps=keepGaps;this.badChars=new Map();this.open=false;}
 reserve(extra){if(this.size+extra<=this.pool.length)return;let n=this.pool.length;while(n<this.size+extra)n=Math.ceil(n*1.5);const x=new Uint8Array(n);x.set(this.pool.subarray(0,this.size));this.pool=x;}
 begin(name,file){
  if(this.open)this.end();
  if(this.count+2>=this.offs.length){const n=this.offs.length*2,o=new Uint32Array(n),f=new Uint8Array(n),i=new Uint16Array(n);o.set(this.offs);f.set(this.flags);i.set(this.fileIdx);this.offs=o;this.flags=f;this.fileIdx=i;}
  this.names.push(name);this.fileIdx[this.count]=file;this.flags[this.count]=0;this.offs[this.count]=this.size;this.open=true;
 }
 // digits are line numbers in GenBank ORIGIN and an error in FASTA
 add(b,start,end,skipDigits=false){
  this.reserve(end-start);const pool=this.pool,keep=this.keepGaps;let p=this.size,fl=0;
  for(let i=start;i<end;i++){const c=b[i];
   if(isSpace(c))continue;if(skipDigits&&isDigit(c))continue;
   const o=OUT[c];
   if(o){if(c>96)fl|=FLAG.LOWER;pool[p++]=o;continue;}
   if(c===U||c===u){fl|=FLAG.RNA;pool[p++]=T;continue;}
   if(c===GAP||c===DOT){fl|=FLAG.GAP;if(keep)pool[p++]=GAP;continue;}
   fl|=FLAG.INVALID;const ch=String.fromCharCode(c);this.badChars.set(ch,(this.badChars.get(ch)||0)+1);pool[p++]=keep?GAP:N;
  }
  this.size=p;this.flags[this.count]|=fl;
 }
 end(){if(!this.open)return;if(this.offs[this.count]===this.size)this.flags[this.count]|=FLAG.EMPTY;this.count++;this.offs[this.count]=this.size;this.open=false;}
 finish(){this.end();
  // Shrinks in place when the browser can, so a large file is not held twice at the end of reading.
  const pool=this.pool.buffer.transfer?new Uint8Array(this.pool.buffer.transfer(this.size)):this.pool.slice(0,this.size);this.pool=pool;
  return {pool,offs:this.offs.slice(0,this.count+1),flags:this.flags.slice(0,this.count),fileIdx:this.fileIdx.slice(0,this.count),names:this.names,badChars:[...this.badChars]};}
}

// Splits a byte stream into lines without building strings.
function lineFeeder(onLine){
 let carry=null;
 return {push(chunk){let b=chunk,start=0;
   if(carry){const x=new Uint8Array(carry.length+chunk.length);x.set(carry);x.set(chunk,carry.length);b=x;carry=null;}
   for(;;){const nl=b.indexOf(10,start);if(nl<0)break;onLine(b,start,nl>start&&b[nl-1]===13?nl-1:nl);start=nl+1;}
   if(start<b.length)carry=b.slice(start);},
  end(){if(carry){let e=carry.length;if(e&&carry[e-1]===13)e--;onLine(carry,0,e);carry=null;}}};
}
const text=(b,s,e)=>latin.decode(b.subarray(s,e));

export function createFileParser(store,fileIndex,fileName,{keepFeatures=false,featuresOf=-1}={}){
 const report={file:fileName,format:null,records:0,bases:0,errors:[],warnings:[],features:null,source:null};
 const startSize=store.size,startCount=store.count;
 let mode=null,lineNo=0,gb=null,first=true,inRecord=false,recordNo=-1;
 const keep=()=>keepFeatures||recordNo===featuresOf;
 const fail=m=>{if(report.errors.length<20)report.errors.push(m);};
 const fasta=(b,s,e)=>{
  if(b[s]===62){store.begin(text(b,s+1,e).trim(),fileIndex);inRecord=true;return;}
  if(!inRecord){fail(`${lineNo}행: FASTA 머리글(>) 전에 서열이 있습니다.`);return;}
  store.add(b,s,e);
 };
 const genbank=(b,s,e)=>{
  const line=()=>text(b,s,e);
  if(gb.state==='origin'){if(b[s]===47&&b[s+1]===47){store.end();gb.state='head';gb.closed=true;inRecord=false;return;}store.add(b,s,e,true);return;}
  const l=line();
  if(l.startsWith('LOCUS')){const t=l.trim().split(/\s+/);gb={state:'head',locus:t[1]||'',version:'',definition:'',features:[],closed:false,topology:/\bcircular\b/i.test(l)?'circular':'linear'};recordNo++;inRecord=true;return;}
  if(!inRecord){if(l.trim()==='//'||!l.trim())return;fail(`${lineNo}행: LOCUS 전에 내용이 있습니다.`);return;}
  if(l.startsWith('VERSION')){gb.version=l.slice(12).trim().split(/\s+/)[0]||'';gb.field='';return;}
  if(l.startsWith('DEFINITION')){gb.definition=l.slice(12).trim();gb.field='def';return;}
  if(l.startsWith('FEATURES')){gb.state='features';if(keep())gb.features.push(l);return;}
  if(l.startsWith('ORIGIN')){gb.state='origin';store.begin(`${gb.version||gb.locus} ${gb.definition}`.trim(),fileIndex);if(keep()&&gb.features.length)report.features=gb.features.join('\n');if(featuresOf<0||recordNo===featuresOf)report.source={locus:gb.locus,version:gb.version,definition:gb.definition,topology:gb.topology};return;}
  if(gb.state==='features'){if(keep())gb.features.push(l);return;}
  if(gb.field==='def'&&l.startsWith('  ')){gb.definition+=' '+l.trim();return;}
  if(!l.startsWith(' '))gb.field='';
 };
 const feeder=lineFeeder((b,s,e)=>{
  lineNo++;
  if(first){if(e-s>=3&&b[s]===0xEF&&b[s+1]===0xBB&&b[s+2]===0xBF)s+=3;
   let t=s;while(t<e&&isSpace(b[t]))t++;if(t===e)return;first=false;
   if(b[t]===62){mode='fasta';report.format='FASTA';}
   else if(text(b,t,Math.min(e,t+5))==='LOCUS'){mode='genbank';report.format='GenBank';gb={state:'head',closed:true};}
   else{mode='unknown';fail('FASTA(>) 또는 GenBank(LOCUS) 형식이 아닙니다.');}
  }
  if(mode==='fasta'){if(e>s)fasta(b,s,e);}else if(mode==='genbank')genbank(b,s,e);
 });
 return {report,push:c=>feeder.push(c),finish(){
  feeder.end();
  if(mode==='genbank'&&gb&&gb.state==='origin'){fail('GenBank 파일이 끝(//) 없이 잘렸습니다.');store.end();}
  store.end();
  if(mode===null)fail('파일이 비어 있습니다.');
  report.records=store.count-startCount;report.bases=store.size-startSize;
  if(mode&&mode!=='unknown'&&report.records===0)fail('서열 레코드가 없습니다.');
  return report;}};
}

export async function readInto(store,file,index,options){
 const parser=createFileParser(store,index,file.name,options),reader=file.stream().getReader();
 for(;;){const {done,value}=await reader.read();if(done)break;parser.push(value);if(options?.onBytes)options.onBytes(value.length);}
 return parser.finish();
}
// Annotation of one record of a GenBank file, read again when that record becomes the reference. The list keeps none, since
// 200,000 records of annotation would not fit in memory. Bases go nowhere here.
export async function readRecordInfo(file,record){
 const sink={size:0,count:0,begin(){},add(){},end(){}},parser=createFileParser(sink,0,file.name,{featuresOf:record}),reader=file.stream().getReader();
 for(;;){const {done,value}=await reader.read();if(done)break;parser.push(value);if(parser.report.source){await reader.cancel();break;}}
 return {features:parser.report.features,source:parser.report.source};
}
export const accessionOf=name=>name.split(/\s+/,1)[0]||'';
// List label: Accession (Description). NCBI Virus headers put a | before the description.
export function displayName(name,mode='both'){const id=accessionOf(name).replace(/\|+$/,''),rest=name.slice(accessionOf(name).length).replace(/^[\s|]+/,'').trim();if(mode==='accession'||!rest)return id;return mode==='description'?rest:`${id} (${rest})`;}
export function summarizeFlags(flags){
 const c={invalid:0,rna:0,empty:0,lower:0,gap:0};
 for(const f of flags){if(f&FLAG.INVALID)c.invalid++;if(f&FLAG.RNA)c.rna++;if(f&FLAG.EMPTY)c.empty++;if(f&FLAG.LOWER)c.lower++;if(f&FLAG.GAP)c.gap++;}
 return c;
}
export function duplicateIds(names){const seen=new Map();let duplicates=0;for(const n of names){const id=accessionOf(n),c=seen.get(id)||0;if(c)duplicates++;seen.set(id,c+1);}return duplicates;}
