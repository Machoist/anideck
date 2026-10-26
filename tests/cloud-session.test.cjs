const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/watcher.js'),'utf8');const block=source.slice(source.indexOf('const Cloud = {'),source.indexOf('/* ---------------- your stats'));
function fixture(){const anilist={userId:1,token:'fixture-only',userName:'Alice'};const tracker={svc:anilist,loggedIn:()=>true};const writes=[],ctx={Tracker:tracker,AniList:anilist,App:{config:{cloudUrl:'https://fixture.invalid'}},window:{native:{getSecret:async()=>null,setSecret:async(key,value)=>writes.push(value)}},httpUncached:async()=>({session:'fixture-session',me:{handle:'alice'}})};return {cloud:vm.runInNewContext(block+'\nCloud',ctx),ctx,writes};}
test('concurrent cloud session requests coalesce per stable account ID',async()=>{const {cloud,ctx,writes}=fixture();let calls=0;ctx.httpUncached=async()=>{calls++;return {session:'fixture-session',me:{handle:'alice'}}};await Promise.all([cloud.ensure(),cloud.ensure()]);assert.equal(calls,1);assert.equal(writes.length,1);assert.equal(cloud.who,'anilist:1');ctx.AniList.userName='New name';assert.equal(cloud.ident(),'anilist:1');});
test('a session exchange for the old account cannot populate a newly selected account',async()=>{const {cloud,ctx,writes}=fixture();let finish;ctx.httpUncached=()=>new Promise(r=>finish=r);const request=cloud.ensure();await new Promise(setImmediate);ctx.Tracker.svc={userId:2,token:'other-fixture',userName:'Bob'};finish({session:'old-session',me:{handle:'alice'}});assert.equal(await request,false);assert.equal(cloud.session,null);assert.equal(writes.length,0);});


test('a name-keyed legacy session migrates only after the server confirms its account ID',async()=>{
 const {cloud,ctx,writes}=fixture();ctx.window.native.getSecret=async()=>({who:'anilist:Old name',session:'legacy-session'});const routes=[];
 ctx.httpUncached=async(url,opts)=>{routes.push(url);assert.equal(opts.headers.Authorization,'Bearer legacy-session');return {accountId:'anilist:1',me:{handle:'existing'}}};
 assert.equal(await cloud.ensure(),true);assert.equal(routes.length,1);assert(routes[0].endsWith('/v1/me'));assert.equal(cloud.session,'legacy-session');assert.equal(writes[0].who,'anilist:1');
});
test('a legacy session for a different account is never adopted',async()=>{
 const {cloud,ctx}=fixture();ctx.window.native.getSecret=async()=>({who:'anilist:Someone else',session:'not-ours'});
 ctx.httpUncached=async(url)=>url.endsWith('/v1/me')?{accountId:'anilist:2',me:{handle:'other'}}:{session:'fresh-session',me:{handle:'alice'}};
 await cloud.ensure();assert.equal(cloud.session,'fresh-session');assert.equal(cloud.me.handle,'alice');
});

test('simultaneous expired requests share one forced session refresh',async()=>{
 const {cloud,ctx,writes}=fixture();let finish,calls=0;ctx.httpUncached=()=>{calls++;return new Promise(resolve=>finish=resolve);};const a=cloud.ensure(true),b=cloud.ensure(true);await new Promise(setImmediate);assert.equal(calls,1);finish({session:'refreshed',me:{handle:'alice'}});await Promise.all([a,b]);assert.equal(writes.length,1);assert.equal(cloud.session,'refreshed');
});

test('choosing a different watchlist tracker keeps the explicitly selected social identity',async()=>{const {cloud,ctx}=fixture();const local={userId:'a'.repeat(64),token:'adk_'+'1'.repeat(64)};ctx.LocalTracker=local;ctx.Kitsu={};ctx.window.native.get=async()=>null;ctx.window.native.set=async()=>{};await cloud.init();assert.equal(cloud.ident(),'anilist:1');ctx.Tracker.svc=local;ctx.Tracker.name='AniDeck';assert.equal(cloud.ident(),'anilist:1');assert.equal(cloud.service(),ctx.AniList);});
