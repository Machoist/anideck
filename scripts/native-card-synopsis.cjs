// Exercise the real hover controller and retry events with generated public catalog responses.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output]=process.argv.slice(2);if(!output)throw Error('Usage: node scripts/native-card-synopsis.cjs electron app-root output');
const root=path.resolve(appRoot),out=path.resolve(output),dir=fs.mkdtempSync(path.join(path.resolve('..'),'anideck-story-'));fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));const root=${JSON.stringify(root)},out=${JSON.stringify(out)},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
const win=new BrowserWindow({show:false,width:900,height:700,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});win.webContents.on('paint',()=>{});
await win.loadURL('data:text/html,<html><body style="padding:32px"><main id="main"><h1>Home</h1></main></body></html>');const js=s=>win.webContents.executeJavaScript(s);
await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+fs.readFileSync(path.join(root,'src/title-actions.css'),'utf8'));
await js('('+function(){
 globalThis.App={renderId:1,stale:id=>id!==App.renderId};globalThis.fail=true;globalThis.calls=0;
 globalThis.AniList={details:async()=>{calls++;if(fail)throw Error('Temporary catalog outage');return {id:42,synopsis:'A young explorer discovers a hidden city, where an unlikely friendship changes the course of her journey.',format:'TV',year:'2026',episodes:12};},kitsuIdFor:async()=>null};globalThis.Kitsu={};globalThis.AniZip={get:async()=>null};globalThis.esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
 globalThis.IntersectionObserver=undefined;globalThis.MutationObserver=undefined;
 document.querySelector('#main').insertAdjacentHTML('beforeend','<article class="card ta-card" data-act="anime" data-id="al:42" tabindex="0" style="width:220px"><div class="poster" style="aspect-ratio:2/3;background:linear-gradient(135deg,slateblue,midnightblue)"></div><div class="card-title">Generated adventure</div></article>');
}.toString()+')();void 0;');
await js(fs.readFileSync(path.join(root,'src/synopsis.js'),'utf8')+';void 0;');await js(fs.readFileSync(path.join(root,'src/card-synopsis.js'),'utf8')+';void 0;');
await js('globalThis.card=document.querySelector(".card");CardSynopsis.activeCard=card;CardSynopsis.show(card)');
if(!await js('!!card.querySelector(".card-story-retry")&&!card.textContent.includes("isn’t available")'))throw Error('Temporary failure has no retry');await wait(150);fs.writeFileSync(path.join(out,'retry.png'),(await win.webContents.capturePage()).toPNG());
await js('fail=false;card.querySelector(".card-story-retry").click();void 0;');await wait(100);
if(!await js('card.textContent.includes("young explorer")&&!card.querySelector(".card-story-retry")&&CardSynopsis.activeCard===card'))throw Error('Retry did not recover while still hovered');
const recoveredCalls=await js('calls');await js('CardSynopsis.show(card)');if(await js('calls')!==recoveredCalls)throw Error('Successful synopsis cache lost');
await wait(250);fs.writeFileSync(path.join(out,'recovered.png'),(await win.webContents.capturePage()).toPNG());
await js('CardSynopsis.cache.clear();AniList.details=()=>new Promise(resolve=>globalThis.release=resolve);globalThis.pending=CardSynopsis.show(card);CardSynopsis.activeCard=null;CardSynopsis.collapse(card);release({synopsis:"A late plot that must not reopen the hover."});pending');
if(await js('card.classList.contains("story-active")||card.textContent.includes("late plot")'))throw Error('Late result reopened hover');
console.log('Native synopsis retry check passed');win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:25000});process.stdout.write(result.stdout||'');if(result.status!==0||!result.stdout?.includes('Native synopsis retry check passed')){process.stderr.write(result.stderr||String(result.error));process.exit(1);}
