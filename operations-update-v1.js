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
function applyPakkomOperationalViewV1(source){
 const open='<script id="data" type="application/json">',close='</scr'+'ipt>',a=source.indexOf(open),b=source.indexOf(close,a+open.length);
 if(a<0||b<a)return source;
 const d=JSON.parse(source.slice(a+open.length,b));if(d.operationsVersion!==1)return source;
 const fields=['salesQty','returnsQty','revenue','wbRealized','payout','cost','packing','vat','profit','profitBeforeAdsVat','profitPerBuyout','margin','roi','prelimCost','prelimPacking','prelimTotal'];
 for(const row of d.daily||[])if(row.operationalOnly){for(const f of fields)row[f]=null;row.financialComplete=false;}
 let html=source.slice(0,a+open.length)+JSON.stringify(d).replace(/</g,'\\u003c')+source.slice(b);
 if(html.includes('/* PAKKOM_OPERATIONAL_VIEW_V1 */'))return html;
 const anchor='function agg(rows){';
 if(html.includes(anchor)){
  const wrapper=`/* PAKKOM_OPERATIONAL_VIEW_V1 */
function agg(rows){
 const result=pakkomFinancialAggBeforeOperationsV1(rows);
 const cutoff=String(DATA.financialThrough||'').split('.').reverse().join('-');
 const incomplete=rows.some(r=>r.operationalOnly||r.financialComplete===false||cutoff&&r.iso>cutoff);
 if(incomplete){
  const allowed=new Set(['ordersQty','ordersRub','ordersNetRub','buyoutsQty','ads','cpo','drr','buyout','buyoutD6','avgOrdersDay','cpoStd','cpoMax','days','skuCount','rows']);
  for(const k of Object.keys(result))if(!allowed.has(k)&&typeof result[k]==='number')result[k]=null;
  for(const k of ['revenue','wbRealized','payout','cost','packing','vat','profit','profitBeforeAdsVat','profitPerBuyout','margin','roi','prelimCost','prelimPacking','prelimTotal'])result[k]=null;
  result.financialComplete=false;
 }else result.financialComplete=true;
 return result;
}
function pakkomFinancialAggBeforeOperationsV1(rows){`;
  if(html.split(anchor).length!==2)throw Error('Unknown aggregator boundary');html=html.replace(anchor,()=>wrapper);
 }
 // Add the requested DRR to the manager table without replacing the existing interface.
 if(html.includes("['ads','Реклама'],['cpo','CPO']")){
  html=html.replace("['ads','Реклама'],['cpo','CPO']","['ads','Реклама'],['drr','ДРР, %'],['cpo','CPO']");
  html=html.replace("'avgOrdersDay','buyoutsQty','buyout','ads','cpo','roi'","'avgOrdersDay','buyoutsQty','buyout','ads','drr','cpo','roi'");
  html=html.replace('<td class="num">${money(m.ads)}</td><td class="num" title=', '<td class="num">${money(m.ads)}</td><td class="num">${pct(m.drr)}</td><td class="num" title=');
  html=html.replace('<th>Реклама</th><th>CPO</th>', '<th>Реклама</th><th>ДРР</th><th>CPO</th>');
  html=html.replace('<td class="num">${money(r.ads)}</td><td class="num">${money(r.cpo)}</td>', '<td class="num">${money(r.ads)}</td><td class="num">${pct(r.drr)}</td><td class="num">${money(r.cpo)}</td>');
  html=html.replace("kpi('ROI',pct(m.roi),'базовый период')","m.financialComplete===false?kpi('ДРР',pct(m.drr),'реклама / заказы с комиссией'):kpi('ROI',pct(m.roi),'базовый период')");
 }
 const client=String.raw`/* PAKKOM_OPERATIONS_NOTICE_V1 */
(function(){
 if(typeof document.createElement!=='function'||!document.body?.insertBefore)return;
 const banner=document.createElement('div');banner.id='pakkomOperationsNotice';banner.style.cssText='padding:9px 14px;margin:8px;border:1px solid #3a6687;border-radius:8px;color:#dbeeff;background:#122b40;font:13px Arial,sans-serif';document.body.insertBefore(banner,document.body.firstChild);
 const finance=/(выруч|к перечислен|себестоим|закуп|комплектац|НДС|ЧП|чистая прибыль|прибыль|ROI|маржин|сценарий|прогноз)/i;
 function setHidden(el,on){if(!el)return;if(on){if(!el.hasAttribute('data-ops-hidden')){el.dataset.opsDisplay=el.style.display||'';el.setAttribute('data-ops-hidden','1');el.style.display='none';}}else if(el.hasAttribute('data-ops-hidden')){el.style.display=el.dataset.opsDisplay||'';el.removeAttribute('data-ops-hidden');}}
 function sync(){
  const cut=DATA.financialThrough.split('.').reverse().join('-');const partial=typeof state!=='undefined'&&state.to>cut;
  const text=partial?'Оперативно по '+DATA.through+' · Заказы, выкупы из report, реклама и ДРР. ЧП, НДС и финансовые прогнозы за незакрытые дни не рассчитаны. Финансовая история сохранена по '+DATA.financialThrough+'.':'Финансовая история по '+DATA.financialThrough+'; оперативные данные доступны по '+DATA.through+'.';
  if(banner.textContent!==text)banner.textContent=text;
  document.querySelectorAll('[data-ops-hidden]').forEach(el=>setHidden(el,false));
  const profitFilter=document.getElementById('fProfit');if(profitFilter)profitFilter.disabled=partial;
  if(!partial)return;
  if(typeof state!=='undefined'&&state.profit&&state.profit!=='all'){state.profit='all';if(profitFilter)profitFilter.value='all';if(typeof renderAll==='function')renderAll();}
  document.querySelectorAll('[data-q="negative"],[data-q="scale"]').forEach(el=>setHidden(el,true));
  document.querySelectorAll('table').forEach(table=>{
   const tr=table.querySelector('tr'),heads=tr?[...tr.children]:[];if(!heads.some(h=>h.tagName==='TH'))return;
   const columns=heads.map((h,i)=>finance.test(h.textContent||'')?i:-1).filter(i=>i>=0);
   for(const row of table.rows||[]){if(row.closest('table')!==table||row.children.length!==heads.length)continue;for(const i of columns)setHidden(row.children[i],true);}
  });
  document.querySelectorAll('.kpi,.sum,.metric').forEach(card=>{const label=card.querySelector('.l,.sl,.label,h3,h4');if(label&&finance.test(label.textContent||''))setHidden(card,true);});
  document.querySelectorAll('h2,h3,h4').forEach(h=>{if(/(сценарий|финансов|экономик|прогноз)/i.test(h.textContent||'')){const card=h.closest('.box,.card,.panel');if(card)setHidden(card,true);}});
  const f=document.getElementById('fProfit');if(f){f.disabled=true;f.title='Фильтр ЧП доступен только для закрытого финансового периода';}
 }
 let pending=false;const schedule=()=>{if(pending)return;pending=true;Promise.resolve().then(()=>{pending=false;sync();});};
 if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('change',()=>{const f=document.getElementById('fProfit');if(f)f.disabled=false;schedule();});sync();
})();`;
 html=html.replace('</body>','<script>'+client+'</scr'+'ipt></body>');
 return html;
}
if(typeof module!=='undefined'&&module.exports)module.exports={decodePakkomOperationsEnvelopeV1,applyPakkomOperationsDataV1,applyPakkomOperationalViewV1};
