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
const canvas=create('canvas');canvas.width=1200;canvas.height=260;const ctx=canvas.getContext('2d');ctx.fillStyle='#dccaff';ctx.font='bold 130px sans-serif';ctx.fillText('ANIDECK',200,180);const png=canvas.toDataURL('image/png');
globalThis.AniZip={get:async()=>{metadataReads++;if(stage==='warm')throw Error('Warm logo must not rediscover artwork');return {logos:[png]};}};
document.querySelector('.hero-text').innerHTML=logoHeading('Artwork retention fixture',42,'Artwork retention fixture');showLogo(document.querySelector('h1'),42,2,'Artwork retention fixture');
for(let i=0;i<200&&!document.querySelector('.hero-logo.ready')?.naturalWidth;i++)await new Promise(r=>setTimeout(r,10));
const img=document.querySelector('.hero-logo.ready');if(!img?.naturalWidth)throw Error('Logo did not render');await TitleArtwork.flush();
return {stage,hydrationMs,metadataReads,canvasReads,rendered:true,caption:document.querySelector('.logo-english').textContent,naturalWidth:img.naturalWidth};
}.toString()+')('+JSON.stringify(stage)+')');
if(stage==='warm'&&(result.metadataReads!==0||result.canvasReads!==0))throw Error('Warm launch repeated logo work');
fs.writeFileSync(path.join(out,stage+'.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,stage+'.png'),(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify(result));win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
for(const stage of ['cold','warm']){const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs'),'--'+stage],{env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');if(result.status!==0){process.stderr.write(result.stderr||String(result.error||'Probe failed'));process.exit(1);}}
console.log('Isolated native artwork retention/restart passed');
