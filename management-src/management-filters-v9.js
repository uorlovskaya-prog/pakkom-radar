/* PAKKOM_MANAGEMENT_FILTERS_V9: code-only, idempotent repair. No report data or credentials. */
function applyPakkomManagementFiltersV9(source) {
  'use strict';
  const marker='<!-- PAKKOM_MANAGEMENT_FILTERS_V9 -->';
  if(source.includes(marker)) return source;
  if(!source.includes('Пакком × LinzLab — финансовый SKU dashboard') || !source.includes('function passes(g){')) throw Error('Not the management dashboard');
  let html=source;
  function once(oldText,newText) {
    const p=html.indexOf(oldText);
    if(p<0 || html.indexOf(oldText,p+oldText.length)>=0) throw Error('Management filter patch anchor mismatch: '+oldText.slice(0,90));
    html=html.slice(0,p)+newText+html.slice(p+oldText.length);
  }
  function section(start,end,replacement) {
    const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
    if(a<0||b<0||html.indexOf(start,a+start.length)>=0) throw Error('Management filter function mismatch: '+start);
    html=html.slice(0,a)+replacement+'\n'+html.slice(b);
  }
  section('function recentSignal(g){','function signalLabel(g){',String.raw`
// Index immutable history once. Signal formulas and window thresholds are unchanged.
const managementSignalRowsV9=new Map();
for(const r of DATA.daily){const k=skuKeyOf(r);if(!managementSignalRowsV9.has(k))managementSignalRowsV9.set(k,[]);managementSignalRowsV9.get(k).push(r)}
const managementSignalDatesV9=[...new Set(DATA.daily.map(r=>r.iso))].sort();
const managementSignalWindowsV9=[managementSignalDatesV9.slice(-2),managementSignalDatesV9.slice(Math.max(0,managementSignalDatesV9.length-4),Math.max(0,managementSignalDatesV9.length-2)),managementSignalDatesV9.slice(-7),managementSignalDatesV9.slice(Math.max(0,managementSignalDatesV9.length-14),Math.max(0,managementSignalDatesV9.length-7))];
const managementSignalCacheV9=new Map();
function recentSignal(g){
 if(managementSignalCacheV9.has(g.key))return managementSignalCacheV9.get(g.key);
 const rs=managementSignalRowsV9.get(g.key)||[];
 const [a2,b2,a7,b7]=managementSignalWindowsV9.map(ds=>agg(rs.filter(r=>ds.includes(r.iso))));
 const d2=b2.ordersQty?a2.ordersQty/b2.ordersQty-1:null;
 const d7=b7.ordersQty?a7.ordersQty/b7.ordersQty-1:null;
 const dcpo=b2.cpo?a2.cpo/b2.cpo-1:null;
 const result={d2,d7,dcpo,urgentFall:Number.isFinite(d2)&&b2.ordersQty>=6&&d2<=-.35,systemFall:Number.isFinite(d7)&&b7.ordersQty>=14&&d7<=-.20,strongGrowth:Number.isFinite(d2)&&b2.ordersQty>=6&&d2>=.35,cpoWorse:Number.isFinite(dcpo)&&dcpo>=.25};
 managementSignalCacheV9.set(g.key,result);return result;
}
`);
  section('function passes(g){','function sortv(g){',String.raw`
const managementQuickSignalsV9={urgentfall:'urgentFall',systemfall:'systemFall',stronggrowth:'strongGrowth',cpoworse:'cpoWorse'};
const managementQuickNamesV9={all:'Все SKU',urgentfall:'Срочное падение 2д',systemfall:'Систематическое падение 7д',stronggrowth:'Сильный рост 2д',cpoworse:'CPO ухудшился',negative:'Минусовые',critical:'CPO критично',control:'CPO контроль',normal:'CPO норма',noads:'Без рекламы'};
function passes(g){
 const z=zone(g.m);
 if(state.cpo==='none'&&g.m.ads!==0)return false;
 if(state.cpo!=='all'&&state.cpo!=='none'&&z.code!==state.cpo)return false;
 if(state.profit==='negative'&&!(g.m.profit<0))return false;
 if(state.profit==='positive'&&!(g.m.profit>0))return false;
 const signal=managementQuickSignalsV9[state.quick];
 if(signal&&!recentSignal(g)[signal])return false;
 if(state.quick==='negative'&&!(g.m.profit<0))return false;
 if(['critical','control','normal'].includes(state.quick)&&z.code!==state.quick)return false;
 if(state.quick==='noads'&&g.m.ads!==0)return false;
 return true;
}
function syncManagementQuickV9(){
 document.querySelectorAll('.quick').forEach(b=>{const active=b.dataset.q===state.quick;b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active))});
 document.querySelectorAll('[data-sig]').forEach(b=>{const active=b.dataset.sig===state.quick;b.setAttribute('aria-pressed',String(active));b.style.boxShadow=active?'inset 0 0 0 2px var(--blue)':''});
}
function clearManagementQuickV9(){state.quick='all';syncManagementQuickV9()}
function selectManagementQuickV9(q){
 if(!Object.prototype.hasOwnProperty.call(managementQuickNamesV9,q))return;
 state.quick=q;state.expanded=null;
 // Quick selection replaces conflicting status/profit conditions, retaining dates/category/search.
 state.cpo='all';state.profit='all';$('fCpo').value='all';$('fProfit').value='all';
 syncManagementQuickV9();renderAll();
}
function managementDailyScopeV9(){
 const from=$('dateFrom').value,to=$('dateTo').value;
 return base(true).filter(r=>r.iso>=from&&r.iso<=to);
}
function renderManagementSelectionV9(){
 const target=$('managementFilterSelection');if(!target)return;
 const daily=$('daily').classList.contains('on');
 const candidates=groups(daily?managementDailyScopeV9():base());
 const selected=candidates.filter(passes);
 target.textContent=(managementQuickNamesV9[state.quick]||'Выбранный срез')+' · '+selected.length+' из '+candidates.length+' SKU';
 syncManagementQuickV9();
}
`);
  once('function signalLabel(g){\n const s=recentSignal(g);',String.raw`function signalLabel(g){
 const s=recentSignal(g);
 const chosen={urgentfall:['urgentFall','sig-urgent','Срочное падение'],systemfall:['systemFall','sig-system','Систематическое падение'],stronggrowth:['strongGrowth','sig-growth','Сильный рост'],cpoworse:['cpoWorse','sig-system','CPO ухудшился']}[state.quick];
 if(chosen&&s[chosen[0]])return '<span class="signal-pill '+chosen[1]+'">'+chosen[2]+'</span>';`);
  once('  if(r.iso<MANAGEMENT_START)return false;','  if(!ignoreWeek&&r.iso<MANAGEMENT_START)return false;');
  once('<div class="tabs">','<div id="managementFilterSelection" class="hint" role="status" aria-live="polite" style="padding:4px 0 8px"></div>\n<div class="tabs">');
  once("const from=$('dateFrom').value,to=$('dateTo').value,rows=base(true).filter(r=>r.iso>=from&&r.iso<=to),m=new Map();", "const rows=groups(managementDailyScopeV9()).filter(passes).flatMap(g=>g.rows),m=new Map();");
  once("});$('dailyTable').innerHTML=h;", "});if(!arr.length)h+='<tr><td colspan=\"10\" style=\"text-align:center;padding:18px\">Нет SKU по текущим фильтрам</td></tr>';$('dailyTable').innerHTML=h;renderManagementSelectionV9();");
  once("document.querySelectorAll('[data-sig]').forEach(x=>x.onclick=()=>{state.quick=x.dataset.sig;state.expanded=null;document.querySelectorAll('.quick').forEach(b=>b.classList.toggle('on',b.dataset.q===state.quick));renderWeekly()});", "document.querySelectorAll('[data-sig]').forEach(x=>{x.setAttribute('role','button');x.tabIndex=0;x.onclick=()=>selectManagementQuickV9(x.dataset.sig);x.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectManagementQuickV9(x.dataset.sig)}}});syncManagementQuickV9();");
  once("function renderWeekly(){renderKpis();renderWeeks();renderSignalQueue();renderSku();syncSort()}","function renderWeekly(){renderKpis();renderWeeks();renderSignalQueue();renderSku();syncSort();renderManagementSelectionV9()}");
  once("document.querySelectorAll('.quick').forEach(b=>b.onclick=()=>{state.quick=b.dataset.q;document.querySelectorAll('.quick').forEach(x=>x.classList.toggle('on',x===b));state.expanded=null;renderWeekly()});", "document.querySelectorAll('.quick').forEach(b=>b.onclick=()=>selectManagementQuickV9(b.dataset.q));");
  once("$('fCpo').onchange=e=>{state.cpo=e.target.value;state.expanded=null;renderWeekly()};", "$('fCpo').onchange=e=>{state.cpo=e.target.value;state.expanded=null;clearManagementQuickV9();renderAll()};");
  once("$('fProfit').onchange=e=>{state.profit=e.target.value;state.expanded=null;renderWeekly()};", "$('fProfit').onchange=e=>{state.profit=e.target.value;state.expanded=null;clearManagementQuickV9();renderAll()};");
  once("if(b.dataset.tab==='daily')renderDaily()});", "if(b.dataset.tab==='daily')renderDaily();renderManagementSelectionV9()});");
  once('</head>',marker+'\n</head>');
  return html;
}
if(typeof module!=='undefined'&&module.exports)module.exports={applyPakkomManagementFiltersV9};
