// Isolated real Chromium DOM test. Generated episode flags; no installed account reads/writes.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output]=process.argv.slice(2);if(!output)throw Error('Usage: node scripts/native-filler.cjs electron app-root output');
const root=path.resolve(appRoot),out=path.resolve(output),dir=fs.mkdtempSync(path.join(path.resolve('..'),'anideck-filler-'));fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));const root=${JSON.stringify(root)},out=${JSON.stringify(out)};
app.whenReady().then(async()=>{try{
const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});win.webContents.on('paint',()=>{});
await win.loadURL('data:text/html,<html><body style="padding:32px"><main id="main"><section class="detail-main"><h1>Episodes</h1><div class="ep-list"></div></section></main></body></html>');
await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+fs.readFileSync(path.join(root,'src/filler.css'),'utf8'));
const js=s=>win.webContents.executeJavaScript(s);
await js('globalThis.App={renderId:1,settings:{episodeFiller:{10:{indicators:true,hide:true}}},saveSettings:async()=>{},stale:n=>n!==App.renderId};globalThis.AniZip={get:async()=>({malId:20,kitsu:10})};globalThis.Kitsu={};globalThis.calls=0;globalThis.http=async()=>{calls++;return {data:[{mal_id:26,filler:true},{mal_id:27,recap:true},{mal_id:28,filler:false}]}};void 0;');
await js(fs.readFileSync(path.join(root,'src/filler.js'),'utf8')+';void 0;');
// UI fixture classifications only. Live source/identity validation is covered by native-filler-network.cjs.
await js('FillerEpisodes.read=async()=>{const rows=new Map([[26,{classification:"filler",source:"Fixture",sourceUrl:"https://example.org/26"}],[27,{classification:"recap",source:"Fixture",sourceUrl:"https://example.org/27"}],[28,{classification:"anime-canon",source:"Fixture",sourceUrl:"https://example.org/28"}],[29,{classification:"mixed",source:"Fixture",sourceUrl:"https://example.org/29"}]]);rows.guideReady=true;return rows;};void 0;');
await js('('+function(){globalThis.seed=numbers=>{const panel=document.querySelector('.detail-main');panel.innerHTML='<h1>Episodes</h1><button class="link-btn ep-sort">Oldest first</button><div class="ep-list"></div>';const list=panel.querySelector('.ep-list');for(const n of numbers){const row=document.createElement('article');row.className='ep';row.dataset.num=n;row.innerHTML='<button class="card"><div class="thumb" style="height:100px;background:linear-gradient(135deg,#343047,#191723)"><span class="ep-badge">✓</span>Generated preview</div></button><div class="ep-info"><div class="ep-num">Episode '+n+'</div><div class="ep-title">Generated episode '+n+'</div></div>';list.append(row);}};seed([26,27,28,29]);}.toString()+')();void 0;');
await js('FillerEpisodes.mount({id:10,al:{id:30,malId:20},total:220,kitsuTotal:220},1)');
const first=await js('(()=>{const rows=[...document.querySelectorAll(".ep")];return {numbers:rows.map(x=>Number(x.dataset.num)),hidden:rows.map(x=>x.hidden),labels:[...document.querySelectorAll(".episode-classification")].map(x=>x.textContent),calls}})()');
if(JSON.stringify(first.hidden)!=='[true,false,false,false]'||JSON.stringify(first.numbers)!=='[26,27,28,29]'||JSON.stringify(first.labels)!=='["Filler"]')throw Error(JSON.stringify(first));
if(await js('!!document.querySelector(".filler-poster-tag")'))throw Error('Duplicate poster badge');await js('document.querySelector("[data-filler=hide]").click();void 0;');
if(await js('[...document.querySelectorAll(".ep")].some(x=>x.hidden)'))throw Error('Show all failed');
await js('document.querySelector("[data-filler=indicators]").onclick()');
if(await js('!!document.querySelector(".episode-classification")'))throw Error('Labels did not turn off');
await js('seed([26,27,28,29]);FillerEpisodes.mount({id:11},1)');
if(!await js('document.querySelector("[data-filler=indicators]").getAttribute("aria-pressed")==="true"&&document.querySelector("[data-filler=hide]").getAttribute("aria-pressed")==="false"'))throw Error('Choices leaked to another title');
await js('seed([26,27,28,29]);FillerEpisodes.mount({id:10,al:{id:30},total:220,kitsuTotal:220},1)');
if(!await js('document.querySelector("[data-filler=indicators]").getAttribute("aria-pressed")==="false"&&document.querySelector("[data-filler=hide]").getAttribute("aria-pressed")==="false"'))throw Error('Title choices not retained');
await js('document.querySelector("[data-filler=indicators]").onclick()');
await new Promise(r=>setTimeout(r,350));fs.writeFileSync(path.join(out,'episodes-wide.png'),(await win.webContents.capturePage()).toPNG());win.setContentSize(480,800);
await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(out,'episodes-narrow.png'),(await win.webContents.capturePage()).toPNG());
await js('App.settings.episodeFiller[10].hide=true;seed([26]);FillerEpisodes.mount({id:10,al:{id:30},total:220,kitsuTotal:220},1)');
if(!await js('!!document.querySelector(".filler-empty")'))throw Error('All hidden recovery missing');
await js('document.querySelector("[data-filler=hide]").click();void 0;');
if(await js('!!document.querySelector(".filler-empty")||document.querySelector(".ep").hidden'))throw Error('All hidden recovery failed');
await js('seed([101]);FillerEpisodes.read=async()=>new Map();FillerEpisodes.mount({id:10,al:{id:30},total:220,kitsuTotal:220},1)');
if(!await js('document.querySelector(".filler-tools").textContent.includes("unavailable")&&!document.querySelector(".ep").hidden'))throw Error('Offline behavior failed');
await js('seed([26]);globalThis.release=null;FillerEpisodes.read=()=>new Promise(r=>release=r);globalThis.pending=FillerEpisodes.mount({id:10,al:{id:30}},1);App.renderId=2;release(new Map([[26,{classification:"filler"}]]));pending');
if(await js('document.querySelector(".ep").hidden'))throw Error('Stale page changed');
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({first,showAll:true,allHiddenRecovery:true,offlineVisible:true,staleGuard:true},null,2));console.log('Native filler check passed');win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:30000});process.stdout.write(result.stdout||'');if(result.status!==0||!result.stdout?.includes('Native filler check passed')){process.stderr.write(result.stderr||String(result.error));process.exit(1);}
