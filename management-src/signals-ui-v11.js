/* PAKKOM_SIGNALS_UI_V11_BEGIN */
const signalEngineV11=createPakkomSignalsV11(DATA.daily,canonicalSkuKey);
const signalFiltersV11={criticalfall:'criticalFall',sustainedfall:'sustainedFall',longfall:'longFall',stopped:'stopped',inactive:'inactive',urgentfall:'urgentFall',systemfall:'systemFall',stronggrowth:'strongGrowth',systemgrowth:'systemGrowth',cpoworse:'cpoWorse'};
const signalNamesV11={criticalfall:'Критическое падение',sustainedfall:'Устойчивое падение 5д',longfall:'Длительное снижение',stopped:'Нет заказов 3д',inactive:'Нет заказов 7д',urgentfall:'Падение 2д',systemfall:'Падение 7д',stronggrowth:'Рост / отскок 2д',systemgrowth:'Рост / отскок 7д',cpoworse:'CPO ухудшился',cporisk:'CPO выше нормы 7д'};
const decimalV11=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
const sdV11=v=>v?String(v).split('-').reverse().join('.'):'—';
const rangeV11=s=>sdV11(s.from)+' — '+sdV11(s.to);
const cpoNamesV11={normal:'в норме',control:'выше стандарта',critical:'критично',none:'без рекламы',unknown:'нет норматива / данных'};
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
/* PAKKOM_PRIMARY_SIGNAL_V15: presentation only; all engine flags remain filterable. */
function primarySignalBadgeV15(s){
 const rank=['Реклама без заказов 3 дня','Нет заказов 3 дня','Критическое падение заказов','Расход рекламы без заказов','CPO выше максимума','Нет заказов 7 дней','Устойчивое падение 5 дней','Длительное снижение','Падение за неделю','Падение за 2 дня','CPO выше стандарта','CPO ухудшился','Рост за 2 дня','Рост за неделю','Отскок за 2 дня','Отскок за неделю'];
 const label=rank.find(x=>s.labels.includes(x))||s.labels[0];
 return signalBadgeV11({...s,labels:label?[label]:[]});
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
function signalActionV11(g){const s=signalEngineV11.evaluate(g.key);return `<b>${s.priority===1?'Сегодня':s.priority===2?'Проверить в течение 1–2 дней':s.priority===3?'Проверить запас для роста':'Планово'}</b><div>${esc(s.actions[0])}</div>`}
function signalEvidenceV11(g){
 const s=signalEngineV11.evaluate(g.key),c=s.c5,l=s.long;
 const five=c.valid?`${num(c.cur.ordersQty)} против ${decimalV11.format(c.prev.ordersQty)} (${pct(c.dO)})`:'Недостаточно истории';
 const week=s.c7.valid?`${num(s.c7.cur.ordersQty)} против ${num(s.c7.prev.ordersQty)} (${pct(s.c7.dO)})`:'Недостаточно истории';
 const long=l.valid?`${num(l.cur.ordersQty)} против ${decimalV11.format(l.baselineWeek)} (${pct(l.dO)})`:'Нужно минимум две полные предыдущие недели';
 return `<details class="signal-evidence-v11 signal-evidence-collapsed-v15"><summary>Что требует внимания <span class="hint">на ${sdV11(s.asOf)}</span></summary><div class="signal-evidence-body-v15"><div>${signalBadgeV11(s)}</div><div class="signal-evidence-grid-v11">
 <div><b>Последние 5 дней · ${rangeV11(c.cur)}</b><p>${five}</p><span>Сравнение с теми же днями недели: ${c.baselines.map(rangeV11).join('; ')}. Ниже 70% своего дневного уровня: ${c.belowDays} из 5 дней.</span></div>
 <div><b>Неделя к неделе</b><p>${week}</p><span>${rangeV11(s.c7.cur)} против ${rangeV11(s.c7.prev)}.</span></div>
 <div><b>Относительно прежнего уровня</b><p>${long}</p><span>Обычный уровень — медиана ${l.priorWeeks.length} предыдущих полных недель; единичный высокий день не является отдельной базой сравнения.</span></div>
 <div><b>Реклама за ${rangeV11(s.c7.cur)}</b><p>CPO: ${money(s.c7.cur.cpo)} · ${cpoNamesV11[s.cpoCode]}</p><span>Расход: ${money(s.c7.cur.ads)}. Стандарт: ${money(s.cpoStd)}; максимум: ${money(s.cpoMax)}.</span></div></div>
 <h3>Следующие действия</h3><ol>${s.actions.map(a=>'<li>'+esc(a)+'</li>').join('')}</ol><div class="hint">Остатки, сроки доставки, показы и конверсия в этих данных отсутствуют: перечислены проверки возможных причин, а не установленная причина падения.</div></div></details>`;
}
function priorityCandidatesV11(){
 const rs=DATA.daily.filter(r=>(state.cat==='all'||r.category===state.cat)&&(state.sub==='all'||r.subcategory===state.sub)&&(!state.search||matchesSkuSearch(r,state.search)));
 return groups(rs).map(g=>({g,s:signalEngineV11.evaluate(g.key)})).filter(x=>x.s.priority<4).sort((a,b)=>a.s.priority-b.s.priority||b.s.lostPace-a.s.lostPace||b.s.c7.cur.ads-a.s.c7.cur.ads||a.g.sku.localeCompare(b.g.sku,'ru'));
}
function openSignalSkuV11(key){
 if(SIGNAL_SITE_MODE_V11==='radar'){
  state.status='all';$('fStatus').value='all';
  if(!baseRows().some(r=>canonicalSkuKey(r)===key)){state.base='all';state.from=rangeFirstV17;state.to=rangeLastV17}
 }else{
  state.cpo='all';state.profit='all';$('fCpo').value='all';$('fProfit').value='all';
  if(!base().some(r=>canonicalSkuKey(r)===key)){state.week='history';state.from=rangeFirstV17;state.to=rangeLastV17}
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.tab==='weekly'));document.querySelectorAll('.section').forEach(x=>x.classList.toggle('on',x.id==='weekly'));
 }
 syncRangeV17();state.quick='all';state.expanded=key;renderAll();
 const row=[...document.querySelectorAll('tr.skurow')].find(x=>(x.dataset.key||x.dataset.k)===key);if(row)row.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderPrioritiesV11(){
 const target=$('priorityListV11');if(!target)return;
 const all=priorityCandidatesV11(),visible=allPrioritiesV11?all:all.slice(0,12),p1=all.filter(x=>x.s.priority===1).length,p2=all.filter(x=>x.s.priority===2).length;
 $('priorityCountsV11').textContent=`Сегодня: ${p1} · Проверить: ${p2}`;
 syncPrioritiesToggleV11();
 $('prioritySummaryV11').textContent=`Данные по ${sdV11(signalEngineV11.asOf)} · Сегодня: ${p1} SKU · Проверить в течение 1–2 дней: ${p2} SKU. Сначала срочность, затем снижение темпа заказов. Категория и поиск учитываются; выбранные даты и фильтр CPO не скрывают риски здесь.`;
 target.innerHTML=visible.length?visible.map(({g,s})=>`<article class="priority-item-v11"><div><span class="priority-level-v11 p${s.priority}">${s.priority===1?'1 · Сегодня':s.priority===2?'2 · Проверить':'3 · Рост'}</span><button class="priority-sku-v11" data-open-signal="${esc(g.key)}">${esc(g.sku)}</button><div class="hint">WB ${esc(g.nmId||'—')}</div></div><div>${signalBadgeV11(s)}<p>${signalSummaryV11(s)}</p><div class="hint">CPO 7д ${money(s.c7.cur.cpo)} · ${cpoNamesV11[s.cpoCode]}</div></div><div>${esc(s.actions[0])}<details><summary>Все проверки</summary><ol>${s.actions.slice(1).map(x=>'<li>'+esc(x)+'</li>').join('')}</ol></details></div></article>`).join(''):'Нет товаров с пороговыми сигналами в выбранной категории / поиске.';
 if(all.length>12)target.innerHTML+=`<button id="allPrioritiesV11">${allPrioritiesV11?'Свернуть до 12':'Показать все '+all.length+' SKU с сигналами'}</button>`;
 document.querySelectorAll('[data-open-signal]').forEach(b=>b.onclick=()=>openSignalSkuV11(b.dataset.openSignal));
 if($('allPrioritiesV11'))$('allPrioritiesV11').onclick=()=>{allPrioritiesV11=!allPrioritiesV11;renderPrioritiesV11()};
}
/* PAKKOM_SIGNALS_UI_V11_END */
