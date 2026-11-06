/* Two-launch artwork trace. Generated loopback images, disposable profile, real Home/title functions.
 * Usage: node scripts/native-artwork-startup-trace.cjs electron.exe app-root output-directory
 * Does not read the installed user profile and does not contact public providers. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const zlib = require('node:zlib');
const {spawn} = require('node:child_process');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([len, name, data, crc]);
}
function solidPng(width, height, r, g, b) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, {level: 1})), pngChunk('IEND', Buffer.alloc(0))]);
}
function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}
function cut(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = start < 0 ? -1 : source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error('Missing source slice ' + label);
  const text = source.slice(start, end);
  if (text.length < 40) throw new Error('Short source slice ' + label);
  return text;
}
function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function scenario(origin) {
  const delay = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));
  const counts = {measureImages: 0, imageConstructors: 0, anilist: 0, anizipGet: 0, anizipCacheHit: 0, externalIds: 0, kitsuEpisodes: 0, kitsuCore: 0, requests: 0, entry: 0, thumbs: 0, showLogo: 0, railArrows: 0, viewsAnime: 0, homeAfter: 0, animeAfter: 0, episodeMapping: 0, refresh: 0};
  const thumbLog = [];
  let titleGestureError = '';
  await TitleArtwork.load(new Map());
  await ArtworkImages.load();
  const t0 = performance.now();
  const since = () => Math.round(performance.now() - t0);
  let firstCarousel = null, firstStill = null, firstLargeStill = null;
  document.addEventListener('load', event => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || !img.naturalWidth) return;
    const at = since();
    if (firstCarousel == null && img.classList.contains('slide-img')) firstCarousel = at;
    if (img.closest('.ep')) {
      if (firstStill == null) firstStill = at;
      if (firstLargeStill == null && img.naturalWidth >= 1000) firstLargeStill = at;
    }
  }, true);
  const NativeImage = window.Image;
  window.Image = function InstrumentedImage(...args) {
    counts.imageConstructors++;
    return new NativeImage(...args);
  };
  window.Image.prototype = NativeImage.prototype;
  const makeImage = ArtworkImages.makeImage.bind(ArtworkImages);
  ArtworkImages.makeImage = () => { counts.measureImages++; return makeImage(); };
  const realThumb = setEpisodeThumb;
  setEpisodeThumb = (row, sources) => {
    counts.thumbs++;
    thumbLog.push({t: since(), sources: [...sources], cached: setEpisodeThumb.cache?.get(row.querySelector('.thumb')?.dataset.episodeArt) || null, scrollActive: Date.now() < (App.scrollUntil || 0)});
    return realThumb(row, sources);
  };
  setEpisodeThumb.cache = realThumb.cache;
  const realArrows = updateRailArrows;
  updateRailArrows = root => { counts.railArrows++; return realArrows(root); };
  const realRefresh = HomeRefresh.refresh.bind(HomeRefresh);
  const refreshLog = [];
  HomeRefresh.refresh = async batch => {
    const row = {t: since(), scrollActive: Date.now() < (App.scrollUntil || 0)};
    refreshLog.push(row);
    counts.refresh++;
    return realRefresh(batch);
  };
  const paintLog = [];
  const realPaint = TitleReads.paint.bind(TitleReads);
  TitleReads.paint = async function(batch) {
    const snap = () => ({main: document.querySelector('.detail-main'), nav: document.querySelector('.title-sections'), list: document.querySelector('.ep-list'), nodes: document.querySelectorAll('.hero-bg-img').length});
    const before = snap();
    const row = {t: since(), scrollActive: Date.now() < (App.scrollUntil || 0), scrollUntil: App.scrollUntil || 0, beforeNodes: before.nodes};
    paintLog.push(row);
    try { return await realPaint(batch); }
    finally {
      const after = snap();
      row.done = since();
      row.mainSame = !!before.main && before.main === after.main;
      row.navSame = !!before.nav && before.nav === after.nav;
      row.listSame = !!before.list && before.list === after.list;
      row.afterNodes = after.nodes;
      row.genre = document.querySelector('.meta-line')?.textContent || '';
    }
  };
  const realMapping = AniZip.episodeMapping.bind(AniZip);
  AniZip.episodeMapping = async (kitsuId, alId) => { counts.episodeMapping++; return realMapping(kitsuId, alId); };
  const zipCache = new Map();
  const zipPayload = alId => String(alId) === '501'
    ? {episodes: {1: {title: 'Generated still', overview: 'Generated overview', image: origin + '/still-small.png', airDate: '2020-01-01', runtime: 24}}, fanart: '', kitsu: '501', logos: [], banner: '', poster: ''}
    : {episodes: {}, fanart: '', kitsu: '101', logos: [], banner: '', poster: ''};
  AniZip.get = alId => {
    const key = String(alId || '');
    if (!key) return Promise.resolve(null);
    if (zipCache.has(key)) { counts.anizipCacheHit++; return zipCache.get(key); }
    counts.anizipGet++;
    const pending = delay(40, zipPayload(key));
    zipCache.set(key, pending);
    return pending;
  };
  AniZip.clearlogos = async () => [];
  Kitsu.externalIds = async id => { counts.externalIds++; await delay(40); return {anilist: '501', kitsu: String(id)}; };
  Kitsu.episodes = async () => { counts.kitsuEpisodes++; await delay(50); return [{number: 1, title: 'Generated episode', thumb: origin + '/still-large.png', synopsis: 'Generated synopsis', airdate: '2020-01-01', length: 24}]; };
  Kitsu.animeFull = async id => { counts.kitsuCore++; await delay(25); return {id, title: 'Generated Title', synopsis: 'Generated synopsis', poster: '', cover: '', coverHd: '', episodes: 1, subtype: 'TV', year: 2020, status: 'finished', titles: ['Generated Title'], url: origin + '/catalog'}; };
  Kitsu.anime = id => Kitsu.animeFull(id);
  AniList.details = async id => {
    counts.anilist++;
    if (String(id) === '501') { await delay(400); return {id: 501, title: 'Generated Title', englishTitle: 'Generated Title', genre: 'Generated', episodes: 1, format: 'TV', year: 2020, score: 77, genres: ['Generated'], banner: null, cover: null, synopsis: 'Generated synopsis'}; }
    await delay(20);
    return {id: 101, title: 'Generated Spotlight', englishTitle: 'Generated Spotlight', score: 80, format: 'TV', year: 2026, episodes: 12, genres: ['Generated'], banner: null, cover: null};
  };
  Requests.has = async () => { counts.requests++; await delay(300); return false; };
  globalThis.trackingEntryState = async () => { counts.entry++; await delay(450); return {entry: null, error: null}; };
  globalThis.showLogo = () => { counts.showLogo++; };
  globalThis.kitsuCover = async () => '';
  Views.home = async () => document.getElementById('main').innerHTML;
  Views.anime = async (params, rid) => {
    counts.viewsAnime++;
    const values = params.snapshot || await TitleReads.read(params.id, rid);
    App.showAl = values[3] || null;
    App.showCtx = {match: {id: '501', title: 'Generated Title', episodes: 1}};
    return titleHtml(values);
  };
  function titleHtml(values) {
    const genre = values?.[3]?.genre || 'Core';
    const bgs = {lib: null, first: [origin + '/backdrop-sharp.png'], alId: 501, mid: [], last: [], fanart: [], force: '', kitsu: '', alBanner: '', pill: false};
    return `<div class="detail-hero"><div class="hero-bg" data-bgs="${esc(JSON.stringify(bgs))}" style="background-image:url('${origin}/backdrop-initial.png')"></div><div class="hero-inner"><div class="hero-text"><h1>Generated Title</h1><div class="hero-eyebrow">Generated</div><div class="meta-line">${esc(genre)}</div></div></div></div><div class="detail-body"><aside class="detail-side"><div class="side-card"><p>${esc(genre)}</p></div></aside><section class="detail-main"><nav class="title-sections"><button class="title-section" data-tab="episodes">Episodes</button><button class="title-section" data-tab="discussion">Discussion</button><button class="title-section" data-tab="friends">Friends</button></nav><div class="ep-list"><div class="ep" id="ep-row-1" data-num="1"><button class="card"><div class="thumb thumb-pending" data-episode-only="1" data-episode-art="501|1" data-fallback="" data-poster=""><img alt="" hidden></div></button><div class="ep-info"><div class="ep-num">Episode 1 <span class="ep-meta"></span></div><div class="ep-title"></div><div class="ep-overview muted"></div></div></div></div></section></div>`;
  }
  async function gesture(name, fn) {
    const frames = [];
    const longs = [];
    let last = performance.now(), running = true;
    const sample = () => { const now = performance.now(); frames.push(now - last); last = now; if (running) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
    let observer = null, longTaskError = '';
    try { observer = new PerformanceObserver(list => longs.push(...list.getEntries().map(entry => entry.duration))); observer.observe({entryTypes: ['longtask']}); }
    catch (error) { longTaskError = String(error.message || error); }
    const started = performance.now();
    let detail = null;
    try { detail = await fn(); }
    finally {
      await delay(180);
      running = false;
      observer?.disconnect();
    }
    const marker = name === 'home-main-wheel' || name === 'title-scroll-during-late-paint';
    return {name, exercised: true, frameSamples: 'offscreen-synthetic', latencyClaim: false, exercise: marker ? 'synthetic-scroll-marker' : 'synthetic-offscreen', note: marker ? 'Synthetic lifecycle and scroll-marker exercise on an offscreen window. The home sample assigns scrollTop after a synthetic wheel. The title sample dispatches synthetic wheels while the late paint runs. These are not real wheel, middle-mouse, or user-motion latency measurements, and they are not decode counts or real-user speed.' : 'Offscreen synthetic sample. Not a real wheel, middle-mouse, or user-motion latency measurement, and not a decode count or real-user speed.', wallMs: Math.round(performance.now() - started), samples: frames.length, largestFrameGapMs: frames.length ? Math.round(Math.max(...frames) * 10) / 10 : null, longTasks: longs.length, longTaskMs: Math.round(longs.reduce((sum, value) => sum + value, 0) * 10) / 10, longTaskError, detail};
  }
  SmoothWheel.bind();
  App.view = 'home';
  App.renderId = 1;
  App.params = {};
  const slide = {kind: 'anime', a: {id: '101', title: 'Generated Spotlight', titles: ['Generated Spotlight'], poster: '', synopsis: 'Generated synopsis', subtype: 'TV', year: 2026, episodes: 12, rating: 80}, srcs: [origin + '/carousel.png'], fan: null};
  const cards = Array.from({length: 8}, (_, index) => `<button class="card" style="flex:none;width:160px;height:90px">Generated ${index}</button>`);
  const week = `<section class="wk2" id="wk"><div class="sch-days wk2-days" role="tablist"><button class="sch-dtab on" data-day="0"></button></div><div class="wk2-panel" data-panel="0">${Array.from({length: 8}, (_, index) => `<button class="wk2-card">Day ${index}</button>`).join('')}</div></section>`;
  document.getElementById('main').innerHTML = `<div class="home-slot" data-home-slot="hero"><section class="hero-carousel" id="carousel">${heroSlide(slide, 0)}<div class="car-nav"><button type="button" data-car="-1">Back</button><div class="car-dots"></div><button type="button" data-car="1">Next</button></div></section></div><div style="height:1400px"></div><div class="home-slot" data-home-slot="trending">${rail('Trending', cards)}</div><div class="home-slot" data-home-slot="week">${week}</div>`;
  const carouselBox = document.getElementById('carousel').getBoundingClientRect();
  counts.homeAfter++;
  await homeAfter({}, 1);
  const carouselImage = document.querySelector('#carousel .slide.on .slide-img');
  clearInterval(App.carouselTimer);
  const homeScroll = await gesture('home-main-wheel', async () => {
    const root = document.getElementById('main');
    const before = root.scrollTop;
    root.dispatchEvent(new WheelEvent('wheel', {deltaY: 80, deltaX: 0, cancelable: true, bubbles: true}));
    root.scrollTop = before + 240;
    root.dispatchEvent(new Event('scroll', {bubbles: true}));
    return {scrollUntilActive: Date.now() < (App.scrollUntil || 0), scrollTop: root.scrollTop, scrollTopAssigned: true, syntheticWheel: true};
  });
  const railGesture = await gesture('home-rail', async () => {
    const railEl = document.querySelector('.rail');
    const before = counts.railArrows;
    const leftBefore = railEl.scrollLeft;
    railEl.scrollLeft = 220;
    railEl.dispatchEvent(new Event('scroll', {bubbles: true}));
    const arrow = railEl.parentElement.querySelector('.rail-arrow.right');
    arrow.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    await delay(80);
    return {arrowsCalled: counts.railArrows > before, scrollLeft: railEl.scrollLeft, moved: railEl.scrollLeft !== leftBefore, overflow: railEl.scrollWidth > railEl.clientWidth + 4, rightHidden: railEl.parentElement.querySelector('.rail-arrow.right').hidden};
  });
  const weekGesture = await gesture('home-week-wheel', async () => {
    const panel = document.querySelector('#wk .wk2-panel');
    const before = panel.scrollLeft;
    const event = new WheelEvent('wheel', {deltaY: 140, deltaX: 0, cancelable: true, bubbles: true});
    panel.dispatchEvent(event);
    return {defaultPrevented: event.defaultPrevented, before, after: panel.scrollLeft, overflow: panel.scrollWidth > panel.clientWidth + 4};
  });
  if (!weekGesture.detail.defaultPrevented) weekGesture.exercised = false;
  HomeReads.budgetMs = 40;
  const batch = HomeReads.begin(1);
  let releaseLate;
  const lateRead = HomeReads.read(batch, 'late', () => new Promise(resolve => { releaseLate = resolve; }), false);
  await delay(70);
  HomeReads.markPaint(1, document.getElementById('main').innerHTML);
  const pumps = setInterval(() => document.getElementById('main').dispatchEvent(new WheelEvent('wheel', {deltaY: 24, deltaX: 0, cancelable: true, bubbles: true})), 50);
  await delay(60);
  const refreshBeforeRelease = refreshLog.length;
  releaseLate(true);
  await lateRead;
  await delay(320);
  const refreshWhileHeld = refreshLog.filter(row => row.scrollActive).length;
  const refreshDuringHold = refreshLog.length;
  clearInterval(pumps);
  await delay(500);
  const homeRefresh = {refreshBeforeRelease, refreshDuringHold, refreshWhileHeld, refreshAfterRelease: refreshLog.length, log: refreshLog};
  clearInterval(App.wkTimer);
  App.view = 'anime';
  App.params = {id: '501'};
  App.renderId = 2;
  const titlePumps = setInterval(() => document.getElementById('main').dispatchEvent(new WheelEvent('wheel', {deltaY: 36, deltaX: 0, cancelable: true, bubbles: true})), 50);
  let titleGesture = null;
  try {
    titleGesture = await gesture('title-scroll-during-late-paint', async () => {
      const started = since();
      document.getElementById('main').innerHTML = await Views.anime({id: '501'}, 2);
      TitleReads.mounted(2);
      counts.animeAfter++;
      const firstAfter = Views.animeAfter(App.params, 2);
      for (let i = 0; i < 80 && paintLog.length < 1; i++) await delay(50);
      await firstAfter.catch(error => { titleGestureError = String(error && error.stack || error); });
      return {mountAt: started, paints: paintLog.length, coversLatePaint: true, syntheticWheel: true, scrollTopAssigned: false};
    });
  } finally {
    clearInterval(titlePumps);
  }
  for (let i = 0; i < 80 && (globalThis.__backdropCalls || []).some(row => !row.done); i++) await delay(50);
  for (let i = 0; i < 40 && firstStill == null; i++) await delay(50);
  await delay(400);
  const bg = document.querySelector('#main .detail-hero .hero-bg');
  const fixtureUrls = [origin + '/carousel.png', origin + '/backdrop-sharp.png', origin + '/backdrop-initial.png', origin + '/still-small.png', origin + '/still-large.png'];
  const pageOrigin = new URL(origin).origin;
  const samePage = value => { try { return new URL(value).origin === pageOrigin; } catch { return false; } };
  const storedFixture = [...ArtworkImages.rows.keys()].filter(samePage);
  const resources = performance.getEntriesByType('resource').filter(entry => samePage(entry.name)).map(entry => ({name: new URL(entry.name).pathname, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, duration: Math.round(entry.duration * 10) / 10}));
  const backdropCalls = globalThis.__backdropCalls || [];
  const fades = globalThis.__fades || [];
  const overlap = backdropCalls.some((left, index) => backdropCalls.some((right, other) => other > index && left.t < right.done && right.t < left.done));
  return {
    pid: null,
    timings: {firstCarouselMs: firstCarousel, firstStillMs: firstStill, firstLargeStillMs: firstLargeStill, note: 'Offscreen fixture observations. backdrop-sharp.png is delayed 900ms only when the request reaches the loopback server. These are not decode counts or real-user speed.'},
    measurementLimits: 'Frame samples are offscreen and synthetic. HTTP transferSize and the parent server log are the disk-cache evidence. ArtworkImages rows are the dimension store. The episode list can still be replaced during an active title scroll; that baseline is outside this fix.',
    carousel: {box: {width: Math.round(carouselBox.width), height: Math.round(carouselBox.height)}, dpr: window.devicePixelRatio || 1, src: carouselImage?.getAttribute('src') || '', naturalWidth: carouselImage?.naturalWidth || 0, naturalHeight: carouselImage?.naturalHeight || 0, loadingArt: !!document.querySelector('#carousel.loading-art')},
    gestures: [homeScroll, railGesture, weekGesture, titleGesture].filter(Boolean),
    homeRefresh,
    paint: paintLog,
    thumbs: thumbLog,
    backdrop: {calls: backdropCalls.map(row => ({t: Math.round(row.t), done: Math.round(row.done), nodesAtStart: row.nodesAtStart, nodesAtEnd: row.nodesAtEnd, scrollActive: row.scrollActive})), fades: fades.map(row => ({t: Math.round(row.t), nodes: row.nodes, url: String(row.url).replace(origin, '')})), overlap, finalNodes: [...document.querySelectorAll('.hero-bg-img')].map(img => ({src: (img.currentSrc || img.src).replace(origin, ''), on: img.classList.contains('on'), w: img.naturalWidth, h: img.naturalHeight})), initialBackground: bg?.style.backgroundImage || '', choiceSize: typeof bgChoice === 'undefined' ? null : bgChoice.size},
    counts,
    dimensionStore: {fixtureUrls: storedFixture, publicImageRejectsFixture: fixtureUrls.every(url => ArtworkImages.valid({u: url, w: 100, h: 100, at: Date.now()}) === false), rows: ArtworkImages.rows.size},
    resources,
    episode: {title: document.querySelector('.ep-title')?.textContent || '', stillWidth: document.querySelector('.ep img')?.naturalWidth || 0, stillSrc: (document.querySelector('.ep img')?.currentSrc || '').replace(origin, '')},
    titleGestureError,
    notExercised: ['50-row episode candidate stampede', 'Jellyfin or query-string artwork', 'public Kitsu, AniList, ani.zip, TVDB, Trakt, or Discord network', 'installed user profile', 'Home row pointer drag', 'carousel rotation ticks during the gesture samples'],
  };
}

async function runProbe() {
  const profile = path.resolve(argValue('--profile'));
  const output = path.resolve(argValue('--output'));
  const root = path.resolve(argValue('--root'));
  const origin = argValue('--origin');
  const stage = argValue('--stage');
  if (!profile.includes('anideck-artwork-trace-') || !output || !root || !origin.startsWith('http://127.0.0.1:') || !['cold', 'warm'].includes(stage)) {
    console.error('Probe arguments were not an isolated artwork-trace profile');
    process.exit(2);
  }
  const {app, BrowserWindow, session} = require('electron');
  app.commandLine.appendSwitch('no-proxy-server');
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    const pageErrors = [];
    const network = [];
    try {
      await session.defaultSession.setProxy({mode: 'direct'});
      const allowedOrigin = new URL(origin).origin;
      const parsed = value => { try { return new URL(value); } catch { return null; } };
      const httpUrl = url => !!url && (url.protocol === 'http:' || url.protocol === 'https:');
      session.defaultSession.webRequest.onBeforeRequest({urls: ['<all_urls>']}, (details, callback) => {
        const url = parsed(details.url);
        if (httpUrl(url) && url.origin !== allowedOrigin) {
          network.push({phase: 'blocked', url: details.url});
          callback({cancel: true});
          return;
        }
        callback({});
      });
      session.defaultSession.webRequest.onCompleted({urls: ['<all_urls>']}, details => {
        const url = parsed(details.url);
        if (!url) return;
        if (url.origin === allowedOrigin) network.push({phase: 'completed', url: url.pathname, status: details.statusCode, fromCache: !!details.fromCache});
        else if (httpUrl(url)) network.push({phase: 'foreign', url: details.url, status: details.statusCode});
      });
      session.defaultSession.webRequest.onErrorOccurred({urls: ['<all_urls>']}, details => {
        const url = parsed(details.url);
        if (!url || !httpUrl(url)) return;
        network.push({phase: 'error', url: details.url, error: details.error});
      });
      const win = new BrowserWindow({show: false, width: 1360, height: 900, webPreferences: {offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false}});
      win.webContents.on('paint', () => {});
      win.webContents.setFrameRate(60);
      win.webContents.on('console-message', (_event, level, message) => { if (level > 1) pageErrors.push(String(message)); });
      const appSource = readText(path.join(root, 'src/app.js'));
      const apiSource = readText(path.join(root, 'src/api.js'));
      await win.loadURL(origin + '/fixture.html');
      await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8') + '#main{height:760px;overflow:auto}#carousel{width:1280px !important;height:420px !important}.detail-hero{width:1280px !important;height:480px !important;min-height:480px !important}.rail{display:flex;gap:8px;overflow-x:auto;width:480px;max-width:480px}.wk2-panel{display:flex;gap:8px;overflow-x:auto;width:420px;max-width:420px}.wk2-card{flex:none;width:180px;height:72px}.thumb{width:280px;height:158px;display:block}.thumb img{width:100%;height:100%;object-fit:cover}');
      const js = code => win.webContents.executeJavaScript(code, true);
      await js(`globalThis.$=s=>document.querySelector(s);globalThis.App={view:'home',params:{},history:[],selected:new Set(),renderId:1,settings:{titleLang:'en',epSort:'asc'},scrollUntil:0,carouselTimer:null,libIndex:{find:()=>null},stale(id){return id!==this.renderId;},refresh(){return Promise.resolve();}};globalThis.Jellyfin={server:'',connected:()=>false,userId:'',token:''};globalThis.AniList={detailsCache:{},idCache:{}};globalThis.Tracker={name:'generated',loggedIn:()=>false,svc:AniList};globalThis.Kitsu={};globalThis.AniZip={};globalThis.Requests={enabled:()=>false};globalThis.Trakt={fanartFor:async()=>[]};globalThis.queueScope=()=>'generated';globalThis.QueueRecovery={schedule(){}};globalThis.bindYourNext=()=>{};globalThis.enhanceMosaic=async()=>{};globalThis.spotlightDuration=()=>60000;globalThis.showTint=()=>{};globalThis.checkRemoteEpisodes=()=>{};globalThis.enrichTitleStory=async()=>{};globalThis.fillRelated=async()=>{};globalThis.fillSocial=async()=>{};globalThis.soonPrequels=()=>{};globalThis.countdownText=()=>'';globalThis.icon=()=>'';globalThis.window.native={get:async()=>null,set:async()=>{}};globalThis.Views={};void 0;`);
      await js(fs.readFileSync(path.join(root, 'src/title-artwork-store.js'), 'utf8'));
      await js(fs.readFileSync(path.join(root, 'src/spotlight-art.js'), 'utf8') + ';void 0;');
      await js(fs.readFileSync(path.join(root, 'src/title-panels.js'), 'utf8') + ';void 0;');
      await js(fs.readFileSync(path.join(root, 'src/title-reads.js'), 'utf8') + ';void 0;');
      await js(fs.readFileSync(path.join(root, 'src/smooth-wheel.js'), 'utf8'));
      await js(fs.readFileSync(path.join(root, 'src/home-refresh.js'), 'utf8'));
      await js(cut(appSource, 'const esc = (s)', '\n\nconst DEFAULT_SETTINGS', 'esc') + ';void 0;');
      await js(cut(apiSource, 'function seasonNumberIn(s) {', 'function stripSeason(s) {', 'seasonNumberIn'));
      await js(cut(appSource, 'const SOURCE_NOTE =', '\n\n/* ---------- Home:', 'SOURCE_NOTE'));
      await js(cut(appSource, 'function setEpisodeThumb(row,sources){', '// Title-page backdrop.', 'setEpisodeThumb'));
      const backdrop = cut(appSource, 'const bgChoice = new Map();', 'async function setListProgress', 'upgradeBackdrop').replace('bg.appendChild(img);', 'bg.appendChild(img);(globalThis.__fades=globalThis.__fades||[]).push({t:performance.now(),url,nodes:bg.querySelectorAll(\'.hero-bg-img\').length});');
      await js(backdrop + '\nupgradeBackdrop=new Proxy(upgradeBackdrop,{apply(fn,thisArg,args){const rec={t:performance.now(),nodesAtStart:document.querySelectorAll(\'.hero-bg-img\').length,scrollActive:Date.now()<(App.scrollUntil||0)};(globalThis.__backdropCalls=globalThis.__backdropCalls||[]).push(rec);return Reflect.apply(fn,thisArg,args).finally(()=>{rec.done=performance.now();rec.nodesAtEnd=document.querySelectorAll(\'.hero-bg-img\').length;});}});void 0;');
      await js('const titleLogoCache=new Map();\n' + cut(appSource, 'function titleArtworkId(', 'async function findTitleLogo', 'logoHeading'));
      await js(cut(appSource, 'function carouselArtworkScore(', '// Schedule "My shows"', 'heroSlide'));
      await js(cut(appSource, 'function firstUsableArtwork(', '/* ================================ VIEWS', 'HomeReads'));
      await js(cut(appSource, 'function rail(title, items,', 'function homeShelf(', 'rail'));
      await js(cut(appSource, 'function bindWeek() {', '// Trending mosaic', 'bindWeek'));
      await js(cut(appSource, 'function updateRailArrows(root = document) {', '/* ================================ NOTIFICATIONS', 'updateRailArrows'));
      const homeSlice = cut(appSource, '  async homeAfter(', '  async library(', 'homeAfter');
      const animeSlice = cut(appSource, '  async animeAfter(', '  async schedule(', 'animeAfter');
      await js('Views.homeAfter=({' + homeSlice.trim() + '}).homeAfter;globalThis.homeAfter=Views.homeAfter;void 0;');
      await js('Views.animeAfter=({' + animeSlice.trim() + '}).animeAfter;globalThis.Views=Views;void 0;');
      await js('globalThis.AniZip=globalThis.AniZip||{};AniZip.episodeMapping=({' + cut(apiSource, '  async episodeMapping(', '  get(alId)', 'episodeMapping').trim() + '}).episodeMapping;void 0;');
      const result = await js('(' + scenario.toString() + ')(' + JSON.stringify(origin) + ')');
      await new Promise(resolve => setTimeout(resolve, 100));
      result.stage = stage;
      result.pid = process.pid;
      result.versions = {electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node};
      result.profile = profile;
      result.origin = origin;
      result.network = network;
      result.pageErrors = pageErrors.slice(0, 20);
      result.fixtureDelay = {'backdrop-sharp.png': '900ms only if the request reaches the loopback server'};
      fs.mkdirSync(output, {recursive: true});
      fs.writeFileSync(path.join(output, stage + '.json'), JSON.stringify(result, null, 2));
      console.log('ARTWORK_TRACE_' + stage.toUpperCase() + ' pid=' + process.pid);
      win.destroy();
      app.exit(0);
    } catch (error) {
      const failure = {stage, pid: process.pid, error: String(error && error.stack || error), pageErrors, network};
      try { fs.mkdirSync(output, {recursive: true}); fs.writeFileSync(path.join(output, stage + '.json'), JSON.stringify(failure, null, 2)); } catch {}
      console.error(failure.error);
      app.exit(1);
    }
  }).catch(error => { console.error(error); process.exit(1); });
}

function validateSlices(root) {
  const appSource = readText(path.join(root, 'src/app.js'));
  const apiSource = readText(path.join(root, 'src/api.js'));
  const checks = [
    [appSource, 'function setEpisodeThumb(row,sources){', '// Title-page backdrop.', 'setEpisodeThumb', 'function setEpisodeThumb'],
    [appSource, 'const bgChoice = new Map();', 'async function setListProgress', 'upgradeBackdrop', 'async function upgradeBackdrop'],
    [appSource, 'function firstUsableArtwork(', '/* ================================ VIEWS', 'HomeReads', 'const HomeReads='],
    [appSource, '  async homeAfter(', '  async library(', 'homeAfter', 'firstUsableArtwork'],
    [appSource, '  async animeAfter(', '  async schedule(', 'animeAfter', 'upgradeBackdrop'],
    [apiSource, '  async episodeMapping(', '  get(alId)', 'episodeMapping', 'async episodeMapping'],
    [appSource, 'function bindWeek() {', '// Trending mosaic', 'bindWeek', 'preventDefault'],
    [appSource, 'function updateRailArrows(root = document) {', '/* ================================ NOTIFICATIONS', 'rails', 'rail-arrow'],
  ];
  for (const [source, start, end, label, needle] of checks) {
    const text = cut(source, start, end, label);
    if (!text.includes(needle)) throw new Error('Slice ' + label + ' did not include ' + needle);
  }
}

function summarizeServer(log) {
  const rows = new Map();
  for (const entry of log) {
    const key = entry.path + ' ' + entry.status;
    const row = rows.get(key) || {path: entry.path, status: entry.status, count: 0, sentBytes: 0, conditional: 0};
    row.count++;
    row.sentBytes += entry.sentBytes || 0;
    if (entry.ifNoneMatch) row.conditional++;
    rows.set(key, row);
  }
  return [...rows.values()];
}

function runParent() {
  const [binary, appRoot, output] = process.argv.slice(2);
  if (!binary || !appRoot || !output || binary.startsWith('--')) {
    throw new Error('Usage: node scripts/native-artwork-startup-trace.cjs electron.exe app-root output-directory');
  }
  const root = path.resolve(appRoot);
  const out = path.resolve(output);
  validateSlices(root);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anideck-artwork-trace-'));
  const userData = path.join(profile, 'user-data');
  fs.mkdirSync(userData, {recursive: true});
  fs.mkdirSync(out, {recursive: true});
  const images = new Map([
    ['/carousel.png', solidPng(3000, 980, 53, 48, 87)],
    ['/backdrop-sharp.png', solidPng(3000, 1100, 176, 92, 42)],
    ['/backdrop-initial.png', solidPng(640, 200, 22, 26, 34)],
    ['/still-small.png', solidPng(320, 180, 42, 92, 70)],
    ['/still-large.png', solidPng(1280, 720, 196, 156, 64)],
  ]);
  const serverLog = [];
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const body = images.get(pathname) || null;
    const delay = pathname === '/backdrop-sharp.png' ? 900 : 0;
    const entry = {t: Date.now(), method: request.method, path: pathname, ifNoneMatch: request.headers['if-none-match'] || null, cacheControlRequest: request.headers['cache-control'] || null, bytes: body ? body.length : 0, delayMs: delay, sentBytes: 0, status: 0};
    serverLog.push(entry);
    if (pathname === '/fixture.html') {
      const html = Buffer.from('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="main"></main><div id="player" hidden></div></body></html>');
      entry.status = 200;
      entry.sentBytes = html.length;
      entry.bytes = html.length;
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end(html);
      return;
    }
    const send = () => {
      if (!body) { entry.status = 404; response.writeHead(404); response.end(); return; }
      const etag = '"' + pathname + '"';
      const headers = {'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', ETag: etag, 'Timing-Allow-Origin': '*', 'Access-Control-Allow-Origin': '*'};
      if (request.headers['if-none-match'] === etag) {
        entry.status = 304;
        response.writeHead(304, headers);
        response.end();
        return;
      }
      entry.status = 200;
      entry.sentBytes = body.length;
      headers['Content-Length'] = body.length;
      response.writeHead(200, headers);
      response.end(body);
    };
    if (delay) setTimeout(send, delay); else send();
  });
  server.listen(0, '127.0.0.1', async () => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = args => new Promise(resolve => {
      const child = spawn(path.resolve(binary), args, {env, windowsHide: true});
      let stdout = '', stderr = '', settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => { child.kill(); finish({status: null, error: new Error('ETIMEDOUT'), stdout, stderr}); }, 90000);
      child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
      child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
      child.on('error', error => finish({status: null, error, stdout, stderr}));
      child.on('close', status => finish({status, error: null, stdout, stderr}));
    });
    const stages = [];
    let failed = false;
    for (const stage of ['cold', 'warm']) {
      const started = Date.now();
      const logFrom = serverLog.length;
      const result = await launch([__filename, '--stage', stage, '--profile', userData, '--output', out, '--root', root, '--origin', origin]);
      const ended = Date.now();
      const serverRows = serverLog.slice(logFrom).filter(entry => entry.t >= started - 50 && entry.t <= ended + 2000);
      stages.push({stage, status: result.status, error: result.error ? String(result.error.message || result.error) : '', started, ended, server: summarizeServer(serverRows), serverRequests: serverRows.length, sentBytes: serverRows.reduce((sum, entry) => sum + (entry.sentBytes || 0), 0)});
      if (result.status !== 0) { failed = true; break; }
    }
    server.close();
    let cold = null, warm = null;
    try { cold = JSON.parse(fs.readFileSync(path.join(out, 'cold.json'), 'utf8')); } catch {}
    try { warm = JSON.parse(fs.readFileSync(path.join(out, 'warm.json'), 'utf8')); } catch {}
    const assertions = [];
    const check = (name, pass, detail) => assertions.push({name, pass: !!pass, detail});
    check('distinct process ids', cold?.pid && warm?.pid && cold.pid !== warm.pid, [cold?.pid, warm?.pid]);
    check('cold carousel decoded', cold?.carousel?.naturalWidth > 0 && String(cold.carousel.src).includes('/carousel.png'), cold?.carousel);
    check('warm carousel decoded', warm?.carousel?.naturalWidth > 0 && String(warm.carousel.src).includes('/carousel.png'), warm?.carousel);
    check('cold still decoded', cold?.episode?.stillWidth > 0, cold?.episode);
    check('warm still decoded', warm?.episode?.stillWidth > 0, warm?.episode);
    check('fixture urls rejected by publicImage', cold?.dimensionStore?.publicImageRejectsFixture === true && warm?.dimensionStore?.publicImageRejectsFixture === true, [cold?.dimensionStore, warm?.dimensionStore]);
    check('fixture urls absent from dimension rows', (cold?.dimensionStore?.fixtureUrls || []).length === 0 && (warm?.dimensionStore?.fixtureUrls || []).length === 0, [cold?.dimensionStore?.fixtureUrls, warm?.dimensionStore?.fixtureUrls]);
    check('cold server sent carousel bytes', (stages.find(row => row.stage === 'cold')?.server || []).some(row => row.path === '/carousel.png' && row.status === 200 && row.sentBytes > 0), stages.find(row => row.stage === 'cold')?.server);
    const completedPaths = stage => (stage?.network || []).filter(row => row.phase === 'completed').map(row => row.url);
    const unexpected = stage => (stage?.network || []).filter(row => row.phase === 'blocked' || row.phase === 'foreign' || row.phase === 'error');
    const loggedFixture = paths => paths.includes('/fixture.html') && paths.some(item => item.endsWith('.png'));
    check('cold fixture network log records the document and an image', loggedFixture(completedPaths(cold)), completedPaths(cold));
    check('warm fixture network log records the document and an image', loggedFixture(completedPaths(warm)), completedPaths(warm));
    check('no external http attempts', unexpected(cold).length === 0 && unexpected(warm).length === 0, [...unexpected(cold), ...unexpected(warm)]);
    const uniqueBackdrop = stage => (stage?.backdrop?.finalNodes || []).length === 1 && stage.backdrop.finalNodes[0].src === '/backdrop-sharp.png' && String(stage.backdrop.initialBackground || '').includes('/backdrop-initial.png');
    check('cold backdrop node is unique and fallback remains', uniqueBackdrop(cold), {nodes: cold?.backdrop?.finalNodes, initial: cold?.backdrop?.initialBackground});
    check('warm backdrop node is unique and fallback remains', uniqueBackdrop(warm), {nodes: warm?.backdrop?.finalNodes, initial: warm?.backdrop?.initialBackground});
    const lateMeta = stage => (stage?.paint || []).some(row => row.genre === 'Generated') && stage?.episode?.title === 'Generated still';
    check('late metadata rendered', lateMeta(cold) && lateMeta(warm), [{genre: cold?.paint?.[0]?.genre, title: cold?.episode?.title}, {genre: warm?.paint?.[0]?.genre, title: warm?.episode?.title}]);
    check('title paint and backdrop and episode mapping ran', (cold?.paint || []).length > 0 && (cold?.backdrop?.calls || []).length > 0 && cold?.counts?.episodeMapping > 0 && cold?.counts?.homeAfter > 0 && cold?.counts?.animeAfter > 0, cold?.counts);
    const postponed = stage => !!stage?.homeRefresh && stage.homeRefresh.refreshWhileHeld === 0 && stage.homeRefresh.refreshAfterRelease > stage.homeRefresh.refreshDuringHold;
    check('home refresh stayed idle while scrollUntil was active', postponed(cold) && postponed(warm), [cold?.homeRefresh, warm?.homeRefresh]);
    const listReplaced = stage => (stage?.paint || []).some(row => row.scrollActive === true && row.listSame === false && row.mainSame === true && row.navSame === true);
    check('episode list replacement during active scroll remains the known baseline', listReplaced(cold) && listReplaced(warm), [cold?.paint, warm?.paint]);
    const report = {
      invocation: process.argv.slice(0, 2).concat(['electron.exe', 'app-root', out]).join(' ') + ' (binary and app root passed explicitly)',
      binary: path.resolve(binary),
      appRoot: root,
      profile: userData,
      profileRetained: true,
      origin,
      parentPid: process.pid,
      proxyEnvPresent: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'].filter(name => process.env[name]),
      parentNode: process.version,
      cacheHeaders: {'Cache-Control': 'public, max-age=3600', ETag: '"/path"', 'Timing-Allow-Origin': '*'},
      fixtureImages: Object.fromEntries([...images].map(([name, body]) => [name, body.length])),
      stages,
      assertions,
      cold,
      warm,
    };
    fs.writeFileSync(path.join(out, 'trace.json'), JSON.stringify(report, null, 2));
    console.log('ARTWORK_TRACE_REPORT ' + path.join(out, 'trace.json'));
    console.log(JSON.stringify({assertions, coldPid: cold?.pid, warmPid: warm?.pid, coldCarousel: cold?.timings, warmCarousel: warm?.timings, coldBackdrop: cold?.backdrop?.finalNodes?.length, warmBackdrop: warm?.backdrop?.finalNodes?.length, coldPaint: cold?.paint?.[0], warmPaint: warm?.paint?.[0], server: stages.map(row => ({stage: row.stage, status: row.status, requests: row.serverRequests, sentBytes: row.sentBytes, server: row.server}))}, null, 2));
    if (failed || assertions.some(item => !item.pass)) process.exit(1);
    console.log('Native artwork startup trace completed');
  });
}

if (process.versions.electron) runProbe();
else runParent();
