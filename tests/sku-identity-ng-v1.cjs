const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto'),{gzipSync}=require('node:zlib');
const root=process.argv[2]||process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),owner=read('management.html'),guard=read('sku-identity-v4.js').trim();
const data=JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const original=JSON.stringify(data),c={DATA:data};vm.createContext(c);vm.runInContext(guard,c);
const before={DATA:data};vm.createContext(before);vm.runInContext(read('tests/fixtures/sku-identity-before-ng.js'),before);
const fullNew='стаканы бум НГ 350 мл 50 шт снегири',fullOld='стаканы бум 350 мл 50 шт снегири';
assert.equal(data.daily.filter(r=>before.matchesSkuSearch(r,fullNew)).length,0,'Fixture must reproduce the missing renamed product');
const hits=q=>data.daily.filter(r=>c.matchesSkuSearch(r,q));
const current=hits(fullNew),previous=hits(fullOld);assert(current.length>0);assert.deepEqual(current,previous);
assert.equal(new Set(current.map(c.canonicalSkuKey)).size,1);
for(const name of ['набор посуды нг снегири 25шт','набор посуды нг щелк 12','набор посуды нг щелк 25']){
 const a=hits(name),b=hits(name.replace(/нг /,''));assert(a.length>0,name);assert.deepEqual(a,b,name);
}
const seasonal=hits('НГ');assert(seasonal.length>0&&seasonal.length<data.daily.length);
for(const r of seasonal)assert(c.hasNewYearMarker(c.skuMetaOf(r).sku));
assert(hits('НГ стаканы').every(r=>r.sku.startsWith('стаканы')));
assert(!hits('НГ').some(r=>r.sku==='стаканы пластик 200 мл 100 шт'));
const key=r=>c.canonicalSkuKey(r),dateKeys=data.daily.map(r=>r.iso+'|'+key(r));
assert.equal(new Set(dateKeys).size,dateKeys.length,'No duplicate daily products');
for(const r of data.daily)assert.equal(key(r),before.canonicalSkuKey(r),'Current historical product IDs must stay stable');
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
assert.throws(()=>c.createSkuIdentity([{sku:fullOld,nmId:'1'},{sku:fullNew,nmId:'2'},{sku:fullOld}]),/Ambiguous/);
assert.equal(JSON.stringify(data),original,'Identity/search must not mutate source data');
// Exercise the actual search box/render functions, including filtered headline totals.
const fixtureSource=read('tests/signals-ui-v11.cjs').split('const output={};')[0];
const makeFixture=new Function('require','process',fixtureSource+'\nreturn fixture;')(require,process);
const rendered=makeFixture(html),run=code=>vm.runInContext(code,rendered.c);
rendered.elements.get('allRangeV17').onclick();
run("state.search='НГ';state.quick='all';state.status='all';state.cpo='all';renderAll();");
assert.equal(run('getGroups().length'),new Set(seasonal.map(key)).size);
assert.equal(run('getGroups().flatMap(g=>g.rows).length'),seasonal.length);
assert(rendered.elements.get('skuTable').innerHTML.includes('стаканы бум НГ 350 мл 50 шт снегири'));
for(const field of ['ordersQty','ordersRub','buyoutsQty','ads']){
 const expected=seasonal.reduce((s,r)=>s+(Number(r[field])||0),0);
 assert(Math.abs(run('agg(getGroups().flatMap(g=>g.rows)).'+field)-expected)<1e-6,'Filtered total '+field);
}
run('state.search='+JSON.stringify(fullNew)+';renderAll();');assert.equal(run('getGroups().length'),1);
assert.equal(run('getGroups()[0].rows.length'),current.length);
run('openSignalSkuV11(getGroups()[0].key)');assert(rendered.elements.get('skuTable').innerHTML.includes('03.11.2026'));
const patchSource=read('management-src/sku-identity-ng-v1.js'),p={};vm.createContext(p);vm.runInContext(patchSource,p);
const oldGuard=read('tests/fixtures/sku-identity-before-ng.js').trim();
const originalFrame=html.replace(guard,oldGuard).replace('</head>','<!-- PAKKOM_MANAGEMENT_FILTERS_V9 -->\n</head>');
const patched=p.applyPakkomSkuIdentityNgV1(originalFrame);
assert(patched.includes(guard));assert.equal(p.applyPakkomSkuIdentityNgV1(patched),patched);
assert.equal(originalFrame.replace(oldGuard,''),patched.replace(guard,''),'Owner patch may change only identity code');
assert.throws(()=>p.applyPakkomSkuIdentityNgV1('unrelated document'),/anchor/);
assert(owner.includes(patchSource.trim()));assert(owner.includes(read('management-src/access-loader-v10.js').trim()));
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
 assert.equal(el('board').srcdoc,patched,'Real owner loader must apply the same verified NG code after decryption');
 assert.equal(el('password').value,'');assert.equal(el('gate').hidden,true);
 console.log(JSON.stringify({newYearProducts:new Set(seasonal.map(key)).size,matchedRows:seasonal.length,sourceRows:data.daily.length,sourceData:'unchanged',oldNewSearch:'same complete history',dimensions:'preserved',ownerLoginAndPatch:'passed synthetic cryptographic roundtrip',encryptedFinancialData:'preserved'}));
})().catch(error=>{console.error(error);process.exitCode=1});
