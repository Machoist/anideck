/* Receiver/controller protocol against a real loopback HTTP server; video decoding is simulated. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCasting}=require('../src/casting/server');
async function fixture(t){
 const cast=createCasting({host:'127.0.0.1',port:0}),status=await cast.start();t.after(()=>cast.stop());const base='http://127.0.0.1:'+status.port;
 const nodes=Object.fromEntries(['welcome','message','activate','now','code','instructions','receiver-heading'].map(id=>[id,{hidden:false,textContent:'',focus(){}}]));
 let plays=0,offline=false;const tracks=[];
 const video=nodes.video={paused:true,currentTime:0,duration:1200,readyState:4,ended:false,querySelectorAll:()=>tracks,addEventListener(){},appendChild:track=>tracks.push(track),pause(){this.paused=true;},play:async()=>{plays++;video.paused=false;},removeAttribute(name){if(name==='src')this.src='';},load(){this.currentTime=0;this.ended=false;},canPlayType:()=> 'probably'};
 const storage=new Map();
 const context={sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{getElementById:id=>nodes[id],createElement:()=>({track:{}})},window:{},navigator:{userAgent:'Fixture receiver'},AbortController,Date,setTimeout,clearTimeout,
  fetch:(url,options)=>{if(offline)return Promise.reject(Error('Network unavailable'));return fetch(new URL(url,base),options);}};
 const source=fs.readFileSync(path.join(__dirname,'../src/casting/receiver.js'),'utf8');
 const makeReceiver=()=>vm.runInNewContext(source.slice(0,source.indexOf('let lastHeartbeat='))+'\n({tick,getMedia:()=>media})',{...context});let receiver=makeReceiver();
 const tick=async()=>{await receiver.tick();video.onloadedmetadata?.();};
 await tick();cast.connect(nodes.code.textContent);await tick();
 return {cast,get receiver(){return receiver},nodes,video,base,tick,reload:async()=>{receiver=makeReceiver();await tick();},get plays(){return plays},offline:value=>offline=value};
}

test('refresh resumes a paired TV using the same tab session and last playback position',async t=>{const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false,at:5});await f.tick();f.video.currentTime=120;await f.tick();const media=f.receiver.getMedia().id;f.cast.setPairing(false);await f.reload();assert.equal(f.cast.status().screen.connected,true);assert.equal(f.receiver.getMedia().id,media);assert.equal(f.video.currentTime,120);assert.equal(f.nodes.code.hidden,true);f.cast.disconnect();await f.reload();assert.equal(f.cast.status().screen,null);assert.equal(f.receiver.getMedia(),null);assert.equal(f.nodes.code.hidden,true);});

test('unused TV code disappears when pairing closes and returns with a new code on reopening',async t=>{const f=await fixture(t);f.cast.disconnect();f.cast.setPairing(false);await f.tick();assert.equal(f.nodes.code.hidden,true);assert.match(f.nodes.instructions.textContent,/Open Cast to TV/);f.cast.setPairing(true);await f.tick();assert.equal(f.nodes.code.hidden,false);assert.match(f.nodes.code.textContent,/\d{3} \d{3}/);f.cast.connect(f.nodes.code.textContent);await f.tick();assert.equal(f.nodes.code.hidden,true);});

test('quickly closing and reopening pairing replaces the code even when the TV misses the closed state',async t=>{const f=await fixture(t);f.cast.disconnect();await f.tick();const previous=f.nodes.code.textContent;f.cast.setPairing(false);f.cast.setPairing(true);await f.tick();assert.notEqual(f.nodes.code.textContent,previous);f.cast.connect(f.nodes.code.textContent);await f.tick();assert.equal(f.cast.status().screen.connected,true);});

test('receiver reloads the same command revision after a transient connection loss at its last reported position',async t=>{
 const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false,at:17});await f.tick();f.video.currentTime=240;await f.tick();
 f.offline(true);await f.tick();assert.equal(f.receiver.getMedia(),null);assert.equal(f.video.paused,true);
 f.offline(false);await f.tick();assert(f.receiver.getMedia(),'The unchanged revision must still restore unloaded media');assert.equal(f.video.currentTime,240);assert.equal(f.video.paused,false);
});
test('recovery and a reloaded receiver preserve a paused episode without calling play',async t=>{
 const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});await f.tick();f.video.currentTime=150;f.video.pause();await f.tick();const before=f.plays;
 f.offline(true);await f.tick();f.offline(false);await f.tick();assert.equal(f.video.currentTime,150);assert.equal(f.video.paused,true);assert.equal(f.plays,before);
});
test('a finished episode does not replay automatically when the receiver reconnects',async t=>{
 const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});await f.tick();f.video.currentTime=1200;f.video.ended=true;f.video.pause();await f.tick();const before=f.plays;
 f.offline(true);await f.tick();f.offline(false);await f.tick();assert.equal(f.plays,before);assert.equal(f.receiver.getMedia(),null);assert.match(f.nodes.now.textContent,/finished/i);
});
test('new pairing after disconnect cannot restore the old episode or media proxy',async t=>{
 const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});await f.tick();const old=f.receiver.getMedia(),code=f.nodes.code.textContent;
 f.cast.disconnect();await f.tick();assert.equal(f.receiver.getMedia(),null);assert.notEqual(f.nodes.code.textContent,code);assert.equal((await fetch(f.base+old.url)).status,403);
 f.cast.connect(f.nodes.code.textContent);await f.tick();assert.equal(f.receiver.getMedia(),null);const next=f.cast.load({url:'https://fixture.invalid/next.mp4',isHLS:false});await f.tick();assert.equal(f.receiver.getMedia().id,next.id);
});

test('a pause arriving before the first media load does not attempt autoplay',async t=>{
 const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});f.cast.command('pause');await f.tick();assert.equal(f.plays,0);assert.equal(f.video.paused,true);
});
test('an old playback packet cannot undo a newer pause or falsely finish the episode',async t=>{
 const f=await fixture(t);const hello=await(await fetch(f.base+'/hello',{method:'POST',body:'{}'})).json();f.cast.connect(hello.code);const media=f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});
 const headers={Authorization:'Bearer '+hello.token,'Content-Type':'application/json'},old=await(await fetch(f.base+'/state',{headers})).json();f.cast.command('pause');
 const response=await(await fetch(f.base+'/playback',{method:'POST',headers,body:JSON.stringify({mediaId:media.id,revision:old.revision,time:1200,duration:1200,paused:false,ended:true})})).json();
 assert.equal(response.ignored,true);assert.equal(f.cast.status().screen.playback.ended,undefined);assert.equal((await(await fetch(f.base+'/state',{headers})).json()).paused,true);
});
test('explicit Play after completion restarts the episode from the beginning',async t=>{
 const f=await fixture(t);f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});await f.tick();f.video.currentTime=1200;f.video.ended=true;f.video.pause();await f.tick();await f.tick();assert.equal(f.receiver.getMedia(),null);
 const before=f.plays;f.cast.command('play');await f.tick();assert(f.receiver.getMedia());assert.equal(f.video.currentTime,0);assert.equal(f.video.paused,false);assert.equal(f.plays,before+1);
});

test('a slow initial metadata load does not erase the requested resume position',async t=>{
 const f=await fixture(t);f.video.readyState=0;f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false,at:300});await f.tick();assert.equal(f.cast.status().screen.playback.time,300);
});

test('an autoplay-blocked receiver still offers Play on TV after reconnecting',async t=>{
 const f=await fixture(t);f.video.play=async()=>{throw Error('User gesture required')};f.cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});await f.tick();await f.tick();assert.equal(f.nodes.activate.hidden,false);
 for(let attempt=0;attempt<3;attempt++){f.offline(true);await f.tick();f.offline(false);await f.tick();assert.equal(f.nodes.activate.hidden,false);assert.match(f.nodes.activate.textContent,/Play on TV/);}
});

test('disconnect aborts an already-open media transfer and revokes its proxy URL',async t=>{
 let cancelled;const ended=new Promise(resolve=>cancelled=resolve);
 const cast=createCasting({host:'127.0.0.1',port:0,fetchUpstream:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3]));},cancel(){cancelled();}}),{headers:{'Content-Type':'video/mp4'}})});
 const status=await cast.start();t.after(()=>cast.stop());const base='http://127.0.0.1:'+status.port;
 const hello=await(await fetch(base+'/hello',{method:'POST',body:'{}'})).json();cast.connect(hello.code);cast.load({url:'https://fixture.invalid/video.mp4',isHLS:false});
 const state=await(await fetch(base+'/state',{headers:{Authorization:'Bearer '+hello.token}})).json(),response=await fetch(base+state.media.url),reader=response.body.getReader();await reader.read();cast.disconnect();
 let timer;try{await Promise.race([ended,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Upstream transfer stayed open')),1500))]);}finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
 assert.equal((await fetch(base+state.media.url)).status,403);
});
