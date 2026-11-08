// SPDX-License-Identifier: GPL-2.0-or-later
export function reverseComplement(s){return [...s].reverse().map(c=>({A:'T',C:'G',G:'C',T:'A'})[c]??'?').join('');}
export function normalize(raw){
 if(raw.length>100000)return {ok:false,error:'원문은 100,000자까지 입력할 수 있습니다.'};
 let name='',body=[],numbered=0,white=0,lower=0,records=0;
 for(const line of raw.split(/\r?\n/)){
  if(/^\s*>/.test(line)){if(records===0&&body.some(s=>s.length))return {ok:false,error:'FASTA 헤더는 서열보다 앞에 있어야 합니다. 일반 서열과 FASTA를 합치지 않습니다.'};records++;name=line.trim().slice(1).trim();continue;}
  let text=line;
  if(/^\s*[1-9]\d*[ \t]+(?=[ACGTacgt])/.test(text)){numbered++;text=text.replace(/^\s*[1-9]\d*[ \t]+/,'');}
  white+=(text.match(/\s/g)||[]).length;lower+=(text.match(/[acgt]/g)||[]).length;body.push(text.replace(/\s/g,''));
 }
 if(records>1)return {ok:false,error:'단일 FASTA record만 지원합니다. 여러 record를 합치지 않습니다.'};
 const seq=body.join('').toUpperCase();
 if(/[^ACGT]/.test(seq))return {ok:false,error:'A/C/G/T 외의 문자·숫자가 있습니다. U·N·수정 표기·gap은 자동 변환하지 않습니다.'};
 if(seq.length>10000)return {ok:false,error:'정규화 서열은 10,000 nt까지 입력할 수 있습니다. 초과분을 자르지 않습니다.'};
 return {ok:true,name,seq,numbered,white,lower,raw};
}
export function selection(n,start,end){
 if(!Number.isInteger(start)||!Number.isInteger(end)||n<1||start<1||end<start||end>n)throw new Error('좌표는 1 ≤ 시작 ≤ 끝 ≤ 전체 길이의 정수여야 합니다.');
 return {start,end,length:end-start+1};
}
export function moveRange(n,s,delta){const offset=Math.max(1-s.start,Math.min(n-s.end,delta));return selection(n,s.start+offset,s.end+offset);}
export function strands(seq,s){return {a:seq.slice(s.start-1,s.end),b:reverseComplement(seq.slice(s.start-1,s.end))};}
