// File: src/streamResolver.js
const { app, BrowserWindow, net, session } = require('electron');
const {discoverSubtitleTracks}=require('./providerSubtitles');

const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '124.0.0.0'} Safari/537.36`;

// Cache verified title pages, never expiring media URLs.
const anikotoPages = new Map();
const aniwatchPages = new Map();
const anikotoSessions = [];
function acquireAnikotoSession() {
  let slot = anikotoSessions.find(s => !s.busy);
  if (!slot) { slot = { partition: 'anikoto-pool-' + anikotoSessions.length, busy: false }; anikotoSessions.push(slot); }
  slot.busy = true;
  return slot;
}
async function loadAnikotoPage(win, url, referrer) {
  await new Promise((resolve, reject) => {
    let timer, settled = false;
    const done = err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      win.webContents.removeListener('dom-ready', ready);
      win.removeListener?.('closed', closed);
      if (err) reject(err); else resolve();
    };
    const ready = () => done();
    const closed = () => done(new Error('Anikoto window closed'));
    win.once?.('closed', closed);
    win.webContents.once('dom-ready', ready);
    timer = setTimeout(() => done(new Error('Anikoto page navigation timed out')), 30000);
    win.loadURL(url,referrer?{httpReferrer:referrer}:undefined).then(ready, done);
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
    const deadline=params.catalogOnly?setTimeout(()=>controller.abort(new Error('Episode listing timed out')),18000):null;
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

  // Add specific Anikoto resolution function
  async resolveAnikoto(title, episodeNum, audio, request = {}) {
    if (!['sub', 'dub'].includes(audio)) throw new Error(`Unsupported Anikoto audio: ${audio}`);
    if (!Number.isInteger(episodeNum) || episodeNum < 1) throw new Error('Invalid episode number');
    const startedAt = Date.now();
    const seasonNumber = request.seasonNumber == null ? 1 : Number(request.seasonNumber);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error('Specials require their own provider title; season 0 cannot be played as season 1');
    const titleKey = title.normalize('NFKC').trim().toLowerCase() + ':' + seasonNumber;
    const cachedPage = anikotoPages.get(titleKey);
    const titlePage = cachedPage && Date.now() - cachedPage.savedAt < 30 * 60 * 1000 ? cachedPage.url : null;
    let verifiedPage = titlePage;
    let seasonal = titlePage ? !!cachedPage.seasonal : false;
    const rememberPage = () => {
      if (verifiedPage) {
        if (anikotoPages.size >= 100) anikotoPages.delete(anikotoPages.keys().next().value);
        anikotoPages.set(titleKey, { url: verifiedPage, seasonal, savedAt: Date.now() });
      }
      console.log(`[StreamResolver] Anikoto resolved in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    };
    const base = 'https://anikototv.to';
    const searchUrl = `${base}/filter?keyword=${encodeURIComponent(title)}`;
    const sessionSlot = acquireAnikotoSession();
    const win = this.createResolverWindow({ show: false, width: 1280, height: 720,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
        partition: sessionSlot.partition, autoplayPolicy: 'no-user-gesture-required' } });
    const ses = win.webContents.session;
    win.webContents.setUserAgent(CHROME_UA);
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const playerFrames=new Set();
    let stage = titlePage ? 'episode' : 'search', selected = false, captured = null, lastStage = '', lastDiagnostic = 0;
    const options = { catalogOnly:!!request.catalogOnly, title, episodeNum, audio, seasonNumber, seasonal, episodeTitle: String(request.episodeTitle || ''), absoluteEpisodeNum: Number(request.absoluteEpisodeNum) || null };
    const inspect = (opts, currentStage) => {
      const clickTarget = el => { el.setAttribute('data-anideck-activate','1'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; };
      const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g,'season $1').replace(/\(tv\)/g,'').replace(/[^\p{L}\p{N}]/gu, '');
      if(opts.catalogOnly&&/just a moment|checking your browser|verify you are human/i.test(document.title+' '+(document.body?.innerText||'').slice(0,500)))return {error:'Server is temporarily unavailable'};
      if (currentStage === 'search') {
        const links = [...document.querySelectorAll('a[href*="/watch/"]')];
        const matches = (a, title) => [a.textContent, a.getAttribute('data-jp'), a.querySelector('img')?.alt].some(s => norm(s) === norm(title));
        const seasonHit = opts.seasonNumber > 1 ? links.find(a => matches(a, opts.title + ' Season ' + opts.seasonNumber)) : null;
        const hit = seasonHit || links.find(a => matches(a, opts.title));
        return hit ? { navigate: hit.href, seasonal: !!seasonHit || /season\s*\d+|\d+(?:st|nd|rd|th)\s*season/i.test(opts.title), stage: 'episode' } : opts.catalogOnly&&(links.length||/no results|nothing found/i.test(document.body?.innerText||'')) ? {episodes:[]} : { stage: 'search' };
      }
      if (currentStage === 'episode') {
        const episodes = [...document.querySelectorAll('#w-episodes a[data-num]')];
        if (!episodes.length) return { stage: 'episode' };
        if(opts.catalogOnly){if(opts.seasonNumber>1&&!opts.seasonal)return {error:'Cannot list this season without an exact provider season match'};return {episodes:episodes.filter(a=>a.getAttribute('data-'+opts.audio)!=='0').map(a=>Number(a.dataset.num))};}
        const titleHits = opts.episodeTitle ? episodes.filter(a => norm(a.parentElement?.getAttribute('title')) === norm(opts.episodeTitle)) : [];
        let number = opts.seasonal || opts.seasonNumber <= 1 ? opts.episodeNum : opts.absoluteEpisodeNum;
        const hit = titleHits.length === 1 ? titleHits[0] : number ? episodes.find(a => Number(a.dataset.num) === number) : null;
        if (!number && titleHits.length !== 1) return { error: 'Cannot map this season to a provider episode. An episode title match or absolute episode number is required.' };
        if (!hit) return { error: 'Requested episode is not available on this title page' };
        if (hit.getAttribute(`data-${opts.audio}`) === '0') return { error: `Episode ${opts.episodeNum} has no ${opts.audio} audio` };
        if (location.pathname !== new URL(hit.href).pathname) return { navigate: hit.href, stage: 'episode' };
        return { stage: 'audio' };
      }
      if (currentStage === 'audio') {
        const initialPlay = document.querySelector('#player .play');
        const servers=[...document.querySelectorAll(`#w-servers [data-type="${opts.audio}"] li[data-link-id]`)];
        const server=servers[0];
        if (!server) {
          // The site initializes its server list only after the initial play click.
          const start = document.querySelector('#player .play');
          if (start && !start.dataset.anideckStarted) {
            start.dataset.anideckStarted = '1';
            return { stage: 'audio', click: clickTarget(start), diagnostic: { action: 'initialize player' } };
          }
          return { stage: 'audio', diagnostic: { readyState: document.readyState, playButton: !!start, playClicked: !!start?.dataset.anideckStarted, serverGroups: [...document.querySelectorAll('#w-servers [data-type]')].map(el => el.dataset.type), serverCount: document.querySelectorAll('#w-servers li').length, playerText: document.querySelector('#player')?.innerText?.slice(0, 180) } };
        }
        if(initialPlay&&server.classList.contains('active')){initialPlay.dataset.anideckStarted='1';return {stage:'player',selected:true,click:clickTarget(initialPlay)};}
        const target=!initialPlay&&server.classList.contains('active')&&servers.length>1?servers[1]:server;
        target.scrollIntoView({block:'center'});return {stage:'player',selected:true,click:clickTarget(target)};
      }
      const play = document.querySelector('#player .play');
      if (play && !play.dataset.anideckStarted) { play.dataset.anideckStarted = '1'; return { stage: 'player', click: clickTarget(play) }; }
      const frame=[...document.querySelectorAll('#player iframe[src], iframe[src]')].find(f=>f.offsetWidth>200&&/^https:/.test(f.src));
      const button=document.querySelector('.jw-icon-display,.vjs-big-play-button,.play-button,.btn-play,video');
      let click;if(button&&!button.dataset.anideckStarted){button.dataset.anideckStarted='1';const r=button.getBoundingClientRect();if(r.width&&r.height)click=clickTarget(button);}
      const video = document.querySelector('#player video, #player source, video, source');
      const src = video?.currentSrc || video?.src;
      return { stage: 'player', frame:frame?.src,click,streamUrl: src && /^https?:/.test(src) ? src : null };
    };
    // Observe the headers sent by the embedded player, rather than guessing its Referer.
    const withSubtitles=async stream=>{
      let subtitles=[];
      // Metadata is normally ready with the playlist; briefly allow the player to create its tracks.
      for(let attempt=0;attempt<4;attempt++){
        this.signal?.throwIfAborted();
        const frames=win.webContents.mainFrame?.framesInSubtree||[win.webContents];
        const groups=await Promise.race([Promise.all(frames.slice(0,12).map(frame=>frame.executeJavaScript(`(${discoverSubtitleTracks.toString()})()`,true).catch(()=>[]))),new Promise(resolve=>setTimeout(()=>resolve([]),500))]);
        const unique=new Map();for(const track of groups.flat())if(track?.url)unique.set(track.url,track);subtitles=[...unique.values()].slice(0,20);
        if(subtitles.length)break;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,150));
      }
      console.log('[StreamResolver] Anikoto subtitle tracks:',subtitles.length);
      return {...stream,subtitles:subtitles.map(track=>({...track,headers:stream.headers||{}}))};
    };
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
      if (selected && !captured && /\.(m3u8|mp4)(\?|$)/i.test(details.url) && !/preview|thumb/i.test(details.url)) {
        const headers = { 'User-Agent': CHROME_UA };
        for (const [name, value] of Object.entries(details.requestHeaders)) {
          if (/^(referer|origin|user-agent)$/i.test(name)) headers[name] = value;
        }
        captured = { streamUrl: details.url, isHLS: /\.m3u8/i.test(details.url), headers };
        console.log('[StreamResolver] Anikoto captured media:', new URL(details.url).hostname, captured.isHLS ? 'HLS' : 'MP4');
      }
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
    try {
      console.log(`[StreamResolver] Anikoto search: ${searchUrl}`);
      if (titlePage) console.log('[StreamResolver] Anikoto using cached title page');
      await loadAnikotoPage(win, titlePage || searchUrl);
      const deadline = Date.now() + (request.catalogOnly?12000:45000);
      while (Date.now() < deadline) {
        this.signal?.throwIfAborted();
        if (captured) { console.log('[StreamResolver] Anikoto resolution complete'); rememberPage(); return await withSubtitles(captured); }
        if (stage !== lastStage) { console.log(`[StreamResolver] Anikoto stage: ${stage}`); lastStage = stage; }
        let inspectionTimer;
        const result = await Promise.race([
          win.webContents.executeJavaScript(`(${inspect.toString()})(${JSON.stringify(options)}, ${JSON.stringify(stage)})`, true),
          new Promise((_, reject) => { inspectionTimer = setTimeout(() => reject(new Error(`Anikoto page script stalled at ${stage} stage`)), 10000); })
        ]).finally(() => clearTimeout(inspectionTimer));
        if (result.diagnostic && Date.now() - lastDiagnostic > 5000) {
          console.log('[StreamResolver] Anikoto audio diagnostics:', JSON.stringify(result.diagnostic));
          lastDiagnostic = Date.now();
        }
        if (result.error) throw new Error(result.error);
        if(request.catalogOnly&&Array.isArray(result.episodes)){rememberPage();return {episodes:result.episodes};}
        if (result.selected) selected = true;
        if (result.click) {
          const activated=await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector('[data-anideck-activate="1"]');if(!el)return false;el.removeAttribute('data-anideck-activate');el.click();return true;})()`,true);
          console.log(`[StreamResolver] Anikoto input: ${stage} (${result.click.x}, ${result.click.y})`);
          if(!activated){win.webContents.sendInputEvent({ type: 'mouseMove', ...result.click });
          win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...result.click });
          win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...result.click });}
        }
        if (result.seasonal !== undefined) { seasonal = result.seasonal; options.seasonal = seasonal; }
        const previousStage = stage;
        stage = result.stage;
        if (result.navigate) {
          const next = new URL(result.navigate);
          if (next.origin !== base || !next.pathname.startsWith('/watch/')) throw new Error('Unexpected Anikoto navigation');
          if (previousStage === 'search') verifiedPage = next.href;
          await loadAnikotoPage(win, next.href);
        }
        if(selected&&result.frame&&!captured&&!result.streamUrl&&!playerFrames.has(result.frame)&&playerFrames.size<4){const frame=new URL(result.frame);if(frame.protocol!=='https:')throw new Error('Invalid embedded player address');playerFrames.add(result.frame);const referrer=win.webContents.getURL();await loadAnikotoPage(win,frame.href,referrer);}
        if (selected && result.streamUrl) { rememberPage(); return await withSubtitles({ streamUrl: result.streamUrl, isHLS: /\.m3u8/i.test(result.streamUrl), headers: { Referer: win.webContents.getURL(), 'User-Agent': CHROME_UA } }); }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Anikoto timed out at ${stage} stage: ${win.webContents.getURL()} (${title}, episode ${episodeNum}, ${audio})`);
    } catch (err) {
      anikotoPages.delete(titleKey);
      throw err;
    } finally {
      ses.webRequest.onBeforeSendHeaders(null);
      sessionSlot.busy = false;
      if (!win.isDestroyed()) win.destroy();
    }
  }

  async resolveAniWatch(title, episodeNum, audio, request = {}, providerId='aniwatch') {
    const provider = require(providerId==='hianime'?'./hianime':'./aniwatch');
    const label=providerId==='hianime'?'HiAnime':'AniWatch';
    const season = request.seasonNumber == null ? 1 : Number(request.seasonNumber);
    if (!Number.isInteger(season) || season < 1) throw new Error(label+' specials require their own title');
    const pageKey=JSON.stringify([providerId,title,season]);
    const savedPage=aniwatchPages.get(pageKey);
    let match=savedPage&&Date.now()-savedPage.at<1800000?savedPage.match:null;
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
    const inspect = () => evaluate(`(${provider.inspectPage.toString()})()`);
    const waitFor = async (key, stage) => {
      console.log('[StreamResolver] '+label+' stage:', stage);
      const until = Date.now() + 10000;
      do {
        this.signal?.throwIfAborted();
        if (win.isDestroyed()) throw new Error(label+' window closed');
        const data = await inspect();
        if (data.challenge) throw new Error(label+' is temporarily unavailable. Choose another server.');
        if (data[key].length || (key==='titles'&&data.emptySearch)) return data;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < until);
      throw new Error(`${label} timed out at ${stage} stage`);
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
      if(providerId!=='hianime')return stream;
      let subtitles=[];
      for(let attempt=0;attempt<4;attempt++){
        this.signal?.throwIfAborted();const frames=wc.mainFrame?.framesInSubtree||[wc];
        const groups=await Promise.race([Promise.all(frames.slice(0,12).map(frame=>frame.executeJavaScript(`(${discoverSubtitleTracks.toString()})()`,true).catch(()=>[]))),new Promise(resolve=>setTimeout(()=>resolve([]),500))]);
        subtitles=[...new Map(groups.flat().filter(t=>t?.url).map(t=>[t.url,t])).values()].slice(0,20);if(subtitles.length)break;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,150));
      }
      return {...stream,subtitles:subtitles.map(t=>({...t,headers:stream.headers||{}}))};
    };
    try {
      let embeds;
      if(providerId==='hianime'){embeds=await provider.metadata(async url=>{this.signal?.throwIfAborted();const response=await net.fetch(url,{headers:{'User-Agent':CHROME_UA,Referer:provider.BASE+'/'},signal:this.signal?AbortSignal.any([this.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});if(!response.ok)throw Error('HiAnime catalog request unavailable');return response.text();},title,episodeNum,audio,request);}
      else {
      if(!match){
        let lastError;
        for(const query of provider.searchTerms(title)){
          console.log('[StreamResolver] AniWatch search:',query);
          await loadAnikotoPage(win, `${provider.BASE}/?s=${encodeURIComponent(query)}`);
          const search=await waitFor('titles','search');
          try{match=provider.chooseTitle(search.titles,title,season);break;}catch(error){lastError=error;}
        }
        if(!match){if(request.catalogOnly&&/No exact title match/.test(lastError?.message||''))return {episodes:[]};throw lastError||new Error('AniWatch: No matching title found');}
      } else console.log('[StreamResolver] AniWatch using cached title page');
      await loadAnikotoPage(win, match.url);
      const titleData = await waitFor('episodes', 'episode');
      if(request.catalogOnly){if(season>1&&!match.seasonal)throw Error('AniWatch needs an exact season title to list episodes');return {episodes:titleData.episodes.map(e=>Number(e.number))};}
      const episodeUrl = provider.chooseEpisode(titleData.episodes, episodeNum, request, match.seasonal);
      if (new URL(wc.getURL()).pathname !== new URL(episodeUrl).pathname) await loadAnikotoPage(win, episodeUrl);
      const episodeData = await waitFor('servers', 'audio');
      if(aniwatchPages.size>=100)aniwatchPages.delete(aniwatchPages.keys().next().value);
      aniwatchPages.set(pageKey,{at:Date.now(),match});
      embeds = provider.chooseEmbeds(episodeData.servers, audio);
      }
      if(request.catalogOnly)return embeds;
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
                play.dataset.anideckStarted = '1';
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
              wc.sendInputEvent({type:'mouseMove',...player.click});
              wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...player.click});
              wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...player.click});
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error('Player did not supply a media stream');
        } catch (err) { this.signal?.throwIfAborted(); lastError = err; }
      }
      throw new Error('AniWatch players failed: ' + (lastError?.message || 'No media stream'));
    } catch(error){aniwatchPages.delete(pageKey);throw error;} finally {
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
module.exports.resolve = (params) => instance.resolve(params);
