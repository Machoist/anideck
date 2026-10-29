const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{EventEmitter}=require('node:events');
test('hidden Anikoto embed activates its DOM control after capture is armed and cleans up',async()=>{
 let listener,activated=false,nativeClicks=0,cleaned=false,url='',dead=false,windows=0;
 class Window extends EventEmitter{
  constructor(options){super();assert.equal(options.show,false);windows++;const wc=new EventEmitter();this.webContents=wc;Object.assign(wc,{session:{webRequest:{onBeforeSendHeaders:(filter,fn)=>{listener=fn;if(filter===null)cleaned=true}}},setUserAgent(){},setAudioMuted(){},setWindowOpenHandler(){},getURL:()=>url,sendInputEvent(){nativeClicks++},executeJavaScript:async script=>{if(script.includes('function discoverSubtitleTracks'))return [];if(script.includes('const el=document.querySelector')){activated=true;listener({url:'https://media.test/episode.m3u8',requestHeaders:{Referer:'https://embed.test/'}},()=>{});return true;}return {click:{x:50,y:40}};}});}
  loadURL(next){url=next;return Promise.resolve()}isDestroyed(){return dead}destroy(){dead=true}
 }
 const ctx={require:name=>name==='electron'?{BrowserWindow:Window}:name==='./anikoto'?{BASE:'https://anikototv.to',metadata:async(_read,title,episode,audio,request)=>{assert.equal(title,'Example');assert.equal(episode,1);assert.equal(audio,'sub');return request.catalogOnly?{episodes:[1]}:['https://embed.test/selected'];}}:require(path.join(__dirname,'../src',name)),module:{exports:{}},process,console,URL,Map,Set,AbortSignal,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8'),ctx);const resolver=new ctx.module.exports();const listing=await resolver.resolveAnikoto('Example',1,'sub',{catalogOnly:true});assert.equal(listing.episodes[0],1);assert.equal(windows,0);
 const result=await resolver.resolveAnikoto('Example',1,'sub');assert.equal(result.streamUrl,'https://media.test/episode.m3u8');assert.equal(activated,true);assert.equal(nativeClicks,0);assert.equal(cleaned,true);assert.equal(dead,true);assert.equal(url,'https://embed.test/selected');
});
