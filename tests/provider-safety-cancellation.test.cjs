const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');
function resolver(fetch){
 class Window { constructor(){this.dead=false} isDestroyed(){return this.dead} destroy(){this.dead=true} }
 const ctx={require:()=>({BrowserWindow:Window,net:{fetch},app:{isReady:()=>true},session:{defaultSession:{webRequest:{onBeforeSendHeaders(){}}}}}),module:{exports:{}},process,console,URL,Map,Set,AbortController,AbortSignal};
 vm.runInNewContext(source,ctx);return new ctx.module.exports();
}
test('unsupported providers cannot silently use another provider',async()=>{
 const r=resolver();let called=0;r.resolveAnikoto=async()=>{called++;return {streamUrl:'https://media.test/a.mp4'}};
 await assert.rejects(()=>r.resolve({provider:'anipm',title:'Example'}),/unavailable/);
 await assert.rejects(()=>r.resolve({provider:'typo',title:'Example'}),/Unsupported streaming provider/);assert.equal(called,0);
 const out=await r.resolve({provider:'anikoto',title:'Example'});assert.equal(out.provider,'anikoto');
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
 r.resolveAnikoto=function(){return new Promise((_,reject)=>{fetches++;this.signal.addEventListener('abort',()=>reject(this.signal.reason),{once:true});});};
 const pending=r.resolve({provider:'anikoto',title:'Example',episodeNum:1,audio:'sub'});
 const rejected=assert.rejects(pending,/cancelled/);r.cancelPending();await rejected;
 assert.equal(fetches,1);assert.equal(r.activeTasks.size,0);
});