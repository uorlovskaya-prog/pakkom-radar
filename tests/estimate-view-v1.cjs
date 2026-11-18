'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const {assemble,block,scripts}=require('./lightweight-loaders-v2.cjs');
const {expandPakkomEstimateV1:expand,applyPakkomEstimateDataV1:apply,applyPakkomEstimateViewV1:view}=require('../estimate-view-v1.js');
async function main(){
 const radar=await assemble('index.html'),owner=await assemble('management.html'),data=block(radar.html,'data');
 assert(!data.estimatesV1);
 const archived=JSON.parse(fs.readFileSync('data/radar-estimates-20261115.json','utf8'));
 const publicModel=JSON.parse(require('node:zlib').gunzipSync(Buffer.from(archived.gzip,'base64'))).model,publicRows=expand(publicModel);
 assert.equal(publicModel.mode,'signals');assert.equal(publicRows.length,257);
 assert.equal(publicRows.filter(r=>['Риск','Наблюдать'].includes(r.decision)).length,15);
 assert(!/profitMicros|contributionMicros|unitCost|payoutFactor/.test(JSON.stringify(publicModel)),'Private model in public page');
 assert(!owner.html.includes("applyPakkomEstimateDataV1"));
 assert(!owner.html.includes('applyPakkomEstimateViewV1'));
 assert(!owner.html.includes('"mode":"owner"'),'Plain private estimate in owner gate');
 const fields=['key','sku','nmId','group','calibrationBasis','status','action','decision','ordersQty','buyoutsQty','ads','ordersNetCents','profitMicros','sensitivityMicros','contributionMicros'];
 const model={version:1,mode:'owner',period:{from:'2026-11-12',to:'2026-11-15',through:'15.11.2026',financialThrough:'11.11.2026'},fields,strings:{group:['Test'],calibrationBasis:['Synthetic'],status:['Synthetic'],action:['Synthetic'],decision:['Наблюдать']},items:[['NMID:1','Synthetic 25 шт','1',0,0,0,0,0,2,1,10,7000,55000000,5000000,40000000]],checks:{ordersQty:2,buyoutsQty:1,ads:10,ordersRub:100,profitEstimate:55}};
 const daily=[{iso:'2026-11-12',sku:'Synthetic 25 шт',nmId:'1',ordersQty:2,buyoutsQty:1,ads:10,ordersRub:100,profit:null,vat:null,operationalOnly:true}];
 const baseline={through:'15.11.2026',financialThrough:'11.11.2026',daily,business:{profit:123},skuTotals:{profit:123},weeks:[],controlDaily:{}};
 const frame='<html><body><script id="data" type="application/json">'+JSON.stringify(baseline)+'</script><p>Unchanged UI</p></body></html>';
 const update={schema:'pakkom-estimate-update-v1',id:'synthetic-estimate',expectedThrough:'15.11.2026',through:'15.11.2026',model};
 const html=apply(frame,update),d=block(html,'data'),rows=expand(d.estimatesV1);
 assert.deepEqual(d.daily,daily);assert.deepEqual(d.business,baseline.business);assert.deepEqual(d.skuTotals,baseline.skuTotals);assert.equal(d.financialThrough,'11.11.2026');assert.equal(d.through,'15.11.2026');
 assert(Math.abs(rows[0].order90-(36-10*100/122))<1e-9);assert.equal(rows[0].profitLow,50);assert.equal(rows[0].profitHigh,60);assert.equal(apply(html,update),html);assert.equal(view(view(html)),view(html));
 for(const corrupt of [u=>u.expectedThrough='14.11.2026',u=>u.model.items.push(u.model.items[0]),u=>u.model.checks.ordersQty=3,u=>u.model.items[0][2]='2',u=>u.model.items[0][8]=-1,u=>u.model.period.financialThrough='10.11.2026']){const u=structuredClone(update);corrupt(u);assert.throws(()=>apply(frame,u));}
 const sub=webcrypto.subtle,b64=x=>Buffer.from(x).toString('base64'),enc=new TextEncoder(),rand=n=>webcrypto.getRandomValues(new Uint8Array(n));
 const keys=await sub.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 async function seal(text){const raw=rand(32),iv=rand(12),aes=await sub.importKey('raw',raw,'AES-GCM',false,['encrypt']);return{iv:b64(iv),wrappedKey:b64(await sub.encrypt({name:'RSA-OAEP'},keys.publicKey,raw)),ciphertext:b64(await sub.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('pakkom-management-dashboard-v1')},aes,gzipSync(text))),sha256:createHash('sha256').update(text).digest('hex')};}
 const salt=rand(16),iv=rand(12),password='synthetic-estimate-only';
 const material=await sub.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']),wrapping=await sub.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt']);
 const account={kdf:'PBKDF2-SHA256',iterations:600000,salt:b64(salt),iv:b64(iv),publicKey:b64(await sub.exportKey('spki',keys.publicKey)),privateKeyCiphertext:b64(await sub.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('pakkom-management-key-v1')},wrapping,await sub.exportKey('pkcs8',keys.privateKey)))};
 const actualFields=[2,70,1,1,0,10,1,100,90,80,20,4,6,40,40,8,3,2];
 const actual={schema:'pakkom-financial-period-v1',audience:'owner',id:'actual',expectedThrough:'15.11.2026',previousFinancialThrough:'11.11.2026',through:'12.11.2026',catalog:[['Synthetic 25 шт','1','A','B',1,2]],days:[['2026-11-12',[[0,...actualFields]],actualFields]]};
 const release={schema:'pakkom-management-sealed-v1',through:actual.through,account,basePayload:await seal(frame),payload:await seal(JSON.stringify(actual)),payloadFormat:'pakkom-management-data-update-v1',previousUpdates:[]};
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{textContent:'',value:'',checked:false,hidden:false,disabled:false,setAttribute(){},removeAttribute(){},focus(){}});return els.get(id);};
 el('pakkom-sealed-release').textContent=JSON.stringify(release);
 const c={console,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Response,DecompressionStream,atob,setTimeout,clearTimeout,URL,document:{getElementById:el},window:{addEventListener(){}},location:{protocol:'https:',href:'https://example.test/management.html'},applyPakkomManagementFiltersV9:s=>s,applyPakkomSkuIdentityNgV1:s=>s,applyPakkomAdAttributionV1:s=>s,applyPakkomProfitPercentSortV1:s=>s};
 vm.createContext(c);
 const reportScript=scripts(owner.html).find(s=>s.includes('PAKKOM_REPORT_DATA_UPDATE_V1'));
 const reportOnly=reportScript.match(/function applyPakkomReportDataUpdateV1[\s\S]*?if\(typeof module!=='undefined'&&module\.exports\)module.exports=\{applyPakkomReportDataUpdateV1\};/);assert(reportOnly);vm.runInContext(reportOnly[0],c);
 const access=scripts(owner.html).find(s=>s.includes('PAKKOM_MANAGEMENT_ACCESS_V10'));
 vm.runInContext(access.slice(access.indexOf('function pakkomReleaseBlockV2')),c);
 await new Promise(r=>setTimeout(r,20));el('password').value=password;await el('login').onsubmit({preventDefault(){}});
 assert(el('board').srcdoc,'Synthetic financial login did not open: '+el('message').textContent);
 const opened=block(el('board').srcdoc,'data');assert.equal(opened.estimatesV1,undefined);assert.equal(opened.daily[0].profit,40);assert.equal(opened.daily[0].vat,6);
 assert.equal(opened.daily[0].logistics,3);assert.equal(opened.daily[0].penalties,2);
 assert(!el('board').srcdoc.includes('PAKKOM_ESTIMATE_MOUNT_V1'));assert.equal(el('password').value,'');
 console.log('PASS: archived estimate history, actual encrypted financial login, no active estimate or provisional view');

}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
