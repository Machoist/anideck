/* Real IndexedDB + real logo renderer across two isolated Electron processes. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output]=process.argv.slice(2);if(!binary||!appRoot||!output)throw Error('Usage: node scripts/native-title-artwork.cjs electron.exe app-root output-directory');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anideck-artwork-')),out=path.resolve(output),root=path.resolve(appRoot);fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'fixture.html'),'<!doctype html><html><body><main class="detail-hero"><div class="hero-inner"><div class="hero-text"></div></div></main></body></html>');
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));
const root=${JSON.stringify(root)},out=${JSON.stringify(out)},stage=process.argv.includes('--warm')?'warm':'cold';
app.whenReady().then(async()=>{try{
const win=new BrowserWindow({show:false,width:1360,height:860,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}});win.webContents.on('paint',()=>{});
await win.loadFile(path.join(__dirname,'fixture.html'));
const source=fs.readFileSync(path.join(root,'src/app.js'),'utf8'),start=source.indexOf('const logoCache = new Map();'),end=source.indexOf('// Hovering a title for a moment',start);
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');await win.webContents.insertCSS(css+'body{background:#17151e} .detail-hero{padding:120px 50px;background:linear-gradient(120deg,#322947,#17151e)}');
await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/title-artwork-store.js'),'utf8'));
await win.webContents.executeJavaScript('const esc=s=>String(s??"");'+source.slice(start,end));
const result=await win.webContents.executeJavaScript('('+async function(stage){
let metadataReads=0,canvasReads=0;const create=document.createElement.bind(document);document.createElement=(tag,...args)=>{if(tag==='canvas')canvasReads++;return create(tag,...args);};
const before=performance.now();await TitleArtwork.load(titleLogoCache);const hydrationMs=performance.now()-before;
await ArtworkImages.load();let measurementLoads=0;const makeImage=ArtworkImages.makeImage;ArtworkImages.makeImage=()=>{measurementLoads++;if(stage==='warm')throw Error('Warm dimensions must not download images');return makeImage();};
const publicArtwork=['https://artworks.thetvdb.com/banners/v4/series/393478/posters/60d20e7c9ca6a.jpg','https://artworks.thetvdb.com/banners/v4/series/393478/backgrounds/60f3733aa53e2.jpg'];const imageSizes=[];
for(const url of publicArtwork){const [a,b]=await Promise.all([ArtworkImages.measure(url),ArtworkImages.measure(url)]);if(!a||a.w!==b.w||a.h!==b.h)throw Error('Public artwork dimensions missing');imageSizes.push({w:a.w,h:a.h});}await ArtworkImages.flush();
const canvas=create('canvas');canvas.width=1200;canvas.height=260;const ctx=canvas.getContext('2d');ctx.fillStyle='#dccaff';ctx.font='bold 130px sans-serif';ctx.fillText('ANIDECK',200,180);const png=canvas.toDataURL('image/png');
globalThis.AniZip={get:async()=>{metadataReads++;if(stage==='warm')throw Error('Warm logo must not rediscover artwork');return {logos:[png]};}};
document.querySelector('.hero-text').innerHTML=logoHeading('Artwork retention fixture',42,'Artwork retention fixture');showLogo(document.querySelector('h1'),42,2,'Artwork retention fixture');
for(let i=0;i<200&&!document.querySelector('.hero-logo.ready')?.naturalWidth;i++)await new Promise(r=>setTimeout(r,10));
const img=document.querySelector('.hero-logo.ready');if(!img?.naturalWidth)throw Error('Logo did not render');await TitleArtwork.flush();
return {stage,hydrationMs,metadataReads,canvasReads,measurementLoads,imageSizes,rendered:true,caption:document.querySelector('.logo-english').textContent,naturalWidth:img.naturalWidth};
}.toString()+')('+JSON.stringify(stage)+')');
if(stage==='warm'&&(result.metadataReads!==0||result.canvasReads!==0||result.measurementLoads!==0))throw Error('Warm launch repeated logo work');
const row=source.split('\\n').find(line=>line.includes('id="clear-title-artwork"'))?.trim();if(!row)throw Error('Cache controls missing');
await win.webContents.executeJavaScript('document.body.insertAdjacentHTML("beforeend",'+JSON.stringify('<section class="page"><div class="set-card">'+row+'</div></section>')+');');
if(stage==='warm'){
const bind=source.slice(source.indexOf("    const clearArtwork=$('#clear-title-artwork');"),source.indexOf('    bindSettingInputs();',source.indexOf("    const clearArtwork=$('#clear-title-artwork');")));
await win.webContents.executeJavaScript('const $=s=>document.querySelector(s);let notice="";const toast=s=>notice=s;'+bind+';void 0;');
result.clearVerified=await win.webContents.executeJavaScript('(async()=>{await document.querySelector("#clear-title-artwork").onclick();return TitleArtwork.rows.size===0&&ArtworkImages.rows.size===0&&titleLogoCache.size===0&&notice==="Saved artwork cleared"&&!document.querySelector("#clear-title-artwork").disabled;})()');if(!result.clearVerified)throw Error('Clear artwork control failed');}
await new Promise(resolve=>setTimeout(resolve,500));
fs.writeFileSync(path.join(out,stage+'.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,stage+'.png'),(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify(result));win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
for(const stage of ['cold','warm']){const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs'),'--'+stage],{env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');if(result.status!==0){process.stderr.write(result.stderr||String(result.error||'Probe failed'));process.exit(1);}}
console.log('Isolated native artwork retention/restart passed');
