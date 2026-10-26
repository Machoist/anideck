/* Real client identity/session code against the Worker and an isolated SQLite database. */
const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
async function backend(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const file of ['schema.sql','social-v2.sql','social-v3.sql','social-v4.sql','social-v5.sql','social-v6.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../server',file),'utf8'));
 const prepare=sql=>({bind(...args){const query=db.prepare(sql);return {first:async()=>query.get(...args)||null,all:async()=>({results:query.all(...args)}),run:async()=>({meta:query.run(...args)})};}});
 const env={DB:{prepare,batch:async statements=>Promise.all(statements.map(s=>s.run()))},SESSION_SECRET:'isolated-recovery-tests'};
 const worker=(await import('../server/src/worker.js')).default;
 const request=async(url,{method='GET',json,headers={}}={})=>{
  assert.equal(new URL(url).origin,'https://fixture.invalid');
  const response=await worker.fetch(new Request(url,{method,headers:{...headers,'Content-Type':'application/json'},body:json===undefined?undefined:JSON.stringify(json)}),env);
  const value=await response.json();if(response.status>=400){const error=Error(value.error);error.status=response.status;error.data=value;throw error;}return value;
 };
 return {db,request};
}
async function device(request,store={},secrets={}){
 const context={crypto:webcrypto,TextEncoder,Date,Map,Set,console,URLSearchParams,
  window:{native:{get:async key=>structuredClone(store[key]),set:async(key,value)=>{store[key]=structuredClone(value);},getSecret:async key=>structuredClone(secrets[key]),setSecret:async(key,value)=>{secrets[key]=structuredClone(value);}}},
  App:{act(){},settings:{activeTracker:'local'},config:{cloudUrl:'https://fixture.invalid'}},
  AniList:{loggedIn:()=>false,details:async id=>({id,title:'Fixture '+id,episodes:12,genres:['Drama']})},Kitsu:{loggedIn:()=>false},
  Friends:{stop(){},rows:[],messages:[]},httpUncached:request};
 const api=read('api.js'),watcher=read('watcher.js');
 vm.createContext(context);vm.runInContext(api.slice(api.indexOf('const LocalTracker ='),api.indexOf('const Trakt ='))+'\n'+watcher.slice(watcher.indexOf('const Cloud = {'),watcher.indexOf('/* ---------------- your stats'))+'\n'+read('profile-account.js')+'\nthis.client={LocalTracker,Tracker,Cloud,AniAccount};',context);
 const client=context.client;await client.LocalTracker.init();if(!client.LocalTracker.loggedIn())await client.LocalTracker.enable();await client.Cloud.init();
 return {...client,context,store,secrets};
}

test('a recovery key restores the same backend profile on another device and after restart without moving device lists',async t=>{
 const {db,request}=await backend(t),first=await device(request),second=await device(request);
 await first.LocalTracker.setProgress('al:1',4,12);await first.Cloud.join('recovery_fixture','friends');
 await first.Cloud.call('/v1/me/profile',{method:'PUT',json:{name:'Fixture name',bio:'Fixture bio',avatar:''}});
 await first.Cloud.call('/v1/me/favorites',{method:'PUT',json:{favorites:[{id:'al:1',title:'Fixture favorite',poster:''}]}});
 await second.LocalTracker.saveEntry('al:2',{status:'current',progress:7,rating:9});const before=JSON.stringify(second.LocalTracker.coll);
 const token=first.LocalTracker.token,owner=first.Cloud.ident();await second.AniAccount.verifyAndSignIn(token);
 assert.equal(second.Cloud.ident(),owner);assert.equal(second.LocalTracker.userId,first.LocalTracker.userId);assert.equal(JSON.stringify(second.LocalTracker.coll),before);
 let profile=await second.Cloud.loadMe();assert.equal(profile.handle,'recovery_fixture');assert.equal(profile.bio,'Fixture bio');assert.equal(profile.favorites[0].id,'al:1');
 const restarted=await device(request,second.store,second.secrets);assert.equal(restarted.Cloud.ident(),owner);assert.equal((await restarted.Cloud.loadMe()).handle,'recovery_fixture');
 assert.equal((await restarted.LocalTracker.entry('al:2')).progress,7);assert.equal((await restarted.LocalTracker.entry('al:2')).rating,9);assert.equal(await restarted.LocalTracker.entry('al:1'),null);
 assert.equal((await first.LocalTracker.entry('al:1')).progress,4);assert.equal(await first.LocalTracker.entry('al:2'),null);
 restarted.Cloud.session='expired-session';assert.equal((await restarted.Cloud.loadMe()).handle,'recovery_fixture');
 assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,1);assert(!JSON.stringify(db.prepare('SELECT * FROM users').all()).includes(token));
});

test('a handle or an unrelated valid-format key cannot claim the existing profile',async t=>{
 const {db,request}=await backend(t),first=await device(request),second=await device(request);
 await first.Cloud.join('ownership_fixture','friends');const original=second.LocalTracker.token,identity=second.Cloud.ident();
 await assert.rejects(second.AniAccount.verifyAndSignIn('ownership_fixture'),/complete AniDeck key/);
 await assert.rejects(second.AniAccount.verifyAndSignIn('adk_'+'a'.repeat(64)),/No AniDeck profile/);
 assert.equal(second.LocalTracker.token,original);assert.equal(second.Cloud.ident(),identity);assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,1);
});
