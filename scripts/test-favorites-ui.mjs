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
