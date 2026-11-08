// SPDX-License-Identifier: GPL-2.0-or-later
// Support range from measured stage-0 results (docs/240). Bases, not record counts, drive cost.
export const LIMITS=Object.freeze({recommendedBases:400e6,maxBases:800e6,maxReferenceLength:30000,minReferenceLength:50,maxAlignedCells:1.2e9,maxSingleLength:200000});
const MEASURED_BASES_PER_SECOND=[7e6,14e6],WORST_CASE_FACTOR=3.5;

export function estimateSeconds(bases){
 return {fastest:bases/MEASURED_BASES_PER_SECOND[1],typical:bases/MEASURED_BASES_PER_SECOND[0],slowest:bases/MEASURED_BASES_PER_SECOND[0]*WORST_CASE_FACTOR};
}
export function judge({totalBases,referenceLength=null}){
 const messages=[];let level='ok';
 if(referenceLength!==null&&referenceLength>LIMITS.maxReferenceLength){level='blocked';messages.push(`Reference가 ${referenceLength.toLocaleString()} nt입니다. 지원 상한은 ${LIMITS.maxReferenceLength.toLocaleString()} nt입니다.`);}
 if(referenceLength!==null&&referenceLength<LIMITS.minReferenceLength){level='blocked';messages.push(`Reference가 너무 짧습니다. 최소 ${LIMITS.minReferenceLength} nt가 필요합니다.`);}
 if(totalBases>LIMITS.maxBases){level='blocked';messages.push(`총 염기 수가 ${formatBases(totalBases)}입니다. 지원 상한은 ${formatBases(LIMITS.maxBases)}입니다.`);}
 else if(totalBases>LIMITS.recommendedBases&&level==='ok'){level='caution';messages.push(`총 염기 수가 권장 범위(${formatBases(LIMITS.recommendedBases)})를 넘습니다. 시간이 오래 걸리고 PC에 따라 멈출 수 있습니다.`);}
 return {level,messages,estimate:estimateSeconds(totalBases)};
}
export function judgeAligned({rows,columns}){
 const cells=rows*columns;
 if(cells>LIMITS.maxAlignedCells)return {level:'blocked',messages:[`정렬 파일이 ${rows.toLocaleString()}행 × ${columns.toLocaleString()}열입니다. 지원 상한(${formatBases(LIMITS.maxAlignedCells)} 칸)을 넘습니다.`]};
 return {level:'ok',messages:[]};
}
// Share of reference positions whose k-mer appears several times. Tandem repeats made mapping 40-1000x slower in stage-4 tests.
export function repeatShare(ref,k=11,copies=4){
 if(ref.length<k)return 0;const seen=new Map();let key='';const words=[];for(let i=0;i<ref.length;i++){key=(key+String.fromCharCode(ref[i])).slice(-k);if(key.length===k){words.push(key);seen.set(key,(seen.get(key)||0)+1);}}
 let hit=0;for(const w of words)if(seen.get(w)>=copies)hit++;return hit/words.length;
}
export const REPEAT_WARNING_SHARE=.2;
export function formatBases(n){
 if(n>=1e9)return (n/1e9).toFixed(2)+' Gb';if(n>=1e6)return (n/1e6).toFixed(n>=1e8?0:1)+' Mb';if(n>=1e3)return (n/1e3).toFixed(1)+' kb';return n+' nt';
}
export function formatBytes(n){if(n>=1e9)return (n/1e9).toFixed(2)+' GB';if(n>=1e6)return (n/1e6).toFixed(1)+' MB';if(n>=1e3)return (n/1e3).toFixed(1)+' KB';return n+' B';}
export function formatDuration(seconds){
 if(seconds<60)return Math.max(1,Math.round(seconds))+'초';const m=Math.floor(seconds/60),s=Math.round(seconds-m*60);return s?`${m}분 ${s}초`:`${m}분`;
}
export const BLOCKED_ADVICE=['목록에서 조건이나 체크로 서열 수를 줄이세요.','Geneious에서 설계 구간만 잘라(crop) 가져오면 총 염기 수가 크게 줄어듭니다.','Geneious에서 이미 정렬했다면 Aligned FASTA로 내보내 "정렬 파일 읽기"를 사용하세요.'];
