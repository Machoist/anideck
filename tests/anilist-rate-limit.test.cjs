const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function fixture(handler){
  let now=1700000000000,calls=0;
  class Clock extends Date {static now(){return now;}}
  const ctx={Date:Clock,Map,Set,URLSearchParams,console,window:{native:{request:async request=>{calls++;return handler(request);},setSecret:async()=>{}}}};
  const api=vm.runInNewContext(source+'\n({AniList,httpUncached})',ctx);
  Object.assign(api.AniList,{token:'fixture-token',userId:1});
  return {...api,ctx,advance:ms=>now+=ms,get now(){return now;},get calls(){return calls;}};
}
const reply=data=>({ok:true,status:200,text:JSON.stringify({data})});
const media=progress=>({Media:{id:42,mediaListEntry:progress===null?null:{id:7,status:'CURRENT',progress,score:8}}});

test('AniList respects retry/reset headers across reads and writes without retrying a mutation',async()=>{
  let limited=true;const f=fixture(()=>limited?{ok:false,status:429,headers:{'retry-after':'10','x-ratelimit-reset':String((f.now+15000)/1000)},text:'{"errors":[{"status":429,"message":"Too Many Requests."}]}'}:reply({ok:true}));
  await assert.rejects(f.AniList.gql('query { Viewer { id } }'),e=>e.status===429&&e.retryAt===f.now+15000);
  await assert.rejects(f.AniList.gql('mutation { SaveMediaListEntry { id } }'),e=>e.status===429);
  f.advance(14000);await assert.rejects(f.AniList.gql('query { Viewer { name } }'),e=>e.status===429);assert.equal(f.calls,1);
  limited=false;f.advance(1001);assert.equal((await f.AniList.gql('query { Viewer { name } }')).ok,true);assert.equal(f.calls,2);
});

test('GraphQL rate errors and exhausted successful-response quota both prevent more requests',async()=>{
  const graph=fixture(()=>({ok:true,status:200,text:'{"errors":[{"status":429,"message":"Too Many Requests."}]}'}));
  await assert.rejects(graph.AniList.gql('query { Viewer { id } }'),e=>e.status===429);
  await assert.rejects(graph.AniList.gql('query { Viewer { name } }'),e=>e.status===429);assert.equal(graph.calls,1);
  const exhausted=fixture(()=>({...reply({ok:true}),headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':String((exhausted.now+20000)/1000)}}));
  assert.equal((await exhausted.AniList.gql('query { Viewer { id } }')).ok,true);
  await assert.rejects(exhausted.AniList.gql('query { Viewer { name } }'),e=>e.status===429&&e.retryAt===exhausted.now+20000);assert.equal(exhausted.calls,1);
});

test('concurrent entry lookups share a request and successful absent entries are briefly cached',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>release=()=>resolve(reply(media(null)))));
  const requests=Array.from({length:20},()=>f.AniList.entry('al:42'));await new Promise(setImmediate);assert.equal(f.calls,1);release();
  assert((await Promise.all(requests)).every(value=>value===null));assert.equal(await f.AniList.entry('al:42'),null);assert.equal(f.calls,1);
  const fresh=f.AniList.entry('al:42',{fresh:true});await new Promise(setImmediate);assert.equal(f.calls,2);release();await fresh;
});

test('a complete recent collection proves absence without an extra entry request',async()=>{
  const f=fixture(()=>reply(media(null)));f.AniList.coll=[];f.AniList.collAt=f.now;
  assert.equal(await f.AniList.entry('al:42'),null);assert.equal(f.calls,0);
  await f.AniList.entry('al:42',{fresh:true});assert.equal(f.calls,1);
});

test('failed entry reads never become cached absence, and recovered results are isolated copies',async()=>{
  let fail=true;const f=fixture(()=>fail?{ok:false,status:503,text:'Unavailable'}:reply(media(4)));
  await assert.rejects(f.AniList.entry('al:42'));fail=false;
  const first=await f.AniList.entry('al:42');first.progress=99;assert.equal((await f.AniList.entry('al:42')).progress,4);assert.equal(f.calls,2);
});

test('a late entry read cannot replace the cache established by a successful progress write',async()=>{
  let release;const f=fixture(request=>JSON.parse(request.body).query.startsWith('mutation')?reply({SaveMediaListEntry:{id:7,status:'CURRENT',progress:5,score:8}}):new Promise(resolve=>release=()=>resolve(reply(media(3)))));
  const old=f.AniList.entry('al:42');await new Promise(setImmediate);assert.equal((await f.AniList.write('al:42',{progress:5,status:'CURRENT'})).progress,5);
  release();assert.equal((await old).progress,5);assert.equal((await f.AniList.entry('al:42')).progress,5);assert.equal(f.calls,2);
});

test('account changes reject old entry results and cannot reuse the previous entry cache',async()=>{
  let release,wait=true;const f=fixture(()=>{if(wait)return new Promise(resolve=>{release=()=>resolve(reply(media(9)));});return reply(media(2));});
  const old=f.AniList.entry('al:42');await new Promise(setImmediate);f.AniList.userId=2;f.AniList.token='new-fixture';release();await assert.rejects(old,/account changed/);
  wait=false;assert.equal((await f.AniList.entry('al:42')).progress,2);assert.equal(f.calls,2);
});

test('account changes during a write do not publish its result into the new account cache',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>release=()=>resolve(reply({SaveMediaListEntry:{id:7,status:'CURRENT',progress:5,score:8}}))));
  const old=f.AniList.write('al:42',{progress:5,status:'CURRENT'});await new Promise(setImmediate);f.AniList.userId=2;release();await assert.rejects(old,/account changed/);assert.equal(f.AniList.entryCache,undefined);
});

test('a failed title-entry lookup is rendered as unavailable instead of an empty editable entry',async()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),a=app.indexOf('async function trackingEntryState('),b=app.indexOf('// "Anikoto"',a);
  const ctx={Tracker:{loggedIn:()=>true,svc:{userId:1},entry:async()=>{throw Error('AniList is limiting requests.');}},esc:value=>String(value).replaceAll('<','&lt;'),icon:()=>''};
  const api=vm.runInNewContext(app.slice(a,b)+'\n({trackingEntryState,progressCard})',ctx),state=await api.trackingEntryState('al:42');
  assert(state.error);const html=api.progressCard({error:state.error,editable:true,label:'Add to your list',num:0,of:23,pct:0});
  assert.match(html,/List entry unavailable/);assert.match(html,/Retry list lookup/);assert.doesNotMatch(html,/Add to your list|data-act="editEntry"|0 \/ 23/);
});

test('a newly fetched collection supersedes an older individual entry cache',async()=>{
 const f=fixture(request=>JSON.parse(request.body).query.includes('MediaListCollection')?reply({MediaListCollection:{lists:[{entries:[{id:7,status:'CURRENT',progress:9,score:8,media:{id:42,title:{english:'Fixture'}}}]}]}}):reply(media(3)));
 assert.equal((await f.AniList.entry('al:42')).progress,3);await f.AniList.collection();assert.equal((await f.AniList.entry('al:42')).progress,9);assert.equal(f.calls,2);
});
