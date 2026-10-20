const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const D=process.argv[2]||process.cwd();
function fixture(html){
 const elements=new Map();
 const el=(id='')=>({id,value:'',textContent:'',innerHTML:'',style:{},dataset:{},classList:{_s:new Set(),contains(x){return this._s.has(x)},toggle(x,y){if(y===undefined)y=!this._s.has(x);y?this._s.add(x):this._s.delete(x)},add(x){this._s.add(x)},remove(x){this._s.delete(x)}},setAttribute(){},getAttribute(){return null},addEventListener(){},removeEventListener(){},querySelectorAll(){return []},scrollIntoView(){},getBoundingClientRect(){return {width:120}}});
 for(const m of html.matchAll(/\bid="([^"]+)"/g))if(!elements.has(m[1]))elements.set(m[1],el(m[1]));
 elements.get('data').textContent=html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1];
 const quick=[...html.matchAll(/class="quick[^\"]*" data-q="([^\"]+)"/g)].map(m=>{const b=el();b.dataset.q=m[1];return b});
 const tabs=['weekly','daily'].map(t=>{const b=el();b.dataset.tab=t;return b});if(elements.has('weekly'))elements.get('weekly').classList.add('on');
 const document={getElementById(id){if(!elements.has(id))elements.set(id,el(id));return elements.get(id)},querySelectorAll(selector){if(selector==='.quick')return quick;if(selector==='.tab')return tabs;if(selector==='.section')return ['weekly','daily'].map(x=>elements.get(x));return []}};
 const c={document,console,Intl,Date,Map,Set,Math,Number,String,Object,Array,JSON,RegExp,parseFloat,parseInt,setTimeout:fn=>fn()};vm.createContext(c);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);for(const s of scripts){new vm.Script(s);vm.runInContext(s,c,{timeout:20000})}
 return {c,elements,quick};
}
const output={};
for(const [file,mode] of [['index.html','radar'],['financial_updated.html','owner']]){
 const p=path.join(D,file);if(!fs.existsSync(p)){if(mode==='owner')continue;throw Error('Missing radar')}
 const html=fs.readFileSync(p,'utf8'),{c,elements,quick}=fixture(html);
 const initial=JSON.stringify(vm.runInContext('DATA',c));assert(elements.get('priorityListV11').innerHTML.includes('ложки премиум 100 шт белые'));
 vm.runInContext("state.search='1338773722';renderAll();",c);
 assert(elements.get('skuTable').innerHTML.includes('Критическое падение заказов'));
 if(mode==='radar'){
  vm.runInContext("state.status='scale';setQuick('criticalfall');",c);assert.equal(vm.runInContext('state.status',c),'all');assert.equal(vm.runInContext('getGroups().length',c),1);
  assert.notEqual(vm.runInContext('statusBase(getGroups()[0]).status',c),'scale');
 }else{
  vm.runInContext("state.cpo='control';state.profit='negative';selectManagementQuickV9('criticalfall');",c);assert.equal(vm.runInContext('state.cpo',c),'all');assert.equal(vm.runInContext('state.profit',c),'all');assert.equal(vm.runInContext('getGroups().length',c),1);
  assert.equal(vm.runInContext("zone({ads:100,ordersQty:0,cpo:null,cpoStd:10,cpoMax:20}).code",c),'critical');
 }
 vm.runInContext("openSignalSkuV11('NMID:1338773722')",c);assert(elements.get('skuTable').innerHTML.includes('102,5'));assert(elements.get('skuTable').innerHTML.includes('15.10.2026'));assert(elements.get('skuTable').innerHTML.includes('Следующие действия'));
 vm.runInContext("state.search='1425649630';renderAll();",c);
 const teaBefore=vm.runInContext("JSON.stringify(signalEngineV11.evaluate('NMID:1425649630'))",c);
 const teaRow=elements.get('skuTable').innerHTML.match(/<tr class="skurow"[\s\S]*?<\/tr>/)[0];
 const teaSignals=teaRow.match(/<td class="signal-column-v11">([\s\S]*?)<\/td>/)[1];
 assert.equal((teaSignals.match(/class="signal signal-pill/g)||[]).length,1);
 assert(teaSignals.includes('Критическое падение заказов'));
 assert(!teaSignals.includes('Длительное снижение'));
 vm.runInContext(mode==='radar'?"setQuick('longfall')":"selectManagementQuickV9('longfall')",c);
 assert.equal(vm.runInContext('getGroups().length',c),1,'Hidden secondary signal must still filter the SKU');
 assert.equal(vm.runInContext('getGroups()[0].key',c),'NMID:1425649630');
 vm.runInContext("openSignalSkuV11('NMID:1425649630')",c);
 const attention=elements.get('skuTable').innerHTML;
 assert(attention.includes('Длительное снижение'));
 assert(attention.includes('<details class="signal-evidence-v11 signal-evidence-collapsed-v15">'));
 assert(attention.includes('<summary>Что требует внимания '));
 assert.equal(vm.runInContext("JSON.stringify(signalEngineV11.evaluate('NMID:1425649630'))",c),teaBefore,'Display must not mutate signal flags or labels');
 if(mode==='owner'){assert(attention.includes('<h3>Сводка SKU</h3>'));assert(attention.includes('Сценарий при 80% выкупе'));}
 vm.runInContext("state.search='';renderAll();",c);const n=vm.runInContext('priorityCandidatesV11().length',c);assert(n>12);vm.runInContext('allPrioritiesV11=true;renderPrioritiesV11()',c);assert.equal((elements.get('priorityListV11').innerHTML.match(/data-open-signal=/g)||[]).length,n);
 assert.equal(JSON.stringify(vm.runInContext('DATA',c)),initial);
 for(const row of elements.get('skuTable').innerHTML.matchAll(/<tr class="skurow"[\s\S]*?<\/tr>/g)){
  const cell=row[0].match(/<td class="signal-column-v11">([\s\S]*?)<\/td>/)[1];
  assert.equal((cell.match(/class="signal signal-pill/g)||[]).length,1,'Exactly one primary signal per SKU row');
 }
 assert(!elements.get('skuTable').innerHTML.includes('undefined'));assert(!elements.get('priorityListV11').innerHTML.includes('NaN'));
 output[mode]={initial_render:true,search:true,critical_filter:true,conflicting_filters_cleared:true,sku_detail:true,all_priorities:n,data_unchanged:true,one_primary_signal:true,hidden_signal_filter:true,attention_collapsed:true};
}
console.log(JSON.stringify(output));
