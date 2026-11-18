/* Populate an operational date range with reconciled daily financial reports. */
function applyPakkomFinancialPeriodV1(source, update, expectedAudience) {
 const opening = '<script id="data" type="application/json">';
 const start = source.indexOf(opening) + opening.length;
 const end = source.indexOf('</scr' + 'ipt>', start);
 if (start < opening.length || end < start || update.schema !== 'pakkom-financial-period-v1') throw Error('Invalid financial period');
 const d = JSON.parse(source.slice(start, end));
 if (d.financialPeriodId === update.id) return source;
 if (d.through !== update.expectedThrough || d.financialThrough !== update.previousFinancialThrough) throw Error('Unexpected period to reconcile');
 const pub = update.audience === 'radar';
 if ((!pub && update.audience !== 'owner') || update.audience !== expectedAudience) throw Error('Financial period audience mismatch');
 const opFields = ['ordersQty', 'ordersNetRub', 'buyoutsQty', 'salesQty', 'returnsQty', 'ads', 'reportBuyoutsQty'];
 const privateFields = ['revenue', 'wbRealized', 'payout', 'cost', 'packing', 'vat', 'profit', 'prelimCost', 'prelimPacking', 'logistics', 'penalties'];
 const fields = pub ? opFields : opFields.concat(privateFields);
 const rows = [], seen = new Set();
 const last = update.through.split('.').reverse().join('-');
 function date(s) { return new Date(s + 'T00:00:00Z'); }
 const nextDay = date(update.previousFinancialThrough.split('.').reverse().join('-'));
 nextDay.setUTCDate(nextDay.getUTCDate()+1);
 for (const [iso, values, check] of update.days) {
  if (iso !== nextDay.toISOString().slice(0,10) || iso > last) throw Error('Gap or overlap in financial period');
  nextDay.setUTCDate(nextDay.getUTCDate()+1);
  const week = date(iso);
  week.setUTCDate(week.getUTCDate() - (week.getUTCDay()+6)%7);
  const sums = fields.map(()=>0);
  for (const item of values) {
   if (item.length !== 1+fields.length || !Number.isInteger(item[0]) || !item.slice(1).every(Number.isFinite)) throw Error('Invalid reconciled financial row');
   const c = update.catalog[item[0]];
   if (!c || c.length !== 6) throw Error('Missing reconciled SKU');
   const [sku,nmId,category,subcategory,cpoStd,cpoMax] = c, skuKey = nmId ? 'NMID:'+nmId : 'NAME:'+sku.toLowerCase().trim();
   const key = iso+'|'+skuKey;
   if (seen.has(key)) throw Error('Duplicate reconciled date/SKU'); seen.add(key);
   const r = {iso,date:iso.split('-').reverse().join('.'),week:week.toISOString().slice(0,10),sku,nmId,skuKey,category,subcategory,cpoStd,cpoMax};
   fields.forEach((f,i)=>{ r[f]=item[i+1]; sums[i]+=r[f]; });
   if (r.salesQty-r.returnsQty!==r.buyoutsQty) throw Error('Net buyouts mismatch');
   r.ordersRub=r.ordersNetRub/0.70; r.drr=r.ordersRub?r.ads/r.ordersRub:null;
   r.cpo=r.ordersQty?r.ads/r.ordersQty:null;
   r.financialComplete=true; r.buyoutsSource='Детализация WB';
   if (!pub) {
    r.roi=r.cost?r.profit/r.cost:null; r.margin=r.revenue?r.profit/r.revenue:null;
    r.profitPerBuyout=r.buyoutsQty?r.profit/r.buyoutsQty:null;
    r.profitBeforeAdsVat=r.payout-r.cost-r.packing;
    r.prelimTotal=r.prelimCost+r.prelimPacking;
   }
   rows.push(r);
  }
  if (!values.length || check.length!==fields.length || sums.some((x,i)=>Math.abs(x-check[i])>0.011)) throw Error('Daily reconciliation failed: '+iso);
 }
 if (!rows.length || rows.at(-1).iso!==last) throw Error('Incomplete date range');
 const from=update.days[0][0];
 const prior=d.daily.filter(r=>r.iso<from), oldRange=d.daily.filter(r=>r.iso>=from);
 d.daily=prior.concat(rows);
 const datedWeeks=new Map();
 for (const r of rows) datedWeeks.set(r.week, r.iso);
 d.weeks=(d.weeks||[]).filter(w=>!datedWeeks.has(w.key));
 for(const [key,end] of datedWeeks){
  const short=s=>s.slice(8)+'.'+s.slice(5,7);
  d.weeks.push({key,start:key,end,label:short(key)+'–'+short(end)});
 }
 const sum=(rs,key)=>rs.reduce((s,r)=>s+Number(r[key]||0),0);
 for (const target of [d.business,d.skuTotals]) if (target) {
  for (const f of [...fields,'ordersRub','prelimTotal']) if(typeof target[f]==='number') target[f]+=sum(rows,f)-sum(oldRange,f);
  if ('drr' in target) target.drr=target.ordersRub?target.ads/target.ordersRub:null;
  if ('roi' in target) target.roi=target.cost?target.profit/target.cost:null;
  if ('margin' in target) target.margin=target.revenue?target.profit/target.revenue:null;
  target.financialThrough=update.through;
 }
 d.through=update.through;d.financialThrough=update.through;d.financialPeriodId=update.id;
 d.expensesFrom=from;
 d.note='Финансовые отчёты WB по '+d.through+'. Выкупы показаны за вычетом возвратов.';
 return source.slice(0,start)+JSON.stringify(d).replace(/</g,'\\u003c')+source.slice(end);
}

