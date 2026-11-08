// SPDX-License-Identifier: GPL-2.0-or-later
// Reads the first sheet as text cells. Uses the JSZip already shipped with LabTools; formulas are not evaluated.
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',MAX_BYTES=20*1024*1024;
const xml=t=>new DOMParser().parseFromString(t,'application/xml');
const columnOf=ref=>{let n=0;for(const c of ref.replace(/\d+$/,''))n=n*26+c.charCodeAt(0)-64;return n-1;};
export async function readFirstSheet(bytes){
 if(!globalThis.JSZip)throw Error('Excel 읽기 구성요소를 불러오지 못했습니다.');if(bytes.byteLength>MAX_BYTES)throw Error('Excel 파일은 20 MB 이하로 입력하세요.');
 const zip=await JSZip.loadAsync(bytes),read=async n=>{const f=zip.file(n);return f?xml(await f.async('string')):null;};
 const wb=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');if(!wb||!rels)throw Error('Excel 파일 구조를 읽을 수 없습니다.');
 const sheet=wb.getElementsByTagNameNS(NS,'sheet')[0];if(!sheet)throw Error('시트가 없습니다.');
 const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');
 if(!target||target.includes('..'))throw Error('지원하지 않는 시트 경로입니다.');
 const doc=await read(target.startsWith('/')?target.slice(1):'xl/'+target),shared=await read('xl/sharedStrings.xml');
 const strings=shared?[...shared.getElementsByTagNameNS(NS,'si')].map(si=>[...si.getElementsByTagNameNS(NS,'t')].map(t=>t.textContent).join('')):[];
 const rows=[];
 for(const r of doc.getElementsByTagNameNS(NS,'row')){const line=[];for(const c of r.getElementsByTagNameNS(NS,'c')){const type=c.getAttribute('t'),v=c.getElementsByTagNameNS(NS,'v')[0]?.textContent??'',text=type==='s'?strings[+v]??'':type==='inlineStr'?[...c.getElementsByTagNameNS(NS,'t')].map(t=>t.textContent).join(''):v;line[columnOf(c.getAttribute('r')||'A')]=text;}rows.push(Array.from(line,x=>x??''));}
 return rows;
}
