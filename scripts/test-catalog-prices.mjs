import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const catalog=read('catalog.js'),selection=read('selection.js'),app=read('app.js');
const ctx=vm.createContext({});
vm.runInContext(catalog+'\nthis.items=catalogData;',ctx);
const items=ctx.items;
test('school unlimited-plan conditions preserve daily slot and daytime limits',()=>{
 const item=items.find(d=>d.id===1045);
 const condition=item.specs['通い放題の条件'];
 assert.match(condition,/2か月/);
 assert.match(condition,/1日最大1枠/);
 assert.match(condition,/オールタイムは営業時間内/);
 assert.match(condition,/デイタイムは平日9:00〜17:00/);
 assert.match(item.priceNote,/通い放題は1日最大1枠/);
 assert.ok(item.additionalSources.includes('https://chicken-golf.com/price/'));
});
test('school qualification does not invent a comparable price or refresh all-field verification',()=>{
 const item=items.find(d=>d.id===1045);
 assert.equal(item.price,null);
 assert.equal(item.unit,'');
 assert.equal(item.checked,'2026-10-22');
 assert.equal(item.partialReview.complete,false);
 assert.equal(item.specs['形式'],'50分のセミパーソナルレッスン');
 assert.equal(item.specs['営業'],'7:00〜23:00');
 assert.match(item.specs['料金の注意'],/入会金・プラン総額・支払回数/);
});
test('school static card includes the same plan qualification and preserves unknown price',()=>{
 const item=items.find(d=>d.id===1045);
 const cards=read('categories/schools.html').match(/<article\b[\s\S]*?<\/article>/g)||[];
 const card=cards.find(s=>s.includes('item=1045"'));
 assert.ok(card);
 assert.ok(card.includes(item.priceNote));
 assert.ok(card.includes('料金条件は詳細へ'));
 assert.ok(card.includes('情報確認日：'+item.checked));
 assert.ok(card.includes(item.recommendationReason));
});
const garminBodyIds=[1021,1235,1236,1242];
const auditedIds=[...garminBodyIds,1022,1023,1237];
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
 for(const id of garminBodyIds){
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
 assert.equal(four.length,auditedIds.length);
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
 for(const id of garminBodyIds){
  const item=items.find(d=>d.id===id),matches=cards.filter(card=>card.includes('&amp;item='+id+'"'));
  assert.equal(matches.length,1,'Unique static card '+id);
  const card=matches[0];
  assert.ok(card.includes('<p class="discoveryPrice">¥'+item.price.toLocaleString('en-US')+' / '+escape(item.unit)+'</p>'),'Price '+id);
  assert.ok(card.includes('<p>'+escape(item.priceNote)+'</p>'),'Price qualification '+id);
  assert.ok(card.includes('情報確認日：'+item.checked),'Date '+id);
  assert.ok(card.includes('class="discoveryOfficial" href="'+escape(item.source)+'"'),'Source '+id);
 }
});


test('PING body prices and CT10 three-pack remain qualified and agree with existing specs',()=>{
 for(const id of [1022,1023]){
  const item=items.find(d=>d.id===id);
  assert.equal(item.unit,'1本');
  assert.ok(item.specs['公式本体価格'].includes(item.price.toLocaleString('en-US')+'円'));
  for(const term of ['税込','メーカー公式本体価格','販売店','シャフト','特注'])assert.ok(item.priceNote.includes(term));
 }
 const ct10=items.find(d=>d.id===1237);
 assert.equal(ct10.unit,'3個入り1パック');
 assert.ok(ct10.specs['セット価格の区別'].includes(ct10.price.toLocaleString('en-US')+'円'));
 for(const term of ['税込','010-01994-11','3個セット','14個セット・ウォッチ本体とは別商品'])assert.ok(ct10.priceNote.includes(term));
});

test('CT10 compatibility requires a listed device and pairing, not a watch-only rule',()=>{
 const item=items.find(d=>d.id===1237);
 for(const term of ['対応デバイス一覧','Garmin機器','ペアリング'])assert.ok(item.specs['必要機器'].includes(term));
 assert.ok(!item.specs['必要機器'].includes('ゴルフウォッチ'));
 assert.ok(item.check.includes('対応デバイス一覧'));
 assert.ok(item.specs['購入時の確認'].includes('ペアリング条件'));
});

