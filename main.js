require('./src/logging-pipe.cjs').guardLoggingPipes(process.stdout,process.stderr);
// AniDeck - main process
// Owns the window, saved settings, encrypted logins, and all network calls
// (so the app never runs into CORS problems with Kitsu, Jellyfin or Discord).

const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, net, session, dialog } = require('electron');

// Look like a normal Chrome browser. Sites behind Cloudflare (like Kitsu) block
// requests that identify as Node or Electron.
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = CHROME_UA;
if (process.platform === 'win32') app.setAppUserModelId('com.machoist.anishelf'); // needed for Windows notifications
const path = require('path');
const fs = require('fs');
const os = require('os');

// Rebranding must not orphan existing settings, encrypted tokens or browser sessions.
// The original installation used %APPDATA%/AniShelf; new installations use AniDeck.
const smokeTest = !!require('./package.json').testBuild && process.argv.includes('--anideck-smoke-test');
const legacyProfile = path.join(app.getPath('appData'), 'AniShelf');
if (smokeTest) {
  const isolatedProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'anideck-smoke-'));
  app.setPath('userData', isolatedProfile);
  app.setPath('sessionData', isolatedProfile);
} else if (fs.existsSync(legacyProfile)) {
  app.setPath('userData', legacyProfile);
  app.setPath('sessionData', legacyProfile);
}

// Public installers use a dedicated configuration; the developer's config is never packaged.
const CONFIG_FILE = app.isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(__dirname, 'config.json');
const dataDir = () => app.getPath('userData');
const STORE_FILE = () => path.join(dataDir(), 'store.json');
const SECRETS_FILE = () => path.join(dataDir(), 'secrets.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

// ---------- plain settings store ----------
let store = null;
const getStore = () => (store ??= readJson(STORE_FILE(), {}));
const saveStore = () => writeJson(STORE_FILE(), getStore());

// ---------- encrypted secrets (login tokens) ----------
function readSecrets() {
  const raw = readJson(SECRETS_FILE(), {});
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    try {
      out[k] = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(v, 'base64'))
        : Buffer.from(v, 'base64').toString('utf8');
    } catch { /* unreadable entry, skip */ }
  }
  return out;
}
function writeSecret(key, value) {
  const raw = readJson(SECRETS_FILE(), {});
  if (value === null || value === undefined) delete raw[key];
  else {
    raw[key] = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(String(value)).toString('base64')
      : Buffer.from(String(value)).toString('base64');
  }
  writeJson(SECRETS_FILE(), raw);
}

