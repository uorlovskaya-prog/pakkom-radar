/* PAKKOM_PROFIT_PERCENT_SORT_V1: code-only correction after normal decryption. */
function applyPakkomProfitPercentSortV1(source){
 const marker='<!-- PAKKOM_PROFIT_PERCENT_SORT_V1 -->';
 if(source.includes(marker))return source;
 const start=source.indexOf('function renderSku(){'),end=source.indexOf('function detail(g){',start);
 if(start<0||end<start)throw Error('Profit percentage sort: table renderer not found');
 let matches=0;
 const table=source.slice(start,end).replace(/\[([^\[\]\n]+)\]\.includes\(k\)/g,(list,items)=>{
  const keys=items.match(/['"]([^'"]+)['"]/g)||[];
  const names=keys.map(k=>k.slice(1,-1));
  if(!names.includes('profit')||!names.includes('roi'))return list;
  matches++;
  return names.includes('margin')?list:'['+items+",'margin'].includes(k)";
 });
 if(matches!==1)throw Error('Profit percentage sort: ambiguous header handler');
 let html=source.slice(0,start)+table+source.slice(end);
 let selects=0;
 html=html.replace(/<select\b[^>]*\bid="fSort"[^>]*>([\s\S]*?)<\/select>/g,(select,options)=>{
  selects++;
  return /\bvalue=["']margin["']/.test(options)?select:select.replace('</select>','<option value="margin">ЧП %</option></select>');
 });
 if(selects!==1)throw Error('Profit percentage sort: sort selector not found');
 return marker+'\n'+html;
}
if(typeof module!=='undefined'&&module.exports)module.exports={applyPakkomProfitPercentSortV1};