test('qualified Mizuno set and variable range fees do not become generic budget prices',()=>{
 for(const id of [1031,1027]){
  const item=items.find(d=>d.id===id);
  assert.equal(item.price,null);assert.equal(item.unit,'');
  assert.ok(!renderSelection({budget:100000}).some(d=>d.id===id));
 }
 assert.equal(items.find(d=>d.id===1031).checked,'2026-10-22');
 assert.equal(items.find(d=>d.id===1027).checked,'2026-10-30');
});

test('Mizuno linked set identifies five clubs and shaft without using a member-only discount as a general price',()=>{
 const item=items.find(d=>d.id===1031);
 for(const term of ['5本組','No.6～9、PW','22 MFUSION i','5KJBS38205'])assert.ok((item.specs['掲載仕様']||'').includes(term));
 for(const term of ['5本組','22 MFUSION i','会員限定','購入条件','選択シャフト'])assert.ok(item.priceNote.includes(term));
 assert.doesNotMatch(item.priceNote,/84,?700|121,?000/);
 assert.equal(item.partialReview.complete,false);
});

test('Lotte 24-hour description includes daily range closure and distinct floor hours',()=>{
 const item=items.find(d=>d.id===1027);
 for(const field of ['fact','for','recommendationReason']){
  assert.match(item[field],/4:30〜5:30/);assert.match(item[field],/休止/);
 }
 assert.match(item.specs['営業時間の注意']||'',/打席休止.*パター練習場は24時間/);
 assert.match(item.specs['階別の営業時間']||'',/1階.*5:30〜翌4:30.*2階は曜日別.*3階.*8:00〜23:00/);
 assert.match(item.specs['一般球貸し'],/21円.*26円/);
 assert.match(item.specs['追加費用'],/550円.*330円/);
 assert.match(item.specs['打ち放題'],/3階.*90分.*ビジター.*3,800円/);
});

test('Mizuno and Lotte qualified notes stay synchronized in crawlable static cards',()=>{
 const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 for(const [id,page] of [[1031,'clubs'],[1027,'ranges']]){
  const item=items.find(d=>d.id===id);
  const cards=[...read('categories/'+page+'.html').matchAll(/<article class="discoveryCard">[\s\S]*?<\/article>/g)].map(m=>m[0]);
  const matches=cards.filter(card=>card.includes('&amp;item='+id+'"'));assert.equal(matches.length,1);
  for(const field of ['priceNote','recommendationReason'])assert.ok(matches[0].includes('<p>'+escape(item[field])+'</p>'));
  assert.ok(matches[0].includes('情報確認日：'+item.checked));
  assert.ok(matches[0].includes('<p class="discoveryPrice">料金条件は詳細へ</p>'));
 }
});

