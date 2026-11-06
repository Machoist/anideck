/* Trusted-input scroll trace. Generated loopback images, disposable profile, real Home/title handlers.
 * Usage: node scripts/native-scroll-input-trace.cjs electron.exe source-root output-directory
 * Wheel input is webContents.sendInputEvent or the debugger Input API. It does not dispatch DOM wheel events
 * and it does not assign scroll offsets as the input under measurement. */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const zlib = require('node:zlib');
const {spawn, spawnSync} = require('node:child_process');

const RENDERER_REVISION = '88ec7229595702035fc628ecfc8d46cbbedcf92d';

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
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function gitText(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'git failed').trim());
  return result.stdout.trim();
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function pageApi(origin) {
  const delay = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));
  const counts = {measureImages: 0, imageConstructors: 0, anilist: 0, anizipGet: 0, kitsuCore: 0, kitsuEpisodes: 0, requests: 0, entry: 0, viewsAnime: 0, homeAfter: 0, animeAfter: 0, episodeMapping: 0};
  const paints = [];
  const perf = {longs: [], shifts: [], wheels: [], middles: [], longError: '', shiftError: ''};
  const errors = {homeAfter: '', animeAfter: '', title: ''};
  const resets = [];
  let listToken = 0;
  let gesture = null;
  try {
    const longs = new PerformanceObserver(list => { for (const entry of list.getEntries()) perf.longs.push({start: entry.startTime, duration: entry.duration, name: entry.name}); });
    longs.observe({type: 'longtask', buffered: true});
  } catch (error) { perf.longError = String(error.message || error); }
  try {
    const shifts = new PerformanceObserver(list => { for (const entry of list.getEntries()) perf.shifts.push({start: entry.startTime, value: entry.value, hadRecentInput: !!entry.hadRecentInput}); });
    shifts.observe({type: 'layout-shift', buffered: true});
  } catch (error) { perf.shiftError = String(error.message || error); }
  document.addEventListener('wheel', event => {
    perf.wheels.push({perf: Math.round(event.timeStamp * 10) / 10, date: Date.now(), isTrusted: event.isTrusted, deltaX: event.deltaX, deltaY: event.deltaY, shift: event.shiftKey, defaultPrevented: event.defaultPrevented, cancelable: event.cancelable, target: event.target && (event.target.id || String(event.target.className || '') || event.target.tagName)});
  }, {passive: true});
  document.addEventListener('pointerdown', event => {
    if (event.button === 1) perf.middles.push({date: Date.now(), isTrusted: event.isTrusted, button: event.button});
  }, {passive: true});
  const NativeImage = window.Image;
  window.Image = function InstrumentedImage(...args) {
    counts.imageConstructors++;
    return new NativeImage(...args);
  };
  window.Image.prototype = NativeImage.prototype;
  const makeImage = ArtworkImages.makeImage.bind(ArtworkImages);
  ArtworkImages.makeImage = () => { counts.measureImages++; return makeImage(); };
  const realPaint = TitleReads.paint.bind(TitleReads);
  TitleReads.paint = async function(batch) {
    const list = () => document.querySelector('.ep-list');
    const main = () => document.querySelector('.detail-main');
    const nav = () => document.querySelector('.title-sections');
    const beforeList = list(), beforeMain = main(), beforeNav = nav();
    const row = {date: Date.now(), scrollActiveAtStart: Date.now() < (App.scrollUntil || 0), scrollUntil: App.scrollUntil || 0, beforeId: beforeList?.id || ''};
    paints.push(row);
    try { return await realPaint(batch); }
    finally {
      const afterList = list();
      row.done = Date.now();
      row.listSame = !!beforeList && beforeList === afterList;
      row.mainSame = !!beforeMain && beforeMain === main();
      row.navSame = !!beforeNav && beforeNav === nav();
      row.afterId = afterList?.id || '';
      row.genre = document.querySelector('.meta-line')?.textContent || '';
      row.scrollActiveAtEnd = Date.now() < (App.scrollUntil || 0);
    }
  };
  const realMapping = AniZip.episodeMapping.bind(AniZip);
  AniZip.episodeMapping = async (kitsuId, alId) => { counts.episodeMapping++; return realMapping(kitsuId, alId); };
  const zipCache = new Map();
  AniZip.get = alId => {
    const key = String(alId || '');
    if (!key) return Promise.resolve(null);
    if (zipCache.has(key)) return zipCache.get(key);
    counts.anizipGet++;
    const pending = delay(40, {episodes: {'1': {title: 'Generated still', overview: 'Generated overview', image: origin + '/still-small.png', airDate: '2020-01-01', runtime: 24}}, fanart: '', kitsu: '501', logos: [], banner: '', poster: ''});
    zipCache.set(key, pending);
    return pending;
  };
  AniZip.clearlogos = async () => [];
  Kitsu.externalIds = async id => ({anilist: '501', kitsu: String(id)});
  Kitsu.episodes = async () => { counts.kitsuEpisodes++; await delay(50); return [{number: 1, title: 'Generated episode', thumb: origin + '/still-large.png', synopsis: 'Generated synopsis', airdate: '2020-01-01', length: 24}]; };
  Kitsu.animeFull = async id => { counts.kitsuCore++; await delay(20); return {id, title: 'Generated Title', synopsis: 'Generated synopsis', poster: '', cover: '', coverHd: '', episodes: 1, subtype: 'TV', year: 2020, status: 'finished', titles: ['Generated Title'], url: origin + '/catalog'}; };
  Kitsu.anime = id => Kitsu.animeFull(id);
  AniList.details = async id => {
    counts.anilist++;
    if (String(id) === '501') { await delay(450); return {id: 501, title: 'Generated Title', englishTitle: 'Generated Title', genre: 'Generated', episodes: 1, format: 'TV', year: 2020, score: 77, genres: ['Generated'], banner: null, cover: null, synopsis: 'Generated synopsis'}; }
    await delay(20);
    return {id: 101, title: 'Generated Spotlight', englishTitle: 'Generated Spotlight', score: 80, format: 'TV', year: 2026, episodes: 12, genres: ['Generated'], banner: null, cover: null};
  };
  Requests.has = async () => { counts.requests++; await delay(300); return false; };
  globalThis.trackingEntryState = async () => { counts.entry++; await delay(400); return {entry: null, error: null}; };
  globalThis.showLogo = () => {};
  globalThis.kitsuCover = async () => '';
  globalThis.untilText = () => '';
  function titleHtml(values) {
    const genre = values?.[3]?.genre || 'Core';
    const token = 'list-' + (++listToken);
    const bgs = {lib: null, first: [origin + '/backdrop-sharp.png'], alId: 501, mid: [], last: [], fanart: [], force: '', kitsu: '', alBanner: '', pill: false};
    return `<div class="detail-hero"><div class="hero-bg" data-bgs="${esc(JSON.stringify(bgs))}" style="background-image:url('${origin}/backdrop-initial.png')"></div><div class="hero-inner"><div class="hero-text"><h1>Generated Title</h1><div class="hero-eyebrow">Generated</div><div class="meta-line">${esc(genre)}</div></div></div></div><div class="detail-body"><aside class="detail-side"><div class="side-card"><p>${esc(genre)}</p></div></aside><section class="detail-main"><nav class="title-sections"><button class="title-section" data-tab="episodes">Episodes</button><button class="title-section" data-tab="discussion">Discussion</button><button class="title-section" data-tab="friends">Friends</button></nav><div class="ep-list" id="${token}"><div class="ep" id="ep-row-1" data-num="1"><button class="card"><div class="thumb thumb-pending" data-episode-only="1" data-episode-art="501|1" data-fallback="" data-poster=""><img alt="" hidden></div></button><div class="ep-info"><div class="ep-num">Episode 1 <span class="ep-meta"></span></div><div class="ep-title"></div><div class="ep-overview muted"></div></div></div></div></section></div><div id="title-spacer" style="height:1600px"></div>`;
  }
  Views.anime = async (params, rid) => {
    counts.viewsAnime++;
    const values = params.snapshot || await TitleReads.read(params.id, rid);
    App.showAl = values[3] || null;
    App.showCtx = {match: {id: '501', title: 'Generated Title', episodes: 1}};
    return titleHtml(values);
  };
  function describe(el) {
    if (!el) return '';
    return el.id || String(el.className || '') || el.tagName;
  }
  function offsets() {
    const main = document.getElementById('main');
    const rail = document.querySelector('.rail');
    const week = document.querySelector('.wk2-panel');
    return {
      mainTop: main ? main.scrollTop : null,
      mainLeft: main ? main.scrollLeft : null,
      mainOverflow: !!(main && main.scrollHeight > main.clientHeight + 4),
      mainScrollHeight: main ? main.scrollHeight : 0,
      mainClientHeight: main ? main.clientHeight : 0,
      railLeft: rail ? rail.scrollLeft : null,
      railOverflow: !!(rail && rail.scrollWidth > rail.clientWidth + 4),
      railScrollWidth: rail ? rail.scrollWidth : 0,
      railClientWidth: rail ? rail.clientWidth : 0,
      weekLeft: week ? week.scrollLeft : null,
      weekOverflow: !!(week && week.scrollWidth > week.clientWidth + 4),
    };
  }
  function scrolled(before, after) {
    const names = [];
    if (before && after && Math.abs((after.mainTop || 0) - (before.mainTop || 0)) > 4) names.push('main');
    if (before && after && Math.abs((after.railLeft || 0) - (before.railLeft || 0)) > 4) names.push('rail');
    if (before && after && Math.abs((after.weekLeft || 0) - (before.weekLeft || 0)) > 4) names.push('week');
    return names;
  }
  function aimOf(selector, yBias) {
    const el = document.querySelector(selector);
    if (!el) return {ok: false, selector, x: 0, y: 0, hit: '', inMain: false, inRail: false};
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + Math.min(Math.max(rect.width / 2, 1), 640));
    const y = Math.round(rect.top + Math.min(yBias, Math.max(rect.height - 8, 0)));
    const hit = document.elementFromPoint(x, y);
    return {ok: true, selector, x, y, rect: {left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height)}, hit: describe(hit), inMain: !!(hit && hit.closest && hit.closest('#main')), inRail: !!(hit && hit.closest && hit.closest('.rail'))};
  }
  const api = {
    counts, paints, errors, resets, perf,
    async prepare() {
      await TitleArtwork.load(new Map());
      await ArtworkImages.load();
      return {gate: typeof TitleReads.defer === 'function' && String(TitleReads.paint).includes('scrollUntil') && String(TitleReads.defer).includes('scrollUntil'), visibility: document.visibilityState, hidden: document.hidden};
    },
    buildHome() {
      App.view = 'home';
      App.renderId = 1;
      App.params = {};
      App.scrollUntil = 0;
      const slide = {kind: 'anime', a: {id: '101', title: 'Generated Spotlight', titles: ['Generated Spotlight'], poster: '', synopsis: 'Generated synopsis', subtype: 'TV', year: 2026, episodes: 12, rating: 80}, srcs: [origin + '/carousel.png'], fan: null};
      const cards = Array.from({length: 12}, (_, index) => `<button class="card" style="flex:none;width:160px;height:90px">Generated ${index}</button>`);
      document.getElementById('main').innerHTML = `<div class="home-slot" data-home-slot="hero"><section class="hero-carousel" id="carousel">${heroSlide(slide, 0)}<div class="car-nav"><button type="button" data-car="-1">Back</button><div class="car-dots"></div><button type="button" data-car="1">Next</button></div></section></div><div class="home-slot" data-home-slot="trending">${rail('Trending', cards)}</div><div id="home-spacer" style="height:1600px"></div>`;
      return {offsets: offsets(), mainAim: aimOf('#carousel', 90), railAim: aimOf('.rail', 30)};
    },
    aimMain() { return aimOf(document.querySelector('.detail-hero') ? '.detail-hero' : '#carousel', 90); },
    aimRail() { return aimOf('.rail', 30); },
    offsets,
    resetScroll(label) {
      const before = offsets();
      const main = document.getElementById('main');
      const rail = document.querySelector('.rail');
      if (main) main.scrollTop = 0;
      if (rail) rail.scrollLeft = 0;
      const row = {label, kind: 'fixture-setup-assignment', before, after: offsets()};
      resets.push(row);
      return row;
    },
    async waitMarker() {
      const start = Date.now();
      while (Date.now() < (App.scrollUntil || 0) && Date.now() - start < 2000) await delay(20);
      return {now: Date.now(), scrollUntil: App.scrollUntil || 0, waited: Date.now() - start};
    },
    begin(name) {
      const start = performance.now();
      gesture = {name, start, dateStart: Date.now(), last: start, frames: [], running: true, wheelFrom: perf.wheels.length, constructors: counts.imageConstructors, before: offsets(), scrollUntil: App.scrollUntil || 0};
      const sample = now => {
        if (!gesture || !gesture.running) return;
        gesture.frames.push(now - gesture.last);
        gesture.last = now;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return {name, dateStart: gesture.dateStart, before: gesture.before};
    },
    end() {
      const state = gesture;
      const stop = performance.now();
      state.running = false;
      const after = offsets();
      const frames = state.frames.filter(value => value > 0);
      const largest = [...frames].sort((a, b) => b - a).slice(0, 8).map(value => Math.round(value * 10) / 10);
      const wheels = perf.wheels.slice(state.wheelFrom);
      const longs = perf.longs.filter(entry => entry.start < stop && entry.start + entry.duration > state.start);
      const shifts = perf.shifts.filter(entry => entry.start >= state.start && entry.start <= stop);
      return {
        name: state.name,
        dateStart: state.dateStart,
        dateEnd: Date.now(),
        wallMs: Math.round(stop - state.start),
        before: state.before,
        after,
        scrolled: scrolled(state.before, after),
        scrollUntilStart: state.scrollUntil,
        scrollUntilEnd: App.scrollUntil || 0,
        visibility: document.visibilityState,
        hidden: document.hidden,
        frames: {samples: frames.length, largestGapMs: largest[0] || 0, largestGapsMs: largest},
        longTasks: {count: longs.length, totalMs: Math.round(longs.reduce((sum, entry) => sum + entry.duration, 0) * 10) / 10, entries: longs.map(entry => ({duration: Math.round(entry.duration * 10) / 10, name: entry.name})), error: perf.longError},
        layoutShifts: {count: shifts.length, valueSum: Math.round(shifts.reduce((sum, entry) => sum + entry.value, 0) * 1000) / 1000, withRecentInput: shifts.filter(entry => entry.hadRecentInput).length, error: perf.shiftError},
        constructorsDuring: counts.imageConstructors - state.constructors,
        wheels,
        trusted: wheels.filter(item => item.isTrusted).length,
        untrusted: wheels.filter(item => !item.isTrusted).length,
        defaultPrevented: wheels.filter(item => item.defaultPrevented).length,
      };
    },
    startHomeAfter() {
      counts.homeAfter++;
      globalThis.__homeAfter = homeAfter({}, 1).catch(error => { errors.homeAfter = String(error && error.stack || error); });
      return {started: Date.now()};
    },
    async finishHomeAfter() {
      await globalThis.__homeAfter;
      clearInterval(App.carouselTimer);
      const image = document.querySelector('#carousel .slide.on .slide-img');
      const box = document.querySelector('#carousel')?.getBoundingClientRect();
      return {error: errors.homeAfter, src: image?.getAttribute('src') || '', naturalWidth: image?.naturalWidth || 0, naturalHeight: image?.naturalHeight || 0, box: box ? {width: Math.round(box.width), height: Math.round(box.height)} : null, loadingArt: !!document.querySelector('#carousel.loading-art')};
    },
    startTitle() {
      clearInterval(App.carouselTimer);
      clearInterval(App.wkTimer);
      App.view = 'anime';
      App.params = {id: '501'};
      App.renderId = 2;
      globalThis.__titleHtml = Views.anime({id: '501'}, 2).catch(error => { errors.title = String(error && error.stack || error); throw error; });
      return {started: Date.now(), scrollUntil: App.scrollUntil || 0};
    },
    async applyTitle() {
      const html = await globalThis.__titleHtml;
      document.getElementById('main').innerHTML = html;
      const posted = offsets();
      TitleReads.mounted(2);
      counts.animeAfter++;
      globalThis.__animeAfter = Views.animeAfter(App.params, 2).catch(error => { errors.animeAfter = String(error && error.stack || error); });
      return {mountedAt: Date.now(), genre: document.querySelector('.meta-line')?.textContent || '', listId: document.querySelector('.ep-list')?.id || '', offsets: posted, aim: aimOf('.detail-hero', 90), scrollUntil: App.scrollUntil || 0, error: errors.title};
    },
    async waitLate(timeoutMs) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const applied = paints.some(row => row.scrollActiveAtStart === false && row.listSame === false && String(row.genre).includes('Generated'));
        if (applied && Date.now() >= (App.scrollUntil || 0)) return {applied: true, waited: Date.now() - start, scrollUntil: App.scrollUntil || 0, now: Date.now()};
        await delay(40);
      }
      return {applied: false, waited: Date.now() - start, scrollUntil: App.scrollUntil || 0, now: Date.now(), genre: document.querySelector('.meta-line')?.textContent || ''};
    },
    async finishTitle() {
      await Promise.race([globalThis.__animeAfter || Promise.resolve(), delay(8000)]);
      const image = document.querySelector('.ep img');
      const nodes = [...document.querySelectorAll('.hero-bg-img')].map(img => ({src: (img.currentSrc || img.src || '').replace(origin, ''), on: img.classList.contains('on'), w: img.naturalWidth, h: img.naturalHeight}));
      return {error: errors.animeAfter, episodeTitle: document.querySelector('.ep-title')?.textContent || '', stillWidth: image?.naturalWidth || 0, stillSrc: (image?.currentSrc || image?.src || '').replace(origin, ''), nodes, genre: document.querySelector('.meta-line')?.textContent || '', listId: document.querySelector('.ep-list')?.id || ''};
    },
    collect() {
      const pageOrigin = new URL(origin).origin;
      const samePage = value => { try { return new URL(value).origin === pageOrigin; } catch { return false; } };
      const resources = performance.getEntriesByType('resource').filter(entry => samePage(entry.name)).map(entry => ({name: new URL(entry.name).pathname, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, duration: Math.round(entry.duration * 10) / 10}));
      const fixtureUrls = [origin + '/carousel.png', origin + '/backdrop-sharp.png', origin + '/backdrop-initial.png', origin + '/still-small.png', origin + '/still-large.png'];
      return {
        counts,
        paints,
        resets,
        resources,
        dimensionStore: {rows: ArtworkImages.rows.size, fixtureUrls: [...ArtworkImages.rows.keys()].filter(samePage), publicImageRejectsFixture: fixtureUrls.every(url => ArtworkImages.valid({u: url, w: 100, h: 100, at: Date.now()}) === false)},
        observer: {longError: perf.longError, shiftError: perf.shiftError},
        visibility: document.visibilityState,
        hidden: document.hidden,
      };
    },
  };
  globalThis.ScrollTrace = api;
  return {installed: true};
}

