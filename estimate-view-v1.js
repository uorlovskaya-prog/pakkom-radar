/* PAKKOM_ESTIMATE_VIEW_V1. Estimates remain a separate model, never DATA.daily.
   Owner values arrive only inside the existing encrypted update chain.
   Public Radar receives operational measures, CPO limits and decision signals only. */
function expandPakkomEstimateV1(model){
 if(!model||model.version!==1||!['owner','signals'].includes(model.mode)||!Array.isArray(model.items)||!Array.isArray(model.fields))throw Error('Invalid estimate model');
 const seen=new Set();
 const rows=model.items.map(item=>{
  if(item.length!==model.fields.length)throw Error('Invalid estimate row');
  const r=Object.fromEntries(model.fields.map((f,i)=>[f,item[i]]));
  for(const [field,values] of Object.entries(model.strings||{})){
   if(!Number.isSafeInteger(r[field])||values[r[field]]===undefined)throw Error('Invalid estimate dictionary');
   r[field]=values[r[field]];
  }
  if(!r.key||!r.sku||seen.has(r.key))throw Error('Duplicate estimate SKU');seen.add(r.key);
  for(const k of ['ordersQty','buyoutsQty','ads','ordersNetCents'])if(!Number.isFinite(r[k])||r[k]<0)throw Error('Invalid operational measure');
  r.ordersNetRub=r.ordersNetCents/100;r.ordersRub=r.ordersNetRub/.70;
  r.cpo=r.ordersQty?r.ads/r.ordersQty:null;r.drr=r.ordersRub?r.ads/r.ordersRub:null;
  if(model.mode==='owner'){
   for(const k of ['profitMicros','sensitivityMicros','contributionMicros'])if(!Number.isSafeInteger(r[k]))throw Error('Invalid estimate precision');
   r.profitEstimate=r.profitMicros/1e6;r.profitLow=r.profitEstimate-r.sensitivityMicros/1e6;r.profitHigh=r.profitEstimate+r.sensitivityMicros/1e6;
   const contribution=r.contributionMicros/1e6,netAdvertising=r.ads*(1-22/122);
   for(const p of [80,90,95])r['order'+p]=contribution*p/100-netAdvertising;
   r.cap90=r.ordersQty?contribution*.90/(r.ordersQty*(1-22/122)):null;
   r.breakEvenBuyout=contribution>0?netAdvertising/contribution:null;
  }else{
   const keys=model.fields.join(' ');if(/profit|contribution|payout|unitCost|wbFactor|vat/i.test(keys))throw Error('Private field in public estimate');
   r.cap90=r.cap90Micros===null?null:r.cap90Micros/1e6;
  }
  r.cap80=r.cap90===null?null:r.cap90*8/9;
  return r;
 });
 for(const [k,v] of Object.entries(model.checks||{})){
  if(!Number.isFinite(v)||Math.abs(rows.reduce((s,r)=>s+(Number(r[k])||0),0)-v)>.002)throw Error('Estimate sum mismatch: '+k);
 }
 return rows;
}
function applyPakkomEstimateDataV1(source,update){
 if(!update||!['pakkom-estimate-update-v1','pakkom-estimate-signals-v1'].includes(update.schema))throw Error('Invalid estimate update');
 const open='<script id="data" type="application/json">',close='</scr'+'ipt>',a=source.indexOf(open),b=source.indexOf(close,a+open.length);
 if(a<0||b<a)throw Error('Missing report data');
 const d=JSON.parse(source.slice(a+open.length,b));
 if(d.estimatesUpdateId===update.id)return source;
 if(d.through!==update.expectedThrough||update.through!==d.through||update.model.period.through!==d.through)throw Error('Estimate date mismatch');
 if(update.model.period.financialThrough!==d.financialThrough)throw Error('Estimate financial cutoff mismatch');
 const rows=expandPakkomEstimateV1(update.model),period=update.model.period;
 if(update.schema==='pakkom-estimate-signals-v1'&&update.model.mode!=='signals'||update.schema==='pakkom-estimate-update-v1'&&update.model.mode!=='owner')throw Error('Estimate access mismatch');
 const ops=(d.daily||[]).filter(r=>r.iso>=period.from&&r.iso<=period.to);
 for(const k of ['ordersQty','ordersRub','buyoutsQty','ads'])if(Math.abs(ops.reduce((s,r)=>s+(Number(r[k])||0),0)-rows.reduce((s,r)=>s+(Number(r[k])||0),0))>.002)throw Error('Estimate differs from operational report: '+k);
 const canonical=r=>{
  const id=String(r.nmId||'').replace(/\.0$/,'');if(id)return 'NMID:'+id;
  const name=String(r.sku||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/(^|\s)нг(?=\s|$)/g,' ').replace(/(\d)\s*(штук|шт\.?|мл|см|мм)(?=\s|$)/g,(_,n,u)=>n+' '+(/^шт/.test(u)?'шт':u)).replace(/\s+/g,' ').trim();
  return 'NAME:'+name;
 };
 const productTotals=new Map();
 for(const r of ops){const key=canonical(r);if(!productTotals.has(key))productTotals.set(key,{});const t=productTotals.get(key);for(const f of ['ordersQty','ordersRub','buyoutsQty','ads'])t[f]=(t[f]||0)+Number(r[f]||0);}
 const modelKeys=new Set();
 for(const r of rows){const key=canonical(r),t=productTotals.get(key);if(!t||modelKeys.has(key))throw Error('Estimate SKU identity conflict');modelKeys.add(key);for(const f of ['ordersQty','ordersRub','buyoutsQty','ads'])if(Math.abs(t[f]-r[f])>.002)throw Error('Estimate SKU totals mismatch: '+key+' '+f);}
 if(modelKeys.size!==productTotals.size)throw Error('Estimate catalogue incomplete');
 d.estimatesV1=update.model;d.estimatesUpdateId=update.id;
 return source.slice(0,a+open.length)+JSON.stringify(d).replace(/</g,'\\u003c')+source.slice(b);
}
function mountPakkomEstimateV1(){
 if(typeof document.createElement!=='function'||!document.querySelector||document.getElementById('pakkomEstimatesV1'))return;
 const data=typeof DATA!=='undefined'?DATA:JSON.parse(document.getElementById('data')?.textContent||'{}'),model=data.estimatesV1;
 if(!model)return;
 const records=expandPakkomEstimateV1(model),owner=model.mode==='owner',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=(n,d=0)=>n===null||n===undefined||!Number.isFinite(n)?'—':Number(n).toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
 const rub=n=>num(n)+' ₽',pct=n=>n===null||n===undefined?'—':num(n*100,1)+'%',tone=n=>Number.isFinite(n)&&n<0?'pe-negative':'';
 const root=document.createElement('section');root.id='pakkomEstimatesV1';root.setAttribute('data-pakkom-estimate','1');root.className='pe-panel';
 const css=document.createElement('style');css.textContent=`
 #pakkomEstimatesV1{margin:12px 0 16px;padding:16px;border:1px solid #476c91;border-radius:12px;background:#0e1c30;color:#e7eef8;font:13px Arial,sans-serif;min-width:0;max-width:100%;box-sizing:border-box}
 #pakkomEstimatesV1 *{box-sizing:border-box}#pakkomEstimatesV1 .pe-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#pakkomEstimatesV1 h2{font:700 20px Arial;margin:0;color:#f1f6fd}#pakkomEstimatesV1 h3{font-size:14px;margin:10px 0}
 #pakkomEstimatesV1 .pe-badge{background:#503b14;border:1px solid #9c7930;color:#ffe7a6;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;white-space:nowrap}
 #pakkomEstimatesV1 .pe-muted{color:#b3c4d9;font-size:12px;line-height:1.55}#pakkomEstimatesV1 p{margin:9px 0}#pakkomEstimatesV1 .pe-toggle{margin-left:auto}
 #pakkomEstimatesV1 .pe-stats{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:10px;margin:14px 0}
 #pakkomEstimatesV1 .pe-stat{padding:12px;background:#142941;border:1px solid #2f4d70;border-radius:9px}#pakkomEstimatesV1 .pe-label{font-size:11px;color:#b8cade;line-height:1.5}#pakkomEstimatesV1 .pe-value{font-size:24px;font-weight:700;margin:7px 0;color:#f1f6fd;font-variant-numeric:tabular-nums}
 #pakkomEstimatesV1 .pe-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid #29435e}
 #pakkomEstimatesV1 button,#pakkomEstimatesV1 select,#pakkomEstimatesV1 input{font:12px Arial;padding:8px 10px;border:1px solid #476482;color:#edf4fd;border-radius:7px;background:#172d46;min-height:34px}#pakkomEstimatesV1 input{min-width:260px;max-width:100%}
 #pakkomEstimatesV1 button:focus-visible,#pakkomEstimatesV1 input:focus-visible,#pakkomEstimatesV1 select:focus-visible{outline:2px solid #7bc4ff;outline-offset:2px}#pakkomEstimatesV1 button[aria-pressed=true]{background:#1d5ca0;border-color:#75b2ee}
 #pakkomEstimatesV1 .pe-scroll{overflow:auto;max-height:620px;border:1px solid #2f4965;border-radius:8px;margin-top:10px}
 #pakkomEstimatesV1 table{border-collapse:collapse;width:100%;min-width:1120px;table-layout:auto}#pakkomEstimatesV1 th{position:sticky;top:0;z-index:2;background:#1c3551;color:#cce0f5;text-transform:none;font:600 11px Arial;cursor:pointer;white-space:normal;min-width:75px!important;padding:10px 8px;vertical-align:bottom}
 #pakkomEstimatesV1 td{background:#0f2035;font:12px Arial;line-height:1.45;padding:10px 8px;border-bottom:1px solid #29435e;vertical-align:top;overflow-wrap:normal;white-space:normal}#pakkomEstimatesV1 td.pe-n{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}#pakkomEstimatesV1 td:first-child{min-width:235px!important;max-width:320px}#pakkomEstimatesV1 .pe-sku{background:transparent;border:0;padding:0;color:#a7d8ff;text-align:left;font-weight:700;min-height:0;line-height:1.45;cursor:pointer}
 #pakkomEstimatesV1 .pe-negative{color:#ff9ba9!important}#pakkomEstimatesV1 .pe-risk{color:#ffb0b8}#pakkomEstimatesV1 .pe-watch{color:#ffe2a0}#pakkomEstimatesV1 .pe-ok{color:#90e1c0}
 #pakkomEstimatesV1 .pe-detail td{background:#182f49;font-size:12px;padding:13px;line-height:1.6}#pakkomEstimatesV1 .pe-detail td:first-child{max-width:none}#pakkomEstimatesV1 .pe-day table{min-width:620px}#pakkomEstimatesV1 details{margin-top:12px}#pakkomEstimatesV1 summary{cursor:pointer;color:#bcdfff;line-height:1.6}#pakkomEstimatesV1 .pe-count{font-size:12px;color:#b7cbe3;margin:8px 0}#pakkomEstimatesV1 [hidden]{display:none!important}
 @media(max-width:800px){#pakkomEstimatesV1 .pe-stats{grid-template-columns:repeat(2,minmax(120px,1fr))}#pakkomEstimatesV1{padding:12px;margin:8px 0}#pakkomEstimatesV1 h2{font-size:17px}#pakkomEstimatesV1 .pe-value{font-size:20px}#pakkomEstimatesV1 input{min-width:0;width:100%}#pakkomEstimatesV1 .pe-controls{align-items:stretch}#pakkomEstimatesV1 .pe-toggle{margin-left:0}}
 `;document.head.appendChild(css);
 const checks=model.checks,riskCount=records.filter(r=>r.decision==='Риск'||r.decision==='Наблюдать').length,negativeCount=owner?records.filter(r=>r.profitEstimate<0).length:0;
 const stat=(label,value,hint)=>'<div class="pe-stat"><div class="pe-label">'+esc(label)+'</div><div class="pe-value">'+esc(value)+'</div><div class="pe-muted">'+esc(hint)+'</div></div>';
 const stats=owner?stat('ЧП выкупов · оценка',rub(checks.profitEstimate),'Выплата ±5%: '+rub(checks.profitLow)+' … '+rub(checks.profitHigh))+stat('Результат заказов · выкуп 90%',rub(checks.order90),'При 80%: '+rub(checks.order80)+' · при 95%: '+rub(checks.order95)):
 stat('Заказы за период',num(checks.ordersQty),'Сумма с комиссией: '+rub(checks.ordersRub))+stat('Выкупы из report',num(checks.buyoutsQty),'Не отдельно сверенные продажи и возвраты');
 root.innerHTML='<div class="pe-title"><h2>'+(owner?'Оценка ЧП':'Риски рекламы')+' · '+esc(model.period.label)+'</h2><span class="pe-badge">'+(model.archivedThrough?'АРХИВ ОЦЕНКИ':'ОЦЕНКА, НЕ ФИНАНСОВЫЙ ОТЧЁТ')+'</span><button class="pe-toggle" type="button" aria-expanded="true">Свернуть</button></div><div class="pe-body">'+
 '<p class="pe-muted">'+(owner?'Два разных взгляда: прибыль выкупов за эти дни и будущий результат заказов. <b>Эти суммы нельзя складывать.</b>':'Сигналы из оценочной экономики. Они помогают ограничить неэффективную рекламу, но не заменяют финансовый отчёт.')+'</p>'+
 '<div class="pe-stats">'+stats+stat('Реклама за 12–15.11',rub(checks.ads),'ДРР '+pct(checks.ads/checks.ordersRub))+stat('SKU требуют внимания',String(riskCount),'13 рисковых + 2 пограничных')+'</div>'+
 (owner?'<p class="pe-muted">Ориентир 01–15.11: <b>'+rub(model.combinedProfit)+'</b> = '+rub(model.closedProfit)+' подтверждено по 11.11 + '+rub(checks.profitEstimate)+' оценка 12–15.11.</p>':'')+
 '<div class="pe-controls"><input class="pe-search" type="search" aria-label="Поиск SKU в оценке" placeholder="Артикул, название или номер WB"><select class="pe-group" aria-label="Группа товара"><option value="">Все группы</option>'+[...new Set(records.map(r=>r.group))].sort().map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select><button data-filter="all" aria-pressed="true">Все '+records.length+'</button><button data-filter="risk" aria-pressed="false">Риски '+riskCount+'</button>'+(owner?'<button data-filter="negative" aria-pressed="false">Минус по выкупам '+negativeCount+'</button>':'')+'<button data-filter="zero" aria-pressed="false">Реклама без заказов</button></div>'+
 '<div class="pe-count"></div><div class="pe-scroll"><table class="pe-table"><thead></thead><tbody></tbody></table></div>'+
 '<p class="pe-muted">Нажми название товара: действие и основание оценки. «Предел CPO» — расчётная безубыточность, а не рекомендуемая ставка. CPO = реклама / все заказы SKU. Период этого блока фиксирован: 12–15.11; основные фильтры истории ниже его не меняют.</p>'+
 (owner?'<details class="pe-day"><summary>Оценка проекта по дням · без фильтра товаров</summary><div class="pe-scroll"><table><thead><tr><th>Дата</th><th>Заказы</th><th>Выкупили</th><th>Реклама</th><th>ЧП: оценка</th><th>Выплата −5%</th><th>Выплата +5%</th></tr></thead><tbody>'+model.days.map(d=>'<tr>'+[d.iso.split('-').reverse().join('.'),num(d.ordersQty),num(d.buyoutsQty),rub(d.ads),rub(d.profitEstimate),rub(d.profitLow),rub(d.profitHigh)].map((s,i)=>'<td'+(i?' class="pe-n"':'')+'>'+esc(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>':'')+
 '<details class="pe-method"><summary>Методика и ограничения</summary><p class="pe-muted">Источник: '+esc(model.source)+'. Калибровка выплаты — закрытый день '+esc(model.calibrationDate)+'. Показатели подтверждённой истории не изменены.</p>'+
 (owner?(model.limitations||[]).map(t=>'<p class="pe-muted">'+esc(t)+'</p>').join(''):'<p class="pe-muted">80%, 90% и 95% — сценарии выкупа, не измеренный когортный выкуп. Сигнал не является командой удалить товар или автоматически увеличить бюджет. Суммы ЧП и себестоимость доступны только в приватном управленческом дашборде.</p>')+'</details></div>';
 const wrap=document.querySelector('.wrap')||document.body,header=wrap.querySelector('header');if(header)header.after(root);else wrap.insertBefore(root,wrap.firstChild);
 let filter='all',sortKey='default',direction=1,opened=null;
 const columns=owner?[['sku','Артикул / товар'],['ordersQty','Заказы, шт.'],['buyoutsQty','Выкупили, шт.'],['ads','Реклама, ₽'],['profitEstimate','ЧП выкупов · оценка, ₽'],['order80','Заказы · 80%, ₽'],['order90','Заказы · 90%, ₽'],['order95','Заказы · 95%, ₽'],['cpo','CPO факт, ₽'],['cap90','Предел CPO · 90%, ₽'],['status','Статус заказов']]:[['sku','Артикул / товар'],['ordersQty','Заказы, шт.'],['buyoutsQty','Выкупили, шт.'],['ads','Реклама, ₽'],['cpo','CPO факт, ₽'],['cap80','Предел CPO · 80%, ₽'],['cap90','Предел CPO · 90%, ₽'],['status','Оценка риска']];
 const priority=r=>r.decision==='Риск'?0:r.decision==='Наблюдать'?1:2;
 const normalized=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 function render(){
  const q=normalized(root.querySelector('.pe-search').value),g=root.querySelector('.pe-group').value;
  const list=records.filter(r=>(!g||r.group===g)&&(!q||normalized(r.sku+' '+r.nmId).includes(q))&&(filter==='all'||filter==='risk'&&priority(r)<2||filter==='negative'&&r.profitEstimate<0||filter==='zero'&&r.ordersQty===0&&r.ads>0));
  list.sort((a,b)=>{if(sortKey==='default')return priority(a)-priority(b)||(owner?a.order90-b.order90:b.ads-a.ads)||a.sku.localeCompare(b.sku,'ru');const x=a[sortKey],y=b[sortKey];if(x===null)return y===null?0:1;if(y===null)return-1;return(typeof x==='number'?x-y:String(x).localeCompare(String(y),'ru'))*direction;});
  root.querySelector('thead').innerHTML='<tr>'+columns.map(([k,label])=>'<th data-sort="'+k+'" tabindex="0" role="button" aria-label="Сортировать: '+esc(label)+'">'+esc(label)+(sortKey===k?(direction===1?' ↑':' ↓'):'')+'</th>').join('')+'</tr>';
  root.querySelector('.pe-count').textContent='Показано '+list.length+' из '+records.length+' SKU · заказы '+num(list.reduce((s,r)=>s+r.ordersQty,0))+' · реклама '+rub(list.reduce((s,r)=>s+r.ads,0))+(owner?' · оценка ЧП выкупов '+rub(list.reduce((s,r)=>s+r.profitEstimate,0)):'');
  root.querySelector('tbody').innerHTML=list.map(r=>{
   const ordinal=records.indexOf(r),cells=columns.map(([key])=>{
    if(key==='sku')return '<td><button class="pe-sku" data-detail="'+ordinal+'" aria-expanded="'+(opened===r.key)+'">'+esc(r.sku)+'</button><div class="pe-muted">'+(r.nmId?'WB '+esc(r.nmId):'Без номера WB · единый SKU')+'</div></td>';
    if(key==='status')return '<td class="'+(priority(r)===0?'pe-risk':priority(r)===1?'pe-watch':'pe-ok')+'">'+esc(r.status)+'</td>';
    return '<td class="pe-n '+tone(r[key])+'">'+num(r[key],['cpo','cap80','cap90'].includes(key)?1:0)+'</td>';
   }).join('');
   const detail=opened===r.key?'<tr class="pe-detail"><td colspan="'+columns.length+'"><b>'+esc(r.action)+'</b><br>Группа: '+esc(r.group)+'. '+(owner?'Поправка: '+esc(r.calibrationBasis)+'. Оценка ЧП текущих выкупов '+rub(r.profitEstimate)+'; чувствительность выплаты ±5%: '+rub(r.profitLow)+' … '+rub(r.profitHigh)+'.<br>Будущий результат заказов при выкупе 80% / 90% / 95%: '+rub(r.order80)+' / '+rub(r.order90)+' / '+rub(r.order95)+'. '+(r.breakEvenBuyout!==null?'Выкуп для безубыточности '+pct(r.breakEvenBuyout)+'. ':''):'')+'Реклама '+rub(r.ads)+'; '+num(r.ordersQty)+' заказов; CPO '+rub(r.cpo)+'. Расчётный предел при 90%: '+rub(r.cap90)+'.<br>Минус по выкупам не означает автоматически минус новых заказов. Окончательное решение о выводе SKU по четырём дням не принимается.</td></tr>':'';
   return '<tr>'+cells+'</tr>'+detail;
  }).join('')||'<tr><td colspan="'+columns.length+'">Нет товаров по выбранным условиям.</td></tr>';
 }
 root.addEventListener('click',e=>{
  const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;root.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===f)));render();}
  const s=e.target.closest('[data-sort]');if(s){if(sortKey===s.dataset.sort)direction*=-1;else{sortKey=s.dataset.sort;direction=1;}render();}
  const detail=e.target.closest('[data-detail]');if(detail){const key=records[Number(detail.dataset.detail)].key;opened=opened===key?null:key;render();}
 });
 root.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.hasAttribute('data-sort')){e.preventDefault();e.target.click();}});
 root.querySelector('.pe-search').addEventListener('input',render);root.querySelector('.pe-group').addEventListener('change',render);
 if(model.archivedThrough){const button=root.querySelector('.pe-toggle');root.querySelector('.pe-body').hidden=true;button.textContent='Показать прежнюю оценку';button.setAttribute('aria-expanded','false');}
 root.querySelector('.pe-toggle').addEventListener('click',e=>{const body=root.querySelector('.pe-body');body.hidden=!body.hidden;e.target.textContent=body.hidden?'Показать':'Свернуть';e.target.setAttribute('aria-expanded',String(!body.hidden));});
 render();
}
function applyPakkomEstimateViewV1(source){
 if(!source.includes('"estimatesV1":')||source.includes('/* PAKKOM_ESTIMATE_MOUNT_V1 */'))return source;
 const script='/* PAKKOM_ESTIMATE_MOUNT_V1 */\n'+expandPakkomEstimateV1.toString()+'\n('+mountPakkomEstimateV1.toString()+')();';
 return source.replace('</body>','<script>'+script+'</scr'+'ipt></body>');
}
if(typeof module!=='undefined'&&module.exports)module.exports={expandPakkomEstimateV1,applyPakkomEstimateDataV1,applyPakkomEstimateViewV1};
