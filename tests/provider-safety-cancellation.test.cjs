const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');
function resolver(fetch){
 class Window { constructor(){this.dead=false} isDestroyed(){return this.dead} destroy(){this.dead=true} }
 const ctx={require:()=>({BrowserWindow:Window,net:{fetch},app:{isReady:()=>true},session:{defaultSession:{webRequest:{onBeforeSendHeaders(){}}}}}),module:{exports:{}},process,console,URL,Map,Set,AbortController,AbortSignal};
 vm.runInNewContext(source,ctx);return new ctx.module.exports();
}
test('unsupported providers cannot silently use another provider',async()=>{
 const r=resolver();let called=0;r.resolveAnimePahe=async()=>{called++;return {streamUrl:'https://media.test/a.mp4'}};
 await assert.rejects(()=>r.resolve({provider:'anipm',title:'Example'}),/unavailable/);
 await assert.rejects(()=>r.resolve({provider:'typo',title:'Example'}),/Unsupported streaming provider/);assert.equal(called,0);
 const out=await r.resolve({provider:'animepahe',title:'Example'});assert.equal(out.provider,'animepahe');
});
test('AnimePahe rejects wrong title, missing episode and missing audio without sniffing search results',async()=>{
 for(const scenario of ['title','episode','audio','unverified-audio']){
  const r=resolver();let sniffed=0,playFetches=0;
  r.fetchJsonWithCloudflareBypass=async url=>url.includes('m=search')?{data:[{title:scenario==='title'?'Another Show':'Example',session:'show'}]}:{data:[{episode:1,session:'one'}],last_page:1};
  r.fetchTextWithCloudflareBypass=async()=>{playFetches++;return scenario==='audio'?'<button data-src="https://embed.test/dub" data-audio="eng">Dub</button>':''};
  r.sniffUrlInHiddenWindow=async()=>{sniffed++;throw Error('Should not sniff')};
  await assert.rejects(()=>r.resolveAnimePahe('Example',scenario==='episode'?2:1,'sub'),scenario==='title'?/exact title/:scenario==='episode'?/Requested episode 2/:/audio/);
  assert.equal(sniffed,0);if(['title','episode'].includes(scenario))assert.equal(playFetches,0);
 }
});
test('AnimePahe finds the requested episode on a later page and preserves requested audio',async()=>{
 const r=resolver();const played=[];
 r.fetchJsonWithCloudflareBypass=async url=>url.includes('m=search')?{data:[{title:'Example',session:'show'}]}:url.includes('page=2')?{data:[{episode:2,session:'two'}]}:{data:[{episode:1,session:'one'}],last_page:2};
 r.fetchTextWithCloudflareBypass=async url=>{played.push(url);return url.includes('/play/')?'<button data-src="https://embed.test/dub" data-audio="eng"></button><button data-src="https://embed.test/sub"></button>':''};
 r.sniffUrlInHiddenWindow=async url=>({streamUrl:url});
 const out=await r.resolveAnimePahe('Example',2,'sub');assert.equal(out.streamUrl,'https://embed.test/sub');assert(played[0].endsWith('/two'));
});
test('closing cancels foreground and preload work, destroys windows, and permits a fresh request',async()=>{
 const r=resolver();const windows=[];let calls=0;
 r.resolveAnikoto=async function(){calls++;windows.push(this.createResolverWindow({}));return new Promise(()=>{})};
 const args={provider:'anikoto',title:'Example',episodeNum:1,audio:'sub'};
 const prefetch=r.resolve({...args,prefetch:true});const waiting=r.resolve(args);
 const checks=[assert.rejects(prefetch,/cancelled/),assert.rejects(waiting,/cancelled/)];
 r.cancelPending();await Promise.all(checks);assert.equal(calls,1);assert(windows.every(w=>w.dead));assert.equal(r.activeTasks.size,0);assert.equal(r.prefetchedStreams.size,0);
 r.resolveAnikoto=async()=>({streamUrl:'https://media.test/new.mp4'});assert.equal((await r.resolve(args)).provider,'anikoto');
});

test('cancellation aborts an in-flight fetch without trying another mirror or browser',async()=>{
 let fetches=0;
 const r=resolver((_url,options)=>{fetches++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});
 const pending=r.resolve({provider:'animepahe',title:'Example',episodeNum:1,audio:'sub'});
 const rejected=assert.rejects(pending,/cancelled/);r.cancelPending();await rejected;
 assert.equal(fetches,1);assert.equal(r.activeTasks.size,0);
});