function validateSource(root) {
  const titleReads = readText(path.join(root, 'src/title-reads.js'));
  if (!titleReads.includes('this.defer(batch)')) throw new Error('SOURCE ROOT title-reads.js has no TitleReads.defer');
  if (!titleReads.includes('if(Date.now()<(App.scrollUntil||0)){this.defer(batch);return;}')) throw new Error('SOURCE ROOT title-reads.js has no scrollUntil early return');
  if (!titleReads.includes('if(Date.now()<(App.scrollUntil||0)){batch.dirty=true;this.defer(batch);return;}')) throw new Error('SOURCE ROOT title-reads.js has no post-markup scrollUntil gate');
  const head = gitText(root, ['rev-parse', 'HEAD']);
  const ancestor = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', RENDERER_REVISION, head], {encoding: 'utf8'});
  if (ancestor.status !== 0) throw new Error('SOURCE ROOT does not contain renderer ' + RENDERER_REVISION);
  const srcDiff = gitText(root, ['diff', '--stat', RENDERER_REVISION, 'HEAD', '--', 'src']);
  if (srcDiff) throw new Error('SOURCE ROOT src differs from ' + RENDERER_REVISION + ': ' + srcDiff);
  const appSource = readText(path.join(root, 'src/app.js'));
  const apiSource = readText(path.join(root, 'src/api.js'));
  const checks = [
    [appSource, 'function setEpisodeThumb(row,sources){', '// Title-page backdrop.', 'setEpisodeThumb', 'function setEpisodeThumb'],
    [appSource, 'const bgChoice = new Map();', 'async function setListProgress', 'upgradeBackdrop', 'async function upgradeBackdrop'],
    [appSource, 'function firstUsableArtwork(', '/* ================================ VIEWS', 'HomeReads', 'const HomeReads='],
    [appSource, '  async homeAfter(', '  async library(', 'homeAfter', 'firstUsableArtwork'],
    [appSource, '  async animeAfter(', '  async schedule(', 'animeAfter', 'upgradeBackdrop'],
    [apiSource, '  async episodeMapping(', '  get(alId)', 'episodeMapping', 'async episodeMapping'],
    [appSource, 'function rail(title, items,', 'function homeShelf(', 'rail', 'class="rail'],
    [appSource, 'function heroSlide(sl, i) {', '// Schedule "My shows"', 'heroSlide', 'slide-img'],
  ];
  for (const [source, start, end, label, needle] of checks) {
    const text = cut(source, start, end, label);
    if (!text.includes(needle)) throw new Error('Slice ' + label + ' did not include ' + needle);
  }
  const files = ['src/app.js', 'src/api.js', 'src/title-reads.js', 'src/title-panels.js', 'src/smooth-wheel.js', 'src/home-refresh.js', 'src/styles.css', 'src/title-artwork-store.js', 'src/spotlight-art.js'];
  return {head, renderer: RENDERER_REVISION, srcDiffEmpty: true, hashes: Object.fromEntries(files.map(file => [file, sha256(path.join(root, file))]))};
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

async function runProbe() {
  const profile = path.resolve(argValue('--profile'));
  const output = path.resolve(argValue('--output'));
  const root = path.resolve(argValue('--root'));
  const origin = argValue('--origin');
  const stage = argValue('--stage');
  const revision = process.env.SCROLL_TRACE_REVISION || '';
  const renderer = process.env.SCROLL_TRACE_RENDERER || '';
  if (!profile.includes('anideck-scroll-input-') || !output || !root || !origin.startsWith('http://127.0.0.1:') || !['cold', 'warm'].includes(stage)) {
    console.error('Probe arguments were not an isolated scroll-input profile');
    process.exit(2);
  }
  const {app, BrowserWindow, session} = require('electron');
  app.commandLine.appendSwitch('no-proxy-server');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.on('window-all-closed', () => {});
  const position = async (win, spec) => {
    if (spec.api === 'debugger') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type: 'mouseMoved', x: spec.x, y: spec.y, pointerType: 'mouse'});
    else win.webContents.sendInputEvent({type: 'mouseMove', x: spec.x, y: spec.y});
  };
  const wheelOnce = async (win, spec) => {
    if (spec.api === 'debugger') {
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type: 'mouseWheel', x: spec.x, y: spec.y, deltaX: spec.deltaX, deltaY: spec.deltaY, modifiers: (spec.modifiers || []).includes('shift') ? 8 : 0, pointerType: 'mouse'});
      return;
    }
    win.webContents.sendInputEvent({type: 'mouseWheel', x: spec.x, y: spec.y, deltaX: spec.deltaX, deltaY: spec.deltaY, wheelTicksX: spec.deltaX / 120, wheelTicksY: spec.deltaY / 120, accelerationRatioX: 1, accelerationRatioY: 1, hasPreciseScrollingDeltas: true, canScroll: true, modifiers: spec.modifiers || []});
  };
  const burst = async (win, spec, count, interval) => {
    const sends = [];
    for (let i = 0; i < count; i++) {
      const at = Date.now();
      await position(win, spec);
      await wheelOnce(win, spec);
      sends.push({at, x: spec.x, y: spec.y, deltaX: spec.deltaX, deltaY: spec.deltaY, modifiers: spec.modifiers || [], api: spec.api});
      if (i + 1 < count) await delay(interval);
    }
    return sends;
  };
  app.whenReady().then(async () => {
    const pageErrors = [];
    const network = [];
    let win = null;
    try {
      await session.defaultSession.setProxy({mode: 'direct'});
      const allowedOrigin = new URL(origin).origin;
      const parsed = value => { try { return new URL(value); } catch { return null; } };
      const httpUrl = url => !!url && (url.protocol === 'http:' || url.protocol === 'https:');
      session.defaultSession.webRequest.onBeforeRequest({urls: ['<all_urls>']}, (details, callback) => {
        const url = parsed(details.url);
        if (httpUrl(url) && url.origin !== allowedOrigin) {
          network.push({t: Date.now(), phase: 'blocked', url: details.url});
          callback({cancel: true});
          return;
        }
        callback({});
      });
      session.defaultSession.webRequest.onCompleted({urls: ['<all_urls>']}, details => {
        const url = parsed(details.url);
        if (!url) return;
        if (url.origin === allowedOrigin) network.push({t: Date.now(), phase: 'completed', url: url.pathname, status: details.statusCode, fromCache: !!details.fromCache});
        else if (httpUrl(url)) network.push({t: Date.now(), phase: 'foreign', url: details.url, status: details.statusCode});
      });
      session.defaultSession.webRequest.onErrorOccurred({urls: ['<all_urls>']}, details => {
        const url = parsed(details.url);
        if (!url || !httpUrl(url)) return;
        network.push({t: Date.now(), phase: 'error', url: details.url, error: details.error});
      });
      win = new BrowserWindow({show: false, width: 1360, height: 900, webPreferences: {backgroundThrottling: false, contextIsolation: true, nodeIntegration: false}});
      win.webContents.setBackgroundThrottling(false);
      win.webContents.setZoomFactor(1);
      win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) pageErrors.push({level, message: String(message)}); });
      const js = code => win.webContents.executeJavaScript(code, false);
      const appSource = readText(path.join(root, 'src/app.js'));
      const apiSource = readText(path.join(root, 'src/api.js'));
      await win.loadURL(origin + '/fixture.html');
      await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8') + 'html,body{height:100%;margin:0;overflow:hidden !important}#main{height:760px !important;overflow:auto !important;overscroll-behavior:contain}#carousel,.hero-carousel{width:1280px !important;height:420px !important}.detail-hero{width:1280px !important;height:480px !important;min-height:480px !important}.rail-wrap{width:480px !important;max-width:480px !important}.rail{display:grid !important;grid-auto-flow:column !important;grid-auto-columns:160px !important;gap:8px !important;overflow-x:auto !important;overflow-y:hidden !important;width:480px !important;max-width:480px !important;overscroll-behavior:contain}.thumb{width:280px;height:158px;display:block}.thumb img{width:100%;height:100%;object-fit:cover}');
      await js(`globalThis.$=s=>document.querySelector(s);globalThis.App={view:'home',params:{},history:[],selected:new Set(),renderId:1,settings:{titleLang:'en',epSort:'asc'},scrollUntil:0,carouselTimer:null,libIndex:{find:()=>null},stale(id){return id!==this.renderId;},refresh(){return Promise.resolve();},saveSettings(){return Promise.resolve();}};globalThis.Jellyfin={server:'',connected:()=>false,userId:'',token:''};globalThis.AniList={detailsCache:{},idCache:{}};globalThis.Tracker={name:'generated',loggedIn:()=>false,svc:AniList};globalThis.Kitsu={};globalThis.AniZip={};globalThis.Requests={enabled:()=>false};globalThis.Trakt={fanartFor:async()=>[]};globalThis.queueScope=()=>'generated';globalThis.QueueRecovery={schedule(){}};globalThis.bindYourNext=()=>{};globalThis.enhanceMosaic=async()=>{};globalThis.spotlightDuration=()=>60000;globalThis.showTint=()=>{};globalThis.checkRemoteEpisodes=()=>{};globalThis.enrichTitleStory=async()=>{};globalThis.fillRelated=async()=>{};globalThis.fillSocial=async()=>{};globalThis.soonPrequels=()=>{};globalThis.countdownText=()=>'';globalThis.icon=()=>'';globalThis.window.native={get:async()=>null,set:async()=>{}};globalThis.Views={};void 0;`);
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
      await js(cut(appSource, 'const bgChoice = new Map();', 'async function setListProgress', 'upgradeBackdrop') + ';void 0;');
      await js('const titleLogoCache=new Map();\n' + cut(appSource, 'function titleArtworkId(', 'async function findTitleLogo', 'logoHeading'));
      await js(cut(appSource, 'function carouselArtworkScore(', '// Schedule "My shows"', 'heroSlide'));
      await js(cut(appSource, 'function firstUsableArtwork(', '/* ================================ VIEWS', 'HomeReads'));
      await js(cut(appSource, 'function rail(title, items,', 'function homeShelf(', 'rail'));
      await js(cut(appSource, 'function updateRailArrows(root = document) {', '/* ================================ NOTIFICATIONS', 'updateRailArrows'));
      const homeSlice = cut(appSource, '  async homeAfter(', '  async library(', 'homeAfter');
      const animeSlice = cut(appSource, '  async animeAfter(', '  async schedule(', 'animeAfter');
      await js('Views.homeAfter=({' + homeSlice.trim() + '}).homeAfter;globalThis.homeAfter=Views.homeAfter;void 0;');
      await js('Views.animeAfter=({' + animeSlice.trim() + '}).animeAfter;void 0;');
      await js('globalThis.AniZip=globalThis.AniZip||{};AniZip.episodeMapping=({' + cut(apiSource, '  async episodeMapping(', '  get(alId)', 'episodeMapping').trim() + '}).episodeMapping;void 0;');
      const prepared = await js('(' + pageApi.toString() + ')(' + JSON.stringify(origin) + ')');
      const gate = await js('ScrollTrace.prepare()');
      if (!prepared.installed || !gate.gate) throw new Error('Loaded renderer has no title scroll deferral');
      const home = await js('ScrollTrace.buildHome()');
      if (!home.offsets.mainOverflow) throw new Error('Home #main does not overflow: ' + JSON.stringify(home.offsets));
      if (!home.offsets.railOverflow) throw new Error('Home rail does not overflow: ' + JSON.stringify(home.offsets));
      if (!home.mainAim.inMain || home.mainAim.inRail) throw new Error('Vertical aim is not on #main outside the rail: ' + JSON.stringify(home.mainAim));
      const windowState = () => ({visible: win.isVisible(), focused: win.isFocused(), minimized: win.isMinimized()});
      const modes = [
        {name: 'sendInputEvent-hidden', api: 'sendInputEvent', show: false, focus: false},
        {name: 'sendInputEvent-showInactive', api: 'sendInputEvent', show: true, focus: false},
        {name: 'debugger-showInactive', api: 'debugger', show: true, focus: false},
        {name: 'sendInputEvent-focused', api: 'sendInputEvent', show: true, focus: true},
        {name: 'debugger-focused', api: 'debugger', show: true, focus: true},
      ];
      let proof = null;
      const proofTries = [];
      for (const mode of modes) {
        if (mode.show && !mode.focus) win.showInactive();
        if (mode.focus) { win.show(); win.focus(); }
        if (mode.api === 'debugger' && !win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3');
        for (const sign of [1, -1]) {
          await js('ScrollTrace.resetScroll("proof-reset")');
          await js('ScrollTrace.begin("proof")');
          const spec = {api: mode.api, x: home.mainAim.x, y: home.mainAim.y, deltaX: 0, deltaY: sign * 120, modifiers: []};
          const sends = await burst(win, spec, 3, 40);
          await delay(150);
          const ended = await js('ScrollTrace.end()');
          const moved = ended.scrolled.includes('main') && ended.after.mainOverflow && ended.trusted > 0;
          proofTries.push({mode: mode.name, sign, moved, scrolled: ended.scrolled, trusted: ended.trusted, before: ended.before.mainTop, after: ended.after.mainTop, window: windowState()});
          if (moved) {
            proof = {mode: mode.name, api: mode.api, sign, aim: home.mainAim, sends, ended, window: windowState()};
            break;
          }
        }
        if (proof) break;
      }
      if (!proof) throw new Error('Trusted wheel did not move overflowing #main: ' + JSON.stringify(proofTries));
      console.log('SCROLL_INPUT_PROOF ' + proof.mode + ' sign=' + proof.sign);
      const inputMode = {name: proof.mode, api: proof.api, verticalSign: proof.sign, window: proof.window};
      await js('ScrollTrace.waitMarker()');
      await js('ScrollTrace.resetScroll("before-home-vertical")');
      await js('ScrollTrace.startHomeAfter()');
      await js('ScrollTrace.begin("home-vertical")');
      const homeSends = await burst(win, {api: proof.api, x: home.mainAim.x, y: home.mainAim.y, deltaX: 0, deltaY: proof.sign * 120, modifiers: []}, 12, 50);
      await delay(150);
      const homeGesture = await js('ScrollTrace.end()');
      homeGesture.sends = homeSends;
      homeGesture.aim = home.mainAim;
      const carousel = await js('ScrollTrace.finishHomeAfter()');
      await js('ScrollTrace.waitMarker()');
      await js('ScrollTrace.resetScroll("before-rail-aim")');
      const railAim = await js('ScrollTrace.aimRail()');
      if (!railAim.inRail) throw new Error('Rail aim missed the rail: ' + JSON.stringify(railAim));
      const railAttempts = [
        {label: 'deltaX', deltaX: 160, deltaY: 0, modifiers: []},
        {label: 'deltaX-negative', deltaX: -160, deltaY: 0, modifiers: []},
        {label: 'shift+deltaY', deltaX: 0, deltaY: proof.sign * 160, modifiers: ['shift']},
      ];
      let railGesture = null;
      const railTries = [];
      for (const attempt of railAttempts) {
        await js('ScrollTrace.resetScroll("before-rail-" + ' + JSON.stringify(attempt.label) + ')');
        await js('ScrollTrace.begin("home-rail")');
        const sends = await burst(win, {api: proof.api, x: railAim.x, y: railAim.y, deltaX: attempt.deltaX, deltaY: attempt.deltaY, modifiers: attempt.modifiers}, 6, 40);
        await delay(150);
        const ended = await js('ScrollTrace.end()');
        ended.sends = sends;
        ended.aim = railAim;
        ended.axis = attempt.label;
        railTries.push({axis: attempt.label, scrolled: ended.scrolled, trusted: ended.trusted, before: ended.before.railLeft, after: ended.after.railLeft});
        if (ended.scrolled.includes('rail') && ended.after.railOverflow && ended.trusted > 0) { railGesture = ended; break; }
      }
      if (!railGesture) throw new Error('Trusted wheel did not move overflowing rail: ' + JSON.stringify(railTries));
      await js('ScrollTrace.waitMarker()');
      await js('ScrollTrace.resetScroll("before-title")');
      const titleAim = await js('ScrollTrace.aimMain()');
      await js('ScrollTrace.begin("title-deferred")');
      const titleStart = await js('ScrollTrace.startTitle()');
      const titleSends = [];
      const liveAim = {x: titleAim.x, y: titleAim.y};
      let titleMountedAt = 0;
      const titleJob = (async () => {
        for (let i = 0; i < 16; i++) {
          const at = Date.now();
          const spec = {api: proof.api, x: liveAim.x, y: liveAim.y, deltaX: 0, deltaY: proof.sign * 120, modifiers: []};
          await position(win, spec);
          await wheelOnce(win, spec);
          titleSends.push({at, x: spec.x, y: spec.y, deltaX: spec.deltaX, deltaY: spec.deltaY, modifiers: [], api: spec.api, phase: 'pending'});
          if (i + 1 < 16) await delay(50);
        }
      })();
      await delay(220);
      const mounted = await js('ScrollTrace.applyTitle()');
      titleMountedAt = mounted.mountedAt || Date.now();
      if (mounted.aim && mounted.aim.inMain && !mounted.aim.inRail) { liveAim.x = mounted.aim.x; liveAim.y = mounted.aim.y; }
      await titleJob;
      titleSends.forEach(row => { row.phase = row.at < titleMountedAt ? 'before-mount' : 'after-mount'; });
      await delay(180);
      const titleGesture = await js('ScrollTrace.end()');
      titleGesture.sends = titleSends;
      titleGesture.aim = titleAim;
      titleGesture.mounted = mounted;
      titleGesture.titleStart = titleStart;
      titleGesture.movedAfterMount = Math.abs((titleGesture.after.mainTop || 0) - (mounted.offsets.mainTop || 0)) > 4;
      const late = await js('ScrollTrace.waitLate(2500)');
      const titleDone = await js('ScrollTrace.finishTitle()');
      await delay(300);
      await js('ScrollTrace.waitMarker()');
      await js('ScrollTrace.resetScroll("before-settled-title")');
      const settledAim = await js('ScrollTrace.aimMain()');
      await js('ScrollTrace.begin("title-settled")');
      const settledSends = await burst(win, {api: proof.api, x: settledAim.x, y: settledAim.y, deltaX: 0, deltaY: proof.sign * 120, modifiers: []}, 6, 50);
      await delay(150);
      const settledGesture = await js('ScrollTrace.end()');
      settledGesture.sends = settledSends;
      settledGesture.aim = settledAim;
      await js('ScrollTrace.resetScroll("before-middle")');
      const middleBefore = await js('ScrollTrace.offsets()');
      const middleAim = await js('ScrollTrace.aimMain()');
      const middleSends = [];
      const middleDown = async () => {
        if (proof.api === 'debugger') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type: 'mousePressed', x: middleAim.x, y: middleAim.y, button: 'middle', clickCount: 1, pointerType: 'mouse'});
        else win.webContents.sendInputEvent({type: 'mouseDown', x: middleAim.x, y: middleAim.y, button: 'middle', clickCount: 1});
      };
      const middleMove = async () => {
        if (proof.api === 'debugger') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type: 'mouseMoved', x: middleAim.x, y: middleAim.y + 48, button: 'middle', pointerType: 'mouse'});
        else win.webContents.sendInputEvent({type: 'mouseMove', x: middleAim.x, y: middleAim.y + 48, button: 'middle'});
      };
      const middleUp = async () => {
        if (proof.api === 'debugger') await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type: 'mouseReleased', x: middleAim.x, y: middleAim.y + 48, button: 'middle', clickCount: 1, pointerType: 'mouse'});
        else win.webContents.sendInputEvent({type: 'mouseUp', x: middleAim.x, y: middleAim.y + 48, button: 'middle', clickCount: 1});
      };
      middleSends.push({at: Date.now(), type: 'mouseDown', button: 'middle', api: proof.api});
      await middleDown();
      await delay(80);
      middleSends.push({at: Date.now(), type: 'mouseMove', button: 'middle', api: proof.api});
      await middleMove();
      await delay(450);
      const middleAfter = await js('ScrollTrace.offsets()');
      const middleEvents = await js('ScrollTrace.perf.middles.slice()');
      middleSends.push({at: Date.now(), type: 'mouseUp', button: 'middle', api: proof.api});
      await middleUp();
      const middleMoved = Math.abs((middleAfter.mainTop || 0) - (middleBefore.mainTop || 0)) > 4;
      const collected = await js('ScrollTrace.collect()');
      const gestures = [homeGesture, railGesture, titleGesture, settledGesture];
      for (const gesture of gestures) {
        gesture.network = network.filter(row => row.t >= gesture.dateStart && row.t <= gesture.dateEnd).map(row => ({phase: row.phase, url: row.url, status: row.status, fromCache: row.fromCache}));
      }
      const result = {
        stage, pid: process.pid, revision, renderer,
        versions: {electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node},
        profile, origin, zoom: win.webContents.getZoomFactor(), inputMode, proof: {mode: proof.mode, sign: proof.sign, scrolled: proof.ended.scrolled, trusted: proof.ended.trusted, before: proof.ended.before.mainTop, after: proof.ended.after.mainTop, window: proof.window}, proofTries,
        window: windowState(), focusedFixture: !!proof.window.focused,
        offscreen: false, physicalMouse: false,
        gestures, railTries, carousel, late, titleDone, collected,
        middle: {verified: middleMoved && middleEvents.some(item => item.isTrusted), moved: middleMoved, trustedPointers: middleEvents.filter(item => item.isTrusted).length, before: middleBefore.mainTop, after: middleAfter.mainTop, events: middleEvents, sends: middleSends, note: middleMoved ? 'Middle-button sequence moved #main in this fixture.' : 'Native middle-button sequence did not move the scroller. Autoscroll is unverified; no DOM event was substituted.'},
        network, pageErrors: pageErrors.slice(0, 30),
        imageFixture: 'solid PNG; constructor counts and resource decodedBodySize are not decode counts',
        fixtureDelay: {'backdrop-sharp.png': '400ms only when the request reaches the loopback server'},
      };
      fs.mkdirSync(output, {recursive: true});
      fs.writeFileSync(path.join(output, stage + '.json'), JSON.stringify(result, null, 2));
      console.log('SCROLL_INPUT_' + stage.toUpperCase() + ' pid=' + process.pid + ' mode=' + proof.mode);
      if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
      win.destroy();
      app.exit(0);
    } catch (error) {
      const failure = {stage, pid: process.pid, revision, renderer, error: String(error && error.stack || error), pageErrors, network};
      try { fs.mkdirSync(output, {recursive: true}); fs.writeFileSync(path.join(output, stage + '.json'), JSON.stringify(failure, null, 2)); } catch {}
      console.error(failure.error);
      try { if (win && win.webContents.debugger.isAttached()) win.webContents.debugger.detach(); } catch {}
      app.exit(1);
    }
  }).catch(error => { console.error(error); process.exit(1); });
}

