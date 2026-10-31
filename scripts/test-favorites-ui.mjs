import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');
const start=app.indexOf('function emptyCatalogHtml(){'),end=app.indexOf('function reset(){',start);
assert.ok(start>=0&&end>start);
function harness({saved=false,favorites=[],storageThrows=false}={}){
 const writes=[],messages=[];let button=null,renderCount=0;
 const heading={focused:0,focus(){this.focused++;}};
 const sandbox={state:{saved},fav:[...favorites],localStorage:{setItem(key,value){if(storageThrows)throw new Error('blocked');writes.push([key,JSON.parse(value)]);}},document:{querySelector(selector){assert.match(selector,/^button\[data-fav="\d+"\]$/);return button;}},$:selector=>{assert.equal(selector,'#resultTitle');return heading;},toast:message=>messages.push(message),render(){renderCount++;button=sandbox.state.saved&&!sandbox.fav.length?null:{focused:0,focus(){this.focused++;}};}};
 const ctx=vm.createContext(sandbox);vm.runInContext(app.slice(start,end),ctx);
 return {ctx,writes,messages,heading,get button(){return button;},get renderCount(){return renderCount;},toggle:id=>vm.runInContext('toggleFavorite('+id+')',ctx),empty:()=>vm.runInContext('emptyCatalogHtml()',ctx)};
}
test('header and catalog explain save and revisit with visible text',()=>{
 assert.match(html,/id="savedBtn"[^>]+aria-label="お気に入りを見る（0件）"/);
 assert.ok(html.includes('class="saveheadLabel">お気に入りを見る'));
 assert.ok(html.includes('aria-label="お気に入りの使い方"'));
 assert.ok(html.includes('カードの「♡ 保存」から、上部の「お気に入りを見る」へ。'));
 assert.ok(html.includes('このブラウザーに保存。会員登録は不要です。'));
 assert.match(html,/id="resultTitle" tabindex="-1"/);
});
test('card exposes saved/unsaved words without removing pressed state',()=>{
 assert.ok(app.includes("${fav.includes(d.id)?'保存済み':'保存'}"));
 assert.ok(app.includes('aria-pressed="${fav.includes(d.id)}"'));
 assert.ok(app.includes("$('#savedBtn').setAttribute('aria-pressed',String(state.saved))"));
 assert.ok(css.includes('.heart.on{background:var(--green);color:#fff'));
});
test('save uses existing storage key and focuses newly rendered save control',()=>{
 const h=harness();h.toggle(1034);
 assert.deepEqual(h.writes,[['golf-guts-real-favs-v1',[1034]]]);
 assert.equal(h.renderCount,1);assert.equal(h.button.focused,1);
 assert.equal(h.messages.at(-1),'お気に入りに保存しました');
});
test('repeated save/remove keeps one copy and announces the correct state',()=>{
 const h=harness();h.toggle(1034);h.toggle(1034);h.toggle(1034);
 assert.deepEqual(h.writes.map(x=>x[1]),[[1034],[],[1034]]);
 assert.deepEqual(h.messages,['お気に入りに保存しました','お気に入りから外しました','お気に入りに保存しました']);
 assert.equal(h.button.focused,1);
});
test('removing last favorite from saved list focuses the result heading',()=>{
 const h=harness({saved:true,favorites:[1034]});h.toggle(1034);
 assert.equal(h.button,null);assert.equal(h.heading.focused,1);
 assert.deepEqual(h.writes,[['golf-guts-real-favs-v1',[]]]);
});
test('storage failure does not falsely announce persistent saving',()=>{
 const h=harness({storageThrows:true});assert.doesNotThrow(()=>h.toggle(1034));
 assert.equal(h.writes.length,0);assert.equal(h.messages.at(-1),'この環境ではお気に入りを保存できません');
 assert.equal(h.button.focused,1);
});
test('zero favorites gives first-save instructions, not a misleading filter error',()=>{
 const h=harness({saved:true});const empty=h.empty();
 assert.ok(empty.includes('商品・施設の「♡ 保存」'));
 assert.ok(empty.includes('id="emptyReset">候補を探す →'));
 assert.ok(!empty.includes('条件に合う候補がありません'));
});
test('filtered favorites and ordinary zero results retain distinct recovery guidance',()=>{
 const saved=harness({saved:true,favorites:[1034]}).empty();
 assert.ok(saved.includes('この条件のお気に入りはありません'));
 assert.ok(saved.includes('メンズ・レディース'));
 const ordinary=harness().empty();
 assert.ok(ordinary.includes('条件に合う候補がありません'));
 assert.ok(ordinary.includes('条件をリセット →'));
});

test('empty-state browse/reset returns keyboard focus to the list heading',()=>{
 const handler=app.match(/if\(\$\('#emptyReset'\)\)\$\('#emptyReset'\)\.onclick=(\(\)=>\{[^}]+\})/);
 assert.ok(handler,'Empty-reset handler');
 let resetCount=0,focusCount=0;
 const fixture={reset(){resetCount++;},$:selector=>{assert.equal(selector,'#resultTitle');return {focus(){focusCount++;}};}};
 vm.runInNewContext('('+handler[1]+')()',fixture);
 assert.equal(resetCount,1);assert.equal(focusCount,1);
});

