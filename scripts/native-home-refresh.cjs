/* Compare actual navigation/scheduler code with and without scoped Home updates.
 * Generated catalog/delays, isolated profile; never opens a real account.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output]=process.argv.slice(2);if(!binary||!appRoot||!output)throw Error('Usage: node scripts/native-home-refresh.cjs electron.exe app-root output');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anideck-home-trace-')),root=path.resolve(appRoot),out=path.resolve(output);fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));app.on('window-all-closed',()=>{});
const root=${JSON.stringify(root)},out=${JSON.stringify(out)};
app.whenReady().then(async()=>{try{const source=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
for(const mode of ['baseline','scoped']){
const win=new BrowserWindow({width:1360,height:860,show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}});win.webContents.on('paint',()=>{});win.webContents.setFrameRate(60);
await win.loadURL('data:text/html,<html><body><button id="tb-back"></button><div id="main"></div><div id="player" hidden></div></body></html>');
await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+'body{background:#17151e}#main{height:800px;overflow:auto;overflow-anchor:none}.trace-hero{height:220px;padding:20px}.trace-row{padding:20px}.trace-row img{width:100px;height:150px}.trace-row .rail{grid-auto-columns:110px;gap:12px}.late{height:100px;padding:20px}');
const navStart=source.indexOf('  nav(view, params ='),navEnd=source.indexOf('  // Re-draws the current page',navStart),nav=source.slice(navStart,navEnd).trim().replace(/^nav\\(/,'function(').replace(/,\\s*$/,'');
const readStart=source.indexOf('const HomeReads='),readEnd=source.indexOf('const Views = {',readStart);
await win.webContents.executeJavaScript('const $=s=>document.querySelector(s);const queueScope=()=>"fixture";const Cloud={ident:()=>"fixture"};const showTint=()=>{};const setWindowTitle=()=>{};const updateRailArrows=()=>{};const bindWeek=()=>{};const enhanceMosaic=()=>{};const App={view:null,params:{},history:[],selected:new Set(),renderId:0,settings:{},closeEpMenu(){},clearSelection(){},markNav(){},mountPageShortcuts(){},stale(id){return this.renderId!==id},refresh(){return this.nav(this.view,this.params,false,true)}};const Views={};'+source.slice(readStart,readEnd)+';App.nav='+nav+';void 0;');
if(mode==='scoped')await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/home-refresh.js'),'utf8'));
const result=await win.webContents.executeJavaScript('('+async function(mode){
const root=document.querySelector('#main'),frames=[],longTasks=[];let last=performance.now(),running=true,removedImages=0,afterCalls=0,release;
const sample=()=>{const now=performance.now();frames.push(now-last);last=now;if(running)requestAnimationFrame(sample);};requestAnimationFrame(sample);
const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({entryTypes:['longtask']});
new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node.nodeType===1)removedImages+=(node.tagName==='IMG'?1:0)+node.querySelectorAll('img').length;}).observe(root,{childList:true,subtree:true});
const canvas=document.createElement('canvas');canvas.width=100;canvas.height=150;const x=canvas.getContext('2d');x.fillStyle='#59446e';x.fillRect(0,0,100,150);const png=canvas.toDataURL(),posters=Array.from({length:32},(_,i)=>'<button class="card"><img decoding="async" src="'+png+'"><b>Title '+i+'</b></button>').join('');
const hero='<div class="home-slot" data-home-slot="hero"><section class="trace-hero" id="yn"><h1>Home update trace</h1><button id="selected-show">Selected show</button><img width="80" height="120" src="'+png+'"></section></div>';
const shelves=Array.from({length:6},(_,i)=>'<div class="home-slot" data-home-slot="shelf'+i+'"><section class="trace-row"><h2>Shelf '+i+'</h2><div class="rail">'+posters+'</div></section></div>').join('');
HomeReads.budgetMs=5;Views.home=async(_p,rid)=>{const batch=HomeReads.begin(rid),late=await HomeReads.read(batch,'late',()=>new Promise(resolve=>release=resolve),false);return hero+'<div class="home-rows"><div class="home-slot" data-home-slot="late">'+(late?'<section class="late">Late catalog response</section>':'')+'</div>'+shelves+'</div>';};Views.homeAfter=()=>afterCalls++;
const start=performance.now();await App.nav('home');const firstPaintMs=performance.now()-start;await new Promise(r=>setTimeout(r,150));
const originalHero=document.querySelector('#yn'),originalImage=originalHero.querySelector('img'),rail=document.querySelector('.rail'),focus=document.querySelector('#selected-show');originalHero.dataset.selection='2';rail.scrollLeft=240;root.scrollTop=300;focus.focus({preventScroll:true});const stable=document.querySelector('[data-home-slot="shelf0"] section'),before=stable.getBoundingClientRect().top,initialRender=App.renderId;
release(true);for(let n=0;n<150&&!root.querySelector('.late');n++)await new Promise(r=>setTimeout(r,10));await new Promise(r=>setTimeout(r,200));running=false;observer.disconnect();
const sameHero=document.querySelector('#yn')===originalHero,sameRail=document.querySelector('.rail')===rail;
return {mode,firstPaintMs,renderIdDelta:App.renderId-initialRender,removedImages,afterCalls,sameHero,sameImage:document.querySelector('#yn img')===originalImage,sameRail,horizontalScrollPreserved:document.querySelector('.rail').scrollLeft===240,focusPreserved:document.activeElement===focus,selectedShowPreserved:document.querySelector('#yn').dataset.selection==='2',lateVisible:!!root.querySelector('.late'),anchorShift:Math.abs(document.querySelector('[data-home-slot="shelf0"] section').getBoundingClientRect().top-before),longTasks:longTasks.length,longTaskMs:longTasks.reduce((a,b)=>a+b,0),largestFrameGapMs:Math.max(...frames)};
}.toString()+')('+JSON.stringify(mode)+')');
if(!result.lateVisible)throw Error('Delayed data did not appear');if(mode==='baseline'&&(result.sameHero||result.removedImages===0))throw Error('Baseline did not reproduce whole-page replacement');
if(mode==='scoped'&&(!result.sameHero||!result.sameImage||!result.sameRail||!result.horizontalScrollPreserved||!result.focusPreserved||!result.selectedShowPreserved||result.removedImages!==0||result.renderIdDelta!==0||result.anchorShift>1))throw Error('Scoped refresh regression: '+JSON.stringify(result));
fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,mode+'.png'),(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify(result));win.destroy();}
app.exit(0);}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');if(result.status!==0||!result.stdout?.includes('\"mode\":\"scoped\"')){process.stderr.write(result.stderr||String(result.error||'Scoped case did not complete'));process.exit(1);}console.log('Native Home background-refresh comparison passed');
