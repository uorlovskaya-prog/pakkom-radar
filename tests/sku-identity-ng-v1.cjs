const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto'),{gzipSync}=require('node:zlib');
const root=process.argv[2]||process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),owner=read('management.html'),guard=read('sku-identity-v4.js').trim();
const data=JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const original=JSON.stringify(data),c={DATA:data};vm.createContext(c);vm.runInContext(guard,c);
const before={DATA:data};vm.createContext(before);vm.runInContext(read('tests/fixtures/sku-identity-before-ng.js'),before);
const hits=q=>data.daily.filter(r=>c.matchesSkuSearch(r,q));
const seasonal=hits('НГ');assert(seasonal.length>0&&seasonal.length<data.daily.length);
for(const r of seasonal)assert(c.hasNewYearMarker(c.skuMetaOf(r).sku));
assert(hits('НГ стаканы').every(r=>r.sku.startsWith('стаканы')));
assert(!hits('НГ').some(r=>r.sku==='стаканы пластик 200 мл 100 шт'));
const key=r=>c.canonicalSkuKey(r),dateKeys=data.daily.map(r=>r.iso+'|'+key(r));
assert.equal(new Set(dateKeys).size,dateKeys.length,'No duplicate daily products');
const approvedUpgrades=new Set(['2018713181','2018713182','2018713183','2018059203','2018059204','2018059205','2018161952','2018161953','2018161954','2018593121','2018593122','2018593123'].map(x=>'NMID:'+x));
for(const r of data.daily){
 const prior=before.canonicalSkuKey(r),now=key(r);
 if(prior!==now)assert(prior.startsWith('NAME:')&&approvedUpgrades.has(now),'Only confirmed NAME→WB ID upgrades are allowed: '+prior+' -> '+now);
}
const sample=[
 {sku:'стаканы бум 350 мл 50 шт снегири',nmId:'1',iso:'2026-11-01'},
 {sku:'стаканы бум НГ 350 мл 50 шт снегири',iso:'2026-11-02'},
 {sku:'стаканы бум 350 мл 50 шт снегири НГ',iso:'2026-11-03'},
 {sku:'стаканы бум НГ 250 мл 50 шт снегири',nmId:'2'},
 {sku:'стаканы бум НГ 350 мл 25 шт снегири',nmId:'3'},
 {sku:'стаканы бум НГ 350 мл 50 шт щелкунчик',nmId:'4'},
 {sku:'стаканы бум NG 350 мл 50 шт снегири',nmId:'5'}
];
const f=c.createSkuIdentity(sample);for(let i=1;i<=2;i++)assert.equal(f.key(sample[i]),f.key(sample[0]));
for(let i=3;i<sample.length;i++)assert.notEqual(f.key(sample[i]),f.key(sample[0]));
const ordinaryShary=[{sku:'набор посуды шары 25',nmId:'10',iso:'2026-11-01'}];
const ordinaryIdentity=c.createSkuIdentity(ordinaryShary);
assert.equal(ordinaryIdentity.meta(ordinaryShary[0]).sku,'набор посуды шары 25','Ordinary Shary must never gain NG without an explicit NG row');
assert(!c.hasNewYearMarker(ordinaryIdentity.meta(ordinaryShary[0]).sku));
const ng25a={sku:'набор посуды нг 25',iso:'2026-11-06'};
const ng25b={sku:'набор посуды нг 25 шт',iso:'2026-11-06'};
const ng25=c.createSkuIdentity([ng25a,ng25b]);
assert.equal(ng25.key(ng25a),'NMID:2018713182');
assert.equal(ng25.key(ng25b),'NMID:2018713182');
assert.equal(ng25.meta(ng25a).nmId,'2018713182');
assert.throws(()=>c.createSkuIdentity([{sku:'тестовый товар',nmId:'1'},{sku:'тестовый товар НГ',nmId:'2'},{sku:'тестовый товар'}]),/Ambiguous/);
assert.equal(JSON.stringify(data),original,'Identity/search must not mutate source data');
// Exercise the actual search box/render functions, including filtered headline totals.
const fixtureSource=read('tests/signals-ui-v11.cjs').split('const output={};')[0];
const makeFixture=new Function('require','process',fixtureSource+'\nreturn fixture;')(require,process);
const rendered=makeFixture(html),run=code=>vm.runInContext(code,rendered.c);
rendered.elements.get('allRangeV17').onclick();
run("state.search='НГ';state.quick='all';state.status='all';state.cpo='all';renderAll();");
assert.equal(run('getGroups().length'),new Set(seasonal.map(key)).size);
assert.equal(run('getGroups().flatMap(g=>g.rows).length'),seasonal.length);
assert(rendered.elements.get('skuTable').innerHTML.includes('НГ'));
for(const field of ['ordersQty','ordersRub','buyoutsQty','ads']){
 const expected=seasonal.reduce((s,r)=>s+(Number(r[field])||0),0);
 assert(Math.abs(run('agg(getGroups().flatMap(g=>g.rows)).'+field)-expected)<1e-6,'Filtered total '+field);
}
assert(run('getGroups().length')>0);
run('openSignalSkuV11(getGroups()[0].key)');assert(rendered.elements.get('skuTable').innerHTML.includes(data.through));
const patchSource=read('management-src/sku-identity-ng-v1.js'),p={};vm.createContext(p);vm.runInContext(patchSource,p);
const oldGuard=read('tests/fixtures/sku-identity-before-ng.js').trim();
// The encrypted roundtrip uses public data, plus the owner's real sorting anchors.
const sortingFixture=read('tests/fixtures/management-sort-before.html');
const ownerSorting=sortingFixture.match(/<select id="fSort">[\s\S]*?<\/select>/)[0]+
 '<script>'+sortingFixture.slice(sortingFixture.indexOf('function renderSku(){'),sortingFixture.indexOf('function syncSort(){'))+'</script>';
