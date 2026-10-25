const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('hidden Anikoto player activates the DOM control after capture is armed',async()=>{
 let listener,activated=false,nativeClicks=0,cleaned=false,url='';
 class Window{
  constructor(){this.webContents={session:{webRequest:{onBeforeSendHeaders:(filter,fn)=>{listener=fn;if(filter===null)cleaned=true}}},setUserAgent(){},setAudioMuted(){},setWindowOpenHandler(){},once(){},removeListener(){},getURL:()=>url,sendInputEvent(){nativeClicks++},executeJavaScript:async script=>{if(script.includes("function discoverSubtitleTracks"))return [];
   if(script.includes('const el=document.querySelector')){activated=true;listener({url:'https://media.test/episode.m3u8',requestHeaders:{Referer:'https://player.test/'}},()=>{});return true;}
   const stage=script.match(/, "(search|episode|audio|player)"\)$/)[1];
   if(stage==='search')return {navigate:'https://anikototv.to/watch/example/ep-1',stage:'episode'};
   if(stage==='episode')return {stage:'audio'};
   if(stage==='audio')return {stage:'player',selected:true,click:{x:464,y:319}};
   throw Error('capture should finish before another player inspection');
  }};}
  loadURL(next){url=next;return Promise.resolve()}isDestroyed(){return false}destroy(){}
 }
 const ctx={require:name=>name==='./providerSubtitles'?require('../src/providerSubtitles'):({BrowserWindow:Window}),module:{exports:{}},process,console,URL,Map,Set,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8'),ctx);
 const result=await new ctx.module.exports().resolveAnikoto('Example',1,'sub');
 assert.equal(result.streamUrl,'https://media.test/episode.m3u8');assert.equal(activated,true);assert.equal(nativeClicks,0);assert.equal(cleaned,true);
});
