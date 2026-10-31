import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=app.slice(app.indexOf('function updateWithControlFocus('),app.indexOf('function categorySelect('));
assert.ok(helper.startsWith('function updateWithControlFocus('));
const category=app.slice(app.indexOf('function categorySelect('),app.indexOf('const categoryInfo='));
const compare=app.slice(app.indexOf('function toggleCompare('),app.indexOf('function renderCompare('));
function binding(attribute){
 const start=app.indexOf("document.querySelectorAll('[data-"+attribute+"]').forEach(b=>b.onclick=");
 assert.ok(start>=0);
 return app.slice(start,app.indexOf(';',start)+1);
}
const bindings=binding('cat')+'\n'+binding('compare');
const oldBindings="document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>categorySelect(+b.dataset.cat));\n"+
 "document.querySelectorAll('[data-compare]').forEach(b=>b.onclick=()=>toggleCompare(+b.dataset.compare));";

// A detached-node fixture executes the actual event bindings and state changes.
// It does not claim to emulate browser Tab navigation or mobile behavior.
function harness({original=false,omitReplacement=false}={}){
 const body={tagName:'BODY'},other={id:'stable-control'},modal={id:'detailCompare'};
 const document={activeElement:body,querySelectorAll(selector){
  if(selector==='[data-cat]')return categoryButtons;
  if(selector==='[data-compare]')return compareButtons;
  throw new Error('Unexpected selector '+selector);
 },querySelector(selector){return nodes.get(selector)||null;}};
 let categoryButtons=[],compareButtons=[],nodes=new Map(),renders=0,ctx;
 const scrolls=[],messages=[];
 const fields={budget:{value:'100000'},area:{value:'東京'},catalog:{scrollIntoView(options){scrolls.push(options);}}};
 function makeButton(type,id,parent){
  return {dataset:{[type]:String(id)},parentElement:{id:parent},isConnected:true,focusCalls:[],focus(options){
   assert.ok(this.isConnected,'Never focus a detached node');this.focusCalls.push(options);document.activeElement=this;
  }};
 }
 function build(){
  for(const button of [...categoryButtons,...compareButtons]){
   button.isConnected=false;
   if(document.activeElement===button)document.activeElement=body;
  }
  categoryButtons=[];compareButtons=[];nodes=new Map();
  for(const parent of ['categoryRail','sideCategories'])for(const id of [0,1,7]){
   const b=makeButton('cat',id,parent);categoryButtons.push(b);
   if(!omitReplacement||renders===0)nodes.set('#'+parent+' [data-cat="'+id+'"]',b);
  }
  for(const id of [1022,1023,1237,1034]){
   const b=makeButton('compare',id,'card');compareButtons.push(b);
   if(!omitReplacement||renders===0)nodes.set('button[data-compare="'+id+'"]',b);
  }
 }
 const sandbox={document,state:{cat:0,mode:'all',saved:false,lesson:false},compare:[],
  $:selector=>fields[selector.slice(1)],toast:message=>messages.push(message),render(){
   renders++;build();vm.runInContext(original?oldBindings:bindings,ctx);
  }};
 build();ctx=vm.createContext(sandbox);
 vm.runInContext(helper+'\n'+category+'\n'+compare+'\n'+(original?oldBindings:bindings),ctx);
 return {document,body,other,modal,fields,scrolls,messages,ctx,
  get renders(){return renders;},get compared(){return [...sandbox.compare];},get state(){return sandbox.state;},
  category:(parent,id)=>categoryButtons.find(b=>b.parentElement.id===parent&&b.dataset.cat===String(id)),
  compare:id=>compareButtons.find(b=>b.dataset.compare===String(id)),
  activate(button,{focused=true}={}){if(focused)document.activeElement=button;button.onclick();},
  detailCompare(id){document.activeElement=modal;vm.runInContext('toggleCompare('+id+')',ctx);}
 };
}

