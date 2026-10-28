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
      } else if (u.hostname.includes('animepahe')) {
        requestHeaders['Referer'] = 'https://animepahestore.net/';
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

function parseProviderJson(value, url) {
  let text = String(value || '').replace(/^\uFEFF/, '').trim();
  const pre = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (pre) text = pre[1].replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (/^</.test(text)) {
    const challenge = /just a moment|cf-chl|challenge-platform|ddos-guard|captcha|checking your browser|access denied/i.test(text);
    throw new Error(challenge ? 'AnimePahe requires a browser verification check. Try again after completing verification, or choose another server.' : 'AnimePahe returned a web page instead of search data. This mirror or API endpoint is unavailable. Try another server.');
  }
  try { return JSON.parse(text); }
  catch { throw new Error('AnimePahe returned unreadable search data. Try another server or retry shortly.'); }
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
    let abortListener;
    const cancelled = new Promise((_, reject) => {
      abortListener = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    try { return await Promise.race([worker.resolveUncached(params), cancelled]); }
    finally {
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
    const provider = String(params.provider || 'animepahe').toLowerCase();
    const title = String(params.title || '').trim();
    const episodeNum = params.episodeNum == null ? 1 : Number(params.episodeNum);
    if (!Number.isInteger(episodeNum) || episodeNum < 1) throw new Error('Invalid episode number');
    const audio = String(params.audio || 'sub').toLowerCase();
    if (!['sub', 'dub'].includes(audio)) throw new Error('Unsupported audio selection: ' + audio);

    if (!title) throw new Error('Missing anime title');
    console.log(`[StreamResolver] Resolving "${title}" Ep ${episodeNum} (${audio}) via ${provider}`);

    let res;
    if (provider === 'anikoto') res = await this.resolveAnikoto(title, episodeNum, audio, params);
    else if (provider === 'aniwatch') res = await this.resolveAniWatch(title, episodeNum, audio, params);
    else if (provider === 'animepahe') res = await this.resolveAnimePahe(title, episodeNum, audio);
    else if (provider === 'anipm') throw new Error('Ani.pm is unavailable: its playback integration has not been implemented. Choose Anikoto or AnimePahe.');
    else throw new Error('Unsupported streaming provider: ' + provider);
    if (!res?.streamUrl) throw new Error('No playable stream found on ' + provider);
    this.signal?.throwIfAborted();
    if (res.headers && !params.prefetch) dynamicStreamHeaders.set(new URL(res.streamUrl).hostname, res.headers);
    return { ...res, provider };
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
    const options = { title, episodeNum, audio, seasonNumber, seasonal, episodeTitle: String(request.episodeTitle || ''), absoluteEpisodeNum: Number(request.absoluteEpisodeNum) || null };
    const inspect = (opts, currentStage) => {
      const clickTarget = el => { el.setAttribute('data-anideck-activate','1'); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; };
      const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (currentStage === 'search') {
        const links = [...document.querySelectorAll('a[href*="/watch/"]')];
        const matches = (a, title) => [a.textContent, a.getAttribute('data-jp'), a.querySelector('img')?.alt].some(s => norm(s) === norm(title));
        const seasonHit = opts.seasonNumber > 1 ? links.find(a => matches(a, opts.title + ' Season ' + opts.seasonNumber)) : null;
        const hit = seasonHit || links.find(a => matches(a, opts.title));
        return hit ? { navigate: hit.href, seasonal: !!seasonHit, stage: 'episode' } : { stage: 'search' };
      }
      if (currentStage === 'episode') {
        const episodes = [...document.querySelectorAll('#w-episodes a[data-num]')];
        if (!episodes.length) return { stage: 'episode' };
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
      const deadline = Date.now() + 45000;
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

  async resolveAniWatch(title, episodeNum, audio, request = {}) {
    const provider = require('./aniwatch');
    const season = request.seasonNumber == null ? 1 : Number(request.seasonNumber);
    if (!Number.isInteger(season) || season < 1) throw new Error('AniWatch specials require their own title');
    const pageKey=JSON.stringify([title,season]);
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
        timer = setTimeout(() => reject(new Error('AniWatch page script timed out')), 5000);
      })]); } finally { clearTimeout(timer); }
    };
    const inspect = () => evaluate(`(${provider.inspectPage.toString()})()`);
    const waitFor = async (key, stage) => {
      console.log('[StreamResolver] AniWatch stage:', stage);
      const until = Date.now() + 10000;
      do {
        this.signal?.throwIfAborted();
        if (win.isDestroyed()) throw new Error('AniWatch window closed');
        const data = await inspect();
        if (data.challenge) throw new Error('AniWatch requires browser verification. Choose another server or try again later.');
        if (data[key].length || (key==='titles'&&data.emptySearch)) return data;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < until);
      throw new Error(`AniWatch timed out at ${stage} stage`);
    };
    ses.webRequest.onBeforeSendHeaders({urls:['*://*/*']}, (details, callback) => {
      if (captureEnabled && !captured && /\.(m3u8|mp4)(\?|$)/i.test(details.url) && !/preview|thumb|\/ads?\//i.test(details.url)) {
        const headers = {'User-Agent':CHROME_UA};
        for (const [key,value] of Object.entries(details.requestHeaders)) if (/^(referer|origin|user-agent)$/i.test(key)) headers[key] = value;
        captured = {streamUrl:details.url,isHLS:/\.m3u8/i.test(details.url),headers};
      }
      callback({cancel:false,requestHeaders:details.requestHeaders});
    });
    try {
      if(!match){
        let lastError;
        for(const query of provider.searchTerms(title)){
          console.log('[StreamResolver] AniWatch search:',query);
          await loadAnikotoPage(win, `${provider.BASE}/?s=${encodeURIComponent(query)}`);
          const search=await waitFor('titles','search');
          try{match=provider.chooseTitle(search.titles,title,season);break;}catch(error){lastError=error;}
        }
        if(!match)throw lastError||new Error('AniWatch: No matching title found');
      } else console.log('[StreamResolver] AniWatch using cached title page');
      await loadAnikotoPage(win, match.url);
      const titleData = await waitFor('episodes', 'episode');
      const episodeUrl = provider.chooseEpisode(titleData.episodes, episodeNum, request, match.seasonal);
      if (new URL(wc.getURL()).pathname !== new URL(episodeUrl).pathname) await loadAnikotoPage(win, episodeUrl);
      const episodeData = await waitFor('servers', 'audio');
      if(aniwatchPages.size>=100)aniwatchPages.delete(aniwatchPages.keys().next().value);
      aniwatchPages.set(pageKey,{at:Date.now(),match});
      const embeds = provider.chooseEmbeds(episodeData.servers, audio);
      let lastError;
      for (const embed of embeds) {
        this.signal?.throwIfAborted();
        captureEnabled = false; captured = null;
        allowedOrigins.add(new URL(embed).origin);
        console.log('[StreamResolver] AniWatch player:', new URL(embed).hostname, audio);
        try {
          captureEnabled = true;
          await loadAnikotoPage(win, embed);
          const until = Date.now() + 12000;
          const visited = new Set([embed]);
          while (Date.now() < until) {
            this.signal?.throwIfAborted();
            if (captured) return captured;
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
            if (captured) return captured;
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

  async resolveAnimePahe(title, episodeNum, audio) {
    // animepahe.com currently redirects to animepahe.pw. Avoid dead HTML-only mirrors.
    const baseDomains = ['https://animepahe.pw','https://animepahe.com'];

    let lastError = null;

    for (const base of baseDomains) {
      this.signal?.throwIfAborted();
      try {
        const searchUrl = `${base}/api?m=search&q=${encodeURIComponent(title)}`;

        const searchJson = await this.fetchJsonWithCloudflareBypass(searchUrl, base, 20000);
        const hits = searchJson?.data;
        if (!Array.isArray(hits) || !hits.length) throw new Error('AnimePahe: No API hits');

        const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = hits.find((h) => String(h.title || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle);
        if (!match) throw new Error('AnimePahe: No exact title match for ' + title);
        const animeSession = match.session;

        const relUrl = `${base}/api?m=release&id=${encodeURIComponent(animeSession)}&sort=episode_asc&page=1`;
        let relJson = await this.fetchJsonWithCloudflareBypass(relUrl, base, 20000);
        if (!relJson?.data?.length) throw new Error('AnimePahe: No episodes');

        let epObj = relJson.data.find((e) => Number(e.episode) === episodeNum);
        if (!epObj && relJson.last_page > 1) {
          for (let p = 2; p <= Math.min(relJson.last_page, 10); p++) {
            const pageJson = await this.fetchJsonWithCloudflareBypass(
              `${base}/api?m=release&id=${encodeURIComponent(animeSession)}&sort=episode_asc&page=${p}`,
              base,
              20000
            );
            epObj = (pageJson?.data || []).find((e) => Number(e.episode) === episodeNum);
            if (epObj) break;
          }
        }
        if (!epObj) throw new Error('AnimePahe: Requested episode ' + episodeNum + ' was not found in the checked release pages');

        const playPageUrl = `${base}/play/${encodeURIComponent(animeSession)}/${encodeURIComponent(epObj.session)}`;
        const html = await this.fetchTextWithCloudflareBypass(playPageUrl, base, 20000);

        const buttonRegex = /<button[^>]+data-src=["']([^"']+)["'][^>]*>/gi;
        const candidates = [];
        let m;
        while ((m = buttonRegex.exec(html)) !== null) {
          const tag = m[0];
          const src = m[1];
          const isDub = /data-audio=["']eng["']/i.test(tag);
          const resMatch = tag.match(/data-resolution=["'](\d+)["']/i);
          const resolution = resMatch ? Number(resMatch[1]) : 720;
          candidates.push({ src, isDub, resolution });
        }

        if (!candidates.length) {
          throw new Error('AnimePahe: Cannot verify the requested audio on this episode');
        }

        const wantDub = audio === 'dub';
        const pool = candidates.filter((c) => c.isDub === wantDub);
        if (!pool.length) throw new Error('AnimePahe: Requested ' + audio + ' audio is unavailable');
        const chosenList = pool.sort((a, b) => b.resolution - a.resolution);
        const kwikUrl = chosenList[0].src;

        const kwikHtml = await this.fetchTextWithCloudflareBypass(kwikUrl, base, 20000);
        const unpacked = unpackPacker(kwikHtml);
        if (unpacked) {
          const m3u8Match = unpacked.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
          if (m3u8Match) {
            return {
              streamUrl: m3u8Match[0],
              isHLS: true,
              headers: { Referer: 'https://kwik.si/', Origin: 'https://kwik.si', 'User-Agent': CHROME_UA }
            };
          }
        }

        return await this.sniffUrlInHiddenWindow(kwikUrl, base);
      } catch (err) {
        this.signal?.throwIfAborted();
        if(err.code==='PROVIDER_VERIFICATION_CANCELLED')throw err;
        console.warn(`[StreamResolver] AnimePahe failed with ${base}:`, err.message);
        lastError = err;
        // Continue to next domain
      }
    }

    throw lastError || new Error('No playable stream found for AnimePahe');
  }

  // Opens the page in a hidden window and waits for it to request a video (.m3u8 / .mp4).
  // Helps the page along: follows an embedded player iframe, clicks the wanted episode on list pages
  // (when searchOpts is given), or presses a play button.
  async sniffUrlInHiddenWindow(targetUrl, refererBase = '', searchOpts = null, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let settled = false, hops = 0;
      const partName = 'persist:anishelf-web';
      const ses = session.fromPartition(partName);
      const episodeNum = searchOpts ? Number(searchOpts.episodeNum) || 1 : 0; // 0 = don't look for episode links

      const win = this.createResolverWindow({
        show: false,
        width: 1280,
        height: 720,
        webPreferences: {
          partition: partName,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          autoplayPolicy: 'no-user-gesture-required'
        }
      });

      win.webContents.setAudioMuted(true);
      win.webContents.setUserAgent(CHROME_UA);

      const finish = (err, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ses.webRequest.onBeforeRequest(null); } catch {} // stop watching the partition's traffic
        try {
          if (!win.isDestroyed()) win.destroy();
        } catch {}
        if (err) reject(err);
        else resolve(result);
      };

      // Catch the stream as soon as the page (or its player iframe) requests it
      const listener = (details, callback) => {
        const u = details.url;
        if (!settled && /\.(m3u8|mp4)(\?.*)?$/i.test(u) && !u.includes('preview') && !u.includes('thumb')) {
          console.log('[StreamSniffer] Captured media stream:', u);
          finish(null, {
            streamUrl: u,
            isHLS: /\.m3u8/i.test(u),
            headers: { Referer: refererBase || new URL(targetUrl).origin + '/', 'User-Agent': CHROME_UA }
          });
        }
        callback({ cancel: false });
      };
      ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, listener);

      win.webContents.on('did-finish-load', () => {
        if (settled || win.isDestroyed() || ++hops > 5) return; // don't wander forever
        // Give the page's scripts a moment, then look for a player
        setTimeout(async () => {
          if (settled || win.isDestroyed()) return;
          try {
            const found = await win.webContents.executeJavaScript(`
              (function (ep) {
                const v = document.querySelector('video[src^="http"], video source[src^="http"]');
                if (v) return { type: 'video', url: v.src };
                const frame = [...document.querySelectorAll('iframe[src^="http"]')].find((f) => f.offsetWidth > 200);
                if (frame) return { type: 'iframe', url: frame.src };
                if (ep) {
                  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                  const want = [String(ep), 'ep ' + ep, 'ep. ' + ep, 'episode ' + ep];
                  const items = [...document.querySelectorAll('[data-number], .ep-item, .episode-item, a')];
                  const hit = items.find((el) => el.dataset.number === String(ep)) || items.find((el) => want.includes(norm(el.textContent)));
                  if (hit) { hit.click(); return { type: 'clicked' }; }
                }
                const play = document.querySelector('.play-button, .vjs-big-play-button, .jw-icon-display, .btn-play, video');
                if (play && !play.dataset.anideckStarted) { play.dataset.anideckStarted = '1'; return { stage: 'player', click: clickTarget(play) }; }
                return null;
              })(${episodeNum});
            `);
            if (settled || win.isDestroyed() || !found) return;
            if (found.type === 'video') {
              finish(null, {
                streamUrl: found.url,
                isHLS: /\.m3u8/i.test(found.url),
                headers: { Referer: refererBase || new URL(targetUrl).origin + '/', 'User-Agent': CHROME_UA }
              });
            } else if (found.type === 'iframe') {
              // An embed page isn't playable itself: open it and keep listening for its stream
              win.loadURL(found.url, { httpReferrer: win.webContents.getURL(), userAgent: CHROME_UA }).catch(() => {});
            }
          } catch {}
        }, 2500);
      });

      win.once('closed', () => finish(this.signal?.reason || new Error('Stream window closed')));
      const timer = setTimeout(() => {
        finish(new Error('Stream sniffer timed out waiting for media stream.'));
      }, timeoutMs);

      win.loadURL(targetUrl, { httpReferrer: refererBase || undefined, userAgent: CHROME_UA }).catch((e) => finish(e));
    });
  }

  async fetchTextWithCloudflareBypass(url, referer = '', timeoutMs = 15000, expectJson = false) {
    let browserAttempted=false;
    try {
      const res = await net.fetch(url, {
        headers: {
          'User-Agent': CHROME_UA,
          'Accept': expectJson ? 'application/json' : 'text/html,application/json,*/*;q=0.8',
          ...(expectJson ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
          'Accept-Language': 'en-US,en;q=0.9',
          ...(referer ? { Referer: referer + '/' } : {})
        },
        bypassCustomProtocolHandlers: true,
        signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
      });
      const text = await res.text();
      if (/^\s*</.test(text) && /just a moment|cf-chl|challenge-platform|ddos-guard|captcha|checking your browser/i.test(text)) {
        browserAttempted=true;return await this.fetchViaHiddenBrowser(url, referer, expectJson);
      }
      if (!res.ok && res.status >= 400) { const error = new Error(`AnimePahe request failed (HTTP ${res.status}). Try another server.`); error.httpStatus = res.status; throw error; }
      return text;
    } catch (err) {
      this.signal?.throwIfAborted();
      if (err.httpStatus||browserAttempted) throw err;
      if (err.name === 'AbortError') {
        throw new Error(`Timeout fetching: ${url} (${timeoutMs}ms)`);
      }
      return await this.fetchViaHiddenBrowser(url, referer, expectJson);
    }
  }

  async fetchJsonWithCloudflareBypass(url, referer = '', timeoutMs = 15000) {
    const text = await this.fetchTextWithCloudflareBypass(url, referer, timeoutMs, true);
    return parseProviderJson(text, url);
  }

  async waitForProviderVerification(win){
    let shown=false;
    for(let attempt=0;attempt<180;attempt++){
      this.signal?.throwIfAborted();
      if(win.isDestroyed()){const error=Error('AnimePahe verification was closed. Retry playback to open it again, or choose another server.');error.code='PROVIDER_VERIFICATION_CANCELLED';throw error;}
      const title=await win.webContents.executeJavaScript('document.title').catch(()=>'');
      const challenge=/just a moment|ddos-guard|attention required|cloudflare|challenge|blocked|captcha|under attack|checking your browser/i.test(title);
      if(title?.trim()&&!challenge){if(shown)win.hide();return;}
      if(challenge&&!shown){shown=true;win.show();win.focus();}
      if(!shown&&attempt>=39)break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw Error('AnimePahe verification did not finish. Retry and complete the browser check, or choose another server.');
  }

  async fetchViaHiddenBrowser(url, referer = '', expectJson = false) {
    const origin = new URL(url).origin;
    const partName = 'persist:anishelf-web';
    const win = this.createResolverWindow({
      show: false, // Keep hidden by default for production
      width: 1280,
      height: 720,
      webPreferences: {
        partition: partName,
        contextIsolation: true,
        sandbox: true,
        userAgent: CHROME_UA,
        // Add realistic viewport settings to help bypass Cloudflare
        deviceMetricsOverride: {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          mobile: false
        }
      }
    });

    // For debugging purposes, temporarily show window and add manual solving capability
    const isDebugMode = process.env.DEBUG_BROWSER === 'true';
    if (isDebugMode) {
      win.show();
      console.warn('[DEBUG] Browser window is now visible for Cloudflare testing');

      // Give user a chance to manually solve Cloudflare challenge
      console.warn('[DEBUG] Please solve any Cloudflare challenge manually in the browser window');
      console.warn('[DEBUG] Browser verification is checked for up to 20 seconds; close the player to cancel');

      // Keep verification usable without opening developer tools over the page.
    }

    try {
      await win.loadURL(origin + '/').catch(() => {});

      await this.waitForProviderVerification(win);

      // Wait additional time to ensure page fully loads after Cloudflare resolution
      await new Promise((r) => setTimeout(r, 1000));

      // Try a more comprehensive approach for getting content from the browser window
      const content = await win.webContents.executeJavaScript(`
        (async function() {
          try {
            // Wait for page to be fully loaded
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check if this is still a Cloudflare challenge page
            const pageTitle = document.title;
            if (/cloudflare|challenge|blocked|captcha|under attack|checking your browser/i.test(pageTitle.toLowerCase())) {
              console.warn('Still on Cloudflare challenge page after waiting');
              return null;
            }

            // Try to get content directly from window.location.href or fetch response
            const response = await fetch(${JSON.stringify(url)}, {
              headers: {
                'Accept': ${JSON.stringify(expectJson ? 'application/json' : 'application/json, text/html, */*')},
                ...( ${JSON.stringify(expectJson)} ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
                'User-Agent': '${CHROME_UA}'
              },
              credentials: 'include'
            });

            if (!response.ok) {
              console.warn('Network error during fetch:', response.status);
              return null;
            }

            return await response.text();
          } catch (err) {
            console.warn('Error in browser fetch:', err.message);
            // Fallback to simple page content as last resort
            try {
              return document.documentElement.outerHTML || document.body.innerText || '';
            } catch {
              return '';
            }
          }
        })()
      `, true);

      if (content && content.length > 0) {
        return content;
      }

      // If the direct fetch failed, fallback to simpler approach
      return await win.webContents.executeJavaScript(`
        (async function() {
          try {
            const html = document.documentElement.outerHTML || document.body.innerText || '';
            return html;
          } catch (err) {
            console.warn('Cannot extract content from page:', err.message);
            return '';
          }
        })()
      `, true);
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }
}

const instance = new StreamResolver();
module.exports = StreamResolver;
module.exports.resolve = (params) => instance.resolve(params);
module.exports.parseProviderJson = parseProviderJson;
