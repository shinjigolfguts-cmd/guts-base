import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const catalog=read('catalog.js'),selection=read('selection.js'),app=read('app.js');
const ctx=vm.createContext({});
vm.runInContext(catalog+'\nthis.items=catalogData;',ctx);
const items=ctx.items;
const auditedIds=[1021,1235,1236,1242];
// Exercise the filter and ordering code actually used by render(), not a copied
// implementation. This is a dependency-free unit fixture, not browser proof.
const start=app.indexOf('let arr=data.filter(');
const end=app.indexOf(";$('#schoolOrderNote')",start);
assert.ok(start>=0&&end>start,'Locate actual render filter/order block');
const filterOrder=app.slice(start,end)+';this.result=arr;';
function renderSelection({budget='',sort='edit',audience='men',data=items}={}){
 const fields={budget:String(budget),sort,purpose:'',area:'',apparelType:'',apparelBrand:''};
 const sandbox=vm.createContext({data,q:'',fav:[],cats:[],state:{mode:'goods',cat:0,lesson:false,saved:false,audience},$:selector=>({value:fields[selector.slice(1)]??''})});
 vm.runInContext(selection+'\n'+filterOrder,sandbox,{timeout:1000});
 return [...sandbox.result];
}
test('catalogued prices are positive whole-yen amounts or explicitly unknown',()=>{
 for(const item of items)assert.ok(item.price===null||(Number.isSafeInteger(item.price)&&item.price>0),String(item.id));
});
test('four audited Garmin records have qualified body prices and exact model IDs',()=>{
 for(const id of auditedIds){
  const item=items.find(d=>d.id===id);
  assert.ok(Number.isSafeInteger(item.price)&&item.price>0,String(id));
  assert.equal(item.unit,'本体1台');
  assert.match(item.specs['商品番号'],/^010-\d{5}-\d{2}$/);
  assert.ok(item.priceNote.includes(item.specs['商品番号']));
  assert.match(item.priceNote,/税込.*本体/);
 }
});
for(const audience of ['men','women'])test(`${audience}: budget includes each exact boundary and excludes one yen below`,()=>{
 for(const id of auditedIds){
  const item=items.find(d=>d.id===id);
  assert.ok(renderSelection({audience,budget:item.price}).some(d=>d.id===id));
  assert.ok(!renderSelection({audience,budget:item.price-1}).some(d=>d.id===id));
 }
});
test('all offered budget limits exclude unknown prices and over-budget products',()=>{
 for(const budget of [10000,15000,20000,30000,100000]){
  const result=renderSelection({budget});
  assert.ok(result.length>0);
  assert.ok(result.every(d=>d.price!==null&&d.price<=budget));
 }
 assert.ok(renderSelection().some(d=>d.price===null),'No budget retains unknown-price options');
});
for(const sort of ['low','high'])test(`${sort}: actual render ordering places unknown prices last`,()=>{
 const result=renderSelection({sort});
 let unknown=false,last=sort==='low'?-Infinity:Infinity;
 for(const d of result){
  if(d.price===null){unknown=true;continue;}
  assert.equal(unknown,false);
  assert.ok(sort==='low'?d.price>=last:d.price<=last);last=d.price;
 }
 const four=result.filter(d=>auditedIds.includes(d.id)).map(d=>d.price);
 assert.equal(four.length,4);
 assert.deepEqual(four,[...four].sort((a,b)=>sort==='low'?a-b:b-a));
});
test('S50 price qualification does not imply premium membership is bundled',()=>{
 const s50=items.find(d=>d.id===1242);
 assert.match(s50.priceNote,/Blackモデル/);
 assert.match(s50.priceNote,/Membership.*別途契約/);
 for(const feature of ['コースレイアウト','タッチターゲッティング','Green Contour'])assert.ok(s50.check.includes(feature));
});

test('all four static search-landing cards match catalog price, date, note and official URL',()=>{
 const html=read('categories/accessories.html');
 const cards=[...html.matchAll(/<article class="discoveryCard">[\s\S]*?<\/article>/g)].map(m=>m[0]);
 const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 for(const id of auditedIds){
  const item=items.find(d=>d.id===id),matches=cards.filter(card=>card.includes('&amp;item='+id+'"'));
  assert.equal(matches.length,1,'Unique static card '+id);
  const card=matches[0];
  assert.ok(card.includes('<p class="discoveryPrice">¥'+item.price.toLocaleString('en-US')+' / '+escape(item.unit)+'</p>'),'Price '+id);
  assert.ok(card.includes('<p>'+escape(item.priceNote)+'</p>'),'Price qualification '+id);
  assert.ok(card.includes('情報確認日：'+item.checked),'Date '+id);
  assert.ok(card.includes('class="discoveryOfficial" href="'+escape(item.source)+'"'),'Source '+id);
 }
});
