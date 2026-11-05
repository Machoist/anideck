/* Actual local font storage, Chromium decoding and settings/player subtitle styles; no accounts. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output,fontFile]=process.argv.slice(2);if(!fontFile)throw Error('Usage: node scripts/native-subtitle-font.cjs electron.exe app-root output system-font.ttf');
const root=path.resolve(appRoot),out=path.resolve(output),dir=fs.mkdtempSync(path.join(path.resolve('..'),'anideck-font-native-'));fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('native',{subtitleFont:(action,font)=>ipcRenderer.invoke('fixture:font',action,font)});`);
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path');const root=${JSON.stringify(root)},out=${JSON.stringify(out)},fontFile=${JSON.stringify(path.resolve(fontFile))},phase=process.argv.at(-1);app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.whenReady().then(async()=>{try{
const {createFontStore,pickFont}=require(path.join(root,'src/subtitle-font-native.cjs')),store=createFontStore(path.join(__dirname,'fonts'));let cancel=true,parented=false;
const win=new BrowserWindow({show:false,width:1000,height:920,icon:path.join(root,'build/icon.png'),webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:false}});win.webContents.on('paint',()=>{});
ipcMain.handle('fixture:font',async(e,action,font)=>{try{if(action==='get')return {ok:true,font:await store.read()};if(action==='save')return {ok:true,font:await store.save(font)};if(action==='remove'){await store.remove();return {ok:true};}return {ok:true,font:await pickFont({showOpenDialog:async(parent,options)=>{parented=parent===win&&options.title.includes('AniDeck');if(cancel){cancel=false;return {canceled:true};}return {filePaths:[fontFile]};}},win)};}catch(error){return {ok:false,error:error.message};}});
const csp=fs.readFileSync(path.join(root,'src/index.html'),'utf8').match(/<meta http-equiv="Content-Security-Policy"[\\s\\S]*?>/)[0];
await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html><head>'+csp+'</head><body><main id="settings" style="max-width:720px;margin:30px auto;padding:20px"></main><video id="fixture-video" muted></video><div id="player-subtitle" class="p-sub"><span>Subtitle font test</span></div></body></html>'));
await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+fs.readFileSync(path.join(root,'src/subtitle-font.css'),'utf8'));
await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/subtitle-font.js'),'utf8')+';void 0;');
const source=fs.readFileSync(path.join(root,'src/app.js'),'utf8'),start=source.indexOf('<div class="set-card"><h3>Subtitles</h3>'),end=source.indexOf('      \u0024{Requests.enabled()',start),card=source.slice(start,end).trim();if(start<0||end<0)throw Error('Subtitle settings markup missing');
await win.webContents.executeJavaScript('('+function(){globalThis.s={subLang:'eng',subSize:'md',subStyle:'outline'};globalThis.langs=[['eng','English']];globalThis.opt=(options,value)=>options.map(([id,label])=>'<option value="'+id+'" '+(id===value?'selected':'')+'>'+label+'</option>').join('');}.toString()+')();void 0;');
await win.webContents.executeJavaScript('document.querySelector("#settings").innerHTML='+String.fromCharCode(96)+card+String.fromCharCode(96)+';SubtitleFont.bind();void 0;');
const result=await win.webContents.executeJavaScript('('+async function(phase){
const wait=ms=>new Promise(r=>setTimeout(r,ms)),expect=(ok,message)=>{if(!ok)throw Error(message);},span=document.querySelector('#player-subtitle span'),measure=()=>{span.style.fontSize='32px';return span.getBoundingClientRect().width;};span.style.display='inline-block';
await SubtitleFont.init();const initial=SubtitleFont.name;
if(phase==='cold'){
 expect(!initial,'Fresh fixture unexpectedly has a font');const before=measure();await SubtitleFont.change();expect(!SubtitleFont.name,'Cancel changed the font');
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d').fillRect(0,0,64,64);const video=document.querySelector('#fixture-video');video.srcObject=canvas.captureStream(1);await video.play();
 await SubtitleFont.change();expect(SubtitleFont.name&&!SubtitleFont.error,'Font import failed: '+SubtitleFont.error);expect(document.fonts.check('32px AniDeckSubtitles'),'FontFace not loaded');expect(getComputedStyle(span).fontFamily.includes('AniDeckSubtitles'),'Player style did not use font');const after=measure();expect(before!==after,'Font glyph metrics did not change');expect(!video.paused,'Import interrupted playback');video.srcObject.getTracks().forEach(t=>t.stop());
 return {phase,name:SubtitleFont.name,fontLoaded:true,playerFamily:getComputedStyle(span).fontFamily,previewFamily:getComputedStyle(document.querySelector('.sub-preview .p-sub span')).fontFamily,before,after,playbackStayedActive:true,cancelPreserved:true};
}
expect(!!initial&&document.fonts.check('32px AniDeckSubtitles'),'Restart did not restore font');await SubtitleFont.change(true);expect(!SubtitleFont.name&&!getComputedStyle(span).fontFamily.includes('AniDeckSubtitles'),'Default removal did not restore styles');return {phase,restored:initial,removed:true};
}.toString()+')('+JSON.stringify(phase)+')');
if(phase==='cold'){if(!parented)throw Error('Picker did not inherit parent');result.parentedPicker=true;fs.writeFileSync(path.join(out,'settings.png'),(await win.webContents.capturePage()).toPNG());win.setContentSize(420,900);await new Promise(r=>setTimeout(r,100));const overflow=await win.webContents.executeJavaScript('document.documentElement.scrollWidth>window.innerWidth');if(overflow)throw Error('Narrow settings overflow');fs.writeFileSync(path.join(out,'settings-narrow.png'),(await win.webContents.capturePage()).toPNG());}
if(phase==='restart'&&await store.read())throw Error('Removed font remained on disk');fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,2));console.log('Native subtitle font '+phase+' passed');win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
for(const phase of ['cold','restart']){const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs'),phase],{env,windowsHide:true,encoding:'utf8',timeout:25000});process.stdout.write(result.stdout||'');if(result.status!==0||!result.stdout?.includes('Native subtitle font '+phase+' passed')){process.stderr.write(result.stderr||String(result.error));process.exit(1);}}