const originalFrame=html.replace(guard,oldGuard).replace('</head>','<!-- PAKKOM_MANAGEMENT_FILTERS_V9 -->\n</head>').replace('</body>',ownerSorting+'\n</body>');
const patched=p.applyPakkomSkuIdentityNgV1(originalFrame);
assert(patched.includes(guard));assert.equal(p.applyPakkomSkuIdentityNgV1(patched),patched);
assert.equal(originalFrame.replace(oldGuard,''),patched.replace(guard,''),'Owner patch may change only identity code');
assert.throws(()=>p.applyPakkomSkuIdentityNgV1('unrelated document'),/anchor/);
assert(owner.includes(read('management-src/access-loader-v10.js').trim()));
assert(!owner.includes('"daily":'),'Owner financial data must remain encrypted');
// Exercise the real owner login/decrypt/checksum/patch pipeline using synthetic keys only.
(async()=>{
 const crypto=webcrypto,enc=new TextEncoder(),sub=crypto.subtle,b64=a=>Buffer.from(a).toString('base64'),random=n=>crypto.getRandomValues(new Uint8Array(n));
 const secret='synthetic-test-only',pair=await sub.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const salt=random(16),iv=random(12),material=await sub.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);
 const wrapping=await sub.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt']);
 const privateBytes=await sub.exportKey('pkcs8',pair.privateKey),privateCipher=await sub.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('pakkom-management-key-v1')},wrapping,privateBytes);
 const raw=random(32),payloadIv=random(12),aes=await sub.importKey('raw',raw,'AES-GCM',false,['encrypt']);
 const ciphertext=await sub.encrypt({name:'AES-GCM',iv:payloadIv,additionalData:enc.encode('pakkom-management-dashboard-v1')},aes,gzipSync(originalFrame));
 const release={schema:'pakkom-management-sealed-v1',through:data.through,account:{kdf:'PBKDF2-SHA256',iterations:600000,salt:b64(salt),iv:b64(iv),publicKey:b64(await sub.exportKey('spki',pair.publicKey)),privateKeyCiphertext:b64(privateCipher)},payload:{iv:b64(payloadIv),wrappedKey:b64(await sub.encrypt({name:'RSA-OAEP'},pair.publicKey,raw)),ciphertext:b64(ciphertext),sha256:Buffer.from(await sub.digest('SHA-256',enc.encode(originalFrame))).toString('hex')}};
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',checked:false,hidden:false,disabled:false,setAttribute(){},removeAttribute(){},focus(){}});return elements.get(id)};
 el('pakkom-sealed-release').textContent=JSON.stringify(release);
 const context={console,crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Response,DecompressionStream,atob,setTimeout,clearTimeout,URL,document:{getElementById:el},window:{addEventListener(){}},indexedDB:{open(){throw Error('Synthetic storage disabled')}},location:{protocol:'https:',href:'https://example.test/management.html'}};
 vm.createContext(context);
 for(const m of owner.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
 await new Promise(resolve=>setTimeout(resolve,10));
 el('password').value='wrong';await el('login').onsubmit({preventDefault(){}});assert(!el('board').srcdoc,'Wrong password must remain blocked');
 el('password').value=secret;await el('login').onsubmit({preventDefault(){}});
 const {applyPakkomProfitPercentSortV1}=require('../management-src/profit-percent-sort-v1.js');
 assert.equal(el('board').srcdoc,applyPakkomProfitPercentSortV1(patched),'Real owner loader must apply identity and percentage sorting after decryption');
 assert.equal(el('password').value,'');assert.equal(el('gate').hidden,true);
 // A later report reuses the same account/private key and preserves the base UI.
 const nextIso=new Date(Date.parse(data.daily.map(r=>r.iso).sort().at(-1)+'T00:00:00Z')+86400000).toISOString().slice(0,10),nextDate=nextIso.split('-').reverse().join('.');
 const update={schema:'pakkom-report-data-update-v1',id:'synthetic-next-report',expectedThrough:data.through,through:nextDate,replacements:[],
  insertions:[{iso:nextIso,date:nextDate,sku:'Synthetic update',nmId:'999999999',ordersQty:2,ordersRub:100,ads:10,profit:55}],
  dailyChecks:[{iso:nextIso,rows:1,sums:{ordersQty:2,ordersRub:100,ads:10,profit:55}}],weeks:data.weeks,business:{profit:1234,ads:999},controlDaily:{}};
 const patchText=JSON.stringify(update),patchRaw=random(32),patchIv=random(12),patchAes=await sub.importKey('raw',patchRaw,'AES-GCM',false,['encrypt']);
 const patchCipher=await sub.encrypt({name:'AES-GCM',iv:patchIv,additionalData:enc.encode('pakkom-management-dashboard-v1')},patchAes,gzipSync(patchText));
 const nextRelease={...release,through:nextDate,payloadFormat:'pakkom-management-data-update-v1',basePayload:release.payload,payload:{iv:b64(patchIv),wrappedKey:b64(await sub.encrypt({name:'RSA-OAEP'},pair.publicKey,patchRaw)),ciphertext:b64(patchCipher),sha256:Buffer.from(await sub.digest('SHA-256',enc.encode(patchText))).toString('hex')}};
 const {applyPakkomReportDataUpdateV1}=require('../management-src/report-data-update-v1.js');
 context.fetch=async()=>({ok:true,text:async()=>'<script id="pakkom-sealed-release" type="application/json">'+JSON.stringify(nextRelease)+'</script>'});
 await el('refresh').onclick();assert.equal(el('board').srcdoc,applyPakkomReportDataUpdateV1(applyPakkomProfitPercentSortV1(patched),update));
 assert.equal(el('active-date').textContent,'Данные по '+nextDate);assert.equal(el('status').textContent,'Обновлено');
 await el('refresh').onclick();assert.equal(el('status').textContent,'У вас актуальная версия');
 const secondIso=new Date(Date.parse(nextIso+'T00:00:00Z')+86400000).toISOString().slice(0,10),secondDate=secondIso.split('-').reverse().join('.');
 const secondUpdate={...update,id:'synthetic-second-report',expectedThrough:nextDate,through:secondDate,
  insertions:[{...update.insertions[0],date:secondDate,iso:secondIso}],dailyChecks:[{...update.dailyChecks[0],iso:secondIso}],business:{profit:1289,ads:1009}};
 const secondText=JSON.stringify(secondUpdate),secondRaw=random(32),secondIv=random(12),secondAes=await sub.importKey('raw',secondRaw,'AES-GCM',false,['encrypt']);
 const secondCipher=await sub.encrypt({name:'AES-GCM',iv:secondIv,additionalData:enc.encode('pakkom-management-dashboard-v1')},secondAes,gzipSync(secondText));
 const secondRelease={...nextRelease,through:secondDate,previousUpdates:[nextRelease.payload],payload:{iv:b64(secondIv),wrappedKey:b64(await sub.encrypt({name:'RSA-OAEP'},pair.publicKey,secondRaw)),ciphertext:b64(secondCipher),sha256:Buffer.from(await sub.digest('SHA-256',enc.encode(secondText))).toString('hex')}};
 const firstReport=el('board').srcdoc;
 const corruptHistory={...secondRelease,previousUpdates:[{...nextRelease.payload,sha256:'0'.repeat(64)}]};
 context.fetch=async()=>({ok:true,text:async()=>'<script id="pakkom-sealed-release" type="application/json">'+JSON.stringify(corruptHistory)+'</script>'});
 await el('refresh').onclick();assert.equal(el('board').srcdoc,firstReport);assert.equal(el('status').className,'error');
 context.fetch=async()=>({ok:true,text:async()=>'<script id="pakkom-sealed-release" type="application/json">'+JSON.stringify(secondRelease)+'</script>'});
 await el('refresh').onclick();
 assert.equal(el('board').srcdoc,applyPakkomReportDataUpdateV1(firstReport,secondUpdate),'Chained updates must retain the earlier inserted day');
 assert.equal(el('active-date').textContent,'Данные по '+secondDate);
 const stable=el('board').srcdoc;secondRelease.payload.sha256='0'.repeat(64);
 await el('refresh').onclick();assert.equal(el('board').srcdoc,stable);assert.equal(el('status').className,'error');
 console.log(JSON.stringify({newYearProducts:new Set(seasonal.map(key)).size,matchedRows:seasonal.length,sourceRows:data.daily.length,sourceData:'unchanged',oldNewSearch:'same complete history',dimensions:'preserved',ownerLoginAndPatch:'passed synthetic cryptographic roundtrip',encryptedFinancialData:'preserved'}));
})().catch(error=>{console.error(error);process.exitCode=1});
