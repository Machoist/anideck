const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/player.js'),'utf8');
function player(extra={}){const ctx={window:{native:{}},document:{getElementById:()=>({style:{}})},App:{settings:{subLang:'off',showAudio:{show:'sub'},audioLang:'jpn'}},console,TICKS:10000000,applySubStyle(){},showTint(){},activeStreamingServer:'anikoto',...extra};return {p:vm.runInNewContext(source+'\nPlayer',ctx),ctx}}
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve}}
test('Subtitles Off survives the per-show Sub preference',()=>{const {p}=player();p.ctx={series:{Id:'show'}};p.source={MediaStreams:[{Type:'Audio',Language:'jpn',Index:1},{Type:'Subtitle',Language:'eng',Index:2,IsTextSubtitleStream:true,IsDefault:true}]};p.pickTracks();assert.equal(p.subMode,'off');assert.equal(p.subIndex,null);assert.equal(p.audioIndex,1)});
test('an old volume lookup cannot reopen or replace a newer player request',async()=>{const a=deferred(),b=deferred();let n=0;const {p}=player({window:{native:{get:()=>++n===1?a.promise:b.promise}}});p.bind=()=>{};p.el={hidden:true};p.video={};p.wake=()=>{};p.syncVol=()=>{};const loaded=[];p.load=async e=>loaded.push(e.Id);const first={episode:{Id:'one'},provider:'anikoto'},second={episode:{Id:'two'},provider:'anikoto'};const pa=p.open(first);const pb=p.open(second);b.resolve(0.8);await pb;a.resolve(0.2);await pa;assert.deepEqual(loaded,['two']);assert.equal(p.video.volume,0.8)});
test('remote resolution and attachment cannot resume a superseded playback session',async()=>{const pending=deferred();const {p}=player();const ep={Id:'one'};p.ctx={episode:ep};p.el={hidden:false};p.server='anikoto';p.loadSeq=1;p.resolveRemote=()=>pending.promise;let attached=0;p.attachSource=async()=>attached++;const result=p.startRemote(ep,null,0);p.loadSeq=2;pending.resolve({streamUrl:'https://media.test/a.m3u8'});await result;assert.equal(attached,0)});
test('a slow local episode lookup cannot replace the newer episode',async()=>{const old=deferred(),fresh=deferred();const {p}=player({Jellyfin:{connected:()=>true,item:id=>id==='one'?old.promise:fresh.promise},crypto:{randomUUID:()=> 'uuid'}});p.ctx={series:{Name:'Example'}};p.el={hidden:false};p.server='jellyfin';p.teardown=()=>{p.loadSeq=(p.loadSeq||0)+1};for(const name of ['cancelNext','setFit','setTrackLabel','buildServerMenu','pickTracks','buildMenus','loadSegments'])p[name]=()=>{};p.nextEpisode=()=>null;p.prevEpisode=()=>null;const played=[];p.startStream=async()=>played.push(p.item.Id);const one=p.load({Id:'one'}),two=p.load({Id:'two'});fresh.resolve({Id:'two',MediaSources:[{}]});await two;old.resolve({Id:'one',MediaSources:[{}]});await one;assert.deepEqual(played,['two']);assert.equal(p.item.Id,'two')});
test('season zero fails before starting a helper window',async()=>{const src=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');const ctx={require:()=>({}),module:{exports:{}},process,console,Map,Set,URL};vm.runInNewContext(src,ctx);const r=new ctx.module.exports();await assert.rejects(()=>r.resolveAnikoto('Example',1,'sub',{seasonNumber:0}),/Specials require/)});


test('a connected TV receives a resolved stream without waiting for the PC decoder',async()=>{
 let sent=0,local=0;const Cast={ready:true,active:false,async sendCurrent(options){sent++;assert.equal(options.at,37)}};
 const {p}=player({Cast});const ep={Id:'one'};p.ctx={episode:ep};p.el={hidden:false};p.video={querySelectorAll:()=>[]};p.server='anikoto';p.serverName=()=> 'Anikoto';p.loadSeq=1;p.buildMenus=()=>{};p.afterStart=()=>{};p.attachSource=async()=>{local++;throw Error('PC decoder unavailable')};
 await p.startRemote(ep,{streamUrl:'https://media.test/a.m3u8',isHLS:true},37);
 assert.equal(sent,1);assert.equal(local,0);assert.equal(p.castSource.url,'https://media.test/a.m3u8');
});

test('returning from TV initializes a previously unused local source before resuming',async()=>{
 const {p}=player();p.el={hidden:false};p.loadSeq=1;p.castSource={url:'https://media.test/a.m3u8',isHLS:true};p.localSourceReady=false;const calls=[];
 p.attachSource=async(url,at,hls)=>calls.push(['attach',url,at,hls]);p.seekTo=at=>calls.push(['seek',at]);p.video={play:async()=>calls.push(['play'])};p.tick=()=>{};
 await p.resumeFromCast(123);assert.deepEqual(calls,[['attach','https://media.test/a.m3u8',123,true],['seek',123],['play']]);
});


test('PC media relay receives captured headers and keeps the original URL for TV handoff',async()=>{let request;const {p}=player({window:{native:{relayStream:async data=>{request=data;return 'http://127.0.0.1:1234/media/token';}}}});p.loadSeq=1;p.castHeaders={Referer:'https://player.test/'};p.castSource={url:'https://video.test/master.m3u8',isHLS:true};const local=await p.localRemoteSource({streamUrl:p.castSource.url});assert.equal(request.headers.Referer,'https://player.test/');assert.equal(local,p.pcRelayUrl);assert.equal(p.castSource.url,'https://video.test/master.m3u8');});
