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