// Place search uses the same actual query normalization/filter/order code as the UI.
// No network, DOM replacement, storage access or synthetic catalog values are used.
const queryStart=app.indexOf("let q=$('#search').value.trim().toLowerCase()");
assert.ok(queryStart>=0&&queryStart<start,'Locate actual search normalization');
const searchBlock=app.slice(queryStart,end)+';this.result=arr;';
const categoryNames=['すべて','クラブ','ボール','シューズ','グローブ','ウェア','ゴルフ場','練習場','ゴルフスクール',null,'バッグ・小物'];
function searchSelection({query='',audience='men',cat=0,mode='all',area='',purpose='',budget='',saved=false,favorites=[],sort='edit'}={}){
 const fields={search:query,area,purpose,budget:String(budget),sort,apparelType:'',apparelBrand:''};
 const state={mode,cat,lesson:false,saved,audience};
 const sandbox=vm.createContext({data:items,fav:[...favorites],cats:categoryNames,state,$:selector=>({value:fields[selector.slice(1)]??''})});
 vm.runInContext(selection+'\n'+searchBlock,sandbox,{timeout:1000});
 assert.deepEqual(state,{mode,cat,lesson:false,saved,audience},'Search must not reset current controls');
 return [...sandbox.result];
}
const ids=rows=>Array.from(rows,d=>d.id).sort((a,b)=>a-b);
const legacyTextMatch=(item,q)=>[item.name,item.brand,item.for,item.check,item.purpose,categoryNames[item.cat]].join(' ').toLowerCase().includes(q);
test('place search includes every catalogued Tokyo and Chiba facility for both audiences',()=>{
 for(const audience of ['men','women'])for(const area of ['東京','千葉']){
  const expected=items.filter(d=>d.area===area);
  assert.equal(expected.length,area==='東京'?18:12);
  const result=searchSelection({query:area,audience,mode:'places'});
  for(const item of expected)assert.ok(result.some(d=>d.id===item.id),area+' facility '+item.id);
  assert.ok(result.every(d=>d.area===area||legacyTextMatch(d,area)),'Only area or existing text may match');
 }
});
test('place search retains category and explicit area intersections',()=>{
 for(const audience of ['men','women'])for(const cat of [6,7,8])for(const area of ['東京','千葉']){
  const result=searchSelection({query:area,audience,cat,mode:'places',area});
  assert.deepEqual(ids(result),ids(items.filter(d=>d.cat===cat&&d.area===area)));
 }
 const contradictory=searchSelection({query:'千葉',mode:'places',area:'東京'});
 assert.ok(contradictory.every(d=>d.area==='東京'&&legacyTextMatch(d,'千葉')),'Query must not clear the explicit area');
});
test('place search preserves saved, purpose and budget filters instead of broadening them',()=>{
 const favorites=[1027,1018,1190];
 const saved=searchSelection({query:'東京',mode:'places',saved:true,favorites});
 assert.deepEqual(ids(saved),[1018,1027]);
 for(const purpose of ['はじめやすさ','性能を比較','デザイン','通いやすさ']){
  const result=searchSelection({query:'東京',mode:'places',area:'東京',purpose});
  assert.deepEqual(ids(result),ids(items.filter(d=>d.area==='東京'&&d.purpose===purpose)));
 }
 assert.equal(searchSelection({query:'東京',budget:100000}).length,0,'Unknown facility fees remain excluded by product budget');
 assert.equal(searchSelection({query:'千葉',mode:'goods'}).length,0,'Area must not move a facility into goods');
});
test('existing product, brand, category and keyword matches remain unchanged',()=>{
 for(const audience of ['men','women'])for(const query of ['Garmin','GOLFTEC','ゼクシオ','グローブ','デザイン','東京ベイ','通いやすさ ゴルフ場','通いやすさ 練習場','はじめやすさ ゴルフスクール']){
  const q=query.toLowerCase();
  const expected=items.filter(d=>(d.audience==='shared'||d.audience===audience)&&legacyTextMatch(d,q));
  assert.deepEqual(ids(searchSelection({query,audience})),ids(expected),query+' / '+audience);
 }
 for(const query of ['東京','千葉']){
  const result=searchSelection({query,mode:'places'});
  const previous=items.filter(d=>d.cat>=6&&d.cat<=8&&legacyTextMatch(d,query));
  for(const item of previous)assert.ok(result.some(d=>d.id===item.id),'Keep existing text match '+item.id);
 }
});
test('actual search normalization still trims whitespace and ignores Latin case',()=>{
 for(const [raw,normalized] of [['  東京  ','東京'],['　千葉　','千葉'],[' gArMiN ','garmin']]){
  assert.deepEqual(ids(searchSelection({query:raw})),ids(searchSelection({query:normalized})));
 }
 assert.equal(searchSelection({query:'存在しない場所_QA_20261101'}).length,0);
});
test('empty search retains all audience candidates and unknown-price ordering',()=>{
 for(const audience of ['men','women'])for(const sort of ['edit','low','high','name']){
  const result=searchSelection({audience,sort});
  assert.deepEqual(ids(result),ids(items.filter(d=>d.audience==='shared'||d.audience===audience)));
  if(sort==='low'||sort==='high'){
   const firstUnknown=result.findIndex(d=>d.price===null);
   assert.ok(firstUnknown>=0);
   assert.ok(result.slice(firstUnknown).every(d=>d.price===null));
  }
 }
});
