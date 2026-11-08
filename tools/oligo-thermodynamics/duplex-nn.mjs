// SPDX-License-Identifier: GPL-2.0-or-later
// Published DNA_NN4 parameters, SantaLucia & Hicks 2004 (Biopython 1.88).
import {reverseComplement} from './sequence.mjs';
export {reverseComplement} from './sequence.mjs';
export const MODEL='DNA_NN4 / SantaLucia entropy salt / ΔCp=0';
export const MODEL_MG='DNA_NN4 / Owczarzy2008 inverse-Tm / Mg-dNTP Ka=3e4 M^-1';
// Published inverse-Kelvin correction: Owczarzy et al. 2008, DOI 10.1021/bi702363u.
// Independent JS implementation; Biopython 1.88 saltcorr=7 is a validation oracle.
// This corrects Tm only and must not be used to manufacture salt-corrected H/S/G.
export function magnesiumCorrection(seq,monoMm,mgMm,dntpMm){
 const monoM=monoMm*1e-3,totalMgM=mgMm*1e-3,dntpM=dntpMm*1e-3,ka=3e4;
 let freeMgM=totalMgM;
 if(dntpM>0){
  const b=1+ka*(dntpM-totalMgM),root=Math.hypot(b,2*Math.sqrt(ka)*Math.sqrt(totalMgM));
  // Algebraically identical positive root, rationalized to avoid cancellation.
  freeMgM=b>=0?totalMgM*(2/(b+root)):(root-b)/(2*ka);
 }
 if(!Number.isFinite(monoM)||!Number.isFinite(freeMgM)||monoM<0||freeMgM<=0)throw new Error('Mg/dNTP 보정의 양수·유한수 정의역을 벗어났습니다.');
 const ratio=monoM>0?Math.sqrt(freeMgM)/monoM:null;
 if(ratio!==null&&!Number.isFinite(ratio))throw new Error('단가염/Mg 비율이 유한한 수의 범위를 벗어났습니다.');
 const gc=[...seq].filter(x=>x==='G'||x==='C').length/seq.length;
 let correctionInverseK,branch;
 if(ratio!==null&&ratio<.22){
  const lnMono=Math.log(monoM);
  correctionInverseK=(4.29*gc-3.95)*1e-5*lnMono+9.4e-6*lnMono**2;
  branch='monovalent-dominant';
 }else{
  let a=3.92,d=1.42,g=8.31;
  branch='magnesium-dominant';
  if(ratio!==null&&ratio<6){
   const lnMono=Math.log(monoM);
   a=3.92*(.843-.352*Math.sqrt(monoM)*lnMono);
   d=1.42*(1.279-4.03e-3*lnMono-8.03e-3*lnMono**2);
   g=8.31*(.486-.258*lnMono+5.25e-3*lnMono**3);
   branch='mixed';
  }
  const lnMg=Math.log(freeMgM);
  correctionInverseK=(a-.911*lnMg+gc*(6.26+d*lnMg)+(-48.2+52.5*lnMg+g*lnMg**2)/(2*(seq.length-1)))*1e-5;
 }
 if(!Number.isFinite(correctionInverseK))throw new Error('Mg Tm 보정이 유한한 수의 범위를 벗어났습니다.');
 return {model:MODEL_MG,monoM,totalMgM,dntpM,freeMgM,ratio,branch,correctionInverseK,bindingConstantMInverse:ka};
}
export const NN=Object.freeze({
 'AA/TT':[-7.6,-21.3],'AT/TA':[-7.2,-20.4],'TA/AT':[-7.2,-21.3],
 'CA/GT':[-8.5,-22.7],'GT/CA':[-8.4,-22.4],'CT/GA':[-7.8,-21],
 'GA/CT':[-8.2,-22.2],'CG/GC':[-10.6,-27.2],'GC/CG':[-9.8,-24.4],'GG/CC':[-8,-19.9]
});
export function duplex(seq,c){
 if(!/^[ACGT]{2,60}$/.test(seq))throw new Error('계산 서열은 A/C/G/T 2–60 nt여야 합니다.');
 const values=['temperature','na','k','nh4','mg','dntp','a','b'];
 if(values.some(k=>typeof c[k]!=='number'||!Number.isFinite(c[k])))throw new Error('반응 조건에 유한한 수를 입력하세요.');
 if(c.temperature<=-273.15||['na','k','nh4','mg','dntp'].some(k=>c[k]<0)||c.a<=0||c.b<=0)throw new Error('온도·이온·가닥 농도 정의역을 확인하세요.');
 const mono=c.na+c.k+c.nh4;
 if(c.mg===0&&mono<=0)throw new Error('단가염 합계가 0보다 커야 합니다.');
 const rc=reverseComplement(seq),self=rc===seq,terms=[{name:'init',h:.2,s:-5.7}];
 for(const [i,base] of [[0,seq[0]],[seq.length-1,seq.at(-1)]])if(/[AT]/.test(base))terms.push({name:`terminal ${i+1}`,h:2.2,s:6.9});
 const comp=[...seq].map(c=>({A:'T',T:'A',C:'G',G:'C'})[c]).join('');
 for(let i=0;i<seq.length-1;i++){
  const key=seq.slice(i,i+2)+'/'+comp.slice(i,i+2),pair=NN[key]??NN[[...key].reverse().join('')];
  if(!pair)throw new Error('NN 항이 없습니다: '+key);
  terms.push({name:`${i+1}:${key}`,h:pair[0],s:pair[1]});
 }
 if(self)terms.push({name:'symmetry',h:0,s:-1.4});
 if(c.mg>0){
  try{
   const correction=magnesiumCorrection(seq,mono,c.mg,c.dntp);
   const h1M=terms.reduce((a,x)=>a+x.h,0),s1M=terms.reduce((a,x)=>a+x.s,0);
   const effective=(self?c.a+c.b:Math.max(c.a,c.b)-Math.min(c.a,c.b)/2)*1e-9;
   const denominator=s1M+1.987*Math.log(effective),referenceK=1000*h1M/denominator;
   const inverseK=1/referenceK+correction.correctionInverseK,tm=1/inverseK-273.15;
   if(!Number.isFinite(tm)||!Number.isFinite(effective)||effective<=0||denominator>=0||h1M>=0||referenceK<=0||inverseK<=0)throw new Error('이 입력에서 Mg Tm 보정을 해석할 수 없습니다.');
   return {status:'tm-only',tm,self,effectiveConcentrationM:effective,monoM:mono/1000,model:MODEL_MG,tmCorrection:correction,
    reason:'Mg·dNTP를 반영한 Tm만 제공합니다. ΔG°·ΔH°·ΔS°는 미지원입니다.',
    notes:['Owczarzy2008 역수 Kelvin 보정. Mg-dNTP 결합 근사이며 실제 free Mg 측정값이 아닙니다.','제품 길이2~60nt 지원과 실측 정확도 검증은 다릅니다. 특히 짧은 구간의 Tm은 탐색적 근사로 해석하세요.',...(c.k+c.nh4>0?['K/NH4 단가염 합산 근사; 해당 이온별 실측 평가 없음.']:[])]};
  }catch(e){return {status:'unsupported',reason:e.message,model:MODEL_MG};}
 }
 const salt=.368*(seq.length-1)*Math.log(mono/1000);
 terms.push({name:'salt entropy',h:0,s:salt});
 const dh=terms.reduce((a,x)=>a+x.h,0),ds=terms.reduce((a,x)=>a+x.s,0);
 const effective=(self?c.a+c.b:Math.max(c.a,c.b)-Math.min(c.a,c.b)/2)*1e-9;
 const denominator=ds+1.987*Math.log(effective);
 const tm=1000*dh/denominator-273.15,dg=dh-(c.temperature+273.15)*ds/1000;
 if(![tm,dg,dh,ds].every(Number.isFinite)||denominator>=0||dh>=0) return {status:'unsupported',reason:'이 입력에서 두 상태 melting 계산을 해석할 수 없습니다.'};
 return {status:'ok',tm,dg,dh,ds,self,effectiveConcentrationM:effective,monoM:mono/1000,terms,model:MODEL,
  notes:[...(self?['자기상보: A+B 총농도·symmetry 적용. 표지로 구별되는 두 분자의 효과 미지원.']:[]),...(c.k+c.nh4>0?['K/NH4는 단가염 합산 근사; 해당 이온의 실측 평가 없음.']:[]),...(c.dntp>0?['Mg=0 조건에서 dNTP의 독립 효과는 모델에 포함하지 않음.']:[]),'ΔG(T)는 ΔCp=0 모델 환산값이며 결합 분율·반응 속도가 아님.']};
}