/* Oleg's Radar uses the ordinary filters, dates, table and detail view. */
function applyPakkomActualRadarViewV1(source) {
 const opening='<script id="data" type="application/json">';
 const start=source.indexOf(opening)+opening.length, end=source.indexOf('</scr'+'ipt>',start);
 if(start<opening.length||end<start)throw Error('Missing public report data');
 const data=JSON.parse(source.slice(start,end));
 if(data.financialThrough!==data.through)throw Error('Financial reports are incomplete');
 const operational=['date','iso','week','sku','nmId','skuKey','category','subcategory','ordersQty','ordersRub','ordersNetRub','salesQty','returnsQty','buyoutsQty','reportBuyoutsQty','ads','cpoStd','cpoMax','cpo','drr','financialComplete'];
 const cutoff=data.expensesFrom;
 data.daily=data.daily.map(row=>{
  const fields=row.iso<cutoff ? operational.concat(['roi','profitPerBuyout']) : operational;
  return Object.fromEntries(fields.filter(key=>key in row).map(key=>[key,row[key]]));
 });
 let html=source.slice(0,start)+JSON.stringify(data).replace(/</g,'\\u003c')+source.slice(end);
 function once(oldValue,newValue){
  if(html.split(oldValue).length!==2)throw Error('Unexpected Radar template: '+oldValue);
  html=html.replace(oldValue,()=>newValue);
 }
 once("['ads','Реклама'],['cpo','CPO']", "['ads','Реклама'],['drr','ДРР, %'],['cpo','CPO']");
 once("'buyout','ads','cpo','roi'", "'buyout','ads','drr','cpo','roi'");
 once('function renderTable(){',`function historicalRatiosVisible(){return state.to<DATA.expensesFrom}
 function radarColumns(){return historicalRatiosVisible()?COLS:COLS.filter(([key])=>key!=='roi'&&key!=='profitPerBuyout')}
 function renderTable(){if(!historicalRatiosVisible()&&['roi','profitPerBuyout'].includes(state.sort)){state.sort='ordersQty';state.dir=-1;}`);
 once('COLS.map(head)', 'radarColumns().map(head)');
 html=html.replaceAll('${COLS.length}','${radarColumns().length}');
 once('s.profitPerBuyout=pbw?pb/pbw:null;s.roi=roiw?roi/roiw:null;', 'const showRatios=rows.every(r=>r.iso<DATA.expensesFrom);s.profitPerBuyout=showRatios&&pbw?pb/pbw:null;s.roi=showRatios&&roiw?roi/roiw:null;');
 once('<td class="num">${money(m.ads)}</td><td class="num" title=', '<td class="num">${money(m.ads)}</td><td class="num">${pct(m.drr)}</td><td class="num" title=');
 const financeCells=m=>'<td class="num">${pct('+m+'.roi)}</td><td class="num">${money('+m+'.profitPerBuyout)}</td>';
 for(const m of ['m','r'])once(financeCells(m),'$'+'{historicalRatiosVisible()?\`'+financeCells(m)+'\`: ""}');
 once('<th>Реклама</th><th>CPO</th>', '<th>Реклама</th><th>ДРР</th><th>CPO</th>');
 once('<th>ROI</th><th>ЧП / 1 выкуп</th>', "'+(historicalRatiosVisible()?'<th>ROI</th><th>ЧП / 1 выкуп</th>':'')+'");
 once('<td class="num">${money(r.ads)}</td><td class="num">${money(r.cpo)}</td>', '<td class="num">${money(r.ads)}</td><td class="num">${pct(r.drr)}</td><td class="num">${money(r.cpo)}</td>');
 once("kpi('ROI',pct(m.roi),'базовый период')","kpi('ДРР',pct(m.drr),'реклама / заказы с комиссией'),...(historicalRatiosVisible()?[kpi('ROI',pct(m.roi),'базовый период')]:[])");
 return html;
}

/* Add the actual charges below the owner's existing, filtered financial KPIs. */
function applyPakkomOwnerActualExpensesV1(source) {
 const marker='function renderKpis(){';
 if(!source.includes(marker)||!source.includes('"expensesFrom"'))return source;
 const render=String.raw`function renderKpis(){
  renderOriginalPakkomKpisV1();
  const kpis=document.querySelector('#weekly .kpis, #weekly #kpis, #kpis');
  if(!kpis||typeof getGroups!=='function')return;
  let line=kpis.parentElement.querySelector('[data-pakkom-actual-expenses]');
  if(line)line.remove();
  if(state.from<DATA.expensesFrom||state.to>DATA.financialThrough.split('.').reverse().join('-'))return;
  const visible=getGroups().flatMap(g=>Array.isArray(g.rows)?g.rows:[]).filter(r=>r.iso>=state.from&&r.iso<=state.to);
  if(!visible.length||visible.some(r=>!Number.isFinite(r.logistics)||!Number.isFinite(r.penalties)))return;
  const total=key=>visible.reduce((s,r)=>s+r[key],0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
  line=document.createElement('p');line.className='hint';line.setAttribute('data-pakkom-actual-expenses','1');
  line.textContent='Расходы отдельно от ЧП за выбранный период и товары: логистика '+total('logistics')+', штрафы '+total('penalties')+'.';
  kpis.after(line);
 }
 function renderOriginalPakkomKpisV1(){`;
 return source.replace(marker,()=>render);
}
