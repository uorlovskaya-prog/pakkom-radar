/* PAKKOM_SIGNALS_UI_V11_BEGIN */
const signalEngineV11=createPakkomSignalsV11(DATA.daily,canonicalSkuKey);
const signalFiltersV11={criticalfall:'criticalFall',sustainedfall:'sustainedFall',longfall:'longFall',stopped:'stopped',inactive:'inactive',urgentfall:'urgentFall',systemfall:'systemFall',stronggrowth:'strongGrowth',systemgrowth:'systemGrowth',cpoworse:'cpoWorse'};
const signalNamesV11={criticalfall:'Критическое падение',sustainedfall:'Устойчивое падение 5д',longfall:'Длительное снижение',stopped:'Нет заказов 3д',inactive:'Нет заказов 7д',urgentfall:'Падение 2д',systemfall:'Падение 7д',stronggrowth:'Рост / отскок 2д',systemgrowth:'Рост / отскок 7д',cpoworse:'CPO ухудшился',cporisk:'CPO выше нормы 7д'};
const decimalV11=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
const sdV11=v=>v?String(v).split('-').reverse().join('.'):'—';
const rangeV11=s=>sdV11(s.from)+' — '+sdV11(s.to);
const cpoNamesV11={normal:'в норме',control:'выше стандарта',critical:'критично',none:'без рекламы',unknown:'нет норматива / данных'};
/* PAKKOM_COMPACT_TABLE_V12 */
let showAllColumnsV12=false;
const compactKeysV12=SIGNAL_SITE_MODE_V11==='owner'
 ?['signal','sku','ordersRub','ordersQty','ads','drr','cpo','buyoutsQty','buyout','profit','margin','roi']
 :['signal','sku','ordersRub','ordersQty','buyoutsQty','buyout','ads','cpo','roi','urgentDelta','systemDelta'];
const columnWeightsV12={signal:140,sku:235,ordersRub:118,ordersQty:64,ads:100,drr:52,cpo:65,buyoutsQty:75,buyout:60,profit:112,margin:60,roi:60,urgentDelta:82,systemDelta:82,status:95,subcategory:100,avgOrdersDay:65,profitPerBuyout:85,cpoStd:65,cpoMax:65,zone:80,action:150};
function visibleColumnsV12(all){return showAllColumnsV12?all:all.filter(c=>compactKeysV12.includes(c[0]))}
function columnsMarkupV12(all){const cs=visibleColumnsV12(all),total=cs.reduce((n,c)=>n+(columnWeightsV12[c[0]]||70),0);return '<colgroup>'+cs.map(c=>`<col style="width:${(columnWeightsV12[c[0]]||70)*100/total}%">`).join('')+'</colgroup>'}
function syncColumnsV12(){
 const b=$('columnsToggleV12');if(!b)return;
 b.textContent=showAllColumnsV12?'Основные показатели':'Все показатели';b.setAttribute('aria-pressed',String(showAllColumnsV12));
 b.onclick=()=>{showAllColumnsV12=!showAllColumnsV12;SIGNAL_SITE_MODE_V11==='owner'?renderSku():renderTable()};
}
function signalTableBadgeV12(s){
 const important=[...s.labels];
 if(s.cpoCode==='critical'&&!s.criticalFall){const i=important.findIndex(x=>x.includes('CPO выше')||x.includes('Расход рекламы'));if(i>0)important.unshift(important.splice(i,1)[0])}
 const shown=important.slice(0,2),extra=important.length-shown.length;
 return signalBadgeV11({...s,labels:shown})+(extra?`<span class="more-signals-v12" title="${esc(important.slice(2).join('; '))}">ещё ${extra} · в карточке</span>`:'');
}
function nextStepV12(s){
 if(s.demandFall)return 'Проверить остатки и сроки доставки. Затем — показы и конверсию.';
 if(s.adsNoOrders||s.cpoCode==='critical')return 'Проверить кампании с дорогими заказами или расходом без заказов.';
 if(s.cpoCode==='control'||s.cpoWorse)return 'Проверить ставки и конверсию рекламы.';
 if(s.strongGrowth||s.systemGrowth)return 'Проверить запас товара и возможность увеличить продажи.';
 return 'Продолжать плановый контроль заказов и рекламы.';
}
function focusComparisonV12(s){
 if(s.sustainedFall)return {cur:s.c5.cur,base:s.c5.prev.ordersQty,delta:s.c5.dO,label:'За последние 5 дней',basis:'с обычным темпом за сопоставимые дни',valid:s.c5.valid};
 if(s.longFall)return {cur:s.c7.cur,base:s.long.baselineWeek,delta:s.long.dO,label:'За последние 7 дней',basis:'с прежним недельным темпом',valid:s.long.valid};
 if(s.urgentFall&&!s.systemFall)return {cur:s.c2.cur,base:s.c2.prev.ordersQty,delta:s.c2.dO,label:'За последние 2 дня',basis:'с предыдущими 2 днями',valid:s.c2.valid};
 return {cur:s.c7.cur,base:s.c7.prev.ordersQty,delta:s.c7.dO,label:'За последние 7 дней',basis:'с предыдущими 7 днями',valid:s.c7.valid};
}

