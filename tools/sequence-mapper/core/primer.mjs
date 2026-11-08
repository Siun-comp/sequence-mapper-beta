// SPDX-License-Identifier: GPL-2.0-or-later
// Primer input and binding-site search. A sequence match is not a claim that priming will work.
const CODES={A:1,C:2,G:4,T:8,R:5,Y:10,S:6,W:9,K:12,M:3,B:14,D:13,H:11,V:7,N:15};
export const MASK=new Uint8Array(256);for(const [k,v] of Object.entries(CODES))MASK[k.charCodeAt(0)]=v;
const COMP={A:'T',C:'G',G:'C',T:'A',R:'Y',Y:'R',S:'S',W:'W',K:'M',M:'K',B:'V',V:'B',D:'H',H:'D',N:'N'};
export const reverseComplement=s=>{let o='';for(let i=s.length-1;i>=0;i--)o+=COMP[s[i]];return o;};
export const MAX_PRIMER_LENGTH=200,MIN_PRIMER_LENGTH=8;

export function normalizeSequence(raw){
 const s=String(raw??'').toUpperCase().replace(/^\s*5['′]?\s*-?\s*/,'').replace(/\s*-?\s*3['′]?\s*$/,'').replace(/\s+/g,'').replace(/U/g,'T');
 if(!s)return {error:'서열이 없습니다.'};
 const bad=[...new Set([...s].filter(c=>!COMP[c]))];
 if(bad.length)return {error:`지원하지 않는 문자: ${bad.join(' ')}`};
 if(s.length<MIN_PRIMER_LENGTH)return {error:`${MIN_PRIMER_LENGTH} nt보다 짧습니다.`};
 if(s.length>MAX_PRIMER_LENGTH)return {error:`${MAX_PRIMER_LENGTH} nt보다 깁니다.`};
 return {sequence:s};
}
export const mixedBases=s=>[...s].filter(c=>!'ACGT'.includes(c)).length;

// Text input: FASTA, or a table separated by tab or comma.
export function parseText(text){
 const clean=text.replace(/^﻿/,'').trim();if(!clean)return {rows:[]};
 const lines=clean.split(/\r?\n/);
 if(lines[0].startsWith('>')){const rows=[['Name','Sequence']];for(const l of lines){if(l.startsWith('>'))rows.push([l.slice(1).trim(),'']);else if(rows.length>1)rows.at(-1)[1]+=l.trim();}return {rows};}
 const sep=lines[0].includes('\t')?'\t':lines[0].includes(',')?',':/\s+/;
 return {rows:lines.map(l=>l.split(sep).map(c=>c.trim().replace(/^"(.*)"$/,'$1')))};
}
const NAME=/^(primer[_ ]?name|name|oligo|oligo[_ ]?name|primer|id|이름|프라이머|올리고)$/i,SEQ=/^(sequence(_5to3)?|seq|5.?-?3.?|서열|염기서열)$/i,SET=/^(set(_id)?|group|세트|그룹)$/i;
// Finds columns from a header row; a first row that already holds a sequence means there is no header.
export function detectColumns(rows){
 const head=rows[0]??[],find=re=>head.findIndex(c=>re.test(String(c).trim()));let name=find(NAME),sequence=find(SEQ),set=find(SET);
 if(name>=0||sequence>=0)return {header:true,name,sequence,set};
 const looksSeq=c=>/^[ACGTUacgtuRYSWKMBDHVNryswkmbdhvn\s]{8,}$/.test(String(c));
 sequence=head.findIndex(looksSeq);name=head.findIndex((c,i)=>i!==sequence&&String(c).trim());
 return {header:false,name,sequence,set:-1};
}
export function buildPrimers(rows,map,{defaultSet='',existing=[]}={}){
 const primers=[],errors=[],taken=new Set(existing.map(p=>p.set+'\0'+p.name)),first=map.header?1:0;
 for(let i=first;i<rows.length;i++){const r=rows[i],line=i+1;
  if(!r||r.every(c=>!String(c??'').trim()))continue;
  const name=String(r[map.name]??'').trim(),raw=r[map.sequence];
  if(!name){errors.push(`${line}행: 이름이 없습니다.`);continue;}
  const n=normalizeSequence(raw);if(n.error){errors.push(`${line}행 ${name}: ${n.error}`);continue;}
  const set=(map.set>=0?String(r[map.set]??'').trim():'')||defaultSet;
  let unique=name,k=2;while(taken.has(set+'\0'+unique))unique=`${name} (${k++})`;taken.add(set+'\0'+unique);
  primers.push({name:unique,set,sequence:n.sequence,renamed:unique!==name,visible:true});
 }
 return {primers,errors};
}

// Scans both strands. Minus-strand hits compare the reverse complement, so 3' lies at the left end of the site.
// A circular target is searched past its end, so a site across the origin has end > target length.
export function findSites(target,sequence,{maxMismatch=0,end3Exact=0,circular=false}={}){
 const hits=[],L=sequence.length,forms=[[1,sequence],[-1,reverseComplement(sequence)]];
 if(circular&&L>1&&target.length>=L){const t=new Uint8Array(target.length+L-1);t.set(target);t.set(target.subarray(0,L-1),target.length);target=t;}
 for(const [strand,form] of forms){const m=Uint8Array.from(form,c=>MASK[c.charCodeAt(0)]);
  scan:for(let s=0;s+L<=target.length;s++){const miss=[];
   for(let k=0;k<L;k++){const t=MASK[target[s+k]];if(!t)continue scan;if(!(t&m[k])){miss.push(k);if(miss.length>maxMismatch)continue scan;}}
   if(end3Exact&&miss.some(k=>strand>0?k>=L-end3Exact:k<end3Exact))continue;
   hits.push({start:s,end:s+L,strand,mismatches:miss.length,positions:miss});}}
 return hits.sort((a,b)=>a.mismatches-b.mismatches||a.start-b.start||b.strand-a.strand);
}
// Reference first; the consensus only when the reference has no site. Coordinates stay on the reference.
export function placePrimer(p,reference,consensus,options){
 const onRef=findSites(reference,p.sequence,options);
 if(onRef.length)return {...p,hits:onRef,site:{...onRef[0],source:'reference'},placed:'found'};
 if(consensus){const onCons=findSites(consensus,p.sequence,options);if(onCons.length)return {...p,hits:onCons,site:{...onCons[0],source:'consensus'},placed:'found'};}
 return {...p,hits:[],site:null,placed:'missing'};
}
export function chooseHit(p,index){const h=p.hits[index];return h?{...p,site:{...h,source:p.site?.source??'reference'}}:p;}
// Pattern of the primer along the reference direction.
export const siteForm=p=>p.site.strand>0?p.sequence:reverseComplement(p.sequence);
