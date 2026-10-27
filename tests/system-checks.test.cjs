const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const calls=[],service=()=>({loggedIn:()=>false,token:'private-token',userId:'private-id'});
 const ctx={Date,Map,Set,App:{act(){}},ANILIST_API:'https://anilist.fixture',KITSU_BASE:'https://kitsu.fixture',
  LocalTracker:{coll:[{anime:{id:'al:1',title:'Private local title'},progress:4,rating:8}]},AniList:service(),Kitsu:service(),
  Cloud:{base:()=> 'https://cloud.fixture',ident:()=> 'anideck:private-id',session:null},
  window:{native:{config:async()=>({testBuild:'preview-fixture'}),version:async()=> '1.0.0',systemCheck:async()=>({storage:true,secureStorage:true})}},
  httpUncached:async(url,options={})=>{calls.push({url,options});if(url.includes('anilist'))return {data:{Page:{media:[{id:1}]},Viewer:{id:'private-id'}}};if(url.includes('kitsu'))return {data:[{id:'private-id'}]};return {ok:true,features:['friends','messages','watch-invites','anideck-accounts','discussions','profile-favorites']};}};
 const api=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/system-checks.js'),'utf8')+'\nSystemChecks',ctx);return {api,ctx,calls};
}
test('readiness checks perform bounded public reads, exclude internal acceptance checklists, and do not change local data',async()=>{
 const f=fixture(),before=JSON.stringify(f.ctx.LocalTracker.coll),data=await f.api.collect();assert.equal(f.calls.length,3);assert.equal(JSON.stringify(f.ctx.LocalTracker.coll),before);
 assert(f.calls.every(c=>!c.options.headers?.Authorization&&c.options.allowChallenge===false));assert.equal(data.rows.filter(r=>r.status==='manual').length,0);assert.equal(data.rows.find(r=>r.id==='profile').status,'skipped');
 assert.equal(data.rows.find(r=>r.id==='cloud').status,'pass');assert.equal(data.rows.find(r=>r.id==='friends'),undefined);
 const report=f.api.report(data);for(const secret of ['private-id','private-token','Private local title','https://cloud.fixture'])assert(!report.includes(secret));
});
test('network errors never leak raw URLs, tokens or provider messages into the report',async()=>{
 const f=fixture();f.ctx.httpUncached=async()=>{const error=Error('secret-token at https://private.server');error.status=429;throw error;};const data=await f.api.collect();assert.equal(data.rows.filter(r=>r.status==='attention').length,3);const report=f.api.report(data);assert(!report.includes('secret-token'));assert(!report.includes('private.server'));assert(report.includes('slow down'));
});
test('connected accounts are read without token refresh, logout, imports, or profile creation',async()=>{
 const f=fixture();f.ctx.AniList.loggedIn=f.ctx.Kitsu.loggedIn=()=>true;f.ctx.Cloud.session='session-secret';const original=f.ctx.httpUncached;f.ctx.httpUncached=async(url,opts)=>url.endsWith('/v1/me')?{accountId:'anideck:private-id',me:{handle:'private-handle'}}:original(url,opts);
 const data=await f.api.collect();for(const id of ['anilist-account','kitsu-account','profile'])assert.equal(data.rows.find(r=>r.id===id).status,'pass');assert(!f.api.report(data).includes('private-handle'));assert.equal(f.ctx.AniList.token,'private-token');
});
test('account changes, malformed entries and missing backend features need attention rather than a false pass',async()=>{
 const f=fixture();f.ctx.LocalTracker.coll=[null,{anime:{id:'bad'},progress:-1}];f.ctx.AniList.loggedIn=()=>true;const read=f.ctx.httpUncached;f.ctx.httpUncached=async(url,opts)=>{if(opts?.headers?.Authorization){f.ctx.AniList.userId='another';return {data:{Viewer:{id:'private-id'}}};}if(url.endsWith('/health'))return {ok:true,features:['friends']};return read(url,opts);};
 const data=await f.api.collect();for(const id of ['anilist-account','local-list','cloud'])assert.equal(data.rows.find(r=>r.id===id).status,'attention');
});
test('native check exercises a separate temporary file and rejects unavailable encryption',()=>{
 const {storageCheck}=require('../src/system-checks-native.cjs');let sample;
 const result=storageCheck({isEncryptionAvailable:()=>true,encryptString:value=>{sample=value;return Buffer.from(value)},decryptString:value=>value.toString()});assert.deepEqual(result,{storage:true,secureStorage:true});assert.equal(sample.length,64);
 assert.deepEqual(storageCheck({isEncryptionAvailable:()=>false}),{storage:true,secureStorage:false});
});