function clearHarness({favorites=[1034],failures=0,storageGetterThrows=false,saved=false}={}){
 const storage=new Map([['golf-guts-real-favs-v1',JSON.stringify(favorites)],['unrelated','keep']]);
 const messages=[],status={textContent:''};let click,renders=0,closes=0,removes=0;
 const state={saved,audience:'women',cat:5},originalFavorites=[...favorites];
 const fixture={fav:originalFavorites,state,document:{addEventListener(type,handler){assert.equal(type,'click');click=handler;}},
  render(){renders++;},toast(message){messages.push(message);},
  $(selector){if(selector==='#clearDataStatus')return status;assert.equal(selector,'#modal');return {close(){closes++;}};}};
 Object.defineProperty(fixture,'localStorage',{get(){
  if(storageGetterThrows)throw Object.assign(new Error('Synthetic restriction'),{name:'SecurityError'});
  return {removeItem(key){removes++;if(removes<=failures)throw Object.assign(new Error('Synthetic restriction'),{name:'SecurityError'});storage.delete(key);}};
 }});
 const context=vm.createContext(fixture),helperStart=app.indexOf('function clearFavorites(){');
 if(helperStart>=0)vm.runInContext(app.slice(helperStart,app.indexOf('function reset(){',helperStart)),context);
 const handlerStart=app.indexOf("document.addEventListener('click',e=>{if(e.target.id==='clearData')");
 const handlerEnd=app.indexOf(');render();',handlerStart);
 assert.ok(handlerStart>=0&&handlerEnd>handlerStart);
 vm.runInContext(app.slice(handlerStart,handlerEnd+2),context);
 return {fixture,storage,messages,status,originalFavorites,state,click:(id='clearData')=>click({target:{id}}),
  get renders(){return renders;},get closes(){return closes;},get removes(){return removes;}};
}

test('bulk clear removes only favorites and announces success after persistent removal',()=>{
 for(const saved of [false,true]){
  const h=clearHarness({saved});h.click();
  assert.equal(h.storage.has('golf-guts-real-favs-v1'),false);assert.equal(h.storage.get('unrelated'),'keep');
  assert.equal(h.fixture.fav.length,0);assert.equal(h.removes,1);assert.equal(h.renders,1);assert.equal(h.closes,1);
  assert.deepEqual(h.messages,['お気に入りを削除しました']);assert.equal(h.status.textContent,'');
  assert.deepEqual(h.state,{saved,audience:'women',cat:5});
 }
});
test('bulk clear failure preserves favorites and keeps the dialog open without success feedback',()=>{
 const h=clearHarness({failures:1,saved:true});assert.doesNotThrow(()=>h.click());
 assert.equal(h.fixture.fav,h.originalFavorites);assert.equal(h.storage.get('golf-guts-real-favs-v1'),'[1034]');
 assert.equal(h.renders,0);assert.equal(h.closes,0);assert.equal(h.removes,1);assert.deepEqual(h.messages,[]);
 assert.match(h.status.textContent,/削除できません/);assert.match(h.status.textContent,/変更していません/);
 assert.deepEqual(h.state,{saved:true,audience:'women',cat:5});
});
test('bulk clear also reports an inaccessible storage property without changing state',()=>{
 const h=clearHarness({storageGetterThrows:true});assert.doesNotThrow(()=>h.click());
 assert.equal(h.fixture.fav,h.originalFavorites);assert.equal(h.storage.get('golf-guts-real-favs-v1'),'[1034]');
 assert.equal(h.removes,0);assert.equal(h.renders,0);assert.equal(h.closes,0);assert.deepEqual(h.messages,[]);
 assert.match(h.status.textContent,/削除できません/);
});
test('a later user clear after storage recovers succeeds once without automatic retry',()=>{
 const h=clearHarness({failures:1});h.click();
 assert.equal(h.removes,1);assert.equal(h.renders,0);assert.equal(h.closes,0);
 h.click();assert.equal(h.removes,2);assert.equal(h.storage.has('golf-guts-real-favs-v1'),false);
 assert.equal(h.fixture.fav.length,0);assert.equal(h.renders,1);assert.equal(h.closes,1);
 assert.deepEqual(h.messages,['お気に入りを削除しました']);
});
test('bulk clear is safe when empty and ignores unrelated clicks',()=>{
 const h=clearHarness({favorites:[]});h.click('other');
 assert.equal(h.removes,0);assert.equal(h.renders,0);assert.equal(h.closes,0);assert.deepEqual(h.messages,[]);
 h.click();assert.equal(h.removes,1);assert.equal(h.renders,1);assert.equal(h.closes,1);
 assert.equal(h.fixture.fav.length,0);assert.equal(h.storage.get('unrelated'),'keep');
});
test('bulk-clear failure feedback lives inside the policy dialog as a polite status',()=>{
 assert.ok(app.includes('<button class="primary" id="clearData">お気に入りをすべて削除</button><p class="sourceMeta" id="clearDataStatus" role="status"></p>'));
});
