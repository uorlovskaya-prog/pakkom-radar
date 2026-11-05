const fs=require('node:fs'),assert=require('node:assert/strict');
const {applyPakkomReportDataUpdateV1:apply}=require('../management-src/report-data-update-v1.js');
const core={ordersQty:2,ordersRub:100,ordersNetRub:70,buyoutsQty:1,revenue:100,ads:10,cost:20,packing:5,vat:10,profit:55};
const old={date:'03.11.2026',iso:'2026-11-03',sku:'Стаканы НГ тест',nmId:'1',category:'Посуда',...core};
const earlier={...old,date:'02.11.2026',iso:'2026-11-02'};
const data={through:'03.11.2026',daily:[earlier,old],weeks:[],business:{profit:110,ads:20},skuTotals:{},controlDaily:{'02.11.2026':{profitDelta:7}}};
const html='<html><h1>Existing UI</h1><script id="data" type="application/json">'+JSON.stringify(data)+'</script><script>unchangedCode()</script></html>';
const added={...old,date:'04.11.2026',iso:'2026-11-04',...core};
const update={schema:'pakkom-report-data-update-v1',id:'test-release',expectedThrough:'03.11.2026',through:'04.11.2026',
 replacements:[{iso:old.iso,sku:'Стаканы тест',nmId:'1',before:{ordersQty:2,profit:55},after:{ordersQty:3,profit:60}}],
 insertions:[added],dailyChecks:[{iso:old.iso,rows:1,sums:{ordersQty:3,profit:60}},{iso:added.iso,rows:1,sums:{ordersQty:2,profit:55}}],
 weeks:[{key:'2026-11-02',start:'2026-11-02',end:'2026-11-04',label:'02.11–04.11'}],business:{profit:170,ads:30},controlDaily:{'04.11.2026':{profitDelta:0}}};
const read=h=>JSON.parse(h.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const revised=apply(html,update),after=read(revised);
assert.equal(after.through,'04.11.2026');assert.equal(after.daily.length,3);
assert.deepEqual(after.daily[0],earlier);assert.equal(after.daily[1].sku,old.sku);
assert.equal(after.skuTotals.profit,170);assert.equal(after.skuTotals.ordersQty,7);assert.equal(after.business.profit,170);
assert.equal(after.weeks[0].end,'2026-11-04');assert.equal(after.controlDaily['02.11.2026'].profitDelta,7);
assert.equal(apply(revised,update),revised);assert.equal(read(html).daily.length,2);
const strip=h=>h.replace(/(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/,'$1$2');assert.equal(strip(revised),strip(html));
for(const corrupt of [
 u=>u.replacements[0].before.profit=99,
 u=>u.replacements[0].after.sku='Other product',
 u=>u.insertions.push({...added}),
 u=>u.insertions[0].iso='2026-11-02',
 u=>u.dailyChecks[0].sums.profit=61,
 u=>u.expectedThrough='02.11.2026',
 u=>u.through='05.11.2026'
]){const u=structuredClone(update);corrupt(u);assert.throws(()=>apply(html,u));}
const owner=fs.readFileSync('management.html','utf8'),loader=fs.readFileSync('management-src/access-loader-v10.js','utf8');
assert(owner.includes(fs.readFileSync('management-src/report-data-update-v1.js','utf8')));assert(owner.includes(loader.trim()));
const release=JSON.parse(owner.match(/<script id="pakkom-sealed-release" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.equal(release.payloadFormat,'pakkom-management-data-update-v1');assert(release.basePayload.wrappedKey&&release.payload.wrappedKey);
assert.notEqual(release.payload.sha256,release.basePayload.sha256,'In-page refresh must detect the new encrypted report');
console.log('PASS: encrypted-update contract, numeric guards, date coverage, no duplicates, untouched history/UI, totals and idempotence');
