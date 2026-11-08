export const VERSION='0.1.0-dev.1';
export const LIMITS=Object.freeze({oligos:20,length:200,characters:20000});
export const WARNING_MICROS=-9000000;
const COMP={A:'T',T:'A',C:'G',G:'C'};
const THERMO_SOURCE='https://www.thermofisher.com/kr/ko/home/brands/thermo-scientific/molecular-biology/molecular-biology-learning-center/molecular-biology-resource-library/thermo-scientific-web-tools/multiple-primer-analyzer.html';
export const SOURCES={thermo:THERMO_SOURCE,idt:'https://sg.idtdna.com/calc/analyzer',parameters:'https://doi.org/10.1073/pnas.83.11.3746'};
export const reverse=s=>[...s].reverse().join('');
const revcomp=s=>reverse(s).replace(/[ACGT]/g,c=>COMP[c]);
// Published Breslauer propagation dH/dS; integer multiples of 0.1 units.
// Rewritten independently. No vendor implementation is bundled or executed.
const parameters={AA:[-91,-240],AT:[-86,-239],TA:[-60,-169],CA:[-58,-129],GT:[-65,-173],CT:[-78,-208],GA:[-56,-135],CG:[-119,-278],GC:[-111,-267],GG:[-110,-266]};
const stacks={};for(const [pair,[h,s]] of Object.entries(parameters)){stacks[pair]=h*100000-29815*s;stacks[revcomp(pair)]=stacks[pair];}
export function energyMicros(s){let total=0;for(let i=1;i<s.length;i++)total+=stacks[s.slice(i-1,i+1)];return total;}
export const isWarning=v=>Number.isFinite(v)&&v<=WARNING_MICROS;
export function formatDG(v){const rounded=(v<0?'-':'')+(Math.round(Math.abs(v)/10000)/100).toFixed(2);return (Number(rounded)<=-9)!==isWarning(v)?(v/1e6).toFixed(6):rounded;}

export function parseInput(raw){
 if(typeof raw!=='string'||raw.length>LIMITS.characters)throw Error(`입력은 ${LIMITS.characters.toLocaleString()}자까지 가능합니다.`);
 const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/);let records=[];
 const first=lines.find(x=>x.trim());if(!first)throw Error('이름과 DNA 서열을 입력하세요.');
 if(first.trim().startsWith('>')){
  let rec;
  lines.forEach((line,i)=>{if(!line.trim())return;if(line.trim().startsWith('>')){rec={name:line.trim().slice(1).trim(),sequence:'',line:i+1};records.push(rec);}else{if(!rec)throw Error(`${i+1}행: FASTA 이름이 필요합니다.`);rec.sequence+=line;}});
 }else{
  lines.forEach((line,i)=>{if(!line.trim())return;const m=line.trim().match(/^(\S+)\s+(.+)$/);if(!m)throw Error(`${i+1}행: 이름과 서열을 공백 또는 탭으로 나누세요.`);records.push({name:m[1],sequence:m[2],line:i+1});});
 }
 if(records.length>LIMITS.oligos)throw Error(`최대 ${LIMITS.oligos}개 oligo까지 입력할 수 있습니다.`);
 const names=new Set();let normalized=0;
 for(const rec of records){if(!rec.name||rec.name.length>100)throw Error(`${rec.line}행: 이름은 1–100자여야 합니다.`);if(names.has(rec.name))throw Error(`${rec.line}행: 이름 “${rec.name}”이 중복되었습니다. 서로 다른 이름을 사용하세요.`);names.add(rec.name);const s=rec.sequence.replace(/\s/g,'').toUpperCase();if(s!==rec.sequence)normalized++;if(!/^[ACGT]+$/.test(s))throw Error(`${rec.line}행 ${rec.name}: A/C/G/T DNA만 지원합니다. 혼합염기·U·수정 표기는 지원하지 않습니다.`);if(s.length<3||s.length>LIMITS.length)throw Error(`${rec.line}행 ${rec.name}: 서열 길이는 3–${LIMITS.length} nt여야 합니다.`);rec.sequence=s;}
 return {records,normalized};
}

