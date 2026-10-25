const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createCasting,rewritePlaylist}=require('../src/casting/server');
async function setup(t,options={}){const cast=createCasting({port:0,host:'127.0.0.1',...options});const status=await cast.start();t.after(()=>cast.stop());const base=`http://127.0.0.1:${status.port}`;const request=async(path,data,token)=>{const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};return {cast,base,request};}
test('receiver connects only through the PC code and expires stale codes',async t=>{
 let time=1000;const {cast,request}=await setup(t,{now:()=>time});
 const a=await request('/hello',{});assert.equal(a.status,200);assert.match(a.body.code,/^\d{6}$/);
 assert.throws(()=>cast.connect('000000'),/incorrect or expired/);
 assert.equal((await request('/state')).status,401);
 cast.connect(a.body.code);assert.equal((await request('/state',undefined,a.body.token)).body.connected,true);
 cast.disconnect();assert.equal((await request('/state',undefined,a.body.token)).body.connected,false);
 const b=await request('/hello',{});time+=120001;assert.throws(()=>cast.connect(b.body.code),/incorrect or expired/);
});
test('cast media relays playlists, keys and byte ranges without leaking upstream URLs or headers',async t=>{
 const received=[];
 const upstream=http.createServer((req,res)=>{received.push({url:req.url,headers:req.headers});
  if(req.url==='/main.m3u8?api_key=secret'){res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:5,\nseg.ts\n');}
  else if(req.headers.range){res.writeHead(206,{'Content-Type':'video/mp2t','Content-Range':'bytes 1-2/4','Content-Length':'2'});res.end('bc');}
  else{res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end('abcd');}
 });
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>upstream.close(r)));
 const origin=`http://127.0.0.1:${upstream.address().port}`;
 const {cast,base,request}=await setup(t),receiver=(await request('/hello',{})).body;
 cast.connect(receiver.code);
 const {id}=cast.load({url:origin+'/main.m3u8?api_key=secret',headers:{Referer:'https://player.example/'}});
 const state=(await request('/state',undefined,receiver.token)).body;
 assert(!JSON.stringify(state).includes('api_key'));assert(!JSON.stringify(state).includes('player.example'));
 const playlist=await (await fetch(base+state.media.url)).text();assert(!playlist.includes(origin));assert(!playlist.includes('api_key'));
 const key=playlist.match(/URI="([^"]+)"/)[1],segment=playlist.split('\n').find(line=>line.startsWith('/media/'));
 assert.equal(await(await fetch(base+key)).text(),'abcd');
 const part=await fetch(base+segment,{headers:{Range:'bytes=1-2'}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 1-2/4');assert.equal(await part.text(),'bc');
 assert(received.every(r=>r.headers.referer==='https://player.example/'));
 assert.equal((await fetch(base+state.media.url.replace(receiver.token,'wrong'))).status,403);
 assert.equal((await request('/playback',{mediaId:'old',time:99},receiver.token)).status,409);
 assert.equal((await request('/playback',{mediaId:id,time:12,duration:25,paused:false},receiver.token)).status,200);
 assert.equal(cast.status().screen.playback.time,12);
 cast.command('seek',20);assert.equal((await request('/state',undefined,receiver.token)).body.value,20);
 cast.disconnect();assert.equal((await fetch(base+segment)).status,403);
});
test('receiver rejects cross-origin registration and does not expose account pairing APIs',async t=>{
 const {base}=await setup(t);
 assert.equal((await fetch(base+'/hello',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
 const page=await(await fetch(base)).text();assert(page.includes('receiver.js'));assert(!page.includes('jellyfinToken'));
 assert.equal((await fetch(base+'/pair/start',{method:'POST',body:'{}'})).status,401);
});
test('playlist rewriting covers nested streams, captions and initialization files',()=>{
 const urls=[];const text=rewritePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="sub/list.m3u8"\n#EXT-X-MAP:URI="init.mp4"\n../video/list.m3u8\n','https://cdn.example/show/master.m3u8',url=>{urls.push(url);return '/opaque';});
 assert.deepEqual(urls,['https://cdn.example/show/sub/list.m3u8','https://cdn.example/show/init.mp4','https://cdn.example/video/list.m3u8']);assert(!text.includes('cdn.example'));
});
test('TV receiver script handles connect, playback, pause, seek and stop against the real server',async t=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
 const {cast,base}=await setup(t);
 const elements=Object.fromEntries(['video','welcome','message','activate','now','code','instructions'].map(id=>[id,{hidden:false,textContent:'',focus(){}}]));
 const video=elements.video;Object.assign(video,{currentTime:0,duration:60,paused:true,play:async()=>{video.paused=false},pause(){video.paused=true},load(){},removeAttribute(){},querySelectorAll:()=>[],addEventListener(){},canPlayType:()=> 'probably',appendChild(){}});
 const source=fs.readFileSync(path.join(__dirname,'../src/casting/receiver.js'),'utf8').replace('tick();setInterval(tick,1000);','');
 const context={document:{getElementById:id=>elements[id],createElement:()=>({})},navigator:{userAgent:'Silk'},window:{},fetch:(url,options)=>fetch(new URL(url,base),options),AbortController,Date,setTimeout,clearTimeout,setInterval(){}};
 const receiver=vm.runInNewContext(source+'\n({tick})',context);
 await receiver.tick();assert.match(elements.code.textContent,/^\d{3} \d{3}$/);cast.connect(elements.code.textContent);
 await receiver.tick();assert(elements.message.textContent.includes('waiting for your episode'));assert(elements.instructions.textContent.includes('automatically'));
 video.play=async()=>{throw new Error('User gesture required')};
 cast.load({url:'https://video.example/movie.mp4',isHLS:false,at:17,title:'Episode 1'});
 await receiver.tick();await receiver.tick();assert.equal(elements.activate.hidden,false);assert.equal(cast.status().screen.playback.needsInteraction,true);assert(elements.now.textContent.includes('TV remote'));video.play=async()=>{video.paused=false};await elements.activate.onclick();await receiver.tick();assert.equal(cast.status().screen.playback.needsInteraction,false);video.onloadedmetadata();await receiver.tick();assert.equal(video.currentTime,17);assert.equal(video.paused,false);assert.equal(cast.status().screen.playback.time,17);assert(video.src.startsWith('/media/'));
 cast.command('pause');await receiver.tick();assert.equal(video.paused,true);
 cast.command('seek',30);await receiver.tick();assert.equal(video.currentTime,30);
 // Commands issued inside one receiver polling interval must preserve the load and seek.
 cast.load({url:'https://video.example/next.mp4',isHLS:false,at:5});
 cast.command('seek',42);cast.command('pause');await receiver.tick();video.onloadedmetadata();
 assert.equal(video.currentTime,42);assert.equal(video.paused,true);assert.equal(video.hidden,false);
 cast.command('play');await receiver.tick();assert.equal(video.paused,false);assert.equal(video.currentTime,42);
 cast.command('stop');await receiver.tick();assert.equal(video.paused,true);assert.equal(video.hidden,true);assert.equal(elements.welcome.hidden,false);
 // Disconnection automatically replaces the consumed code, without reloading the page.
 for(let cycle=0;cycle<4;cycle++){
  cast.disconnect();await receiver.tick();assert.equal(elements.code.hidden,false);assert.equal(cast.status().screen,null);
  assert.match(elements.code.textContent,/^\d{3} \d{3}$/);cast.connect(elements.code.textContent);await receiver.tick();assert.equal(elements.code.hidden,true);assert(cast.status().screen);
 }

});

test('an offline receiver loses its active media lease and receives a stop state',async t=>{let now=1000;const {cast,request,base}=await setup(t,{now:()=>now});const hello=await request('/hello',{});cast.connect(hello.body.code);cast.load({url:'https://video.example/main.m3u8'});const state=await request('/state',undefined,hello.body.token);const url=state.body.media.url;now+=15001;assert.equal(cast.status().screen,null);assert.equal((await fetch(base+url)).status,403);const stopped=await request('/state',undefined,hello.body.token);assert.equal(stopped.body.connected,false);assert.equal(stopped.body.action,'stop');assert.equal(stopped.body.media,null);});

test('leaving a receiver browser immediately unpairs it without waiting for heartbeat expiry',async t=>{
 const {cast,request,base}=await setup(t);const receiver=(await request('/hello',{})).body;cast.connect(receiver.code);cast.load({url:'https://video.example/main.m3u8'});const state=(await request('/state',undefined,receiver.token)).body;
 assert.equal((await request('/leave',{},'invalid')).status,401);assert(cast.status().screen);
 assert.equal((await request('/leave',{},receiver.token)).status,200);assert.equal(cast.status().screen,null);assert.equal((await fetch(base+state.media.url)).status,403);
});

test('TV captions retain labels and caption-specific headers and use a WebVTT content type',async t=>{
 let headers;const {cast,request,base}=await setup(t,{fetchUpstream:async(url,options)=>{headers=options.headers;return new Response('WEBVTT\n\n00:00.000 --> 00:02.000\nHello',{headers:{'content-type':'text/plain'}});}});
 const receiver=(await request('/hello',{})).body;cast.connect(receiver.code);cast.load({url:'https://video.example/master.m3u8',subtitles:[{url:'https://captions.example/en.vtt',label:'English',language:'en',headers:{Referer:'https://embed.example/'}}]});
 const state=(await request('/state',undefined,receiver.token)).body;assert.equal(state.media.subtitles[0].label,'English');const response=await fetch(base+state.media.subtitles[0].url);assert.equal(response.headers.get('content-type'),'text/vtt');assert.match(await response.text(),/Hello/);assert.equal(headers.Referer,'https://embed.example/');
});

test('remote commands notify the receiver immediately without waiting for its state poll',async t=>{
 const {cast,request,base}=await setup(t);const receiver=(await request('/hello',{})).body;cast.connect(receiver.code);
 assert.equal((await fetch(base+'/events?token=wrong')).status,401);
 const connection=await fetch(base+'/events?token='+receiver.token);assert.equal(connection.headers.get('content-type'),'text/event-stream');const reader=connection.body.getReader();t.after(()=>reader.cancel());
 const read=async()=>{let timer;try{return await Promise.race([reader.read(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('No immediate command event')),1500))]);}finally{clearTimeout(timer);}};
 assert.match(new TextDecoder().decode((await read()).value),/data:/);
 cast.load({url:'https://video.example/main.m3u8'});assert.match(new TextDecoder().decode((await read()).value),/data:/);
 for(const [action,value] of [['pause'],['seek',120],['play']]){cast.command(action,value);assert.match(new TextDecoder().decode((await read()).value),/data:/);}
 cast.disconnect();assert.match(new TextDecoder().decode((await read()).value),/data:/);assert.equal(cast.status().screen,null);
});
