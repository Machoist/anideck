const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/cast.js'),'utf8');
function setup(load=async()=>({ok:true,value:{id:'media'}})){
 const calls=[],video={currentTime:17,paused:false,pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}};
 const Player={async resumeFromCast(at){video.currentTime=at;await video.play()},tick(){},ctx:{series:{Name:'Example'},episode:{Name:'Episode'}},el:{hidden:false},loadSeq:1,video,castSource:{url:'https://video.example/main.m3u8',isHLS:true},castHeaders:{Referer:'https://player.example/'},dur:()=>1400,seekTo:t=>video.currentTime=t};
 const ctx={Player,window:{native:{cast:{connect:async code=>{calls.push(['connect',code]);return {ok:true,value:{}}},load:async m=>{calls.push(m);return load(m)},command:async(...args)=>{calls.push(args);return {ok:true,value:{}}}}}},document:{getElementById:()=>null},epLabel:()=> 'Episode 1',toast(){},setInterval(){},clearInterval(){},App:{settings:{maxBitrate:20000000,subLang:'eng'}}};
 const cast=vm.runInNewContext(source+'\nCast',ctx);cast.originalPoll=cast.poll;cast.poll=async()=>{};cast.ensurePoll=()=>{};return {cast,Player,calls,ctx};
}
test('sending a provider episode keeps source headers and pauses PC only after loading TV',async()=>{
 const {cast,Player,calls}=setup();await cast.sendCurrent();assert.equal(calls[0].at,17);assert.equal(calls[0].headers.Referer,'https://player.example/');assert.equal(cast.active,true);assert.equal(Player.video.paused,true);assert.equal(Player.casting.time,17);
 Player.casting.time=120;await cast.returnToPc();assert.equal(Player.video.currentTime,120);assert.equal(Player.video.paused,false);assert.equal(cast.active,false);
});
test('a rejected cast leaves local playback intact',async()=>{
 const {cast,Player}=setup(async()=>({ok:false,error:'No TV connected'}));await assert.rejects(cast.sendCurrent(),/No TV/);assert.equal(Player.video.paused,false);assert.equal(cast.active,false);
});
test('superseded media does not activate casting or pause a newer episode',async()=>{
 let resolve;const {cast,Player,calls}=setup(()=>new Promise(r=>resolve=r));const pending=cast.sendCurrent();Player.loadSeq++;resolve({ok:true,value:{id:'old'}});await pending;assert.equal(cast.active,false);assert.equal(Player.video.paused,false);assert.equal(calls[1][0],'stop');
});
test('Jellyfin casting requests browser-compatible transcoding and the selected captions',async()=>{
 const {cast,Player,calls,ctx}=setup();Player.item={Id:'ep'};Player.source={Id:'source'};Player.subMode='text';Player.subIndex=3;Player.playSessionId='session';
 let options;ctx.Jellyfin={streamUrl:(item,source,o)=>{options=o;return 'http://server/master.m3u8?api_key=test'},subtitleVttUrl:()=> 'http://server/sub.vtt?api_key=test'};
 await cast.sendCurrent();assert.equal(options.copyVideo,false);assert.equal(options.hevc,false);assert.equal(options.maxBitrate,10000000);assert.equal(calls[0].subtitles.length,1);assert(calls[0].subtitles[0].url.includes('sub.vtt'));
});

test('connecting from Settings arms the next episode without trying to cast an empty player',async()=>{
 const {cast,Player,calls}=setup();Player.ctx=null;Player.el.hidden=true;await cast.connectReceiver('123456');assert.equal(cast.ready,true);assert.equal(cast.active,false);assert.equal(calls.length,1);assert.equal(calls[0][0],'connect');await cast.returnToPc();assert.equal(cast.ready,false);
});
test('connecting while an episode is loaded sends it immediately',async()=>{
 const {cast,calls,Player}=setup();await cast.connectReceiver('123456');assert.equal(cast.ready,true);assert.equal(cast.active,true);assert.equal(calls[1].url,Player.castSource.url);assert.equal(Player.video.paused,true);
});

test('receiver completion is handled once and stale episode reports are ignored',async()=>{
 const {cast,Player,ctx}=setup();cast.poll=cast.originalPoll;ctx.document.querySelector=()=>null;let ends=0;Player.ended=()=>ends++;cast.active=true;cast.mediaId='media';
 ctx.window.native.cast.status=async()=>({ok:true,value:{screen:{online:true,playback:{mediaId:'old',ended:true}}}});await cast.poll();assert.equal(ends,0);
 ctx.window.native.cast.status=async()=>({ok:true,value:{screen:{online:true,playback:{mediaId:'media',ended:true}}}});await cast.poll();await cast.poll();assert.equal(ends,1);
});

test('switching episodes during a TV progress update cannot complete the new episode',async()=>{
 const {cast,Player,ctx}=setup();cast.poll=cast.originalPoll;ctx.document.querySelector=()=>null;let ends=0;Player.ended=()=>ends++;cast.active=true;cast.mediaId='media';Player.tick=()=>{cast.mediaId='new-media';};
 ctx.window.native.cast.status=async()=>({ok:true,value:{screen:{online:true,playback:{mediaId:'media',ended:true}}}});await cast.poll();assert.equal(ends,0);
});

test('disconnect unpairs before attempting PC playback and still works with no open episode',async()=>{
 const {cast,Player,calls,ctx}=setup();ctx.document.querySelector=()=>null;cast.paint=()=>{};let closed=0;ctx.App.closeModal=()=>closed++;
 ctx.window.native.cast.disconnect=async()=>{calls.push('disconnect');return {ok:true,value:{}}};ctx.window.native.cast.stop=async()=>{calls.push('off');return {ok:true,value:{}}};
 Player.casting={time:80};Player.resumeFromCast=async()=>{assert.equal(cast.active,false);assert.equal(calls[0],'disconnect');throw Error('PC stream failed');};cast.active=true;await cast.disconnectReceiver();assert.equal(cast.active,false);assert.equal(cast.mediaId,null);
 Player.ctx=null;Player.el.hidden=true;Player.tick=()=>{throw Error('Cannot tick an empty player')};await cast.disconnectReceiver();await cast.disconnectReceiver(true);assert.deepEqual(calls,['disconnect','disconnect','off']);assert.equal(closed,1);
});
test('turn off receiver completes before a pending PC playback load',async()=>{
 const {cast,Player,ctx}=setup();let stopped=false,closed=false,finish;ctx.App.closeModal=()=>closed=true;ctx.window.native.cast.stop=async()=>{stopped=true;return {ok:true,value:{}}};Player.casting={time:40};Player.resumeFromCast=()=>new Promise(r=>finish=r);
 const pending=cast.disconnectReceiver(true);await new Promise(setImmediate);assert.equal(stopped,true);assert.equal(closed,true);assert.equal(Player.casting,null);finish();await pending;
});
test('a status response started before disconnection cannot repaint the old connected state',async()=>{
 const {cast,Player,ctx}=setup();let respond,painted=0;cast.poll=cast.originalPoll;cast.paint=()=>painted++;ctx.document.querySelector=()=>null;ctx.window.native.cast.status=()=>new Promise(r=>respond=r);ctx.window.native.cast.disconnect=async()=>({ok:true,value:{}});Player.ctx=null;Player.el.hidden=true;
 const pending=cast.poll();await cast.disconnectReceiver();respond({ok:true,value:{screen:{online:true}}});await pending;assert.equal(painted,1);assert.equal(cast.active,false);
});
