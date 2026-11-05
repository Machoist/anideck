/* Controlled return-to-Home comparison; actual carousel/logo controller and generated artwork. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output,baselineFile]=process.argv.slice(2);if(!output)throw Error('Usage: node scripts/native-spotlight-return.cjs electron.exe app-root output [baseline-app.js]');
const root=path.resolve(appRoot),out=path.resolve(output),dir=fs.mkdtempSync(path.join(path.resolve('..'),'anideck-spotlight-'));fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));const root=${JSON.stringify(root)},out=${JSON.stringify(out)},baseline=${JSON.stringify(baselineFile?path.resolve(baselineFile):null)};
app.whenReady().then(async()=>{try{
const win=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});win.webContents.on('paint',()=>{});win.webContents.setFrameRate(60);await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html><body><main id="main" style="padding:24px"></main><section id="player" hidden></section></body></html>'));
await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+fs.readFileSync(path.join(root,'src/brand.css'),'utf8'));const js=code=>win.webContents.executeJavaScript(code),source=fs.readFileSync(baseline||path.join(root,'src/app.js'),'utf8');
await js('('+function(){
 globalThis.$=s=>document.querySelector(s);globalThis.esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');globalThis.owner='generated';globalThis.HomeReads={scope:()=>owner};globalThis.Jellyfin={};
 globalThis.App={renderId:1,carouselTimer:null,libIndex:{find:()=>null},stale(id){return id!==this.renderId;}};globalThis.Requests={enabled:()=>false};globalThis.QueueRecovery={schedule(){}};globalThis.bindYourNext=()=>{};globalThis.bindWeek=()=>{};globalThis.enhanceMosaic=async()=>{};globalThis.spotlightDuration=()=>4800;globalThis.seasonNumberIn=()=>0;
 globalThis.AniList={detailsCache:{},idCache:{one:101,two:202},details:async()=>null};globalThis.logoURL='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="150"><text x="10" y="105" fill="white" font-size="80">ANI DECK</text></svg>');
 globalThis.AniZip={get:async()=>({logos:[logoURL]}),clearlogos:async()=>[]};globalThis.trimLogo=async url=>({url,ratio:4});globalThis.TitleArtwork={remember(){}};globalThis.Trakt={fanartFor:async()=>[]};globalThis.observers=[];globalThis.IntersectionObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.stopped=true;}};
 globalThis.phase='cold';globalThis.reads={cold:0,warm:0};globalThis.art=i=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="800"><rect width="2400" height="800" fill="'+(i===0?'#353057':'#23465c')+'"/><circle cx="1750" cy="280" r="240" fill="#8273ab"/><text x="1150" y="700" fill="white" font-size="60">Generated Spotlight '+(i+1)+'</text></svg>');
 globalThis.ArtworkImages={measure:async u=>{reads[phase]++;await new Promise(resolve=>setTimeout(resolve,phase==='warm'?650:u===art(0)?40:700));return {u,w:2400,h:800};},forget(){}};
}.toString()+')();const titleLogoCache=new Map();void 0;');
await js(fs.readFileSync(path.join(root,'src/spotlight-art.js'),'utf8')+';void 0;');
let a=source.indexOf('function titleArtworkId('),b=source.indexOf('// Hovering a title',a);await js(source.slice(a,b)+';void 0;');
a=source.indexOf('function carouselArtworkScore(');b=source.indexOf('// Schedule "My shows"',a);await js(source.slice(a,b)+';void 0;');
a=source.indexOf('function firstUsableArtwork(');b=source.indexOf('const HomeReads=',a);await js(source.slice(a,b)+';void 0;');
a=source.indexOf('  async homeAfter(');b=source.indexOf('  async library(',a);await js('globalThis.homeAfter=({'+source.slice(a,b).trim()+'}).homeAfter;void 0;');
await js('('+function(){
 globalThis.mount=()=>{const data=['one','two'].map((id,i)=>({kind:'anime',a:{id,title:'Spotlight '+(i+1),titles:[],poster:'',synopsis:'Generated title synopsis',subtype:'TV',year:2026,episodes:12},srcs:[art(i)]}));document.querySelector('#main').innerHTML='<div class="spot-wrap"><section class="hero-carousel" id="carousel">'+data.map((sl,i)=>heroSlide(sl,i)).join('')+'<div class="car-nav"><button data-car="-1">Back</button><div class="car-dots"></div><button data-car="1">Next</button></div></section></div><h2>Trending now</h2>';};mount();globalThis.work=homeAfter({},1);}.toString()+')();void 0;');
await js('work;void 0;'); // executeJavaScript must await the work explicitly below.
await js('work.then(()=>true)');
const cold=await js('({logoLoaded:!!document.querySelector(".slide.on .hero-logo.ready"),reads:reads.cold})');
await js('globalThis.oldCar=document.querySelector("#carousel");App.renderId=2;clearInterval(App.carouselTimer);document.querySelector("#main").innerHTML="<h1>Generated title page</h1>";phase="warm";void 0;');
await new Promise(r=>setTimeout(r,30));await js('App.renderId=3;mount();globalThis.work=homeAfter({},3);void 0;');await new Promise(r=>setTimeout(r,30));
const warm=await js('(()=>{const car=document.querySelector("#carousel"),slide=car.querySelector(".slide.on"),image=slide.querySelector(".slide-img");return {loading:car.classList.contains("loading-art"),opacity:Number(getComputedStyle(slide).opacity),imageLoaded:image.complete&&image.naturalWidth>0,logoLoaded:!!slide.querySelector(".hero-logo.ready"),reads:reads.warm}})()');fs.writeFileSync(path.join(out,'warm.png'),(await win.webContents.capturePage()).toPNG());await js('work.then(()=>true)');
const lifetime=await js('(()=>{const current=App.carouselTimer;oldCar.onmouseleave?.();observers[0]?.fn([{isIntersecting:true}]);return {oldCallbacksKeptNewTimer:App.carouselTimer===current};})()');
if(!baseline&&(!warm.imageLoaded||warm.loading||warm.opacity<.95||!warm.logoLoaded||!cold.logoLoaded||!lifetime.oldCallbacksKeptNewTimer))throw Error('Return-to-Home failed '+JSON.stringify({cold,warm,lifetime}));
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline:!!baseline,cold,warm,lifetime},null,2));console.log('Native Spotlight return check passed '+JSON.stringify({cold,warm,lifetime}));win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:20000});process.stdout.write(result.stdout||'');if(result.status!==0||!result.stdout?.includes('Native Spotlight return check passed')){process.stderr.write(result.stderr||String(result.error));process.exit(1);}