let allPrioritiesV11=false;
const prioritiesStorageKeyV11='pakkom-priorities-expanded-v11:'+SIGNAL_SITE_MODE_V11;
let prioritiesExpandedV11=false;
try{prioritiesExpandedV11=localStorage.getItem(prioritiesStorageKeyV11)==='true'}catch(e){}
function syncPrioritiesToggleV11(){
 const body=$('priorityBodyV11'),button=$('priorityToggleV11');if(!body||!button)return;
 body.hidden=!prioritiesExpandedV11;
 button.setAttribute('aria-expanded',String(prioritiesExpandedV11));
 button.textContent=prioritiesExpandedV11?'Скрыть':'Показать';
 button.onclick=()=>{
  prioritiesExpandedV11=!prioritiesExpandedV11;
  try{localStorage.setItem(prioritiesStorageKeyV11,String(prioritiesExpandedV11))}catch(e){}
  syncPrioritiesToggleV11();
 };
}
function signalMatchesV11(s,q){return q==='cporisk'?['control','critical'].includes(s.cpoCode):signalFiltersV11[q]?s[signalFiltersV11[q]]:true}
function signalBadgeV11(s){
 return s.labels.map((x,i)=>`<span class="signal signal-pill ${s.priority===1?'sig-urgent':s.priority===2?'sig-system':s.priority===3?'sig-growth':'sig-none'}">${esc(x)}</span>`).join(' ');
}
function signalSummaryV11(s){
 if(s.stopped)return '0 заказов за '+rangeV11(s.cur3);
 if(s.inactive)return '0 заказов за '+rangeV11(s.c7.cur);
 if(s.sustainedFall)return '5 дней: '+num(s.c5.cur.ordersQty)+' против '+decimalV11.format(s.c5.prev.ordersQty)+' · '+pct(s.c5.dO);
 if(s.longFall)return '7 дней: '+num(s.c7.cur.ordersQty)+' против обычных '+decimalV11.format(s.long.baselineWeek)+' · '+pct(s.long.dO);
 if(s.systemFall||s.systemGrowth)return '7 дней: '+num(s.c7.cur.ordersQty)+' против '+num(s.c7.prev.ordersQty)+' · '+pct(s.c7.dO);
 if(s.urgentFall||s.strongGrowth)return '2 дня: '+num(s.c2.cur.ordersQty)+' против '+num(s.c2.prev.ordersQty)+' · '+pct(s.c2.dO);
 return 'CPO за 7 дней: '+money(s.c7.cur.cpo)+' · '+cpoNamesV11[s.cpoCode];
}
function signalActionV11(g){const s=signalEngineV11.evaluate(g.key);return `<b>${s.priority===1?'Сегодня':s.priority===2?'За 1–2 дня':s.priority===3?'Рост':'Планово'}</b><div>${nextStepV12(s)}</div>`}
function signalEvidenceV11(g){
 const s=signalEngineV11.evaluate(g.key),c=s.c5,l=s.long,f=focusComparisonV12(s);
 let headline='Пока недостаточно истории для сравнения';
 if(s.stopped)headline='За последние 3 дня — ни одного заказа';
 else if(s.inactive)headline='За последние 7 дней — ни одного заказа';
 else if(f.valid&&Number.isFinite(f.delta))headline=f.delta<0?'Заказов меньше на '+pct(-f.delta):f.delta>0?'Заказов больше на '+pct(f.delta):'Количество заказов не изменилось';
 const daily=v=>decimalV11.format(v/f.cur.days)+' в день';
 const comparison=(title,cur,base,change,valid)=>`<tr><td><b>${title}</b><div class="hint">${rangeV11(cur)}</div></td><td class="num">${valid?decimalV11.format(base):'—'}</td><td class="num">${num(cur.ordersQty)}</td><td class="num">${valid?pct(change):'Недостаточно истории'}</td></tr>`;
 return `<section class="signal-evidence-v11"><div class="diagnosis-head-v12"><h3>${headline}</h3><span class="hint">На ${sdV11(s.asOf)}</span></div>
 <p class="diagnosis-period-v12">${f.label}: ${rangeV11(f.cur)}. Сравнение ${f.basis}.</p>
 <div class="diagnosis-metrics-v12"><div><span>Раньше</span><b>${f.valid?daily(f.base):'—'}</b></div><div><span>Сейчас</span><b>${daily(f.cur.ordersQty)}</b></div><div><span>Цена заказа · 7 дней</span><b>${money(s.c7.cur.cpo)}</b><span>${cpoNamesV11[s.cpoCode]}</span></div></div>
 ${s.demandFall&&s.cpoCode==='normal'?'<p class="diagnosis-warning-v12">CPO в норме, но объём заказов падает — товар требует внимания.</p>':''}
 <p class="diagnosis-action-v12"><b>Что проверить:</b> ${nextStepV12(s)}</p>
 <details class="diagnosis-details-v12"><summary>Расчёты и следующие действия</summary><div class="diagnosis-details-body-v12"><div>${signalBadgeV11(s)}</div>
 <table class="comparison-table-v12"><colgroup><col style="width:46%"><col style="width:18%"><col style="width:18%"><col style="width:18%"></colgroup><thead><tr><th>Сравнение</th><th>Было, заказов</th><th>Стало, заказов</th><th>Изменение</th></tr></thead><tbody>
 ${comparison('Последние 2 дня',s.c2.cur,s.c2.prev.ordersQty,s.c2.dO,s.c2.valid)}
 ${comparison('Последние 5 дней',c.cur,c.prev.ordersQty,c.dO,c.valid)}
 ${comparison('Неделя к неделе',s.c7.cur,s.c7.prev.ordersQty,s.c7.dO,s.c7.valid)}
 ${comparison('Неделя к прежнему уровню',l.cur,l.baselineWeek,l.dO,l.valid)}
 </tbody></table><p class="hint">Для 5 дней «было» — среднее число заказов за ${c.baselines.map(rangeV11).join(' и ')}. Для прежнего недельного уровня используется медиана ${l.priorWeeks.length} предыдущих недель.</p>
 <p>Реклама за ${rangeV11(s.c7.cur)}: ${money(s.c7.cur.ads)}. CPO: ${money(s.c7.cur.cpo)}; стандарт: ${money(s.cpoStd)}, максимум: ${money(s.cpoMax)}.</p>
 <h3>Следующие действия</h3><ol>${s.actions.map(a=>'<li>'+esc(a)+'</li>').join('')}</ol><p class="hint">Причина падения пока не установлена: для проверки нужны остатки, сроки доставки, показы и конверсия.</p></div></details></section>`;
}