// ---------- window ----------
let mainWin = null; // the app window (hidden helper windows for streams are separate)
function createWindow() {
  const bounds = getStore().windowBounds || { width: 1360, height: 860 };
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0f0e14',
    show: false, // shown once the loading screen has drawn (no white flash)
    icon: path.join(__dirname, 'build', 'icon.png'),
    title: 'AniDeck',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !smokeTest,
      offscreen: smokeTest,
    },
  });
  mainWin = win;
  if(smokeTest){win.webContents.on('paint',()=>{});win.webContents.setFrameRate(30);}
  win.once('ready-to-show', () => { if(smokeTest)return;if (getStore().windowMaximized) win.maximize(); win.show(); win.webContents.send('window:shown'); });

  const remember = () => {
    if (win.isDestroyed()) return;
    getStore().windowMaximized = win.isMaximized();
    if (!win.isMaximized() && !win.isFullScreen()) getStore().windowBounds = win.getBounds();
    saveStore();
  };
  win.on('resized', remember);
  win.on('moved', remember);
  win.on('close', remember);
  win.on('closed', () => app.quit()); // also closes hidden helper windows

  // Links open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });

  // No DevTools in release builds: swallow the shortcuts, and close them if they open some other way.
  if (app.isPackaged) {
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const k = input.key.toLowerCase();
      if (k === 'f12' || ((input.control || input.meta) && input.shift && ['i', 'j', 'c'].includes(k))) e.preventDefault();
    });
  }

  // StreamResolver owns onBeforeSendHeaders so captured player headers reach playback.

  // Jellyfin image URLs carry no image tag, so the server doesn't say they can be cached and every poster would
  // download again on each visit. Keep them for 3 days (art rarely changes; Refresh still reloads the page data).
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    if (details.resourceType === 'image' && /\/Items\/[^/]+\/Images\//i.test(details.url) && details.statusCode === 200) {
      const headers = { ...details.responseHeaders };
      for (const k of Object.keys(headers)) if (/^(cache-control|pragma|expires)$/i.test(k)) delete headers[k];
      headers['Cache-Control'] = ['public, max-age=259200'];
      return callback({ responseHeaders: headers });
    }
    callback({});
  });

  if (smokeTest) win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async()=>{
        const deadline=Date.now()+15000;
        while(document.querySelector('#login')?.hidden!==false){if(Date.now()>deadline)throw Error('Fresh-profile login screen did not appear');await new Promise(resolve=>setTimeout(resolve,50));}
        return {version:await window.native.version(),testBuild:(await window.native.config()).testBuild,main:!!document.querySelector('#main'),loginVisible:!document.querySelector('#login').hidden,shellHidden:document.querySelector('#shell').hidden,signedOut:!Tracker.loggedIn()&&!Jellyfin.connected()&&!AniList.loggedIn()&&!Kitsu.loggedIn(),emptyLibrary:App.allItems.length===0,emptyServer:!Jellyfin.server,controls:typeof document.querySelector('#login-anilist').onclick==='function'&&typeof document.querySelector('#login-kitsu').onclick==='function',modules:typeof TitleActions==='object'&&typeof DeckUI==='object'&&typeof Friends==='object'};
      })()`);
      if (!result.main || !result.testBuild || result.version !== app.getVersion() || !result.loginVisible || !result.shellHidden || !result.signedOut || !result.emptyLibrary || !result.emptyServer || !result.controls || !result.modules) throw Error('Packaged fresh-profile smoke check failed: '+JSON.stringify(result));
      console.log('AniDeck fresh-profile checks: '+JSON.stringify(result));
      // Wake the hidden smoke window's compositor before timing real CSS animation.
      await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      win.webContents.send('window:shown');
      const visualArg=process.argv.find(arg=>arg.startsWith('--anideck-visuals='));
      const visualDir=visualArg?path.resolve(visualArg.slice('--anideck-visuals='.length)):null;
      if(visualDir){
        fs.mkdirSync(visualDir,{recursive:true});
        await new Promise(resolve=>setTimeout(resolve,100));
        const first=await win.webContents.executeJavaScript("({transform:getComputedStyle(document.querySelector('.splash-deal i')).transform,visible:!document.querySelector('#splash').hidden,reduced:!!App.settings.reduceMotion,windowsReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})");
        await new Promise(resolve=>setTimeout(resolve,300));
        const second=await win.webContents.executeJavaScript("({transform:getComputedStyle(document.querySelector('.splash-deal i')).transform,visible:!document.querySelector('#splash').hidden})");
        if(!first.visible||!second.visible||(!first.reduced&&first.transform===second.transform))throw Error('Launch animation did not advance across visible frames: '+JSON.stringify({first,second}));
        console.log('AniDeck launch animation: '+JSON.stringify({visible:true,advanced:first.transform!==second.transform,reducedMotion:first.reduced,windowsReducedMotion:first.windowsReducedMotion}));
        // Capturing a hidden native window may itself take longer than the short entrance.
        // Verify time advancement above, then hold only this isolated preview for capture.
        await win.webContents.executeJavaScript("splash('Opening your deck');splashReady=false;replaySplash();");
        await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
        await new Promise(resolve=>setTimeout(resolve,700));
        fs.writeFileSync(path.join(visualDir,'AniDeck-launch-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      }
      // Exercise the real guest/setup controls with cloud/catalog reads isolated.
      // Never create a backend profile or use an existing provider session in this test.
      const setup = await win.webContents.executeJavaScript(`(async()=>{
        Cloud.loadMe=async()=>null;Cloud.enabled=()=>true;Notifier.start=()=>{};
        clearTimeout(FriendSignals.timer);FriendSignals.tick=async()=>{};MessageRequests.check=async()=>{};
        App.refreshLibrary=async()=>App.buildNav();
        App.nav=async()=>{document.querySelector('#main').innerHTML='<div class="page">Isolated setup check</div>';};
        await App.continueLocally();
        const guestTracking=LocalTracker.loggedIn()&&Tracker.svc===LocalTracker&&!AniList.loggedIn()&&!Kitsu.loggedIn();
        const profileOffer=!!document.querySelector('#wf-join')&&!document.querySelector('#modal').hidden;
        if(!profileOffer)throw Error('Guest did not reach profile setup');
        document.querySelector('#wf-key-login').click();
        const keySignIn=!!document.querySelector('#ani-key-form')&&document.querySelector('#ani-key').type==='password';
        document.querySelector('#ani-key-cancel').click();
        document.querySelector('#wf-cancel').click();
        const skipPersists=!!(await window.native.get('anideckProfileIntro'))&&document.querySelector('#modal').hidden;
        const noRepeat=(await offerProfileIntro())===false;
        return {guestTracking,profileOffer,keySignIn,skipPersists,noRepeat};
      })()`);
      if(Object.values(setup).some(value=>value!==true))throw Error('Packaged setup flow check failed: '+JSON.stringify(setup));
      console.log('AniDeck isolated guest setup checks: '+JSON.stringify(setup));
      await win.webContents.executeJavaScript("HomeReads.active=null;App.renderId++;clearTimeout(App.spinTimer);clearTimeout(QueueRecovery.timer);");
      if(visualDir){
        const shortcutSizes=[],shortcutWindowSize=win.getContentSize(),shortcutMinimum=win.getMinimumSize();
        win.setMinimumSize(320,320);
        for(const [width,height] of [[1440,900],[640,760],[360,720]]){
          win.setContentSize(width,height);
          const shortcutSetup=await win.webContents.executeJavaScript("(async()=>{try{document.querySelector('#splash').hidden=true;App.closeModal();const main=document.querySelector('#main');main.innerHTML=await Views.mylist({tab:'current'});App.mountPageShortcuts(main);document.querySelector('#home-fab').hidden=false;document.querySelector('#page-back').hidden=false;return {ready:!!main.querySelector('.ml-title'),signedIn:Tracker.loggedIn()};}catch(error){return {error:error.stack||error.message};}})()");
          if(!shortcutSetup.ready)throw Error('My list shortcut setup failed: '+JSON.stringify(shortcutSetup));
          await new Promise(resolve=>setTimeout(resolve,450));
          const geometry=await win.webContents.executeJavaScript(`(()=>{const main=document.querySelector('#main'),title=document.querySelector('.ml-title'),buttons=[document.querySelector('#home-fab'),document.querySelector('#page-back')],rect=title.getBoundingClientRect();const clear=buttons.every(button=>button.getBoundingClientRect().bottom+8<=rect.top);const before=buttons[0].getBoundingClientRect().top;const spacer=document.createElement('div');spacer.style.height='1200px';main.append(spacer);main.scrollTop=180;const distance=main.scrollTop,after=buttons[0].getBoundingClientRect().top;const scrolls=distance>100&&Math.abs((before-after)-distance)<2;main.scrollTop=0;spacer.remove();return {clear,scrolls,viewportWidth:innerWidth,titleTop:rect.top,buttonBottom:Math.max(...buttons.map(button=>button.getBoundingClientRect().bottom))};})()`);
          if(!geometry.clear||!geometry.scrolls||geometry.viewportWidth!==width)throw Error('My list shortcuts overlap or do not scroll naturally: '+JSON.stringify({width,...geometry}));
          shortcutSizes.push({width,...geometry});
          fs.writeFileSync(path.join(visualDir,'AniDeck-mylist-shortcuts-'+width+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        }
        win.setMinimumSize(...shortcutMinimum);win.setContentSize(...shortcutWindowSize);
        console.log('AniDeck My list shortcut geometry: '+JSON.stringify(shortcutSizes));
      }
      if(visualDir){
        await win.webContents.executeJavaScript("(async()=>{document.querySelector('#splash').hidden=true;App.closeModal();document.querySelector('#main').innerHTML=await Views.settings();document.querySelector('#main').scrollTop=0;})()");
        await new Promise(resolve=>setTimeout(resolve,300));
        fs.writeFileSync(path.join(visualDir,'AniDeck-account-settings-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const releaseWindowSize=win.getContentSize(),releaseMinimum=win.getMinimumSize();
        win.setMinimumSize(320,400);
        await win.webContents.executeJavaScript(`(()=>{globalThis.releasePreviewBackup={update:App.update,open:App.openRelease,params:App.params,presented:ReleaseNotice.presented,latest:ReleaseNotice.latest};globalThis.releasePreviewOpens=0;App.openRelease=async()=>{releasePreviewOpens++;return true;};})()`);
        for(const width of [1360,360]){
          win.setContentSize(width,860);
          const releaseUI=await win.webContents.executeJavaScript(`(async()=>{
            const sample={state:'available',currentVersion:'1.0.0',version:'1.1.0',url:'https://github.com/Machoist/anideck/releases/tag/v1.1.0',autoCheck:false};
            App.closeModal();App.applyUpdate(sample);
            const player=document.querySelector('#player');player.hidden=false;const deferred=await ReleaseNotice.show(sample,{force:true})===false;player.hidden=true;
            await ReleaseNotice.show(sample,{force:true});
            const card=document.querySelector('#modal-card').getBoundingClientRect(),later=document.querySelector('#release-later').getBoundingClientRect(),view=document.querySelector('#release-view').getBoundingClientRect();
            return {width:innerWidth,deferred,contained:card.left>=0&&card.right<=innerWidth,buttonsFit:later.right<=view.left&&view.right<=card.right,manualCopy:document.querySelector('#modal-card').textContent.includes('GitHub'),noAutomaticOpen:releasePreviewOpens===0};
          })()`);
          if(releaseUI.width!==width||Object.entries(releaseUI).some(([key,value])=>key!=='width'&&value!==true))throw Error('Release prompt layout failed: '+JSON.stringify(releaseUI));
          console.log('AniDeck release prompt UI: '+JSON.stringify(releaseUI));
          await new Promise(resolve=>setTimeout(resolve,250));
          fs.writeFileSync(path.join(visualDir,'AniDeck-release-prompt-'+width+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          await win.webContents.executeJavaScript("document.querySelector('#release-later').click();");
        }
        win.setMinimumSize(...releaseMinimum);win.setContentSize(...releaseWindowSize);
        const releaseAbout=await win.webContents.executeJavaScript(`(async()=>{
          const sample={state:'available',currentVersion:'1.0.0',version:'1.1.0',url:'https://github.com/Machoist/anideck/releases/tag/v1.1.0',autoCheck:false};
          await ReleaseNotice.show(sample,{force:true});await document.querySelector('#release-view').onclick();
          App.params={section:'About'};document.querySelector('#main').innerHTML=await Views.settings();Views.settingsAfter();App.applyUpdate(sample);
          return {manualCheck:!!document.querySelector('#upd-check'),viewRelease:!document.querySelector('#upd-release').hidden,openedOnlyOnClick:releasePreviewOpens===1,closedAfterOpen:document.querySelector('#modal').hidden};
        })()`);
        if(Object.values(releaseAbout).some(value=>value!==true))throw Error('Release About controls failed: '+JSON.stringify(releaseAbout));
        console.log('AniDeck release About controls: '+JSON.stringify(releaseAbout));
        await new Promise(resolve=>setTimeout(resolve,250));
        fs.writeFileSync(path.join(visualDir,'AniDeck-release-about.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const barSize=win.getContentSize(),barMinimum=win.getMinimumSize();win.setMinimumSize(320,400);
        for(const width of [1360,360]){
          win.setContentSize(width,860);
          const bottomBar=await win.webContents.executeJavaScript(`(async()=>{
            App.closeModal();await window.native.set('releaseBarDismissedVersion',null);ReleaseNotice.barDismissed.clear();ReleaseNotice.noticeVersion=null;
            App.applyUpdate({state:'available',currentVersion:'1.0.0',version:'1.1.0',url:'https://github.com/Machoist/anideck/releases/tag/v1.1.0',autoCheck:false});await ReleaseNotice.refreshBar();
            const bar=document.querySelector('#release-bar'),r=bar.getBoundingClientRect(),main=document.querySelector('#main').getBoundingClientRect(),view=document.querySelector('#release-bar-view').getBoundingClientRect(),close=document.querySelector('#release-bar-close').getBoundingClientRect();
            const navigator=document.querySelector('#shell .topbar');navigator.classList.add('auto-reveal');const navRect=navigator.getBoundingClientRect(),navigatorClear=r.bottom<=navRect.top;
            const visible=!bar.hidden&&getComputedStyle(bar).display!=='none',reserved=main.top<8,contained=r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,actionsFit=view.right<=close.left;
            document.querySelector('#player').hidden=false;const hiddenDuringPlayback=getComputedStyle(bar).display==='none';document.querySelector('#player').hidden=true;
            const blocker=document.createElement('button');blocker.textContent='Profile action';blocker.style.cssText='position:fixed;right:20px;top:18px;width:120px;height:40px;z-index:40';document.querySelector('#main').appendChild(blocker);
            ReleaseNotice.place();const shifted=bar.getBoundingClientRect(),blocked=blocker.getBoundingClientRect(),avoidsControls=shifted.bottom<=blocked.top||shifted.top>=blocked.bottom||shifted.right<=blocked.left||shifted.left>=blocked.right;blocker.remove();ReleaseNotice.place();
            await document.querySelector('#release-bar-view').onclick();const opensPrompt=!document.querySelector('#modal').hidden,hiddenDuringDialog=getComputedStyle(bar).display==='none';App.closeModal();
            return {width:innerWidth,visible,reserved,contained,actionsFit,navigatorClear,avoidsControls,upperRight:r.top<30&&(innerWidth<600||r.left>innerWidth/2),dark:getComputedStyle(bar).backgroundColor==='rgb(32, 29, 41)',hiddenDuringPlayback,opensPrompt,hiddenDuringDialog};
          })()`);
          if(bottomBar.width!==width||Object.entries(bottomBar).some(([key,value])=>key!=='width'&&value!==true))throw Error('Upper-right release notice failed: '+JSON.stringify(bottomBar));
          console.log('AniDeck upper-right release notice: '+JSON.stringify(bottomBar));
          await new Promise(resolve=>setTimeout(resolve,250));
          fs.writeFileSync(path.join(visualDir,'AniDeck-corner-update-'+width+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          const dismissed=await win.webContents.executeJavaScript(`(async()=>{await document.querySelector('#release-bar-close').onclick();await ReleaseNotice.refreshBar();return document.querySelector('#release-bar').hidden&&(await window.native.get('releaseBarDismissedVersion'))==='1.1.0';})()`);
          if(!dismissed)throw Error('Bottom update dismissal was not retained');
        }
        win.setMinimumSize(...barMinimum);win.setContentSize(...barSize);
        await win.webContents.executeJavaScript("ReleaseNotice.barDismissed.clear();document.querySelector('#shell .topbar').classList.remove('auto-reveal');window.native.set('releaseBarDismissedVersion',null);");
        await win.webContents.executeJavaScript(`(async()=>{clearTimeout(ReleaseNotice.timer);ReleaseNotice.presented=releasePreviewBackup.presented;ReleaseNotice.latest=releasePreviewBackup.latest;App.openRelease=releasePreviewBackup.open;App.params=releasePreviewBackup.params;App.applyUpdate(releasePreviewBackup.update);await window.native.set('releaseNoticeVersion',null);delete globalThis.releasePreviewBackup;delete globalThis.releasePreviewOpens;})()`);
        const logoWindowSize=win.getContentSize(),logoMinimum=win.getMinimumSize();
        win.setMinimumSize(320,400);
        for(const [width,title] of [[1360,'JUJUTSU KAISEN Season 2'],[640,'JUJUTSU KAISEN Season 2'],[1360,'Frieren: Beyond Journey’s End Season 2'],[640,'ONE PIECE']]){
          win.setContentSize(width,860);
          const logoFallback=await win.webContents.executeJavaScript(`(async()=>{
            const oldGet=AniZip.get;
            try{
              const c=document.createElement('canvas');c.width=80;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(10,10,60,380);
              AniZip.get=async()=>({logo:c.toDataURL()});
              document.querySelector('#main').innerHTML='<section class="yn" style="background:linear-gradient(110deg,#34313f,#807587)"><div class="yn-hero">'+ynHero({kind:'remote',title:${JSON.stringify(title)},ep:'Episode 2',num:2,kitsu:'42'})+'</div></section>';
              const title=document.querySelector('.yn-title');showLogo(title,42,2);
              for(let n=0;n<50&&title.classList.contains('logo-pending');n++)await new Promise(r=>setTimeout(r,10));
              const rect=title.getBoundingClientRect();return {width:innerWidth,text:title.textContent,readable:!title.classList.contains('logo-pending')&&!title.querySelector('img')&&rect.width>100,noOverflow:document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth+1};
            }finally{AniZip.get=oldGet;}
          })()`);
          if(logoFallback.width!==width||!logoFallback.readable||!logoFallback.noOverflow)throw Error('Portrait logo fallback failed: '+JSON.stringify(logoFallback));
          console.log('AniDeck portrait logo fallback: '+JSON.stringify(logoFallback));
          await new Promise(resolve=>setTimeout(resolve,250));
          fs.writeFileSync(path.join(visualDir,'AniDeck-title-fallback-'+width+'-'+title.replace(/[^a-z0-9]+/gi,'-')+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        }
        win.setMinimumSize(...logoMinimum);win.setContentSize(...logoWindowSize);
        const artFixturesArg=process.argv.find(arg=>arg.startsWith('--anideck-logo-fixtures='));
        if(artFixturesArg){
          const fixtureRoot=path.resolve(artFixturesArg.slice('--anideck-logo-fixtures='.length));
          const art={alternate:'data:image/png;base64,'+fs.readFileSync(path.join(fixtureRoot,'alternate.png')).toString('base64'),primary:'data:image/png;base64,'+fs.readFileSync(path.join(fixtureRoot,'primary.png')).toString('base64'),backdrop:'data:image/jpeg;base64,'+fs.readFileSync(path.join(fixtureRoot,'backdrop.jpg')).toString('base64')};
          const priorSize=win.getContentSize(),priorMinimum=win.getMinimumSize();win.setMinimumSize(320,400);
          for(const [width,provider] of [[1360,'alternate'],[640,'alternate'],[1360,'primary']]){
            win.setContentSize(width,860);
            const artworkCheck=await win.webContents.executeJavaScript(`(async()=>{
              const art=${JSON.stringify(art)},provider=${JSON.stringify(provider)},previous=AniZip.get;
              try{
                const portrait=document.createElement('canvas');portrait.width=60;portrait.height=300;const ctx=portrait.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(5,5,50,290);
                const title=provider==='alternate'?'JUJUTSU KAISEN Season 2':'Frieren: Beyond Journey’s End Season 2';
                const item={kind:'remote',title,ep:'Episode 2',num:2,kitsu:'al:42',resolvedBackdrop:art.backdrop};
                document.querySelector('#main').innerHTML=yourNextHero([item,{...item,title:'Next in your queue',ep:'Episode 3',num:3}]);document.querySelector('#main').scrollTop=0;
                AniZip.get=async()=>({logos:provider==='alternate'?[portrait.toDataURL(),art.alternate]:[art.primary,art.alternate]});
                const heading=document.querySelector('.yn-title');titleLogoCache.delete('42');showLogo(heading,42,2,title);
                for(let n=0;n<100&&!heading.querySelector('.hero-logo.ready');n++)await new Promise(r=>setTimeout(r,20));
                const img=heading.querySelector('.hero-logo'),r=img?.getBoundingClientRect();
                return {width:innerWidth,loaded:!!img?.classList.contains('ready'),landscape:!!r&&r.width/r.height>1.1,visibleSize:!!r&&r.width>=200&&r.height>=35,noOverflow:document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth+1,fixedFrame:Math.abs(heading.getBoundingClientRect().height-(innerWidth<=700?144:164))<2,captionAligned:Math.abs(heading.querySelector('.logo-english').getBoundingClientRect().left-heading.getBoundingClientRect().left)<2};
              }finally{AniZip.get=previous;}
            })()`);
            if(artworkCheck.width!==width||Object.entries(artworkCheck).some(([key,value])=>key!=='width'&&value!==true))throw Error('Alternate artwork failed: '+JSON.stringify(artworkCheck));
            console.log('AniDeck exact-ID logo artwork: '+JSON.stringify({provider,...artworkCheck}));
            await new Promise(resolve=>setTimeout(resolve,250));
            fs.writeFileSync(path.join(visualDir,'AniDeck-logo-'+provider+'-'+width+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          }
          const slimeFiles=fs.readdirSync(fixtureRoot).filter(name=>/^slime-clearlogo-\d+\.png$/.test(name));
          if(slimeFiles.length){
            win.setContentSize(1360,860);const logos=slimeFiles.map(name=>'data:image/png;base64,'+fs.readFileSync(path.join(fixtureRoot,name)).toString('base64'));
            const slimeCheck=await win.webContents.executeJavaScript(`(async()=>{const previous={get:AniZip.get,clearlogos:AniZip.clearlogos};try{const name='That Time I Got Reincarnated as a Slime';titleLogoCache.delete('101280');document.querySelector('#main').innerHTML='<div class="detail-hero" style="background:linear-gradient(120deg,#152334,#1a1823)"><div class="hero-inner"><div class="hero-text">'+logoHeading(name,101280,name)+'</div></div></div>';const canvas=document.createElement('canvas');canvas.width=60;canvas.height=300;const x=canvas.getContext('2d');x.fillStyle='#fff';x.fillRect(5,5,50,290);AniZip.get=async()=>({tvdb:352408,logos:[canvas.toDataURL()]});let exact=false;AniZip.clearlogos=async id=>{exact=id===352408;return ${JSON.stringify(logos)}};showLogo(document.querySelector('.hero-text h1'),101280,1,name);for(let n=0;n<200&&!document.querySelector('.hero-logo.ready');n++)await new Promise(r=>setTimeout(r,10));const h=document.querySelector('.hero-text h1'),img=h.querySelector('.hero-logo');return {exact,loaded:!!img?.classList.contains('ready'),horizontal:Number(img?.style.getPropertyValue('--logo-ar'))>=2.2,caption:h.querySelector('.logo-english')?.textContent===name};}finally{AniZip.get=previous.get;AniZip.clearlogos=previous.clearlogos;}})()`);if(Object.values(slimeCheck).some(v=>v!==true))throw Error('Slime logo fallback failed: '+JSON.stringify(slimeCheck));console.log('AniDeck Slime artwork: '+JSON.stringify(slimeCheck));await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-slime-logo.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          }
          win.setMinimumSize(...priorMinimum);win.setContentSize(...priorSize);
        }
        const queueContrast=await win.webContents.executeJavaScript(`(()=>{
          const main=document.querySelector('#main');main.innerHTML='<section class="yn" style="background:linear-gradient(110deg,#fff,#e7e2fa);min-height:560px"><aside class="yn-queue"><div class="yn-qhead">Your queue <span>2</span></div><div class="yn-qlist"><button class="yn-item on"><span class="yn-thumb"></span><span class="yn-meta"><b>JUJUTSU KAISEN Season 2</b><small>Episode 2</small></span></button><button class="yn-item"><span class="yn-thumb"></span><span class="yn-meta"><b>Hell’s Paradise</b><small>Episode 13</small></span></button></div></aside></section>';main.scrollTop=0;
          const small=getComputedStyle(main.querySelector('.yn-meta small')),card=getComputedStyle(main.querySelector('.yn-item.on'));
          return {episode:small.color,size:small.fontSize,selected:card.backgroundColor};
        })()`);
        if(queueContrast.episode!=='rgb(241, 237, 248)'||queueContrast.selected!=='rgb(25, 23, 32)')throw Error('Queue contrast fixture failed: '+JSON.stringify(queueContrast));
        console.log('AniDeck bright queue contrast: '+JSON.stringify(queueContrast));
        await new Promise(resolve=>setTimeout(resolve,250));
        fs.writeFileSync(path.join(visualDir,'AniDeck-queue-contrast-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const progressReview=await win.webContents.executeJavaScript(`(async()=>{
          const oldService=LocalImport.service,oldPlan=LocalImport.plan,oldMap=LocalImport.map,oldLocal=LocalTracker.coll;
          try{
            LocalImport.service=()=>({loggedIn:()=>true,userId:'fixture',entry:async()=>({status:'current',progress:23,rating:9,reconsuming:false})});
            LocalTracker.coll=[{anime:{id:'al:42',title:'Tokyo Revengers'},status:'completed',progress:24,reconsuming:false}];LocalImport.map=async id=>id;
            LocalImport.plan=(which,callback,options)=>oldPlan.call(LocalImport,which,callback,{...options,pause:async()=>{}});
            await LocalImport.open('anilist');
            const input=document.querySelector('#import-rows input'),go=document.querySelector('#import-go');
            const unchecked=!input.checked&&!input.disabled&&go.disabled;
            input.click();const selectable=!go.disabled;input.click();const deselectDisables=go.disabled;
            return {unchecked,selectable,deselectDisables,comparison:document.querySelector('#import-rows').textContent.includes('On this device: 24 episodes · AniList: 23 episodes')};
          }finally{LocalImport.service=oldService;LocalImport.plan=oldPlan;LocalImport.map=oldMap;LocalTracker.coll=oldLocal;}
        })()`);
        if(Object.values(progressReview).some(value=>value!==true))throw Error('Progress review opt-in failed: '+JSON.stringify(progressReview));
        console.log('AniDeck progress review opt-in: '+JSON.stringify(progressReview));
        await new Promise(resolve=>setTimeout(resolve,250));
        fs.writeFileSync(path.join(visualDir,'AniDeck-import-progress-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript('App.closeModal();');
        const trackerLimitCheck=await win.webContents.executeJavaScript(`(async()=>{
          const oldEntry=Tracker.entry,oldNotice=App.entryRateNoticeUntil;
          const error=Object.assign(Error('AniList is temporarily limiting requests. Try again in 30 seconds.'),{status:429,retryAt:Date.now()+30000});
          try{
            document.querySelector('#toasts').innerHTML='';Tracker.entry=async()=>{throw error;};App.entryRateNoticeUntil=0;
            const state=await trackingEntryState('al:42');
            document.querySelector('#main').innerHTML='<div class="page"><h1>Watchlist connection</h1><div style="max-width:360px">'+progressCard({error:state.error,editable:true,label:'Add to your list',num:0,of:23,pct:0})+'</div></div>';App.mountPageShortcuts();
            for(let i=0;i<4;i++)await App.editEntry('al:42',23,'Sample title');
            const card=document.querySelector('.prog-card');return {unknown:card.textContent.includes('List entry unavailable'),notEditable:!card.hasAttribute('data-act'),noFalseZero:!card.querySelector('.prog-num'),retry:!!card.querySelector('[data-act=retry]'),oneNotice:document.querySelectorAll('#toasts .toast').length===1,noEmptyEditor:!document.querySelector('#entry-pop')};
          }finally{Tracker.entry=oldEntry;App.entryRateNoticeUntil=oldNotice;}
        })()`);
        if(Object.values(trackerLimitCheck).some(value=>value!==true))throw Error('Rate-limited tracker UI failed: '+JSON.stringify(trackerLimitCheck));
        console.log('AniDeck rate-limited tracker UI: '+JSON.stringify(trackerLimitCheck));
        await new Promise(resolve=>setTimeout(resolve,250));
        fs.writeFileSync(path.join(visualDir,'AniDeck-anilist-cooldown-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("document.querySelector('#toasts').innerHTML='';");

        const forumAssetArg=process.argv.find(arg=>arg.startsWith('--anideck-logo-fixtures='));
        if(forumAssetArg){
          const folder=path.resolve(forumAssetArg.slice('--anideck-logo-fixtures='.length)),art={logo:'data:image/png;base64,'+fs.readFileSync(path.join(folder,'alternate.png')).toString('base64'),backdrop:'data:image/jpeg;base64,'+fs.readFileSync(path.join(folder,'backdrop.jpg')).toString('base64')};
          const forumCheck=await win.webContents.executeJavaScript(`(async()=>{
            const art=${JSON.stringify(art)};
            globalThis.forumBackup={loadMe:Cloud.loadMe,call:Cloud.call,withSession:Cloud.withSession,capability:Friends.capability,media:App.showMediaId,animeFull:Kitsu.animeFull,anime:Kitsu.anime,episodes:Kitsu.episodes,details:AniList.details,idCache:AniList.idCache,zip:AniZip.get,loggedIn:AniList.loggedIn,has:Requests.has,entry:Tracker.entry};
            const roots=[{id:'topic-a',text:'# Episode 2: thoughts and theories\\n\\nWhat stood out to you in this episode?',parent:null,handle:'sora',name:'Sora',at:Date.now()-3600000,replies:2},{id:'topic-b',text:'# Favorite animation moments\\n\\nA place to appreciate the details.',parent:null,handle:'mira',name:'Mira',at:Date.now()-7200000,replies:0}];
            roots.forEach(r=>r.text=r.text.split(String.fromCharCode(92)+'n').join(String.fromCharCode(10)));
            const replies=[{id:'reply-a',text:'The opening sequence was excellent.',parent:'topic-a',handle:'mira',name:'Mira',at:Date.now()-1200000},{id:'reply-b',text:'I noticed the same detail on a rewatch.',parent:'topic-a',handle:'sora',name:'Sora',at:Date.now()-600000}];
            Cloud.loadMe=async()=>({handle:'mira',name:'Mira'});Cloud.withSession=fn=>fn();Friends.capability=async()=>['discussions','discussion-topics'];App.showMediaId=async()=>145064;AniList.loggedIn=()=>true;Requests.has=async()=>false;Tracker.entry=async()=>null;
            const a={id:'42',title:'JUJUTSU KAISEN Season 2',titles:['JUJUTSU KAISEN Season 2'],poster:art.backdrop,coverHd:art.backdrop,subtype:'TV',episodes:23,year:'2023',status:'finished',genres:['Action','Supernatural'],synopsis:'Sample title details for this isolated discussion preview.'};
            Kitsu.animeFull=Kitsu.anime=async()=>a;Kitsu.episodes=async()=>[];AniList.details=async()=>({id:145064,title:a.title,englishTitle:'Jujutsu Kaisen Season 2',cover:art.backdrop,banner:art.backdrop,format:'TV',episodes:23,status:'finished',year:'2023',score:86,genres:a.genres});AniZip.get=async()=>({logos:[art.logo]});
            Cloud.call=async(route,options={})=>{const u=new URL('https://fixture'+route);if(options.method==='POST'){const created={id:'topic-new',text:options.json.text,parent:null,handle:'mira',name:'Mira',at:Date.now(),mine:true};roots.push(created);return {id:created.id};}const id=u.searchParams.get('thread');return id?{thread:roots.find(r=>r.id===id),comments:[...roots.filter(r=>r.id===id),...replies.filter(r=>r.parent===id)],nextCursor:null}:{comments:roots,nextCursor:null};};
            document.querySelector('#main').innerHTML=await Views.anime({id:'42',tab:'discussion'},App.renderId);
            showLogo(document.querySelector('.detail-hero h1'),145064,2,'Jujutsu Kaisen Season 2');for(let n=0;n<100&&!document.querySelector('.detail-hero h1 .hero-logo.ready');n++)await new Promise(r=>setTimeout(r,10));
            let flashFree=true;for(let i=0;i<5;i++){document.querySelector('#main').innerHTML=await Views.anime({id:'42',tab:i%2?'episodes':'discussion'},App.renderId);const h=document.querySelector('.detail-hero h1');flashFree=flashFree&&h.classList.contains('has-logo')&&!h.classList.contains('logo-pending')&&!!h.querySelector('.hero-logo.ready');}
            document.querySelector('#main').innerHTML=await Views.anime({id:'42',tab:'discussion'},App.renderId);showLogo(document.querySelector('.detail-hero h1'),145064,2,'Jujutsu Kaisen Season 2');await Discussions.show(App.renderId,'anideck');
            document.querySelector('#main').scrollTop=320;
            const button=document.querySelector('#discussion-new'),plus=button.querySelector('svg').getBoundingClientRect(),label=button.querySelector('span').getBoundingClientRect();return {discussionButtonAligned:Math.abs((plus.top+plus.bottom-label.top-label.bottom)/2)<1&&label.left-plus.right>=7,flashFree,englishCaption:document.querySelector('.logo-english')?.textContent==='Jujutsu Kaisen Season 2',twoTopics:document.querySelectorAll('[data-topic]').length===2,composerHidden:document.querySelector('#discussion-compose').hidden};
          })()`);
          if(Object.values(forumCheck).some(value=>value!==true))throw Error('Title/forum presentation failed: '+JSON.stringify(forumCheck));
          console.log('AniDeck title and forum presentation: '+JSON.stringify(forumCheck));
          const availabilityCheck=await win.webContents.executeJavaScript(`(async()=>{
            const params={provider:remotePlaybackProvider(),title:'JUJUTSU KAISEN Season 2',seasonNumber:2,audio:App.settings.showAudio?.['42']||(App.settings.audioLang==='eng'?'dub':'sub')},key=RemoteEpisodes.key(params);
            const render=async state=>{RemoteEpisodes.cache.set(key,{state,until:Date.now()+120000});document.querySelector('#main').innerHTML=await Views.anime({id:'42'},App.renderId);};
            await render({status:'ready',episodes:[]});const missing=!document.querySelector('.ep-list .ep')&&!document.querySelector('.hero-actions [data-act="playRemote"]')&&document.querySelector('.remote-episode-state')?.textContent.includes('No episodes found');
            globalThis.unavailablePreview=document.querySelector('#main').innerHTML;
            await render({status:'ready',episodes:[1,3]});const actual=[...document.querySelectorAll('.ep-list .ep')].map(e=>Number(e.dataset.num));const listed=actual.join(',')==='1,3'&&!!document.querySelector('.hero-actions [data-act="playRemote"]');
            await render({status:'error',episodes:[]});const failed=!document.querySelector('.ep-list .ep')&&!document.querySelector('.hero-actions [data-act="playRemote"]')&&!!document.querySelector('[data-act="retryEpisodes"]');
            RemoteEpisodes.clear(params);document.querySelector('#main').innerHTML=await Views.anime({id:'42'},App.renderId);const checking=!document.querySelector('.ep-list .ep')&&!document.querySelector('.hero-actions [data-act="playRemote"]')&&document.querySelector('.remote-episode-state')?.textContent.includes('Checking');
            const savedRead=RemoteEpisodes.read,savedRefresh=App.refresh,savedAnime=Kitsu.animeFull;let fetches=0,refreshes=0,metadataReads=0,afterError='';
            try{Kitsu.animeFull=()=>{metadataReads++;return new Promise(()=>{});};RemoteEpisodes.read=async p=>{fetches++;return {provider:p.provider,episodes:[1,3]};};App.refresh=async()=>{refreshes++;document.querySelector('#main').innerHTML=await Views.anime({id:'42'},App.renderId);};await Views.animeAfter({id:'42'},App.renderId).catch(error=>{afterError=error.message;});for(let i=0;i<50&&!document.querySelector('.ep-list .ep');i++)await new Promise(r=>setTimeout(r,10));}finally{RemoteEpisodes.read=savedRead;App.refresh=savedRefresh;Kitsu.animeFull=savedAnime;RemoteEpisodes.clear(params);}
            const automatic=fetches===1&&refreshes===0&&metadataReads===0&&document.querySelectorAll('.ep-list .ep').length===2;
            const savedLimit=RemoteEpisodes.timeoutMs;let timeoutRecovery=false;
            try{RemoteEpisodes.timeoutMs=40;RemoteEpisodes.read=()=>new Promise(()=>{});document.querySelector('#main').innerHTML=await Views.anime({id:'42'},App.renderId);const h=document.querySelector('.detail-hero h1');checkRemoteEpisodes(App.renderId);for(let i=0;i<100&&document.querySelector('.remote-episode-state')?.textContent.includes('Checking');i++)await new Promise(r=>setTimeout(r,10));timeoutRecovery=!!document.querySelector('[data-act="retryEpisodes"]')&&!document.querySelector('.ep-list .ep')&&document.querySelector('.detail-hero h1')===h;}finally{RemoteEpisodes.timeoutMs=savedLimit;RemoteEpisodes.read=savedRead;RemoteEpisodes.clear(params);}

            console.log('Episode after-render flow',JSON.stringify({fetches,refreshes,metadataReads,afterError,automatic}));
            document.querySelector('#main').innerHTML=unavailablePreview;delete globalThis.unavailablePreview;document.querySelector('#main').scrollTop=270;return {missing,listed,failed,checking,automatic,timeoutRecovery};
          })()`);
          console.log('AniDeck server episode availability:',JSON.stringify(availabilityCheck));if(Object.values(availabilityCheck).some(v=>!v))throw Error('Server episode availability UI check failed');
          await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-server-unavailable.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          const thumbCheck=await win.webContents.executeJavaScript(`(async()=>{
            const oldEpisodes=Kitsu.episodes,oldZip=AniZip.get,params={provider:remotePlaybackProvider(),title:'JUJUTSU KAISEN Season 2',seasonNumber:2,audio:App.settings.showAudio?.['42']||(App.settings.audioLang==='eng'?'dub':'sub')},key=RemoteEpisodes.key(params),art=${JSON.stringify(art)};let result;
            try{Kitsu.episodes=()=>new Promise(()=>{});AniZip.get=async()=>({logos:[art.logo],episodes:{1:{image:art.backdrop+'#still1',title:'A still from the available metadata source'},2:{image:art.backdrop+'#still2'}}});RemoteEpisodes.cache.set(key,{state:{status:'ready',episodes:[1,2]},until:Date.now()+120000});document.querySelector('#main').innerHTML=await Views.anime({id:'42'},App.renderId);document.querySelector('#main').scrollTop=430;const row=document.querySelector('.ep-list .ep'),img=row.querySelector('.thumb img'),immediate=img.getAttribute('src')===art.backdrop;Views.animeAfter({id:'42'},App.renderId).catch(()=>{});for(let i=0;i<100&&(!img.naturalWidth||!img.src.endsWith('#still1'));i++)await new Promise(r=>setTimeout(r,10));const independent=img.naturalWidth>0&&img.src.endsWith('#still1')&&row.querySelector('.ep-title').textContent.includes('available metadata');setEpisodeThumb(row,['data:image/png;base64,broken',art.backdrop]);for(let i=0;i<100&&(!img.naturalWidth||img.getAttribute('src')!==art.backdrop);i++)await new Promise(r=>setTimeout(r,10));result={immediate,independent,fallback:img.naturalWidth>0&&img.getAttribute('src')===art.backdrop,visible:getComputedStyle(img).visibility!=='hidden'&&img.classList.contains('ready')};}finally{Kitsu.episodes=oldEpisodes;AniZip.get=oldZip;RemoteEpisodes.clear(params);}return result;
          })()`);
          console.log('AniDeck responsive episode art:',JSON.stringify(thumbCheck));if(Object.values(thumbCheck).some(v=>!v))throw Error('Responsive thumbnail check failed');await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-episode-art-responsive.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          const homeCheck=await win.webContents.executeJavaScript(`(async()=>{
            const old={sections:App.settings.homeSections,layout:App.settings.homeLayout,view:App.view,trending:Kitsu.trending,popular:Kitsu.popularAiring,browse:Kitsu.browse,seasonal:Kitsu.seasonal,zip:AniZip.get},panorama='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1000"><defs><linearGradient id="g"><stop stop-color="#3b315a"/><stop offset="1" stop-color="#182333"/></linearGradient></defs><rect width="3000" height="1000" fill="url(#g)"/><circle cx="2350" cy="420" r="350" fill="#8e75bb" opacity=".3"/><text x="1700" y="800" fill="#c5b4eb" font-size="60">Panoramic artwork fixture</text></svg>'),anime={...await Kitsu.animeFull('42'),coverHd:panorama,cover:panorama};let finish,reads=0,result;HomeReads.active=null;App.settings.homeLayout=3;App.settings.homeSections=HOME_SECTIONS.map(([id])=>({id,on:['featured','trending','popular'].includes(id)}));App.view='verification';
            try{Kitsu.trending=Kitsu.popularAiring=Kitsu.seasonal=async()=>[anime];AniZip.get=()=>new Promise(()=>{});Kitsu.browse=()=>{reads++;return new Promise(r=>finish=r);};const started=performance.now(),first=await Views.home({},App.renderId),firstPaintMs=performance.now()-started;document.querySelector('#main').innerHTML=first;document.querySelector('#main').scrollTop=0;const ready=first.includes(anime.title),pending=HomeReads.active.pending.size>0;Views.homeAfter({},App.renderId);for(let i=0;i<100&&(!document.querySelector('.slide-img')?.naturalWidth||document.querySelector('#carousel')?.classList.contains('loading-art'));i++)await new Promise(r=>setTimeout(r,10));const carouselReady=!!document.querySelector('.slide-img')?.naturalWidth&&!document.querySelector('#carousel').classList.contains('loading-art');finish({items:[anime]});await new Promise(r=>setTimeout(r,10));HomeReads.active.nextRid=App.renderId;const later=await Views.home({},App.renderId);result={ready,pending,carouselReady,firstPaintMs,firstPaintBounded:firstPaintMs<1400,lateShelf:later.includes('All-time popular'),noRepeat:reads===1};}finally{if(HomeReads.active)clearTimeout(HomeReads.active.timer);HomeReads.active=null;App.settings.homeSections=old.sections;App.settings.homeLayout=old.layout;App.view=old.view;Kitsu.trending=old.trending;Kitsu.popularAiring=old.popular;Kitsu.browse=old.browse;Kitsu.seasonal=old.seasonal;AniZip.get=old.zip;clearInterval(App.carouselTimer);}return result;
          })()`);
          console.log('AniDeck progressive Home:',JSON.stringify(homeCheck));if(Object.entries(homeCheck).some(([key,value])=>key!=='firstPaintMs'&&!value))throw Error('Progressive Home check failed');await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-home-progressive.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          const missingMetadata=await win.webContents.executeJavaScript(`(async()=>{globalThis.forumDetails=AniList.details;AniList.details=async()=>null;AniList.idCache={...AniList.idCache,42:145064};titleLogoCache.delete('145064');document.querySelector('#main').innerHTML=await Views.anime({id:'42'},App.renderId);showLogo(document.querySelector('.detail-hero h1'));for(let n=0;n<100&&!document.querySelector('.detail-hero .hero-logo.ready');n++)await new Promise(r=>setTimeout(r,10));const h=document.querySelector('.detail-hero h1'),img=h.querySelector('.hero-logo'),caption=h.querySelector('.logo-english'),a=img?.getBoundingClientRect(),b=caption?.getBoundingClientRect();document.querySelector('#main').scrollTop=0;return {logoWithoutMetadata:!!img,captionAttached:!!caption,captionBelow:!!a&&!!b&&b.top>=a.bottom&&b.top-a.bottom<=13};})()`);
          if(Object.values(missingMetadata).some(v=>v!==true))throw Error('Metadata-independent artwork failed: '+JSON.stringify(missingMetadata));console.log('AniDeck artwork lockup: '+JSON.stringify(missingMetadata));
          await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-title-without-metadata.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          await win.webContents.executeJavaScript(`(async()=>{AniList.details=forumDetails;document.querySelector('#main').innerHTML=await Views.anime({id:'42',tab:'discussion'},App.renderId);showLogo(document.querySelector('.detail-hero h1'));await Discussions.show(App.renderId,'anideck');document.querySelector('#main').scrollTop=320;})()`);
          await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-discussion-topics.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          const emptyBoard=await win.webContents.executeJavaScript(`(()=>{Discussions.comments=[];Discussions.paintTopics();const starters=[...document.querySelectorAll('[data-new-discussion]')];const result={threeIdeas:starters.length===3,noDoubleAction:document.querySelectorAll('#discussion-feed .btn').length===0,contained:document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth+1};return result;})()`);if(Object.values(emptyBoard).some(v=>v!==true))throw Error('Discussion empty board failed: '+JSON.stringify(emptyBoard));
          await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-discussion-empty.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          await win.webContents.executeJavaScript(`(async()=>{Discussions.newTopic('Episode discussion');if(document.querySelector('#discussion-topic').value!=='Episode discussion')throw Error('Topic prompt failed');await Discussions.topics();})()`);
          const opened=await win.webContents.executeJavaScript(`(async()=>{await Discussions.openTopic(Discussions.comments.find(c=>c.id==='topic-a'));return {ownReplies:document.querySelector('#discussion-feed').textContent.includes('opening sequence'),noOtherTopic:!document.querySelector('#discussion-feed').textContent.includes('appreciate the details'),replyComposer:!document.querySelector('#discussion-compose').hidden&&document.querySelector('#discussion-topic').hidden};})()`);
          if(Object.values(opened).some(value=>value!==true))throw Error('Isolated topic view failed: '+JSON.stringify(opened));
          await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-discussion-thread.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          await win.webContents.executeJavaScript("Discussions.newTopic();document.querySelector('#discussion-topic').value='A new discussion';document.querySelector('#discussion-draft').value='An opening thought for this topic.';");
          await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-discussion-create.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
          const created=await win.webContents.executeJavaScript(`(async()=>{await Discussions.send();return Discussions.thread?.id==='topic-new'&&Discussions.mode==='thread';})()`);if(!created)throw Error('New discussion did not open its own topic');
          await win.webContents.executeJavaScript(`(()=>{Cloud.loadMe=forumBackup.loadMe;Cloud.call=forumBackup.call;Cloud.withSession=forumBackup.withSession;Friends.capability=forumBackup.capability;App.showMediaId=forumBackup.media;Kitsu.animeFull=forumBackup.animeFull;Kitsu.anime=forumBackup.anime;Kitsu.episodes=forumBackup.episodes;AniList.details=forumBackup.details;AniList.idCache=forumBackup.idCache;AniZip.get=forumBackup.zip;AniList.loggedIn=forumBackup.loggedIn;Requests.has=forumBackup.has;Tracker.entry=forumBackup.entry;delete globalThis.forumBackup;})()`);
        }
        const serverCheck=await win.webContents.executeJavaScript(`(()=>{document.querySelector('#main').innerHTML='<div class="page"><h1>Watch on</h1><div class="chip-wrap"><button class="server-pill">'+getServerLabel('animepahe',false)+'</button>'+renderWatchOnMenu('animepahe',false)+'</div></div>';const menu=document.querySelector('#main .watch-on-menu');menu.hidden=false;menu.style.width='280px';const items=[...menu.querySelectorAll('[data-srv]')];return {visible:menu.getBoundingClientRect().bottom<=innerHeight&&menu.getBoundingClientRect().width>100,removed:!items.some(b=>b.dataset.srv==='animepahe'),replacement:items.some(b=>b.dataset.srv==='hianime'&&b.textContent.includes('#2')&&b.classList.contains('on')),migrated:remotePlaybackProvider('animepahe')==='hianime'};})()`);if(Object.values(serverCheck).some(v=>v!==true))throw Error('Retired server UI failed: '+JSON.stringify(serverCheck));await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-server-replacement.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const iconCheck=await win.webContents.executeJavaScript(`(()=>{document.querySelector('#main').innerHTML='<div class="page" style="display:flex;gap:40px;align-items:center;padding:70px;background:#19171f"><span style="color:#baabff">'+icon('deck')+'</span><span class="ad-deck-glyph" style="width:100px;height:100px;color:#baabff">'+icon('deck')+'</span><span style="color:#fff;background:#453758;padding:20px">'+icon('deck')+'</span></div>';document.querySelector('.ad-deck-glyph svg').style.cssText='width:100px;height:100px';const masks=[...document.querySelectorAll('#main mask')];return {masked:masks.length===3,unique:new Set(masks.map(m=>m.id)).size===3};})()`);if(!iconCheck.masked||!iconCheck.unique)throw Error('Deck icon masks failed');await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-deck-icon.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const reviewSize=win.getContentSize();win.setContentSize(1360,1100);
        const reviewCards=await win.webContents.executeJavaScript(`(async()=>{const previous=DeckStore.state;try{const now=Date.now();DeckStore.state={...previous,events:[{id:'al:1',title:'Frieren: Beyond Journey’s End',at:now-86400000,count:2,seconds:2880,genres:['Adventure','Fantasy','Drama'],studios:['MADHOUSE']},{id:'al:2',title:'Black Clover',at:now,count:1,seconds:1440,genres:['Adventure','Fantasy'],studios:['Studio Pierrot']}]};document.querySelector('#main').innerHTML=await DeckUI.reviewPage({period:'all'});DeckUI.reviewData.name='Mira';DeckUI.drawReview();document.querySelector('#main').scrollTop=0;return {activity:document.querySelector('#ad-review-main').toDataURL(),taste:document.querySelector('#ad-review-taste').toDataURL(),episodes:DeckUI.reviewData.episodes,titles:DeckUI.reviewData.titles};}finally{DeckStore.state=previous;}})()`);
        if(reviewCards.episodes!==3||reviewCards.titles!==2)throw Error('Review period summary failed');
        for(const key of ['activity','taste'])fs.writeFileSync(path.join(visualDir,'AniDeck-review-'+key+'.png'),Buffer.from(reviewCards[key].split(',')[1],'base64'));
        await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.join(visualDir,'AniDeck-review-deck.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());win.setContentSize(...reviewSize);
        await win.webContents.executeJavaScript(`(()=>{
          document.querySelector('#main').innerHTML=profileMarkup({self:true});
          const counts=[5,5,2,0,0],entries=Array.from({length:12},(_,i)=>({anime:{id:'al:'+String(i+1),title:i===0?'Frieren: Beyond Journey’s End':'Sample anime '+(i+1),poster:'brand/mark.svg',genres:['Fantasy','Adventure','Drama'],episodes:12,year:2025},status:i<5?'current':i<10?'planned':'completed',progress:i<5?4:i<10?0:12,rating:8}));
          const card=watcherCard({episodes:306,seconds:450000,counts:{current:5,planned:5,completed:2}},entries,{}, {name:'Mira',avatar:'brand/mark.svg',tracker:'AniDeck'});
          const canvas=document.createElement('canvas');canvas.width=960;canvas.height=240;const brush=canvas.getContext('2d'),gradient=brush.createLinearGradient(0,0,960,240);gradient.addColorStop(0,'#544675');gradient.addColorStop(.5,'#29233a');gradient.addColorStop(1,'#39505b');brush.fillStyle=gradient;brush.fillRect(0,0,960,240);brush.strokeStyle='#b7a8ff30';for(let i=0;i<7;i++)brush.strokeRect(90+i*140,-30,95,300);
          window.__profileIdentity={name:'Mira',handle:'mira',avatar:'',bio:'## A little about me\\n**Fantasy worlds**, slow adventures, and a growing backlog.\\n> Always making room for one more favorite.',bioFormat:'markdown',timezone:'Asia/Tokyo',banner:canvas.toDataURL('image/png')};
          paintProfileIdentity(window.__profileIdentity);paintProfile(card);
          AniFavorites.paint({...window.__profileIdentity,favorites:[{id:'al:1',title:'Sample favorite one',poster:'brand/mark.svg'},{id:'al:2',title:'Sample favorite two',poster:'brand/mark.svg'}]},true);document.querySelector('#pf2-social').hidden=true;document.querySelector('#pf2-habits').hidden=true;
          document.querySelector('#main').scrollTop=0;window.__profileFixture=card;
        })()`);
        await new Promise(resolve=>setTimeout(resolve,1500));
        fs.writeFileSync(path.join(visualDir,'AniDeck-profile-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const layout=await win.webContents.executeJavaScript(`(()=>{const cards=[...document.querySelectorAll('#pf2-list .pf2-pcard')];return {buttons:cards.length,labelsFit:cards.every(c=>{const label=c.querySelector('.pf2-pcard-top'),a=c.getBoundingClientRect(),b=label.getBoundingClientRect();return b.right<=a.right&&b.left>=a.left;}),noOverlap:cards.every((c,i)=>!i||c.getBoundingClientRect().left>=cards[i-1].getBoundingClientRect().right-3),headerRefined:!document.querySelector('.pf3-topline .ad-eyebrow')&&!!document.querySelector('.pf3-milestone[data-act=pfMilestones]')&&document.querySelector('.pf3-genre-group').textContent.includes('Most watched genres'),coverConnected:(()=>{const cover=document.querySelector('#pf-banner').getBoundingClientRect(),avatar=document.querySelector('.pf2-ava').getBoundingClientRect();return avatar.top<cover.bottom&&avatar.bottom>cover.bottom})(),personalAligned:(()=>{const a=document.querySelector('#pf-about').getBoundingClientRect(),b=document.querySelector('#pf-favorites').getBoundingClientRect();return Math.abs(a.top-b.top)<2&&a.right<b.left&&b.right<=document.querySelector('.profile-personal').getBoundingClientRect().right+1})(),recoveryOnly:!accountProfileCard().includes('aniEdit')&&!accountProfileCard().includes('aniFavorites')};})()`);
        if(Object.values(layout).some(v=>v===false)||layout.buttons!==5)throw Error('Profile layout check failed: '+JSON.stringify(layout));
        const scrollStart=await win.webContents.executeJavaScript("(()=>{const main=document.querySelector('#main');main.scrollTop=0;window.__milestoneMotion=ProfileScroll.to(document.querySelector('#pf2-badges'));return main.scrollTop;})()");
        await new Promise(resolve=>setTimeout(resolve,250));
        const scrollMiddle=await win.webContents.executeJavaScript("document.querySelector('#main').scrollTop");
        await new Promise(resolve=>setTimeout(resolve,1200));
        const scrollEnd=await win.webContents.executeJavaScript("({top:document.querySelector('#main').scrollTop,focused:document.activeElement.id==='pf2-badges'})");
        if(!(scrollMiddle>scrollStart&&scrollMiddle<scrollEnd.top&&scrollEnd.focused))throw Error('Milestone scroll jumped or lost focus: '+JSON.stringify({scrollStart,scrollMiddle,scrollEnd}));
        console.log('AniDeck milestone animation: '+JSON.stringify({scrollStart,scrollMiddle,scrollEnd}));
        const routes=await win.webContents.executeJavaScript("(()=>{const seen=[],original=App.act;try{App.act=(action,data)=>seen.push(action+':'+data.tab);for(const button of document.querySelectorAll('#pf2-list button'))button.click();}finally{App.act=original;}return seen;})()");
        if(JSON.stringify(routes)!==JSON.stringify(['listTab:current','listTab:planned','listTab:completed','listTab:on_hold','listTab:dropped']))throw Error('Status card clicks were redirected: '+JSON.stringify(routes));
        await win.webContents.executeJavaScript("document.querySelector('#pf2-list').style.width='320px';document.querySelector('#pf2-list').style.gridColumn='1 / -1';document.querySelector('#pf2-list').scrollIntoView({block:'center'});");
        await new Promise(resolve=>setTimeout(resolve,250));
        const narrow=await win.webContents.executeJavaScript("(()=>{const box=document.querySelector('#pf2-list'),cards=[...box.querySelectorAll('.pf2-pcard')];return {noOverflow:box.scrollWidth<=box.clientWidth,stacked:cards[1].getBoundingClientRect().top>cards[0].getBoundingClientRect().bottom};})()");
        if(!narrow.noOverflow||!narrow.stacked)throw Error('Narrow status layout failed: '+JSON.stringify(narrow));
        console.log('AniDeck profile layout: '+JSON.stringify({...layout,narrow}));
        const editor=await win.webContents.executeJavaScript(`(async()=>{
          const previous=Cloud.loadMe;Cloud.loadMe=async()=>window.__profileIdentity;try{await AniAccount.edit();}finally{Cloud.loadMe=previous;}
          const input=document.querySelector('#ani-bio');input.value='Fantasy fan';input.setSelectionRange(0,7);document.querySelector('[data-bio-tool="bold"]').click();document.querySelector('#bio-preview-tab').click();
          const bytes=Uint8Array.from(atob(window.__profileIdentity.banner.split(',')[1]),c=>c.charCodeAt(0));await document.querySelector('#ani-banner').onchange({target:{files:[new File([bytes],'banner.png',{type:'image/png'})]}});
          return {aboutMe:document.querySelector('label[for="ani-bio"]').textContent==='About me',formatted:!!document.querySelector('#bio-preview strong'),banner:document.querySelector('#ani-banner-preview img')?.src.startsWith('data:image/webp'),timezone:!!document.querySelector('#ani-timezone option[value="Asia/Tokyo"]')};
        })()`);
        if(Object.values(editor).some(v=>v!==true))throw Error('Profile editor check failed: '+JSON.stringify(editor));
        await new Promise(resolve=>setTimeout(resolve,350));
        fs.writeFileSync(path.join(visualDir,'AniDeck-profile-editor-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const savedEditor=await win.webContents.executeJavaScript(`(async()=>{const old={load:Cloud.loadMe,call:Cloud.call,session:Cloud.withSession,refresh:App.refresh};let payload;try{Cloud.call=async(path,options)=>{if(path!=='/v1/me/profile')throw Error('Unexpected profile path');payload=options.json;return {ok:true};};Cloud.withSession=fn=>fn();Cloud.loadMe=async()=>window.__profileIdentity;App.refresh=()=>{};document.querySelector('#ani-timezone').value='UTC';await document.querySelector('#ani-edit-form').onsubmit({preventDefault(){}});return {formatted:payload?.bio==='**Fantasy** fan',format:payload?.bioFormat==='markdown',timezone:payload?.timezone==='UTC',banner:payload?.banner?.startsWith('data:image/webp')};}finally{Cloud.loadMe=old.load;Cloud.call=old.call;Cloud.withSession=old.session;App.refresh=old.refresh;}})()`);
        if(Object.values(savedEditor).some(v=>v!==true))throw Error('Profile editor save binding failed: '+JSON.stringify(savedEditor));
        await win.webContents.executeJavaScript("(async()=>{document.querySelector('#main').innerHTML=await Views.settings();Views.settingsAfter();const tab=[...document.querySelectorAll('#set-menu button')].find(b=>b.textContent==='Notifications');if(!tab)throw Error('Notifications tab missing');tab.click();document.querySelector('#main').scrollTop=0;document.querySelector('#toasts').innerHTML='';})()");
        await new Promise(resolve=>setTimeout(resolve,250));
        fs.writeFileSync(path.join(visualDir,'AniDeck-notifications-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const notificationControls=await win.webContents.executeJavaScript("(async()=>{const input=document.querySelector('[data-notification=\"message\"]');input.checked=false;await input.onchange();const disabled=!NotificationPrefs.allows('message');input.checked=true;await input.onchange();return {disabled,enabled:NotificationPrefs.allows('message'),persisted:(await window.native.get('notificationPreferences')).types.message===true};})()");
        if(Object.values(notificationControls).some(v=>v!==true))throw Error('Notification settings did not control delivery');
        console.log('AniDeck profile editor and alerts: '+JSON.stringify({editor,savedEditor,notificationControls}));
        await win.webContents.executeJavaScript(`(async()=>{window.__requestOriginal=Friends.request;window.__requestCalls=[];Friends.request=async(path,options)=>{window.__requestCalls.push({path,options});if(path==='/v1/me/message-policy')return {policy:options?.json?.policy||'friends'};if(path==='/v1/message-requests')return {incoming:[{id:'sample-request',handle:'sora',name:'Sora',avatar:'',text:'Hey! We both love fantasy anime. Any recommendations for my next watch?'}],outgoing:[]};return {ok:true};};await MessageRequests.inbox();})()`);
        await new Promise(resolve=>setTimeout(resolve,350));
        fs.writeFileSync(path.join(visualDir,'AniDeck-message-requests-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const requestControls=await win.webContents.executeJavaScript(`(async()=>{try{const panel=document.querySelector('#message-request-inbox'),button=panel.querySelector('[data-action="decline"]');await panel.onclick({target:button});const declined=window.__requestCalls.some(c=>c.options?.json?.action==='decline');await MessageRequests.privacy();const form=document.querySelector('#message-privacy');form.querySelector('input[value="requests"]').checked=true;await form.onsubmit({preventDefault(){}});return {declined,privacySaved:window.__requestCalls.some(c=>c.options?.json?.policy==='requests')};}finally{Friends.request=window.__requestOriginal;App.closeModal();}})()`);
        if(Object.values(requestControls).some(v=>v!==true))throw Error('Message request controls did not reach their routes');
        console.log('AniDeck message request controls: '+JSON.stringify(requestControls));
        await win.webContents.executeJavaScript("showWhatsNew();");
        await new Promise(resolve=>setTimeout(resolve,350));
        const releaseActions=await win.webContents.executeJavaScript("(()=>{const footer=document.querySelector('.wn-panel>footer'),buttons=[...footer.querySelectorAll('.btn')];return {compact:buttons.every(b=>b.getBoundingClientRect().height<=36),separate:buttons[0].getBoundingClientRect().right<buttons[1].getBoundingClientRect().left};})()");
        if(!releaseActions.compact||!releaseActions.separate)throw Error('Release note actions oversized: '+JSON.stringify(releaseActions));
        fs.writeFileSync(path.join(visualDir,'AniDeck-whats-new-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("App.closeModal();MessageRequests.start();");
        await new Promise(resolve=>setTimeout(resolve,350));
        fs.writeFileSync(path.join(visualDir,'AniDeck-new-message-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("App.closeModal();");
        const friendsSize=win.getContentSize(),friendsMinimum=win.getMinimumSize();win.setMinimumSize(320,320);win.setContentSize(1920,1080);
        await win.webContents.executeJavaScript(`(async()=>{
          window.__friendsLayoutOriginal={request:Friends.request,valid:Friends.valid,markRead:Friends.markRead};Friends.valid=()=>true;Friends.markRead=async()=>{};
          Friends.request=async()=>({peer:{handle:'sora',name:'Sora'},messages:Array.from({length:70},(_,i)=>({id:'layout-'+i,text:'Sample conversation '+(i+1),mine:i%2===0,at:Date.now()-70000+i*1000})),nextCursor:null});
          document.querySelector('#main').innerHTML=await Views.friends();App.mountPageShortcuts();document.querySelector('#home-fab').hidden=false;document.querySelector('#page-back').hidden=false;document.querySelector('.af-page-actions')?.remove();
          Friends.me={handle:'mira',name:'Mira'};Friends.rows=[{handle:'sora',name:'Sora',last:{text:'What should we watch next?',at:Date.now()}}];Friends.social={friends:[{handle:'sora'}],incoming:[],outgoing:[]};Friends.renderRoster(document.querySelector('#af-content'),{handle:'mira',name:'Mira'},Friends.social);
          document.querySelector('#main').scrollTop=0;
        })()`);
        await new Promise(resolve=>setTimeout(resolve,250));
        const friendsWelcome=await win.webContents.executeJavaScript("(()=>{const main=document.querySelector('#main'),box=document.querySelector('.af-layout').getBoundingClientRect(),area=main.getBoundingClientRect(),heading=document.querySelector('.af-page-head').getBoundingClientRect(),welcome=document.querySelector('.af-dm-welcome'),center=(welcome.firstElementChild.getBoundingClientRect().top+welcome.lastElementChild.getBoundingClientRect().bottom)/2,space=welcome.getBoundingClientRect();const shortcutsClear=[...document.querySelectorAll('#page-shortcuts>button:not([hidden])')].every(b=>{const r=b.getBoundingClientRect();return r.right<=heading.left||r.left>=heading.right||r.bottom<=heading.top||r.top>=heading.bottom;});return {usesHeight:box.bottom>area.bottom-40&&box.bottom<=area.bottom,outerFits:main.scrollHeight<=main.clientHeight+1,tall:box.height>820,headerRaised:heading.top-area.top<=40,shortcutsClear,welcomeRaised:center<(space.top+space.bottom)/2-15};})()");
        if(Object.values(friendsWelcome).some(v=>v!==true))throw Error('Friends leaves unused window space: '+JSON.stringify(friendsWelcome));
        fs.writeFileSync(path.join(visualDir,'AniDeck-friends-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("Friends.openThread('sora');");
        await new Promise(resolve=>setTimeout(resolve,250));
        const friendsThread=await win.webContents.executeJavaScript("(()=>{const main=document.querySelector('#main'),box=document.querySelector('.af-layout').getBoundingClientRect(),draft=document.querySelector('#af-compose').getBoundingClientRect(),messages=document.querySelector('#af-messages');return {composerVisible:draft.bottom<=box.bottom&&draft.top>box.top,historyScrolls:messages.scrollHeight>messages.clientHeight,outerFits:main.scrollHeight<=main.clientHeight+1};})()");
        if(Object.values(friendsThread).some(v=>v!==true))throw Error('Friends thread layout failed: '+JSON.stringify(friendsThread));
        fs.writeFileSync(path.join(visualDir,'AniDeck-friends-chat-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        win.setContentSize(640,720);await new Promise(resolve=>setTimeout(resolve,200));
        const friendsNarrow=await win.webContents.executeJavaScript("(()=>{const main=document.querySelector('#main'),box=document.querySelector('.af-layout').getBoundingClientRect(),draft=document.querySelector('#af-compose').getBoundingClientRect(),heading=document.querySelector('.af-page-head').getBoundingClientRect();return {composerVisible:draft.bottom<=box.bottom+1,noHorizontalOverflow:main.scrollWidth<=main.clientWidth+1,actualNarrow:innerWidth===640,shortcutsClear:[...document.querySelectorAll('#page-shortcuts>button:not([hidden])')].every(b=>b.getBoundingClientRect().bottom<=heading.top)};})()");
        if(Object.values(friendsNarrow).some(v=>v!==true))throw Error('Narrow Friends layout failed: '+JSON.stringify(friendsNarrow));
        console.log('AniDeck Friends window layout: '+JSON.stringify({friendsWelcome,friendsThread,friendsNarrow}));
        await win.webContents.executeJavaScript("Object.assign(Friends,window.__friendsLayoutOriginal);document.querySelector('#main').innerHTML='';");win.setMinimumSize(...friendsMinimum);win.setContentSize(...friendsSize);
        await win.webContents.executeJavaScript(`(async()=>{document.querySelector('#main').innerHTML=await Views.friends();Friends.me={handle:'mira',name:'Mira'};Friends.social={friends:[{handle:'sora',name:'Sora'}],incoming:[],outgoing:[]};Friends.renderRoster(document.querySelector('#af-content'),Friends.me,Friends.social);Social.select('friends');})()`);
        await new Promise(resolve=>setTimeout(resolve,250));
        const socialFriends=await win.webContents.executeJavaScript("(()=>{const button=document.querySelector('#social-friend-list [data-act=wfOpen]');if(!button)throw Error('Social friend missing');button.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:300}));return {cleanHeader:!document.querySelector('.af-page-actions'),noRedundantActions:!document.querySelector('.social-toolbar [data-act=friendsRequests]'),menu:!!document.querySelector('#profile-actions-menu'),profile:!!document.querySelector('#profile-actions-menu [data-action=wfOpen]'),message:!!document.querySelector('#profile-actions-menu [data-action=friendsMessage]'),compare:!!document.querySelector('#profile-actions-menu [data-action=friendsCompare]')};})()");
        if(Object.values(socialFriends).some(v=>v!==true))throw Error('Profile right click menu failed: '+JSON.stringify(socialFriends));
        await new Promise(resolve=>setTimeout(resolve,200));
        await win.webContents.executeJavaScript("if(!document.querySelector('#profile-actions-menu'))throw Error('Profile menu closed before interaction');");
        fs.writeFileSync(path.join(visualDir,'AniDeck-social-friends-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("ProfileActions.close();Social.select('settings');");await new Promise(resolve=>setTimeout(resolve,200));
        fs.writeFileSync(path.join(visualDir,'AniDeck-social-settings-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        const socialSettings=await win.webContents.executeJavaScript("({privacy:!!document.querySelector('.social-panel [data-act=messagePrivacy]'),alerts:!!document.querySelector('.social-panel [data-act=socialNotifications]'),blocked:!!document.querySelector('.social-panel [data-act=friendsBlocked]')})");
        if(Object.values(socialSettings).some(v=>v!==true))throw Error('Social settings missing: '+JSON.stringify(socialSettings));
        await win.webContents.executeJavaScript("Social.section='messages';Friends.handle='';document.querySelector('#main').innerHTML='';");console.log('AniDeck Social controls: '+JSON.stringify({socialFriends,socialSettings}));
        await win.webContents.executeJavaScript("document.querySelector('#main').innerHTML='<div class=\"page\" style=\"max-width:650px;margin:auto\">'+DeckUI.widget({id:'roulette',span:6})+'</div>';");
        await new Promise(resolve=>setTimeout(resolve,200));
        const mystery=await win.webContents.executeJavaScript("({threeCards:document.querySelectorAll('.ad-deal-art span').length===3,solid:[...document.querySelectorAll('.ad-deal-art span')].every(card=>/^rgb\\(/.test(getComputedStyle(card).backgroundColor))})");
        if(!mystery.threeCards||!mystery.solid)throw Error('Mystery card still has visible backs: '+JSON.stringify(mystery));
        fs.writeFileSync(path.join(visualDir,'AniDeck-deal-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("document.querySelector('#main').innerHTML='';");
        await win.webContents.executeJavaScript("(async()=>{document.querySelector('#main').innerHTML=await Views.friends();Friends.me={handle:'mira'};Friends.social={friends:[],incoming:[],outgoing:[]};Social.section='requests';Social.requestsKind='friends';Social.paint();})()");
        await new Promise(resolve=>setTimeout(resolve,200));
        const requestsCompact=await win.webContents.executeJavaScript("({inline:!!document.querySelector('.social-requests #af-request-list'),compact:document.querySelector('.social-requests').getBoundingClientRect().height<500})");
        if(!requestsCompact.inline||!requestsCompact.compact)throw Error('Requests inbox not compact: '+JSON.stringify(requestsCompact));
        fs.writeFileSync(path.join(visualDir,'AniDeck-social-requests-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript(`(()=>{window.__widgetEntries=DeckUI.tonightWidget;DeckUI.tonightWidget=()=>'<div style="height:130px">Sample tonight lineup</div>';document.querySelector('#main').innerHTML='<div class="page"><div class="ad-widgets">'+DeckUI.widget({id:'airing',span:6})+DeckUI.widget({id:'tonight',span:6})+'</div></div>';document.querySelector('#ad-widget-airing').innerHTML='<div style="height:260px">Sample horizon content</div>';DeckUI.tonightWidget=window.__widgetEntries;})()`);
        await new Promise(resolve=>setTimeout(resolve,200));
        const widgetMatch=await win.webContents.executeJavaScript("(()=>{const horizon=document.querySelector('.ad-widget--airing').getBoundingClientRect(),tonight=document.querySelector('.ad-widget--tonight').getBoundingClientRect();return Math.abs(horizon.top-tonight.top)<1&&Math.abs(horizon.height-tonight.height)<1})()");
        if(!widgetMatch)throw Error('Tonight does not match adjacent Horizon height');
        await win.webContents.executeJavaScript("Social.section='messages';document.querySelector('#main').innerHTML='';");
        const progressive=await win.webContents.executeJavaScript(`(async()=>{const old={load:Cloud.loadMe,milestones:Cloud.milestones,enabled:Cloud.enabled,ident:Cloud.ident,who:Cloud.who,me:Cloud.me,publish:Cloud.publish,update:App.updateWho,card:myCard,social:paintSocial,myCard:App.myCard,myCardWho:App.myCardWho,myCardTracker:App.myCardTracker};try{document.querySelector('#main').innerHTML=profileMarkup({self:true});App.myCard=null;Cloud.who='smoke-speed';Cloud.me=undefined;Cloud.ident=()=> 'smoke-speed';Cloud.enabled=()=>true;Cloud.publish=async()=>{};App.updateWho=()=>{};paintSocial=async()=>{};let identityReady,statsReady;Cloud.loadMe=()=>new Promise(resolve=>identityReady=resolve);Cloud.milestones=()=>new Promise(()=>{});myCard=()=>new Promise(resolve=>statsReady=resolve);const pending=loadOwnProfile(App.renderId);identityReady(window.__profileIdentity);await new Promise(resolve=>setTimeout(resolve,0));const identityEarly=!document.querySelector('#pf-banner').hidden&&document.querySelector('#pf-name').textContent==='Mira'&&!document.querySelector('.pf3-milestone');statsReady({card:window.__profileFixture,stale:false});await pending;return {identityEarly,statsWithoutRarity:!!document.querySelector('.pf3-milestone')&&document.querySelector('#pf-sub').textContent.includes('125 hours')};}finally{Cloud.loadMe=old.load;Cloud.milestones=old.milestones;Cloud.enabled=old.enabled;Cloud.ident=old.ident;Cloud.who=old.who;Cloud.me=old.me;Cloud.publish=old.publish;App.updateWho=old.update;myCard=old.card;paintSocial=old.social;App.myCard=old.myCard;App.myCardWho=old.myCardWho;App.myCardTracker=old.myCardTracker;}})()`);
        if(!progressive.identityEarly||!progressive.statsWithoutRarity)throw Error('Profile remains blocked by optional data: '+JSON.stringify(progressive));
        await win.webContents.executeJavaScript(`(()=>{document.querySelector('#main').innerHTML='<div class="page" style="max-width:650px;margin:auto">'+DeckUI.widget({id:'roulette',span:6})+'</div>';const rules=[];for(const sheet of document.styleSheets){for(const rule of sheet.cssRules||[]){if(rule.selectorText?.includes('.ad-widget--roulette:hover .ad-deal'))rules.push(rule.cssText.replaceAll(':hover','.smoke-hover'));}}const style=document.createElement('style');style.id='smoke-fan';style.textContent=rules.join(' ');document.head.append(style);document.querySelector('.ad-widget').classList.add('smoke-hover');})()`);
        await new Promise(resolve=>setTimeout(resolve,450));
        const fanWide=await win.webContents.executeJavaScript("(()=>{const box=document.querySelector('.ad-widget').getBoundingClientRect(),copy=document.querySelector('.ad-deal-copy').getBoundingClientRect();return [...document.querySelectorAll('.ad-deal-art span')].every(card=>{const r=card.getBoundingClientRect();return r.left>=box.left+4&&r.right<=box.right-4&&r.top>=box.top&&r.bottom<=box.bottom&&(r.right<=copy.left-2||r.bottom<=copy.top-8)})})()");
        fs.writeFileSync(path.join(visualDir,'AniDeck-deal-hover-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("document.querySelector('.ad-widget').style.width='360px';");await new Promise(resolve=>setTimeout(resolve,450));
        const fanNarrow=await win.webContents.executeJavaScript("(()=>{const box=document.querySelector('.ad-widget').getBoundingClientRect(),copy=document.querySelector('.ad-deal-copy').getBoundingClientRect();return [...document.querySelectorAll('.ad-deal-art span')].every(card=>{const r=card.getBoundingClientRect();return r.left>=box.left+4&&r.right<=box.right-4&&r.top>=box.top&&r.bottom<=box.bottom&&(r.right<=copy.left-2||r.bottom<=copy.top-8)})})()");
        if(!fanWide||!fanNarrow)throw Error('Hovered mystery cards clip or overlap text: '+JSON.stringify({fanWide,fanNarrow}));
        await win.webContents.executeJavaScript("document.querySelector('#smoke-fan').remove();document.querySelector('#main').innerHTML='';");console.log('AniDeck progressive profile and hover: '+JSON.stringify({progressive,fanWide,fanNarrow}));
        const reveal=await win.webContents.executeJavaScript(`(async()=>{const old={entries:DeckUI.entries,motion:DeckUI.rollMotion,item:DeckUI.rouletteItem},results=[];try{DeckUI.entries=async()=>({entries:[{anime:{id:'al:1',title:'A new pick for tonight',poster:'brand/mark.svg',episodes:12}}]});for(const width of [580,360]){document.querySelector('#main').innerHTML='<div class="page" style="max-width:650px;margin:auto">'+DeckUI.widget({id:'roulette',span:6})+'</div>';document.querySelector('.ad-widget').style.width=width+'px';let before,turnedOut=false,turnedIn=false;DeckUI.rollMotion=async function(element,frames,options){const gathered=element?.matches('.ad-deal-art span:last-child')&&frames.at(-1).transform==='translateX(0px) rotate(0deg)';if(element?.matches('.ad-deal-art span:last-child')&&frames.at(-1).transform?.includes('rotateY(90deg)'))turnedOut=true;if(element?.matches('.ad-cover'))turnedIn=true;await old.motion.call(this,element,frames,options);if(gathered){const r=element.getBoundingClientRect();before={x:r.x,y:r.y,width:r.width,height:r.height};}};await DeckUI.roll();const poster=document.querySelector('.ad-roulette .ad-cover'),r=poster?.getBoundingClientRect();results.push({width,readable:!!r&&r.width>=96&&r.height>=144,sameSize:!!r&&Math.abs(r.width-before.width)<1&&Math.abs(r.height-before.height)<1,samePosition:!!r&&Math.abs(r.x-before.x)<1&&Math.abs(r.y-before.y)<1,turnedOut,turnedIn,detailsVisible:getComputedStyle(document.querySelector('.ad-roulette-info')).opacity==='1'});}return results;}finally{DeckUI.entries=old.entries;DeckUI.rollMotion=old.motion;DeckUI.rouletteItem=old.item;}})()`);
        if(reveal.some(result=>!result.readable||!result.sameSize||!result.samePosition||!result.turnedOut||!result.turnedIn||!result.detailsVisible))throw Error('Shuffle reveal changes card size or position: '+JSON.stringify(reveal));
        fs.writeFileSync(path.join(visualDir,'AniDeck-deal-reveal-preview.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
        await win.webContents.executeJavaScript("document.querySelector('#main').innerHTML='';");console.log('AniDeck shuffle reveal: '+JSON.stringify(reveal));
        const receiverServer=createCasting({port:0,host:'127.0.0.1'}),receiverStatus=await receiverServer.start();
        const tv=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}});tv.webContents.on('paint',()=>{});tv.webContents.setFrameRate(30);
        try{
          receiverServer.setPairing(false);await tv.loadURL('http://127.0.0.1:'+receiverStatus.port);
          const codeVisible=()=>tv.webContents.executeJavaScript("!document.getElementById('code').hidden");
          await new Promise(resolve=>setTimeout(resolve,250));if(await codeVisible())throw Error('Closed pairing still shows a TV code');
          receiverServer.setPairing(true);await new Promise(resolve=>setTimeout(resolve,1200));if(!await codeVisible())throw Error('Opening pairing did not show a fresh TV code');
          receiverServer.setPairing(false);await new Promise(resolve=>setTimeout(resolve,1200));if(await codeVisible())throw Error('Closing pairing did not clear the TV code');
          await tv.webContents.executeJavaScript('location.reload()');await new Promise(resolve=>setTimeout(resolve,1200));if(await codeVisible())throw Error('Refresh reopened closed pairing');
          receiverServer.setPairing(true);await new Promise(resolve=>setTimeout(resolve,1200));const code=await tv.webContents.executeJavaScript("document.getElementById('code').textContent");receiverServer.connect(code);receiverServer.setPairing(false);await new Promise(resolve=>setTimeout(resolve,250));
          const before=await tv.webContents.executeJavaScript("sessionStorage.getItem('anideckReceiverSession')");await tv.webContents.executeJavaScript('location.reload()');await new Promise(resolve=>setTimeout(resolve,1200));const after=await tv.webContents.executeJavaScript("sessionStorage.getItem('anideckReceiverSession')");if(!receiverServer.status().screen?.connected||before!==after||await codeVisible())throw Error('Refreshing a paired TV lost its session');
          receiverServer.disconnect();await new Promise(resolve=>setTimeout(resolve,1200));
          const branded=await tv.webContents.executeJavaScript("[...document.querySelectorAll('.receiver-brand img')].every(img=>img.complete&&img.naturalWidth>0)");if(!branded)throw Error('TV brand assets did not load');
          fs.writeFileSync(path.join(visualDir,'AniDeck-TV-waiting-preview.png'),(await tv.webContents.capturePage()).toPNG());
          console.log('AniDeck native TV setup: '+JSON.stringify({brandLoaded:true,closedCodeHidden:true,reopenedCodeVisible:true,closedAgainHidden:true,refreshKeepsPairing:true,closedRefreshHasNoCode:true}));
        }finally{tv.destroy();await receiverServer.stop();}
      }
      if(process.argv.includes('--anideck-checks')){
        const report=await win.webContents.executeJavaScript('(async()=>{await SystemChecks.open();return SystemChecks.last;})()');
        if(!report?.rows?.length)throw Error('System checks did not produce a report');
        console.log('AniDeck live readiness: '+JSON.stringify(report));
        const capture=process.argv.find(arg=>arg.startsWith('--anideck-checks-capture='));
        if(capture){await win.webContents.executeJavaScript("document.querySelector('#splash').hidden=true;for(const a of document.getAnimations()){try{if(a.effect?.getTiming().iterations!==Infinity)a.finish();}catch{}}");await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.resolve(capture.slice('--anideck-checks-capture='.length)),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
      }
      console.log('AniDeck native smoke check passed');
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
} // <-- This closes createWindow() properly

// ---------- IPC ----------
ipcMain.handle('config:get', () => ({...readJson(CONFIG_FILE, {}),...(readJson(path.join(__dirname,'package.json'),{}).testBuild?{testBuild:readJson(path.join(__dirname,'package.json'),{}).testBuild}:{})}));
ipcMain.handle('store:get', (_e, key) => getStore()[key]);
ipcMain.handle('store:set', (_e, key, value) => {
  if (value === undefined || value === null) delete getStore()[key]; else getStore()[key] = value;
  saveStore();
  return true;
});
ipcMain.handle('secret:get', (_e, key) => readSecrets()[key] ?? null);
ipcMain.handle('secret:set', (_e, key, value) => { writeSecret(key, value); return true; });

// ---------- Cloudflare fallback ----------
// If a site answers with Cloudflare's "Just a moment..." check, redo the request
// from inside a hidden browser window on that site. A real page passes the check
// on its own, then the request runs from there like it would in your browser.
const challengeWindows = new Map();
function isChallenge(status, text) {
  return (status === 403 || status === 503) && /just a moment|cf-chl|challenge-platform/i.test(text || '');
}
async function prepareChallengeWindow(origin) {
  let w = challengeWindows.get(origin);
  if (w && !w.isDestroyed()) return w;
  w = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { contextIsolation: true, sandbox: true, partition: 'persist:anishelf-web' } });
  w.webContents.setUserAgent(CHROME_UA);
  challengeWindows.set(origin, w);
  await w.loadURL(origin + '/').catch(() => {});
  // Wait until the challenge page has gone away (up to ~20s).
  for (let i = 0; i < 40; i++) {
    const title = await w.webContents.executeJavaScript('document.title').catch(() => '');
    if (!/just a moment/i.test(title)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return w;
}
const challengePending = new Map();
async function getChallengeWindow(origin) {
  if(challengePending.has(origin))return challengePending.get(origin);
  const pending=prepareChallengeWindow(origin);challengePending.set(origin,pending);
  try{return await pending;}finally{if(challengePending.get(origin)===pending)challengePending.delete(origin);}
}
async function requestViaBrowser(url, method, headers, body) {
  const origin = new URL(url).origin;
  const w = await getChallengeWindow(origin);
  const script = `fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: ${JSON.stringify(headers || {})}, body: ${body === undefined ? 'undefined' : JSON.stringify(body)}, credentials: 'include' })
    .then(async (r) => ({ ok: r.ok, status: r.status, text: await r.text() }))
    .catch((e) => ({ ok: false, status: 0, error: String(e) }))`;
  return w.webContents.executeJavaScript(script, true);
}

ipcMain.handle('http:request', async (_e, req) => {
  const { url, method = 'GET', headers = {}, body, timeout } = req || {};
  if (!/^https?:\/\//i.test(String(url))) return { ok: false, status: 0, error: 'Invalid URL' };
  try {
    // net.fetch uses Chrome's own network stack (same as a browser tab), which
    // Cloudflare accepts; plain Node fetch gets the "Just a moment..." block page.
    const res = await net.fetch(url, {
      method,
      headers: { 'User-Agent': CHROME_UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
      body: body === undefined ? undefined : body,
      signal: AbortSignal.timeout(timeout || 20000),
      cache: 'no-store', // always live data, never a stale cached copy
      bypassCustomProtocolHandlers: true,
    });
    const text = await res.text();
    if (req.allowChallenge !== false && isChallenge(res.status, text)) {
      const { 'User-Agent': _ua, ...plain } = headers;
      return await requestViaBrowser(url, method, plain, body);
    }
    return { ok: res.ok, status: res.status, text, headers: Object.fromEntries(['retry-after','x-ratelimit-reset','x-ratelimit-remaining'].map(name=>[name,res.headers.get(name)]).filter(([,value])=>value!==null)) };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
});

// Sign-in window for services that send you back to a redirect address with a token (AniList).
// Resolves with that redirect address, or null if the window is closed first.
ipcMain.handle('oauth:open', (_e, { url, redirectPrefix } = {}) => new Promise((resolve) => {
  if (!/^https:\/\//i.test(String(url)) || !/^https:\/\//i.test(String(redirectPrefix))) return resolve(null);
  const parent = BrowserWindow.getAllWindows().find((w) => w.isVisible());
  const w = new BrowserWindow({ width: 520, height: 760, parent, modal: false, title: 'Sign in', autoHideMenuBar: true, backgroundColor: '#0f0e14',
    webPreferences: { partition: 'persist:anishelf-oauth', contextIsolation: true, sandbox: true } });
  w.webContents.setUserAgent(CHROME_UA);
  const flow=require('./src/oauth-flow.cjs').oauthFlow(url,redirectPrefix);
  w.webContents.setWindowOpenHandler(({url:next})=>{if(flow.sameProvider(next))setImmediate(()=>{if(!w.isDestroyed())w.loadURL(next).catch(()=>{});});else if(/^https:\/\//i.test(next))shell.openExternal(next);return {action:'deny'};});
  let done = false;
  const finish = (v) => { if (done) return; done = true; resolve(v); if (!w.isDestroyed()) w.close(); };
  const check = (u) => { if (flow.redirect(u)) finish(u); };
  w.webContents.on('will-redirect', (_ev, u) => check(u));
  w.webContents.on('will-navigate', (_ev, u) => check(u));
  const navigated=(_ev,u)=>{check(u);if(!done&&flow.visit(u))setImmediate(()=>{if(!done&&!w.isDestroyed())w.loadURL(url).catch(()=>{});});};
  w.webContents.on('did-navigate',navigated);
  w.webContents.on('did-navigate-in-page',navigated);
  w.on('closed', () => finish(null));
  w.loadURL(url).catch(() => {});
}));

ipcMain.handle('shell:open', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url);
  return true;
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('system:check', () => require('./src/system-checks-native.cjs').storageCheck(safeStorage,dataDir()));
ipcMain.handle('win:fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on); return true; });
// Episode downloads: Electron asks where to save, and the URL (with its token) never leaves the app.
ipcMain.handle('file:download', (e, url) => {
  if (!/^https?:\/\//i.test(String(url))) return false;
  e.sender.downloadURL(url);
  return true;
});

// Exports are saved only to the location explicitly chosen in the native save dialog.
ipcMain.handle('artifact:save', async (event, artifact) => {
  try {
    const prepared = require('./src/artifactExport').prepareArtifact(artifact);
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { defaultPath: prepared.name, filters: prepared.filters });
    if (result.canceled || !result.filePath) return { ok: true, cancelled: true };
    await fs.promises.writeFile(result.filePath, prepared.bytes);
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message }; }
});

// ---------- release notifications (GitHub, manual installation) ----------
let updateState={state:'idle'},releaseChecker=null;
const updateMode=()=>({packaged:app.isPackaged,channel:readJson(CONFIG_FILE,{}).testBuild||require('./package.json').testBuild?'test':app.isPackaged?'release':'development',autoCheck:app.isPackaged&&!smokeTest&&!readJson(CONFIG_FILE,{}).testBuild&&!require('./package.json').testBuild});
function sendUpdate(state){updateState={...state,...updateMode()};for(const w of BrowserWindow.getAllWindows())w.webContents.send('update:status',updateState);}
function getReleaseChecker(){
 if(!releaseChecker)releaseChecker=require('./src/release-check.cjs').createReleaseChecker({version:app.getVersion(),fetch:(url,options)=>net.fetch(url,options),onState:sendUpdate});
 return releaseChecker;
}
function setupUpdater(){
 const checker=getReleaseChecker();sendUpdate(checker.snapshot());
 if(!updateMode().autoCheck)return;
 setTimeout(()=>checker.check(),5000).unref();
 setInterval(()=>checker.check(),4*60*60*1000).unref();
}
ipcMain.handle('update:state',()=>({...getReleaseChecker().snapshot(),...updateMode()}));
ipcMain.handle('update:check',async()=>({...await getReleaseChecker().check({force:true}),...updateMode()}));
async function openCurrentRelease(){
 const state=getReleaseChecker().snapshot();if(state.state!=='available'||!state.url)return false;
 await shell.openExternal(state.url);return true;
}
ipcMain.handle('update:open',openCurrentRelease);
// Keep the bridge name compatible; older renderers can only open release notes now.
ipcMain.handle('update:install',openCurrentRelease);

// ---------- Streaming ----------
const StreamResolver = require('./src/streamResolver.js');
const streamResolver = new StreamResolver();
streamResolver.init();

// Expose resolver methods
ipcMain.handle('stream:resolve', async (_e, source, episodeData) => {
  try {
    const url = await streamResolver.resolveStream(source, episodeData);
    return url;
  } catch (error) {
    console.error('Error resolving stream:', error);
    return null;
  }
});

ipcMain.handle('cancelStreamResolution', () => { streamResolver.cancelPending(); return true; });

// Used by window.native.resolveStream (show page + in-player server switcher). Errors reach the renderer.
ipcMain.handle('stream:episodes', async (_e, params) => streamResolver.runResolution({provider:params?.provider,title:params?.title,audio:params?.audio,seasonNumber:params?.seasonNumber,catalogOnly:true}));
ipcMain.handle('resolveStream', async (_e, params) => {
  try { return await streamResolver.resolve(params); }
  catch (err) { if(err.name!=='AbortError')console.error('[Main IPC] resolveStream error:', err); throw err; }
});

ipcMain.handle('stream:getQualityOptions', async (_e, source, episodeData) => {
  try {
    const options = await streamResolver.getQualityOptions(source, episodeData);
    return options;
  } catch (error) {
    console.error('Error getting quality options:', error);
    return [];
  }
});

// ---------- Cast to TV: browser receiver, no PC-to-PC account sharing ----------
const { createCasting } = require('./src/casting/server.js');
const casting = createCasting({ pairingEnabled:false,fetchUpstream: (url, options) => net.fetch(url, options) });
const mediaRelay = require('./src/mediaRelay').createMediaRelay({fetchUpstream:(url,options)=>net.fetch(url,options)});
ipcMain.handle('media:relay', (_event, media) => mediaRelay.load(media));
ipcMain.handle('media:stop', () => mediaRelay.stop());
app.on('before-quit', () => { mediaRelay.stop().catch(()=>{}); });
const castCall = fn => async (_event, ...args) => { try { return { ok: true, value: await fn(...args) }; } catch (error) { return { ok: false, error: error.message }; } };
ipcMain.handle('cast:start', castCall(() => casting.start()));
ipcMain.handle('cast:pairing', castCall(enabled => casting.setPairing(enabled)));
ipcMain.handle('cast:status', castCall(() => casting.status()));
ipcMain.handle('cast:connect', castCall(code => casting.connect(code)));
ipcMain.handle('cast:load', castCall(media => casting.load(media)));
ipcMain.handle('cast:command', castCall((action, value) => casting.command(action, value)));
ipcMain.handle('cast:disconnect', castCall(() => casting.disconnect()));
ipcMain.handle('cast:stop', castCall(() => casting.stop()));
app.on('before-quit', () => { casting.stop(); });

// ---------- Kitsu/AniList Website Opening ----------
// Determine which website to open based on which account is signed in
ipcMain.handle('website:open', async (_e, animeId) => {
  try {
    // Check if user is signed into AniList
    const anilistToken = await readSecrets().anilistAuth;
    const kitsuToken = await readSecrets().kitsuAuth;

    let url = '';

    if (anilistToken) {
      // Open in AniList
      url = `https://anilist.co/anime/${animeId}`;
    } else if (kitsuToken) {
      // Open in Kitsu
      url = `https://kitsu.io/anime/${animeId}`;
    } else {
      // Default to Kitsu if no account is signed in
      url = `https://kitsu.io/anime/${animeId}`;
    }

    shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('Error opening website:', error);
    return false;
  }
});
function applicationMenuTemplate(platform) {
  if (platform !== 'darwin') return null;
  return [{role:'appMenu'},{role:'editMenu'},{label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},{role:'windowMenu'}];
}
app.whenReady().then(() => {
  const menu = applicationMenuTemplate(process.platform);
  Menu.setApplicationMenu(menu ? Menu.buildFromTemplate(menu) : null);
  createWindow();
  setupUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
