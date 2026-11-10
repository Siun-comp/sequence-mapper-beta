// SPDX-License-Identifier: GPL-2.0-or-later
// Primer exports. Coordinates are 1-based inclusive on the reference. Unplaced primers stay in the CSV only.
import {csvCell} from './export.mjs';
import {mixedBases} from './primer.mjs';
const dec=new TextDecoder(),MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const placed=list=>list.filter(p=>p.site);
const sourceLabel=p=>p.manual?'직접 지정':p.site?.source==='consensus'?'Consensus 검색':'Reference 검색';
function wrapQualifier(text){const pad=' '.repeat(21),lines=[];for(let p=0;p<text.length;p+=58)lines.push(pad+text.slice(p,p+58));return lines.join('\n');}
// GenBank readers expect ASCII, so the note stays in English even though the CSV is Korean.
const sourceTag=p=>p.manual?'manually placed':p.site?.source==='consensus'?'found on consensus':'found on reference';
const quoted=s=>String(s).replaceAll('"','""');
// Past the end means across the origin of a circular record.
export const endOf=(site,length)=>site.end>length?site.end-length:site.end;
function location({start,end,strand},length){const span=end>length?`join(${start+1}..${length},1..${end-length})`:`${start+1}..${end}`;return strand>0?span:`complement(${span})`;}
export function referenceGenbank({reference,primers,date=new Date()}){
 const seq=dec.decode(reference.sequence),len=seq.length,src=reference.source,id=src?.version||reference.name.split(/\s+/,1)[0]||'reference',locus=(src?.locus||id).replace(/\s+/g,'_'),when=`${String(date.getUTCDate()).padStart(2,'0')}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`,definition=src?.definition||reference.name.slice(id.length).trim()||id;
 const topology=reference.topology??src?.topology??'linear',out=[`LOCUS       ${locus.padEnd(16)} ${String(len).padStart(11)} bp    DNA     ${topology.padEnd(8)} UNA ${when}`];
 definition.match(/.{1,67}/g)?.forEach((l,i)=>out.push((i?' '.repeat(12):'DEFINITION  ')+l));
 out.push(`ACCESSION   ${id.split('.')[0]}`,`VERSION     ${id}`,'KEYWORDS    .','SOURCE      .','  ORGANISM  .');
 if(reference.features)out.push(reference.features);else out.push('FEATURES             Location/Qualifiers',`     source          1..${len}`);
 for(const p of placed(primers)){out.push(`     primer_bind     ${location(p.site,len)}`,wrapQualifier(`/label="${quoted(p.name)}"`),wrapQualifier(`/note="JSU Sequence Mapper user annotation; set=${quoted(p.set||'-')}; sequence=${p.sequence}; mismatches=${p.site.mismatches}; ${p.site.unresolved?`unresolved=${p.site.unresolved}; `:''}${sourceTag(p)}"`));}
 out.push('ORIGIN');
 for(let p=0;p<len;p+=60){const parts=[];for(let k=p;k<Math.min(p+60,len);k+=10)parts.push(seq.slice(k,k+10).toLowerCase());out.push(String(p+1).padStart(9)+' '+parts.join(' '));}
 out.push('//','');return out.join('\n');
}
const gffValue=s=>String(s).replace(/[%;=&,\t\r\n]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'));
export function primerGff3({referenceId,referenceLength,primers,circular=false}){
 const id=gffValue(referenceId),out=['##gff-version 3',`##sequence-region ${id} 1 ${referenceLength}`],missing=primers.filter(p=>!p.site);
 // GFF3 writes a feature across the origin with an end past the landmark length.
 if(circular)out.push([id,'JSU_Sequence_Mapper','region',1,referenceLength,'.','+','.',`ID=${id};Is_circular=true`].join('\t'));
 placed(primers).forEach((p,i)=>out.push([id,'JSU_Sequence_Mapper','primer_binding_site',p.site.start+1,p.site.end,'.',p.site.strand>0?'+':'-','.',`ID=primer${i+1};Name=${gffValue(p.name)};Note=${gffValue(`set=${p.set||'-'} sequence=${p.sequence} mismatches=${p.site.mismatches} ${p.site.unresolved?`unresolved=${p.site.unresolved} `:''}${sourceLabel(p)}`)}`].join('\t')));
 if(missing.length)out.push(`# 위치를 찾지 못해 제외한 primer ${missing.length}개: ${missing.map(p=>p.name.replace(/\s+/g,' ')).join(', ')}`);
 return out.join('\n')+'\n';
}
export const PRIMER_COLUMNS=['Set','Name','Sequence','Length','Mixed_bases','Start_1based','End_1based','Strand','Mismatches_vs_target','Unresolved_vs_target','Status','Visible','Tm_C','GC_percent','Self_dimer_min_dG'];
export function primerRows(primers,{length=Infinity,metrics=()=>({tm:'',gc:''})}={}){return primers.map(p=>{const m=metrics(p);return [p.set,p.name,p.sequence,p.sequence.length,mixedBases(p.sequence),p.site?p.site.start+1:'',p.site?endOf(p.site,length):'',p.site?(p.site.strand>0?'+':'-'):'',p.site?.mismatches??'',p.site?(p.site.unresolved??0):'',p.site?sourceLabel(p):'위치 없음',p.visible?'Y':'N',m.tm,m.gc,m.self??''];});}
const CRLF=String.fromCharCode(13,10);
export function primerCsv(primers,options){
 return '﻿'+[PRIMER_COLUMNS,...primerRows(primers,options)].map(r=>r.map(csvCell).join(',')).join(CRLF)+CRLF;
}
export function bindingCsv(binding,columns,value,note){
 const head=['Set','Primer','Start_1based','End_1based','Strand','Records',...columns.map(c=>c[1]),'Variant_forms'],rows=binding.result.map(t=>[t.set,t.name,t.start+1,t.end,t.strand>0?'+':'-',t.total,...columns.map(([c])=>value(t,c)),t.variantCount]);
 return '﻿'+[head,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'+csvCell(note)+'\r\n';
}
