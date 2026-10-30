import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual modal functions in app.js, using a small DOM fixture.
// These regressions are not a replacement for real-browser keyboard QA.
const proposed=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fallback=proposed.match(/\n else if\(target instanceof HTMLElement&&target\.dataset\.detail\)\{[\s\S]*?\n \}/)?.[0];
assert.ok(fallback,'Expected detached detail-opener fallback');
const original=proposed.replace(fallback,'');

function harness(source){
 const document={activeElement:null,candidates:[],querySelectorAll(selector){assert.equal(selector,'button[data-detail]');return this.candidates;}};
 class HTMLElement {
  constructor({detail,kind='',connected=true}={}){this.dataset=detail===undefined?{}:{detail:String(detail)};this.className=kind;this.isConnected=connected;this.focusCount=0;this.attributes={};}
  focus(){this.focusCount++;document.activeElement=this;}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
 }
 const heading=new HTMLElement(),body={innerHTML:'',querySelector:()=>heading};
 const dialog=new HTMLElement();dialog.open=false;dialog.listeners={};
 dialog.addEventListener=(name,fn)=>{dialog.listeners[name]=fn;};
 dialog.showModal=()=>{dialog.open=true;};
 dialog.close=()=>{dialog.open=false;dialog.listeners.close();};
 const closeButton=new HTMLElement();
 const $=selector=>({'#modal':dialog,'#modalBody':body,'.close':closeButton})[selector];
 const start=source.indexOf('let modalReturnFocus=null;'),end=source.indexOf('function detail(id)',start);
 assert.ok(start>=0&&end>start);
 const ctx=vm.createContext({document,HTMLElement,$,requestAnimationFrame:fn=>fn()});
 vm.runInContext(source.slice(start,end),ctx,{timeout:1000});
 return {document,dialog,heading,element:opts=>new HTMLElement(opts),open(opener){document.activeElement=opener;vm.runInContext("modal('<h2>Example</h2>')",ctx);},replaceContent(){vm.runInContext("modal('<h2>Replacement</h2>')",ctx);},close(){vm.runInContext('closeModal()',ctx);}};
}

test('negative control: original source loses focus after opener detaches',()=>{
 const h=harness(original),old=h.element({detail:1034,kind:'productVisual'}),replacement=h.element({detail:1034,kind:'productVisual'});
 h.open(old);old.isConnected=false;h.document.candidates=[replacement];h.close();assert.equal(replacement.focusCount,0);
});
test('connected opener still receives focus; original guard remains',()=>{
 assert.ok(proposed.includes('target instanceof HTMLElement&&target.isConnected)target.focus()'));
 const h=harness(proposed),old=h.element({detail:1034,kind:'productVisual'});h.open(old);h.close();assert.equal(old.focusCount,1);
});
for(const kind of ['productVisual','namebtn','viewDetails']){
 test(`detached ${kind} returns to same item and same button kind`,()=>{
  const h=harness(proposed),old=h.element({detail:1034,kind});h.open(old);old.isConnected=false;
  const wrong=h.element({detail:9999,kind}),other=h.element({detail:1034,kind:'other'}),same=h.element({detail:1034,kind});
  h.document.candidates=[wrong,other,same];h.close();assert.equal(same.focusCount,1);assert.equal(other.focusCount,0);assert.equal(wrong.focusCount,0);
 });
}
test('class change falls back only to a detail button for the same item',()=>{
 const h=harness(proposed),old=h.element({detail:1034,kind:'old-class'});h.open(old);old.isConnected=false;
 const wrong=h.element({detail:4}),same=h.element({detail:1034,kind:'productVisual'});h.document.candidates=[wrong,same];h.close();assert.equal(same.focusCount,1);assert.equal(wrong.focusCount,0);
});
test('missing item does not focus an unrelated item or throw',()=>{
 const h=harness(proposed),old=h.element({detail:1034});h.open(old);old.isConnected=false;const wrong=h.element({detail:4});h.document.candidates=[wrong];assert.doesNotThrow(()=>h.close());assert.equal(wrong.focusCount,0);
});
test('guide opener remains unchanged when connected',()=>{
 const h=harness(proposed),guide=h.element({kind:'guide'});h.open(guide);h.close();assert.equal(guide.focusCount,1);
});
test('changing open modal content preserves original return target',()=>{
 const h=harness(proposed),old=h.element({detail:1034});h.open(old);h.replaceContent();h.close();assert.equal(old.focusCount,1);assert.equal(h.document.activeElement,old);
});
test('close event clears return target and is safe when delivered again',()=>{
 const h=harness(proposed),old=h.element({detail:1034});h.open(old);h.close();h.dialog.listeners.close();assert.equal(old.focusCount,1);
});

test('repeated comparison changes restore each new opener, not a stale one',()=>{
 const h=harness(proposed);
 let opener=h.element({detail:1034,kind:'viewDetails'});
 for(let i=0;i<4;i++){
  h.open(opener);opener.isConnected=false;
  const next=h.element({detail:1034,kind:'viewDetails'});
  h.document.candidates=[next];h.close();
  assert.equal(h.document.activeElement,next);assert.equal(next.focusCount,1);
  opener=next;
 }
});
test('disconnected non-detail opener does not move focus to a product',()=>{
 const h=harness(proposed),old=h.element({kind:'guide'}),wrong=h.element({detail:1034});
 h.open(old);old.isConnected=false;h.document.candidates=[wrong];
 assert.doesNotThrow(()=>h.close());assert.equal(wrong.focusCount,0);
});
test('modal heading remains focused and used as the accessible name',()=>{
 const h=harness(proposed),old=h.element({detail:1034});h.open(old);
 assert.equal(h.document.activeElement,h.heading);
 assert.equal(h.heading.id,'modalTitle');assert.equal(h.heading.tabIndex,-1);
 assert.equal(h.dialog.attributes['aria-labelledby'],'modalTitle');
});
test('direct close event (including Escape dismissal) restores the opener',()=>{
 const h=harness(proposed),old=h.element({detail:1034});h.open(old);
 h.dialog.listeners.close();assert.equal(h.document.activeElement,old);
});
test('close when no modal is open is a safe no-op',()=>{
 const h=harness(proposed);assert.doesNotThrow(()=>h.close());
 assert.equal(h.document.activeElement,null);
});
