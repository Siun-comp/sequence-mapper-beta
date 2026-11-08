// SPDX-License-Identifier: GPL-2.0-or-later
// Reads the FEATURES block of a GenBank record for display. The original text stays untouched for export.
export const HIDDEN_BY_DEFAULT=new Set(['source']);
const LABEL_KEYS=['label','gene','product','locus_tag','standard_name','note'];

function splitTop(s){const out=[];let depth=0,from=0;for(let i=0;i<s.length;i++){const c=s[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&!depth){out.push(s.slice(from,i));from=i+1;}}out.push(s.slice(from));return out;}
// Returns ranges in the order written, 0-based half-open, or null for forms that have no place on this record.
function ranges(loc,length,flip){
 const m=/^(complement|join|order)\((.*)\)$/.exec(loc);
 if(m){if(m[1]==='complement')return ranges(m[2],length,!flip);
  const all=[];for(const part of splitTop(m[2])){const r=ranges(part.trim(),length,flip);if(!r)return null;all.push(...r);}return all;}
 const span=/^<?(\d+)(?:\.\.>?(\d+))?$/.exec(loc)??/^(\d+)\.(\d+)$/.exec(loc);if(!span)return null;
 const a=Number(span[1]),b=Number(span[2]??span[1]);if(a<1||b<1||a>length||b>length)return null;
 // A start past the end is how some tools write a feature across the origin.
 const list=a<=b?[{start:a-1,end:b}]:[{start:a-1,end:length},{start:0,end:b}];
 return list.map(x=>({...x,flip}));
}
export function parseLocation(text,length){
 const loc=text.replace(/\s+/g,''),r=ranges(loc,length,false);if(!r?.length)return null;
 const strand=r.every(x=>x.flip)?-1:r.every(x=>!x.flip)?1:0;
 return {ranges:r.map(({start,end})=>({start,end})),strand};
}
export function parseFeatures(text,length){
 const list=[];let skipped=0;if(!text)return {list,skipped};
 let cur=null,key=null;
 const close=()=>{if(!cur)return;const place=parseLocation(cur.location,length);if(!place){skipped++;cur=null;return;}
  let label=cur.type;for(const k of LABEL_KEYS)if(cur.q[k]){label=cur.q[k].replace(/\s+/g,' ').trim();break;}
  list.push({id:'f'+list.length,type:cur.type,label:label.length>60?label.slice(0,60)+'…':label,...place});cur=null;};
 for(const line of text.split('\n')){
  if(line.startsWith('FEATURES'))continue;
  if(/^ {5}\S/.test(line)){close();cur={type:line.slice(5,21).trim(),location:line.slice(21).trim(),q:{}};key=null;continue;}
  if(!cur||!/^ {21}/.test(line))continue;
  const body=line.slice(21).trim();
  if(body.startsWith('/')){const m=/^\/([^=]+)(?:=(.*))?$/.exec(body);key=m?m[1]:null;if(key)cur.q[key]=(m[2]??'').replace(/^"/,'').replace(/"$/,'');}
  else if(key)cur.q[key]+=' '+body.replace(/"$/,'');
  else cur.location+=body;
 }
 close();return {list,skipped};
}
export function featureTypes(list){const c=new Map();for(const f of list)c.set(f.type,(c.get(f.type)||0)+1);return [...c].map(([type,count])=>({type,count,visible:!HIDDEN_BY_DEFAULT.has(type)})).sort((a,b)=>a.type<b.type?-1:1);}
