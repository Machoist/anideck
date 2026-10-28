/* Exercise LocalImport through the real provider adapters; only HTTP and storage are fixtures. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8'),importer=fs.readFileSync(path.join(__dirname,'../src/local-import.js'),'utf8');
const noWait={pause:async()=>{}};
function fixture(which){
 const saved=new Map(),writes=[],reads=[],store={};let fail=null,beforeCreate=null,now=Date.now();class Clock extends Date{static now(){return now;}}
 const ctx={console,URL,URLSearchParams,Map,Set,Date:Clock,App:{act(){}},window:{native:{get:async k=>store[k],set:async(k,v)=>store[k]=structuredClone(v)}}};
 ctx.http=async(url,options={})=>{
  const {json}=options;reads.push({url,options});
  if(url.includes('graphql')){
   const v=json.variables,q=json.query;
   if(q.includes('SaveMediaListEntry')){if(fail)throw fail;writes.push(structuredClone(v));const previous=saved.get(String(v.mediaId))||{};const item={id:v.mediaId,status:v.status===undefined?previous.status:v.status,progress:v.progress===undefined?previous.progress:v.progress,score:v.scoreRaw===undefined?(previous.score||0):v.scoreRaw/10};saved.set(String(v.mediaId),item);return {data:{SaveMediaListEntry:item}};}
   if(q.includes('description'))return {data:{Media:{id:v.id,idMal:1000+v.id,title:{english:'Fixture'}}}};
   if(q.includes('idMal'))return {data:{Media:{id:v.m-1000}}};
   return {data:{Media:{id:v.id,mediaListEntry:saved.get(String(v.id))||null}}};
  }
  const u=new URL(url);
  if(u.pathname.endsWith('/mappings')){const site=u.searchParams.get('filter[externalSite]'),id=u.searchParams.get('filter[externalId]');if(site==='anilist/anime')return {data:[]};const kid=String(Number(id)-900);return {data:[{attributes:{externalSite:site,externalId:id},relationships:{item:{data:{id:kid}}}}],included:[{id:kid,type:'anime',attributes:{canonicalTitle:'Fixture'}}]};}
  if(u.pathname.endsWith('/library-entries')&&options.method==='POST'){
   if(beforeCreate)beforeCreate();if(fail)throw fail;const d=json.data,id=d.relationships.anime.data.id;writes.push(structuredClone(d));const item={id:'entry-'+id,attributes:d.attributes};saved.set(String(id),item);return {data:item};
  }
  if(options.method==='PATCH'&&u.pathname.includes('/library-entries/')){
   if(fail)throw fail;const d=json.data,pair=[...saved].find(([,item])=>item.id===d.id);if(!pair)throw Error('Missing destination fixture entry');
   writes.push(structuredClone(d));const item={...pair[1],attributes:{...pair[1].attributes,...d.attributes}};saved.set(pair[0],item);return {data:item};
  }
  if(u.pathname.endsWith('/library-entries'))return {data:saved.has(u.searchParams.get('filter[animeId]'))?[saved.get(u.searchParams.get('filter[animeId]'))]:[]};
  if(u.pathname.endsWith('/anime')&&u.searchParams.has('filter[mappings.externalId]')){const id=Number(u.searchParams.get('filter[mappings.externalId]'));return {data:u.searchParams.get('filter[mappings.externalSite]')==='myanimelist/anime'?[{id:String(id-900),attributes:{canonicalTitle:'Fixture'}}]:[]};}
  throw Error('Unexpected fixture request '+url);
 };
 const transport=ctx.http;ctx.window.native.request=async request=>{try{return {ok:true,status:200,text:JSON.stringify(await transport(request.url,{...request,json:request.body?JSON.parse(request.body):undefined}))};}catch(error){return {ok:false,status:error.status||500,error:error.message};}};
 vm.createContext(ctx);vm.runInContext(source+'\nthis.services={AniList,Kitsu,LocalTracker};',ctx);
 const {AniList,Kitsu,LocalTracker}=ctx.services;Object.assign(AniList,{token:'fixture',userId:51});Object.assign(Kitsu,{token:'fixture',userId:'52'});
 LocalTracker.coll=[{anime:{id:'al:1',title:'First',malId:1001},status:'current',progress:4,rating:8.5,reconsuming:false},{anime:{id:'al:2',title:'Second',malId:1002},status:'planned',progress:0,rating:null}];
 const api=vm.runInContext(importer+'\nLocalImport',ctx);return {api,AniList,Kitsu,local:LocalTracker,saved,writes,reads,service:which==='anilist'?AniList:Kitsu,setFailure:e=>fail=e,advance:ms=>now+=ms};
}
for(const which of ['anilist','kitsu']){
 test(`${which}: real adapters import selected progress, rating and status, read back, preserve local list and skip a repeat`,async()=>{
  const f=fixture(which),before=JSON.stringify(f.local.coll),plan=await f.api.plan(which,undefined,noWait);assert(plan.rows.every(r=>r.state==='ready'));assert.equal(f.writes.length,0);
  const result=await f.api.run(plan,new Set([plan.rows[0].id]),noWait);assert.equal(result.added,1);assert.equal(result.failed.length,0);
  const entry=await f.service.entry(plan.rows[0].id,{fresh:true});assert.equal(entry.progress,4);assert.equal(entry.rating,8.5);assert.equal(entry.status,'current');assert.equal(f.writes.length,1);
  assert.equal((await f.api.run(plan,new Set([plan.rows[0].id]),noWait)).kept,1);assert.equal(f.writes.length,1);assert.equal(JSON.stringify(f.local.coll),before);
  if(which==='kitsu'){assert.equal(f.writes[0].relationships.user.data.id,'52');assert.equal(f.writes[0].attributes.ratingTwenty,17);}else assert.equal(f.writes[0].scoreRaw,85);
 });
 test(`${which}: existing-title progress imports preserve destination status and score through real adapters and fresh readback`,async()=>{
  const f=fixture(which);f.local.coll=[{anime:{id:'al:1',title:'Tokyo Revengers',malId:1001},status:'completed',progress:24,rating:8.5,reconsuming:false}];
  const destination=which==='anilist'?'1':'101';f.saved.set(destination,which==='anilist'?{id:1,status:'PLANNING',progress:23,score:9}:{id:'entry-101',attributes:{status:'planned',progress:23,ratingTwenty:18,reconsuming:false}});
  const before=JSON.stringify(f.local.coll),plan=await f.api.plan(which,undefined,noWait),row=plan.rows[0];assert.equal(row.state,'update');assert.match(row.reason,/23.*24/);assert.equal(f.writes.length,0);
  assert.equal((await f.api.run(plan,new Set(),noWait)).updated,0);assert.equal(f.writes.length,0);
  const result=await f.api.run(plan,new Set([row.id]),noWait);assert.equal(result.updated,1);assert.equal(result.failed.length,0);assert.equal(f.writes.length,1);
  const entry=await f.service.entry(row.id,{fresh:true});assert.equal(entry.progress,24);assert.equal(entry.status,'planned');assert.equal(entry.rating,9);assert.equal(entry.reconsuming,false);assert.equal(JSON.stringify(f.local.coll),before);
  if(which==='anilist')assert.deepEqual(Object.keys(f.writes[0]).sort(),['mediaId','progress']);else assert.deepEqual(Object.keys(f.writes[0].attributes),['progress']);
  assert.equal((await f.api.run(plan,new Set([row.id]),noWait)).kept,1);assert.equal(f.writes.length,1);assert.equal((await f.api.plan(which,undefined,noWait)).rows[0].state,'existing');
 });
 test(`${which}: provider errors stop the batch and retry preserves successful entries`,async()=>{
  const f=fixture(which),plan=await f.api.plan(which,undefined,noWait),error=Error('Rate limited');error.status=429;f.setFailure(error);const selection=new Set(plan.rows.map(r=>r.id));const result=await f.api.run(plan,selection,noWait);assert.equal(result.stopped,true);assert.equal(result.failed.length,1);assert.equal(result.added,0);f.setFailure(null);if(which==='anilist'){const before=f.reads.length;assert.equal((await f.api.run(plan,selection,noWait)).stopped,true);assert.equal(f.reads.length,before);f.advance(60001);}assert.equal((await f.api.run(plan,selection,noWait)).added,2);
 });
 test(`${which}: an entry appearing during the adapter's final read is kept unchanged`,async()=>{
  const f=fixture(which),plan=await f.api.plan(which,undefined,noWait);let n=0;const original=f.service.entry.bind(f.service);f.service.entry=async(...args)=>{if(++n===2)return {status:'completed',progress:99,rating:10};return original(...args);};const result=await f.api.run(plan,new Set([plan.rows[0].id]),noWait);assert.equal(result.kept,1);assert.equal(result.added,0);assert.equal(f.writes.length,0);
 });
 test(`${which}: every list status and rewatch flag crosses the adapter correctly`,async()=>{
  for(const [i,status] of ['current','planned','completed','on_hold','dropped'].entries()){const f=fixture(which);f.local.coll=[{anime:{id:'al:1',title:'Fixture',malId:1001},status,progress:i,rating:7,reconsuming:false}];const plan=await f.api.plan(which,undefined,noWait);assert.equal((await f.api.run(plan,new Set([plan.rows[0].id]),noWait)).added,1);assert.equal((await f.service.entry(plan.rows[0].id,{fresh:true})).status,status);}
  const f=fixture(which);f.local.coll[0].reconsuming=true;const plan=await f.api.plan(which,undefined,noWait);await f.api.run(plan,new Set([plan.rows[0].id]),noWait);assert.equal((await f.service.entry(plan.rows[0].id,{fresh:true})).reconsuming,true);
 });
}
test('AniList imports bypass stale collection entries when preserving destination data',async()=>{const f=fixture('anilist');f.AniList.coll=[{anime:{id:'al:1'},status:'planned',progress:0}];f.AniList.collAt=Date.now();const plan=await f.api.plan('anilist',undefined,noWait);assert.equal(plan.rows[0].state,'ready');});
test('Kitsu import falls back to exact MAL mapping from matching AniList metadata',async()=>{const f=fixture('kitsu');delete f.local.coll[0].anime.malId;const plan=await f.api.plan('kitsu',undefined,noWait);assert.equal(plan.rows[0].id,'101');assert.equal(plan.rows[0].state,'ready');});
