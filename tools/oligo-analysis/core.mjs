import * as d from './dimer.mjs';
export const VERSION='0.2.3';
export const {energyMicros,formatDG,isWarning,idtDimer,thermoDimer,SOURCES,WARNING_MICROS}=d;
export const IUPAC=Object.freeze({A:'A',C:'C',G:'G',T:'T',R:'AG',Y:'CT',S:'CG',W:'AT',K:'GT',M:'AC',B:'CGT',D:'AGT',H:'ACT',V:'ACG',N:'ACGT'});
export const LIMITS=Object.freeze({oligos:20,length:200,characters:20000,variants:1024,pairWork:50000000,pairRows:250000,softWork:4000000,softRows:50000,polyWarningTriples:100,polyWarningWork:200000,polyLength:60,polyTimeMs:30000,polyMemoryBytes:134217728});
export const KINDS=['self','hetero','poly'];
export const LABELS={self:'Self-dimer',hetero:'Hetero-dimer',poly:'Polydimer 후보'};
const comp={A:'T',T:'A',C:'G',G:'C'};
export function variantCount(sequence){let n=1;for(const c of sequence)n*=IUPAC[c].length;return n;}
export function parseInput(raw){
 if(typeof raw!=='string'||raw.length>LIMITS.characters)throw Error(`입력은 ${LIMITS.characters.toLocaleString()}자까지 가능합니다.`);
 const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/),first=lines.find(x=>x.trim());if(!first)throw Error('이름과 DNA 서열을 입력하세요.');let records=[];
 if(first.trim().startsWith('>')){let rec;lines.forEach((line,i)=>{if(!line.trim())return;if(line.trim().startsWith('>')){rec={name:line.trim().slice(1).trim(),sequence:'',line:i+1};records.push(rec);}else{if(!rec)throw Error(`${i+1}행: FASTA 이름이 필요합니다.`);rec.sequence+=line;}});}
 else lines.forEach((line,i)=>{
  if(!line.trim())return;
  if(line.includes('\t')){
   const [name,...cells]=line.split('\t').map(cell=>cell.trim());
   const values=cells.filter(Boolean),[sequence]=values;
   if(!name||values.length!==1)throw Error(`${i+1}행: Excel 붙여넣기는 첫 열에 이름, 그 뒤에 서열 값 하나가 필요합니다. 병합으로 생긴 빈 셀은 무시합니다.`);
   records.push({name,sequence,line:i+1});return;
  }
  const m=line.trim().match(/^(\S+)\s+(.+)$/);
  if(!m)throw Error(`${i+1}행: 이름과 서열을 공백 또는 탭으로 나누세요.`);
  records.push({name:m[1],sequence:m[2],line:i+1});
 });
 if(records.length>LIMITS.oligos)throw Error(`최대 ${LIMITS.oligos}개 oligo까지 입력할 수 있습니다.`);
 let normalized=0;const names=new Set();for(const r of records){if(!r.name||r.name.length>100)throw Error(`${r.line}행: 이름은 1–100자여야 합니다.`);if(names.has(r.name))throw Error(`${r.line}행: 이름 “${r.name}”이 중복되었습니다.`);names.add(r.name);if(/[rdm](?=[ACGTU])/.test(r.sequence))throw Error(`${r.line}행 ${r.name}: RNA·수정 재질 접두어는 지원하지 않습니다. DNA 혼합염기는 대문자로 입력하세요.`);const s=r.sequence.replace(/\s/g,'').toUpperCase();if(s!==r.sequence)normalized++;if(!/^[ACGTRYSWKMBDHVN]+$/.test(s))throw Error(`${r.line}행 ${r.name}: DNA A/C/G/T 및 IUPAC 혼합염기만 지원합니다. U·RNA·수정염기는 지원하지 않습니다.`);if(s.length<3||s.length>LIMITS.length)throw Error(`${r.line}행 ${r.name}: 서열 길이는 3–${LIMITS.length} nt여야 합니다.`);r.sequence=s;r.variants=variantCount(s);}
 return {records,normalized};
}
export function expand(sequence){const count=variantCount(sequence);if(count>LIMITS.variants)throw Error('혼합염기 확장 수가 지원 상한을 넘습니다.');let values=[''];for(const c of sequence)values=values.flatMap(s=>[...IUPAC[c]].map(b=>s+b));return values;}
export function optionsFor(mode,options={}){if(!['idt','thermo'].includes(mode))throw Error('분석 방식을 확인하세요.');return {self:options.self!==false,hetero:options.hetero!==false,poly:mode==='idt'&&options.poly!==false};}
export function preflight(records,mode,options={}){
 const selected=optionsFor(mode,options),modules=Object.fromEntries(KINDS.map(k=>[k,{kind:k,selected:selected[k],pairs:0,work:0,rows:0,reasons:[],warning:false}]));
 const counts=records.map(r=>variantCount(r.sequence)),total=counts.reduce((a,b)=>a+b,0);let pairTotals={work:0,rows:0};
 const add=(k,i,j,n)=>{const a=records[i].sequence.length,b=records[j].sequence.length,m=modules[k];m.pairs+=n;m.work+=n*a*b;m.rows+=n*(a+b-1);};
 for(let i=0;i<records.length;i++){add('self',i,i,counts[i]*(counts[i]+1)/2);for(let j=i+1;j<records.length;j++)add('hetero',i,j,counts[i]*counts[j]);}
 for(const k of ['self','hetero']){const m=modules[k];if(counts.some(n=>n>LIMITS.variants))m.reasons.push(`한 primer의 실제 서열은 최대 ${LIMITS.variants.toLocaleString()}개까지 지원합니다.`);if(m.work>LIMITS.pairWork)m.reasons.push('염기쌍 탐색 작업 상한 초과');if(m.rows>LIMITS.pairRows)m.reasons.push('정렬 결과 보관 예산 상한 초과');m.warning=m.work>LIMITS.softWork||m.rows>LIMITS.softRows;if(m.selected){pairTotals.work+=m.work;pairTotals.rows+=m.rows;}}
 const p=modules.poly;p.pairs=total*(total+1)*(total+2)/6;p.work=p.pairs*3*Math.max(0,...records.map(r=>r.sequence.length))**2;
 if(records.some(r=>r.sequence.length>LIMITS.polyLength))p.reasons.push(`Polydimer는 가닥당 ${LIMITS.polyLength} nt까지 지원합니다.`);if(counts.some(n=>n>LIMITS.variants))p.reasons.push('혼합염기 확장 수 상한 초과');p.warning=p.pairs>LIMITS.polyWarningTriples||p.work>LIMITS.polyWarningWork;
 const reasons=[];if(!records.length)reasons.push('분석할 primer를 하나 이상 선택하세요.');if(!KINDS.some(k=>modules[k].selected))reasons.push('분석 항목을 하나 이상 선택하세요.');
 if(pairTotals.work>LIMITS.pairWork||pairTotals.rows>LIMITS.pairRows)reasons.push('선택한 Self/Hetero 합계가 작업·보관 예산을 넘습니다. 항목 또는 대상 primer를 줄이세요.');
 const blocked=reasons.length>0||KINDS.some(k=>modules[k].selected&&modules[k].reasons.length>0);
 return {modules,totalVariants:total,counts,blocked,reasons,warning:KINDS.some(k=>modules[k].selected&&modules[k].warning),options:selected};
}
export function terminalRuns(row){const matches=new Set(row.matches);let top=0,bottom=0;for(let i=row.top.length-1;matches.has(i);i--)top++;for(let i=row.bottomIndent-row.topIndent;matches.has(i);i++)bottom++;return {top,bottom};}
function concreteRow(row,a,b,mode){const common={top:row.top,bottom:row.bottom,topIndent:row.topIndent,bottomIndent:row.bottomIndent,totalPairs:row.totalPairs,variantFirst:a,variantSecond:b};if(mode==='thermo')return {...common,thermoDiagram:row.thermoDiagram};return {...row,...common,terminal:terminalRuns(row)};}
function pairModule(records,pools,kind,mode,progress){let done=0,rows=0;const result=[];for(let i=0;i<records.length;i++)for(let j=kind==='self'?i:i+1;j<(kind==='self'?i+1:records.length);j++){
  const structures=[];let comparisons=0;for(let a=0;a<pools[i].length;a++)for(let b=i===j?a:0;b<pools[j].length;b++){const x=pools[i][a],y=pools[j][b];for(const row of (mode==='thermo'?d.thermoDimer(x,y):d.idtDimer(x,y))){structures.push(concreteRow(row,x,y,mode));if(++rows>LIMITS.pairRows)throw Error('결과 보관 상한에 도달했습니다. 대상 primer 또는 항목을 줄이세요.');}comparisons++;}
  if(mode==='idt')structures.sort((a,b)=>a.deltaGMicros-b.deltaGMicros);result.push({kind,first:records[i].name,second:records[j].name,mode,structures,comparisons,minimum:mode==='idt'&&structures.length?structures[0].deltaGMicros:null});progress?.({kind,done:++done});
 }return result;}