function priorityCandidatesV11(){
 const rs=DATA.daily.filter(r=>(state.cat==='all'||r.category===state.cat)&&(state.sub==='all'||r.subcategory===state.sub)&&(!state.search||matchesSkuSearch(r,state.search)));
 return groups(rs).map(g=>({g,s:signalEngineV11.evaluate(g.key)})).filter(x=>x.s.priority<4).sort((a,b)=>a.s.priority-b.s.priority||b.s.lostPace-a.s.lostPace||b.s.c7.cur.ads-a.s.c7.cur.ads||a.g.sku.localeCompare(b.g.sku,'ru'));
}
function openSignalSkuV11(key){
 if(SIGNAL_SITE_MODE_V11==='radar'){
  state.base='all';state.from=firstDate;state.to=lastDate;state.status='all';$('fBase').value='all';$('fStatus').value='all';document.querySelectorAll('.customBase').forEach(x=>x.style.display='none');
 }else{state.week='all';state.cpo='all';state.profit='all';$('fWeek').value='all';$('fCpo').value='all';$('fProfit').value='all';document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.tab==='weekly'));document.querySelectorAll('.section').forEach(x=>x.classList.toggle('on',x.id==='weekly'))}
 state.quick='all';state.expanded=key;renderAll();
 const row=[...document.querySelectorAll('tr.skurow')].find(x=>(x.dataset.key||x.dataset.k)===key);if(row)row.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderPrioritiesV11(){
 const target=$('priorityListV11');if(!target)return;
 const all=priorityCandidatesV11(),visible=allPrioritiesV11?all:all.slice(0,12),p1=all.filter(x=>x.s.priority===1).length,p2=all.filter(x=>x.s.priority===2).length;
 $('priorityCountsV11').textContent=`Сегодня: ${p1} · Проверить: ${p2}`;
 syncPrioritiesToggleV11();
 $('prioritySummaryV11').textContent=`Данные по ${sdV11(signalEngineV11.asOf)} · Сегодня: ${p1} SKU · Проверить в течение 1–2 дней: ${p2} SKU. Сначала срочность, затем снижение темпа заказов. Категория и поиск учитываются; выбранная неделя и фильтр CPO не скрывают риски здесь.`;
 target.innerHTML=visible.length?visible.map(({g,s})=>`<article class="priority-item-v11"><div><span class="priority-level-v11 p${s.priority}">${s.priority===1?'1 · Сегодня':s.priority===2?'2 · Проверить':'3 · Рост'}</span><button class="priority-sku-v11" data-open-signal="${esc(g.key)}">${esc(g.sku)}</button><div class="hint">WB ${esc(g.nmId||'—')}</div></div><div>${signalBadgeV11(s)}<p>${signalSummaryV11(s)}</p><div class="hint">CPO 7д ${money(s.c7.cur.cpo)} · ${cpoNamesV11[s.cpoCode]}</div></div><div>${nextStepV12(s)}<details><summary>Все проверки</summary><ol>${s.actions.map(x=>'<li>'+esc(x)+'</li>').join('')}</ol></details></div></article>`).join(''):'Нет товаров с пороговыми сигналами в выбранной категории / поиске.';
 if(all.length>12)target.innerHTML+=`<button id="allPrioritiesV11">${allPrioritiesV11?'Свернуть до 12':'Показать все '+all.length+' SKU с сигналами'}</button>`;
 document.querySelectorAll('[data-open-signal]').forEach(b=>b.onclick=()=>openSignalSkuV11(b.dataset.openSignal));
 if($('allPrioritiesV11'))$('allPrioritiesV11').onclick=()=>{allPrioritiesV11=!allPrioritiesV11;renderPrioritiesV11()};
}
/* PAKKOM_SIGNALS_UI_V11_END */
