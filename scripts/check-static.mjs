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
check(read('index.html').includes('data-site="town"'),'Analytics site ID');
check(read('guts-analytics.js').includes("location.pathname.startsWith('/guts-base/')"),'Analytics path restriction');
const result={passed:failures.length===0,records:data.length,counts,imagesChecked:data.length,htmlPages:htmlFiles.length,localReferences:refs,failures,limitations:'Does not verify live stock, price accuracy, image model/color visually, browser behavior or analytics receipt.'};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
