/* PAKKOM_OPERATIONS_UPDATE_V1: operational orders, report buyouts and matched ad spend.
   No realized-revenue, cost, VAT or profit is fabricated. Encrypted financial history is retained. */
async function decodePakkomOperationsEnvelopeV1(envelope){
 if(!envelope||envelope.format!=='pakkom-gzip-json-v1'||!envelope.gzip||!envelope.sha256)throw Error('Invalid operations envelope');
 const bytes=Uint8Array.from(atob(envelope.gzip),c=>c.charCodeAt(0));
 const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(sha!==envelope.sha256)throw Error('Operations checksum mismatch');
 const update=JSON.parse(new TextDecoder().decode(raw));
 if(update.through!==envelope.through)throw Error('Operations envelope date mismatch');
 return update;
}
function applyPakkomOperationsDataV1(source,update){
 const open='<script id="data" type="application/json">',close='</scr'+'ipt>';
 const a=source.indexOf(open),b=source.indexOf(close,a+open.length);
 if(a<0||b<a||update.schema!=='pakkom-operations-update-v1')throw Error('Invalid operations update');
 const d=JSON.parse(source.slice(a+open.length,b));
 if(d.operationsUpdateId===update.id)return source;
 if(d.through!==update.expectedThrough)throw Error('Operations base date mismatch');
 const isoDate=s=>s.split('.').reverse().join('-'),last=isoDate(update.through),financialLast=isoDate(update.financialThrough);
 const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/[‐‑‒–—−]/g,'-').replace(/(\d)\s*[xх×*]\s*(?=\d)/g,'$1х').replace(/(\d)\s*(штук|шт\.?|мл|см|мм)(?=\s|$)/g,(_,n,u)=>n+' '+(/^шт/.test(u)?'шт':u)).replace(/\s+/g,' ').trim();
 const byName=new Map();
 const add=(s,id)=>{if(!s||!id)return;const key=norm(s);if(!byName.has(key))byName.set(key,new Set());byName.get(key).add(String(id));};
 for(const r of d.daily||[])add(r.sku,r.nmId);
 for(const c of update.catalog)add(c[0],c[1]);
 const key=r=>{const id=String(r.nmId||'').replace(/\.0$/,'');if(id)return 'NMID:'+id;const ids=byName.get(norm(r.sku));if(ids?.size>1)throw Error('Ambiguous operational SKU: '+r.sku);return ids?.size===1?'NMID:'+ids.values().next().value:'NAME:'+norm(r.sku);};
 const old=new Map();
 for(const r of d.daily||[]){if(r.iso>=update.replaceFrom){const k=r.iso+'|'+key(r);if(old.has(k))throw Error('Duplicate operational base SKU');old.set(k,r);}}
 const financial=['salesQty','returnsQty','revenue','wbRealized','payout','cost','packing','vat','profit','profitBeforeAdsVat','profitAfterAds','profitPerBuyout','margin','roi','prelimCost','prelimPacking','prelimTotal'];
 const out=[],seen=new Set(),dates=new Set();
 for(const [iso,rows] of update.days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||iso<update.replaceFrom||iso>last||dates.has(iso))throw Error('Invalid operations dates');dates.add(iso);
  for(const item of rows){
   if(item.length!==5||!item.every(Number.isSafeInteger)||item.slice(1).some(x=>x<0))throw Error('Invalid operations quantity or money');
   const [i,ordersQty,netCents,buyoutsQty,ads]=item,c=update.catalog[i];
   if(!c||c.length!==6)throw Error('Missing operations catalogue entry');
   const [sku,nmId,category,subcategory,cpoStd,cpoMax]=c,k=iso+'|'+key({sku,nmId});
   if(seen.has(k))throw Error('Duplicate operations date/SKU');seen.add(k);
   const before=old.get(k),r={...(before||{}),iso,date:iso.slice(8)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4),week:'2026-11-09',sku,nmId,skuKey:key({sku,nmId}),category,subcategory,ordersQty,ordersNetRub:netCents/100,ordersRub:netCents/100/(1-update.commissionRate),buyoutsQty,ads,cpoStd,cpoMax};
   r.drr=r.ordersRub?ads/r.ordersRub:null;r.cpo=ordersQty?ads/ordersQty:null;
   r.ordersSource='report_2026_11_16';r.buyoutsSource='report';r.operationalRevision=update.id;
   if(iso>financialLast){for(const f of financial)r[f]=null;r.financialComplete=false;r.operationalOnly=true;}
   else{
    if(before&&(Number(before.buyoutsQty||0)!==buyoutsQty||Number(before.ads||0)!==ads))throw Error('Closed-day sales/advertising conflict');
    if(!before&&(buyoutsQty!==0||ads!==0))throw Error('New financial operation in a closed day');
    if(!before){for(const f of ['revenue','wbRealized','payout','cost','packing','vat','profit'])r[f]=0;}
   }
   out.push(r);
  }
 }
 for(const [k,r] of old){if(!seen.has(k))throw Error('Operational update would drop an existing row: '+k);}
 if([...dates].sort().at(-1)!==last)throw Error('Operations period not covered');
 for(const check of update.checks){
  const rows=out.filter(r=>r.iso===check.iso),sum=f=>rows.reduce((s,r)=>s+Number(r[f]||0),0);
  if(rows.length!==check.rows||sum('ordersQty')!==check.ordersQty||sum('buyoutsQty')!==check.buyoutsQty||sum('ads')!==check.ads||Math.abs(sum('ordersNetRub')*100-check.ordersNetCents)>.01)throw Error('Operations control mismatch: '+check.iso);
 }
 if(update.overlapRevision){const c=update.overlapRevision,prior=[...old.values()].filter(r=>r.iso===c.iso);if(prior.reduce((s,r)=>s+Number(r.ordersQty||0),0)!==c.beforeOrders||Math.abs(prior.reduce((s,r)=>s+Number(r.ordersNetRub||0),0)*100-c.beforeOrdersNetCents)>.01)throw Error('Unexpected closed orders before revision');}
 d.daily=(d.daily||[]).filter(r=>r.iso<update.replaceFrom).concat(out);
 d.through=update.through;d.financialThrough=update.financialThrough;d.operationsVersion=1;d.operationsUpdateId=update.id;d.operationsSource={report:update.ordersSource,advertising:update.adsSource,sales:update.salesSource,sha256:update.sourceSha256};
 d.operationsOverlapRevision=update.overlapRevision;
 d.weeks=(d.weeks||[]).filter(w=>w.key!=='2026-11-09');d.weeks.push({key:'2026-11-09',start:'2026-11-09',end:last,label:'09.11–15.11'});
 d.ordersAmountBasis='with_commission';d.ordersSourceBasis='after_commission';d.ordersCommissionRate=update.commissionRate;
 for(const target of [d.business,d.skuTotals])if(target){for(const f of ['ordersQty','ordersRub','ordersNetRub','buyoutsQty','ads'])if(f in target)target[f]=d.daily.reduce((s,r)=>s+Number(r[f]||0),0);if('drr' in target)target.drr=target.ordersRub?target.ads/target.ordersRub:null;target.financialThrough=update.financialThrough;}
 d.note='Оперативные данные по '+d.through+'. Выкупы 12–15.11 — из report. Финансовые результаты подтверждены только по '+d.financialThrough+'.';
 const json=JSON.stringify(d).replace(/</g,'\\u003c');return source.slice(0,a+open.length)+json+source.slice(b);
}
if(typeof module!=='undefined'&&module.exports)module.exports={decodePakkomOperationsEnvelopeV1,applyPakkomOperationsDataV1};
