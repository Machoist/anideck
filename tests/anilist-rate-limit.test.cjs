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
test('parallel title artwork consumers share one public metadata request and retain catalog aliases',async()=>{let release;const f=fixture(()=>new Promise(resolve=>release=()=>resolve(reply({Media:{id:42,title:{english:'English name',romaji:'Romaji name'},studios:{nodes:[]}}}))));const a=f.AniList.details('al:42'),b=f.AniList.details('al:42');await new Promise(setImmediate);assert.equal(f.calls,1);release();const [first,second]=await Promise.all([a,b]);assert.equal(first,second);assert.deepEqual(Array.from(first.titles),['Romaji name','English name']);assert.equal((await f.AniList.details('al:42')).id,42);assert.equal(f.calls,1);});
test('failed shared public metadata is released so a later read can recover',async()=>{let fail=true;const f=fixture(()=>fail?{ok:false,status:503,text:'Unavailable'}:reply({Media:{id:42,title:{english:'Recovered'}}}));const a=f.AniList.details('al:42'),b=f.AniList.details('al:42');await assert.rejects(a);await assert.rejects(b);assert.equal(f.calls,1);fail=false;assert.equal((await f.AniList.details('al:42')).title,'Recovered');assert.equal(f.calls,2);});
test('concurrent Home collections and title lookup reuse one complete account-scoped read',async()=>{let release;const f=fixture(()=>new Promise(resolve=>release=()=>resolve(reply({MediaListCollection:{lists:[{entries:[{id:7,status:'CURRENT',progress:3,media:{id:42,title:{english:'Fixture'}}}]}]}}))));const a=f.AniList.collection(),b=f.AniList.watching(),c=f.AniList.list('current'),entry=f.AniList.entry('al:42');await new Promise(setImmediate);assert.equal(f.calls,1);release();const result=await Promise.all([a,b,c,entry]);assert.equal(result[3].progress,3);assert.equal(f.calls,1);});
test('a list read begun before a successful write cannot overwrite the saved progress',async()=>{let release;const f=fixture(request=>JSON.parse(request.body).query.startsWith('mutation')?reply({SaveMediaListEntry:{id:7,status:'CURRENT',progress:5,score:8}}):new Promise(resolve=>release=()=>resolve(reply({MediaListCollection:{lists:[]}}))));const collection=f.AniList.collection();await new Promise(setImmediate);await f.AniList.write('al:42',{progress:5});release();await assert.rejects(collection,/list changed/);assert.equal((await f.AniList.entry('al:42')).progress,5);});
test('shared collection failure clears for retry without becoming an empty saved list',async()=>{let fail=true;const f=fixture(()=>fail?{ok:false,status:503,text:'Unavailable'}:reply({MediaListCollection:{lists:[]}}));const a=f.AniList.collection(),b=f.AniList.collection();await assert.rejects(a);await assert.rejects(b);assert.equal(f.calls,1);assert.equal(f.AniList.coll,null);fail=false;assert.equal((await f.AniList.collection()).length,0);assert.equal(f.calls,2);});

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

test('public browsing reserves request headroom for account reads and never retries a write',async()=>{
 const f=fixture(()=>reply({ok:true}));for(let i=0;i<22;i++)await f.AniList.gql('query Public'+i+' { Media { id } }',{},false);
 await assert.rejects(f.AniList.gql('query Extra { Media { id } }',{},false),e=>e.status===429&&e.retryAt===f.now+60000);assert.equal(f.calls,22);assert.equal(f.AniList.canPrefetch(),false);
 for(let i=0;i<6;i++)await f.AniList.gql('query Account'+i+' { Viewer { id } }');assert.equal(f.calls,28);
 await assert.rejects(f.AniList.gql('mutation Save { SaveMediaListEntry { id } }'),e=>e.status===429);assert.equal(f.calls,28);
 f.advance(60001);await f.AniList.gql('query Recovered { Media { id } }',{},false);assert.equal(f.calls,29);
});
test('a verified two-minute collection serves title views while explicit editing still reads fresh',async()=>{
 const f=fixture(()=>reply(media(5)));f.AniList.coll=[{id:7,status:'current',progress:3,anime:{id:'al:42'}}];f.AniList.collAt=f.now;f.AniList.collOwner=f.AniList.entryScope();f.advance(90000);
 assert.equal((await f.AniList.entry('al:42')).progress,3);assert.equal(await f.AniList.entry('al:99'),null);assert.equal(f.calls,0);
 assert.equal((await f.AniList.entry('al:42',{fresh:true})).progress,5);assert.equal(f.calls,1);
});
