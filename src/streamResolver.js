// File: src/streamResolver.js
const { app, BrowserWindow, net, session } = require('electron');
const {discoverSubtitleTracks}=require('./providerSubtitles');

const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '124.0.0.0'} Safari/537.36`;

// Cache verified title pages, never expiring media URLs.
const anikotoSessions = [];
function acquireAnikotoSession() {
  let slot = anikotoSessions.find(s => !s.busy);
  if (!slot) { slot = { partition: 'anikoto-pool-' + anikotoSessions.length, busy: false }; anikotoSessions.push(slot); }
  slot.busy = true;
  return slot;
}
async function loadAnikotoPage(win, url, referrer) {
  const contents=win.webContents;
  await new Promise((resolve, reject) => {
    let timer, settled = false;
    const done = err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // BrowserWindow.webContents cannot be accessed after its closed event.
      try{contents.removeListener('dom-ready',ready);}catch{}
      try{win.removeListener?.('closed',closed);}catch{}
      if (err) reject(err); else resolve();
    };
    const ready = () => done();
    const closed = () => done(new Error('Anikoto window closed'));
    win.once?.('closed', closed);
    contents.once('dom-ready', ready);
    timer = setTimeout(() => done(new Error('Anikoto page navigation timed out')), 30000);
    try{Promise.resolve(win.loadURL(url,referrer?{httpReferrer:referrer}:undefined)).then(ready,done);}catch(error){done(error);}
  });
}
const dynamicStreamHeaders = new Map();
let headerHookInstalled = false;

function ensureStreamHeaderHook() {
  if (!app.isReady()) {
    app.whenReady().then(() => ensureStreamHeaderHook());
    return;
  }
  if (headerHookInstalled) return;
  headerHookInstalled = true;

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const u = new URL(details.url);
      const requestHeaders = { ...details.requestHeaders };

      for (const [domainPattern, headers] of dynamicStreamHeaders.entries()) {
        if (u.hostname.includes(domainPattern) || details.url.includes(domainPattern)) {
          Object.assign(requestHeaders, headers);
          break;
        }
      }

      if (u.hostname.includes('kwik') || u.hostname.includes('owocdn') || u.hostname.includes('vault')) {
        requestHeaders['Referer'] = requestHeaders['Referer'] || 'https://kwik.si/';
        requestHeaders['Origin'] = requestHeaders['Origin'] || 'https://kwik.si';
        requestHeaders['User-Agent'] = CHROME_UA;

      } else if (u.hostname.includes('ani.pm')) {
        requestHeaders['Referer'] = 'https://ani.pm/';
        requestHeaders['User-Agent'] = CHROME_UA;
      }

      callback({ cancel: false, requestHeaders });
    } catch {
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  });
}

function unpackPacker(str) {
  try {
    const match = str.match(/}\('(.+)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
    if (!match) return null;
    let [_, p, a, c, k] = match;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    k = k.split('|');

    const e = (c) => (c < a ? '' : e(parseInt(c / a, 10))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    const dict = {};
    while (c--) dict[e(c)] = k[c] || e(c);
    return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
  } catch {
    return null;
  }
}

class StreamResolver {
  constructor() { this.prefetchedStreams = new Map(); this.activeTasks = new Set(); this.pendingStreams = new Map(); }

  init() {
    ensureStreamHeaderHook();
  }

  createResolverWindow(options) {
    this.signal?.throwIfAborted();
    const win = new BrowserWindow(options);
    this.windows?.add(win);
    win.on?.('closed', () => this.windows?.delete(win));
    return win;
  }

  cancelPending() {
    this.prefetchedStreams.clear();
    this.pendingStreams.clear();
    for (const task of this.activeTasks) {
      const reason = new Error('Stream resolution cancelled'); reason.name = 'AbortError';
      task.controller.abort(reason);
      for (const win of task.worker.windows) if (!win.isDestroyed()) win.destroy();
    }
  }

  async runResolution(params) {
    const controller = new AbortController();
    const worker = Object.create(this);
    worker.signal = controller.signal;
    worker.windows = new Set();
    const task = { controller, worker };
    this.activeTasks.add(task);
    const deadline=params.catalogOnly?setTimeout(()=>controller.abort(new Error('Episode listing timed out')),5500):null;
    let abortListener;
    const cancelled = new Promise((_, reject) => {
      abortListener = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    try { return await Promise.race([worker.resolveUncached(params), cancelled]); }
    finally {
      if(deadline)clearTimeout(deadline);
      controller.signal.removeEventListener('abort', abortListener);
      this.activeTasks.delete(task);
      for (const win of worker.windows) if (!win.isDestroyed()) win.destroy();
    }
  }

  async resolve(params = {}) {
    const key=JSON.stringify([params.provider,params.title,params.episodeNum,params.audio,params.seasonNumber,params.absoluteEpisodeNum,params.episodeTitle]);
    const pending=this.pendingStreams.get(key);
    if(params.prefetch)return pending||this.resolveCached(params);
    if(pending)return pending;
    const promise=this.resolveCached(params);
    this.pendingStreams.set(key,promise);
    try{return await promise;}finally{if(this.pendingStreams.get(key)===promise)this.pendingStreams.delete(key);}
  }

  async resolveCached(params = {}) {
    const key = JSON.stringify([params.provider, params.title, params.episodeNum, params.audio, params.seasonNumber, params.absoluteEpisodeNum, params.episodeTitle]);
    const saved = this.prefetchedStreams.get(key);
    if (saved && Date.now() - saved.at < 180000) {
      try {
        const result = await saved.promise;
        if (!params.prefetch) {
          this.prefetchedStreams.delete(key);
          if (result.headers) dynamicStreamHeaders.set(new URL(result.streamUrl).hostname, result.headers);
          console.log('[StreamResolver] Using preloaded episode');
        }
        return result;
      } catch (err) { this.prefetchedStreams.delete(key); if (err.name === 'AbortError') throw err; }
    }
    if (!params.prefetch) return this.runResolution(params);
    if (this.prefetchedStreams.size >= 20) this.prefetchedStreams.delete(this.prefetchedStreams.keys().next().value);
    const entry = { at: Date.now(), promise: this.runResolution(params) };
    this.prefetchedStreams.set(key, entry);
    try { return await entry.promise; }
    catch (err) { if (this.prefetchedStreams.get(key) === entry) this.prefetchedStreams.delete(key); throw err; }
  }

  async resolveUncached(params = {}) {
    this.signal?.throwIfAborted();
    ensureStreamHeaderHook();
    const requested=String(params.provider||'anikoto').toLowerCase();
    const provider=requested==='animepahe'?'hianime':requested; // Retired selections migrate without contacting the old site.
    const title = String(params.title || '').trim();
    const episodeNum = params.episodeNum == null ? 1 : Number(params.episodeNum);
    if (!Number.isInteger(episodeNum) || episodeNum < 1) throw new Error('Invalid episode number');
    const audio = String(params.audio || 'sub').toLowerCase();
    if (!['sub', 'dub'].includes(audio)) throw new Error('Unsupported audio selection: ' + audio);

    if (!title) throw new Error('Missing anime title');
    console.log(`[StreamResolver] Resolving "${title}" Ep ${episodeNum} (${audio}) via ${provider}`);

    let res, resolvedProvider=provider;
    if (provider === 'anikoto') res = await this.resolveAnikoto(title, episodeNum, audio, params);
    else if (provider === 'aniwatch') res = await this.resolveAniWatch(title, episodeNum, audio, params);
    else if (provider === 'hianime') res = await this.resolveAniWatch(title,episodeNum,audio,params,'hianime');
    else if (provider === 'anipm') throw new Error('Ani.pm is unavailable: its playback integration has not been implemented. Choose Anikoto or HiAnime.');
    else throw new Error('Unsupported streaming provider: ' + provider);
    if(params.catalogOnly)return {episodes:[...new Set((res?.episodes||[]).map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=3000))].sort((a,b)=>a-b),provider};
    if (!res?.streamUrl) throw new Error('No playable stream found on ' + provider);
    this.signal?.throwIfAborted();
    if (res.headers && !params.prefetch) dynamicStreamHeaders.set(new URL(res.streamUrl).hostname, res.headers);
    return { ...res, provider:resolvedProvider };
  }

  async resolveAnikoto(title,episodeNum,audio,request={}) {
    const season=request.seasonNumber??1;if(!Number.isInteger(season)||season<1)throw Error('Specials require their own provider title');
    return this.resolveAniWatch(title,episodeNum,audio,request,'anikoto');
  }

  async resolveAniWatch(title, episodeNum, audio, request = {}, providerId='aniwatch') {
    const provider = require(providerId==='anikoto'?'./anikoto':providerId==='hianime'?'./hianime':'./aniwatch');
    const label=providerId==='anikoto'?'Anikoto':providerId==='hianime'?'HiAnime':'AniWatch';
    const season = request.seasonNumber == null ? 1 : Number(request.seasonNumber);
    if (!Number.isInteger(season) || season < 1) throw new Error(label+' specials require their own title');
    let protocolEmbeds;
    if(provider.metadata){
      protocolEmbeds=await provider.metadata(async url=>{this.signal?.throwIfAborted();const response=await net.fetch(url,{headers:{'User-Agent':CHROME_UA,Referer:provider.BASE+'/',...(providerId==='anikoto'?{'X-Requested-With':'XMLHttpRequest'}:{})},signal:this.signal?AbortSignal.any([this.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});if(!response.ok)throw Error(label+' catalog request unavailable');const text=await response.text();if(text.length>3000000||/<title>\s*(?:just a moment|access denied)|verify you are human/i.test(text.slice(0,1200)))throw Error(label+' is temporarily unavailable');return text;},title,episodeNum,audio,request);
      if(request.catalogOnly)return protocolEmbeds;
    }
    const slot = acquireAnikotoSession();
    const win = this.createResolverWindow({ show: false, width: 1280, height: 720,
      webPreferences: { partition: slot.partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
        backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
    const wc = win.webContents, ses = wc.session;
    wc.setUserAgent(CHROME_UA);
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    let captureEnabled = false, captured = null;
    const allowedOrigins = new Set([provider.BASE]);
    wc.on('will-navigate', (event, url) => {
      try { if (!allowedOrigins.has(new URL(url).origin)) event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    const evaluate = async code => {
      let timer;
      try { return await Promise.race([wc.executeJavaScript(code, true), new Promise((_,reject) => {
        timer = setTimeout(() => reject(new Error(label+' page script timed out')), 5000);
      })]); } finally { clearTimeout(timer); }
    };
    ses.webRequest.onBeforeSendHeaders({urls:['*://*/*']}, (details, callback) => {
      if (captureEnabled && !captured && /\.(m3u8|mp4)(\?|$)/i.test(details.url) && !/preview|thumb|\/ads?\//i.test(details.url)) {
        const headers = {'User-Agent':CHROME_UA};
        for (const [key,value] of Object.entries(details.requestHeaders)) if (/^(referer|origin|user-agent)$/i.test(key)) headers[key] = value;
        captured = {streamUrl:details.url,isHLS:/\.m3u8/i.test(details.url),headers};
      }
      callback({cancel:false,requestHeaders:details.requestHeaders});
    });
    const completeStream=async stream=>{
      if(providerId==='aniwatch')return stream;
      let subtitles=[];
      for(let attempt=0;attempt<4;attempt++){
        this.signal?.throwIfAborted();const frames=wc.mainFrame?.framesInSubtree||[wc];
        const groups=await Promise.race([Promise.all(frames.slice(0,12).map(frame=>frame.executeJavaScript(`(${discoverSubtitleTracks.toString()})()`,true).catch(()=>[]))),new Promise(resolve=>setTimeout(()=>resolve([]),500))]);
        subtitles=[...new Map(groups.flat().filter(t=>t?.url).map(t=>[t.url,t])).values()].slice(0,20);if(subtitles.length)break;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,150));
      }
      return {...stream,subtitles:subtitles.map(t=>({...t,headers:stream.headers||{}}))};
    };
    try {
      const embeds=protocolEmbeds;
      let lastError;
      for (const embed of embeds) {
        this.signal?.throwIfAborted();
        captureEnabled = false; captured = null;
        allowedOrigins.add(new URL(embed).origin);
        console.log('[StreamResolver] '+label+' player:', new URL(embed).hostname, audio);
        try {
          captureEnabled = true;
          await loadAnikotoPage(win, embed);
          const until = Date.now() + 12000;
          const visited = new Set([embed]);
          while (Date.now() < until) {
            this.signal?.throwIfAborted();
            if (captured) return await completeStream(captured);
            const player = await evaluate(`(() => {
              const frame = [...document.querySelectorAll('iframe[src]')].find(f => f.offsetWidth > 200 && /^https:/.test(f.src));
              const play = document.querySelector('.jw-icon-display, .vjs-big-play-button, .play-button, .btn-play, video');
              let click;
              if (play && !play.dataset.anideckStarted) {
                play.dataset.anideckStarted = '1';play.setAttribute('data-anideck-activate','1');
                const r = play.getBoundingClientRect();
                if (r.width && r.height) click = {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
              }
              const error = /can't find the file|file (?:was |has been )?(?:removed|deleted)|error code:\s*410/i.test(document.body?.innerText || '');
              return {frame:frame?.src,click,error};
            })()`);
            if (captured) return await completeStream(captured);
            if (player.error) throw new Error('The embedded player reports this file is unavailable');
            if (player.frame && !visited.has(player.frame) && visited.size < 4) {
              visited.add(player.frame); allowedOrigins.add(new URL(player.frame).origin);
              await loadAnikotoPage(win, player.frame);
            } else if (player.click) {
              const activated=await evaluate(`(()=>{const el=document.querySelector('[data-anideck-activate="1"]');if(!el)return false;el.removeAttribute('data-anideck-activate');el.click();return true;})()`);
              if(!activated){wc.sendInputEvent({type:'mouseMove',...player.click});
              wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...player.click});
              wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...player.click});}
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error('Player did not supply a media stream');
        } catch (err) { this.signal?.throwIfAborted(); lastError = err; }
      }
      throw new Error(label+' players failed: ' + (lastError?.message || 'No media stream'));
    } finally {
      captureEnabled = false;
      ses.webRequest.onBeforeSendHeaders(null);
      slot.busy = false;
      if (!win.isDestroyed()) win.destroy();
    }
  }
  async resolveStream(source, episodeData) {
    if (source && typeof source === 'object' && !episodeData) {
      return this.resolve(source);
    }
    return this.resolve({ provider: source, ...(episodeData || {}) });
  }

  async getQualityOptions() {
    return ['1080p', '720p', '480p'];
  }

}

const instance = new StreamResolver();
module.exports = StreamResolver;
module.exports.loadProviderPage = loadAnikotoPage;
module.exports.resolve = (params) => instance.resolve(params);
