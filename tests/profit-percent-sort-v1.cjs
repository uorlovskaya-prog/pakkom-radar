const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {applyPakkomProfitPercentSortV1:patch}=require('../management-src/profit-percent-sort-v1.js');
const original=fs.readFileSync('tests/fixtures/management-sort-before.html','utf8');
function load(html){
 const elements=new Map(),headers=new Map();
 const el=id=>({id,value:'',innerHTML:'',textContent:'',dataset:{},classList:{contains:()=>false}});
 for(const id of ['skuTable','fSort','sortDir'])elements.set(id,el(id));
 const document={getElementById:id=>elements.get(id),querySelectorAll(selector){
  if(selector!=='#skuTable th[data-k]')return [];
  headers.clear();
  for(const m of elements.get('skuTable').innerHTML.matchAll(/<th data-k="([^"]+)"/g)){
   const h=el(m[1]);h.dataset.k=m[1];headers.set(m[1],h);
  }
  return [...headers.values()];
 }};
 const c=vm.createContext({document,console});
 for(const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(s[1],c);
 const run=code=>vm.runInContext(code,c);
 return {elements,run,click(key,resize=false){headers.get(key).onclick({target:{classList:{contains:()=>resize}}})},order(){return [...elements.get('skuTable').innerHTML.matchAll(/class="skurow" data-key="([^"]+)"/g)].map(m=>m[1])}};
}
const broken=load(original),before=broken.order();broken.click('margin');assert.deepEqual(broken.order(),before,'Fixture must reproduce ignored ЧП % click');
const html=patch(original),app=load(html),raw=app.run('JSON.stringify(sample)');
assert.equal(patch(html),html,'Patch is idempotent');
assert.equal((html.match(/<option value="margin">/g)||[]).length,1);
app.click('margin');assert.deepEqual(app.order(),['B','A','D','E','C']);
assert.equal(app.elements.get('fSort').value,'margin');assert.equal(app.elements.get('sortDir').textContent,'↓ от большего');
assert(app.elements.get('skuTable').innerHTML.includes('ЧП % <span class="sortmark">↓</span>'));
app.click('margin');assert.deepEqual(app.order(),['C','E','D','A','B']);
assert.equal(app.elements.get('sortDir').textContent,'↑ от меньшего');
app.elements.get('sortDir').onclick();assert.deepEqual(app.order(),['B','A','D','E','C']);
app.click('margin',true);assert.deepEqual(app.order(),['B','A','D','E','C'],'Resize must not sort');
app.click('profit');assert.deepEqual(app.order(),['D','A','B','E','C'],'Ruble sorting unchanged');
app.elements.get('fSort').onchange({target:{value:'margin'}});assert.deepEqual(app.order(),['B','A','D','E','C']);
app.run('shown=sample.filter(g=>g.key!=="A");renderSku()');assert.deepEqual(app.order(),['B','D','E','C'],'Current selection preserved');
assert.equal(app.run('JSON.stringify(sample)'),raw,'Financial inputs unchanged');
const page=fs.readFileSync('management.html','utf8'),moduleSource=fs.readFileSync('management-src/profit-percent-sort-v1.js','utf8'),loader=fs.readFileSync('management-src/access-loader-v10.js','utf8');
assert(page.includes(moduleSource));assert(page.includes(loader.trim()));
assert(loader.includes('return applyPakkomProfitPercentSortV1(applyPakkomAdAttributionV1(applyPakkomSkuIdentityNgV1(applyPakkomManagementFiltersV9(html))));'));
for(const script of page.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
console.log('PASS: ЧП % header, dropdown, both directions, negative/fractional/zero values, resize, selection, ruble sorting, input preservation and loader integration');
