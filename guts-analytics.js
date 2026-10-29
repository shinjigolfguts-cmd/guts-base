(function(){
 'use strict';
 const script=document.currentScript,site=script&&script.dataset.site;
 const origins={town:'https://golf-edit-guts.nutmegcoin18.chatgpt.site',kanto:'https://guts-kanto-golf-guide.nutmegcoin18.chatgpt.site',japan:'https://guts-japan-golf-guide.nutmegcoin18.chatgpt.site'};
 const githubTown=site==='town'&&location.origin==='https://shinjigolfguts-cmd.github.io'&&location.pathname.startsWith('/guts-base/');
 if(!site||(!githubTown&&location.origin!==origins[site])||window.__gutsAnalyticsLoaded)return;
 window.__gutsAnalyticsLoaded=true;
 if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl||new URLSearchParams(location.search).get('guts_qa')==='1')return;
 const pageId=crypto.randomUUID(),engagementId=crypto.randomUUID();
 let started=false,eventCount=0,lastTick=performance.now(),lastActive=lastTick,wasVisible=document.visibilityState==='visible',activeMs=0,maxScroll=0,searchTimer=null,lastSearch='';
 let referrer='';try{if(document.referrer)referrer=new URL(document.referrer).origin;}catch{}
 const ua=navigator.userAgent;
 const device=/iPad|Tablet/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1)?'tablet':/Mobi|Android|iPhone/i.test(ua)?'mobile':'desktop';
 function transmit(route,payload,retry=true){
 const body=JSON.stringify(payload);
 const deliver=()=>fetch(origins.town+'/api/analytics/'+route,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'text/plain;charset=UTF-8'},body,keepalive:true}).then(r=>{if(!r.ok)throw Error('analytics');});
 deliver().catch(()=>{if(retry)setTimeout(()=>deliver().catch(()=>{}),2500);});
 }
 function track(kind,label){if(!started||document.visibilityState!=='visible'||eventCount>=300)return;label=String(label||'').trim().slice(0,160);if(!label)return;eventCount++;transmit('insight',{id:crypto.randomUUID(),pageId,site,kind,label});}
 function cleanSearch(value){const s=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(s.length<2||s.length>50||/[@＠<>]|https?:|www\.|(?:\d[\s()+-]*){5}|〒|電話|メール|住所|password|パスワード/i.test(s))return '';return s.toLocaleLowerCase('ja-JP');}
 function search(){clearTimeout(searchTimer);const input=document.getElementById('search');if(!input)return;const q=cleanSearch(input.value);if(q&&q!==lastSearch)track('search',q);lastSearch=q;}
 function tick(){const now=performance.now();if(wasVisible)activeMs+=Math.max(0,Math.min(now,lastActive+60000)-lastTick);lastTick=now;wasVisible=document.visibilityState==='visible';}
 function scrollDepth(){if(document.visibilityState!=='visible')return;const height=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);maxScroll=Math.max(maxScroll,Math.min(100,Math.round(((window.scrollY+window.innerHeight)/Math.max(height,1))*100)));}
 function engagement(retry=true){if(!started)return;tick();scrollDepth();transmit('insight',{id:engagementId,pageId,site,kind:'engagement',seconds:Math.min(14400,Math.floor(activeMs/1000)),scroll:maxScroll},retry);}
 function begin(){if(started||document.visibilityState!=='visible')return;started=true;lastTick=performance.now();lastActive=lastTick;wasVisible=true;transmit('collect',{id:pageId,site,path:location.pathname,referrer,device});engagement();}
 function item(id){const list=site==='town'?(typeof catalogData!=='undefined'?catalogData:[]):(typeof DATA!=='undefined'?DATA.courses:[]);return list.find(x=>String(x.id)===String(id));}
 function entryItem(element){const entry=element.closest('.entry');return entry?item(entry.querySelector('.save')?.dataset.id):null;}
 function modalItem(){const title=document.querySelector('#modalBody h2')?.textContent;return typeof catalogData!=='undefined'?catalogData.find(x=>x.name===title):null;}
 const names={purpose:'重視すること',budget:'予算',area:'エリア',sort:'並べ替え',apparelType:'ウェアの種類',apparelBrand:'ブランド',pref:'都道府県'};
 document.addEventListener('click',e=>{
 const target=e.target instanceof Element?e.target:null;if(!target)return;
 const button=target.closest('button');
 if(button){
 const d=button.dataset;
 if(d.detail){const x=item(d.detail);if(x)track('detail',x.name);}
 if(d.fav&&button.getAttribute('aria-pressed')!=='true'){const x=item(d.fav);if(x)track('favorite',x.name);}
 if(button.matches('.save[data-id]')&&button.getAttribute('aria-pressed')!=='true'){const x=item(d.id);if(x)track('favorite',x.name);}
 if(d.compare&&!button.classList.contains('selected')&&typeof compare!=='undefined'&&compare.length<3){const x=item(d.compare);if(x)track('compare',x.name);}
 if(button.id==='detailCompare'){const x=modalItem();if(x&&typeof compare!=='undefined'&&!compare.includes(x.id)&&compare.length<3)track('compare',x.name);}
 if(d.cat!==undefined&&typeof cats!=='undefined')track('filter','カテゴリ：'+(cats[Number(d.cat)]||'その他'));
 if(d.audience)track('filter','対象：'+(d.audience==='women'?'レディース':'メンズ'));
 if(d.mode)track('filter','表示：'+({goods:'道具・服',places:'行く場所',all:'すべて'}[d.mode]||d.mode));
 if(d.pref!==undefined)track('filter','都道府県：'+(d.pref||'すべて'));
 if(d.region!==undefined)track('filter','地方：'+(d.region||'全国'));
 if(button.matches('.cat')&&typeof DATA!=='undefined'){const i=Array.from(document.querySelectorAll('.cat')).indexOf(button);if(DATA.categories[i])track('filter','カテゴリ：'+DATA.categories[i].name);}
 }
 const a=target.closest('a[href]');if(a){let u;try{u=new URL(a.href);}catch{return;}if(!/^https?:$/.test(u.protocol)||u.origin===location.origin)return;
 const x=entryItem(a)||(a.dataset.insightItem?item(a.dataset.insightItem):null)||(a.closest('#modal')?modalItem():null);
 if(x)track('outbound',x.name);
 }
 },true);
 document.addEventListener('toggle',e=>{const d=e.target;if(d instanceof Element&&d.matches('details.course-details')&&d.open){const x=entryItem(d);if(x)track('detail',x.name);}},true);
 document.addEventListener('change',e=>{const el=e.target;if(el instanceof HTMLSelectElement&&names[el.id])track('filter',names[el.id]+'：'+(el.selectedOptions[0]?.textContent||el.value));});
 document.addEventListener('input',e=>{if(e.target?.id==='search'&&!e.isComposing){clearTimeout(searchTimer);searchTimer=setTimeout(search,1200);}});
 document.addEventListener('compositionend',e=>{if(e.target?.id==='search'){clearTimeout(searchTimer);searchTimer=setTimeout(search,1200);}});
 document.addEventListener('submit',e=>{if(e.target?.id==='searchForm')search();},true);
 document.addEventListener('focusout',e=>{if(e.target?.id==='search')search();});
 for(const name of ['pointerdown','keydown','touchstart'])document.addEventListener(name,()=>{tick();lastActive=performance.now();},{passive:true});
 window.addEventListener('scroll',()=>{tick();lastActive=performance.now();scrollDepth();},{passive:true});
 document.addEventListener('visibilitychange',()=>{tick();if(document.visibilityState==='visible'){lastActive=performance.now();begin();}else{search();engagement(false);}});
 window.addEventListener('pagehide',()=>{search();engagement(false);});
 window.addEventListener('pageshow',e=>{if(e.persisted){lastTick=performance.now();lastActive=lastTick;wasVisible=document.visibilityState==='visible';}});
 setInterval(()=>{if(document.visibilityState==='visible')engagement();},15000);
 begin();
})();
