/* PAKKOM_SKU_IDENTITY_GUARD_V4_BEGIN
   Resolve identity across ALL loaded dates before filtering. A missing WB ID is
   not a new product. Exact normalized titles and explicit spelling aliases are
   linked to a unique known ID. Keep sizes, colours and pack quantities intact.
   Never change source rows or financial amounts in this display/identity layer.
*/
const APPROVED_SKU_IDS=Object.freeze({
 'пакеты рулон 30х40 100 шт бел пищевые':'1721217247',
 'пакеты крафт 195х90х340 v-дно 50 шт':'1556365321'
});
const SKU_NAME_ALIASES=Object.freeze({
 'скатерти 110х140 2 шт зелен бел':'скатерти 110х140 2 шт зел бел',
 'скатерти 110х140 2 шт синяя бел':'скатерти 110х140 2 шт син бел'
});
function canonicalNmId(value){
 if(typeof value==='number'&&!Number.isSafeInteger(value))return '';
 const match=/^([0-9]+)(?:\.0+)?$/.exec(String(value??'').trim());
 if(!match)return '';
 const id=match[1].replace(/^0+(?=\d)/,'');
 return id==='0'?'':id;
}
function normalizeSkuSearch(value){
 return String(value??'').normalize('NFKC').toLowerCase()
  .replace(/[\u200b-\u200d\ufeff]/g,'').replace(/ё/g,'е')
  .replace(/[‐‑‒–—−]/g,'-')
  .replace(/(\d)\s*[xх×*]\s*(?=\d)/g,'$1х')
  .replace(/(\d)\s*(штук|шт\.?|мл|см|мм)(?=\s|$)/g,(_,a,b)=>a+' '+(/^шт/.test(b)?'шт':b))
  .replace(/\s+/g,' ').trim();
}
function normalizeSkuName(value){
 const name=normalizeSkuSearch(value);
 return SKU_NAME_ALIASES[name]||name;
}
function sourceSkuName(row){
 const name=String(row.sku??'').trim(),key=String(row.skuKey??'').trim();
 return name||(/^NAME:/i.test(key)?key.slice(5):'');
}
function explicitSkuId(row){
 const supplied=String(row.skuKey??'').trim();
 const a=canonicalNmId(row.nmId);
 const b=canonicalNmId(/^NMID:/i.test(supplied)?supplied.slice(5):supplied);
 if(a&&b&&a!==b)throw new Error('Conflicting WB IDs: '+a+' / '+b);
 return a||b;
}
function createSkuIdentity(rows){
 const byName=new Map(),info=new Map(),cache=new WeakMap();
 function add(name,id){
  if(!name||!id)return;
  if(!byName.has(name))byName.set(name,new Set());
  byName.get(name).add(id);
 }
 Object.entries(APPROVED_SKU_IDS).forEach(([name,id])=>add(normalizeSkuName(name),id));
 rows.forEach(row=>add(normalizeSkuName(sourceSkuName(row)),explicitSkuId(row)));
 function key(row){
  const hit=cache.get(row);
  if(hit&&hit.nmId===row.nmId&&hit.skuKey===row.skuKey&&hit.sku===row.sku)return hit.key;
  const name=normalizeSkuName(sourceSkuName(row));
  let id=explicitSkuId(row);
  if(!id){
   const ids=byName.get(name);
   if(ids&&ids.size>1)throw new Error('Ambiguous product name: '+name);
   if(ids&&ids.size===1)id=ids.values().next().value;
  }
  if(!id&&!name)throw new Error('SKU has neither a product name nor WB ID');
  const result=id?'NMID:'+id:'NAME:'+name;
  cache.set(row,{nmId:row.nmId,skuKey:row.skuKey,sku:row.sku,key:result});
  return result;
 }
 rows.forEach(row=>{
  const k=key(row),name=sourceSkuName(row),iso=String(row.iso??'');
  if(!info.has(k))info.set(k,{key:k,nmId:k.startsWith('NMID:')?k.slice(5):'',sku:name,iso,names:new Set()});
  const meta=info.get(k);
  if(name){meta.names.add(normalizeSkuSearch(name));meta.names.add(normalizeSkuName(name));}
  if(name&&iso>=meta.iso){meta.sku=name;meta.iso=iso;}
 });
 info.forEach(meta=>{meta.search=normalizeSkuSearch([...meta.names,meta.nmId,meta.key].join(' '));});
 let previousQuery=null,needle='';
 function matches(row,query){
  if(query!==previousQuery){
   const text=normalizeSkuSearch(query);
   needle=canonicalNmId(text)||normalizeSkuName(text);
   previousQuery=query;
  }
  const meta=info.get(key(row));
  const haystack=meta?meta.search:normalizeSkuSearch(sourceSkuName(row)+' '+key(row));
  return haystack.includes(needle);
 }
 function meta(row){
  const k=key(row),m=info.get(k);
  return {sku:m?m.sku:sourceSkuName(row),nmId:k.startsWith('NMID:')?k.slice(5):''};
 }
 return {key,matches,meta,byName};
}
const SKU_IDENTITY=createSkuIdentity(DATA.daily);
function canonicalSkuKey(row){return SKU_IDENTITY.key(row)}
function computeCanonicalSkuKey(row){return canonicalSkuKey(row)}
function skuMetaOf(row){return SKU_IDENTITY.meta(row)}
function matchesSkuSearch(row,query){return SKU_IDENTITY.matches(row,query)}
/* PAKKOM_SKU_IDENTITY_GUARD_V4_END */
