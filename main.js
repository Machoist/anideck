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
    },
  });
  mainWin = win;
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
      // Exercise the real guest/setup controls with cloud/catalog reads isolated.
      // Never create a backend profile or use an existing provider session in this test.
      const setup = await win.webContents.executeJavaScript(`(async()=>{
        Cloud.loadMe=async()=>null;Cloud.enabled=()=>true;Notifier.start=()=>{};
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
      if(process.argv.includes('--anideck-checks')){
        const report=await win.webContents.executeJavaScript('(async()=>{await SystemChecks.open();return SystemChecks.last;})()');
        if(!report?.rows?.length)throw Error('System checks did not produce a report');
        console.log('AniDeck live readiness: '+JSON.stringify(report));
        const capture=process.argv.find(arg=>arg.startsWith('--anideck-checks-capture='));
        if(capture){await win.webContents.executeJavaScript("document.querySelector('#splash').hidden=true");await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});await new Promise(resolve=>setTimeout(resolve,250));fs.writeFileSync(path.resolve(capture.slice('--anideck-checks-capture='.length)),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
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
    return { ok: res.ok, status: res.status, text };
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

// ---------- auto-updates (GitHub Releases) ----------
let updateState = { state: 'idle' };
function sendUpdate(state) {
  updateState = state;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', state);
}
let autoUpdater = null;
function setupUpdater() {
  if (!app.isPackaged) return; // only installed copies update themselves
  if (readJson(CONFIG_FILE, {}).testBuild || readJson(path.join(__dirname,'package.json'),{}).testBuild) { updateState = { state: 'test' }; return; } // test installers never auto-update
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'latest' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ ...updateState, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => sendUpdate({ state: 'error', message: e?.message || String(e) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 4 * 60 * 60 * 1000);
}
ipcMain.handle('update:state', () => ({ ...updateState, packaged: app.isPackaged }));
ipcMain.handle('update:check', async () => {
  if (!autoUpdater) return { ...updateState,state:updateState.state==='test'?'test':'unavailable',packaged:app.isPackaged };
  try { await autoUpdater.checkForUpdates(); } catch (e) { sendUpdate({ state: 'error', message: e.message }); }
  return updateState;
});
ipcMain.handle('update:install', () => { if (autoUpdater && updateState.state === 'ready') autoUpdater.quitAndInstall(true, true); });

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
const casting = createCasting({ fetchUpstream: (url, options) => net.fetch(url, options) });
const mediaRelay = require('./src/mediaRelay').createMediaRelay({fetchUpstream:(url,options)=>net.fetch(url,options)});
ipcMain.handle('media:relay', (_event, media) => mediaRelay.load(media));
ipcMain.handle('media:stop', () => mediaRelay.stop());
app.on('before-quit', () => { mediaRelay.stop().catch(()=>{}); });
const castCall = fn => async (_event, ...args) => { try { return { ok: true, value: await fn(...args) }; } catch (error) { return { ok: false, error: error.message }; } };
ipcMain.handle('cast:start', castCall(() => casting.start()));
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