for(const type of ['category','compare'])test('negative control: old '+type+' binding loses detached control focus',()=>{
 const h=harness({original:true});h.activate(type==='category'?h.category('sideCategories',1):h.compare(1022));
 assert.equal(h.document.activeElement,h.body);
});
for(const parent of ['categoryRail','sideCategories'])test(parent+': same category in same container receives focus',()=>{
 const h=harness(),old=h.category(parent,1);h.activate(old);
 const current=h.category(parent,1);
 assert.notEqual(current,old);assert.equal(h.document.activeElement,current);
 assert.equal(current.focusCalls.length,1);assert.equal(current.focusCalls[0].preventScroll,true);
 assert.equal(h.category(parent==='categoryRail'?'sideCategories':'categoryRail',1).focusCalls.length,0);
 assert.equal(h.state.cat,1);assert.equal(h.state.mode,'goods');assert.equal(h.scrolls.length,1);
});
test('repeated category changes keep state changes and only the newest focused node',()=>{
 const h=harness();
 for(const id of [1,7,0,1]){h.activate(h.category('sideCategories',id));assert.equal(h.document.activeElement,h.category('sideCategories',id));}
 assert.equal(h.renders,4);assert.equal(h.fields.budget.value,'');assert.equal(h.fields.area.value,'');
 assert.equal(h.state.saved,false);assert.equal(h.state.lesson,false);
});
test('unfocused category click does not steal another control focus',()=>{
 const h=harness();h.document.activeElement=h.other;h.activate(h.category('sideCategories',1),{focused:false});
 assert.equal(h.document.activeElement,h.other);assert.equal(h.renders,1);
});
test('card comparison add and remove restore the exact fresh item control',()=>{
 const h=harness();
 for(const expected of [[1022],[],[1022],[]]){
  const old=h.compare(1022);h.activate(old);assert.deepEqual(h.compared,expected);
  assert.notEqual(h.compare(1022),old);assert.equal(h.document.activeElement,h.compare(1022));
  assert.equal(h.compare(1022).focusCalls[0].preventScroll,true);
 }
 assert.equal(h.renders,4);
});
test('comparison cap retains focused original control without a redraw',()=>{
 const h=harness();for(const id of [1022,1023,1237])h.activate(h.compare(id));
 const fourth=h.compare(1034);h.activate(fourth);
 assert.deepEqual(h.compared,[1022,1023,1237]);assert.equal(h.renders,3);
 assert.equal(h.document.activeElement,fourth);assert.equal(h.messages.at(-1),'比較できるのは3件までです');
});
test('unfocused comparison click does not steal focus',()=>{
 const h=harness();h.document.activeElement=h.other;h.activate(h.compare(1022),{focused:false});
 assert.equal(h.document.activeElement,h.other);assert.deepEqual(h.compared,[1022]);
});
test('detail-modal comparison path is not redirected into the grid',()=>{
 const h=harness();h.detailCompare(1022);
 assert.equal(h.document.activeElement,h.modal);assert.equal(h.compare(1022).focusCalls.length,0);
 assert.deepEqual(h.compared,[1022]);
});
for(const type of ['category','compare'])test(type+': missing replacement never focuses an unrelated control',()=>{
 const h=harness({omitReplacement:true});assert.doesNotThrow(()=>h.activate(type==='category'?h.category('sideCategories',1):h.compare(1022)));
 assert.equal(h.document.activeElement,h.body);
});

