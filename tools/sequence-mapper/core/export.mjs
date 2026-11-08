// SPDX-License-Identifier: GPL-2.0-or-later
// Exports are generators of text blocks, so no output ever exists as one large string.
import {STRIDE,REF,REV,QS,QE,MAPQ,HITS,COFF,CN,GAP,recordLength,samCigar,clips,toDisplay,reverseComplementBytes,projectRow,countRow} from './alignment.mjs';
import {RS,RS_MATCH,RS_MISMATCH,RS_AMBIG,RS_INS,RS_DEL,RS_REFEND,statusOf,STATUS_LABEL,identityFromStats,queryCoverage,referenceCoverage} from './stats.mjs';
import {accessionOf,FLAG} from './parse.mjs';
const dec=new TextDecoder(),BLOCK=1<<23;
function* chunked(lines){let buf=[],size=0;for(const l of lines){buf.push(l);size+=l.length;if(size>=BLOCK){yield buf.join('');buf=[];size=0;}}if(size)yield buf.join('');}
// A leading =,+,-,@ would run as a formula when the file is opened in Excel.
export function csvCell(v){let s=v===null||v===undefined?'':String(v);if(/^[=+\-@\t\r]./s.test(s))s="'"+s;return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
const pct=x=>x===null?'':(x*100).toFixed(3);
export const SUMMARY_COLUMNS=['source_file','input_order','uid','query_id','description','query_length','status','orientation','target','ref_start_1based','ref_end_1based','query_start_1based','query_end_1based','match','mismatch','ambiguous','insertion','deletion','identity_pct','reference_coverage_pct','query_coverage_pct','hits','cigar','note'];
export function uniqueIds(names){const seen=new Map();return names.map(n=>{const id=accessionOf(n).replace(/[^!-?A-~]/g,'_')||'unnamed',c=seen.get(id)||0;seen.set(id,c+1);return c?`${id}_dup${c}`:id;});}
function* summaryLines(ctx,order){
 const {S,R,names,files,refId,refLength}=ctx;yield '﻿'+SUMMARY_COLUMNS.join(',')+'\r\n';
 for(const i of order){const b=i*STRIDE,st=statusOf(S,i),mapped=S.meta[b+REF]>=0,len=recordLength(S,i),[l,rt]=mapped?clips(len,!!S.meta[b+REV],S.meta[b+QS],S.meta[b+QE]):[0,0],r=i*RS;
  const note=[];const f=S.flags[i];if(f&FLAG.INVALID)note.push('지원하지 않는 문자');if(f&FLAG.EMPTY)note.push('빈 서열');if(f&FLAG.RNA)note.push('U를 T로 변환');
  yield [files[S.fileIdx[i]]??'',i+1,i,accessionOf(names[i]),names[i].slice(accessionOf(names[i]).length).trim(),len,STATUS_LABEL[st],mapped?(S.meta[b+REV]?'-':'+'):'',mapped?refId:'',
   mapped?toDisplay(S.meta[b+REF]):'',mapped?R[r+RS_REFEND]:'',mapped?S.meta[b+QS]+1:'',mapped?S.meta[b+QE]:'',
   R[r+RS_MATCH],R[r+RS_MISMATCH],R[r+RS_AMBIG],R[r+RS_INS],R[r+RS_DEL],pct(identityFromStats(R,i)),mapped?pct(referenceCoverage(S,R,i,refLength)):'',mapped?pct(queryCoverage(S,i)):'',
   S.meta[b+HITS],mapped?samCigar(S.cig,S.meta[b+COFF],S.meta[b+CN],l,rt,true):'',note.join('; ')].map(csvCell).join(',')+'\r\n';}
}
// Rows x columns: rare insertions widen every row, so this file can be far larger than the input.
export const alignedFastaBytes=(rows,columns)=>(rows+1)*(columns+1);
export const summaryCsv=(ctx,order)=>chunked(summaryLines(ctx,order));

function* samLines(ctx,order){
 const {S,R,names,refId,refLength,meta:info}=ctx,ids=uniqueIds(names);
 yield `@HD\tVN:1.6\tSO:unknown\n@SQ\tSN:${refId}\tLN:${refLength}\n@PG\tID:minimap2\tPN:minimap2\tVN:${info.engine}\tCL:${info.parameters}\n@CO\tJSU LabTools Sequence Mapper ${info.tool}\n`;
 const extra=new Map();for(let e=0;e<S.extra.length;e+=9){const k=S.extra[e];if(!extra.has(k))extra.set(k,[]);extra.get(k).push(e);}
 for(const i of order){const b=i*STRIDE,m=S.meta,raw=S.pool.subarray(S.offs[i],S.offs[i+1]);
  if(m[b+REF]===-2)continue;
  if(m[b+REF]<0){yield `${ids[i]}\t4\t*\t0\t0\t*\t*\t0\t0\t${dec.decode(raw)||'*'}\t*\n`;continue;}
  const len=raw.length,rev=!!m[b+REV],[l,r]=clips(len,rev,m[b+QS],m[b+QE]),seq=dec.decode(rev?reverseComplementBytes(raw):raw),c=i*RS,nm=R[c+RS_MISMATCH]+R[c+RS_AMBIG]+R[c+RS_INS]+R[c+RS_DEL];
  yield `${ids[i]}\t${rev?16:0}\t${refId}\t${toDisplay(m[b+REF])}\t${m[b+MAPQ]}\t${samCigar(S.cig,m[b+COFF],m[b+CN],l,r)}\t*\t0\t0\t${seq}\t*\tNM:i:${nm}\tNH:i:${m[b+HITS]}\n`;
  for(const e of extra.get(i)??[]){const x=S.extra,hr=!!x[e+2],secondary=!x[e+6],flag=(hr?16:0)|(secondary?256:2048),[hl,hrt]=clips(len,hr,x[e+3],x[e+4]);
   yield `${ids[i]}\t${flag}\t${refId}\t${toDisplay(x[e+1])}\t${x[e+5]}\t${samCigar(S.cig,x[e+7],x[e+8],hl,hrt)}\t*\t0\t0\t${secondary?'*':dec.decode(hr?reverseComplementBytes(raw):raw)}\t*\tNH:i:${m[b+HITS]}\n`;}
 }
}
export const samFile=(ctx,order)=>chunked(samLines(ctx,order));

// Reference-anchored rows: same columns for every row, reverse hits turned to reference direction. Not a de novo MSA.
function* alignedLines(ctx,order,{includeConsensus=false}={}){
 const {S,names,cols,ref,stats}=ctx,ids=uniqueIds(names),w=cols.total,buf=new Uint8Array(w);
 const row=()=>{for(let c=0;c<w;c++)if(!buf[c])buf[c]=GAP;return dec.decode(buf)+'\n';};
 buf.fill(GAP);for(let r=0;r<ref.length;r++)buf[cols.colOf[r]]=ref[r];yield `>${ctx.refId} reference\n`+row();
 if(includeConsensus){buf.fill(GAP);for(let r=0;r<ref.length;r++)buf[cols.colOf[r]]=stats.consensus[r]||GAP;yield `>consensus\n`+row();}
 for(const i of order){if(S.meta[i*STRIDE+REF]<0)continue;projectRow(S,i,cols,buf,0,w);yield `>${ids[i]}\n`+row();}
}
export const alignedFasta=(ctx,order,options)=>chunked(alignedLines(ctx,order,options));

function* fastaLines(ctx,order,{orientation='original'}={}){
 const {S,names}=ctx,wrap=70;
 for(const i of order){if(S.meta[i*STRIDE+REF]===-2)continue;let raw=S.pool.subarray(S.offs[i],S.offs[i+1]);if(orientation==='reference'&&S.meta[i*STRIDE+REF]>=0&&S.meta[i*STRIDE+REV])raw=reverseComplementBytes(raw);
  const s=dec.decode(raw),parts=[`>${names[i]}\n`];for(let p=0;p<s.length;p+=wrap)parts.push(s.slice(p,p+wrap),'\n');yield parts.join('');}
}
export const selectedFasta=(ctx,order,options)=>chunked(fastaLines(ctx,order,options));
export {countRow};
