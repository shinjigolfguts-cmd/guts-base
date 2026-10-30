import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message)};
const ctx=vm.createContext({});
vm.runInContext(read('catalog.js')+'\n'+read('selection.js')+'\nthis.data=catalogData;',ctx,{timeout:1000});
const data=ctx.data, cats=[1,2,3,4,5,10,8,6,7];
check(new Set(data.map(x=>x.id)).size===data.length,'Duplicate catalog ID');
check(!read('catalog.js').includes('Warning: truncated output'),'Catalog file contains a truncated-output marker');
check(new Set(data.map(x=>x.name)).size===data.length,'Duplicate catalog name');
for(const item of data){
 check(item.name===item.name.trim()&&!item.name.includes('  '),'Catalog name whitespace '+item.id);
 check(!/（[^（）]+（[A-Z0-9]+））/.test(item.name),'Nested color label '+item.id);
}
const counts={};
for(const audience of ['men','women']){
 counts[audience]={};
 for(const cat of cats){
  const items=data.filter(x=>x.cat===cat&&ctx.matchesAudience(x,audience));
  counts[audience][cat]=items.length;
  check(cat===5?items.length===70:items.length>=10&&items.length<=15,audience+' category '+cat+' count '+items.length);
  if(cat===5){
   check(new Set(items.map(x=>x.brand+'|'+x.modelCode)).size===70,audience+' duplicate apparel model');
   for(const item of items)check(item.price>=5000&&item.price<=30000&&item.modelCode&&item.apparelType,'Apparel fields/price '+item.id);
  }
  if(cat===8){
   const sorted=ctx.pinSchoolFirst([...items].sort((a,b)=>ctx.audienceRank(a,audience)-ctx.audienceRank(b,audience)));
   check(sorted[0]?.id===1018,audience+' school pin');
  }
 }
}
for(const item of data){
 check(['men','women','shared'].includes(item.audience),'Audience '+item.id);
 check(/^https:\/\//.test(item.source||''),'Official source '+item.id);
 try{
  const p=path.resolve(root,item.image);
  check(p.startsWith(root+path.sep),'Image outside repository '+item.id);
  const bytes=fs.readFileSync(p);
  check(bytes.length>100,'Empty image '+item.id);
  check(createHash('sha256').update(bytes).digest('hex')===item.imageSha256,'Image checksum '+item.id);
 }catch{failures.push('Missing image '+item.id)}
}
const htmlFiles=['index.html','404.html',...fs.readdirSync(path.join(root,'categories')).filter(x=>x.endsWith('.html')).map(x=>'categories/'+x)];
let refs=0;
for(const file of htmlFiles){
 const html=read(file);
 for(const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  const ref=m[1];
  if(/^(https?:|data:|mailto:|tel:|#)/.test(ref))continue;
  const clean=decodeURIComponent(ref.split(/[?#]/)[0]);
  if(!clean)continue;
  let target=clean.startsWith('/guts-base/')?path.join(root,clean.slice(11)):path.resolve(root,path.dirname(file),clean);
  if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  check(target.startsWith(root+path.sep)&&fs.existsSync(target),'Broken local reference '+file+': '+ref);refs++;
 }
}
const app=read('app.js');
const fallbackIds=[...app.matchAll(/^\s*(\d+):\{number:/gm)].map(m=>Number(m[1])).sort((a,b)=>a-b);
check(JSON.stringify(fallbackIds)===JSON.stringify([1017,1194,1202,1203]),'Facility phone fallback ID set');
check(app.includes('公式サイトが開かない場合は、営業・料金・予約についてお電話でご確認ください。'),'Facility fallback guidance');
check(read('index.html').includes('data-site="town"'),'Analytics site ID');
// Execute the origin/path guard rather than matching one implementation string.
// DNT stops execution after admission, so these checks never send analytics.
const tracker=read('guts-analytics.js');
const analyticsCases=[
 ['GitHub home','https://shinjigolfguts-cmd.github.io','/guts-base/',true],
 ['GitHub category','https://shinjigolfguts-cmd.github.io','/guts-base/categories/apparel.html',true],
 ['Other project','https://shinjigolfguts-cmd.github.io','/golf-guts-kanto/',false],
 ['Similar prefix','https://shinjigolfguts-cmd.github.io','/guts-base-other/',false],
 ['Host root','https://shinjigolfguts-cmd.github.io','/',false],
 ['Unapproved host','https://example.com','/guts-base/',false],
 ['Original Sites host','https://golf-edit-guts.nutmegcoin18.chatgpt.site','/',true],
 ['Current Sites host','https://golf-edit-guts.golfguts0702.chatgpt.site','/',true]
];
for(const [label,origin,pathname,expected] of analyticsCases){
 const sandbox={document:{currentScript:{dataset:{site:'town'}}},location:{origin,pathname,search:''},window:{},navigator:{doNotTrack:'1'}};
 try{
  vm.runInNewContext(tracker,sandbox,{timeout:1000});
  check(!!sandbox.window.__gutsAnalyticsLoaded===expected,'Analytics origin/path restriction: '+label);
 }catch(error){failures.push('Analytics guard execution: '+label+' '+error.message)}
}
// Guard the files needed for search discovery on every existing CI run.
const base='https://shinjigolfguts-cmd.github.io/guts-base/';
const indexable=htmlFiles.filter(file=>file!=='404.html');
const sitemap=read('sitemap.xml');
check(/<urlset\s[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/.test(sitemap),'Sitemap namespace');
const locations=[...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m=>m[1].trim());
const expected=indexable.map(file=>base+(file==='index.html'?'':file));
check(locations.length===expected.length&&new Set(locations).size===expected.length&&expected.every(url=>locations.includes(url)),'Sitemap must contain each public page exactly once');
const titles=new Set(), descriptions=new Set();
for(const file of indexable){
 const html=read(file), expectedUrl=base+(file==='index.html'?'':file);
 const title=html.match(/<title>([^<]+)<\/title>/i)?.[1];
 const description=html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1];
 check(!!title&&!titles.has(title),'Missing or duplicate title '+file);titles.add(title);
 check(!!description&&!descriptions.has(description),'Missing or duplicate description '+file);descriptions.add(description);
 check(html.includes('rel="canonical" href="'+expectedUrl+'"'),'Canonical URL '+file);
 check(html.includes('property="og:url" content="'+expectedUrl+'"'),'Share URL '+file);
 check(!/<meta[^>]+(?:name=["'](?:robots|googlebot)["'])[^>]+content=["'][^"']*noindex/i.test(html),'Unexpected noindex '+file);
 for(const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)){
  try{JSON.parse(match[1])}catch{failures.push('Invalid structured data '+file)}
 }
}
const verificationFile='google14f186523eca69b6.html';
try{check(read(verificationFile).trim()==='google-site-verification: '+verificationFile,'Ownership verification content')}catch{failures.push('Missing ownership verification file')}
const result={passed:failures.length===0,records:data.length,counts,imagesChecked:data.length,htmlPages:htmlFiles.length,localReferences:refs,searchPagesChecked:indexable.length,ownershipFileChecked:true,failures,limitations:'Does not verify live stock, price accuracy, image model/color visually, browser behavior or analytics receipt.'};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
