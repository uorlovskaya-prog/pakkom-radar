const PAKKOM_AD_ADJUSTMENTS_V1=[{"iso":"2026-10-28","sku":"пакеты крафт 220х120х250 кр ручка 10 шт","nmId":"1906086906","before":0.0,"after":1000.0},{"iso":"2026-10-28","sku":"пакеты крафт 220х120х250 кр ручка 25 шт","nmId":"1906114868","before":0.0,"after":2618.0},{"iso":"2026-10-28","sku":"пакеты крафт 320х200х370 кр ручка 10 шт","nmId":"1906153466","before":0.0,"after":2977.0},{"iso":"2026-10-28","sku":"пакеты крафт 320х200х370 кр ручка 25 шт","nmId":"1906140569","before":0.0,"after":1000.0},{"iso":"2026-10-28","sku":"пакеты пласт 40х42 петля Ассорти 20 шт","nmId":null,"before":2000.0,"after":1000.0},{"iso":"2026-10-29","sku":"пакеты крафт 220х120х250 кр ручка 25 шт","nmId":"1906114868","before":0.0,"after":382.0},{"iso":"2026-10-29","sku":"пакеты крафт 320х200х370 кр ручка 10 шт","nmId":"1906153466","before":0.0,"after":23.0},{"iso":"2026-10-30","sku":"пакеты крафт 220х120х250 кр ручка 10 шт","nmId":"1906086906","before":0.0,"after":296.0},{"iso":"2026-10-30","sku":"пакеты крафт 320х200х370 кр ручка 10 шт","nmId":"1906153466","before":0.0,"after":314.0},{"iso":"2026-10-30","sku":"пакеты крафт 320х200х370 кр ручка 25 шт","nmId":"1906140569","before":314.0,"after":0.0},{"iso":"2026-10-30","sku":"пакеты пласт 40х42 петля Ассорти 20 шт","nmId":null,"before":296.0,"after":0.0},{"iso":"2026-10-31","sku":"пакеты крафт 220х120х250 кр ручка 10 шт","nmId":"1906086906","before":0.0,"after":704.0},{"iso":"2026-10-31","sku":"пакеты крафт 320х200х370 кр ручка 10 шт","nmId":"1906153466","before":0.0,"after":686.0},{"iso":"2026-10-31","sku":"пакеты крафт 320х200х370 кр ручка 25 шт","nmId":"1906140569","before":686.0,"after":0.0},{"iso":"2026-10-31","sku":"пакеты пласт 40х42 петля Ассорти 20 шт","nmId":null,"before":704.0,"after":0.0},{"iso":"2026-11-02","sku":"пакеты крафт 320х200х370 кр ручка 10 шт","nmId":"1906153466","before":0.0,"after":360.0},{"iso":"2026-11-02","sku":"пакеты крафт 320х200х370 кр ручка 25 шт","nmId":"1906140569","before":746.0,"after":386.0},{"iso":"2026-11-03","sku":"пакеты крафт 220х120х250 кр ручка 10 шт","nmId":"1906086906","before":0.0,"after":566.0},{"iso":"2026-11-03","sku":"пакеты крафт 320х200х370 кр ручка 10 шт","nmId":"1906153466","before":0.0,"after":1187.0},{"iso":"2026-11-03","sku":"пакеты крафт 320х200х370 кр ручка 25 шт","nmId":"1906140569","before":2791.0,"after":1604.0},{"iso":"2026-11-03","sku":"пакеты пласт 40х42 петля Ассорти 20 шт","nmId":null,"before":1553.0,"after":987.0}];
/* PAKKOM_AD_ATTRIBUTION_V1. Approved 04.11.2026: use current campaign products for all history.
   Exact audited adjustments; no private financial amounts in this module. */
function applyPakkomAdAttributionV1(source){
 const m=source.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
 if(!m)throw Error('Advertising correction: DATA not found');
 const data=JSON.parse(m[1]);
 const specs=PAKKOM_AD_ADJUSTMENTS_V1;
 const changes=specs.map(s=>{
  const a=data.daily.filter(r=>r.iso===s.iso&&(s.nmId?String(r.nmId)===s.nmId:r.sku===s.sku));
  if(a.length!==1)throw Error('Advertising correction: ambiguous product/day '+s.iso+' '+s.sku);
  return {s,r:a[0],delta:s.after-s.before};
 });
 if(changes.every(x=>x.r.ads===x.s.after))return source;
 if(!changes.every(x=>x.r.ads===x.s.before))throw Error('Advertising correction: unexpected source amounts');
 const sum=f=>data.daily.reduce((n,r)=>n+(Number(r[f])||0),0),before={ads:sum('ads'),profit:sum('profit'),vat:sum('vat')};
 for(const {r,delta} of changes){
  for(const f of ['ads','profit','vat','cost','packing','revenue','ordersQty','ordersRub','buyoutsQty'])if(typeof r[f]!=='number'||!Number.isFinite(r[f]))throw Error('Advertising correction: missing '+f);
  r.ads+=delta;r.vat-=delta*22/122;r.profit-=delta*100/122;
  r.drr=r.ordersRub?r.ads/r.ordersRub:null;r.cpo=r.ordersQty?r.ads/r.ordersQty:null;
  r.margin=r.revenue?r.profit/r.revenue:null;r.roi=r.cost+r.packing?r.profit/(r.cost+r.packing):null;
  r.profitPerBuyout=r.buyoutsQty?r.profit/r.buyoutsQty:null;
  if('cpoStatus' in r)r.cpoStatus=r.ads===0?'Без рекламы':r.ordersQty===0?'Нет заказов':r.cpo>r.cpoMax?'Выше max':r.cpo>r.cpoStd?'Выше стандарта':'В норме';
 }
 for(const obj of [data.business,data.skuTotals]){
  if(!obj||typeof obj.ads!=='number'||typeof obj.profit!=='number')throw Error('Advertising correction: missing aggregate');
  obj.ads+=7000;obj.profit-=7000*100/122;
  if(typeof obj.vat==='number')obj.vat-=7000*22/122;
  if(typeof obj.drr==='number'&&obj.ordersRub)obj.drr=obj.ads/obj.ordersRub;
 }
 if(typeof data.skuTotals.cost!=='number')throw Error('Advertising correction: missing aggregate cost');
 data.skuTotals.roi=data.skuTotals.cost?data.skuTotals.profit/data.skuTotals.cost:null;
 for(const [f,d] of [['ads',7000],['profit',-7000*100/122],['vat',-7000*22/122]])if(Math.abs(sum(f)-before[f]-d)>1e-6)throw Error('Advertising correction: totals do not reconcile '+f);
 data.adAttributionVersion=1;
 const json=JSON.stringify(data).replace(/</g,'\\u003c'),start=m.index+m[0].indexOf(m[1]);
 return source.slice(0,start)+json+source.slice(start+m[1].length);
}
if(typeof module!=='undefined'&&module.exports)module.exports={applyPakkomAdAttributionV1};
