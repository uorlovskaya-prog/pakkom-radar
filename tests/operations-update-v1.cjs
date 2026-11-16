'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {assemble,block,read}=require('./lightweight-loaders-v2.cjs');
const op=require('../operations-update-v1.js');
(async()=>{
 const radar=await assemble('index.html'),owner=await assemble('management.html');
 const data=block(radar.html,'data'),release=block(owner.html,'pakkom-sealed-release');
 assert.equal(data.through,'15.11.2026');assert.equal(release.through,data.through);assert.equal(data.financialThrough,'11.11.2026');
 const update=await op.decodePakkomOperationsEnvelopeV1(JSON.parse(read('data/operations-20261115.json')));
 const financial=['revenue','wbRealized','payout','cost','packing','vat','profit','roi','profitPerBuyout','salesQty','returnsQty'];
 const recent=data.daily.filter(r=>r.iso>='2026-11-12');
 for(const r of recent){assert(r.operationalOnly);for(const f of financial)assert.equal(r[f],null,r.sku+' '+f);}
 assert.equal(recent.reduce((s,r)=>s+r.ordersQty,0),15227);assert.equal(recent.reduce((s,r)=>s+r.buyoutsQty,0),13178);assert.equal(recent.reduce((s,r)=>s+r.ads,0),339640);
 assert.equal(op.applyPakkomOperationsDataV1(radar.html,update),radar.html,'Reapplying operational update changed it');
 const old11=JSON.parse(read('data/radar-update-20261111.json')).rows;
 const new11=data.daily.filter(r=>r.iso==='2026-11-11');
 const identity={DATA:{daily:[...data.daily,...old11]}};vm.createContext(identity);vm.runInContext(read('sku-identity-v4.js'),identity);
 for(const r of old11){const n=new11.find(x=>identity.canonicalSkuKey(x)===identity.canonicalSkuKey(r));assert(n,'Historical SKU disappeared: '+r.sku);for(const f of ['buyoutsQty','ads'])assert.equal(n[f],r[f]);}
 const fixtureText=read('tests/signals-ui-v11.cjs').split('const output={};')[0];
 const fixture=new Function('require','process',fixtureText+';return fixture;')(require,process);
 const rendered=fixture(radar.html),run=s=>vm.runInContext(s,rendered.c);
 const partial=JSON.parse(run("JSON.stringify(agg(DATA.daily.filter(r=>r.iso>='2026-11-12')))"));
 assert.equal(partial.ordersQty,15227);assert.equal(partial.ads,339640);assert.equal(partial.roi,null);assert.equal(partial.profit,null);
 const mixed=JSON.parse(run("JSON.stringify(agg(DATA.daily.filter(r=>r.iso>='2026-11-09')))"));assert.equal(mixed.financialComplete,false);assert.equal(mixed.roi,null);
 const closed=JSON.parse(run("JSON.stringify(agg(DATA.daily.filter(r=>r.iso==='2026-11-10')))"));assert.notEqual(closed.roi,null);assert.equal(closed.financialComplete,true);
 assert(radar.html.includes("['drr','ДРР, %']"));assert(radar.html.includes('PAKKOM_OPERATIONS_NOTICE_V1'));
 run("state.from='2026-11-12';state.to='2026-11-15';state.search='';state.quick='all';state.status='all';renderAll();");
 assert(rendered.elements.get('kpis').innerHTML.includes('ДРР'));assert(!rendered.elements.get('kpis').innerHTML.includes('NaN'));assert(!rendered.elements.get('skuTable').innerHTML.includes('undefined'));
 for(const r of data.daily.filter(r=>/шары/i.test(r.sku)))assert(!/(^|\s)нг(\s|$)/i.test(run('skuMetaOf('+JSON.stringify(r)+').sku')),'Invented NG Shary');
 console.log('PASS: operational counts/ads, DRR render, null finance, mixed-period guard, history, idempotence, no invented NG, same dates');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
