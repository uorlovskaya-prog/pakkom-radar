/* PAKKOM_SIGNALS_V11_BEGIN
   Orders, advertising and demand are independent. Read immutable source rows.
   Calendar windows end on the last loaded report date, never on wall-clock today.
*/
function createPakkomSignalsV11(rows, keyOf) {
 'use strict';
 const DAY=86400000,day=s=>Date.parse(s+'T00:00:00Z'),iso=t=>new Date(t).toISOString().slice(0,10);
 const amount=v=>typeof v==='number'&&Number.isFinite(v)?v:0;
 const median=a=>{const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
 const dates=[...new Set(rows.map(r=>r.iso))].sort(),coverage=new Set(dates),last=dates.at(-1),lastDay=day(last);
 const registry=new Map(),cache=new Map();
 for(const r of rows){const k=keyOf(r);if(!registry.has(k))registry.set(k,[]);registry.get(k).push(r)}
 for(const a of registry.values())a.sort((a,b)=>a.iso.localeCompare(b.iso));
 function span(length,offset=0){return Array.from({length},(_,i)=>iso(lastDay-(offset+length-1-i)*DAY))}
 function evaluate(key){
  if(cache.has(key))return cache.get(key);
  const source=registry.get(key)||[],first=source[0]?.iso,byDay=new Map();
  for(const r of source){if(!byDay.has(r.iso))byDay.set(r.iso,[]);byDay.get(r.iso).push(r)}
  function sum(ds){
   const s={ordersQty:0,ordersRub:0,ads:0,buyoutsQty:0};
   for(const d of ds)for(const r of byDay.get(d)||[])for(const k of Object.keys(s))s[k]+=amount(r[k]);
   s.cpo=s.ordersQty>0?s.ads/s.ordersQty:null;
   return {...s,from:ds[0],to:ds.at(-1),days:ds.length,complete:ds.every(d=>coverage.has(d)),established:!!first&&first<=ds[0]};
  }
  const delta=(a,b)=>b>0?a/b-1:null;
  function pair(n){const cur=sum(span(n)),prev=sum(span(n,n));return {cur,prev,dO:delta(cur.ordersQty,prev.ordersQty),dAds:delta(cur.ads,prev.ads),dCpo:cur.cpo!==null&&prev.cpo>0?cur.cpo/prev.cpo-1:null,valid:cur.complete&&prev.complete&&prev.established}}
  const c2=pair(2),c7=pair(7),cur5=sum(span(5)),past5a=sum(span(5,7)),past5b=sum(span(5,14));
  const expected5=(past5a.ordersQty+past5b.ordersQty)/2,expectedAds5=(past5a.ads+past5b.ads)/2;
  const dayComparison=span(5).map(d=>{const t=day(d),previous=[iso(t-7*DAY),iso(t-14*DAY)],cur=sum([d]).ordersQty,base=sum(previous).ordersQty/2;return {date:d,current:cur,baseline:base,below:base>0&&cur<=base*.7}});
  const c5={cur:cur5,prev:{ordersQty:expected5,ads:expectedAds5},baselines:[past5a,past5b],dO:delta(cur5.ordersQty,expected5),dAds:delta(cur5.ads,expectedAds5),belowDays:dayComparison.filter(d=>d.below).length,days:dayComparison,valid:cur5.complete&&past5a.complete&&past5b.complete&&past5b.established};
  const priorWeeks=[1,2,3,4].map(n=>sum(span(7,7*n))).filter(w=>w.complete&&w.established),baselineWeek=priorWeeks.length>=2?median(priorWeeks.map(w=>w.ordersQty)):null;
  const long={cur:c7.cur,baselineWeek,priorWeeks,dO:baselineWeek>0?c7.cur.ordersQty/baselineWeek-1:null,valid:c7.cur.complete&&priorWeeks.length>=2};
  const cur3=sum(span(3)),before3=sum(span(7,3));
  const urgentFall=c2.valid&&c2.prev.ordersQty>=6&&c2.dO<=-.35&&c2.prev.ordersQty-c2.cur.ordersQty>=3;
  const systemFall=c7.valid&&c7.prev.ordersQty>=14&&c7.dO<=-.20&&c7.prev.ordersQty-c7.cur.ordersQty>=5;
  const sustainedFall=c5.valid&&expected5>=10&&c5.dO<=-.35&&expected5-cur5.ordersQty>=5&&c5.belowDays>=4;
  const longFall=long.valid&&baselineWeek>=28&&long.dO<=-.30&&baselineWeek-c7.cur.ordersQty>=10&&c7.prev.ordersQty<=baselineWeek*.85;
  const stopped=cur3.complete&&before3.complete&&before3.established&&cur3.ordersQty===0&&before3.ordersQty>=7;
  const inactive=c7.cur.complete&&c7.cur.established&&c7.cur.ordersQty===0&&source.reduce((v,r)=>v+amount(r.ordersQty),0)>=14;
  const adsNoOrders=cur3.complete&&cur3.established&&cur3.ordersQty===0&&cur3.ads>0;
  const criticalFall=stopped||(sustainedFall&&c5.dO<=-.50&&expected5-cur5.ordersQty>=10)||(systemFall&&c7.dO<=-.50&&c7.prev.ordersQty-c7.cur.ordersQty>=14)||(longFall&&long.dO<=-.50);
  const strongGrowth=c2.valid&&c2.prev.ordersQty>=6&&c2.dO>=.35&&c2.cur.ordersQty-c2.prev.ordersQty>=3;
  const systemGrowth=c7.valid&&c7.prev.ordersQty>=14&&c7.dO>=.20&&c7.cur.ordersQty-c7.prev.ordersQty>=5;
  const cpoWorse=[c2,c7].some((c,i)=>c.valid&&c.cur.ads>0&&c.prev.ads>0&&c.cur.ordersQty>=(i?14:6)&&c.prev.ordersQty>=(i?14:6)&&c.dCpo>=.25);
  const lastRate=field=>[...source].reverse().find(r=>Number.isFinite(r[field]))?.[field]??null;
  const cpoStd=lastRate('cpoStd'),cpoMax=lastRate('cpoMax');
  let cpoCode='unknown';
  if(c7.cur.complete){if(c7.cur.ads===0)cpoCode='none';else if(c7.cur.ordersQty===0)cpoCode='critical';else if(cpoMax!==null&&c7.cur.cpo>cpoMax)cpoCode='critical';else if(cpoStd!==null)cpoCode=c7.cur.cpo>cpoStd?'control':'normal'}
  const demandFall=urgentFall||systemFall||sustainedFall||longFall||stopped||inactive;
  const comparisons=[sustainedFall?[c5.dO,(expected5-cur5.ordersQty)*7/5]:null,systemFall?[c7.dO,c7.prev.ordersQty-c7.cur.ordersQty]:null,longFall?[long.dO,baselineWeek-c7.cur.ordersQty]:null,urgentFall?[c2.dO,(c2.prev.ordersQty-c2.cur.ordersQty)*7/2]:null].filter(Boolean);
  const lostPace=Math.max(0,...comparisons.map(c=>c[1]));
  let priority=criticalFall||adsNoOrders||cpoCode==='critical'?1:demandFall||cpoCode==='control'||cpoWorse?2:strongGrowth||systemGrowth?3:4;
  const labels=[];
  if(stopped)labels.push('Нет заказов 3 дня');
  if(inactive&&!stopped)labels.push('Нет заказов 7 дней');
  if(criticalFall&&!stopped)labels.push('Критическое падение заказов');
  if(sustainedFall)labels.push('Устойчивое падение 5 дней');
  if(longFall)labels.push('Длительное снижение');
  if(systemFall)labels.push('Падение за неделю');
  if(urgentFall)labels.push('Падение за 2 дня');
  if(adsNoOrders)labels.push('Реклама без заказов 3 дня');
  if(cpoCode==='critical')labels.push(c7.cur.ordersQty===0?'Расход рекламы без заказов':'CPO выше максимума');
  else if(cpoCode==='control')labels.push('CPO выше стандарта');
  if(cpoWorse)labels.push('CPO ухудшился');
  if(strongGrowth)labels.push(demandFall?'Отскок за 2 дня':'Рост за 2 дня');
  if(systemGrowth)labels.push(demandFall?'Отскок за неделю':'Рост за неделю');
  if(!labels.length)labels.push(!c7.valid?'Недостаточно истории':'Нет порогового сигнала');
  const actions=[];
  if(demandFall){
   actions.push('Сегодня: проверить доступный остаток по складам и срок доставки карточки.');
   if(c5.valid&&c5.dAds<=-.3)actions.push('Проверить снижение расхода рекламы: активность кампаний, бюджет, показы и позиции.');
   else actions.push('Сопоставить показы, переходы и конверсию в заказ; проверить цену и участие в акциях.');
   actions.push(cpoCode==='critical'||adsNoOrders?'Ограничить кампании с дорогим заказом после проверки; проверить результат на следующий день.':'Сохранить рабочие кампании в пределах норматива CPO; после проверки причин контролировать заказы ежедневно.');
  }else if(adsNoOrders||cpoCode==='critical'){
   actions.push('Сегодня: проверить кампании с расходом и без заказов, наличие товара и доступность карточки.');
   actions.push('Сопоставить расходы и заказы по кампаниям; ограничить неэффективные ставки, затем проверить конверсию.');
  }else if(cpoCode==='control'||cpoWorse){
   actions.push('В течение 1–2 дней: проверить рост ставок, поисковые фразы и конверсию; бюджет расширять после возврата CPO в норматив.');
  }else if(strongGrowth||systemGrowth){
   actions.push('Проверить запас по складам на текущий темп и срок следующей поставки.');
   actions.push(cpoCode==='normal'?'После проверки остатков и маржи увеличить бюджет небольшим шагом и сравнить CPO и заказы.':'Сначала подтвердить остатки и экономику, затем решить вопрос об увеличении рекламы.');
  }else actions.push('Плановый контроль заказов, остатков и CPO; следующая проверка после загрузки нового дня.');
  const result={key,asOf:last,priority,labels,actions,c2,c7,c5,long,cur3,cpoCode,cpoStd,cpoMax,cpoWorse,urgentFall,systemFall,sustainedFall,longFall,stopped,inactive,adsNoOrders,criticalFall,demandFall,strongGrowth,systemGrowth,lostPace,d2:c2.dO,d7:c7.dO,dcpo:c2.dCpo,complete:c7.cur.complete};
  cache.set(key,result);return result;
 }
 return {evaluate,keys:[...registry.keys()],asOf:last,dates};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPakkomSignalsV11};
/* PAKKOM_SIGNALS_V11_END */
