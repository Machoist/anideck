/* Actual player markup/controller/CSS; generated rows, isolated profile, no accounts. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [binary,appRoot,output]=process.argv.slice(2);if(!binary||!appRoot||!output)throw Error('Usage: node scripts/native-player-drawer.cjs electron.exe app-root output');
const dir=fs.mkdtempSync(path.join(path.resolve('../'),'anideck-drawer-')),root=path.resolve(appRoot),out=path.resolve(output);fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(dir,'probe.cjs'),`
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',path.join(__dirname,'device'));app.setPath('sessionData',path.join(__dirname,'device'));
const root=${JSON.stringify(root)},out=${JSON.stringify(out)},wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{try{
const win=new BrowserWindow({show:false,width:1360,height:860,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});win.webContents.on('paint',()=>{});win.webContents.setFrameRate(60);
win.webContents.debugger.attach('1.3');const media=value=>win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value}]});
const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8'),start=html.indexOf('<section id="player"'),end=html.indexOf('<div id="modal"',start);if(start<0||end<0)throw Error('Missing player markup');
console.log('drawer fixture loading');await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html><body>'+html.slice(start,end)+'</body></html>'));
await media('no-preference');await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles.css'),'utf8')+fs.readFileSync(path.join(root,'src/player-drawer.css'),'utf8'));
await win.webContents.executeJavaScript('const App={settings:{}};void 0;');await win.webContents.executeJavaScript(fs.readFileSync(path.join(root,'src/player.js'),'utf8')+';void 0;');
await win.webContents.executeJavaScript('Player.el=document.querySelector("#player");Player.video=document.querySelector("#video");Player.el.hidden=false;Player.wake=()=>{};Player.renderDrawer=()=>{document.querySelector("#p-drawer-title").innerHTML="<span class=d-show>Generated playback fixture</span><span class=d-heading>Episodes <em>6 episodes</em></span>";document.querySelector("#p-drawer-list").innerHTML=Array.from({length:6},(_,i)=>"<button class=d-ep><span class=d-thumb style=background:#48405e></span><span class=d-text><b>Episode "+(i+1)+"</b><small>24 min</small></span></button>").join("")};void 0;');
console.log('drawer fixture loaded');const js=code=>win.webContents.executeJavaScript(code),states=[];
const sample=async name=>{const value=await js('(()=>{const d=document.querySelector("#p-drawer"),s=getComputedStyle(d),m=new DOMMatrixReadOnly(s.transform),r=d.getBoundingClientRect(),p=Player.el.getBoundingClientRect();return {scale:m.a,opacity:Number(s.opacity),visibility:s.visibility,pointer:s.pointerEvents,inert:d.inert,expanded:document.querySelector("#p-eps-btn").getAttribute("aria-expanded"),duration:s.transitionDuration,inside:r.left>=p.left&&r.right<=p.right+1&&r.top>=p.top&&r.bottom<=p.bottom+1}})()');states.push({name,...value});return value;};
const expect=(ok,message)=>{if(!ok)throw Error(message+' '+JSON.stringify(states));},capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
await wait(220);await sample('closed');await js('Player.toggleDrawer();void 0;');let v=await sample('open immediate');expect(!v.inert&&v.expanded==='true'&&v.pointer==='auto','Opening delayed interaction');
await wait(65);v=await sample('opening');expect(v.scale>.94&&v.scale<1.03&&v.opacity>0&&v.opacity<1,'No intermediate opening frame');await capture('opening');
await wait(320);v=await sample('open');expect(v.scale===1&&v.opacity===1&&v.inside,'Open panel not settled/contained');await capture('open');
await js('Player.closeDrawer();void 0;');v=await sample('close immediate');expect(v.inert&&v.pointer==='none'&&v.expanded==='false','Closing panel remained interactive');await wait(65);v=await sample('closing');expect(v.opacity>0&&v.opacity<1,'No intermediate closing frame');await wait(220);v=await sample('closed settled');expect(v.visibility==='hidden'&&v.opacity===0,'Panel did not close');
await js('Player.toggleDrawer();void 0;');await wait(40);await js('Player.closeDrawer();void 0;');await wait(40);await js('Player.toggleDrawer();void 0;');await wait(350);v=await sample('rapid reopen');expect(v.scale===1&&v.opacity===1&&!v.inert,'Rapid reopen failed');
await js('Player.closeDrawer();document.body.classList.add("reduce-motion");Player.toggleDrawer();void 0;');v=await sample('app reduced motion');expect(v.duration==='0s'&&v.scale===1&&v.opacity===1,'App reduced motion animated');
await js('Player.closeDrawer();document.body.classList.remove("reduce-motion");void 0;');await media('reduce');await js('Player.toggleDrawer();void 0;');v=await sample('OS reduced motion');expect(v.duration==='0s'&&v.scale===1&&v.opacity===1,'OS reduced motion animated');
win.setContentSize(400,700);await wait(100);v=await sample('narrow');expect(v.inside,'Narrow drawer overflowed');await capture('narrow');
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(states,null,2));console.log('Native player drawer check passed');win.destroy();app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const result=spawnSync(path.resolve(binary),[path.join(dir,'probe.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:45000});process.stdout.write(result.stdout||'');if(result.status!==0||!result.stdout?.includes('Native player drawer check passed')){process.stderr.write(result.stderr||String(result.error));process.exit(1);}
