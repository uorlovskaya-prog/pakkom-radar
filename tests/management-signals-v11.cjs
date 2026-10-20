const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.argv[2]||process.cwd();
const engineSource=fs.readFileSync(path.join(root,'management-signals-v11.js'),'utf8');
const ctx={};vm.createContext(ctx);vm.runInContext(engineSource,ctx);
const make=ctx.createPakkomSignalsV11;
function synthetic(qs,ads=10,missing=[]){return qs.flatMap((q,i)=>missing.includes(i)?[]:[{iso:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),sku:'test',ordersQty:q,ordersRub:q*100,ads, cpoStd:20,cpoMax:40}])}
let data=synthetic(Array(35).fill(20));data.slice(-5).forEach(r=>r.ordersQty=5);let e=make(data,r=>r.sku),s=e.evaluate('test');assert(s.sustainedFall&&s.criticalFall);assert.equal(s.cpoCode,'normal');assert.equal(s.priority,1);
// Stable depressed weeks remain visible even when week-over-week is flat.
data=synthetic([...Array(21).fill(20),...Array(14).fill(4)]);s=make(data,r=>r.sku).evaluate('test');assert.equal(s.systemFall,false);assert(s.longFall&&s.criticalFall);
// A rebound may coexist with a sustained low level; it never removes the risk.
data=synthetic([...Array(21).fill(25),...Array(12).fill(3),6,6]);s=make(data,r=>r.sku).evaluate('test');assert(s.strongGrowth&&s.longFall&&s.priority===1);assert(s.labels.some(x=>x.includes('Отскок')));
// A new SKU has no pre-launch zero history. Insufficient global coverage is not zero demand.
data=synthetic(Array(35).fill(10));data.push({...data.at(-1),sku:'new',ordersQty:1});s=make(data,r=>r.sku).evaluate('new');assert(!s.demandFall);assert(!s.c5.valid);assert(!s.long.valid);
data=synthetic([...Array(30).fill(20),...Array(5).fill(2)],10,[32]);s=make(data,r=>r.sku).evaluate('test');assert(!s.c5.valid&&!s.c7.valid&&!s.criticalFall);
// Calendar days without this SKU mean zero when the overall day is covered.
data=synthetic(Array(35).fill(10));const other=data.map(r=>({...r,sku:'coverage'}));data=data.slice(0,-3);s=make([...data,...other],r=>r.sku).evaluate('test');assert(s.stopped&&s.priority===1);
// Advertising without orders must not be called normal or missing CPO standards.
s=make(synthetic([...Array(32).fill(10),0,0,0],100),r=>r.sku).evaluate('test');assert(s.adsNoOrders&&s.priority===1);
// Growth from a tiny base, no advertising and seasonal weekday pattern are not alarms.
s=make(synthetic([...Array(33).fill(1),2,2],0),r=>r.sku).evaluate('test');assert(!s.strongGrowth&&!s.cpoWorse&&s.cpoCode==='none');
s=make(synthetic(Array.from({length:35},(_,i)=>i%7<5?30:3)),r=>r.sku).evaluate('test');assert(!s.sustainedFall&&!s.longFall&&!s.systemFall);
data=synthetic(Array(35).fill(10),100);data.at(-1).cpoStd=5;data.at(-1).cpoMax=8;s=make(data,r=>r.sku).evaluate('test');assert.equal(s.cpoCode,'critical');
// Source data must remain byte-identical, including input order and numeric values.
data=synthetic(Array(35).fill(10));const before=JSON.stringify(data);e=make(data,r=>r.sku);e.evaluate('test');assert.equal(JSON.stringify(data),before);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.includes(engineSource));const publicData=JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const identity=html.match(/\/\* PAKKOM_SKU_IDENTITY_GUARD_V4_BEGIN[\s\S]*?\/\* PAKKOM_SKU_IDENTITY_GUARD_V4_END \*\//)[0];const c={DATA:publicData};vm.createContext(c);vm.runInContext(identity,c);
e=make(publicData.daily,r=>c.canonicalSkuKey(r));const seen=new Set();for(const r of publicData.daily){const k=r.iso+'|'+c.canonicalSkuKey(r);assert(!seen.has(k));seen.add(k)}
// Reproduce the reported defect on its historical cutoff, without freezing future data.
const historical=publicData.daily.filter(r=>r.iso<='2026-10-19');if(historical.some(r=>r.iso==='2026-10-19')){
 const h=make(historical,r=>c.canonicalSkuKey(r));s=h.evaluate('NMID:1338773722');assert.equal(s.c5.cur.ordersQty,45);assert.equal(s.c5.prev.ordersQty,102.5);assert(s.criticalFall&&s.sustainedFall);assert(!s.urgentFall&&!s.systemFall);assert.equal(s.cpoCode,'normal');
 s=h.evaluate('NMID:1425649630');assert.equal(s.c7.cur.ordersQty,26);assert.equal(s.long.baselineWeek,78);assert(s.longFall&&s.criticalFall);
}
const counts={};for(const field of ['criticalFall','sustainedFall','longFall','systemFall','urgentFall','stopped','adsNoOrders','cpoWorse','strongGrowth','systemGrowth'])counts[field]=e.keys.filter(k=>e.evaluate(k)[field]).length;
console.log(JSON.stringify({synthetic_cases:'passed',products:e.keys.length,asOf:e.asOf,duplicates:0,counts}));
