const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const path=require('node:path'),root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const rx=/<script id="data" type="application\/json">([\s\S]*?)<\/script>/,data=JSON.parse(html.match(rx)[1]);
const code=fs.readFileSync(path.join(root,'management-src/ad-attribution-v1.js'),'utf8'),box={module:{exports:{}}};vm.createContext(box);vm.runInContext(code+'\nthis.adjustments=PAKKOM_AD_ADJUSTMENTS_V1;',box);
const patch=box.module.exports.applyPakkomAdAttributionV1,spec=box.adjustments,near=(a,b)=>assert(Math.abs((a??0)-(b??0))<1e-6,`${a} != ${b}`);
assert.equal(spec.length,21);near(spec.reduce((s,x)=>s+x.after-x.before,0),7000);
const amounts={'1906086906':2566,'1906114868':4549,'1906153466':5547,'1906140569':2990};
for(const [id,total] of Object.entries(amounts))near(data.daily.filter(r=>String(r.nmId)===id).reduce((s,r)=>s+r.ads,0),total);
for(const s of spec){const rows=data.daily.filter(r=>r.iso===s.iso&&(s.nmId?String(r.nmId)===s.nmId:r.sku===s.sku));assert.equal(rows.length,1);near(rows[0].ads,s.after);}
assert.equal(patch(html),html,'corrected release must be idempotent');
// Synthetic financial data only; production finance stays encrypted.
const fixture=JSON.parse(JSON.stringify(data));
for(const [i,r] of fixture.daily.entries()){
 r.cost=100+i%31;r.packing=20;r.revenue=500;r.vat=50-r.ads*22/122;r.profit=350-r.cost-r.packing-r.ads-r.vat;
 const s=spec.find(s=>s.iso===r.iso&&(s.nmId?String(r.nmId)===s.nmId:r.sku===s.sku));
 if(s){r.ads=s.before;r.vat=50-r.ads*22/122;r.profit=350-r.cost-r.packing-r.ads-r.vat;}
}
const sum=(d,f)=>d.daily.reduce((s,r)=>s+(r[f]||0),0);
fixture.business={ads:sum(fixture,'ads'),profit:sum(fixture,'profit')+123};fixture.skuTotals={ads:sum(fixture,'ads'),profit:sum(fixture,'profit'),cost:sum(fixture,'cost')};fixture.skuTotals.roi=fixture.skuTotals.profit/fixture.skuTotals.cost;fixture.controlDaily={'28.10.2026':{adsDelta:0,profitDelta:0,status:'СХОДИТСЯ'}};
const wrap=d=>'<script id="data" type="application/json">'+JSON.stringify(d)+'</script>';
const source=wrap(fixture),result=patch(source),fixed=JSON.parse(result.match(rx)[1]);
near(sum(fixed,'ads')-sum(fixture,'ads'),7000);near(sum(fixed,'profit')-sum(fixture,'profit'),-7000*100/122);near(sum(fixed,'vat')-sum(fixture,'vat'),-7000*22/122);
near(fixed.business.profit-fixture.business.profit,-7000*100/122);near(fixed.business.ads-fixture.business.ads,7000);near(fixed.skuTotals.profit,sum(fixed,'profit'));near(fixed.skuTotals.roi,fixed.skuTotals.profit/fixed.skuTotals.cost);assert.deepEqual(fixed.controlDaily,fixture.controlDaily);
assert.equal(patch(result),result);let count=0;
for(let i=0;i<fixture.daily.length;i++){
 const a=fixture.daily[i],b=fixed.daily[i];if(JSON.stringify(a)===JSON.stringify(b))continue;count++;
 near(b.profit,350-b.cost-b.packing-b.ads-(50-b.ads*22/122));near(b.vat,50-b.ads*22/122);
 for(const k of ['sku','nmId','ordersQty','ordersRub','buyoutsQty','cost','packing','revenue'])assert.equal(b[k],a[k]);
}
assert.equal(count,21);
const bad=JSON.parse(source.match(rx)[1]);bad.daily.find(r=>r.iso===spec[0].iso&&r.sku===spec[0].sku).ads+=1;assert.throws(()=>patch(wrap(bad)),/unexpected/);
const dup=JSON.parse(source.match(rx)[1]);dup.daily.push(dup.daily.find(r=>r.iso===spec[0].iso&&r.sku===spec[0].sku));assert.throws(()=>patch(wrap(dup)),/ambiguous/);
const owner=fs.readFileSync(path.join(root,'management.html'),'utf8');assert(owner.includes(code));assert(owner.includes('applyPakkomAdAttributionV1(applyPakkomSkuIdentityNgV1('));assert(!owner.includes('"daily":'));
console.log(JSON.stringify({products:amounts,changedRows:count,restoredAds:7000,finance:'independent synthetic checks passed',aggregates:'reconciled',idempotence:true,invalidInputRejected:true,ownerData:'sealed'}));
