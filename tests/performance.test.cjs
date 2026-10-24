const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const apiSource=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function reads(handler){const ctx={Map,Set,URLSearchParams,window:{native:{request:handler}},console};return vm.runInNewContext(apiSource+'\n({http,clearReadRequests})',ctx)}
test('100 concurrent identical catalog reads share one request and isolate mutable results',async()=>{
 let count=0,release;const r=reads(async()=>{count++;await new Promise(resolve=>release=resolve);return {ok:true,text:'{"items":[1]}'}});
 const jobs=Array.from({length:100},()=>r.http('https://kitsu.test/edge/anime?page=1'));assert.equal(count,1);release();const results=await Promise.all(jobs);results[0].items.push(2);assert.equal(results[1].items.length,1);assert.equal((await r.http('https://kitsu.test/edge/anime?page=1')).items.length,1);assert.equal(count,1);
});
test('account reads are fresh after completion, writes invalidate catalog reads, and errors are retried',async()=>{
 let count=0,fail=false;const r=reads(async()=>{count++;if(fail)throw Error('offline');return {ok:true,text:'{"value":1}'}});
 await r.http('https://kitsu.test/edge/anime');await r.http('https://kitsu.test/edge/anime');assert.equal(count,1);
 await r.http('https://kitsu.test/edge/library-entries');await r.http('https://kitsu.test/edge/library-entries');assert.equal(count,3);
 await r.http('https://kitsu.test/edge/library-entries',{method:'PATCH',json:{progress:4}});await r.http('https://kitsu.test/edge/anime');assert.equal(count,5);
 fail=true;await assert.rejects(r.http('https://other.test/items'),/offline/);fail=false;await r.http('https://other.test/items');assert.equal(count,7);
});
test('GraphQL reads coalesce only for identical credentials; mutations are never coalesced',async()=>{
 let count=0;const r=reads(async()=>{count++;return {ok:true,text:'{"data":{"id":1}}'}}),query={method:'POST',json:{query:'query { Viewer { id } }'}};
 await Promise.all([r.http('https://graphql.test',{...query,headers:{Authorization:'Bearer A'}}),r.http('https://graphql.test',{...query,headers:{Authorization:'Bearer A'}}),r.http('https://graphql.test',{...query,headers:{Authorization:'Bearer B'}})]);assert.equal(count,2);
 await Promise.all([r.http('https://graphql.test',{method:'POST',json:{query:'mutation { Save { id } }'}}),r.http('https://graphql.test',{method:'POST',json:{query:'mutation { Save { id } }'}})]);assert.equal(count,4);
});
test('startup initializes all four services before awaiting their completion',async()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),begin=app.indexOf('  async boot() {'),end=app.indexOf('\n  },',begin);let started=0;const release=[];const service={init:()=>{started++;return new Promise(resolve=>release.push(resolve))}};
 const ctx={window:{native:{config:async()=>({}),version:async()=> 'test',get:async()=>({})}},DEFAULT_SETTINGS:{gamepad:false},applyAppearance(){},TV:{init(){}},Prefetch:{bind(){}},HoverPreview:{bind(){}},Kitsu:service,Trakt:service,AniList:service,Jellyfin:service,Tracker:{loggedIn:()=>true},preconnectImageHosts(){},Art:{load:async()=>{}},hideSplash(){}};
 const boot=vm.runInNewContext('({'+app.slice(begin,end)+'\n}}).boot',ctx),pending=boot.call({bindUpdates(){},bindShell(){},enter(){}});await new Promise(setImmediate);assert.equal(started,4);release.forEach(resolve=>resolve(false));await pending;
});
test('repeated foreground stream requests share resolution and failed requests can retry',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');const ctx={module:{exports:{}},require:()=>({}),process,console,Map,Set,AbortController};vm.runInNewContext(source,ctx);const resolver=new ctx.module.exports();let count=0,release;
 resolver.resolveCached=async()=>{count++;return new Promise(resolve=>release=resolve)};const params={provider:'anikoto',title:'Example',episodeNum:1,audio:'sub'};const a=resolver.resolve(params),b=resolver.resolve(params);assert.equal(count,1);release({streamUrl:'https://cdn.test/video.m3u8'});await Promise.all([a,b]);assert.equal(resolver.pendingStreams.size,0);
 resolver.resolveCached=async()=>{count++;throw Error('retry')};await assert.rejects(resolver.resolve(params),/retry/);await assert.rejects(resolver.resolve(params),/retry/);assert.equal(count,3);
});

test('source replacement removes stale media listeners so old seeks cannot affect the next episode',async()=>{
 const {EventEmitter}=require('node:events');const source=fs.readFileSync(path.join(__dirname,'../src/player.js'),'utf8'),start=source.indexOf('  attachSource(url,'),end=source.indexOf('  // Plays the episode from an outside site',start);
 const attach=vm.runInNewContext('({'+source.slice(start,end)+'}).attachSource',{window:{},setTimeout,clearTimeout,console});
 const video=new EventEmitter();video.addEventListener=video.on;video.removeEventListener=video.removeListener;video.currentTime=0;
 const player={video,loadSeq:1};const old=attach.call(player,'https://cdn.test/first.mp4',80,false).catch(error=>error);const next=attach.call(player,'https://cdn.test/second.mp4',12,false);assert.equal((await old).name,'AbortError');assert.equal(video.listenerCount('loadedmetadata'),1);video.emit('loadedmetadata');await next;assert.equal(video.currentTime,12);assert.equal(video.listenerCount('loadedmetadata'),0);assert.equal(video.listenerCount('error'),0);assert.equal(player.sourceCancel,null);
});
test('Back waits for the destination render before restoring its scroll position',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),start=source.indexOf('  back() {'),end=source.indexOf('\n  },',start),main={scrollTop:0};const back=vm.runInNewContext('({'+source.slice(start,end)+'\n}}).back',{$:()=>main});let finish;const app={renderId:2,history:[{view:'browse',params:{},scroll:900}],nav(){this.renderId++;return new Promise(resolve=>finish=resolve)},stale(id){return id!==this.renderId}};const work=back.call(app);assert.equal(main.scrollTop,0);finish();await work;assert.equal(main.scrollTop,900);
});