function alignment(top,bottom,offset){const t=Math.max(0,-offset),b=Math.max(0,offset),rev=reverse(bottom),matches=[];for(let i=0;i<top.length;i++){let j=t+i-b;if(j>=0&&j<rev.length&&COMP[top[i]]===rev[j])matches.push(i);}return {top,bottom,topIndent:t,bottomIndent:b,matches};}
function runsOf(matches){const runs=[];for(const i of matches){if(!runs.length||runs.at(-1).at(-1)+1!==i)runs.push([]);runs.at(-1).push(i);}return runs;}
function enrich(al,mode){
 const eligible=runsOf(al.matches).filter(r=>r.length>=2);let segment;
 for(const run of eligible){const micros=energyMicros(al.top.slice(run[0],run.at(-1)+1));if(!segment||micros<segment.micros)segment={start:run[0],length:run.length,micros};}
 if(!segment)return null;
 const {top,bottom,topIndent:t,bottomIndent:b,matches}=al,marks=Array(3+Math.max(t+top.length,b+bottom.length)).fill(' '),thermoMarks=Array(2+Math.max(t+top.length,b+bottom.length)).fill(' ');
 for(const i of matches){marks[3+t+i]=(i>=segment.start&&i<segment.start+segment.length)?'|':':';thermoMarks[2+t+i]='|';}
 const matchSet=new Set(matches),top3=matchSet.has(top.length-1),bottom3=matchSet.has(b-t),selectedTop3=segment.start+segment.length===top.length,selectedBottom3=segment.start<=b-t&&b-t<segment.start+segment.length;
 return {...al,segment,deltaGMicros:segment.micros,basePairs:segment.length,totalPairs:matches.length,warning:isWarning(segment.micros),top3,bottom3,selectedTop3,selectedBottom3,
  diagram:[`5' ${' '.repeat(t)}${top}`,marks.join('').trimEnd(),`3' ${' '.repeat(b)}${reverse(bottom)}`],
  thermoDiagram:[`${' '.repeat(t)}5-${top.toLowerCase()}->`,thermoMarks.join('').trimEnd(),`${' '.repeat(b)}<-${reverse(bottom).toLowerCase()}-5`],mode};
}
export function idtDimer(a,b){const rows=[];for(let offset=1-b.length;offset<a.length;offset++){const row=enrich(alignment(a,b,offset),'idt');if(row)rows.push(row);}return rows.sort((x,y)=>x.deltaGMicros-y.deltaGMicros);}

export function thermoDimer(a,b){
 // Thermo sensitivity=3 semantics: a 4-base seed, >=6 paired bases
 // across isolated mismatches, and either >=9 internal or bottom 3' proximity.
 // Seed iteration boundary/order and first accepted offset are retained.
 const top=a.length>=b.length?a:b,bottom=a.length>=b.length?b:a,target=revcomp(bottom),accepted=new Set(),result=[];
 const same=(i,j)=>i>=0&&j>=0&&i<top.length&&j<target.length&&top[i]===target[j];
 for(let j=0;j<target.length-4;j++){
  const seed=target.slice(j,j+4);
  for(let i=top.indexOf(seed);i!==-1;i=top.indexOf(seed,i+1)){
   const offset=i-j;if(accepted.has(offset))continue;
   let count=4,left=0;
   for(const direction of [-1,1]){
    let distance=direction<0?1:4;
    while(true){const x=i+direction*distance,y=j+direction*distance;if(same(x,y)){count++;if(direction<0)left=distance;distance++;}
     else if(x>=0&&y>=0&&x<top.length&&y<target.length&&same(x+direction,y+direction)){count++;distance++;if(direction<0)left=distance;distance++;}
     else break;}
   }
   if(count>=6&&(count>=9||(j-left<2&&i-left>1))){accepted.add(offset);result.push(enrich(alignment(top,bottom,offset),'thermo'));}
  }
 }
 return result.filter(Boolean);
}

export function analyzePair(first,second,mode){if(!['idt','thermo'].includes(mode))throw Error('분석 방식을 확인하세요.');const structures=mode==='thermo'?thermoDimer(first.sequence,second.sequence):idtDimer(first.sequence,second.sequence);return {first:first.name,second:second.name,kind:first===second?'self':'hetero',mode,structures,warning:structures.some(x=>x.warning),minimum:structures.length?Math.min(...structures.map(x=>x.deltaGMicros)):null};}
export function analyzeAll(records,mode){const pairs=[];for(let i=0;i<records.length;i++)pairs.push(analyzePair(records[i],records[i],mode));for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++)pairs.push(analyzePair(records[i],records[j],mode));return pairs;}
export function textReport(records,pairs,mode){let lines=[`Oligo 분석 v${VERSION}`,mode==='thermo'?'Thermo 검출 · sensitivity 3 고정 / ΔG: IDT 기준 로컬 계산':'IDT 기준 로컬 계산','ΔG25: Breslauer propagation / 경고 ΔG ≤ −9 kcal/mol','입력:'];for(const r of records)lines.push(`${r.name}\t${r.sequence}`);for(const p of pairs){lines.push('',`${p.kind==='self'?'Self':'Hetero'}: ${p.first}${p.kind==='self'?'':` × ${p.second}`} · ${p.structures.length}개 구조${p.warning?' · 경고':''}`);if(!p.structures.length)lines.push('이 방식에서 검출 구조 없음');for(const [i,s] of p.structures.entries()){lines.push(`#${i+1} ΔG ${formatDG(s.deltaGMicros)} kcal/mol · 연속 ${s.basePairs} bp · 전체 결합 ${s.totalPairs} bp${s.warning?' · 경고':''}`,`3′ 직접 결합: 상단 ${s.top3?'포함':'없음'} / 하단 ${s.bottom3?'포함':'없음'}`,...(mode==='thermo'?s.thermoDiagram:s.diagram));if(mode==='thermo')lines.push('ΔG에 사용한 연속 구간 (실선; 나머지 상보 점선):',...s.diagram);}}
 lines.push('','일반 DNA A/C/G/T만 지원. 구조·ΔG 예측은 실제 증폭 결과를 판정하지 않습니다.',`검출 참고: ${SOURCES[mode]}`);return lines.join('\n');}
