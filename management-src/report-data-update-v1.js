/* PAKKOM_REPORT_DATA_UPDATE_V1. Apply a separately encrypted report to the
   existing financial HTML. Neither financial values nor account keys live here. */
function applyPakkomReportDataUpdateV1(source,update){
 const match=source.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
 if(!match||update.schema!=='pakkom-report-data-update-v1')throw Error('Invalid report update');
 const data=JSON.parse(match[1]);
 if(data.reportUpdateId===update.id)return source;
 if(data.through!==update.expectedThrough)throw Error('Report update base date mismatch');
 const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/(^|\s)нг(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();
 const key=r=>r.iso+'|'+(r.nmId?'NMID:'+String(r.nmId):'NAME:'+norm(r.sku));
 const rows=new Map();
 for(const row of data.daily){const k=key(row);if(rows.has(k))throw Error('Duplicate source date/SKU');rows.set(k,row);}
 const near=(a,b)=>typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<0.00001;
 const changed=new Set();
 for(const item of update.replacements){
  const k=key(item),row=rows.get(k);
  if(!row||changed.has(k))throw Error('Missing or duplicate update target');
  changed.add(k);
  for(const [field,value] of Object.entries(item.before))if(!near(row[field],value))throw Error('Unexpected source value: '+k+' '+field);
  for(const field of Object.keys(item.after))if(['date','iso','sku','skuKey','nmId','category','subcategory'].includes(field))throw Error('Historical identity change');
  Object.assign(row,item.after);
 }
 for(const row of update.insertions){
  const k=key(row);if(rows.has(k)||row.iso<=update.expectedThrough.split('.').reverse().join('-'))throw Error('Duplicate or historical insertion');
  rows.set(k,row);data.daily.push(row);
 }
 if(data.daily.reduce((last,r)=>r.iso>last?r.iso:last,'')!==update.through.split('.').reverse().join('-'))throw Error('Update date not covered');
 for(const check of update.dailyChecks){
  const day=data.daily.filter(r=>r.iso===check.iso);
  if(day.length!==check.rows)throw Error('Report row count mismatch');
  for(const [field,value] of Object.entries(check.sums))if(!near(day.reduce((sum,r)=>sum+r[field],0),value))throw Error('Report total mismatch: '+check.iso+' '+field);
 }
 data.through=update.through;data.weeks=update.weeks;data.reportUpdateId=update.id;
 data.business={...data.business,...update.business};
 const totals={...data.skuTotals};
 for(const field of ['ordersQty','ordersRub','ordersNetRub','buyoutsQty','revenue','ads','cost','packing','vat','profit'])totals[field]=data.daily.reduce((sum,r)=>sum+(Number(r[field])||0),0);
 totals.roi=totals.cost?totals.profit/totals.cost:null;data.skuTotals=totals;
 data.controlDaily={...data.controlDaily,...update.controlDaily};
 if(typeof data.note==='string')data.note=data.note.replace(update.expectedThrough,update.through);
 const json=JSON.stringify(data).replace(/</g,'\\u003c'),start=match.index+match[0].indexOf(match[1]);
 return source.slice(0,start)+json+source.slice(start+match[1].length);
}
if(typeof module!=='undefined'&&module.exports)module.exports={applyPakkomReportDataUpdateV1};