// Every contiguous complementary sub-helix, including trimmed alternatives.
export function helices(a,b){const result=[];for(let off=1-b.length;off<a.length;off++){let start=-1;const flush=end=>{if(start<0)return;for(let x=start;x<end;x++)for(let y=x+1;y<=end;y++){const length=y-x+1;result.push({aStart:x,bStart:b.length-1-(y-off),length,micros:d.energyMicros(a.slice(x,y+1))});}start=-1;};for(let x=0;x<a.length;x++){const j=b.length-1-(x-off),match=j>=0&&j<b.length&&comp[a[x]]===b[j];if(match){if(start<0)start=x;}else flush(x-1);}flush(a.length-1);}return result;}
export const disjoint=(a,b)=>a.aStart+a.length<=b.aStart||b.aStart+b.length<=a.aStart;
// Prefix trees index endpoints and starts. Each query counts compatible contacts
// and retrieves the minimum energy contact, with the original order as tie-break.
function contactIndex(rows,length){
 const size=length+2,trees=Array.from({length:4},()=>({counts:new Float64Array(size),best:new Int32Array(size).fill(-1),first:new Int32Array(size).fill(-1)}));
 const better=(a,b)=>a<0?b:b<0?a:rows[a].micros<rows[b].micros||(rows[a].micros===rows[b].micros&&a<b)?a:b;
 const insert=id=>{const h=rows[id],type=d.isWarning(h.micros)?0:1;for(const [tree,position] of [[trees[type*2],h.aStart+h.length+1],[trees[type*2+1],length-h.aStart+1]])for(let p=position;p<size;p+=p&-p){tree.counts[p]++;tree.best[p]=better(tree.best[p],id);tree.first[p]=tree.first[p]<0?id:Math.min(tree.first[p],id);}};
 const side=(tree,position)=>{let count=0,best=-1,first=-1;for(let p=Math.min(position,size-1);p>0;p-=p&-p){count+=tree.counts[p];best=better(best,tree.best[p]);if(tree.first[p]>=0)first=first<0?tree.first[p]:Math.min(first,tree.first[p]);}return {count,best,first};};
 const query=(h,type)=>{const before=side(trees[type*2],h.aStart+1),after=side(trees[type*2+1],length-h.aStart-h.length+1);return {count:before.count+after.count,best:better(before.best,after.best),first:before.first<0?after.first:after.first<0?before.first:Math.min(before.first,after.first)};};
 return {insert,query,bytes:trees.reduce((n,t)=>n+t.counts.byteLength+t.best.byteLength+t.first.byteLength,0)};
}
export function polyModule(records,pools,progress,budget={}){
 const now=budget.now||(()=>performance.now()),started=now(),timeLimit=budget.timeMs??LIMITS.polyTimeMs,memoryLimit=budget.memoryBytes??LIMITS.polyMemoryBytes;
 const variants=pools.flatMap((pool,i)=>pool.map(sequence=>({name:records[i].name,sequence,parent:i}))),cache=new Map(),combinations=new Map(),groups=new Map();
 const total=variants.length*(variants.length+1)*(variants.length+2)/6;let comparisons=0,queries=0,helixCount=0,triples=0,cacheBytes=0,lastProgress=started;
 const check=()=>{const current=now();if(current-started>timeLimit)throw Error(`Polydimer가 실행 시간 ${timeLimit/1000}초 상한에 도달했습니다. 부분 후보는 출력하지 않습니다. 대상을 줄이거나 Polydimer를 제외하세요.`);if(cacheBytes>memoryLimit)throw Error('Polydimer 계산 자료의 추정 보관량 상한에 도달했습니다. 부분 후보는 출력하지 않습니다. 대상을 줄이거나 Polydimer를 제외하세요.');if(current-lastProgress>=150){progress?.({kind:'poly',done:triples,total,elapsedMs:current-started,cacheBytes});lastProgress=current;}};
 const contacts=(i,j)=>{const a=variants[i].sequence,b=variants[j].sequence,key=a+'/'+b;if(!cache.has(key)){check();const rows=helices(a,b),index=contactIndex(rows,a.length);rows.forEach((_,id)=>index.insert(id));helixCount+=rows.length;cacheBytes+=rows.length*160+index.bytes+key.length*2+128;check();cache.set(key,{rows,index});}return cache.get(key);};
 const combine=(left,right,length,same)=>{
  const counts={strong:0,mixed:0},best={},firsts={};
  // Identical outer molecules use the suffix of original contact order, so each
  // unordered placement is counted once. Other pairs use an immutable full index.
  const index=same?contactIndex(right.rows,length):right.index;
  const consider=(a,x,result,category)=>{counts[category]+=result.count;if(result.best<0)return;firsts[category]=Math.min(firsts[category]??Infinity,x*(right.rows.length+1)+result.first);const y=result.best,b=right.rows[y],scoreMicros=a.micros+b.micros,prev=best[category];if(!prev||scoreMicros<prev.scoreMicros||(scoreMicros===prev.scoreMicros&&(x<prev.x||(x===prev.x&&y<prev.y))))best[category]={category,scoreMicros,edges:[a,b],x,y};};
  for(let step=0;step<left.rows.length;step++){
   const x=same?left.rows.length-1-step:step,a=left.rows[x];if(same)index.insert(x);
   consider(a,x,index.query(a,0),d.isWarning(a.micros)?'strong':'mixed');consider(a,x,index.query(a,1),'mixed');queries+=2;
   if((step&255)===0)check();
  }
  for(const value of Object.values(best)){delete value.x;delete value.y;}
  return {counts,best:Object.fromEntries(Object.keys(best).sort((a,b)=>firsts[a]-firsts[b]).map(k=>[k,best[k]])),comparisons:same?left.rows.length*(left.rows.length+1)/2:left.rows.length*right.rows.length};
 };
 for(let i=0;i<variants.length;i++)for(let j=i;j<variants.length;j++)for(let k=j;k<variants.length;k++){
  check();const ids=[i,j,k],molecules=ids.map(id=>variants[id]),key=molecules.map(v=>v.parent).join('/');let group=groups.get(key);
  if(!group){group={kind:'poly',first:molecules.map(v=>v.name).join(' × '),second:'',mode:'poly',structures:[],comparisons:0,counts:{strong:0,mixed:0},best:{},variantTriples:0};groups.set(key,group);cacheBytes+=1024;check();}group.variantTriples++;
  for(let central=0;central<3;central++){
   if(ids.slice(0,central).includes(ids[central]))continue;
   const others=[0,1,2].filter(x=>x!==central),c=ids[central],a=ids[others[0]],b=ids[others[1]],same=a===b,combinationKey=[variants[c].sequence,variants[a].sequence,variants[b].sequence,same?'same':'distinct'].join('/');
   if(!combinations.has(combinationKey)){const result=combine(contacts(c,a),contacts(c,b),variants[c].sequence.length,same);combinations.set(combinationKey,result);cacheBytes+=combinationKey.length*2+512;check();}
   const result=combinations.get(combinationKey);comparisons+=result.comparisons;group.comparisons+=result.comparisons;
   for(const category of ['strong','mixed'])group.counts[category]+=result.counts[category];
   for(const category of Object.keys(result.best)){const candidate=result.best[category];if(candidate&&(!group.best[category]||candidate.scoreMicros<group.best[category].scoreMicros))group.best[category]={...candidate,molecules,central,others};}
  }triples++;
 }
 for(const group of groups.values()){group.structures=Object.values(group.best).sort((a,b)=>a.scoreMicros-b.scoreMicros);delete group.best;group.minimum=group.structures.length?group.structures[0].scoreMicros:null;}
 const elapsedMs=now()-started;progress?.({kind:'poly',done:triples,total,elapsedMs,cacheBytes});
 return {pairs:[...groups.values()],stats:{comparisons,queries,helixCount,triples,elapsedMs,cacheBytes}};
}

