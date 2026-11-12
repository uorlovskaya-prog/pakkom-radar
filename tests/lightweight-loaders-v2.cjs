'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto,createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const root=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const origin='https://uorlovskaya-prog.github.io/pakkom-radar/';
const scripts=html=>[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m=>!m[0].startsWith('<script id=')).map(m=>m[1]);
function block(html,id){const re=new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>');const m=html.match(re);assert(m,'Missing '+id);return JSON.parse(m[1]);}
class Parser{parseFromString(text){return {getElementById(id){const m=text.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>'));return m?{textContent:m[1]}:null;}};}}
const fileOf=url=>new URL(String(url),origin).pathname.replace('/pakkom-radar/','');
function response(text){return {ok:true,text:async()=>text,json:async()=>JSON.parse(text)};}
async function assemble(filename,lookup=read){
 const source=lookup(filename);let output='',failure='';
 const document={baseURI:origin+filename,body:{set innerHTML(v){failure=v;}},getElementById(id){const m=source.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>'));return m?{textContent:m[1]}:null;},open(){},write(html){output+=html;},close(){}};
 const c={document,URL,DOMParser:Parser,location:{href:origin+filename},fetch:async u=>response(lookup(fileOf(u))),console};
 vm.createContext(c);for(const script of scripts(source))await vm.runInContext(script,c);
 assert(!failure,'Loader failed: '+failure);assert(output,'Loader produced no page');
 for(const script of scripts(output))new vm.Script(script);
 return {html:output,context:c};
}
function storage(){let record=null;return {open(){const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={};tx.objectStore=()=>({get(){const q={};queueMicrotask(()=>{q.result=record;q.onsuccess?.();tx.oncomplete?.();});return q;},put(value){record=value;queueMicrotask(()=>tx.oncomplete?.());},delete(){record=null;queueMicrotask(()=>tx.oncomplete?.());}});return tx;}};req.onsuccess?.();});return req;},get value(){return record;}};}
async function cryptoRegression(owner){
 const sub=webcrypto.subtle,enc=new TextEncoder(),b64=x=>Buffer.from(x).toString('base64'),rand=n=>webcrypto.getRandomValues(new Uint8Array(n));
 const keys=await sub.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const secret='synthetic-regression-test-only',salt=rand(16),iv=rand(12);
 const material=await sub.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);
 const wrapping=await sub.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt']);
 const account={kdf:'PBKDF2-SHA256',iterations:600000,salt:b64(salt),iv:b64(iv),publicKey:b64(await sub.exportKey('spki',keys.publicKey)),privateKeyCiphertext:b64(await sub.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('pakkom-management-key-v1')},wrapping,await sub.exportKey('pkcs8',keys.privateKey)))};
 async function seal(text){const raw=rand(32),iv=rand(12),aes=await sub.importKey('raw',raw,'AES-GCM',false,['encrypt']);return {iv:b64(iv),wrappedKey:b64(await sub.encrypt({name:'RSA-OAEP'},keys.publicKey,raw)),ciphertext:b64(await sub.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('pakkom-management-dashboard-v1')},aes,gzipSync(text))),sha256:createHash('sha256').update(text).digest('hex')};}
 const row=day=>({iso:'2026-11-'+day,date:day+'.11.2026',sku:'Synthetic product',nmId:'999999999',ordersQty:2,ordersRub:70,ordersNetRub:70,ads:7,profit:10,buyoutsQty:1,cost:20,packing:3,vat:2,revenue:50});
 const baseData={through:'04.11.2026',daily:[row('04')],business:{ordersRub:70,ads:7},skuTotals:{ordersRub:70,ads:7,drr:.1},weeks:[],controlDaily:{}};
 const frame='<html><body><script id="data" type="application/json">'+JSON.stringify(baseData)+'</script><p>Synthetic private content</p></body></html>';
 const update=(from,to,days)=>({schema:'pakkom-report-data-update-v1',id:'synthetic-'+to,expectedThrough:from+'.11.2026',through:to+'.11.2026',replacements:[],insertions:days.map(row),dailyChecks:days.map(d=>({iso:'2026-11-'+d,rows:1,sums:{ordersQty:2,ordersNetRub:70,ordersRub:70,ads:7}})),weeks:[],business:{},controlDaily:{}});
 const baseRelease={schema:'pakkom-management-sealed-v1',through:'05.11.2026',account,basePayload:await seal(frame),previousUpdates:[],payloadFormat:'pakkom-management-data-update-v1',payload:await seal(JSON.stringify(update('04','05',['05'])))};
 const embedded=r=>'<script id="pakkom-sealed-release" type="application/json">'+JSON.stringify(r)+'</script>';
 let external={through:'08.11.2026',payload:await seal(JSON.stringify(update('05','08',['06','07','08'])))};
 const config=block(read('management.html'),'pakkom-management-loader');
 const syntheticUpdate='data/synthetic-management-update.json';
 const syntheticManagement=read('management.html').replace(JSON.stringify(config),JSON.stringify({base:config.base,update:syntheticUpdate}));
 const mockFiles=()=>({'management.html':syntheticManagement,[config.base]:embedded(baseRelease),[syntheticUpdate]:JSON.stringify(external)});
 const shared=storage();
 async function context(){
  const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',checked:true,hidden:false,disabled:false,setAttribute(){},removeAttribute(){},focus(){}});return elements.get(id);};
  const merge=owner.context.pakkomMergeReleaseV2;el('pakkom-sealed-release').textContent=JSON.stringify(merge(embedded(baseRelease),external));
  const c={console,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Response,DecompressionStream,atob,setTimeout,clearTimeout,URL,DOMParser:Parser,document:{getElementById:el},window:{addEventListener(){}},indexedDB:shared,location:{protocol:'https:',href:origin+'management.html'},fetch:async u=>response(mockFiles()[fileOf(u)]),applyPakkomManagementFiltersV9:s=>s,applyPakkomSkuIdentityNgV1:s=>s,applyPakkomAdAttributionV1:s=>s,applyPakkomProfitPercentSortV1:s=>s,applyPakkomReportDataUpdateV1:require(path.join(root,'management-src/report-data-update-v1.js')).applyPakkomReportDataUpdateV1};
  vm.createContext(c);const accessScript=scripts(owner.html).find(s=>s.includes('PAKKOM_MANAGEMENT_ACCESS_V10'));vm.runInContext(accessScript.slice(accessScript.indexOf('function pakkomReleaseBlockV2')),c);
  for(let i=0;i<200&&el('open').disabled;i++)await new Promise(r=>setTimeout(r,10));
  return {c,el};
 }
 const first=await context(),el=first.el;
 el('password').value='wrong';await el('login').onsubmit({preventDefault(){}});assert(!el('board').srcdoc,'Wrong password accepted');
 el('password').value=secret;await el('login').onsubmit({preventDefault(){}});assert.equal(el('gate').hidden,true,'Valid login failed');assert.equal(el('password').value,'');
 assert(shared.value?.key&&shared.value.key.extractable===false,'Remembered key must be non-extractable');
 let d=block(el('board').srcdoc,'data');assert.equal(d.through,'08.11.2026');assert.equal(d.daily.length,5);assert(d.daily.every(r=>r.ordersRub===100&&r.ordersNetRub===70&&r.drr===.07));
 const restored=await context();assert.equal(restored.el('gate').hidden,true,'Remembered login failed');
 await el('refresh').onclick();assert.equal(el('status').textContent,'У вас актуальная версия');
 external={through:'09.11.2026',payload:await seal(JSON.stringify(update('05','09',['06','07','08','09'])))};
 await el('refresh').onclick();assert.equal(el('status').textContent,'Обновлено');d=block(el('board').srcdoc,'data');assert.equal(d.through,'09.11.2026');assert.equal(d.daily.length,6);assert(d.daily.every(r=>r.ordersRub===100),'Repeated commission conversion');
 const stable=el('board').srcdoc;external={...external,payload:{...external.payload,sha256:'0'.repeat(64)}};
 await el('refresh').onclick();assert.equal(el('board').srcdoc,stable,'Corrupt update replaced valid data');assert.equal(el('status').className,'error');
 await el('lock').onclick();assert.equal(shared.value,null,'Sign-out did not remove saved key');
 console.log('PASS: synthetic encrypted login, remembered login, refresh, commission idempotence, corruption refusal and logout');
}
async function main(){
 const radar=await assemble('index.html'),owner=await assemble('management.html');
 const d=block(radar.html,'data'),r=block(owner.html,'pakkom-sealed-release');
 const config=block(read('management.html'),'pakkom-management-loader'),base=block(read(config.base),'pakkom-sealed-release');
 const updatePaths=Array.isArray(config.updates)?config.updates:[config.update],sealeds=updatePaths.map(p=>JSON.parse(read(p)));
 assert.equal(d.through,r.through);assert.equal(d.daily.map(r=>r.iso).sort().at(-1),r.through.split('.').reverse().join('-'));
 assert.deepEqual(r.account,base.account);assert.deepEqual(r.basePayload,base.basePayload);
 const expectedRelease=owner.context.pakkomMergeReleaseV2(read(config.base),sealeds);
 assert.deepEqual(JSON.parse(JSON.stringify(r)),JSON.parse(JSON.stringify(expectedRelease)));
 assert.equal(new Set([...(r.previousUpdates||[]),r.payload].map(p=>p.sha256)).size,(r.previousUpdates||[]).length+1,'Duplicate encrypted update in chain');
 assert(!owner.html.includes('"daily":'),'Plain private financial data in owner page');
 for(const marker of ['PAKKOM_MANAGEMENT_ACCESS_V10','PAKKOM_MANAGEMENT_FILTERS_V9','PAKKOM_REPORT_DATA_UPDATE_V1'])assert(owner.html.includes(marker),marker);
 assert(radar.html.includes('PAKKOM_SKU_IDENTITY_GUARD_V4'));
 assert.equal(r.signalsVersion,11);assert(radar.html.includes(read('management-src/signals-ui-v11.js')));
 const identity={DATA:d};vm.createContext(identity);vm.runInContext(read('sku-identity-v4.js'),identity);
 const originalData=JSON.stringify(d),keys=d.daily.map(x=>x.iso+'|'+identity.canonicalSkuKey(x));
 assert.equal(new Set(keys).size,keys.length,'Duplicate normalized date/SKU');
 const sample=[{sku:'тест 20х30 2 шт НГ белые',nmId:'1'},{sku:' ТЕСТ 20x30 2шт белые '},{sku:'тест 20х30 6 шт белые',nmId:'2'},{sku:'тест 20х30 2 шт синие',nmId:'3'},{sku:'тест 20х40 2 шт белые',nmId:'4'}];
 const canonical=identity.createSkuIdentity(sample);assert.equal(canonical.key(sample[0]),canonical.key(sample[1]));
 for(let i=2;i<sample.length;i++)assert.notEqual(canonical.key(sample[0]),canonical.key(sample[i]));
 assert.throws(()=>identity.createSkuIdentity([{sku:'один товар',nmId:'1'},{sku:'один товар',nmId:'2'},{sku:'один товар'}]));
 for(const x of d.daily){const key=identity.canonicalSkuKey(x);if(key.startsWith('NMID:'))assert(identity.matchesSkuSearch(x,key.slice(5)),'ID search lost history');}
 const reversed=identity.createSkuIdentity([...d.daily].reverse());for(const x of d.daily)assert.equal(identity.canonicalSkuKey(x),reversed.key(x));
 assert.equal(JSON.stringify(d),originalData,'Identity changed source data');

 for(const x of d.daily)if(Number.isFinite(x.ordersNetRub)){assert(Math.abs(x.ordersRub-x.ordersNetRub/.70)<1e-6);if(x.ordersRub)assert(Math.abs(x.drr-(Number(x.ads)||0)/x.ordersRub)<1e-9);}
 for(const [iso,qty,net,buyouts,ads] of [['2026-11-06',3539,810423.41,3161,68674],['2026-11-07',3460,806318.67,2956,74198],['2026-11-08',3649,861014.09,3185,73643],['2026-11-09',4058,952259.42,3494,74440],['2026-11-10',3693,863931.46,3294,80439],['2026-11-11',3764,865904.07,3347,83061]]){
  const rows=d.daily.filter(r=>r.iso===iso),sum=k=>rows.reduce((s,r)=>s+(Number(r[k])||0),0);
  for(const [k,v] of Object.entries({ordersQty:qty,ordersNetRub:net,ordersRub:net/.7,buyoutsQty:buyouts,ads}))assert(Math.abs(sum(k)-v)<1e-5,iso+' '+k);
 }
 const latest=await owner.context.pakkomLatestReleaseV2(new URL(origin+'management.html'));
 assert.deepEqual(JSON.parse(JSON.stringify(latest)),r);
 console.log('PASS: both lightweight loaders execute; reporting date '+r.through+'; sealed account/base/history unchanged; Radar 06-11 November controls match');
 await cryptoRegression(owner);
 if(process.argv.includes('--live')){
  // Wait for this exact checked commit to reach Pages; never claim a Git commit is a deployment.
  const dependencies=[
   ...read('index.html').matchAll(/fetch\(['"]([^'"]+)['"]/g),
   ...read('management.html').matchAll(/fetch\(['"]([^'"]+)['"]/g)
  ].map(m=>m[1]);
  const files=[...new Set(['index.html','management.html',...dependencies,config.base,...updatePaths])];
  let published=null,last='';
  for(let attempt=0;attempt<24;attempt++){
   try{
    const texts=await Promise.all(files.map(async f=>{const q=await fetch(origin+f+'?_loader_check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});assert(q.ok,f+' HTTP '+q.status);const text=await q.text();assert.equal(createHash('sha256').update(text).digest('hex'),createHash('sha256').update(read(f)).digest('hex'),'Published bytes differ: '+f);return [f,text];}));
    published=new Map(texts);break;
   }catch(e){last=e.message;if(attempt<23)await new Promise(resolve=>setTimeout(resolve,10000));}
  }
  assert(published,'Published Pages check failed: '+last);
  const get=p=>{assert(published.has(p),'Unfetched public resource '+p);return published.get(p);};
  const liveRadar=await assemble('index.html',get),liveOwner=await assemble('management.html',get);
  assert.equal(block(liveRadar.html,'data').through,block(liveOwner.html,'pakkom-sealed-release').through);
  console.log('PASS: both permanent Pages URLs and their base/JSON dependencies return the exact verified bytes and execute through '+r.through);
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