function runParent() {
  const [binary, appRoot, output] = process.argv.slice(2);
  if (!binary || !appRoot || !output || binary.startsWith('--')) {
    throw new Error('Usage: node scripts/native-scroll-input-trace.cjs electron.exe source-root output-directory');
  }
  const root = path.resolve(appRoot);
  const out = path.resolve(output);
  const identity = validateSource(root);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anideck-scroll-input-'));
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
    const delayMs = pathname === '/backdrop-sharp.png' ? 400 : 0;
    const entry = {t: Date.now(), method: request.method, path: pathname, ifNoneMatch: request.headers['if-none-match'] || null, bytes: body ? body.length : 0, delayMs, sentBytes: 0, status: 0};
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
      const headers = {'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', ETag: etag, 'Timing-Allow-Origin': '*'};
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
    if (delayMs) setTimeout(send, delayMs); else send();
  });
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    if (new Set([1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080]).has(port)) {
      throw new Error('Loopback port ' + port + ' is blocked by Chromium');
    }
    const origin = 'http://127.0.0.1:' + port;
    const env = {...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    env.SCROLL_TRACE_REVISION = identity.head;
    env.SCROLL_TRACE_RENDERER = identity.renderer;
    const launch = args => new Promise(resolve => {
      const child = spawn(path.resolve(binary), args, {env, windowsHide: true});
      let stdout = '', stderr = '', settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => { child.kill(); finish({status: null, error: new Error('ETIMEDOUT'), stdout, stderr}); }, 120000);
      child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
      child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
      child.on('error', error => finish({status: null, error, stdout, stderr}));
      child.on('close', status => finish({status, error: null, stdout, stderr}));
    });
    const stages = [];
    let failed = false;
    for (const stage of ['cold', 'warm']) {
      const started = Date.now();
      const result = await launch([__filename, '--stage', stage, '--profile', userData, '--output', out, '--root', root, '--origin', origin]);
      const ended = Date.now();
      const serverRows = serverLog.filter(entry => entry.t >= started - 50 && entry.t <= ended + 2000);
      stages.push({stage, status: result.status, error: result.error ? String(result.error.message || result.error) : '', started, ended, wallMs: ended - started, server: summarizeServer(serverRows), serverRequests: serverRows.length, sentBytes: serverRows.reduce((sum, entry) => sum + (entry.sentBytes || 0), 0)});
      if (result.status !== 0) { failed = true; break; }
    }
    server.close();
    let cold = null, warm = null;
    try { cold = JSON.parse(fs.readFileSync(path.join(out, 'cold.json'), 'utf8')); } catch {}
    try { warm = JSON.parse(fs.readFileSync(path.join(out, 'warm.json'), 'utf8')); } catch {}
    const assertions = [];
    const check = (name, pass, detail) => assertions.push({name, pass: !!pass, detail});
    const gesture = (stage, name) => (stage?.gestures || []).find(item => item.name === name);
    const completedPaths = stage => (stage?.network || []).filter(row => row.phase === 'completed').map(row => row.url);
    const unexpected = stage => (stage?.network || []).filter(row => row.phase === 'blocked' || row.phase === 'foreign' || row.phase === 'error');
    const loggedFixture = paths => paths.includes('/fixture.html') && paths.some(item => String(item).endsWith('.png'));
    const movedMain = item => !!item && item.scrolled.includes('main') && item.after?.mainOverflow && item.trusted > 0 && item.untrusted === 0;
    const titleMoved = item => movedMain(item) && item.movedAfterMount === true && (item.sends || []).some(row => row.phase === 'before-mount') && (item.sends || []).some(row => row.phase === 'after-mount');
    const during = stage => (stage?.collected?.paints || []).filter(row => row.scrollActiveAtStart === true);
    const replacedDuring = stage => during(stage).some(row => row.listSame === false);
    const appliedAfter = stage => (stage?.collected?.paints || []).some(row => row.scrollActiveAtStart === false && row.listSame === false && String(row.genre).includes('Generated') && row.mainSame === true && row.navSame === true);
    check('distinct process ids', cold?.pid && warm?.pid && cold.pid !== warm.pid, [cold?.pid, warm?.pid]);
    check('loaded renderer exposes the scroll deferral', cold?.collected && warm?.collected && !cold.error && !warm.error, [cold?.error, warm?.error]);
    check('cold fixture network log records the document and an image', loggedFixture(completedPaths(cold)), completedPaths(cold));
    check('warm fixture network log records the document and an image', loggedFixture(completedPaths(warm)), completedPaths(warm));
    check('no external http attempts', unexpected(cold).length === 0 && unexpected(warm).length === 0, [...unexpected(cold), ...unexpected(warm)]);
    check('cold vertical wheel moved overflowing main', movedMain(gesture(cold, 'home-vertical')) && titleMoved(gesture(cold, 'title-deferred')), {home: gesture(cold, 'home-vertical')?.scrolled, title: gesture(cold, 'title-deferred')?.scrolled, afterMount: gesture(cold, 'title-deferred')?.movedAfterMount, trusted: [gesture(cold, 'home-vertical')?.trusted, gesture(cold, 'title-deferred')?.trusted]});
    check('warm vertical wheel moved overflowing main', movedMain(gesture(warm, 'home-vertical')) && titleMoved(gesture(warm, 'title-deferred')), {home: gesture(warm, 'home-vertical')?.scrolled, title: gesture(warm, 'title-deferred')?.scrolled, afterMount: gesture(warm, 'title-deferred')?.movedAfterMount});
    check('cold horizontal wheel moved overflowing rail', gesture(cold, 'home-rail')?.scrolled?.includes('rail') && gesture(cold, 'home-rail')?.trusted > 0 && gesture(cold, 'home-rail')?.after?.railOverflow, {axis: gesture(cold, 'home-rail')?.axis, scrolled: gesture(cold, 'home-rail')?.scrolled, tries: cold?.railTries});
    check('warm horizontal wheel moved overflowing rail', gesture(warm, 'home-rail')?.scrolled?.includes('rail') && gesture(warm, 'home-rail')?.trusted > 0 && gesture(warm, 'home-rail')?.after?.railOverflow, {axis: gesture(warm, 'home-rail')?.axis, scrolled: gesture(warm, 'home-rail')?.scrolled, tries: warm?.railTries});
    check('paint ran while the scroll marker was active', during(cold).length > 0 && during(warm).length > 0, [during(cold).map(row => row.beforeId), during(warm).map(row => row.beforeId)]);
    check('active scroll marker did not replace the episode list', !replacedDuring(cold) && !replacedDuring(warm), [cold?.collected?.paints, warm?.collected?.paints]);
    check('late metadata applied after the marker cleared', appliedAfter(cold) && appliedAfter(warm) && cold?.late?.applied === true && warm?.late?.applied === true, [cold?.late, warm?.late]);
    check('carousel image was constructed on both launches', cold?.carousel?.naturalWidth > 0 && warm?.carousel?.naturalWidth > 0, [cold?.carousel, warm?.carousel]);
    check('cold server sent carousel bytes', (stages.find(row => row.stage === 'cold')?.server || []).some(row => row.path === '/carousel.png' && row.status === 200 && row.sentBytes > 0), stages.find(row => row.stage === 'cold')?.server);
    check('warm carousel image came from the http cache', (warm?.network || []).some(row => row.phase === 'completed' && row.url === '/carousel.png' && row.fromCache === true), (warm?.network || []).filter(row => String(row.url).endsWith('.png')));
    check('fixture urls stayed out of the dimension store', (cold?.collected?.dimensionStore?.fixtureUrls || []).length === 0 && (warm?.collected?.dimensionStore?.fixtureUrls || []).length === 0 && cold?.collected?.dimensionStore?.publicImageRejectsFixture === true, [cold?.collected?.dimensionStore, warm?.collected?.dimensionStore]);
    check('middle-button attempt was recorded', !!cold?.middle && !!warm?.middle, [cold?.middle?.verified, warm?.middle?.verified]);
    const summaryOf = stage => (stage?.gestures || []).map(item => ({name: item.name, wallMs: item.wallMs, scrolled: item.scrolled, trusted: item.trusted, untrusted: item.untrusted, largestFrameGapMs: item.frames?.largestGapMs, longTasks: item.longTasks?.count, longTaskMs: item.longTasks?.totalMs, layoutShifts: item.layoutShifts?.count, constructorsDuring: item.constructorsDuring, hidden: item.hidden, axis: item.axis || ''}));
    const report = {
      invocation: 'node scripts/native-scroll-input-trace.cjs electron.exe source-root output-directory',
      binary: path.resolve(binary),
      sourceRoot: root,
      sourceHead: identity.head,
      rendererRevision: identity.renderer,
      srcMatchesRenderer: identity.srcDiffEmpty,
      hashes: identity.hashes,
      profile: userData,
      profileRetained: true,
      origin,
      parentPid: process.pid,
      parentNode: process.version,
      proxyEnvPresent: ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'].filter(name => process.env[name]),
      fixtureImages: Object.fromEntries([...images].map(([name, body]) => [name, body.length])),
      stages,
      assertions,
      coldSummary: summaryOf(cold),
      warmSummary: summaryOf(warm),
      cold,
      warm,
    };
    fs.writeFileSync(path.join(out, 'trace.json'), JSON.stringify(report, null, 2));
    console.log('SCROLL_INPUT_REPORT ' + path.join(out, 'trace.json'));
    console.log(JSON.stringify({assertions: assertions.map(item => ({name: item.name, pass: item.pass})), cold: summaryOf(cold), warm: summaryOf(warm), middle: [cold?.middle?.verified, warm?.middle?.verified], input: [cold?.inputMode?.name, warm?.inputMode?.name], late: [cold?.late, warm?.late], server: stages.map(row => ({stage: row.stage, status: row.status, sentBytes: row.sentBytes, server: row.server}))}, null, 2));
    if (failed || assertions.some(item => !item.pass)) process.exit(1);
    console.log('Native scroll input trace completed');
  });
}

if (process.versions.electron) runProbe();
else runParent();