export function runAnalysis(records,mode,options={},progress){const plan=preflight(records,mode,options);if(plan.blocked)throw Error('선택한 분석 범위가 지원 상한을 넘습니다. 계산량 확인에서 범위를 줄이세요.');const pools=records.map(r=>expand(r.sequence)),pairs=[],modules={};for(const kind of KINDS){if(!plan.options[kind]){modules[kind]={state:'skipped',reason:mode==='thermo'&&kind==='poly'?'Thermo 원본 범위 밖':'사용자 제외'};continue;}try{if(kind==='poly'){const p=polyModule(records,pools,progress);pairs.push(...p.pairs);modules[kind]={state:'complete',stats:p.stats};}else{pairs.push(...pairModule(records,pools,kind,mode,progress));modules[kind]={state:'complete'};}}catch(error){modules[kind]={state:'limited',reason:error.message};}}return {pairs,modules,plan};}
export function parseCutoff(raw){if(String(raw).trim()==='')return null;const n=Number(raw);if(!Number.isFinite(n)||n>0||n< -1000)throw Error('cut-off는 −1000~0 범위의 숫자 또는 공란(전체)으로 입력하세요.');return n*1000000;}
export const POLY_CATEGORIES=Object.freeze({all:'전체 범주',strong:'각 구간 모두 ≤ −9',mixed:'약한 구간 포함·강약 혼합'});
export function polyCategoryLabel(value='all'){if(!Object.hasOwn(POLY_CATEGORIES,value))throw Error('Polydimer 표시 범주를 확인하세요.');return POLY_CATEGORIES[value];}
export function visibleStructures(pair,filters={}){if(pair.mode==='thermo')return pair.structures;if(pair.kind==='poly'){const category=filters.polyCategory??'all';polyCategoryLabel(category);return pair.structures.filter(s=>(category==='all'||s.category===category)&&(filters.polyCutoff==null||s.scoreMicros<=filters.polyCutoff));}const cut=filters.cutoff;if(cut==null)return pair.structures;return pair.structures.filter(s=>s.deltaGMicros<=cut||(filters.terminal&&(s.terminal.top>=3||s.terminal.bottom>=3)));}
export function filteredPairs(pairs,filters){return pairs.flatMap(p=>{const structures=visibleStructures(p,filters);return structures.length?[{...p,structures,allStructures:p.structures.length}]:[];});}
export function polyLines(s){const labels=s.molecules.map((m,i)=>`${i+1}. ${m.name}: ${m.sequence} (5′→3′)`),c=s.central;for(let i=0;i<2;i++){const edge=s.edges[i],o=s.others[i];labels.push(`${c+1}번 ${edge.aStart+1}–${edge.aStart+edge.length} ↔ ${o+1}번 ${edge.bStart+1}–${edge.bStart+edge.length} (역평행) · ${edge.length} bp · 구간 점수 ${d.formatDG(edge.micros)}`);}return labels;}
export function reportBlocks(records,pairs,mode,meta={}){
 const f=meta.filters||{},blocks=[],text=(...lines)=>blocks.push({kind:'text',lines}),sequence=(...lines)=>blocks.push({kind:'sequence',lines});
 const selected=meta.selected===true,pair=selected?pairs[0]:null;
 if(selected){const names=new Set(pair?.kind==='poly'?pair.structures[0]?.molecules.map(m=>m.name):[pair?.first,pair?.second]);records=records.filter(r=>names.has(r.name));}
 const pairFilter=`현재 표시: ΔG ${f.cutoff==null?'전체':'≤ '+f.cutoff/1e6+' kcal/mol'}${f.cutoff!=null&&f.terminal?' 또는 3′ 말단 연속 ≥3 bp':''}`;
 const polyFilter=`Polydimer 탐색 범주: ${polyCategoryLabel(f.polyCategory)} · 점수 합 검색: ${f.polyCutoff==null?'제한 없음':'≤ '+f.polyCutoff/1e6} · 조합/범주별 최저 점수 요약 · 실제 복합체 ΔG 아님`;
 text(`Oligo-dimer analysis v${VERSION}`,mode==='thermo'?'Thermo 검출 · optimal sensitivity 3 고정 · 원본 도식':'IDT 관측값 대조 모델 · 로컬 ΔG25');
 if(!selected)text(`분석 대상 ${records.length}종${meta.excluded?.length?' · 미선택: '+meta.excluded.join(', '):''}`);
 if(!selected)for(const kind of KINDS){const m=meta.modules?.[kind];if(m)text(`${LABELS[kind]}: ${m.state==='complete'?'완료':m.state==='skipped'?'미실행':'미완료'}${m.reason?' · '+m.reason:''}`);}
 if(mode==='idt'){
  if(selected)text(pair?.kind==='poly'?polyFilter:pairFilter);
  else text(pairFilter,polyFilter,'붉은 경고: IDT 권고 참고 · 로컬 dimer ΔG ≤ −9','3′ 말단 연속 ≥3 bp: 사용자 요청 로컬 보조 표시 조건 · IDT 공식 수치 기준 아님');
 }
 blocks.push({kind:'section',lines:[selected?'해당 조합 입력:':'입력:']});for(const r of records)blocks.push({kind:'input',lines:[`${r.name}\t${r.sequence}\t실제 서열 ${variantCount(r.sequence)}개`],cells:[r.name,r.sequence,`실제 서열 ${variantCount(r.sequence)}개`]});
 let count=0;
 const groups=meta.grouped?KINDS.filter(k=>meta.modules?.[k]?.state==='complete'||pairs.some(p=>p.kind===k)):[''];
 for(const kind of groups){
  const subset=kind?pairs.filter(p=>p.kind===kind&&p.structures.length):pairs;
  if(kind){text('');blocks.push({kind:'section',lines:[LABELS[kind]]});if(!subset.length)text('현재 표시할 구조 없음');}
  for(const p of subset){if(!p.structures.length)continue;count++;text('');blocks.push({kind:'pair',lines:[`${LABELS[p.kind]}: ${p.first}${p.kind==='hetero'?' × '+p.second:''} · 표시 ${p.structures.length}/${p.allStructures??p.structures.length}개`]});for(const [i,s] of p.structures.entries()){if(p.kind==='poly'){text(`#${i+1} ${s.category==='strong'?'각 구간 강함':'개별 약함/강약 혼합'} · 구간 점수 합 ${d.formatDG(s.scoreMicros)} (실제 복합체 ΔG 아님)`);const lines=polyLines(s);sequence(...lines.slice(0,3));text(...lines.slice(3));}else{if(mode==='thermo')text(`#${i+1} 전체 상보 ${s.totalPairs} bp`);else blocks.push({kind:d.isWarning(s.deltaGMicros)?'warning':'text',lines:[`#${i+1} ΔG ${d.formatDG(s.deltaGMicros)} kcal/mol${d.isWarning(s.deltaGMicros)?' · 경고':''}`]});sequence(`실제 서열: ${s.variantFirst} / ${s.variantSecond}`);if(mode==='idt')text(`3′ 말단 연속: 상단 ${s.terminal.top} / 하단 ${s.terminal.bottom} bp`);blocks.push({kind:'diagram',lines:mode==='thermo'?s.thermoDiagram:s.diagram});}}}
 }
 if(selected)return blocks;
 if(!count)text('현재 표시할 결합 구조 없음 · 분석 항목의 완료/미실행/미완료 상태와 표시 조건을 확인하세요.');
 text('','DNA IUPAC 전수 확장. 가능한 결합 후보이며 발생확률/실제 증폭 판정이 아닙니다.');if(mode==='idt'&&meta.modules?.poly?.state!=='skipped')text('Polydimer: 탐색적 3분자·두 비겹침 결합 구간 후보. 구간 점수 합과 각 구간 ≤−9는 실제 복합체 안정성·협동성·형성량의 판정 기준이 아닙니다. loop/접합부/가닥 결합 비용·3D·전체 복합체 에너지는 계산하지 않습니다.');
 text(`검출 참고: ${SOURCES[mode]}`);return blocks;
}
export function textReport(records,pairs,mode,meta={}){return reportBlocks(records,pairs,mode,meta).flatMap(b=>b.lines).join('\n');}
const escapeHTML=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function excelRows(records,pairs,mode,meta={}){
 // One physical Excel row per line, always in the same unmerged column.
 // Avoid imported in-cell breaks and spacerun spans: Excel can defer their layout
 // until cell editing. Literal NBSP preserves fixed-width diagram columns.
 return reportBlocks(records,pairs,mode,meta).flatMap(b=>{
  if(b.kind==='input')return [{text:`${b.cells[0]} · ${b.cells[2]}`,mono:false},{text:b.cells[1],mono:true}];
  return b.lines.flatMap(text=>{const strands=b.kind==='sequence'&&text.match(/^실제 서열: ([ACGT]+) \/ ([ACGT]+)$/);return (strands?[`실제 서열 1: ${strands[1]}`,`실제 서열 2: ${strands[2]}`]:[text]).map(text=>({text,mono:b.kind==='diagram'||b.kind==='sequence',kind:b.kind}));});
 });
}
export function excelReport(records,pairs,mode,meta={}){
 const lines=excelRows(records,pairs,mode,meta);
 const width=Math.ceil(lines.reduce((max,line)=>Math.max(max,line.text.length*(line.mono?7.2:12)+16),720));
 const rows=lines.map(({text,mono})=>`<tr height="21" style="height:16pt;mso-height-source:userset"><td height="21" style="height:16pt;font-family:'${mono?'Courier New':'Malgun Gothic'}';font-size:9pt;vertical-align:top;text-align:left;white-space:nowrap;mso-number-format:'\\@';padding:1pt 2pt">${(mono?escapeHTML(text).replace(/ /g,'&nbsp;'):escapeHTML(text))||'&nbsp;'}</td></tr>`);
 return '<!doctype html><html lang="ko" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body style="font-family:\'Malgun Gothic\';font-size:9pt"><!--StartFragment--><table width="'+width+'" style="border-collapse:collapse;font-family:\'Malgun Gothic\';font-size:9pt"><colgroup><col width="'+width+'"></colgroup>'+rows.join('')+'</table><!--EndFragment--></body></html>';
}
