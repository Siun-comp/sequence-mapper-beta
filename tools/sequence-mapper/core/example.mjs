// SPDX-License-Identifier: GPL-2.0-or-later
// Synthetic example only. Sequences are random and match no real organism.
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const B='ACGT',COMP={A:'T',C:'G',G:'C',T:'A',N:'N'};
export function exampleFiles(count=400){
 const r=rng(20261106);let ref='';for(let i=0;i<1400;i++)ref+=B[r()*4|0];
 const mutate=(s,n)=>{const a=[...s];for(let i=0;i<n;i++){const p=r()*a.length|0;a[p]=B[r()*4|0];}return a.join('');};
 const groups=[0,1,2,3].map(()=>mutate(ref,20+(r()*30|0))),out=[];
 for(let i=0;i<count;i++){let s=mutate(groups[r()*4|0],r()*4|0);const x=r();
  if(x<.06){const p=200+(r()*800|0);s=s.slice(0,p)+s.slice(p+3);}
  else if(x<.10){const p=200+(r()*800|0);s=s.slice(0,p)+'GAT'+s.slice(p);}
  else if(x<.20){const l=300+(r()*700|0),p=r()*(s.length-l)|0;s=s.slice(p,p+l);}
  else if(x<.24){const p=r()*(s.length-40)|0;s=s.slice(0,p)+'N'.repeat(20)+s.slice(p+20);}
  if(r()<.1)s=[...s].reverse().map(c=>COMP[c]).join('');
  out.push(`>SYN${String(i+1).padStart(4,'0')}.1 합성 예제 서열 ${i+1}\n${s}\n`);}
 out.push(`>SYN_UNRELATED.1 합성 예제: 상관없는 서열\n${Array.from({length:600},()=>B[r()*4|0]).join('')}\n`);
 return {reference:new File([`>SYN_REF.1 합성 예제 reference\n${ref}\n`],'합성예제_reference.fasta'),queries:[new File(out,'합성예제_query.fasta')]};
}