// Clearing controls disappear rather than receiving replacement nodes. Execute
// the actual bindings and existing focus helper, with stable input/list targets.
const chipStart=app.indexOf("document.querySelectorAll('.resetChip')");
const chipEnd=app.indexOf(";$('#grid')",chipStart);
assert.ok(chipStart>=0&&chipEnd>chipStart);
const chipBinding=app.slice(chipStart,chipEnd+1);
const clearStart=app.indexOf("$('#clearCompare').onclick=");
const clearEnd=app.indexOf('\nfunction showCompare(',clearStart);
assert.ok(clearStart>=0&&clearEnd>clearStart);
const clearBinding=app.slice(clearStart,clearEnd).trimEnd().slice(0,-1)+';';
const originalChipBinding="document.querySelectorAll('.resetChip').forEach(b=>b.onclick=()=>{$('#'+b.dataset.clear).value='';render()});";
const originalClearBinding="$('#clearCompare').onclick=()=>{compare=[];render()};";
const filterIds=['search','purpose','budget','area','apparelType','apparelBrand'];
function clearHarness({original=false,missingTarget=false}={}){
 const body={tagName:'BODY'},other={id:'stable-control'};
 let chips=[],clearButton,ctx,renders=0;
 const document={activeElement:body,querySelectorAll(selector){
  assert.equal(selector,'.resetChip');return chips;
 },querySelector(selector){return missingTarget?null:fields[selector.slice(1)]||null;}};
 const fields=Object.fromEntries([...filterIds,'resultTitle'].map(id=>[id,{id,value:'selected-'+id,focusCalls:[],focus(options){
  this.focusCalls.push(options);document.activeElement=this;
 }}]));
 function build(){
  for(const old of [...chips,clearButton].filter(Boolean)){
   if(document.activeElement===old)document.activeElement=body;
  }
  chips=filterIds.filter(id=>fields[id].value).map(id=>({dataset:{clear:id}}));
  clearButton={id:'clearCompare'};
 }
 const sandbox={document,compare:[1022,1023],$:selector=>selector==='#clearCompare'?clearButton:fields[selector.slice(1)],
  render(){renders++;build();bind();}};
 const code=(original?originalChipBinding:chipBinding)+'\n'+(original?originalClearBinding:clearBinding);
 function bind(){vm.runInContext(code,ctx);}
 build();ctx=vm.createContext(sandbox);vm.runInContext(helper,ctx);bind();
 return {document,body,other,fields,get renders(){return renders;},get compared(){return [...sandbox.compare];},
  get clearButton(){return clearButton;},chip:id=>chips.find(b=>b.dataset.clear===id),
  activate(button,{focused=true}={}){if(focused)document.activeElement=button;button.onclick({currentTarget:button});},
  reselect(id){fields[id].value='selected-'+id;sandbox.render();},
  refillComparison(){sandbox.compare=[1237];sandbox.render();}
 };
}
for(const type of ['chip','clearCompare'])test('negative control: old '+type+' clear binding loses removed control focus',()=>{
 const h=clearHarness({original:true});h.activate(type==='chip'?h.chip('search'):h.clearButton);
 assert.equal(h.document.activeElement,h.body);
});
for(const id of filterIds)test('clearing '+id+' returns focus only to its original input',()=>{
 const h=clearHarness();h.activate(h.chip(id));
 assert.equal(h.fields[id].value,'');assert.equal(h.chip(id),undefined);
 assert.equal(h.document.activeElement,h.fields[id]);assert.equal(h.fields[id].focusCalls.length,1);
 assert.equal(h.fields[id].focusCalls[0].preventScroll,true);
 for(const other of filterIds.filter(x=>x!==id)){
  assert.equal(h.fields[other].value,'selected-'+other);assert.equal(h.fields[other].focusCalls.length,0);
 }
 assert.deepEqual(h.compared,[1022,1023]);assert.equal(h.renders,1);
});
test('repeated search-chip removal restores the same stable input',()=>{
 const h=clearHarness();
 for(let i=0;i<3;i++){h.activate(h.chip('search'));assert.equal(h.document.activeElement,h.fields.search);h.reselect('search');}
 assert.equal(h.fields.search.focusCalls.length,3);
});
test('unfocused chip clear does not steal another control focus',()=>{
 const h=clearHarness();h.document.activeElement=h.other;h.activate(h.chip('budget'),{focused:false});
 assert.equal(h.document.activeElement,h.other);assert.equal(h.fields.budget.value,'');
});
test('comparison clear focuses the visible result heading, not the now hidden bar',()=>{
 const h=clearHarness(),old=h.clearButton;h.activate(old);
 assert.notEqual(h.clearButton,old);assert.deepEqual(h.compared,[]);
 assert.equal(h.document.activeElement,h.fields.resultTitle);
 assert.equal(h.fields.resultTitle.focusCalls[0].preventScroll,true);
 for(const id of filterIds)assert.equal(h.fields[id].value,'selected-'+id);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="resultTitle" tabindex="-1"/);
});
test('repeated comparison refill and clear keeps the result heading target',()=>{
 const h=clearHarness();
 for(let i=0;i<3;i++){h.activate(h.clearButton);assert.deepEqual(h.compared,[]);h.refillComparison();}
 assert.equal(h.fields.resultTitle.focusCalls.length,3);
});
test('unfocused comparison clear does not steal another control focus',()=>{
 const h=clearHarness();h.document.activeElement=h.other;h.activate(h.clearButton,{focused:false});
 assert.equal(h.document.activeElement,h.other);assert.deepEqual(h.compared,[]);
});
for(const type of ['chip','clearCompare'])test(type+': absent clear-focus target does not throw or focus unrelated controls',()=>{
 const h=clearHarness({missingTarget:true});
 assert.doesNotThrow(()=>h.activate(type==='chip'?h.chip('search'):h.clearButton));
 assert.equal(h.document.activeElement,h.body);
});
