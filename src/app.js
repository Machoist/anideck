

let activeStreamingServer = 'jellyfin';
function remotePlaybackProvider(server = activeStreamingServer) { return server === 'jellyfin' ? 'anikoto' : server==='animepahe'?'hianime':server; }
const RemoteEpisodes = {
  cache:new Map(),pending:new Map(),timeoutMs:6000,
  read(p){return window.native.streamEpisodes(p);},
  key(p){return JSON.stringify([p.provider,p.title,p.seasonNumber,p.audio,p.titleAliases||[]]);},
  peek(p){const hit=this.cache.get(this.key(p));return hit&&hit.until>Date.now()?hit.state:null;},
  clear(p){this.cache.delete(this.key(p));},
  async load(p){
    const key=this.key(p),hit=this.peek(p);if(hit)return hit;if(this.pending.has(key))return this.pending.get(key);
    const job=(async()=>{let state,timer;try{const result=await Promise.race([Promise.resolve().then(()=>this.read(p)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Episode lookup timed out')),this.timeoutMs);})]);if(result?.provider!==p.provider||!Array.isArray(result.episodes))throw Error('Invalid episode listing');state={status:'ready',episodes:[...new Set(result.episodes.map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=3000))].sort((a,b)=>a-b)};}catch{state={status:'error',episodes:[]};}finally{clearTimeout(timer);}
      if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{state,until:Date.now()+(state.status==='ready'?120000:15000)});return state;
    })();this.pending.set(key,job);try{return await job;}finally{if(this.pending.get(key)===job)this.pending.delete(key);}
  }
};
async function paintRemoteEpisodes(rid=App.renderId,snapshot=App.remoteEpisodeSnapshot){
 if(!snapshot||App.stale(rid))return;
 const provider=remotePlaybackProvider(),html=await Views.anime({id:snapshot.id,tab:'episodes',range:snapshot.range,snapshot:snapshot.values},rid);
 if(App.stale(rid)||remotePlaybackProvider()!==provider)return;
 const fragment=document.createElement('template');fragment.innerHTML=html;
 for(const selector of ['.detail-main','.hero-actions']){const current=document.querySelector(selector),next=fragment.content.querySelector(selector);if(current&&next)current.replaceWith(next);}
 Promise.resolve(Views.animeAfter({id:snapshot.id},rid)).catch(error=>console.warn('Episode details:',error.message));
}
function checkRemoteEpisodes(rid){
 const request=App.remoteEpisodeRequest,snapshot=App.remoteEpisodeSnapshot;
 if(!request||!document.querySelector('.remote-episode-state')||RemoteEpisodes.peek(request))return Promise.resolve();
 return RemoteEpisodes.load(request).then(()=>{if(!App.stale(rid)&&RemoteEpisodes.key(App.remoteEpisodeRequest)===RemoteEpisodes.key(request))return paintRemoteEpisodes(rid,snapshot);}).catch(error=>console.warn('Episode listing:',error.message));
}
let lastServerError = null;
const EXTERNAL_SERVERS = [
  { id: 'jellyfin', num: '#0', name: 'Jellyfin (Local)' },
  { id: 'anikoto', num: '#1', name: 'Anikoto' },
  { id: 'hianime', num: '#2', name: 'HiAnime' },
  { id: 'aniwatch', num: '#3', name: 'AniWatch' }
];
const SRV_STACK_ICON = '<span class="srv-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="6" rx="1"/><rect x="2" y="14" width="20" height="6" rx="1"/><circle cx="6" cy="7" r="1" fill="currentColor"/><circle cx="6" cy="17" r="1" fill="currentColor"/></svg></span>';

function getServerLabel(srv, allowLocal = true) {
  if(srv==='animepahe')srv='hianime';
  allowLocal = allowLocal && Jellyfin.connected();
  if (!allowLocal && srv === 'jellyfin') srv = 'anikoto';
  const found = EXTERNAL_SERVERS.find(s => s.id === srv) || EXTERNAL_SERVERS[0];
  return `${SRV_STACK_ICON}<span>${found.num}&nbsp; ${found.name}</span>`;
}

function renderWatchOnMenu(srv, allowLocal = true) {
  if(srv==='animepahe')srv='hianime';
  allowLocal = allowLocal && Jellyfin.connected();
  if (!allowLocal && srv === 'jellyfin') srv = 'anikoto';
  const list = allowLocal ? EXTERNAL_SERVERS : EXTERNAL_SERVERS.filter(s => s.id !== 'jellyfin');
  return `<div class="chip-menu watch-on-menu" hidden>
    <div class="watch-on-header">Watch on</div>
    ${list.map(s => `<button class="watch-on-item ${srv === s.id ? 'on' : ''}" data-act="setServer" data-srv="${s.id}">
      <span class="watch-on-radio"></span>
      <span>${s.num}&nbsp; ${s.name}</span>
    </button>`).join('')}
  </div>`;
}

function renderServerErrorBanner() {
  if (!lastServerError) return '<div id="srv-err-slot"></div>';
  return `<div id="srv-err-slot"><div class="srv-error-banner">
    <span class="err-ico">ⓘ</span>
    <span>${lastServerError}</span>
    <button class="try-again-btn" data-act="retryServer">Try again</button>
  </div></div>`;
}


/* AniDeck - UI */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DEFAULT_SETTINGS = {
  audioLang: 'jpn', subLang: 'eng', autoNext: true, autoSkip: false,
  autoTrack: true, threshold: 0.85, maxBitrate: 40_000_000,
  speed: 1, fit: 'contain', skipLen: 85, seekStep: 10,
  libraryModes: {}, // libraryId -> 'anime' | 'none' | 'auto'
  registry: {}, // itemId -> true/false: is it on Kitsu or MyAnimeList (anime-only edition)
  animeOverride: {}, // itemId -> true (anime) / false (not anime), set by you
  autoNotAnime: {},  // itemId -> true when the app found it isn't on Kitsu (weak signals only)
  traktTrack: true, traktAnime: false,
  accent: 'lavender', uiScale: 1, posterSize: 'medium', titleLang: 'en', reduceMotion: false,
  keys: {}, tvMode: false, startFullscreen: false, gamepad: true,
  shuffleFrom: 'planning', // the topbar's random-pick button: 'planning' | 'popular' | 'library' (see SHUFFLE_FROM)
  homeSections: null,     // [{ id, on }] order + visibility of home rows; null = HOME_SECTIONS defaults
  hideNsfw: true,
  alArt: true,            // library anime use AniList covers (Settings → Appearance)
  subSize: 'md', subStyle: 'outline', // Settings → Subtitles
  hoverPreview: false,    // Settings → Home screen: pause on a poster for a preview card
  homeStyle: 'bleed',     // Settings → Home screen: Spotlight and Trending 'bleed' (edge to edge) | 'card' (framed)
  spotlightMs: 4800,      // Settings → Home screen: time per Spotlight slide
  trendingCount: 9,       // Settings → Home screen: shows in the Trending chart (#1 plus the rest)
  bannerSource: {},       // 'al:<id>' -> 'anilist' for shows whose Kitsu banner you switched off (the pill on a banner)
  confirmToasts: false,   // Settings → Appearance: show "Saved"-style confirmations (errors always show)
  scheduleView: 'timeline', // Schedule: 'timeline' (one day, with what's on next) | 'week' (seven columns)
};

// Subtitle look on the player (and the Settings preview): size and style become CSS on the element.
const SUB_SIZES = { sm: 0.82, md: 1, lg: 1.2, xl: 1.45 };
function applySubStyle(el) {
  if (!el) return;
  el.dataset.subStyle = App.settings.subStyle || 'outline';
  el.style.setProperty('--sub-k', SUB_SIZES[App.settings.subSize] || 1);
}

// Rows on the home page, in their default order (Settings → Home screen → Sections): [id, title, description, on by default].
// "g:<Genre>" rows are popular anime in that genre.
const HOME_SECTIONS = [
  ['yournext', 'Your next episode', 'A big “play next” with your queue beside it', true],
  ['deck', 'Your deck', 'Widgets: quick log, airing countdown, pinned decks and more', true],
  ['week', 'This week', 'A 7-day ribbon of when your shows air', true],
  ['featured', 'Spotlight', 'A rotating banner of this season’s standouts', true],
  ['mosaic', 'Trending chart', 'The top trending show up front, with the rest of the chart beside it', true],
  ['greeting', 'Greeting', 'Good morning, and a quick look at your day', false],
  ['continue', 'Continue watching', 'Where you stopped, on this device', false],
  ['airingToday', 'Airing today', 'Today’s episodes of your shows, with a “now” marker', false],
  ['upnext', 'Up next', 'The next episode of shows in your library', false],
  ['neweps', 'New this week', 'Episodes that aired in the past 7 days of shows you’re watching', false],
  ['watchingAiring', 'Airing now', 'Shows you’re watching that are airing', true],
  ['watching', 'Keep watching', 'The rest of your watching list', true],
  ['planning', 'Plan to watch', 'Your planning list', false],
  ['season', 'This season', 'Popular shows this season', true],
  ['trending', 'Trending now', 'Trending on Kitsu', true],
  ['top10', 'Top 10', 'The ten most popular shows airing now, ranked', false],
  ['toprated', 'Top rated', 'Highest rated shows', false],
  ['popular', 'All-time popular', 'The most popular shows', false],
  ['upcoming', 'Coming soon', 'Upcoming anime', false],
  ['g:Action', 'Action', 'Popular action anime', false],
  ['g:Comedy', 'Comedy', 'Popular comedy anime', false],
  ['g:Fantasy', 'Fantasy', 'Popular fantasy anime', false],
  ['g:Romance', 'Romance', 'Popular romance anime', false],
  ['g:Sci-Fi', 'Sci-Fi', 'Popular science fiction anime', false],

];
const HOME_DEFAULTS = () => HOME_SECTIONS.map(([id, , , on]) => ({ id, on }));
function homeOrder() {
  // One-time move to the "Your next episode" layout: its pieces replace the Spotlight and the two episode rows.
  if ((App.settings.homeLayout || 0) < 2) {
    App.settings.homeLayout = 2;
    if (App.settings.homeSections) App.settings.homeSections = App.settings.homeSections.map((x) => (['featured', 'continue', 'upnext'].includes(x.id) ? { ...x, on: false } : x));
    App.saveSettings();
  }
  // Layout 3: the Spotlight is back, as its own section after "This week".
  if (App.settings.homeLayout < 3) {
    App.settings.homeLayout = 3;
    const hs = App.settings.homeSections;
    if (hs) {
      const i = hs.findIndex((x) => x.id === 'featured');
      const spot = { id: 'featured', on: true };
      if (i >= 0) hs.splice(i, 1);
      const w = hs.findIndex((x) => x.id === 'week');
      hs.splice(w < 0 ? 0 : w + 1, 0, spot);
    }
    App.saveSettings();
  }
  const order = (App.settings.homeSections || []).filter((s) => HOME_SECTIONS.some(([id]) => id === s.id));
  // Rows added in an update go where they sit by default (before the first saved row that follows them), not last.
  HOME_SECTIONS.forEach(([id, , , on], i) => {
    if (order.some((s) => s.id === id)) return;
    const after = HOME_SECTIONS.slice(i + 1).map(([x]) => x);
    const at = order.findIndex((s) => after.includes(s.id));
    order.splice(at < 0 ? order.length : at, 0, { id, on });
  });
  return order;
}

// "Hide NSFW shows": adult-rated titles and ecchi / hentai genres.
const isNsfw = (a) => !!a && (a.nsfw || /^R18|^Rx/i.test(a.ageRating || '') || (a.genres || []).some((g) => /ecchi|hentai/i.test(g)));
const sfw = (list) => (App.settings.hideNsfw === false ? list : list.filter((a) => !isNsfw(a)));

// How sure are we that this is anime?
//  'strong' - Anime genre, made in Japan, or a Japanese original title on an animated show
//  'weak'   - only an "anime" tag or an anime-database id (metadata plugins sometimes add these
//             to western cartoons), so it gets confirmed against Kitsu before being treated as anime
//  false    - nothing points to anime
function animeSignal(item) {
  const genres = (item.Genres || []).map((t) => String(t).toLowerCase());
  const tags = (item.Tags || []).map((t) => String(t).toLowerCase());
  const japan = (item.ProductionLocations || []).some((l) => /japan/i.test(l));
  const jpTitle = /[\u3040-\u30ff\u4e00-\u9faf]/.test(item.OriginalTitle || '');
  const animated = genres.includes('animation') || genres.includes('anime');
  if (genres.includes('anime')) return 'strong';
  if (animated && (japan || jpTitle)) return 'strong';
  const ids = Object.keys(item.ProviderIds || {}).map((k) => k.toLowerCase());
  if (tags.includes('anime') || ids.some((k) => ['anidb', 'anilist', 'kitsu', 'myanimelist'].includes(k))) return 'weak';
  return false;
}
function looksAnime(item) { return !!animeSignal(item); }

const App = {
  settings: { ...DEFAULT_SETTINGS },
  config: {},
  series: [],      // anime shows + anime movies (used for Kitsu)
  allItems: [],    // every show and movie in every library
  libraries: [],
  items: {},       // libraryId -> items
  animeIds: new Set(),
  animeSignal: {},
  matches: {},
  libIndex: null,
  view: null,
  params: {},
  history: [],
  renderId: 0,
  selected: new Set(), // episode ids picked on the show page
  selSeries: null,     // the show those episodes belong to
  selAnchor: null,     // last clicked episode, for shift-click ranges

  async boot() {
    this.config = (await window.native.config()) || {};
    if (this.config.kitsuBase) KITSU_BASE = this.config.kitsuBase;
    APP_VERSION = await window.native.version();
    this.bindUpdates();
    this.settings = { ...DEFAULT_SETTINGS, ...((await window.native.get('settings')) || {}) };
    applyAppearance();
    TV.init();
    Prefetch.bind();
    HoverPreview.bind();
    if (this.settings.gamepad !== false) TV.startGamepad();
    if (this.settings.startFullscreen || this.settings.tvMode) window.native.setFullscreen?.(true);
    const [, , , signedIn] = await Promise.all([Kitsu.init(), Trakt.init(), AniList.init(), Jellyfin.init()]);
    if(typeof Matcher!=='undefined'&&Matcher.initScope)await Matcher.initScope().catch(()=>{});
    preconnectImageHosts();
    await LocalTracker.init();
    await Art.load();
    this.bindShell();
    if (signedIn) {
      try { await Jellyfin.call(`/Users/${Jellyfin.userId}`); return this.enter(); }
      catch (e) { if (e.status !== 401) return this.enter(); await Jellyfin.logout(); }
    }
    if (Tracker.loggedIn()) return this.enter();
    hideSplash();
    this.showLogin();
  },

  /* ---------------- login ---------------- */
  async showLogin() {
    $('#shell').hidden = true;
    $('#login').hidden = false;this.needsProfileIntro=true;
    $('#login-anilist').onclick = () => this.anilistLogin();
    $('#login-kitsu').onclick = () => this.kitsuLogin();
    $('#login-guest').onclick = () => this.continueLocally();
    $('#login-anilist').focus();

  },

  async continueLocally(){const button=$('#login-guest');button.disabled=true;try{await LocalTracker.enable();await this.useTracker('local');await this.enter();}catch(error){toast('Couldn’t start your local profile: '+error.message,'bad');}finally{button.disabled=false;}},

  localRecovery(){return AniAccount.access();
  },

  jellyfinLogin() {
    this.modal(`<h2>Connect a Jellyfin library</h2><p class="muted">Optional. Add your own Jellyfin media server. AniList, Kitsu, and streaming work without it.</p><form id="jellyfin-connect" class="jellyfin-connect"><label>Jellyfin server address<input id="j-server" value="${esc(Jellyfin.remoteServer || this.config.jellyfinUrl || '')}" placeholder="https://jellyfin.example.com" required></label><label>Jellyfin username<input id="j-user" autocomplete="username" required></label><label>Jellyfin password<input id="j-pass" type="password" autocomplete="current-password"></label><p id="j-error" class="error" hidden></p><div class="row gap"><button class="btn primary" id="j-connect">Connect library</button><button type="button" class="btn ghost" id="j-cancel">Cancel</button></div></form>`);
    $('#j-cancel').onclick = () => this.closeModal();
    $('#jellyfin-connect').onsubmit = async event => {
      event.preventDefault(); const button = $('#j-connect'), error = $('#j-error');
      button.disabled = true; error.hidden = true;
      try {
        await Jellyfin.login($('#j-server').value, $('#j-user').value, $('#j-pass').value);
        this.closeModal(); this.updateWho(); this.buildNav(); await this.nav('library');
        toast('Jellyfin library connected', 'good');
      } catch (e) { error.textContent = e.status === 401 ? 'Incorrect Jellyfin username or password.' : e.message; error.hidden = false; button.disabled = false; }
    };
    $('#j-server').focus();
  },

  async disconnectJellyfin() {
    if (Player.el && !Player.el.hidden && Player.server === 'jellyfin') Player.close();
    await Jellyfin.logout(); await this.refreshLibrary(); this.updateWho();
    if (!Tracker.loggedIn()) return this.showLogin();
    toast('Jellyfin library disconnected', 'good'); return this.nav('home');
  },

  async enter() {
    if(!Tracker.loggedIn()){await LocalTracker.enable();await this.useTracker('local');}
    if(typeof Cloud!=='undefined')await Cloud.init();
    splash(`Welcome back, ${(Tracker.loggedIn() ? Tracker.userName : Jellyfin.userName) || 'friend'}`);
    if (!Jellyfin.connected()) activeStreamingServer = 'anikoto';
    $('#login').hidden = true;
    $('#shell').hidden = false;
    this.updateWho();
    if(!Jellyfin.connected())await this.refreshLibrary();else this.buildNav();
    await this.nav('home');
    // Wait for the home page to draw (max ~6s) so the app opens fully formed.
    for (let i = 0; i < 60 && !$('#main .home-rows, #main .empty, #main .page'); i++) await new Promise((r) => setTimeout(r, 100));
    hideSplash();
    Notifier.start();
    if(typeof offerProfileIntro==='function'){this.needsProfileIntro=false;await offerProfileIntro();}
    maybeShowWhatsNew();
  },

  // Kitsu has no score for newer shows; fill those badges in from MyAnimeList as cards appear.
  watchRatings() {
    const fill = () => document.querySelectorAll('[data-rate]:not([data-rated])').forEach((el) => {
      el.dataset.rated = '1';
      Ratings.get(el.dataset.rate).then((v) => { if (v) { el.textContent = `★ ${v}%`; el.hidden = false; } });
    });
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(fill, 150); }).observe(document.body, { childList: true, subtree: true });
    fill();
  },

  // Keeps what's on screen fresh: re-loads the page quietly (same scroll spot) when you come back
  // to the app after a while, and every 15 minutes while it's open and you're not using it.
  keepFresh() {
    let lastInput = Date.now();
    ['mousemove', 'keydown', 'wheel', 'mousedown'].forEach((ev) => window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
    const refresh = (minAge) => {
      if (!$('#player').hidden || !$('#modal').hidden || $('#shell').hidden) return;
      if (!['home', 'library', 'mylist', 'show', 'anime', 'movie', 'profile', 'requests'].includes(this.view)) return;
      if (document.activeElement?.matches('input, textarea, select')) return;
      if (Date.now() - (this.renderedAt || 0) < minAge) return;
      this.nav(this.view, this.params, false, true);
    };
    window.addEventListener('focus', () => refresh(5 * 60 * 1000));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(5 * 60 * 1000); });
    setInterval(() => { if (!document.hidden && Date.now() - lastInput > 2 * 60 * 1000) refresh(15 * 60 * 1000); }, 60 * 1000);
  },

  async returnHome() {
    if(this.homeShortcutBusy)return;
    const button=$('#home-fab');this.homeShortcutBusy=true;
    if(button){button.disabled=true;button.classList.add('going-home');}
    this.history=[];const destination=this.renderId+1;
    try{
      await this.nav('home');
      if(this.stale(destination)||this.view!=='home')return;
      const main=$('#main');main?.focus({preventScroll:true});
      const brand=this.homeBrand;
      if(brand?.isConnected&&!this.settings.reduceMotion&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        brand.classList.remove('home-returned');void brand.offsetWidth;brand.classList.add('home-returned');
        clearTimeout(this.homeArrivalTimer);this.homeArrivalTimer=setTimeout(()=>brand.classList.remove('home-returned'),650);
      }
    }finally{this.homeShortcutBusy=false;if(button){button.disabled=false;button.classList.remove('going-home');}}
  },


  async refreshFromNav() {
    const button=$('#tb-refresh');if(button.disabled)return;
    button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      if(['library','show','movie'].includes(this.view))await this.refreshLibrary();
      Promise.resolve(Notifier.check()).catch(error=>console.warn('Notifications:',error.message));
      await this.refresh();
    }catch(error){toast('Couldn’t refresh. Please try again.','bad');console.warn('Refresh:',error.message);}
    finally{button.disabled=false;button.removeAttribute('aria-busy');}
  },

  bindShell() {
    this.watchRatings();
    this.keepFresh();
    // Top-left Home button on every page but Home, so you don't have to bring up the dock to get back.
    $('#home-fab').onclick = () => this.returnHome();
    $('#page-back').onclick = () => this.back();
    this.homeBrand=$('#home-brand');this.pageShortcuts=$('#page-shortcuts');
    $('#main').addEventListener('scroll',()=>{if(this.homeBrand)this.homeBrand.classList.toggle('scrolled-away',$('#main').scrollTop>8);},{passive:true});

    $('.topbar').addEventListener('click', (e) => { // Home / Schedule / My list / Library / Requests / Settings
      if (e.target.closest('#nav-current')) return this.toggleNavMenu();
      const b = e.target.closest('[data-view]');
      if (b) { this.toggleNavMenu(false); this.history = []; this.nav(b.dataset.view); }
    });
    // The section menu closes on a click elsewhere or Escape.
    document.addEventListener('mousedown', (e) => { if (!$('#nav').hidden && !e.target.closest('.nav-drop')) this.toggleNavMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#nav').hidden) { this.toggleNavMenu(false); $('#nav-current').focus(); } });
    $('#conn-btn').onclick = () => { this.history = []; this.nav('profile'); };
    $('#tb-back').onclick = () => this.back();
    // Search bar: typing shows a dropdown of suggestions; Enter opens the full results page.
    let sugTimer = null, sugSeq = 0, sugItems = [], sugIdx = -1;
    const box = $('#tb-suggest'), input = $('#tb-q');
    const closeSug = () => { box.hidden = true; sugIdx = -1; };
    const openFull = () => {
      const q = input.value.trim();
      if (q.length < 2) return;
      closeSug(); input.blur();
      if (this.view === 'search') this.nav('search', { q, f: this.params.f }, false); else this.nav('search', { q });
    };
    const openItem = (x) => {
      closeSug(); input.blur();
      if (x.lib) return this.openItem(x.lib.Id);
      if (x.kind === 'anime') return this.nav('anime', { id: x.id });
      this.traktCache = { ...(this.traktCache || {}), [x.id]: x.raw };
      return this.nav('media', { id: x.id });
    };
    const highlight = (i) => {
      sugIdx = i;
      box.querySelectorAll('.sug').forEach((el, j) => el.classList.toggle('on', j === i + 1));
    };
    // Search dropdown: "Search for …" first, the best match as a big card, then the rest grouped (your library, anime,
    // TV & movies) with the matching part of each title highlighted; placeholder rows while results load.
    const renderSug = (q, items, loading) => {
      sugItems = items;
      const kindLabel = (x) => (x.kind === 'anime' ? (x.subtype || 'Anime').toUpperCase() : x.kind === 'movie' ? 'MOVIE' : 'TV');
      const hl = (t) => { const s = String(t || ''), i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + q.length))}</mark>${esc(s.slice(i + q.length))}`; };
      const meta = (x) => esc([kindLabel(x), x.year, x.episodes && x.kind !== 'movie' ? `${x.episodes} eps` : '', ...(x.genres || []).slice(0, 2)].filter(Boolean).join(' · '));
      const art = (x, cls = '') => (x.poster ? `<img class="${cls}" src="${esc(x.poster)}" alt="">` : `<span class="sug-ph ${cls}">${icon(x.kind === 'movie' ? 'video' : 'spark')}</span>`);
      const row = (x, i) => `<button type="button" class="sug" data-sug="${i}" style="--i:${i}">${art(x)}
          <span class="sug-text"><b>${hl(x.title)}</b><small>${meta(x)}</small></span>
          ${x.lib ? '<span class="sug-lib">In library</span>' : ''}${x.rating ? `<span class="sug-rating">★ ${x.rating}%</span>` : ''}</button>`;
      const [top, ...rest] = items;
      const groups = [['In your library', (x) => !!x.lib], ['Anime', (x) => !x.lib && x.kind === 'anime'], ['TV & movies', (x) => !x.lib && x.kind !== 'anime']];
      const restHtml = groups.map(([label, test]) => { const list = rest.map((x, j) => [x, j + 1]).filter(([x]) => test(x)); return list.length ? `<div class="sug-group">${label}</div>${list.map(([x, i]) => row(x, i)).join('')}` : ''; }).join('');
      const skel = '<div class="sug-sk"><span class="skel"></span><span class="sug-sk-lines"><span class="skel"></span><span class="skel"></span></span></div>';
      box.innerHTML = `<button type="button" class="sug sug-all" data-sug="-1"><span class="sug-ico">${icon('search')}</span><span>Search everything for <b>“${esc(q)}”</b></span><span class="spacer"></span><kbd>Enter</kbd></button>
        ${top ? `<div class="sug-group">Top result</div><button type="button" class="sug sug-top" data-sug="0" style="--i:0">${art(top, 'sug-top-art')}
          <span class="sug-text"><b>${hl(top.title)}</b><small>${meta(top)}</small><span class="sug-badges">${top.lib ? '<span class="sug-lib">In library</span>' : ''}${top.rating ? `<span class="sug-rating">★ ${top.rating}%</span>` : ''}</span></span>
          <span class="sug-go">${icon('chev')}</span></button>` : ''}
        ${restHtml}
        ${loading ? skel.repeat(items.length ? 2 : 4) : !items.length ? `<div class="sug-empty">${icon('searchX')}<span>No quick matches. Press <kbd>Enter</kbd> to search everything.</span></div>` : ''}
        <div class="sug-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>`;
      box.hidden = false;
      // Keyboard order follows what's on screen (the grouping can reorder results).
      const order = [...box.querySelectorAll('.sug')].map((el) => Number(el.dataset.sug)).filter((n) => n >= 0);
      sugItems = order.map((n) => items[n]);
      box.querySelectorAll('.sug').forEach((el) => { const n = Number(el.dataset.sug); if (n >= 0) el.dataset.sug = String(order.indexOf(n)); });
      highlight(-1);
    };
    const runSug = async () => {
      const q = input.value.trim();
      if (q.length < 2) return closeSug();
      const my = ++sugSeq;
      const nq = norm(q);
      const local = []; // Library search lives only inside Your Jellyfin library.
      renderSug(q, local, true);
      const [anime, tv] = await Promise.all([
        Kitsu.searchWithGenres(q, 8).then(sfw).catch(() => Kitsu.search(q, 8).then(sfw).catch(() => [])),
        Trakt.search(q, 6).catch(() => []),
      ]);
      if (my !== sugSeq || input.value.trim() !== q) return;
      const seen = new Set(local.map((x) => x.lib.Id));
      const items = [...local];
      const add = (x) => { if (x.lib && seen.has(x.lib.Id)) return; if (x.lib) seen.add(x.lib.Id); items.push(x); };
      anime.forEach((a) => add({ kind: 'anime', id: a.id, title: a.title, year: a.year, episodes: a.episodes, subtype: a.subtype, genres: a.genres, rating: a.rating, poster: a.poster, lib: this.libIndex?.find(a) }));
      tv.filter((x) => !x.genres.includes('anime')).forEach((x) => add({ kind: x.kind, id: x.id, title: x.title, year: x.year, episodes: x.episodes, genres: (x.genres || []).map((g) => g.replace(/(^|-)\w/g, (c) => c.toUpperCase()).replace(/-/g, ' ')), rating: x.rating, poster: x.poster, lib: this.findByIds(x.ids, x.title, x.year, x.kind), raw: x }));
      renderSug(q, items.slice(0, 8), false);
    };
    input.addEventListener('input', () => { syncSearchClear(); clearTimeout(sugTimer); sugTimer = setTimeout(runSug, 280); });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && box.innerHTML) box.hidden = false; });
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(sugIdx + 1, sugItems.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(sugIdx - 1, -1)); }
      else if (e.key === 'Escape') { closeSug(); }
    });
    box.addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-sug]'); if (!b) return;
      e.preventDefault();
      const i = Number(b.dataset.sug);
      if (i < 0) openFull(); else openItem(sugItems[i]);
    });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.tb-search')) closeSug(); });
    $('#tb-search').onsubmit = (e) => { e.preventDefault(); clearTimeout(sugTimer); if (sugIdx >= 0 && sugItems[sugIdx]) openItem(sugItems[sugIdx]); else openFull(); };
    $('#tb-clear').onclick = () => { input.value = ''; syncSearchClear(); closeSug(); input.focus(); };
    $('#tb-refresh').onclick = () => this.refreshFromNav();
    const motionBar=document.querySelector('.topbar');
    motionBar.addEventListener('click',event=>{
      const button=event.target.closest('#tb-back,#tb-shuffle,#tb-clear,#nav-settings,#conn-btn,#nav-current');
      if(!button||button.disabled||this.settings.reduceMotion||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
      button.classList.remove('nav-click');void button.offsetWidth;button.classList.add('nav-click');
    },true);
    motionBar.addEventListener('animationend',event=>event.target.closest('.nav-click')?.classList.remove('nav-click'));
    $('#tb-shuffle').onclick = () => this.shuffle();
    $('#tb-shuffle').onpointerenter = $('#tb-shuffle').onfocus = () => this.prepareShuffle().catch(() => {});
    $('#tb-bell').onclick = (e) => { e.stopPropagation();const bell=e.currentTarget;if(!this.settings.reduceMotion){bell.classList.remove('ring');void bell.offsetWidth;bell.classList.add('ring');}Notifier.toggle(); };
    $('#tb-bell').addEventListener('animationend',()=>$('#tb-bell').classList.remove('ring'));
    document.addEventListener('click', (e) => { if (!e.target.closest('.bell-wrap')) Notifier.close(); });
    if (/Mac/i.test(navigator.platform)) $('#tb-search kbd').textContent = '⌘ F';
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !$('#shell').hidden && $('#player').hidden) { e.preventDefault(); $('#tb-q').focus(); $('#tb-q').select(); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.target.matches('input, textarea, select') && $('#modal').hidden && !$('#shell').hidden && $('#player').hidden && actionForKey(e) === 'search') { e.preventDefault(); $('#tb-q').focus(); $('#tb-q').select(); }
    });

    // Animate titles as they're added: a whole page, an infinite-scroll batch, or a redrawn list.
    new MutationObserver((muts) => {
      // Covers fade in on 'load'; one already in memory may be complete before anyone listens, so mark those now.
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        for (const img of n.tagName === 'IMG' ? [n] : n.querySelectorAll('img')) if (img.complete && img.naturalWidth) img.classList.add('ready');
      }
      if (this.renderQuiet) return;
      const nodes = [];
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(CARD_SEL)) nodes.push(n); else nodes.push(...n.querySelectorAll(CARD_SEL));
      }
      if (nodes.length) animateCards(nodes);
      if (nodes.length || muts.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && n.querySelector?.('.rel-card')))) {
        clearTimeout(this.artTimer); this.artTimer = setTimeout(() => Art.upgrade($('#main')), 60);
      }
    }).observe($('#main'), { childList: true, subtree: true });

    // One click handler for every [data-act] element in the main area.
    $('#main').addEventListener('click', (e) => {
      // While picking episodes (or with Ctrl/Shift held), clicking a row selects it instead of playing.
      const row = this.view === 'show' && e.target.closest('.ep[data-ep]');
      if (row && (this.selected.size || e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault();
        if (e.shiftKey && this.selAnchor) this.selectRange(row); else this.selectEp(row);
        return;
      }
      const el = e.target.closest('[data-act]');
      if (!el) return;
      e.preventDefault();
      if (el.closest('.chip-menu')) el.closest('.chip-menu').hidden = true;
      this.act(el.dataset.act, el.dataset, el);
    });
    $('#main').addEventListener('contextmenu', (e) => {
      const row = this.view === 'show' && e.target.closest('.ep[data-ep]');
      if (!row) return;
      e.preventDefault();
      this.epMenu(row, e.clientX, e.clientY);
    });
    $('#main').addEventListener('scroll', () => this.closeEpMenu(), { passive: true });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ep-menu')) this.closeEpMenu(); });
    window.addEventListener('blur', () => this.closeEpMenu());
    // Dialogs live outside #main, so their delegated actions need their own listener.
    $('#modal').addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled || e.defaultPrevented) return;
      e.preventDefault();
      this.act(el.dataset.act, el.dataset, el);
    });
    $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') this.closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modal').hidden) this.closeModal();
      else if (e.key === 'Escape' && $('#ep-menu')) this.closeEpMenu();
      else if (e.key === 'Escape' && this.selected.size && $('#player').hidden) this.clearSelection();
      if (e.key === 'BrowserBack' || (e.altKey && e.key === 'ArrowLeft')) this.back();
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 3) this.back(); });
  },

  /* ---------------- updates ---------------- */
  update: { state: 'idle' },
  applyUpdate(s) {
    this.update=s;
    const banner=$('#update-banner');
    if(banner)banner.hidden=true; // The bottom release bar owns the persistent reminder.
    const status=$('#upd-status');if(status)status.textContent=updateText(s);
    const release=$('#upd-release');if(release){release.hidden=s.state!=='available';const version=release.querySelector('b');if(version)version.textContent='View release'+(s.version?' v'+s.version:'');}
    if(typeof ReleaseNotice!=='undefined')ReleaseNotice.receive(s);
  },
  async openRelease(){
    try{const opened=await window.native.openRelease();if(!opened)toast('Check for a newer release first.');return opened;}
    catch{toast('Couldn’t open GitHub. Please try again.','bad');return false;}
  },
  async bindUpdates() {
    $('#update-banner').onclick=()=>this.openRelease();
    window.native.onUpdate(s=>this.applyUpdate(s));
    this.applyUpdate(await window.native.updateState());
  },

  updateWho() {
    // Bottom-left profile button, like AniView: your list account (Kitsu or AniList) when signed in.
    const tracked = Tracker.loggedIn();
    const social=typeof Cloud!=='undefined'&&Cloud.who===Cloud.ident()?Cloud.me:null;
    const name = social?.name||(tracked ? Tracker.userName : Jellyfin.userName);
    const img = social ? social.avatar||'' : tracked ? Tracker.avatar : Jellyfin.connected() ? `${Jellyfin.server}/Users/${Jellyfin.userId}/Images/Primary?quality=90&fillHeight=80` : '';
    const initial = esc((name || '?').slice(0, 1).toUpperCase());
    $('#conn-btn').className = `profile-btn ${this.view === 'profile' ? 'active' : ''}`;
    $('#conn-btn').innerHTML = `<span class="avatar">${initial}${img ? `<img src="${esc(img)}" alt="">` : ''}</span>
      <span class="conn-text"><b>${esc(name || 'Not signed in')}</b><span>${social?'AniDeck':tracked ? Tracker.name : 'Jellyfin'}</span></span>`;
    $('#conn-btn').title = `${name || 'Not signed in'} · ${social?'AniDeck':tracked ? Tracker.name : 'Jellyfin'}`; // the top bar shows just the avatar
  },


  // Panel listing Jellyfin / Kitsu / Trakt with sign in & out.
  connections() {
    const row = (name, what, on, who, action, actLabel, primary) => `<div class="conn-row">
      <span class="dot ${on ? 'on' : ''}"></span>
      <div class="grow"><div style="font-weight:600">${name}</div><div class="small muted">${on ? esc(who) : what}</div></div>
      <button class="btn ${primary ? 'primary' : 'ghost'} sm" data-conn="${action}">${actLabel}</button></div>`;
    this.modal(`<div id="conn-panel"><h2>Connections</h2>
      ${row('Jellyfin library', 'Optional · connect your own media library', Jellyfin.connected(), `${Jellyfin.userName} · ${Jellyfin.server}`, Jellyfin.connected() ? 'jellyLogout' : 'jellyLogin', Jellyfin.connected() ? 'Disconnect' : 'Connect')}
      ${row('Kitsu', 'Tracks anime and powers My List', Kitsu.loggedIn(), Kitsu.userName, Kitsu.loggedIn() ? 'kitsuLogout' : 'kitsuLogin', Kitsu.loggedIn() ? 'Sign out' : 'Connect', !Kitsu.loggedIn())}
      ${row('AniList', 'Tracks anime and powers My List', AniList.loggedIn(), AniList.userName, AniList.loggedIn() ? 'anilistLogout' : 'anilistLogin', AniList.loggedIn() ? 'Sign out' : 'Connect', false)}
      ${Trakt.available() ? row('Trakt', 'Tracks movies and TV shows', Trakt.loggedIn(), Trakt.userName, Trakt.loggedIn() ? 'traktLogout' : 'traktLogin', Trakt.loggedIn() ? 'Sign out' : 'Connect', !Trakt.loggedIn()) : ''}
      <div class="row gap" style="margin-top:6px"><span class="spacer"></span><button class="btn ghost" id="conn-close">Close</button></div></div>`);
    $('#conn-close').onclick = () => this.closeModal();
    document.querySelectorAll('[data-conn]').forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.conn;
        if (a === 'kitsuLogin') return this.kitsuLogin();
        if (a === 'anilistLogin') return this.anilistLogin();
        if (a === 'anilistLogout') { await AniList.logout(); toast('Signed out of AniList', 'good'); }
        if (a === 'traktLogin') return this.traktLogin();
        if (a === 'kitsuLogout') { await Kitsu.logout(); toast('Signed out of Kitsu', 'good'); }
        if (a === 'traktLogout') { await Trakt.logout(); toast('Signed out of Trakt', 'good'); }
        if (a === 'jellyLogin') return this.jellyfinLogin();
        if (a === 'jellyLogout') { this.closeModal(); return this.disconnectJellyfin(); }
        this.updateWho(); this.connections();
        if (this.view !== 'home') this.refresh();
      };
    });
  },

  libraryMode(lib) {
    const set = this.settings.libraryModes?.[lib.Id];
    if (set) return set;
    if (/anime/i.test(lib.Name)) return 'anime';
    if (lib.CollectionType === 'movies') return 'auto'; // anime movies usually live with regular movies
    if (this.libraries.some((l) => /anime/i.test(l.Name))) return 'none'; // shows: there's a dedicated anime library
    return 'auto';
  },

  async refreshLibrary() {
    const generation=this.libraryGeneration=(this.libraryGeneration||0)+1;
    const scope=JSON.stringify([Jellyfin.server,Jellyfin.userId,Jellyfin.token]);
    const current=()=>this.libraryGeneration===generation&&Jellyfin.connected()&&JSON.stringify([Jellyfin.server,Jellyfin.userId,Jellyfin.token])===scope;
    if (!Jellyfin.connected()) {
      this.libraries = []; this.rawLists = []; this.seasonsBySeries = {}; this.matches = {};this.libraryLoadedAt=0;this.libraryScope=null;
      this.classify(); this.buildNav(); return;
    }
    if(this.libraryScope!==scope){
      this.libraryScope=scope;this.libraries=[];this.rawLists=[];this.seasonsBySeries={};this.matches={};this.libraryLoadedAt=0;
      this.classify();this.buildNav();
    }
    try {
      const libraries = await Jellyfin.libraries();if(!current())return;
      const [lists, seasons] = await Promise.all([
        Promise.all(libraries.map((l) => Jellyfin.libraryItems(l.Id).catch(() => []))),
        Promise.all(libraries.map((l) => Jellyfin.librarySeasons(l.Id).catch(() => []))),
      ]);if(!current())return;
      const matches=await Matcher.all();if(!current())return;
      const bySeries={};
      for (const season of seasons.flat()) if (season.SeriesId && season.ChildCount !== 0) (bySeries[season.SeriesId] ||= []).push(season);
      for (const list of Object.values(bySeries)) list.sort((a, b) => (a.IndexNumber ?? 99) - (b.IndexNumber ?? 99));
      this.libraries=libraries;this.rawLists=lists;this.seasonsBySeries=bySeries;this.matches=matches;
    } catch (e) { if(!current())return;toast(`Couldn't load library: ${e.message}`, 'bad');return; }
    this.libraryLoadedAt=Date.now();
    this.classify();this.buildNav();this.verifyWithKitsu();
  },

  // What Kitsu said about an item, from saved matches: true (it's on Kitsu), false (not), undefined (not asked yet).
  kitsuSays(id) { const m = this.matches?.[`${id}:1`]; return m ? !m.none : undefined; },
  // Anime-only rule: it counts if it's registered on Kitsu or MyAnimeList. true / false / undefined (not checked yet)
  registered(it) {
    const ids = Object.keys(it.ProviderIds || {}).map((k) => k.toLowerCase());
    if (ids.some((k) => ['kitsu', 'myanimelist', 'mal'].includes(k))) return true;
    const match=this.matches?.[`${it.Id}:1`];
    if(match?.manual)return !match.none;
    // An old fuzzy match alone must not turn an ordinary private title into anime.
    if(!animeSignal(it)&&!this.animeLibIds?.has(it.Id))return undefined;
    if (this.kitsuSays(it.Id)) return true;
    return this.settings.registry?.[it.Id];
  },
  animated(it) { return (it.Genres || []).some((g) => /^(animation|anime)$/i.test(g)); },

  // Decides what counts as anime. Like AniView: if it's on Kitsu it's anime (Pokémon, Cyberpunk: Edgerunners, ...).
  classify() {
    this.items = {}; this.allItems = []; this.animeIds = new Set(); this.animeLibIds = new Set();
    const seen = new Set();
    (this.libraries || []).forEach((lib, i) => {
      const list = this.rawLists?.[i] || [];
      this.items[lib.Id] = list;
      const mode = this.libraryMode(lib);
      for (const it of list) {
        if (mode === 'anime') this.animeLibIds.add(it.Id);
        const ov = this.settings.animeOverride?.[it.Id];
        const sig = animeSignal(it);
        this.animeSignal[it.Id] = sig;
        const kitsu = this.kitsuSays(it.Id);
        let anime;
        if (ov !== undefined) anime = ov;
        else if(this.settings.autoNotAnime?.[it.Id])anime=false;
        else if (ANIME_ONLY) {
          const reg = this.registered(it);
          anime = reg !== undefined ? reg : !!sig; // not checked yet: only show it if Jellyfin's info already says anime
        } else if (mode === 'anime') anime = true;
        else {
          anime = mode === 'auto' && (!!sig || kitsu === true);
          if (sig !== 'strong' && this.settings.autoNotAnime?.[it.Id]) anime = false;
        }
        if (anime) this.animeIds.add(it.Id);
        if (!seen.has(it.Id)) { seen.add(it.Id); this.allItems.push(it); }
      }
    });
    this.series = this.allItems.filter((it) => this.animeIds.has(it.Id));
    this.libIndex = buildLibraryIndex([], {}); // Never route global anime features into library content.
  },

  // Looks up animated shows/movies (and anything with anime ids) on Kitsu once, so anime that lives in a
  // regular TV or movie library still shows up. Answers are saved, so this only runs for new items.
  async verifyWithKitsu() {
    const generation=this.libraryGeneration,scope=JSON.stringify([Jellyfin.server,Jellyfin.userId,Jellyfin.token]);
    const current=()=>generation===this.libraryGeneration&&Jellyfin.connected()&&JSON.stringify([Jellyfin.server,Jellyfin.userId,Jellyfin.token])===scope;
    if(!current()||(this.verifying?.scope===scope&&this.verifying?.generation===generation))return;
    const task={scope,generation};this.verifying=task;
    try {
      const queue = [], queued = new Set();
      (this.libraries || []).forEach((lib, i) => {
        if (!ANIME_ONLY && this.libraryMode(lib) === 'anime') return;
        for (const it of this.rawLists?.[i] || []) {
          if (queued.has(it.Id) || this.settings.animeOverride?.[it.Id] !== undefined) continue;
          if(!animeSignal(it)&&this.libraryMode(lib)!=='anime')continue; // Ordinary private titles stay private.
          if (ANIME_ONLY ? this.registered(it) !== undefined : (this.kitsuSays(it.Id) !== undefined || (!this.animated(it) && !animeSignal(it)))) continue;
          queued.add(it.Id); queue.push(it);
        }
      });
      // Likely anime first, so the library settles quickly.
      const likely = (it) => (animeSignal(it) ? 2 : 0) + (this.animated(it) ? 1 : 0) + (this.animeLibIds?.has(it.Id) ? 1 : 0);
      queue.sort((x, y) => likely(y) - likely(x));
      const before = new Set(this.animeIds);
      let done = 0;
      for (const it of queue) {
        if(!current())return;
        await Matcher.auto(it, null, null,{active:current}).catch(() => null);
        if(!current())return;
        if (!Matcher.lastOk) break; // Kitsu not answering; try again next start
        const matches=await Matcher.all();if(!current())return;this.matches=matches;
        if (ANIME_ONLY && !this.kitsuSays(it.Id)) {
          const onMal = await MAL.has(it.Name, Number(it.ProductionYear) || 0, it.Type === 'Movie');
          if(!current())return;
          if (onMal === null) continue; // couldn't reach MyAnimeList; ask again next time
          this.settings.registry = { ...(this.settings.registry || {}), [it.Id]: onMal };
        }
        if (++done % 15 === 0) { await this.saveSettings();if(!current())return;this.classify(); }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (done&&current()) {
        await this.saveSettings();if(!current())return;
        this.classify();
        const added = [...this.animeIds].filter((id) => !before.has(id)).length;
        const removed = [...before].filter((id) => !this.animeIds.has(id)).length;
        if (added) toast(`Found ${added} more anime in your library`, 'good');
        if ((added || removed) && $('#player').hidden && ['library', 'home'].includes(this.view)) this.refresh();
      }
    } finally { if(this.verifying===task)this.verifying=false; }
  },


  isAnime(id) { return this.animeIds.has(id); },

  // Called after trying to match a show/movie on Kitsu. If Kitsu answered but has no match,
  // and nothing strongly says "anime", treat it as a regular show/movie from now on.
  async confirmAnime(item, match) {
    const id = item.Id;
    if (match || !this.isAnime(id) || !Matcher.lastOk) return false;
    if (this.settings.animeOverride?.[id] !== undefined || this.animeSignal[id] === 'strong') return false;
    this.settings.autoNotAnime = { ...(this.settings.autoNotAnime || {}), [id]: true };
    await this.saveSettings();
    await this.refreshLibrary();
    toast(`${item.Name} stays in your Jellyfin library and won’t update anime tracking.`);
    return true;
  },

  // Finds a library item for a Trakt result: by TMDB/IMDb/TVDB id, then by title + year.
  findByIds(ids, title, year, kind) {
    const want = Object.entries(ids || {}).map(([k, v]) => [k.toLowerCase(), String(v)]);
    const type = kind === 'movie' ? 'Movie' : kind === 'show' ? 'Series' : null;
    for (const it of this.allItems) {
      if (type && it.Type !== type) continue;
      const have = Object.fromEntries(Object.entries(it.ProviderIds || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
      if (want.some(([k, v]) => have[k] === v)) return it;
    }
    const n = norm(title);
    return this.allItems.find((it) => (!type || it.Type === type) && norm(it.Name) === n && (!year || !it.ProductionYear || Math.abs(it.ProductionYear - Number(year)) <= 1)) || null;
  },
  // Library item for any request (anime via Kitsu index, movies/TV via ids).
  requestHit(r) {
    if (!r.kind || r.kind === 'anime') return this.libIndex?.find({ id: r.kitsuId, titles: [r.title] }) || null;
    return this.findByIds(r.ids, r.title, r.year, r.kind);
  },
  itemById(id) { return this.allItems.find((x) => x.Id === id); },

  buildNav() {
    $('#nav').innerHTML = `
      <button data-view="home" class="nav-item" title="Home">${icon('home')}<span>Home</span></button>
      <button data-view="schedule" class="nav-item" title="Schedule">${icon('calendar')}<span>Schedule</span></button>
      <button data-view="mylist" class="nav-item" title="My list">${icon('list')}<span>My list</span></button>
      ${Tracker.loggedIn()?`<button data-view="friends" class="nav-item" title="Social">${icon('chat')}<span>Social</span></button>`:''}
      ${Jellyfin.connected() ? `<button data-view="library" class="nav-item" title="My library">${icon('grid')}<span>My library</span></button>` : ''}
      ${Requests.enabled() ? `<button data-view="requests" class="nav-item" title="Requests">${icon('send')}<span>Requests</span></button>` : ''}`;
    this.markNav();
  },

  // Library entries, one per season like AniList/Kitsu list them. Movies and one-season shows stay one entry.
  entriesFor(it) {
    if (it.Type !== 'Series') return [{ item: it }];
    const ss = this.seasonsBySeries?.[it.Id] || [];
    if (ss.length <= 1) return [{ item: it, season: ss[0]?.IndexNumber }];
    return ss.map((s) => ({ item: it, season: s.IndexNumber ?? 1, seasonItem: s }));
  },
  // Season number of a library show that a Kitsu/AniList entry refers to, or null if unknown or not in the library.
  librarySeason(item, anime) {
    const n = this.libIndex?.season(anime);
    return n != null && (this.seasonsBySeries?.[item.Id] || []).some((s) => (s.IndexNumber ?? 1) === n) ? n : null;
  },
  // The newest season of a show (for "New in" rows).
  latestEntry(it) { const e = this.entriesFor(it).filter((x) => x.season !== 0); return e[e.length - 1] || this.entriesFor(it)[0]; },

  // Which Library tab an item belongs to.
  category(item) {
    if (this.animeIds.has(item.Id)) return 'anime';
    return item.Type === 'Movie' ? 'movies' : 'tv';
  },

  markNav() {
    if ($('#conn-btn')) $('#conn-btn').classList.toggle('active', this.view === 'profile');
    const homeBrand=$('#home-brand');if(homeBrand)homeBrand.hidden=this.view!=='home';
    const playerOpen=!$('#player').hidden;
    const pageBack=$('#page-back');if(pageBack){pageBack.hidden=playerOpen||this.view==='home';pageBack.disabled=!this.history.length;}
    const fab = $('#home-fab');
    if (fab) { fab.hidden = playerOpen || this.view === 'home'; $('#shell').classList.toggle('fab-on', !fab.hidden); }
    const view = ['homesections'].includes(this.view) ? 'settings' : this.view; // settings sub-pages
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active',
      b.dataset.view === view));
    // The section button shows where you are (the last section you picked while you're on a title page, search…).
    const cur = $('#nav').querySelector(`.nav-item[data-view="${view}"]`);
    if (cur) this.navSection = cur;
    const show = cur || this.navSection || $('#nav').querySelector('.nav-item');
    if (show && $('#nav-current')) $('#nav-current').innerHTML = `${show.querySelector('svg')?.outerHTML || ''}<span>${esc(show.querySelector('span:not(.afx-nav-badge)')?.textContent?.trim()||VIEW_TITLES[show.dataset.view]||show.dataset.view)}</span>${icon('caret', 'fill caret-ic')}`;
  },
  toggleNavMenu(open) {
    const menu = $('#nav'), btn = $('#nav-current');
    const closing = menu.classList.contains('closing');
    const on = open ?? (menu.hidden || closing);
    btn.setAttribute('aria-expanded', String(on));
    clearTimeout(this.navMenuTimer);
    if (on) {
      menu.classList.remove('closing');
      menu.hidden = false;
      (menu.querySelector('.nav-item.active') || menu.querySelector('.nav-item'))?.focus({ preventScroll: true });
    } else if (!menu.hidden && !closing) {
      // Fold back up into the button, then hide.
      menu.classList.add('closing');
      this.navMenuTimer = setTimeout(() => { menu.hidden = true; menu.classList.remove('closing'); }, 150);
    }
  },

  async saveSettings() { await window.native.set('settings', this.settings); },

  /* ---------------- navigation ---------------- */
  nav(view, params = {}, push = true, quiet = false) {
    if (push && this.view) this.history.push({ view: this.view, params: this.params, scroll: $('#main').scrollTop });
    this.closeEpMenu();
    if (this.selected.size && (view !== 'show' || params.id !== this.selSeries || String(params.season) !== String(this.params.season))) this.clearSelection();
    this.view = view; this.params = params;
    clearInterval(this.carouselTimer);
    clearInterval(this.ynRotationTimer);
    clearInterval(this.ynTimer);
    if (view !== 'browse') $('#main').onscroll = null;
    $('#tb-back').disabled = !this.history.length;
    this.markNav();
    const main = $('#main');
    const keepScroll = quiet ? main.scrollTop : 0;
    const id = ++this.renderId;
    this.renderedAt = Date.now();
    clearTimeout(this.spinTimer);
    if (!quiet) {
      // The old page fades back while the new one loads; the spinner only shows if that takes a moment.
      main.classList.add('view-leaving');
      this.spinTimer = setTimeout(() => {
        if (id !== this.renderId) return;
        main.classList.remove('view-leaving'); main.scrollTop = 0;
        main.innerHTML = skeleton(view); // shaped like the page that's coming, never a spinner
      }, 250);
    }
    const fn = Views[view];
    return Promise.resolve().then(() => fn ? fn(params, id) : '').then((html) => {
      if (id !== this.renderId) return;
      clearTimeout(this.spinTimer);
      main.classList.remove('view-leaving');
      this.renderQuiet = quiet; // quiet refreshes don't replay the card animations
      main.innerHTML = html;
      if(view==='home'&&typeof HomeReads!=='undefined')HomeReads.markPaint(id);
      this.mountPageShortcuts(main);
      if(view==='home'&&this.homeBrand){
        const anchor=document.createElement('div');anchor.className='home-brand-anchor';
        main.prepend(anchor);anchor.appendChild(this.homeBrand);this.homeBrand.hidden=false;this.homeBrand.classList.toggle('scrolled-away',quiet&&keepScroll>8);
      }
      showTint(main, ['show', 'anime', 'movie', 'thread'].includes(view) ? App.showAl?.color : null); // title pages wear the show's colour
      setWindowTitle(view, main);
      queueMicrotask(() => { this.renderQuiet = false; });
      if (quiet) main.scrollTop = keepScroll;
      else {
        main.scrollTop = 0;
        main.classList.remove('view-in'); void main.offsetWidth; // restart the entrance even when re-rendering the same view
        main.classList.add('view-in');
        clearTimeout(this.viewInTimer);
        this.viewInTimer = setTimeout(() => main.classList.remove('view-in'), 1000);
      }
      if (Views[view + 'After']) Views[view + 'After'](params, id);
      requestAnimationFrame(() => updateRailArrows(main));
      setTimeout(() => updateRailArrows(main), 600); // after images settle
    }).catch((e) => {
      if (id !== this.renderId) return;
      clearTimeout(this.spinTimer);
      main.classList.remove('view-leaving');
      main.innerHTML = `<div class="page"><div class="empty">Something went wrong: ${esc(e.message)}<br><br><button class="btn" data-act="retry">Try again</button></div></div>`;
      this.mountPageShortcuts(main);
    });
  },
  // Re-draws the current page in place after something changed (closing the player, a list update…): the page stays
  // up, keeps its scroll position and swaps once the new data is in. No dimming, placeholders or re-played animations.
  refresh() { return this.nav(this.view, this.params, false, true); },
  back() {
    const prev = this.history.pop();
    if (!prev) return;
    const target=this.renderId+1;
    return this.nav(prev.view, prev.params, false).then(() => { if(!this.stale(target))$('#main').scrollTop=prev.scroll||0; });
  },
  mountPageShortcuts(main=$('#main')) {if(!this.pageShortcuts||!main)return;const anchor=document.createElement('div');anchor.className='page-shortcuts-anchor';main.prepend(anchor);anchor.appendChild(this.pageShortcuts);},
  stale(id) { return id !== this.renderId; },

  /* ---------------- actions ---------------- */
  async act(name, d, el) {
    switch (name) {
      case 'retry': if(this.view==='home')QueueRecovery.tries=0;return this.refresh();
      case 'back': return this.back();
      case 'series': return this.openItem(d.id, d.season);
      case 'movie': return this.nav('movie', { id: d.id });
      case 'media': return this.nav('media', { id: d.id });
      case 'playMovie': return this.playMovie(d.id);
      case 'anilistLogin': return this.anilistLogin();
      case 'anilistLogout': await AniList.logout(); this.updateWho(); toast('Signed out of AniList', 'good'); return this.refresh();
      case 'goAccount': return this.nav('settings',{section:'Account'});
      case 'anime': {
        const titles = JSON.parse(d.titles || '[]');
        const isAl = String(d.id).startsWith('al:');
        const hit = this.libIndex?.find({ id: d.id, titles });
        if (hit) {
          // In your library: open the season it is. AniList entries go through Kitsu to use saved season matches.
          const kid = isAl ? await AniList.kitsuIdFor(d.id.slice(3), d.mal || null).catch(() => null) : null;
          return this.openItem(hit.Id, this.librarySeason(hit, kid ? { id: kid, titles } : { id: d.id, titles }) ?? undefined);
        }
        if (isAl) {
          // An entry from your AniList list: find the same show on Kitsu to open its page.
          const kid = await AniList.kitsuIdFor(d.id.slice(3), d.mal || null).catch(() => null);
          if (kid) return this.nav('anime', { id: kid });
          return toast('Couldn’t find this show on Kitsu', 'bad');
        }
        return this.nav('anime', { id: d.id });
      }
      case 'season': return this.nav('show', { id: this.params.id, season: d.season }, false);
      case 'epSort': this.settings.epSort = this.settings.epSort === 'desc' ? 'asc' : 'desc'; await this.saveSettings(); return this.nav(this.view, this.params, false, true);
      case 'epUpTo': return this.markUpTo(d.id, d.played === '1');
      case 'thread': return this.nav('thread', { id: d.id });
      case 'epRange': return this.nav('show', { ...this.params, range: d.range }, false);
     case 'setServer': {
        activeStreamingServer = d.srv==='animepahe'?'hianime':d.srv || 'jellyfin';
        lastServerError = null; // Removed the hardcoded fake anipm 404 error!
        document.querySelectorAll('.chip-menu').forEach((x) => { x.hidden = true; });
        if(this.view==='anime')return paintRemoteEpisodes();
        const allowLoc = this.view !== 'anime';
        const pill = document.querySelector('.server-pill');
        if (pill) pill.innerHTML = getServerLabel(activeStreamingServer, allowLoc) + '<span class="caret">▾</span>';
        document.querySelectorAll('.watch-on-item').forEach((btn) => {
          btn.classList.toggle('on', btn.dataset.srv === activeStreamingServer);
        });
        document.querySelectorAll('.hero-srv').forEach((s) => {
          s.textContent = shortServerName(allowLoc ? activeStreamingServer : remotePlaybackProvider());
        });
        const errSlot = document.getElementById('srv-err-slot');
        if (errSlot) errSlot.outerHTML = renderServerErrorBanner();
        const epListEl = document.querySelector('.ep-list, .eps');
        if (epListEl) {
          epListEl.style.display = '';
          document.querySelectorAll('.ep-sub-srv').forEach((s) => {
            s.textContent = shortServerName(allowLoc ? activeStreamingServer : remotePlaybackProvider());
          });
        }
        return null;
      }
      case 'retryEpisodes': {
        if(this.remoteEpisodeRequest)RemoteEpisodes.clear(this.remoteEpisodeRequest);
        return paintRemoteEpisodes();
      }
      case 'retryServer': {
        lastServerError = null;
        const errSlot = document.getElementById('srv-err-slot');
        if (errSlot) errSlot.outerHTML = renderServerErrorBanner();
        const epListEl = document.querySelector('.ep-list, .eps');
        if (epListEl) epListEl.style.display = '';
        return null;
      }

      case 'queuePlay': return this.playQueue(d);
      case 'playRemote': {
        return this.playRemoteEpisode({
          title: d.title,
          episodeNum: Number(d.ep) || 1,
          kitsuId: d.kitsu,
          poster: d.poster, movie: d.movie === '1', total: Number(d.total) || 0
        });
      }
      case 'remoteSubDub': {
        this.settings.showAudio = { ...(this.settings.showAudio || {}), [d.series]: d.mode };
        this.saveSettings();
        return this.view==='anime'?paintRemoteEpisodes():this.refresh();
      }
      case 'toggleMenu': {
        const m = el.parentElement.querySelector('.chip-menu');
        const was = m.hidden;
        document.querySelectorAll('.chip-menu').forEach((x) => { x.hidden = true; });
        m.hidden = !was;
        // Focus the current choice without scrolling the page to it
        if (!m.hidden) (m.querySelector('button.on') || m.querySelector('button'))?.focus({ preventScroll: true });
        return null;
      }
      case 'setKStatus': return this.setKStatus(d.kitsu, d.status, el);
      case 'castTv': return Cast.open();
      case 'homeSections': return this.nav('homesections');
      case 'editEntry': return this.editEntry(d.kitsu, Number(d.total) || 0, d.title, el, Number(d.watched) || 0);
      case 'markSeason': {
        const eps = await Jellyfin.episodes(d.series, d.seasonId);
        const played = d.played === '1';
        await Promise.all(eps.map((e) => Jellyfin.markPlayed(e.Id, played).catch(() => {})));
        toast(played ? 'Season marked watched' : 'Season marked unwatched', 'good');
        // Keep trackers in step when marking a whole season watched.
        if (played && Number(d.season) !== 0) {
          const real = eps.filter((e) => e.IndexNumber > 0);
          if (this.isAnime(d.series)) {
            const m = await Matcher.get(d.series, Number(d.season));
            if (m && !m.none && Tracker.loggedIn() && App.settings.autoTrack && real.length) {
              const last = Math.max(...real.map((e) => relativeEpisodeNumber(e, real)));
              Tracker.setProgress(m.id, last, m.episodes).then(() => toast(`${Tracker.name}: ${m.title} → episode ${last}`, 'good')).catch((e) => toast(`${Tracker.name} update failed: ${e.message}`, 'bad'));
            }
          } else if (Trakt.loggedIn() && App.settings.traktTrack && real.length) {
            const series = this.itemById(d.series) || await Jellyfin.item(d.series);
            Trakt.markEpisodes(series, real).then((n) => toast(`Trakt: ${n} episodes marked watched`, 'good')).catch((e) => toast(`Trakt update failed: ${e.message}`, 'bad'));
          }
        }
        return this.refresh();
      }
      case 'play': return this.playEpisode(d.id, d.series);
      case 'playShow': return this.playShow(d.id);
      case 'toggleWatched': return this.toggleWatched(d.id, d.played === '1');
      case 'selectAllEps': return this.selectAllEps();
      case 'showTab': return this.nav('show', { ...this.params, tab: d.tab }, false, true);
      case 'seeAll': { const [view, params] = JSON.parse(d.target || '[]'); return view ? this.nav(view, params || {}) : null; }
      case 'animeTab': return this.nav('anime', { ...this.params, tab: d.tab }, false, true);
      case 'animeRange': return this.nav('anime', { ...this.params, range: d.range }, false, true);
      case 'remoteWatched': return this.remoteWatched(d.kitsu, Number(d.num), d.played === '1', Number(d.total) || null);
      case 'subDub': {
        this.settings.showAudio = { ...(this.settings.showAudio || {}), [d.series]: d.mode };
        await this.saveSettings();
        toast(d.mode === 'dub' ? 'Dub: English audio for this show' : 'Sub: Japanese audio with subtitles for this show', 'good');
        return this.nav(this.view, this.params, false, true);
      }
      case 'hideEpTip': this.settings.hideEpTip = true; await this.saveSettings(); return el.closest('.ep-tip')?.remove();
      case 'epDiscuss': return this.episodeDiscussion(Number(d.num), d.watched !== '0');
      case 'download': return this.downloadEpisode(d.id);
      case 'scheduleWho': this.settings.scheduleWho = d.who; this.saveSettings(); return this.nav('schedule', { day: this.params?.day }, false, true);
      case 'aboutToggle': { const w = el.closest('.about-wrap'); const open = w.classList.toggle('open'); el.textContent = open ? 'Show less' : 'Show more'; return; }
      case 'pfRetry': this.profileCache = null; return this.refresh();
      case 'bannerSrc': await setBannerPref(d.al, d.to); return this.refresh();
      case 'scheduleView': this.settings.scheduleView = d.mode; this.saveSettings(); return this.nav('schedule', { day: this.params?.day }, false, true);
      case 'fixMatch': return this.fixMatch(d.series, Number(d.season), d.query);
      case 'request': return d.id.startsWith('trakt:') ? this.requestItem(this.traktCache?.[d.id]) : this.requestAnime(d.id);
      case 'unrequest': await Requests.remove(d.id); return this.nav('requests', {}, false);
      case 'link': return window.native.openExternal(d.url);
      case 'kitsuLogin': return this.kitsuLogin();
      case 'traktLogin': return this.traktLogin();
      case 'traktLogout': await Trakt.logout(); this.updateWho(); toast('Signed out of Trakt', 'good'); return this.refresh();
      case 'traktSync': return this.traktSyncSeason(d.series, Number(d.season));
      case 'kitsuLogout': await Kitsu.logout(); this.updateWho(); toast('Signed out of Kitsu', 'good'); return this.refresh();
      case 'localRecovery': return this.localRecovery();
      case 'localProfile': return this.nav('settings',{section:'account'});
      case 'switchTracker': return this.switchTracker(d.tracker);
      case 'jellyLogin': return this.jellyfinLogin();
      case 'jellyLogout': return this.disconnectJellyfin();
      case 'clearMatches': this.settings.autoNotAnime = {}; await this.saveSettings(); await Matcher.clearAll(); await this.refreshLibrary(); this.matches = {}; this.libIndex = buildLibraryIndex([], {}); return toast('Kitsu matches reset', 'good');
      case 'refresh': await this.refreshLibrary(); toast('Library refreshed', 'good'); return this.refresh();
      case 'syncSeason': return this.syncSeason(d.series, Number(d.season));
      case 'goSettings': return this.nav('settings');
      case 'goProfile': return this.nav('profile');
      case 'setAnime': {
        const val = d.val === '1';
        this.settings.animeOverride = { ...(this.settings.animeOverride || {}), [d.id]: val };
        await this.saveSettings(); await this.refreshLibrary();
        toast(val?'Marked as anime: episode tracking is available':'Jellyfin progress only. Excluded from anime tracking.','good');
        return this.refresh();
      }
      case 'browseGenre': return this.nav('browse', { src: d.src || 'anime', f: { genre: d.genre } });
      case 'libTab': return this.nav('library', { cat: d.cat }, false);
      case 'listTab': return this.nav('mylist', { ...this.params, tab: d.tab }, false);
      default: return null;
    }
  },

  // Shuffle: opens something random from your library (unwatched first).
  // On a Library tab it sticks to that tab; elsewhere it's a 50/50 mix of anime and everything else.
  shuffleSource() { const source=this.settings.shuffleFrom||'planning';return source==='library'?(Tracker.loggedIn()?'planning':'popular'):source; },

  shuffleKey() {
    return [this.shuffleSource(),Tracker.name,Tracker.svc?.userId||Tracker.userName||'',Tracker.loggedIn(),!!this.settings.hideNsfw].join(':');
  },

  async prepareShuffle() {
    const source=this.shuffleSource();
    if(source==='library'||(this.view==='library'&&this.params.cat))return null;
    const key=this.shuffleKey();let cache=this.shufflePool;
    if(!cache||cache.key!==key||Date.now()-cache.at>30000){
      cache={key,at:Date.now(),promise:null};this.shufflePool=cache;
      cache.promise=(async()=>{
        if(source==='planning'&&Tracker.loggedIn()){
          const {entries=[]}=await Tracker.list('planned',0,200);
          const list=sfw(entries.map(e=>e.anime).filter(Boolean));if(list.length)return list;
        }
        return popularUnwatchedPool();
      })().catch(error=>{if(this.shufflePool===cache)this.shufflePool=null;throw error;});
    }
    const pool=await cache.promise;if(key!==this.shuffleKey()||this.shufflePool!==cache)return null;
    let pick=this.shufflePick;
    if(!pick||pick.cache!==cache){
      const candidates=pool.length>1?pool.filter(a=>String(a.id)!==String(this.lastShuffleId)):pool;
      const a=candidates[Math.floor(Math.random()*candidates.length)];if(!a)return null;
      pick={cache,a,ready:null};this.shufflePick=pick;
      // Resolve the catalog mapping before a click, then warm only public title data.
      pick.ready=(async()=>{
        const id=String(a.id).startsWith('al:')?await AniList.kitsuIdFor(String(a.id).slice(3),a.malId||null).catch(()=>null):a.id;
        if(id){Kitsu.animeFull(id).catch(()=>{});AniList.details(id).catch(()=>{});}
        return id;
      })();
    }
    return pick;
  },

  async shuffle() {
    if(this.shuffleBusy)return;this.shuffleBusy=true;
    const button=$('#tb-shuffle'),key=this.shuffleKey(),rid=this.renderId;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.title='Finding your next pick…';}
    try{
      const from=this.shuffleSource();
      if(from!=='library'&&!(this.view==='library'&&this.params.cat)){
        const pick=await this.prepareShuffle();if(key!==this.shuffleKey()||rid!==this.renderId)return;
        if(!pick)return toast('Couldn’t find something to pick right now','bad');
        await pick.ready;if(key!==this.shuffleKey()||rid!==this.renderId)return;
        this.lastShuffleId=pick.a.id;this.shufflePick=null;
        const a=pick.a;
        return await this.act('anime',{id:a.id,mal:a.malId||'',titles:JSON.stringify(a.titles||[])});
      }
      const unwatched=list=>{const fresh=list.filter(x=>!x.UserData?.Played);return fresh.length?fresh:list;};
      let pool;
      if(this.view==='library'&&this.params.cat)pool=unwatched(this.allItems.filter(x=>this.category(x)===this.params.cat));
      else{const anime=unwatched(this.allItems.filter(x=>this.isAnime(x.Id))),other=unwatched(this.allItems.filter(x=>!this.isAnime(x.Id)));pool=anime.length&&other.length?(Math.random()<.5?anime:other):anime.length?anime:other;}
      if(!pool?.length)return toast('Your library is empty');
      return await this.openItem(pool[Math.floor(Math.random()*pool.length)].Id);
    }catch(error){toast('Couldn’t pick a title. Please try again.','bad');console.warn('Random pick:',error.message);}
    finally{this.shuffleBusy=false;if(button){button.disabled=false;button.removeAttribute('aria-busy');button.title='Pick something random';}}
  },

  openItem(id, season) {
    const it = this.itemById(id);
    if (it?.Type === 'Movie') return this.nav('movie', { id });
    return this.nav('show', { id, season });
  },

  async playMovie(id) {
    try {
      const movie = await Jellyfin.item(id);
      Player.open({ episode: movie, series: { Name: movie.Name, Id: movie.Id }, season: { IndexNumber: 1 }, episodes: [movie], match: this.isAnime(id) ? undefined : null, movie: true }, () => {
        if (['movie', 'home'].includes(this.view)) this.refresh();
      });
      if (this.isAnime(id)) {
        Matcher.auto(movie, null, 1).then(async (match) => { if (!match) await this.confirmAnime(movie, match); Player.setMatch(match); }).catch(() => {});
      }
    } catch (e) { toast(`Couldn't open movie: ${e.message}`, 'bad'); }
  },

 async playEpisode(episodeId, seriesId) {
    try {
      const ep = await Jellyfin.item(episodeId);
      const sid = seriesId || ep.SeriesId;
      const [series, episodes] = await Promise.all([
        this.allItems.find((s) => s.Id === sid) || Jellyfin.item(sid),
        Jellyfin.episodes(sid, ep.SeasonId),
      ]);
      const season = { Id: ep.SeasonId, IndexNumber: ep.ParentIndexNumber ?? 1 };
      const audio = this.settings.showAudio?.[sid] || (this.settings.audioLang === 'eng' ? 'dub' : 'sub');

      Player.open({
        episode: ep,
        series,
        season,
        episodes,
        provider: 'jellyfin',
        audio,
        match: season.IndexNumber !== 0 && this.isAnime(series.Id) ? undefined : null
      }, () => {
        if (['show', 'home'].includes(this.view)) this.refresh();
      });
      if (season.IndexNumber !== 0 && this.isAnime(series.Id)) {
        Matcher.auto(series, season, episodes.filter((e) => e.IndexNumber > 0).length).then(async (match) => {
          if(Player.ctx?.episode?.Id!==ep.Id||Player.ctx?.series?.Id!==series.Id)return;
          if (!match && season.IndexNumber <= 1) await this.confirmAnime(series, match);
          Player.setMatch(match);
        }).catch(() => {});
      }
    } catch (e) { toast(`Couldn't open episode: ${e.message}`, 'bad'); }
  },

  // Plays the next unwatched episode of a show (or resumes one in progress).
  async playShow(seriesId) {
    try {
      const up = await Jellyfin.call(`/Shows/NextUp${qs({ userId: Jellyfin.userId, seriesId, Limit: 1 })}`);
      let ep = up.Items?.[0];
      if (!ep) {
        const all = await Jellyfin.call(`/Shows/${seriesId}/Episodes${qs({ userId: Jellyfin.userId, EnableUserData: true })}`);
        const list = (all.Items || []).filter((e) => e.ParentIndexNumber !== 0);
        ep = list.find((e) => !e.UserData?.Played) || list[0];
      }
      if (!ep) return toast('No episodes found', 'bad');
      this.playEpisode(ep.Id, seriesId);
    } catch (e) { toast(e.message, 'bad'); }
  },

  async toggleWatched(id, played) {
    try { await Jellyfin.markPlayed(id, !played); this.refresh(); }
    catch (e) { toast(e.message, 'bad'); }
  },

  /* ---------------- episode selection ---------------- */
  // Right-click an episode for quick actions, or Ctrl/Shift-click to pick several and mark them in one go.
  epRows() { return [...document.querySelectorAll('#main .ep[data-ep]')]; },
  selectEp(row, on = !this.selected.has(row.dataset.ep)) {
    if (on) this.selected.add(row.dataset.ep); else this.selected.delete(row.dataset.ep);
    this.selSeries = this.params.id;
    this.selAnchor = row.dataset.ep;
    this.paintSelection();
  },
  selectRange(row) {
    const rows = this.epRows();
    const a = rows.findIndex((r) => r.dataset.ep === this.selAnchor), b = rows.indexOf(row);
    if (a < 0) return this.selectEp(row, true);
    rows.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((r) => this.selected.add(r.dataset.ep));
    this.selSeries = this.params.id;
    this.paintSelection();
  },
  selectAllEps() {
    this.epRows().forEach((r) => this.selected.add(r.dataset.ep));
    this.selSeries = this.params.id;
    this.paintSelection();
  },
  clearSelection() { this.selected.clear(); this.selAnchor = null; this.paintSelection(); },
  paintSelection() {
    this.epRows().forEach((r) => r.classList.toggle('selected', this.selected.has(r.dataset.ep)));
    let bar = $('#sel-bar');
    if (!this.selected.size) return bar?.remove();
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sel-bar'; bar.className = 'sel-bar';
      bar.onclick = (e) => { const b = e.target.closest('[data-sel]'); if (b) this.selAction(b.dataset.sel); };
      document.body.appendChild(bar);
    }
    const n = this.selected.size;
    bar.innerHTML = `<b>${n} episode${n === 1 ? '' : 's'} selected</b>
      <button class="btn sm" data-sel="watched">✓ Mark watched</button>
      <button class="btn sm" data-sel="unwatched">Mark unwatched</button>
      <button class="btn ghost sm" data-sel="all">Select all</button>
      <button class="btn ghost sm" data-sel="clear">Clear</button>`;
  },
  async selAction(what) {
    if (what === 'clear') return this.clearSelection();
    if (what === 'all') return this.selectAllEps();
    const ids = [...this.selected], played = what === 'watched';
    $('#sel-bar')?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const res = await Promise.allSettled(ids.map((id) => Jellyfin.markPlayed(id, played)));
    const failed = res.filter((r) => r.status === 'rejected').length;
    this.clearSelection();
    if (failed) toast(`${ids.length - failed} of ${ids.length} episodes updated`, 'bad', 'Some couldn’t be changed on Jellyfin.');
    else toast(`${ids.length} episode${ids.length === 1 ? '' : 's'} marked ${played ? 'watched' : 'unwatched'}`, 'good');
    this.nav(this.view, this.params, false, true);
  },

  epMenu(row, x, y) {
    this.closeEpMenu();
    const id = row.dataset.ep, played = row.classList.contains('played'), sel = this.selected.has(id);
    const n = this.selected.size;
    const items = sel && n > 1
      ? [['watched', `✓ Mark ${n} selected watched`], ['unwatched', `Mark ${n} selected unwatched`], ['deselect', 'Deselect this one'], ['clear', 'Clear selection']]
      : [['play', '▶ Play'], ['toggle', played ? 'Mark unwatched' : 'Mark watched'], [sel ? 'deselect' : 'select', sel ? 'Deselect' : 'Select'], ['all', 'Select all on this page']];
    const m = document.createElement('div');
    m.id = 'ep-menu'; m.className = 'chip-menu ctx-menu';
    m.innerHTML = items.map(([a, l]) => `<button data-ctx="${a}">${esc(l)}</button>`).join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
    m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
    m.onclick = (e) => {
      const b = e.target.closest('[data-ctx]');
      if (!b) return;
      this.closeEpMenu();
      switch (b.dataset.ctx) {
        case 'play': return this.playEpisode(id, this.params.id);
        case 'toggle': return this.toggleWatched(id, played);
        case 'select': return this.selectEp(row, true);
        case 'deselect': return this.selectEp(row, false);
        case 'all': return this.selectAllEps();
        case 'clear': return this.clearSelection();
        default: return this.selAction(b.dataset.ctx);
      }
    };
    m.querySelector('button')?.focus();
  },
  closeEpMenu() { $('#ep-menu')?.remove(); },

  // AniList id for the season open on the show page (relations, threads and friends all live on AniList).
  async showMediaId() {
    const m = this.showCtx?.match;
    if (!m) throw new Error('Find this season on Kitsu first');
    return AniList.mediaId(m.id);
  },

  // Opens this episode's discussion thread on AniList, or the show's threads if there isn't one.
  async episodeDiscussion(num, watched = true) {
    if (!watched && !(await this.confirmSpoilers(num))) return;
    try {
      const id = await this.showMediaId();
      // AniList's search often misses these ("Episode 10" finds nothing), so look through the show's newest threads
      // for "… - Episode 10 Discussion" first, and only search as a fallback.
      const isEp = (x) => new RegExp(`episode\\s*0*${num}\\b`, 'i').test(x.title);
      const t = (await AniList.threads(id, undefined, 50)).find(isEp) || (await AniList.threads(id, `Episode ${num}`, 10)).find(isEp);
      if (t) return this.nav('thread', { id: t.id });
      toast(`No discussion thread for episode ${num} yet`);
      this.nav(this.view, { ...this.params, tab: 'discussion' }, false, true);
    } catch (e) { toast(e.message, 'bad'); }
  },
  // "Spoiler warning" before opening the discussion of an episode you haven't watched.
  confirmSpoilers(num) {
    return new Promise((resolve) => {
      const show = App.showAl?.title || App.showCtx?.match?.title || '';
      this.modal(`<div class="spoiler-ico">${icon('eyeOff')}</div>
        <h2>Spoiler warning</h2>
        <span class="spoiler-ep">${show ? `${esc(show)} · ` : ''}Episode ${esc(num)}</span>
        <p>You haven’t seen this episode yet, so the discussion may give away what happens.</p>
        <div class="spoiler-actions"><button class="btn ghost" id="sp-no">Cancel</button><button class="btn spoiler-go" id="sp-yes">Show me anyway</button></div>`, 'spoiler-pop');
      const done = (v) => { this.closeModal(); resolve(v); };
      $('#sp-no').onclick = () => done(false);
      $('#sp-yes').onclick = () => done(true);
      $('#sp-no').focus();
    });
  },

  // "Watched up to here" on a library episode: this one and every earlier one in the season
  // (or, on a watched one, unwatch it and everything after). Your Kitsu/AniList progress follows.
  async markUpTo(epId, played) {
    const eps = (this.showEps || []).filter((e) => e.IndexNumber > 0);
    const i = eps.findIndex((e) => e.Id === epId);
    if (i < 0) return;
    const isPlayed = (e) => (typeof isEpPlayed === 'function' ? isEpPlayed(e) : e.UserData?.Played);
    const targets = played ? eps.slice(i).filter(isPlayed) : eps.slice(0, i + 1).filter((e) => !isPlayed(e));
    try {
      await Promise.all(targets.map((e) => Jellyfin.markPlayed(e.Id, !played)));
      const m = this.showCtx?.match;
      if (m && Tracker.loggedIn() && this.isAnime(this.showCtx.id)) {
        const num = relativeEpisodeNumber(eps[i], eps) || i + 1;
        await setListProgress(m.id, played ? num - 1 : num, m.episodes).catch((x) => toast(`${Tracker.name} update failed: ${x.message}`, 'bad'));
      }
      toast(played ? `Marked unwatched from episode ${eps[i].IndexNumber}` : `Watched up to episode ${eps[i].IndexNumber}`, 'good');
      this.nav(this.view, this.params, false, true);
    } catch (e) { toast(e.message, 'bad'); }
  },

  // Saves the original file from Jellyfin (Electron shows a Save dialog).
  async downloadEpisode(id) {
    const ok = await window.native.download(`${Jellyfin.server}/Items/${encodeURIComponent(id)}/Download${qs({ api_key: Jellyfin.token })}`);
    if (!ok) toast('Couldn’t start the download', 'bad');
  },

  // Pushes the season's watched count to Kitsu (for catching up after setting a match).
  async syncSeason(seriesId, seasonNumber) {
    const m = await Matcher.get(seriesId, seasonNumber);
    if (!m || m.none) return toast('Pick a Kitsu match first', 'bad');
    if (!Tracker.loggedIn()) return this.nav('settings');
    const seasons = await Jellyfin.seasons(seriesId);
    const season = seasons.find((s) => (s.IndexNumber ?? 1) === seasonNumber);
    if (!season) return;
    const eps = (await Jellyfin.episodes(seriesId, season.Id)).filter((e) => e.IndexNumber > 0);
    const watched = eps.filter((e) => e.UserData?.Played);
    if (!watched.length) return toast('No watched episodes in this season yet');
    const last = Math.max(...watched.map((e) => relativeEpisodeNumber(e, eps)));
    try {
      const r = await Tracker.setProgress(m.id, last, m.episodes);
      toast(r.unchanged ? `${Tracker.name} already at episode ${r.progress}` : `Kitsu: ${m.title} → episode ${last}`, 'good');
      this.refresh();
    } catch (e) { toast(`${Tracker.name} update failed: ${e.message}`, 'bad'); }
  },

  /* ---------------- modals ---------------- */
  // `cls` styles one kind of dialog (e.g. 'spoiler-pop'); every open starts from the plain card.
  modal(html, cls = '') { if(typeof HoverPreview!=='undefined')HoverPreview.hide();const c = $('#modal-card'); c.className = `modal-card ${cls}`.trim(); c.innerHTML = html; $('#modal').hidden = false; },
  closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; },

  kitsuLogin() {
    this.modal(`
      <h2>Sign in to Kitsu</h2>
      <p class="muted" style="margin:0">Episodes you finish get marked on your Kitsu list automatically. Your password goes only to Kitsu and isn't saved.</p>
      <form id="kitsu-form" style="display:grid;gap:12px">
        <label>Email<input type="text" id="k-user" autocomplete="username" required></label>
        <label>Password<input type="password" id="k-pass" autocomplete="current-password" required></label>
        <p class="error" id="k-err" hidden></p>
        <div class="row gap"><button class="btn primary" id="k-go">Sign in</button><button type="button" class="btn ghost" id="k-cancel">Cancel</button>
        <span class="spacer"></span><a href="#" id="k-new" class="small">Make a Kitsu account</a></div>
      </form>`);
    $('#k-user').focus();
    $('#k-cancel').onclick = () => this.closeModal();
    $('#k-new').onclick = (e) => { e.preventDefault(); window.native.openExternal('https://kitsu.app/');const note=$('#k-err');note.textContent='Create your Kitsu account in the browser, then return here and sign in with your new email and password.';note.className='muted small';note.hidden=false; };
    $('#kitsu-form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#k-go'), err = $('#k-err');
      btn.disabled = true; btn.textContent = 'Signing in…'; err.hidden = true;
      try {
        await Kitsu.login($('#k-user').value.trim(), $('#k-pass').value);
        await this.useTracker('kitsu'); // AniList stays signed in, ready to switch back
        this.closeModal(); this.updateWho();
        toast(`Signed in to Kitsu as ${Kitsu.userName}`, 'good');
        if (!$('#login').hidden) await this.enter(); else this.refresh();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Sign in'; }
    };
  },

  async anilistLogin() {
    try {
      await AniList.login();
      await this.useTracker('anilist'); // Kitsu stays signed in, ready to switch back
      this.updateWho();
      toast(`Signed in to AniList as ${AniList.userName}`, 'good');
      if (!$('#login').hidden) await this.enter(); else this.refresh();
    } catch (e) { toast(e.message, 'bad'); }
  },

  // Which tracker your list goes to. Both can stay signed in, so switching back never asks you to sign in again.
  async useTracker(which) {
    if(typeof Cloud!=='undefined')await Cloud.init();
    this.settings.activeTracker = which;
    await this.saveSettings();
  },
  async switchTracker(which) {
    if(which==='local'&&!LocalTracker.enabled)await LocalTracker.enable();
    const svc = which === 'local' ? LocalTracker : which === 'anilist' ? AniList : Kitsu;
    if (!svc.loggedIn()) return which === 'anilist' ? this.anilistLogin() : this.kitsuLogin();
    await this.useTracker(which);
    this.updateWho();
    toast(`Now using ${Tracker.name} for your list`, 'good', `Signed in as ${svc.userName}`);
    this.refresh();
  },

  // Tick on an episode of a show that isn't in your library: your list goes to that episode (or one before it).
  async remoteWatched(animeId, num, played, total) {
    if (!Tracker.loggedIn()) return toast('Sign in to Kitsu or AniList to track episodes', 'bad');
    const to = played ? num - 1 : num;
    try {
      await setListProgress(animeId, to, total);
      toast(`${Tracker.name}: ${to ? `watched up to episode ${to}` : 'progress cleared'}`, 'good');
      this.nav(this.view, this.params, false, true);
    } catch (e) { toast(`${Tracker.name} update failed: ${e.message}`, 'bad'); }
  },

  // From the status button's menu (statusPicker).
  async setKStatus(animeId, status, btn) {
    const wrap = btn?.closest('.status-wrap');
    wrap?.querySelector('.status-btn')?.setAttribute('disabled', '');
    try {
      await Tracker.setStatus(animeId, status);
      toast(status === 'remove' ? `Removed from your ${Tracker.name} list` : `${Tracker.name}: moved to ${STATUS_LABELS[status]}`, 'good');
      if (['mylist', 'show', 'movie', 'anime'].includes(this.view)) this.refresh();
    } catch (ex) { toast(`${Tracker.name} update failed: ${ex.message}`, 'bad'); }
    wrap?.querySelector('.status-btn')?.removeAttribute('disabled');
  },

  // List editor for a show's Kitsu/AniList entry: status (incl. Rewatching) and episodes watched.
  // A centered dialog over a dimmed page; the page behind it can't scroll while it's open.
  async editEntry(animeId, total, title, _anchor, watched = 0) {
    this.closeEntryEditor?.();document.getElementById('entry-pop')?.remove();
    const editorSeq=this.entryEditorSeq=(this.entryEditorSeq||0)+1,renderId=this.renderId,service=Tracker.svc,userId=service?.userId;
    let existing;try{existing=await Tracker.entry(animeId);}catch(error){if(editorSeq===this.entryEditorSeq&&renderId===this.renderId&&service===Tracker.svc&&userId===service?.userId){if(Number(error.status)===429){if((this.entryRateNoticeUntil||0)>Date.now())return;this.entryRateNoticeUntil=error.retryAt||Date.now()+60000;}toast(`Couldn’t load your list entry: ${error.message}`,'bad');}return;}
    if(editorSeq!==this.entryEditorSeq||renderId!==this.renderId||service!==Tracker.svc||userId!==service?.userId)return;
    const e=existing||{status:'current',progress:watched};
    let status = e.reconsuming ? 'rewatching' : (e.status || 'current');
    const labels = { current: 'Watching', planned: 'Planning', completed: 'Completed', on_hold: 'Paused', dropped: 'Dropped', rewatching: 'Rewatching' };
    const scrim = document.createElement('div');
    scrim.id = 'entry-pop'; scrim.className = 'entry-scrim';
    scrim.innerHTML = `<div class="entry-pop" role="dialog" aria-modal="true" aria-label="Update your list${title ? `: ${esc(title)}` : ''}">
      <div class="entry-pop-heading"><div><span class="ad-eyebrow">YOUR WATCHLIST</span><h2>Update your list</h2>${title?`<p>${esc(title)}</p>`:''}</div><button type="button" class="icon-btn" id="ee-close" aria-label="Close list editor">${icon('close')}</button></div>
      <div class="ee-chips" id="ee-status">${Object.entries(labels).map(([v, l]) => `<button type="button" class="ee-chip ${status === v ? 'on' : ''}" data-st="${v}">${icon('tick')}${l}</button>`).join('')}</div>
      <div class="ee-row"><label for="ee-prog">Episodes watched</label><span class="spacer"></span>
        <button type="button" class="round-step" id="ee-minus" title="One less">${icon('minus')}</button><b class="ee-count"><input id="ee-prog" class="ee-progress-input" type="number" inputmode="numeric" min="0" max="${total||9999}" step="1" value="${Number(e.progress)||0}" aria-describedby="ee-error">${total ? `<small> / ${total}</small>` : ''}</b><button type="button" class="round-step" id="ee-plus" title="One more">${icon('plus')}</button></div>
      <p id="ee-error" class="error" role="alert" hidden></p><div class="ee-foot"><button class="ee-remove" id="ee-remove" ${e.id ? '' : 'hidden'}>${icon('trash')}Remove</button><span class="spacer"></span><button class="btn primary ee-save" id="ee-save">Save</button></div>
    </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add('modal-open'); // freezes #main's scroll (see styles.css)
    const pop = scrim.firstElementChild;
    const input=pop.querySelector('#ee-prog');input.value=String(Number(e.progress)||0);input.focus({preventScroll:true});input.select();
    let prog = Number(e.progress) || 0;
    const setProg=v=>{prog=Math.max(0,Math.min(total||9999,Math.trunc(Number(v)||0)));input.value=String(prog);input.removeAttribute('aria-invalid');};
    const validProgress=()=>input.value.trim()!==''&&Number.isInteger(Number(input.value))&&Number(input.value)>=0&&Number(input.value)<=(total||9999);
    input.oninput=()=>{if(validProgress()){prog=Number(input.value);input.removeAttribute('aria-invalid');pop.querySelector('#ee-error').hidden=true;}};
    input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();pop.querySelector('#ee-save').click();}};
    const setStatus = (v) => { status = v; pop.querySelectorAll('.ee-chip').forEach((x) => x.classList.toggle('on', x.dataset.st === v)); };
    pop.querySelector('#ee-status').onclick = (ev) => { const b = ev.target.closest('[data-st]'); if (!b) return; setStatus(b.dataset.st); if (status === 'completed' && total) setProg(total); if (status === 'rewatching' && prog >= total) setProg(0); };
    pop.querySelector('#ee-minus').onclick = () => setProg(prog - 1);
    pop.querySelector('#ee-plus').onclick = () => { setProg(prog + 1); if (status === 'planned') setStatus('current'); };
    let closed=false;const close=()=>{if(closed)return;closed=true;scrim.remove();document.body.classList.remove('modal-open');document.removeEventListener('keydown',esc_);if(this.closeEntryEditor===close)this.closeEntryEditor=null;if(_anchor?.isConnected)_anchor.focus({preventScroll:true});};
    const esc_=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab'){const controls=[...pop.querySelectorAll('button,input')].filter(el=>!el.disabled&&!el.hidden),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    this.closeEntryEditor=close;pop.querySelector('#ee-close').onclick=close;
    scrim.onmousedown = (ev) => { if (ev.target === scrim) close(); }; // click on the dimmed area closes it
    document.addEventListener('keydown', esc_);
    let busy=false;
    const setBusy=value=>{busy=value;pop.querySelectorAll('button,input').forEach(button=>button.disabled=value);};
    const showError=error=>{const message=pop.querySelector('#ee-error');message.textContent=`${Tracker.name} update failed: ${error.message}`;message.hidden=false;};
    const accountValid=()=>{if(service===Tracker.svc&&userId===service?.userId)return true;showError(Error('Your account changed. Close this menu and open it again.'));return false;};
    pop.querySelector('#ee-remove').onclick = async () => {
      if(busy||!accountValid())return;setBusy(true);pop.querySelector('#ee-error').hidden=true;
      try{await Tracker.setStatus(animeId,'remove');close();toast(`Removed from your ${Tracker.name} list`,'good');this.refresh();}
      catch(error){showError(error);setBusy(false);}
    };
    pop.querySelector('#ee-save').onclick = async () => {
      if(busy||!accountValid())return;if(!validProgress()){const error=pop.querySelector('#ee-error');error.textContent=`Enter a whole episode count from 0 to ${total||9999}.`;error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}prog=Number(input.value);if(status==='planned'&&prog>0)setStatus('current');setBusy(true);pop.querySelector('#ee-error').hidden=true;
      const btn = pop.querySelector('#ee-save'); btn.textContent = 'Saving…';
      let st = status === 'rewatching' ? 'current' : status;
      if (total && prog >= total && st === 'current' && status !== 'rewatching') st = 'completed';
      try {
        await Tracker.saveEntry(animeId, { status: st, progress: prog, reconsuming: status === 'rewatching' });
        close(); toast(`${Tracker.name}: ${labels[status]} · ${prog}${total ? ` / ${total}` : ''}`, 'good'); this.refresh();
      } catch (x) { setBusy(false);btn.textContent='Save';showError(x); }
    };
  },

  async traktLogin() {
    if (!Trakt.available()) return toast('Trakt isn’t set up in this build yet.', 'bad');
    let cancelled = false;
    this.modal(`<h2>Sign in to Trakt</h2><div id="tk-body" class="loading"><div class="spinner"></div></div>
      <div class="row gap"><span class="spacer"></span><button class="btn ghost" id="tk-cancel">Cancel</button></div>`);
    $('#tk-cancel').onclick = () => { cancelled = true; this.closeModal(); };
    try {
      const dc = await Trakt.startDeviceLogin();
      if (cancelled) return;
      $('#tk-body').className = '';
      $('#tk-body').innerHTML = `
        <p class="muted" style="margin:0 0 14px">Go to <b>${esc(dc.verification_url)}</b> and enter this code:</p>
        <div class="device-code">${esc(dc.user_code)}</div>
        <div class="row gap" style="margin-top:14px"><button class="btn primary" id="tk-open">Open Trakt</button><button class="btn ghost" id="tk-copy">Copy code</button>
          <span class="spacer"></span><span class="small muted">Waiting for you to approve…</span></div>`;
      $('#tk-open').onclick = () => window.native.openExternal(`${dc.verification_url}/${dc.user_code}`);
      $('#tk-copy').onclick = () => { navigator.clipboard.writeText(dc.user_code).catch(() => {}); toast('Code copied', 'good'); };
      window.native.openExternal(`${dc.verification_url}/${dc.user_code}`);
      await Trakt.finishDeviceLogin(dc, () => cancelled);
      this.closeModal(); this.updateWho();
      toast(`Signed in to Trakt as ${Trakt.userName}`, 'good');
      this.refresh();
    } catch (e) {
      if (e.message === 'cancelled' || cancelled) return;
      $('#tk-body').className = '';
      $('#tk-body').innerHTML = `<p class="error">${esc(e.message)}</p>`;
    }
  },

  // Sends every watched episode of a season (or a watched movie) to Trakt.
  async traktSyncSeason(itemId, seasonNumber) {
    if (!Trakt.loggedIn()) return this.traktLogin();
    try {
      const item = await Jellyfin.item(itemId);
      if (item.Type === 'Movie') {
        if (!item.UserData?.Played) return toast('Mark it watched first');
        await Trakt.markMovie(item); return toast(`Trakt: ${item.Name} marked watched`, 'good');
      }
      const seasons = await Jellyfin.seasons(itemId);
      const season = seasons.find((s) => (s.IndexNumber ?? 1) === seasonNumber);
      const eps = (await Jellyfin.episodes(itemId, season.Id)).filter((e) => e.UserData?.Played);
      if (!eps.length) return toast('No watched episodes in this season yet');
      const n = await Trakt.markEpisodes(item, eps);
      toast(`Trakt: ${n} episode${n === 1 ? '' : 's'} synced`, 'good');
    } catch (e) { toast(`Trakt sync failed: ${e.message}`, 'bad'); }
  },

  async fixMatch(seriesId, seasonNumber, query) {
    const series = this.itemById(seriesId);
    this.modal(`
      <h2>Which Kitsu entry is this?</h2>
      <p class="muted" style="margin:0">${esc(series?.Name || '')}${seasonNumber > 0 ? ` · Season ${seasonNumber}` : ''}</p>
      <form id="fm-form" class="row gap"><input type="search" id="fm-q" value="${esc(query || series?.Name || '')}"><button class="btn">Search</button></form>
      <div id="fm-results" class="ep-list"><div class="loading"><div class="spinner"></div></div></div>
      <div class="row gap"><button class="btn ghost" id="fm-none">Don't track this season</button><span class="spacer"></span><button class="btn ghost" id="fm-cancel">Cancel</button></div>`);
    const run = async () => {
      const box = $('#fm-results');
      box.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        const res = await Kitsu.search($('#fm-q').value, 12);
        box.innerHTML = res.length ? res.map((a, i) => `
          <button class="pick" data-i="${i}">
            ${a.poster ? `<img src="${esc(a.poster)}" alt="">` : '<div class="ph"></div>'}
            <div><div style="font-weight:600">${esc(a.title)}</div><div class="small muted">${esc([a.subtype, a.year, a.episodes ? `${a.episodes} eps` : ''].filter(Boolean).join(' · '))}</div></div>
            <span class="btn sm">Use</span>
          </button>`).join('') : '<div class="empty">No results</div>';
        box.querySelectorAll('.pick').forEach((b) => {
          b.onclick = async () => {
            const a = res[+b.dataset.i];
            await Matcher.set(seriesId, seasonNumber, a, true);
            if (this.settings.autoNotAnime?.[seriesId]) { delete this.settings.autoNotAnime[seriesId]; await this.saveSettings(); await this.refreshLibrary(); }
            this.matches = await Matcher.all(); this.libIndex = buildLibraryIndex([], {}); // Never route global anime features into library content.
            if (series?.Type === 'Movie' && Tracker.loggedIn() && series.UserData?.Played) Tracker.setProgress(a.id, 1, a.episodes || 1).catch(() => {});
            this.closeModal(); toast(`Matched to ${a.title}`, 'good');
            this.refresh();
          };
        });
      } catch (e) { box.innerHTML = `<div class="empty">Kitsu search failed: ${esc(e.message)}</div>`; }
    };
    $('#fm-form').onsubmit = (e) => { e.preventDefault(); run(); };
    $('#fm-cancel').onclick = () => this.closeModal();
    $('#fm-none').onclick = async () => {
      await Matcher.set(seriesId, seasonNumber, null, true);
      this.matches = await Matcher.all();
      this.closeModal(); this.refresh();
    };
    run();
  },


 async playQueue(d){
    const service=Tracker.svc,who=service?.userId,rid=this.renderId;
    const valid=()=>service===Tracker.svc&&who===service?.userId&&rid===this.renderId;
    try{const entry=await Tracker.entry(d.kitsu);if(!valid())return;const episode=Number(entry?.progress||0)+1,total=Number(d.total)||0;
      if(total&&episode>total)return toast('All episodes are logged. Open details to choose a rewatch.');
      if(episode!==Number(d.ep)){const metadata=await AniList.details(d.kitsu);if(!valid())return;if(!metadata)throw Error('Couldn’t verify the next episode.');if(metadata.episodes&&episode>Number(metadata.episodes))return toast('All episodes are logged. Open details to choose a rewatch.');const next=metadata.next;if(/upcoming|not yet released/i.test(metadata.status||'')||(next?.at>Date.now()&&episode>=next.episode))return toast('You’re caught up. The next episode hasn’t aired yet.');}
      return await this.playRemoteEpisode({title:d.title,titleAliases:JSON.parse(d.titles||'[]'),episodeNum:episode,kitsuId:d.kitsu,poster:d.poster,movie:d.movie==='1',total});
    }catch(error){if(valid())toast('Couldn’t check your latest progress. '+error.message,'bad');}
  },

 async playRemoteEpisode({ title, titleAliases=[], episodeNum, kitsuId, poster, movie: movieHint = false, total: totalHint = 0 }) {
    const renderId=this.renderId,service=typeof Tracker==='undefined'?null:Tracker.svc,user=service?.userId;
    const provider = remotePlaybackProvider();
    const audio = this.settings.showAudio?.[kitsuId] || (this.settings.audioLang === 'eng' ? 'dub' : 'sub');
    lastServerError = null;
    const errSlot = document.getElementById('srv-err-slot');
    if (errSlot) errSlot.outerHTML = renderServerErrorBanner();
    const knownMatch = String(this.showCtx?.match?.id) === String(kitsuId) ? this.showCtx.match : null;
    const movie = knownMatch?.movie === true || movieHint;
    if (movie) episodeNum = 1;
    const listing=await RemoteEpisodes.load({provider,title,titleAliases:knownMatch?.titleAliases||titleAliases,seasonNumber:seasonNumberIn(title)||1,audio});
    if(this.renderId!==renderId||remotePlaybackProvider()!==provider||(typeof Tracker!=='undefined'&&(Tracker.svc!==service||service?.userId!==user)))return;
    if(listing.status!=='ready')return toast('Couldn’t check this server. Open Episodes & Details to try another server.','bad');
    if(!listing.episodes.includes(episodeNum))return toast('This episode wasn’t found on '+shortServerName(provider)+'. Try another server.');
    const fakeEp = { Id: `remote-${kitsuId}-${episodeNum}`, Name: movie ? title : `Episode ${episodeNum}`,
      Type: movie ? 'Movie' : 'Episode', IndexNumber: episodeNum, ParentIndexNumber: 1, SeriesName: title };
    const total = movie ? 1 : Number(knownMatch?.episodes) || Number(totalHint) || 0;
    const remoteEpisodes = movie ? [fakeEp] : listing.episodes.filter(n=>!total||n<=total).map(n=>({...fakeEp,Id:`remote-${kitsuId}-${n}`,Name:`Episode ${n}`,IndexNumber:n}));
    return Player.open({ episode: fakeEp, series: { Id: `kitsu-${kitsuId}`, Name: title },
      season: { Id: 's1', IndexNumber: 1 }, episodes: remoteEpisodes, match: knownMatch || { id: kitsuId, title, titleAliases, episodes: total || null },
      provider, audio, remoteOnly: true, movie }, () => { if (['anime','home'].includes(this.view)) this.refresh(); }); // progress may have moved
  },
  async requestAnime(kitsuId) {
    let anime;
    try { anime = await Kitsu.anime(kitsuId); } catch (e) { return toast(e.message, 'bad'); }
    return this.requestItem(anime);
  },

  async requestItem(anime) {
    if (!Requests.enabled()) return toast('Connect a Jellyfin library to send requests', 'bad');
    if (!anime) return toast('Couldn’t find that title, try searching again', 'bad');
    if (await Requests.has(anime.id)) return toast('Already requested', 'good');
    this.modal(`
      <h2>Request “${esc(anime.title)}”</h2>
      <p class="muted" style="margin:0">This sends a request to the server owner. Nothing downloads automatically.</p>
      <label>Note (optional)<textarea id="rq-note" rows="3" placeholder="e.g. Dub please, or just season 1"></textarea></label>
      <div class="row gap"><button class="btn primary" id="rq-go">Send request</button><button class="btn ghost" id="rq-cancel">Cancel</button></div>`);
    $('#rq-cancel').onclick = () => this.closeModal();
    $('#rq-go').onclick = async () => {
      const b = $('#rq-go'); b.disabled = true; b.textContent = 'Sending…';
      try {
        await Requests.send(anime, $('#rq-note').value.trim());
        this.closeModal(); toast(`Requested ${anime.title}`, 'good');
        this.refresh();
      } catch (e) { b.disabled = false; b.textContent = 'Send request'; toast(e.message, 'bad'); }
    };
  },
};

// Close filter dropdowns when clicking anywhere else.
document.addEventListener('click', (e) => { if (!e.target.closest('.chip-wrap')) document.querySelectorAll('.chip-menu').forEach((x) => { x.hidden = true; }); });

function syncSearchClear() { const b = $('#tb-clear'); if (b) b.hidden = !$('#tb-q').value; }

// Hooks up every <input/select data-set="key"> on the page to App.settings.
function bindSettingInputs() {
  document.querySelectorAll('[data-set]').forEach((el) => {
    el.onchange = async () => {
      const k = el.dataset.set;
      App.settings[k] = el.type === 'checkbox' ? el.checked : ['password', 'text'].includes(el.type) ? el.value.trim() : (isNaN(+el.value) ? el.value : +el.value);
      await App.saveSettings();
      applyAppearance();
      if (k === 'titleLang') App.refresh();
      if (k === 'startFullscreen' || k === 'tvMode') window.native.setFullscreen?.(!!(App.settings.startFullscreen || App.settings.tvMode));
      if (k === 'tvMode' && App.settings.tvMode) TV.startGamepad();
      if (k === 'subSize' || k === 'subStyle') { applySubStyle($('#sub-preview')); applySubStyle($('#player')); }
      toast('Saved', 'good');
      if (App.view === 'profile') App.updateWho();
    };
  });
}

// Account rows like AniView: one row per tracker, always in the same place. The one in use shows your avatar and
// name with Sign out; the other shows its name with Switch. Both stay signed in behind the scenes, so switching
// back never asks you to sign in again.
function trackerRows() {
  const list = [['anilist', 'AniList', AniList, 'anilistLogout'], ['kitsu', 'Kitsu', Kitsu, 'kitsuLogout']];
  const using = Tracker.loggedIn() ? Tracker.svc : null;
  const usingName = Tracker.name;
  const localRow=`<div class="acct-row"><span class="avatar">${icon('deck')}</span><div class="grow"><b>On this device</b><div class="desc">${using===LocalTracker?'Your active list · Saved locally':'Keep a separate AniDeck list without an account'}</div></div>${using===LocalTracker?'<span class="acct-local-note">Stored on this device</span>':'<button class="btn ghost sm" data-act="switchTracker" data-tracker="local">Use local list</button>'}</div>`;
  return localRow+list.map(([id, name, svc, outAct]) => {
    const importReason=!LocalTracker.coll.length?'Your local list is empty. Add titles using On this device first.':!svc.loggedIn()?'Connect '+name+' to import your local titles.':'';
    const importer=`<div class="acct-import-area"><button class="btn ghost sm" data-act="localImport" data-tracker="${id}" ${importReason?'disabled':''}>Review local list for ${name}</button>${importReason?`<small>${esc(importReason)}</small>`:`<small>${LocalTracker.coll.length} title${LocalTracker.coll.length===1?'':'s'} saved on this device · Review new titles or newer local episode progress</small>`}</div>`;
    if (svc === using) {
      return `<div class="acct-row"><span class="avatar">${icon('user', 'pf-ph')}${svc.avatar ? `<img src="${esc(svc.avatar)}" alt="">` : ''}</span>
      <div class="grow"><b>${name}${svc.userName?' · '+esc(svc.userName):''}</b><div class="desc">Your list and progress sync here</div>${importer}</div>
      <button class="btn ghost sm danger-outline" data-act="${outAct}">Sign out</button></div>`;
    }
    return `<div class="acct-row"><span class="avatar">${icon('user', 'pf-ph')}</span>
      <div class="grow"><b>${name}</b><div class="desc">${using ? `Switching keeps you signed in to ${usingName}` : `Sign in to keep your list on ${name}`}</div>${importer}</div>
      <button class="btn ghost sm" data-act="switchTracker" data-tracker="${id}">${svc.loggedIn()?'Use this list':'Connect'}</button></div>`;
  }).join('');
}

function accountProfileCard(){
  const me=Cloud.who===Cloud.ident()?Cloud.me:null;
  return `<section class="acct-access-card" aria-label="AniDeck account access"><span class="acct-access-icon">${icon('signin')}</span><div><span class="ad-eyebrow">ANIDECK ACCOUNT</span><h4>${me?'Signed in as @'+esc(me.handle):'Your account, across devices'}</h4><p>Manage sign-in and your private recovery key. Your local watchlist stays on this device.</p></div><button class="btn ghost" data-act="localRecovery">Sign-in & recovery ${icon('chev')}</button></section>`;
}

function accountRows() {
  return [
    { key: 'jellyfin', name: 'Jellyfin library', on: Jellyfin.connected(), who: `${Jellyfin.userName} · ${Jellyfin.server}` },
    { key: 'kitsu', name: 'Kitsu', on: Kitsu.loggedIn(), who: Kitsu.userName },
    { key: 'anilist', name: 'AniList', on: AniList.loggedIn(), who: AniList.userName },
    ...(Trakt.available() ? [{ key: 'trakt', name: 'Trakt', on: Trakt.loggedIn(), who: Trakt.userName }] : []),
  ];
}

/* ============================ APPEARANCE / KEYS / TV ============================ */
const ACCENTS = { lavender: ['Lavender', '183,168,255'], blue: ['Blue', '125,172,255'], pink: ['Pink', '255,150,205'], teal: ['Teal', '110,215,195'], orange: ['Orange', '255,168,110'] };

// Player shortcuts you can change in Settings → Keyboard. [action, label, default key]
const KEY_ACTIONS = [
  ['playPause', 'Play / pause', 'Space'], ['seekBack', 'Seek back', 'ArrowLeft'], ['seekFwd', 'Seek forward', 'ArrowRight'],
  ['volUp', 'Volume up', 'ArrowUp'], ['volDown', 'Volume down', 'ArrowDown'], ['mute', 'Mute', 'M'], ['fullscreen', 'Fullscreen', 'F'],
  ['skipIntro', 'Skip intro / credits', 'S'], ['skipAhead', 'Skip ahead (+85s)', 'D'], ['next', 'Next episode', 'N'], ['prev', 'Previous episode', 'P'],
  ['slower', 'Slower', '<'], ['faster', 'Faster', '>'], ['episodes', 'Episode list', 'E'], ['search', 'Search (outside the player)', '/'],
];
function keyName(e) {
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}
function keyFor(action) { return App.settings.keys?.[action] || KEY_ACTIONS.find((a) => a[0] === action)?.[2] || ''; }
function keyLabel(k) { return ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc' })[k] || k; }
function actionForKey(e) { const k = keyName(e); return KEY_ACTIONS.find(([a]) => keyFor(a) === k)?.[0] || null; }

function applyAppearance() {
  const s = App.settings;
  document.documentElement.style.setProperty('--accent-rgb', (ACCENTS[s.accent] || ACCENTS.lavender)[1]);
  const uiZoom=s.tvMode?Math.max(1.3,s.uiScale||1):(s.uiScale||1);
  document.body.style.zoom=String(uiZoom);
  document.documentElement.style.setProperty('--ui-zoom',String(uiZoom));
  const poster = { small: 'clamp(130px, 8.5vw, 190px)', medium: 'clamp(150px, 10.5vw, 230px)', large: 'clamp(185px, 13vw, 290px)' }[s.posterSize] || 'clamp(150px, 10.5vw, 230px)';
  document.documentElement.style.setProperty('--poster-w', poster);
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  document.body.classList.toggle('tv-mode', !!s.tvMode);
  document.body.classList.toggle('home-framed', s.homeStyle === 'card');
}

// What's new, shown in Settings → About and once after each update.
const CHANGELOG = [
  { v:'1.0.0', revision:'2026-10-26.8', items:[
    'Make your profile yours with a banner, formatted About me and an optional local-time display.',
    'Choose friends-only messaging, consent-based message requests, or pause incoming messages.',
    'Control social and library alerts in Settings → Notifications.',
    'Faster favorite searches, immediate poster-story loading and page shortcuts that scroll naturally.',
    'Search-first favorite picking, stories on hovered posters, and shortcuts anchored to the page top.',
    'More reliable favorite searches, browsable rating columns, a compact status hand and fixed corner navigation.',
    'Choose and arrange a favorite-anime shelf on your AniDeck profile.',
    'Customize your AniDeck picture, display name and bio; sign in on another device with your private key.',
    'Visible import controls explain connection and local-list requirements in Account settings.',
    'Optional profile setup, AniDeck discussions, safe local-list imports and a separate Jellyfin library.',
    'New title navigation, expandable hover stories and automatic queue recovery.',
    'Start without an account, keep a local watchlist and optionally create an independent AniDeck Friends profile.',
    'A new deck-and-play app icon, replaying loading animation, and navigation that respects your interface size.',
    'A refreshed Home with custom decks, widgets, a release-aware watch queue and useful title previews.',
    'AniDeck Friends: profiles, requests, messages, anime recommendations, watch plans and taste comparisons.',
    'TV playback with PC remote controls, automatic reconnection codes and faster command delivery.',
    'Provider subtitles on the PC and TV, plus intro/recap skipping and episode tracking from TV progress.',
    'Updated player menus, episode navigation and a watchlist editor with direct episode entry.',
    'Cleaner Settings, current AniDeck branding and library options that appear only when Jellyfin is connected.',
    'Fewer Home queue requests, clearer tracker errors and safeguards for account changes.',
  ]},
];
const GITHUB_URL = 'https://github.com/Machoist/anideck';
function releaseNotesKey(){const notes=CHANGELOG.find(c=>c.v===APP_VERSION);return notes?APP_VERSION+':'+notes.revision:null;}
function showWhatsNew() {
  const notes=CHANGELOG.find(c=>c.v===APP_VERSION),test=!!App.config?.testBuild;
  const list=notes?`<ul class="wn-changes">${notes.items.map(item=>`<li><span aria-hidden="true">${icon('checkCircle')}</span><p>${esc(item)}</p></li>`).join('')}</ul>`:'<p class="muted">Release notes aren’t available for this version yet.</p>';
  App.modal(`<section class="wn-panel"><header class="wn-heading"><div><span class="ad-eyebrow">YOUR DECK, UPDATED</span><h2>What’s new</h2><p>Version ${esc(APP_VERSION)}${test?' · Test build':''}</p></div><button class="icon-btn" id="wn-close" aria-label="Close What’s new">${icon('close')}</button></header>${test?'<p class="wn-test-note">You’re viewing the changes included in this test build.</p>':''}<div class="wn">${list}</div><footer><button class="btn ghost" id="wn-project">Project on GitHub ${icon('external')}</button><button class="btn primary" id="wn-done">Got it</button></footer></section>`,'wn-modal');
  $('#wn-close').onclick=$('#wn-done').onclick=()=>App.closeModal();
  $('#wn-project').onclick=()=>window.native.openExternal(GITHUB_URL);
  const key=releaseNotesKey();if(key)window.native.set('seenReleaseNotes',key).catch(()=>{});
}
async function maybeShowWhatsNew() {
  const key=releaseNotesKey();if(!key)return;
  const seen=await window.native.get('seenReleaseNotes'),legacy=await window.native.get('seenVersion');
  if(!seen&&!legacy){await window.native.set('seenReleaseNotes',key);return;}
  if(seen===key)return;
  setTimeout(()=>{if($('#modal')?.hidden===false||$('#player')?.hidden===false)return;showWhatsNew();},1800);
}

/* ---------- TV / big-screen: arrow-key + controller navigation ---------- */
const TV = {
  focusables() {
    const root = !$('#modal').hidden ? $('#modal') : !$('#player').hidden ? $('#player') : $('#shell');
    return [...root.querySelectorAll('button, a[href], input, select, [tabindex="0"]')].filter((el) => {
      if (el.disabled || el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight + 400;
    });
  },
  move(dir) {
    const els = this.focusables();
    const cur = document.activeElement && els.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { (els.find((e) => e.closest('#main')) || els[0])?.focus(); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
      if (!ok) continue;
      const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = main + side * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: App.settings.reduceMotion ? 'auto' : 'smooth' }); }
  },
  back() {
    if (!$('#modal').hidden) return App.closeModal();
    if (!$('#player').hidden) return Player.close();
    App.back();
  },
  // Shared directional navigation for remote controls and controllers.
  remote(key) {
    const inPlayer = !$('#player').hidden && $('#modal').hidden && !$('#p-drawer').classList.contains('open');
    const step = App.settings.seekStep || 10;
    if (['up', 'down', 'left', 'right'].includes(key)) {
      if (inPlayer) {
        Player.wake?.();
        if (key === 'left') Player.seekBy(-step); else if (key === 'right') Player.seekBy(step);
        else { const v = Player.video; v.volume = Math.max(0, Math.min(1, v.volume + (key === 'up' ? 0.05 : -0.05))); Player.syncVol(); }
      } else this.move(key);
    } else if (key === 'select') { if (inPlayer) Player.toggle(); else document.activeElement?.click(); }
    else if (key === 'back') this.back();
    else if (key === 'home') { if (!$('#player').hidden) Player.close(); App.nav('home'); }
    else if (!$('#player').hidden) {
      Player.wake?.();
      if (key === 'playpause') Player.toggle();
      else if (key === 'seekback') Player.seekBy(-step);
      else if (key === 'seekfwd') Player.seekBy(step);
      else if (key === 'prev') Player.playPrev();
      else if (key === 'next') Player.playNext();
    }
  },
  // Controller: D-pad / left stick move, A select, B back, Start play/pause, LB/RB previous/next episode, X skip intro.
  startGamepad() {
    if (this.padTimer) return;
    const held = {};
    let stickAt = 0;
    const press = (id, fn) => { if (!held[id]) { held[id] = true; fn(); } };
    const release = (id) => { held[id] = false; };
    const tick = () => {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      const p = pads[0];
      if (p && App.settings.gamepad !== false) {
        const btn = (i) => !!p.buttons[i]?.pressed;
        const inPlayer = !$('#player').hidden && $('#modal').hidden && !$('#p-drawer').classList.contains('open');
        const dirs = { up: btn(12), down: btn(13), left: btn(14), right: btn(15) };
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (Date.now() - stickAt > 220) {
          if (ax < -0.6) { dirs.left = true; stickAt = Date.now(); } else if (ax > 0.6) { dirs.right = true; stickAt = Date.now(); }
          else if (ay < -0.6) { dirs.up = true; stickAt = Date.now(); } else if (ay > 0.6) { dirs.down = true; stickAt = Date.now(); }
        }
        for (const [d, on] of Object.entries(dirs)) {
          if (!on) { release(d); continue; }
          press(d, () => {
            if (inPlayer) {
              Player.wake?.();
              if (d === 'left') Player.seekBy(-(App.settings.seekStep || 10)); else if (d === 'right') Player.seekBy(App.settings.seekStep || 10);
              else { const v = Player.video; v.volume = Math.max(0, Math.min(1, v.volume + (d === 'up' ? 0.05 : -0.05))); Player.syncVol(); }
            } else this.move(d);
          });
          if (ax || ay) release(d); // stick repeats on its own timer
        }
        btn(0) ? press('a', () => { if (inPlayer) Player.toggle(); else document.activeElement?.click(); }) : release('a');
        btn(1) ? press('b', () => this.back()) : release('b');
        btn(9) ? press('start', () => { if (!$('#player').hidden) Player.toggle(); }) : release('start');
        btn(2) ? press('x', () => { if (!$('#player').hidden) Player.skipSegment(); }) : release('x');
        btn(4) ? press('lb', () => { if (!$('#player').hidden) Player.playPrev(); }) : release('lb');
        btn(5) ? press('rb', () => { if (!$('#player').hidden) Player.playNext(); }) : release('rb');
      }
      this.padTimer = requestAnimationFrame(tick);
    };
    this.padTimer = requestAnimationFrame(tick);
  },
  init() {
    window.addEventListener('gamepadconnected', () => { this.startGamepad(); toast('Controller connected', 'good'); });
    document.addEventListener('keydown', (e) => {
      if (!App.settings.tvMode || !$('#player').hidden) return;
      if (e.target.matches('input, textarea, select') && !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (dir) { e.preventDefault(); this.move(dir); }
      else if (e.key === 'Backspace' && !e.target.matches('input, textarea')) { e.preventDefault(); this.back(); }
    });
  },
};

// Settings → Home screen → "Shuffle picks from": what the shuffle button in the top bar picks.
const SHUFFLE_FROM = [
  ['planning', 'Your Planning list, or something popular if it’s empty', 'Planning list'],
  ['popular', 'Popular shows you haven’t seen', 'Popular shows you haven’t seen'],

];
function shuffleLabel(v, short = false) {
  const source=(v==='watching'?'planning':v||'library');const effective=source==='library'?'planning':source;
  const hit = SHUFFLE_FROM.find(([k]) => k === effective) || SHUFFLE_FROM[0];
  return short ? hit[2] : hit[1];
}
// Radio list dialog, like the list editor: click a choice and it saves.
function pickShuffleSource() {
  document.getElementById('entry-pop')?.remove();
  const cur = App.shuffleSource();
  const scrim = document.createElement('div');
  scrim.id = 'entry-pop'; scrim.className = 'entry-scrim';
  scrim.innerHTML = `<div class="entry-pop radio-pop" role="dialog" aria-modal="true" aria-label="Shuffle picks from">
    <h2>Shuffle picks from</h2>
    <div class="radio-list" role="radiogroup">${SHUFFLE_FROM.filter(([k])=>k!=='library'||Jellyfin.connected()).map(([k, label]) => `<button class="radio-row ${k === cur ? 'on' : ''}" role="radio" aria-checked="${k === cur}" data-v="${k}"><span class="radio-dot"></span><span>${esc(label)}</span></button>`).join('')}</div>
  </div>`;
  document.body.appendChild(scrim);
  document.body.classList.add('modal-open');
  const close = () => { scrim.remove(); document.body.classList.remove('modal-open'); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  scrim.onmousedown = (e) => { if (e.target === scrim) close(); };
  scrim.querySelector('.radio-row.on')?.focus({ preventScroll: true });
  scrim.querySelectorAll('.radio-row').forEach((b) => {
    b.onclick = async () => {
      App.settings.shuffleFrom = b.dataset.v;
      await App.saveSettings();
      close();
      const lbl = $('#shuffle-cur');
      if (lbl) lbl.textContent = shuffleLabel(b.dataset.v, true);
    };
  });
}
// A random popular anime that isn't already on your list (completed, watching, dropped…).
async function popularUnwatchedPool() {
  const [page, mine] = await Promise.all([
    Kitsu.browse({ sort: 'popular' }, Math.floor(Math.random() * 25) * 20, 20).then((r) => r.items).catch(() => []),
    Tracker.loggedIn() ? Tracker.list('', 0, 500).then((r) => r.entries).catch(() => []) : [],
  ]);
  const onList = new Set();
  for (const e of mine) { if (!e.anime || e.status === 'planned') continue; onList.add(String(e.anime.id)); for (const t of e.anime.titles || []) if (titleKey(t)) onList.add(titleKey(t)); }
  const fresh = sfw(page).filter((a) => !onList.has(String(a.id)) && !(a.titles || []).some((t) => onList.has(titleKey(t))));
  const pool = fresh.length ? fresh : sfw(page);
  return pool;
}

/* ================================ ROW ARROWS ================================ */
// Rows scroll with arrow buttons instead of scrollbars.
function updateRailArrows(root = document) {
  root.querySelectorAll('.rail-wrap').forEach((w) => {
    const r = w.querySelector('.rail');
    const max = r.scrollWidth - r.clientWidth;
    w.querySelector('.rail-arrow.left').hidden = r.scrollLeft <= 4;
    w.querySelector('.rail-arrow.right').hidden = r.scrollLeft >= max - 4;
  });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('.rail-arrow');
  if (!a) return;
  e.stopPropagation();
  const r = a.parentElement.querySelector('.rail');
  r.scrollBy({ left: (a.classList.contains('left') ? -1 : 1) * r.clientWidth * 0.85, behavior: 'smooth' });
}, true);
document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('rail')) updateRailArrows(e.target.parentElement.parentElement); }, true);
window.addEventListener('resize', () => updateRailArrows());

/* ================================ NOTIFICATIONS ================================ */
// Keeps a small list of notifications on this PC:
//  - a new episode was added for a show you've started watching
//  - a show you requested is now in the library
const Notifier = {
  list: [], timer: null,

  async start() {
    this.list = (await window.native.get('notifications')) || [];
    this.render();
    this.check();
    clearInterval(this.timer);
    this.timer = setInterval(async () => { if(['library','show','movie'].includes(App.view))await App.refreshLibrary(); this.check(); }, 15 * 60 * 1000);
  },

  async save() { await window.native.set('notifications', this.list.slice(0, 60)); },
  unread() { return this.list.filter((n) => (typeof NotificationPrefs==='undefined'||NotificationPrefs.allows(n.type))&&!n.read&&(!n.owner||n.owner===Cloud.ident())).length; },

  async check() {
    if(!['library','show','movie'].includes(App.view))return;
    let fresh = [];
    const known = new Set(this.list.map((n) => n.key));
    let since = await window.native.get('notifSince');
    if (!since) since = new Date(Date.now() - 3 * 86400000).toISOString(); // first run: last 3 days only

    // 1) New episodes for shows you've started
    try {
      const started = new Set(App.allItems.filter((x) => x.Type === 'Series' && (
        x.UserData?.PlayedPercentage > 0 || (x.RecursiveItemCount && x.UserData?.UnplayedItemCount < x.RecursiveItemCount)
      )).map((x) => x.Id));
      const eps = await Jellyfin.recentEpisodes();
      for (const ep of eps) {
        if (!ep.DateCreated || ep.DateCreated <= since) continue;
        if (ep.UserData?.Played || !started.has(ep.SeriesId)) continue;
        const key = `ep:${ep.Id}`;
        if (known.has(key)) continue;
        fresh.push({ key, type: 'episode', title: ep.SeriesName, body: `New: ${epLabel(ep)}`, img: Jellyfin.img(ep.SeriesId, 'Primary', { fillHeight: 160 }), act: 'play', id: ep.Id, series: ep.SeriesId, at: Date.now() });
      }
    } catch { /* offline - try later */ }

    // 2) Requests that are now in the library
    try {
      for (const r of await Requests.list()) {
        const key = `req:${r.kitsuId}`;
        if (known.has(key)) continue;
        const hit = App.requestHit(r);
        if (hit) Requests.markAdded(r.kitsuId);
        if (hit) fresh.push({ key, type: 'request', title: r.title, body: 'Your request was added to the library', img: r.poster, act: 'series', id: hit.Id, at: Date.now() });
      }
    } catch { /* ignore */ }

    if(typeof NotificationPrefs!=='undefined')fresh=fresh.filter(n=>NotificationPrefs.allows(n.type));
    await window.native.set('notifSince', new Date().toISOString());
    if (!fresh.length) return;
    this.list = [...fresh, ...this.list];
    await this.save();
    this.render();
    // Windows notification (one summary if several arrive at once)
    if(typeof NotificationPrefs!=='undefined'&&!NotificationPrefs.prefs.desktop)return;
    try {
      const n = fresh.length === 1
        ? new Notification(fresh[0].title, { body: fresh[0].body, silent: false })
        : new Notification('AniDeck', { body: `${fresh.length} new updates: ${fresh.slice(0, 3).map((f) => f.title).join(', ')}${fresh.length > 3 ? '…' : ''}` });
      n.onclick = () => { this.open(fresh[0]); };
    } catch { /* notifications blocked */ }
  },

  // `opening`: the panel was just opened, so its rows deal in one after another (other redraws don't replay that).
  render(opening = false) {
    const c = this.unread(), badge = $('#bell-count');
    const was = Number(badge.dataset.n || 0);
    badge.dataset.n = String(c);
    badge.hidden = !c; badge.textContent = c > 9 ? '9+' : String(c);
    // Something new: the bell swings and the badge pops.
    if (c > was) {
      const bell = $('#tb-bell');
      for (const el of [bell, badge]) { el?.classList.remove('ring'); void el?.offsetWidth; el?.classList.add('ring'); }
    }
    const panel = $('#notif-panel');
    if (panel.hidden) return;
    panel.classList.toggle('fresh', opening);
    const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
    const kind = (n) => (n.type==='message'?['Message','chat']:n.type==='invite'?['Watch invitation','clock']:n.type==='message-request'?['Message request','chat']:n.type === 'friend' ? ['Friend request','user'] : n.type === 'request' ? ['Request ready', 'checkCircle'] : ['New episode', 'play']);
    // Filter tabs (All / Episodes / Requests), then the list grouped by day.
    const filter = this.filter || 'all';
    const visible=this.list.filter(n=>(!n.owner||n.owner===Cloud.ident())&&(typeof NotificationPrefs==='undefined'||NotificationPrefs.allows(n.type)));const counts = { all: visible.length, episode: visible.filter(n=>n.type==='episode').length, request: visible.filter(n=>n.type==='request').length, friend:visible.filter(n=>n.type==='friend').length };
    const shown = this.list.map((n, i) => [n, i]).filter(([n])=>(!n.owner||n.owner===Cloud.ident())&&(typeof NotificationPrefs==='undefined'||NotificationPrefs.allows(n.type))).filter(([n]) => filter === 'all' || n.type === filter);
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const group = (t) => (t >= +day0 ? 'Today' : t >= +day0 - 86400000 ? 'Yesterday' : 'Earlier');
    let last = '', k = 0;
    const rows = shown.map(([n, i]) => {
      const g = group(n.at), head = g !== last ? `<div class="n-group">${g}</div>` : ''; last = g;
      return `${head}<div class="notif ${n.read ? '' : 'unread'}" role="button" tabindex="0" data-i="${i}" style="--i:${Math.min(k++, 12)}">
          <span class="n-art">${n.img ? `<img src="${esc(n.img)}" alt="">` : '<span class="ph">◆</span>'}<i class="n-kind" title="${kind(n)[0]}">${icon(kind(n)[1], kind(n)[1] === 'play' ? 'fill' : '')}</i></span>
          <span class="n-text"><span class="n-title">${esc(n.title)}</span><span class="n-body">${esc(n.body)}</span><span class="n-time">${esc(kind(n)[0])} · ${ago(n.at)}</span></span>
          <span class="n-acts">${n.act === 'play' ? `<button class="n-act play" data-n="play" data-i="${i}" title="Play now">${icon('play', 'fill')}</button>` : ''}<button class="n-act" data-n="read" data-i="${i}" title="${n.read ? 'Mark unread' : 'Mark read'}">${icon(n.read ? 'bell' : 'check')}</button><button class="n-act" data-n="dismiss" data-i="${i}" title="Dismiss">${icon('close')}</button></span>
        </div>`;
    }).join('');
    const tabs = this.list.length ? `<div class="n-tabs" role="tablist">${[['all', 'All'], ['episode', 'Episodes'], ['request', 'Requests'],['friend','Friends']].filter(([v]) => v === 'all' || counts[v]).map(([v, l]) => `<button class="n-tab ${filter === v ? 'on' : ''}" data-filter="${v}" role="tab" aria-selected="${filter === v}">${l}<small>${counts[v]}</small></button>`).join('')}</div>` : '';
    panel.innerHTML = `<div class="notif-head"><span class="n-bell">${icon('bell')}</span><b>Notifications</b>${c ? `<span class="notif-new">${c} new</span>` : ''}<span class="spacer"></span>
        ${this.list.length ? `${c ? `<button class="notif-tool" id="n-read" title="Mark all read">${icon('check')}<span>Read all</span></button>` : ''}<button class="notif-tool" id="n-clear" title="Clear all">${icon('trash')}<span>Clear</span></button>` : ''}</div>
      ${tabs}
      ${this.list.length ? `<div class="notif-list">${rows || '<div class="n-none">Nothing in this filter.</div>'}</div>`
        : `<div class="notif-empty"><span class="notif-empty-bell" aria-hidden="true">${icon('bell')}</span><b>You’re all caught up</b><span>New episodes of shows you watch and finished requests land here.</span></div>`}
      <div class="notif-foot"><button class="link-btn" data-n="schedule">${icon('calendar')}See what’s airing this week</button></div>`;
    // One handler for the panel; it keeps clicks from reaching the "click outside closes" listener (rows get redrawn).
    panel.onclick = async (e) => {
      const tab = e.target.closest('[data-filter]'), act = e.target.closest('[data-n]'), row = e.target.closest('.notif');
      if (tab) { e.stopPropagation(); this.filter = tab.dataset.filter; return this.render(); }
      if (act) {
        e.stopPropagation();
        const n = this.list[Number(act.dataset.i)];
        if (act.dataset.n === 'schedule') { this.close(); return App.nav('schedule'); }
        if (act.dataset.n === 'play' && n) return this.open(n);
        if (act.dataset.n === 'read' && n) { n.read = !n.read; await this.save(); return this.render(); }
        if (act.dataset.n === 'dismiss' && n) {
          const el = act.closest('.notif'); el?.classList.add('gone');
          setTimeout(async () => { this.list = this.list.filter((x) => x !== n); await this.save(); this.render(); }, 220);
          return;
        }
      }
      if (row) this.open(this.list[Number(row.dataset.i)]);
    };
    panel.onkeydown = (e) => { const row = e.target.closest?.('.notif'); if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); this.open(this.list[Number(row.dataset.i)]); } };
    // Read all: the unread dots shrink away first. Clear: the rows sweep off one after another, then the empty state.
    if ($('#n-read')) $('#n-read').onclick = async (e) => { e.stopPropagation(); panel.classList.add('reading'); this.list.forEach((n) => (n.read = true)); await this.save(); setTimeout(() => { panel.classList.remove('reading'); this.render(); }, 320); };
    if ($('#n-clear')) $('#n-clear').onclick = async (e) => {
      e.stopPropagation();
      const rows = panel.querySelectorAll('.notif');
      panel.classList.add('clearing');
      this.list = []; await this.save();
      setTimeout(() => { panel.classList.remove('clearing'); this.render(); }, Math.min(rows.length, 8) * 40 + 300);
    };
  },

  toggle() { const p = $('#notif-panel'); if (p.hidden || p.classList.contains('closing')) { clearTimeout(this.closeTimer); p.classList.remove('closing'); p.hidden = false; this.render(true); } else this.close(); },
  // Folds back down into the bell, then hides.
  close() {
    const p = $('#notif-panel');
    if (!p || p.hidden || p.classList.contains('closing')) return;
    p.classList.add('closing');
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => { p.hidden = true; p.classList.remove('closing'); }, 170);
  },

  async open(n) {
    if (!n) return;
    n.read = true; await this.save();
    this.close(); this.render();
    if(n.act==='messageRequests'){if(n.owner&&n.owner!==Cloud.ident())return;return App.act('messageRequests',{});}
    if(n.act==='friendsThread'){if(n.owner&&n.owner!==Cloud.ident())return;return App.nav('friends',{handle:n.handle});}
    if(n.act==='friendsRequests'){if(n.owner&&n.owner!==Cloud.ident())return;await App.nav('friends');return Friends.requestsDialog();}
    if (n.act === 'play') App.playEpisode(n.id, n.series); else App.openItem(n.id);
  },
};

/* ================================ RENDER HELPERS ================================ */
// Rating badge for a library show/movie: score of its Kitsu match (filled in live), else Jellyfin's rating.
function posterRating(s, season = 1) {
  const kid = App.matches?.[`${s.Id}:${season}`]?.id;
  if (kid) return `<span class="badge right rating" data-rate="${esc(kid)}" hidden></span>`;
  return s.CommunityRating && season <= 1 ? `<span class="badge right rating">★ ${Math.round(s.CommunityRating * 10)}%</span>` : '';
}
// Name of a library entry: the show itself, or one of its seasons ("Kaiju No. 8 Season 2", the Kitsu title once matched).
function entryTitle({ item, season, seasonItem }) {
  if (!seasonItem || season === 1) return item.Name;
  if (season === 0) return `${item.Name}: Specials`;
  const m = App.matches?.[`${item.Id}:${season}`];
  if (m && !m.none && m.title) return m.title;
  return !seasonItem.Name || /^season\s*\d+$/i.test(seasonItem.Name) ? `${item.Name} Season ${season}` : `${item.Name}: ${seasonItem.Name}`;
}
const entryYear = ({ item, seasonItem }) => seasonItem?.ProductionYear || Number((seasonItem?.PremiereDate || '').slice(0, 4)) || item.ProductionYear || 0;
// Takes a library entry ({ item, season, seasonItem }) or a plain Jellyfin item.
function posterCard(e) {
  if (!e.item) e = { item: e };
  const { item: s, season, seasonItem: si } = e;
  const pct = s.Type === 'Movie' ? s.UserData?.PlayedPercentage : 0;
  const imgId = si?.ImageTags?.Primary ? si.Id : s.ImageTags?.Primary ? s.Id : null;
  const cover = Art.coverFor(s.Id, si ? season : 1); // AniList's cover for this season, when known
  const src = cover || (imgId ? Jellyfin.img(imgId, 'Primary', { fillHeight: 420 }) : '');
  const sub = [entryYear(e) || '', s.Type === 'Movie' ? 'Movie' : si ? (season === 0 ? 'Specials' : `Season ${season}`) : ''];
  return `<button class="card" data-act="${s.Type === 'Movie' ? 'movie' : 'series'}" data-id="${esc(s.Id)}" ${si ? `data-season="${esc(season)}"` : ''}>
    <div class="poster">${src ? `<img loading="lazy" src="${esc(src)}" alt="">` : `<div class="ph">◆</div>`}
      ${posterRating(s, season ?? 1)}
      ${pct ? `<div class="bar"><div style="width:${Math.round(pct)}%"></div></div>` : ''}</div>
    <div class="card-title">${esc(entryTitle(e))}</div>
    <div class="card-sub">${esc(sub.filter(Boolean).join(' · '))}</div>
  </button>`;
}

function episodeCard(ep) {
  const pct = ep.UserData?.PlayedPercentage;
  if (ep.Type === 'Movie') {
    const img = ep.BackdropImageTags?.length ? Jellyfin.img(ep.Id, 'Backdrop', { fillWidth: 560 }) : Jellyfin.img(ep.Id, 'Primary', { fillWidth: 560 });
    return `<button class="card" data-act="playMovie" data-id="${esc(ep.Id)}">
      <div class="thumb"><img loading="lazy" src="${esc(img)}" alt="">${pct ? `<div class="bar"><div style="width:${Math.round(pct)}%"></div></div>` : ''}</div>
      <div class="card-title">${esc(ep.Name)}</div>
      <div class="card-sub">${esc([ep.ProductionYear, 'Movie'].filter(Boolean).join(' · '))}</div>
    </button>`;
  }
  const img = ep.ImageTags?.Primary ? Jellyfin.img(ep.Id, 'Primary', { fillWidth: 560 })
    : ep.ParentThumbItemId ? Jellyfin.img(ep.ParentThumbItemId, 'Thumb', { fillWidth: 560 })
    : ep.ParentBackdropItemId ? Jellyfin.img(ep.ParentBackdropItemId, 'Backdrop', { fillWidth: 560 })
    : Jellyfin.img(ep.SeriesId, 'Backdrop', { fillWidth: 560 });
  return `<button class="card" data-act="play" data-id="${esc(ep.Id)}" data-series="${esc(ep.SeriesId)}">
    <div class="thumb"><img loading="lazy" src="${esc(img)}" alt="">
      ${pct ? `<div class="bar"><div style="width:${Math.round(pct)}%"></div></div>` : ''}</div>
    <div class="card-title">${esc(ep.SeriesName)}</div>
    <div class="card-sub">${esc(epLabel(ep))}</div>
  </button>`;
}

function animeCard(a, extra = '', entry = null) {
  const inLib = App.libIndex?.find(a);
  const badge = (inLib ? '<span class="badge in">In library</span>' : '') + (a.rating ? `<span class="badge right rating">★ ${a.rating}%</span>` : `<span class="badge right rating" data-rate="${esc(a.id)}" hidden></span>`);
  return `<article class="card ta-card" tabindex="0" role="link" ${entry?`data-list-status="${esc(entry.status||'current')}" data-list-progress="${Number(entry.progress)||0}"`: ''} data-synopsis="${esc(String(a.synopsis||'').slice(0,4000))}" data-story-meta="${esc([a.subtype,a.year,a.episodes?a.episodes+' eps':''].filter(Boolean).join(' · '))}" data-total="${Number(a.episodes)||0}" data-act="anime" data-id="${esc(a.id)}" data-mal="${esc(a.malId || '')}" data-titles="${esc(JSON.stringify(a.titles))}">
    <div class="poster">${a.poster ? `<img loading="lazy" src="${esc(a.poster)}" alt="">` : '<div class="ph">◆</div>'}${badge}<span class="ta-overlay"><button type="button" class="ta-play" data-ta="play" aria-label="Play next episode" data-tip="Play next episode">${icon('play','fill')}</button><button type="button" class="ta-more" data-ta="menu" aria-label="More actions for ${esc(a.title)}">${icon('more')}</button></span></div>
    <div class="card-title">${esc(a.title)}</div>
    <div class="card-sub">${esc(extra || [a.subtype, a.year].filter(Boolean).join(' · '))}</div>
  </article>`;
}

const STATUS_LABELS = { current: 'Watching', planned: 'Planning', completed: 'Completed', on_hold: 'Paused', dropped: 'Dropped' };

// Covers fade in once fully loaded instead of being drawn half-downloaded (styles.css: img:not(.ready)).
// load/error don't bubble, so listen in the capture phase for every <img> on the page.
for (const ev of ['load', 'error']) document.addEventListener(ev, (e) => { if (e.target?.tagName === 'IMG') e.target.classList.add('ready'); }, true);
// Warm up connections to where covers come from, so the first images don't wait on DNS + TLS.
function preconnectImageHosts() {
  for (const url of ['https://media.kitsu.app', 'https://s4.anilist.co', Jellyfin.server]) {
    try {
      const origin = new URL(url).origin;
      if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) continue;
      const l = document.createElement('link'); l.rel = 'preconnect'; l.href = origin; l.crossOrigin = '';
      document.head.appendChild(l);
    } catch { /* no server yet */ }
  }
}

// Library episodes Jellyfin has no image for: use Kitsu's still for that episode instead of the show's backdrop.
function setEpisodeThumb(row,sources){
 const thumb=row.querySelector('.thumb'),img=thumb?.querySelector('img');if(!img||!row.isConnected)return;
 const fallback=thumb.dataset.fallback;if(fallback){thumb.style.backgroundImage='url('+JSON.stringify(fallback)+')';thumb.style.backgroundSize='cover';thumb.style.backgroundPosition='center';}
 const candidates=[...new Set([...sources,thumb.dataset.poster].filter(Boolean))],key=JSON.stringify(candidates);if(img._thumbKey===key)return;img._thumbKey=key;img._thumbFailed??=new Set();
 const next=()=>{if(!row.isConnected||img._thumbKey!==key)return;const url=candidates.find(u=>!img._thumbFailed.has(u));if(!url){img.style.visibility='hidden';return;}img.hidden=false;img.style.visibility='';
 img.onload=()=>{if(row.isConnected&&img._thumbKey===key)img.classList.add('ready');};img.onerror=()=>{img._thumbFailed.add(url);img.classList.remove('ready');next();};
 if(img.getAttribute('src')!==url){img.classList.remove('ready');img.src=url;}if(img.complete&&img.naturalWidth)img.classList.add('ready');};next();thumb.classList.remove('skel');
}
async function fillMissingThumbs(rid) {
  const rows = [...document.querySelectorAll('.ep-list .ep[data-kthumb]')];
  const kid = App.showCtx?.match?.id;
  if (!rows.length || !kid) return;
  const nums = rows.map((r) => Number(r.dataset.kthumb));
  const from = Math.min(...nums) - 1, count = Math.max(...nums) - from;
  const [eps, zip] = await Promise.all([Kitsu.episodes(kid, Math.min(count, 200), from).catch(() => []), AniZip.get(App.showAl?.id)]);
  if (App.stale(rid)) return;
  const byNum = new Map(eps.map((e) => [e.number, e.thumb]));
  for (const r of rows) {
    const n = Number(r.dataset.kthumb), src = zip?.episodes?.[n]?.image || byNum.get(n) || App.showAl?.streams?.[n]?.thumb, img = r.querySelector('.thumb img');
    if (src && img) { img.classList.remove('ready'); img.src = src; }
  }
}

// Title-page backdrop. The page opens with the quick first guess (usually AniList's banner); this then tries every
// source in order of preference (AniList banner, Kitsu's original cover, fanart.tv/TMDB fanart, your library's backdrop),
// measures each, and fades in the first one that's sharp enough for the hero at this window size and screen scaling.
// AniList banners are only ~1900×400, so on most screens a taller image wins. If none is sharp enough, the sharpest does.
const bgChoice = new Map(); // sources key -> picked url, so revisits don't re-measure
// Original-resolution backdrops (often 4K) for a show in your library, best first: every backdrop Jellyfin has for it
// (with real sizes) and every backdrop your server's image providers know (TMDB, fanart.tv, TheTVDB). Textless art
// first, then the biggest. Kept for a week. Shows outside your library use their AniList banner instead.
const HDArt = {
  mem: new Map(), disk: null, saveTimer: null, noRemote: false, TTL: 7 * 86400000,
  async load() { if (!this.disk) this.disk = (await window.native.get('hdArt').catch(() => null)) || {}; },
  persist() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => window.native.set('hdArt', this.disk), 1000); },
  backdrops({ seriesId = null } = {}) {
    if (!seriesId) return Promise.resolve([]);
    const key = String(seriesId);
    if (this.mem.has(key)) return this.mem.get(key);
    const p = (async () => {
      await this.load();
      const hit = this.disk[key];
      if (hit && Date.now() - hit.at < this.TTL) return hit.urls;
      const found = [];
      if (seriesId && Jellyfin.connected()) {
        try {
          for (const im of (await Jellyfin.call(`/Items/${seriesId}/Images`)) || []) {
            if (im.ImageType === 'Backdrop' && im.Width) found.push({ u: Jellyfin.img(seriesId, `Backdrop/${im.ImageIndex ?? 0}`, { maxWidth: 3840 }), w: im.Width, h: im.Height, lang: null, own: 1 });
          }
        } catch { /* older server */ }
        if (!this.noRemote) {
          try {
            const r = await Jellyfin.call(`/Items/${seriesId}/RemoteImages${qs({ type: 'Backdrop', includeAllLanguages: true, limit: 40 })}`);
            for (const im of r?.Images || []) if (im.Url && im.Width) found.push({ u: im.Url, w: im.Width, h: im.Height, lang: im.Language || null, votes: im.VoteCount || 0 });
          } catch (e) { if (/40[13]|forbidden|unauthori/i.test(e.message || '')) this.noRemote = true; } // needs an admin account
        }
      }
      const urls = [...new Map(found.filter((x) => x.w >= 1920 && x.w / x.h >= 1.6)
        .sort((a, b) => (a.lang ? 1 : 0) - (b.lang ? 1 : 0) || b.w - a.w || (b.own || 0) - (a.own || 0) || (b.votes || 0) - (a.votes || 0))
        .map((x) => [x.u, x])).keys()].slice(0, 3);
      this.disk[key] = { at: Date.now(), urls };
      this.persist();
      return urls;
    })().catch(() => []);
    this.mem.set(key, p);
    return p;
  },
};

// Kitsu's wide cover for a show outside your library (often 3000+ px wide; sharper than AniList's 1900×400 banner),
// by Kitsu id or through ani.zip's AniList → Kitsu mapping.
const kitsuCoverCache = new Map();
// Banners for shows outside your library come from the tracker you use: AniList's banner, or Kitsu's wide cover.
// If that one is missing (or a Kitsu cover is too small or oddly shaped), the other is used instead.
const trackerBanner = () => (typeof Tracker !== 'undefined' && Tracker.svc === AniList ? 'anilist' : 'kitsu');
const bannerPref = () => trackerBanner();
const kitsuCoverOk = (d) => !!d && d.w >= 1800 && d.w / d.h >= 2.2 && d.w / d.h <= 5.4;
const bannerSrcOf = new Map(); // picked banner url -> 'kitsu' | 'anilist', for the pill
async function setBannerPref(alId, src) {
  const map = { ...(App.settings.bannerSource || {}) };
  if (src === 'anilist') map[`al:${alId}`] = 'anilist'; else delete map[`al:${alId}`];
  App.settings.bannerSource = map;
  await App.saveSettings();
  kitsuCoverCache.clear(); bgChoice.clear(); if (typeof queueArtCache !== 'undefined') queueArtCache.clear();
}
// The small pill on a banner: which source it is, and a click to use the other one.
function bannerPill(alId, using) {
  return ''; // the banner follows your tracker now, so there's nothing to switch per show
  if (!alId || !using) return '';
  const other = using === 'kitsu' ? 'AniList' : 'Kitsu';
  return `<button class="banner-src" data-act="bannerSrc" data-al="${esc(alId)}" data-to="${using === 'kitsu' ? 'anilist' : 'kitsu'}" title="Use ${other}’s banner for this show">${icon('refresh')}<span>${using === 'kitsu' ? 'Kitsu' : 'AniList'} banner</span><em>Use ${other}</em></button>`;
}
function kitsuCover({ kitsuId = null, alId = null, any = false } = {}) { // any: even when AniList is your tracker (no AniList banner)
  const k = kitsuId ? `k${kitsuId}` : alId ? `a${alId}` : '';
  if (!k || (!any && trackerBanner() === 'anilist')) return Promise.resolve('');
  if (!kitsuCoverCache.has(k)) {
    kitsuCoverCache.set(k, (async () => {
      const id = kitsuId || (await AniZip.get(alId))?.kitsu;
      return id ? (await Kitsu.animeFull(id))?.coverHd || '' : '';
    })().catch(() => ''));
  }
  return kitsuCoverCache.get(k);
}

async function upgradeBackdrop(rid) {
  const bg = document.querySelector('#main .detail-hero .hero-bg[data-bgs]');
  if (!bg) return;
  const cfg = JSON.parse(bg.dataset.bgs || '{}');
  const key = bg.dataset.bgs;
  const fade = (url) => {
    if (!url || App.stale(rid) || bg.style.backgroundImage.includes(url)) return;
    const img = document.createElement('img');
    img.className = 'hero-bg-img'; img.alt = ''; img.src = url;
    img.onload = () => requestAnimationFrame(() => img.classList.add('on'));
    bg.appendChild(img);
  };
  if (bgChoice.has(key)) {
    const u = bgChoice.get(key), using = cfg.pill ? (u === cfg.kitsu ? 'kitsu' : u === cfg.alBanner ? 'anilist' : '') : '';
    const hero = bg.closest?.('.detail-hero');
    if (hero && using && !hero.querySelector('.banner-src')) hero.insertAdjacentHTML('beforeend', bannerPill(cfg.alId, using));
    return fade(u);
  }
  // Let the poster and episode thumbnails load first; this is a nice-to-have.
  await new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(res, { timeout: 1500 }) : setTimeout(res, 400)));
  if (App.stale(rid)) return;
  const measure = (u) => new Promise((res) => {
    const i = new Image(), t = setTimeout(() => res(null), 6000);
    i.onload = () => { clearTimeout(t); res({ u, w: i.naturalWidth, h: i.naturalHeight }); };
    i.onerror = () => { clearTimeout(t); res(null); };
    i.src = u;
  });
  const r = bg.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const score = (d) => Math.min(d.w / (r.width * dpr), d.h / (r.height * dpr)); // 1 = exactly enough pixels
  // One image at a time, best-looking first, stopping at the first sharp one, so it never competes with the covers.
  const tried = new Set();
  let pick = null;
  const tryAll = async (list) => {
    for (const u of list) {
      if (!u || tried.has(u)) continue;
      tried.add(u);
      const d = await measure(u);
      if (App.stale(rid)) return true;
      if (!d || d.w / d.h < 1.3) continue;
      if (cfg.kitsu && u === cfg.kitsu && cfg.first?.[0] === cfg.kitsu && !kitsuCoverOk(d)) continue; // a poor Kitsu cover: AniList's banner instead
      if (score(d) >= 1) { pick = d; return true; }
      if (!pick || score(d) > score(pick)) pick = d;
    }
    return false;
  };
  // Outside your library: your tracker's banner (AniList's, or Kitsu's cover) whenever it's usable.
  let forced = null;
  if (cfg.force) {
    const d = await measure(cfg.force);
    if (App.stale(rid)) return;
    if (d && d.w >= 960 && d.w / d.h >= 1.3 && (cfg.force !== cfg.kitsu || kitsuCoverOk(d))) forced = d;
  }
  if (forced) pick = forced;
  let done = !!forced || await tryAll((typeof HDArt === 'undefined' ? [] : await HDArt.backdrops({ seriesId: cfg.lib || null, alId: cfg.alId || null })).slice(0, 2));
  if (!done) done = await tryAll(cfg.first || []);
  if (!done && cfg.alId) done = await tryAll([(await AniZip.get(cfg.alId))?.fanart]); // TheTVDB fanart via ani.zip
  if (!done && cfg.fanart?.[0]) {
    const fanart = await Promise.race([Trakt.fanartFor(cfg.fanart[0], cfg.fanart[1]).catch(() => []), new Promise((x) => setTimeout(() => x([]), 3500))]);
    done = await tryAll(fanart);
  }
  if (!done) done = await tryAll(cfg.mid || []); // Kitsu's cover: often fan-made, so late in the order
  if (!done) await tryAll(cfg.last || []);
  if (App.stale(rid) || !pick) return;
  bgChoice.set(key, pick.u);
  fade(pick.u);
  const using = cfg.pill ? (pick.u === cfg.kitsu ? 'kitsu' : pick.u === cfg.alBanner ? 'anilist' : '') : '';
  const hero = bg.closest?.('.detail-hero');
  if (hero && using) { hero.querySelector('.banner-src')?.remove(); hero.insertAdjacentHTML('beforeend', bannerPill(cfg.alId, using)); }
}

// Sets your list's progress to exactly `progress` (Tracker.setProgress only ever moves forward).
async function setListProgress(animeId, progress, total) {
  const e = await Tracker.entry(animeId).catch(() => null);
  if (!e || progress >= (e.progress || 0)) return Tracker.setProgress(animeId, progress, total);
  return Tracker.saveEntry(animeId, { status: e.status === 'completed' ? 'current' : e.status, progress, reconsuming: e.reconsuming });
}

// "Newest first" / "Oldest first" toggle above a title page's episodes; the label is the current order.
function epSortLink() {
  const desc = App.settings.epSort === 'desc';
  return `<button class="link-btn ep-sort" data-act="epSort" title="Switch to ${desc ? 'oldest' : 'newest'} first">${icon('sort')}${desc ? 'Newest first' : 'Oldest first'}</button>`;
}

// "in 1d", "in 23h", "in 40m" for the next-episode pill.
function untilText(at) {
  const m = Math.max(0, Math.round((at - Date.now()) / 60000));
  return m >= 1440 ? `${Math.floor(m / 1440)}d` : m >= 60 ? `${Math.floor(m / 60)}h` : `${m}m`;
}
// Title page info line: ★ score pill, "Next EP 4 · 23h" pill, then "TV · 2026 · 12 eps · releasing".
function metaLine({ rating, next, rest }) {
  const pills = (rating ? `<span class="pill-rating">★ ${rating}%</span>` : '')
    + (next ? `<span class="pill-next" title="${esc(new Date(next.at).toLocaleString())}">${icon('clock')}Next EP ${esc(next.episode)} · ${untilText(next.at)}</span>` : '');
  return pills + `<span class="meta-rest">${rest.filter(Boolean).join(' · ')}</span>`;
}

// Outlined status button + menu to add a show to the Kitsu/AniList list or change its status.
function statusPicker(animeId, status, reconsuming = false) {
  if (!Tracker.loggedIn() || !animeId) return '';
  const label = !status ? 'Add to list' : reconsuming ? 'Rewatching' : STATUS_LABELS[status] || status;
  const item = (v, l, cls = '') => `<button class="${cls}" data-act="setKStatus" data-kitsu="${esc(animeId)}" data-status="${v}">${l}</button>`;
  const items = Object.entries(STATUS_LABELS).map(([v, l]) => item(v, l, status === v ? 'on' : '')).join('') + (status ? item('remove', 'Remove from list', 'danger') : '');
  return `<div class="chip-wrap status-wrap"><button class="status-btn" data-act="toggleMenu" title="${esc(Tracker.name)} list status">${icon(status ? 'bookmarkCheck' : 'plus')}<span>${esc(label)}</span>${icon('caret', 'fill caret-ic')}</button><div class="chip-menu" hidden>${items}</div></div>`;
}

// Progress card in a show page's side column: status, "3 / ?" and a bar. Clicking it opens the list editor.
async function trackingEntryState(id) {
  if(!Tracker.loggedIn())return {entry:null,error:null};
  const service=Tracker.svc,userId=service?.userId;
  try{const entry=await Tracker.entry(id);if(service!==Tracker.svc||userId!==service?.userId)throw Error('Your tracking account changed. Reload this page.');return {entry,error:null};}
  catch(error){return {entry:null,error};}
}
function progressCard({ editable, kitsuId, total, title, label, num, of, pct, note = '', error = null }) {
  if(error)return `<div class="side-card prog-card" role="status"><div class="prog-head"><span class="side-status">List entry unavailable</span></div><p class="small muted">${esc(error.message||'Could not check your saved progress.')}</p><button class="btn ghost sm" data-act="retry">Retry list lookup</button></div>`;
  return `<div class="side-card prog-card ${editable ? 'editable' : ''}" ${editable ? `data-act="editEntry" data-kitsu="${esc(kitsuId)}" data-total="${esc(total || '')}" data-title="${esc(title)}" data-watched="${num}"` : ''}>
    <div class="prog-head">${editable ? icon('bookmark', 'fill st-ico') : ''}<span class="side-status">${esc(label)}</span><b class="prog-num">${num} / ${esc(of || '?')}</b>${editable ? `<span class="pencil" title="Edit">${icon('pencil')}</span>` : ''}</div>
    <div class="side-bar"><div style="width:${pct}%"></div></div>
    ${note ? `<div class="small muted">${note}</div>` : ''}
  </div>`;
}

// "Anikoto", "HiAnime", "Jellyfin" — for the line under the play button.
function shortServerName(id) { return (EXTERNAL_SERVERS.find((s) => s.id === id)?.name || id).replace(/ \(Local\)$/, ''); }

// Shown on regular (non-anime) show and movie pages.
function traktBox(item, seasonNumber) {
  const animeBtn = `<button class="btn ghost sm" data-act="setAnime" data-id="${esc(item.Id)}" data-val="1" title="Track this on Kitsu instead">This is anime</button>`;
  if (!Trakt.available()) return `<div class="track-box"><div class="grow"><div style="font-weight:600">Not tracked as anime</div><div class="small muted">Is this actually anime? Switch it so it tracks on Kitsu.</div></div>${animeBtn}</div>`;
  if (!Trakt.loggedIn()) return `<div class="track-box"><div class="grow"><div style="font-weight:600">Track this on Trakt</div><div class="small muted">Sign in to log what you watch automatically.</div></div><button class="btn primary sm" data-act="traktLogin">Sign in to Trakt</button>${animeBtn}</div>`;
  const hasIds = !!Trakt.ids(item);
  return `<div class="track-box"><div class="grow"><div style="font-weight:600">Trakt: ${App.settings.traktTrack ? 'tracking automatically' : 'auto-tracking off'}</div>
    <div class="small muted">${hasIds ? (item.Type === 'Movie' ? 'Gets marked watched when you finish it' : 'Episodes get marked watched when you finish them') : 'No TMDB/TVDB id in Jellyfin; matched by title instead'}</div></div>
    <button class="btn sm" data-act="traktSync" data-series="${esc(item.Id)}" data-season="${seasonNumber ?? 1}" title="Send what you've already watched">${item.Type === 'Movie' ? 'Send to Trakt' : 'Sync season'}</button>${animeBtn}</div>`;
}

// One entry per show: "MHA Season 2/3/Final" collapse into the first one listed.
function franchiseKey(a) {
  const t = String(a.canonical || a.title || '').replace(/\b(the )?final season\b.*$/i, '').replace(/[:\-–]\s*$/, '');
  return norm(stripSeason(stripSeason(t)));
}
function uniqueShows(list) {
  const seen = new Set();
  return list.filter((a) => { const k = franchiseKey(a); if (!k || seen.has(k) || seen.has(a.id)) return false; seen.add(k); seen.add(a.id); return true; });
}

// Prefer artwork that remains sharp after cropping to the carousel's actual proportions.
function carouselArtworkScore(image, box, dpr = 1) {
  if (!image || !image.w || !image.h || !box.width || !box.height) return 0;
  const imageRatio = image.w / image.h, viewRatio = box.width / box.height;
  if (imageRatio < 1.4) return 0;
  const retained = Math.min(imageRatio / viewRatio, viewRatio / imageRatio);
  if (retained < 0.6) return 0;
  const pixels = Math.min(image.w / (box.width * dpr), image.h / (box.height * dpr));
  return Math.min(1.5, pixels) * retained;
}

// One banner slide on the home carousel.
function heroSlide(sl, i) {
  if (sl.kind === 'anime') {
    const a = sl.a, lib = App.libIndex?.find(a);
    const meta = [a.rating ? `★ ${a.rating}%` : '', a.subtype, a.year, a.episodes ? `${a.episodes} eps` : ''].filter(Boolean).join(' · ');
    return `<div class="slide ${i ? '' : 'on'}" data-kid="${esc(a.id)}" data-lib="${esc(lib?.Id || '')}" data-poster="${esc(a.poster || '')}">
      <div class="slide-bg"><img class="slide-img" alt="" data-srcs="${esc(JSON.stringify(sl.srcs || []))}" data-fan="${esc(JSON.stringify(sl.fan || null))}"></div>
      <div class="slide-text"><h1>${esc(a.title)}</h1><div class="slide-meta">${esc(meta)}</div><p>${esc(a.synopsis)}</p>
        <div class="row gap">
          ${lib ? `<button class="btn primary" data-act="series" data-id="${esc(lib.Id)}">▶ Watch now</button>` : Requests.enabled() ? `<button class="btn primary" data-act="request" data-id="${esc(a.id)}">＋ Request</button>` : ''}
          <button class="btn ghost glass" data-act="anime" data-id="${esc(a.id)}" data-titles="${esc(JSON.stringify(a.titles))}">Details</button>
        </div></div></div>`;
  }
  const x = sl.x;
  return `<div class="slide ${i ? '' : 'on'}" data-lib="${esc(x.SeriesId || x.Id || '')}">
    <div class="slide-bg"><img class="slide-img" alt="" data-srcs="${esc(JSON.stringify(sl.srcs || []))}"></div>
    <div class="slide-text"><h1>${esc(x.Name)}</h1><div class="slide-meta">${esc([x.ProductionYear, x.Type === 'Movie' ? 'Movie' : 'Series', (x.Genres || []).slice(0, 3).join(' · ')].filter(Boolean).join(' · '))}</div>
      <p>${esc(x.Overview || '')}</p>
      <div class="row gap"><button class="btn primary" data-act="series" data-id="${esc(x.Id)}">▶ Watch now</button></div></div></div>`;
}

// Schedule "My shows": episodes of shows on your Watching list (incl. rewatching), plus shows you watched in the
// last 30 days: played in your Jellyfin library, or updated on Kitsu/AniList (e.g. one you just finished).
// AniList entries match the schedule by exact AniList id. Kitsu uses different ids, so its entries match by main
// titles only (not short nicknames, which collide). Something you watched recently also brings in its new season.
// Also adds `progress` (episodes you've watched, from your list) to each airing it can match; filter = false keeps
// every airing and only adds progress ("All shows").
async function mySchedule(items, filter = true) {
  const since = Date.now() - 30 * 86400000;
  const recent = (d) => !!d && Date.parse(d) >= since;
  const mainTitles = (a) => (a.titles || []).slice(0, 4).filter((t) => String(t).trim().length >= 4).map(titleKey).filter(Boolean);
  const franchise = (t) => titleKey(stripSeason(t));
  const ids = new Set(), keys = new Set(), recentShows = new Set();
  const pick = (e) => e.status === 'current' || (recent(e.updatedAt) && !['planned', 'dropped'].includes(e.status));
  const [entries, played] = await Promise.all([
    Tracker.loggedIn() ? Tracker.list('',0,500).then(r=>r.entries).catch(()=>[]) : [],
    [], // Private viewing never seeds anime recommendations.
  ]);
  const progById = new Map(), progByKey = new Map();
  for (const e of entries) {
    if (!e.anime || ['planned', 'dropped'].includes(e.status)) continue;
    progById.set(String(e.anime.id), e.progress || 0);
    for (const k of mainTitles(e.anime)) if (!progByKey.has(k)) progByKey.set(k, e.progress || 0);
  }
  const progressFor = (x) => progById.get(String(x.anime.id)) ?? mainTitles(x.anime).map((k) => progByKey.get(k)).find((p) => p != null) ?? null;
  for (const e of entries) {
    if (!e.anime || !pick(e)) continue;
    ids.add(String(e.anime.id));
    for (const k of mainTitles(e.anime)) keys.add(k);
    if (e.status !== 'current') for (const t of (e.anime.titles || []).slice(0, 4)) { const k = franchise(t); if (k && k.length >= 4) recentShows.add(k); }
  }
  for (const it of played) {
    if (!recent(it.UserData.LastPlayedDate)) continue;
    const k = franchise(it.SeriesName || it.Name);
    if (k && k.length >= 4) recentShows.add(k);
  }
  const mine = (x) => ids.has(String(x.anime.id))
    || mainTitles(x.anime).some((k) => keys.has(k))
    || (x.anime.titles || []).slice(0, 4).some((t) => recentShows.has(franchise(t)));
  return (filter ? items.filter(mine) : items).map((x) => ({ ...x, progress: progressFor(x) }));
}

// AniList artwork for library anime: each season's cover (and banner), found through its saved Kitsu match.
// Looked up 50 shows per AniList request and kept on disk for a week, so cards draw with AniList art straight
// away after the first visit. Off in Settings → Appearance → "Use AniList artwork".
const Art = {
  cache: {}, loaded: false, saveTimer: null, busy: Promise.resolve(),
  TTL: 7 * 86400000,
  async load() { if (!this.loaded) { this.cache = (await window.native.get('alArt')) || {}; this.loaded = true; } },
  persist() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => window.native.set('alArt', this.cache), 800); },
  fresh(k) { const a = this.cache[k]; return a && Date.now() - a.at < this.TTL ? a : null; },
  kitsuId(seriesId, season) { const m = App.matches?.[Matcher.key(seriesId, season ?? 1)]; return m && !m.none ? String(m.id) : null; },
  coverFor(seriesId, season) {
    if (App.settings?.alArt === false) return '';
    const k = this.kitsuId(seriesId, season);
    return (k && this.fresh(k)?.cover) || '';
  },
  // Fetches art for any of these Kitsu ids not known yet (Kitsu id -> AniList id is cached by AniList.mediaId).
  async fill(kitsuIds) {
    await this.load();
    const need = [...new Set(kitsuIds)].filter((k) => k && !this.fresh(k));
    if (!need.length) return false;
    const byAl = {}, notOnAniList = new Set();
    for (let i = 0; i < need.length; i += 4) {
      await Promise.all(need.slice(i, i + 4).map(async (k) => {
        try { byAl[await AniList.mediaId(k)] = k; }
        catch (e) { if (/couldn.t find/i.test(e.message)) notOnAniList.add(k); } // anything else (offline, rate limit): retry next time
      }));
    }
    const ids = Object.keys(byAl).map(Number);
    for (let i = 0; i < ids.length; i += 50) {
      const d = await AniList.gql('query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids, type:ANIME){ id bannerImage coverImage{ extraLarge large } } } }', { ids: ids.slice(i, i + 50) }, false).catch(() => null);
      for (const m of d?.Page?.media || []) { this.cache[byAl[m.id]] = { cover: m.coverImage?.extraLarge || m.coverImage?.large || '', banner: m.bannerImage || '', at: Date.now() }; }
    }
    for (const k of notOnAniList) this.cache[k] = { cover: '', banner: '', at: Date.now() }; // really not on AniList: don't ask again this week
    this.persist();
    return true;
  },
  // Swaps library cards (and Related seasons) under `root` over to AniList covers, fetching any that are missing.
  upgrade(root) {
    if (App.settings?.alArt === false || !root) return;
    this.busy = this.busy.then(async () => {
      const cards = [...root.querySelectorAll('.card[data-act="series"][data-id], .card[data-act="movie"][data-id], .rel-card[data-act="series"][data-id]')];
      const want = cards.map((c) => [c, this.kitsuId(c.dataset.id, c.dataset.season ?? 1)]).filter(([, k]) => k);
      if (!want.length) return;
      await this.fill(want.map(([, k]) => k));
      for (const [c, k] of want) {
        const cover = this.fresh(k)?.cover, img = c.querySelector('.poster img, .rel-poster img');
        if (!cover || !img || img.getAttribute('src') === cover) continue;
        img.classList.remove('ready');
        img.src = cover;
      }
    }).catch(() => {});
  },
};

// Title pages (and their player) take on the show's own colour: AniList's cover colour, lifted so it reads on dark.
// Everything outside the page (sidebar, top bar, menus) keeps your accent from Settings → Appearance.
function tintRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return null;
  let [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l0 = (max + min) / 2, d = max - min;
  let h = 0, sat = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  sat = Math.min(0.85, Math.max(0.45, sat)); const l = Math.min(0.76, Math.max(0.66, l0)); // readable, never muddy or neon
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m0 = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + m0) * 255)).join(',');
}
function showTint(el, hex) {
  if (!el) return;
  const rgb = tintRgb(hex);
  for (const k of ['--accent-rgb', '--accent', '--accent2-rgb', '--accent-2']) el.style.removeProperty(k);
  el.classList.toggle('tinted', !!rgb);
  if (!rgb) return;
  el.style.setProperty('--accent-rgb', rgb); el.style.setProperty('--accent', `rgb(${rgb})`);
  el.style.setProperty('--accent2-rgb', rgb); el.style.setProperty('--accent-2', `rgb(${rgb})`);
}
const VIEW_TITLES = { home: 'Home', schedule: 'Schedule', mylist: 'My list', library: 'Library', requests: 'Requests', settings: 'Settings', profile: 'Profile', friends:'Social', browse: 'Browse', search: 'Search', homesections: 'Home rows' };
function setWindowTitle(view, main) {
  const t = VIEW_TITLES[view] || main.querySelector('.hero-text h1, .sub-head h1, .page-head h1')?.textContent?.trim();
  document.title = t ? `${t} · AniDeck` : 'AniDeck';
}

// Official logo instead of the title text, when there is one (ani.zip / TheTVDB clear logos). The text stays for
// screen readers; a season number the logo can't show goes above the info line.
// Trims a logo's empty transparent margins (some are a small logo in a big square) and reports its real shape.
// Logos on a solid background come back as null, so the title stays as text rather than showing a box.
const logoCache = new Map();
function trimLogo(src) {
  if (logoCache.has(src)) return logoCache.get(src);
  const p = new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const k = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data, a = (px, py) => d[(py * w + px) * 4 + 3];
        if ([a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)].every((v) => v > 240)) return resolve(null); // opaque: not a cut-out logo
        let top = h, left = w, right = -1, bottom = -1;
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (d[(py * w + px) * 4 + 3] > 20) { if (px < left) left = px; if (px > right) right = px; if (py < top) top = py; if (py > bottom) bottom = py; }
        if (right < 0) return resolve(null);
        const pad = 2, cw = Math.min(w, right - left + 1 + pad * 2), ch = Math.min(h, bottom - top + 1 + pad * 2);
        if (cw >= w - 4 && ch >= h - 4) return resolve({ url: src, ratio: w / h }); // nothing to trim
        const out = document.createElement('canvas'); out.width = cw; out.height = ch;
        out.getContext('2d').drawImage(c, Math.max(0, left - pad), Math.max(0, top - pad), cw, ch, 0, 0, cw, ch);
        resolve({ url: out.toDataURL('image/png'), ratio: cw / ch });
      } catch { resolve({ url: src, ratio: im.naturalWidth / im.naturalHeight }); } // pixels unreadable: use it as it is
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
  logoCache.set(src, p);
  p.then(logo=>{if(!logo&&logoCache.get(src)===p)logoCache.delete(src);});
  return p;
}
function titleStoryMarkup(id,primary,alternate=''){
 const text=TitleSynopsis.choose(primary,alternate),stub=TitleSynopsis.isStub(text);
 return `<section id="title-story" data-id="${esc(id||'')}" data-primary="${esc(primary||'')}" data-alternate="${esc(alternate||'')}"><h3>About</h3><div class="about-wrap ${!stub&&text.length>320?'clamped':''}"><p class="about">${esc(stub?(id?'Looking for a fuller synopsis…':'A full synopsis is not available for this season yet.'):text)}</p>${!stub&&text.length>320?'<button class="about-more" data-act="aboutToggle">Show more</button>':''}</div></section>`;
}
async function enrichTitleStory(rid){
 const panel=document.getElementById('title-story');if(!panel?.dataset.id)return;const {id,primary,alternate}=panel.dataset;
 const result=await TitleSynopsis.resolve(id,primary,alternate,App.showAl);if(App.stale(rid)||!panel.isConnected||panel!==document.getElementById('title-story'))return;
 const text=TitleSynopsis.isStub(result.text)?'A full synopsis is not available for this season yet.':result.text;
 panel.innerHTML=`<h3>About</h3><div class="about-wrap ${text.length>320?'clamped':''}"><p class="about">${esc(text)}</p>${text.length>320?'<button class="about-more" data-act="aboutToggle">Show more</button>':''}</div>${result.source?`<button class="story-source" data-act="link" data-url="${esc(result.url)}">${esc(result.source)} ${icon('external')}</button>`:''}`;
}
const titleLogoCache=new Map();
function titleArtworkId(id,details){return details?.id||(String(id||'').startsWith('al:')?Number(String(id).slice(3)):AniList.idCache?.[id])||null;}
function logoHeading(title,alId,englishTitle='',className=''){
 const logo=titleLogoCache.get(String(alId));
 return `<h1 class="${className} ${logo?'has-logo':alId?'logo-pending':''}" aria-label="${esc(title)}" data-logo-id="${esc(alId||'')}" data-english-title="${esc(englishTitle)}">${logo?`<span class="sr-only">${esc(title)}</span><img class="hero-logo ready" src="${esc(logo.url)}" alt="${esc(title)}" style="--logo-ar:${Number(logo.ratio).toFixed(3)}">` :esc(title)}${logo&&englishTitle?`<span class="logo-english">${esc(englishTitle)}</span>`:''}</h1>`;
}
async function findTitleLogo(metadata) {
  const candidates=[...new Set([...(Array.isArray(metadata?.logos)?metadata.logos:[]),metadata?.logo].filter(Boolean))].slice(0,6);
  let best=null;
  for(const src of candidates){
    try{
      const logo=await trimLogo(src);
      if(logo&&Number.isFinite(logo.ratio)&&logo.ratio>=1.1){if(logo.ratio>=2.2)return logo;if(!best||logo.ratio>best.ratio)best=logo;}
    }catch{} // An unavailable source must not prevent trying the other exact-ID artwork.
  }
  return best;
}
function showLogo(h1, alId, season, englishTitle='') {
 if(!h1)return;
 alId=alId||h1.dataset?.logoId;
 englishTitle=englishTitle||h1.dataset?.englishTitle||'';
 let timer;const reveal=()=>{clearTimeout(timer);h1.classList.remove('logo-pending');};
 const caption=()=>{
  if(englishTitle){let label=h1.querySelector?.('.logo-english');if(!label){label=document.createElement('span');label.className='logo-english';h1.append(label);}label.textContent=englishTitle;}
  if(season>1&&!h1.previousElementSibling?.classList.contains('hero-eyebrow'))h1.insertAdjacentHTML('beforebegin',`<div class="hero-eyebrow">Season ${season}</div>`);
 };
 const cached=titleLogoCache.get(String(alId));
 if(cached&&h1.querySelector?.('.hero-logo')){caption();reveal();return;}
 const attach=logo=>{
  if(!h1.isConnected)return reveal();
  const img=new Image();img.className='hero-logo';img.alt=h1.getAttribute?.('aria-label')||h1.textContent.trim();img.decoding='async';img.style.setProperty('--logo-ar',Math.max(.6,Math.min(8,logo.ratio)).toFixed(3));
  img.onload=()=>{if(!h1.isConnected)return;titleLogoCache.set(String(alId),logo);if(titleLogoCache.size>128)titleLogoCache.delete(titleLogoCache.keys().next().value);h1.classList.add('has-logo');h1.innerHTML=`<span class="sr-only">${esc(img.alt)}</span>`;h1.prepend(img);caption();reveal();requestAnimationFrame(()=>img.classList.add('ready'));};img.onerror=reveal;img.src=logo.url;
 };
 timer=setTimeout(reveal,1200);if(!alId)return reveal();h1.classList.add('logo-pending');if(cached)return attach(cached);
 AniZip.get(alId).then(async metadata=>{if(!h1.isConnected)return reveal();let logo=await findTitleLogo(metadata);if(!logo&&metadata?.tvdb&&h1.isConnected)logo=await findTitleLogo({logos:await AniZip.clearlogos(metadata.tvdb)});if(!logo||!h1.isConnected)return reveal();attach(logo);}).catch(reveal);
}

// Hovering a title for a moment starts loading what its page needs, so the click opens almost instantly.
// Every call here caches its own answer; this only starts them early.
const Prefetch = {
  done: new Set(), timer: null,
  bind() {
    document.addEventListener('pointerover', (e) => {
      const card = e.target.closest?.('#main [data-act="series"][data-id], #main [data-act="anime"][data-id], #main [data-act="movie"][data-id]');
      clearTimeout(this.timer);
      if (card) this.timer = setTimeout(() => this.warm(card.dataset), 120);
    });
  },
  warm({ act, id, season }) {
    const key = `${act}:${id}:${season ?? ''}`;
    if (!id || this.done.has(key)) return;
    this.done.add(key);
    setTimeout(() => this.done.delete(key), 25000); // Jellyfin answers are shared for 30s
    const quiet = (p) => p?.catch?.(() => {});
    const anime = (kid) => { quiet(Kitsu.animeFull(kid)); quiet(AniList.details(kid).then((al) => al && AniZip.get(al.id))); };
    if (act === 'anime') { if (!String(id).startsWith('al:')) anime(id); return; }
    quiet(Jellyfin.item(id));
    if (act === 'series') quiet(Jellyfin.seasons(id));
    const m = App.matches?.[Matcher.key(id, act === 'movie' ? 1 : season ?? 1)];
    if (m && !m.none) anime(m.id);
  },
};

// Loading placeholders: soft shimmering shapes of what's coming (no spinners anywhere). The real content then
// slides in over them (animateCards / view-in).
const posterSkeleton = (n) => Array.from({ length: n }, () => '<div class="sk-card"><div class="skel sk-poster"></div><div class="skel sk-line" style="width:80%"></div><div class="skel sk-line" style="width:50%"></div></div>').join('');
const linesSkeleton = (n, h = 16) => Array.from({ length: n }, (_, i) => `<div class="skel sk-line" style="height:${h}px;width:${[100, 92, 96, 88, 94][i % 5]}%"></div>`).join('');
function commentSkeleton(n = 5) {
  return Array.from({ length: n }, (_, i) => `<div class="sk-comment"><div class="sk-row"><div class="skel sk-avatar"></div><div class="skel sk-line" style="width:120px"></div></div>
    <div class="skel sk-line" style="width:${[70, 45, 85, 55, 65][i % 5]}%"></div><div class="skel sk-line" style="width:${[40, 60, 30, 50, 35][i % 5]}%"></div></div>`).join('');
}
function scheduleSkeleton() {
  const card = '<div class="sk-sch"><div class="skel sk-sch-poster"></div><div class="sk-stack"><div class="skel sk-line" style="width:55%"></div><div class="skel sk-line"></div><div class="skel sk-line" style="width:35%"></div></div></div>';
  return Array.from({ length: 7 }, (_, i) => `<section class="sch-day ${i ? '' : 'today'}"><header><div class="skel sk-line" style="width:72px;height:18px"></div></header><div class="sch-list">${card.repeat(4)}</div></section>`).join('');
}
function skeleton(view) {
  const head = '<div class="sk-head"><div class="skel sk-title"></div><div class="skel sk-line" style="width:240px"></div></div>';
  if (['show', 'anime', 'movie'].includes(view)) {
    const ep = '<div class="sk-ep"><div class="skel sk-thumb"></div><div class="sk-stack"><div class="skel sk-line" style="width:28%"></div><div class="skel sk-line" style="width:50%"></div><div class="skel sk-line" style="width:82%"></div></div></div>';
    return `<div class="sk-hero"><div class="skel sk-hero-poster"></div><div class="sk-stack sk-hero-text"><div class="skel sk-title" style="width:48%;height:40px"></div><div class="skel sk-line" style="width:32%"></div>
        <div class="sk-row">${'<div class="skel sk-chip"></div>'.repeat(4)}</div><div class="sk-row"><div class="skel sk-btn"></div><div class="skel sk-btn" style="width:140px"></div></div></div></div>
      <div class="sk-body"><div class="sk-stack"><div class="skel" style="height:66px;border-radius:16px"></div>${linesSkeleton(7)}</div><div class="sk-stack">${ep.repeat(4)}</div></div>`;
  }
  if (view === 'schedule') return App.settings.scheduleView === 'week' ? `<div class="page schedule">${head}<div class="sch-grid">${scheduleSkeleton()}</div></div>`
    : `<div class="page schedule sch-timeline">${head}<div class="sch-wrap">${scheduleTimelineSkeleton()}</div></div>`;
  if (view === 'home') return `<div class="skel sk-banner"></div><div class="page">${'<div class="skel sk-line" style="width:200px;height:20px;margin:6px 0 14px"></div><div class="sk-rail">' + posterSkeleton(9) + '</div>'}</div>`;
  if (view === 'thread') return `<div class="page">${head}${commentSkeleton()}</div>`;
  if (['library', 'browse', 'search', 'mylist', 'requests', 'downloads'].includes(view)) return `<div class="page">${head}<div class="grid">${posterSkeleton(18)}</div></div>`;
  return `<div class="page">${head}<div class="sk-stack">${linesSkeleton(6, 44)}</div></div>`;
}

// Titles slide in from the left, sweeping left→right and row by row, whenever a grid, rail or list renders or grows.
const CARD_SEL = '.grid > *, .rail > *, .ml-rows > *, .sch-list > .sch-card';
const seenCards = new WeakMap(); // container → keys already animated there ("Load more" redraws shouldn't replay)
function animateCards(nodes) {
  if (App.settings.reduceMotion) return; // AniDeck's own setting; Windows' "Animation effects" doesn't turn these off
  const rows = new Map();
  for (const el of nodes) {
    if (el.matches('.loading, .empty')) continue;
    // Seasons share their show's id, so the season is part of the key (otherwise only the first season animates).
    const idEl = el.dataset.aid || el.dataset.id ? el : el.querySelector('[data-id]');
    const box = el.parentElement, key = idEl && [idEl.dataset.aid || idEl.dataset.id, idEl.dataset.season ?? '', idEl.dataset.ep ?? ''].join('|');
    if (key) {
      if (!seenCards.has(box)) seenCards.set(box, new Set());
      const seen = seenCards.get(box);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight + 80 || r.bottom < -80 || r.left > innerWidth + 40) continue; // off screen: just show it
    const k = Math.round(r.top / 12);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push([r.left, el]);
  }
  [...rows.keys()].sort((a, b) => a - b).forEach((k, row) => {
    rows.get(k).sort((a, b) => a[0] - b[0]).forEach(([, el], col) => {
      el.style.setProperty('--cd', `${Math.min(col * 40 + row * 70, 650)}ms`);
      el.classList.add('card-in');
      const done = (e) => { if (e.target !== el) return; el.classList.remove('card-in'); el.style.removeProperty('--cd'); el.removeEventListener('animationend', done); };
      el.addEventListener('animationend', done);
    });
  });
}

// Credits that synopses carry ("(Source: Crunchyroll)", "[Written by MAL Rewrite]"), wherever they appear.
const SOURCE_NOTE = /\s*[\[(](?:source|written by)[^\])]*[\])]/gi;

/* ---------- Home: "Your next episode" ---------- */
// The queue: what you're partway through, then the next unwatched episode of each library show, then shows on your
// Watching list that aren't in your library (they stream from the chosen server). Up to 8, one per show.
// `airing` (from listAiring) says how far each airing show has got: an episode that hasn't come out yet gets
// `wait` (when it airs, or -1 if unknown) instead of a Play button, and goes after the ones you can watch now.
const QUEUE_MAX = 20; // the queue scrolls in place when it's long
// The banner picked for each queue show, kept on disk for two weeks, so after a refresh the queue opens with it
// instead of the portrait cover.
const QueueArt = {
  map: null, timer: null, TTL: 14 * 86400000,
  async load() { if (!this.map) this.map = (await window.native.get('queueArt').catch(() => null)) || {}; },
  key: (it) => String(it.kid || it.kitsu || (it.alId ? `al:${it.alId}` : '') || it.series || it.id || ''),
  get(it) { const v = this.map?.[this.key(it)]; return v && Date.now() - v.at < this.TTL ? v.u : ''; },
  set(it, u) { if (!this.map || !u) return; this.map[this.key(it)] = { u, at: Date.now() }; clearTimeout(this.timer); this.timer = setTimeout(() => window.native.set('queueArt', this.map), 1000); },
};
let queueWatchingCache = null;
function queueScope(){return [Tracker.name,Tracker.svc?.userId||Tracker.userName||'',Tracker.loggedIn()].join(':');}
async function queueWatching() {
  const key=queueScope(),current=()=>queueScope()===key;
  if(!Tracker.loggedIn()){queueWatchingCache=null;return [];}
  const savedKey='anime-queue:'+key;
  try{
    let list;try{list=await Tracker.watching();}catch(first){if(first.status===401||first.status===403)throw first;try{list=(await Tracker.list('current',0,20)).entries||[];}catch(second){if([401,403,429].includes(second.status)||typeof setTimeout==='undefined')throw second;await new Promise(resolve=>setTimeout(resolve,450));if(!current())throw Error('Account changed');list=await Tracker.watching();}}
    if(!current())throw Error('Account changed');
    queueWatchingCache={key,at:Date.now(),list,stale:false};
    if(typeof window!=='undefined'&&window.native?.set)window.native.set(savedKey,queueWatchingCache).catch(()=>{});
    return list;
  }catch(error){
    if(!current()||[401,403].includes(error.status))throw error;
    if(queueWatchingCache?.key===key&&Date.now()-queueWatchingCache.at<300000){queueWatchingCache.stale=true;return queueWatchingCache.list;}
    if(typeof window!=='undefined'&&window.native?.get){const saved=await window.native.get(savedKey).catch(()=>null);if(current()&&saved?.key===key&&Array.isArray(saved.list)&&Date.now()-saved.at<86400000){queueWatchingCache={...saved,stale:true};return saved.list;}}
    throw error;
  }
}
const QueueRecovery={timer:null,scope:'',tries:0,
 schedule(rid){clearTimeout(this.timer);if(typeof HomeReads!=='undefined'&&HomeReads.active?.pending.size&&HomeReads.active.rid===rid)return;const key=queueScope();if(key!==this.scope){this.scope=key;this.tries=0;}const failed=document.querySelector('[data-queue-failed]'),stale=queueWatchingCache?.key===key&&queueWatchingCache.stale;
  if(!failed&&!stale){this.tries=0;return;}if(this.tries>=3)return;
  this.timer=setTimeout(()=>{if(App.stale(rid)||App.view!=='home'||queueScope()!==key||!document.getElementById('modal').hidden||!document.getElementById('player').hidden)return;this.tries++;App.nav('home',{},false,true);},[1800,4500,10000][this.tries]);
 }
};
async function verifyQueueAiring(watching, airing) {
  const verified=watching.map(w=>({...w}));let next=0;
  const needsCheck=a=>a&&!airing?.(a)&&!/^(finished|completed)$/i.test(a.status||'');
  const ids=verified.filter(w=>needsCheck(w.anime)&&/^al:\d+$/.test(String(w.anime.id))).map(w=>w.anime.id);
  let batch=null,batchFailed=false;
  if(ids.length&&typeof AniList.airingBatch==='function'){try{batch=await AniList.airingBatch(ids);}catch{batchFailed=true;}}

  const worker=async()=>{while(next<verified.length){const w=verified[next++],a=w.anime;if(!a||airing?.(a)||/^(finished|completed)$/i.test(a.status||''))continue;
    try{const batched=ids.includes(a.id)&&(batch!==null||batchFailed);const d=batched?batch?.[a.id]:await AniList.details(a.id);if(d?.next)w.queueAir={aired:Math.max(0,Number(d.next.episode)-(d.next.at>Date.now()?1:0)),next:d.next.at>Date.now()?d.next:null};else if(/finished/i.test(d?.status||'')){const total=Number(d.episodes)||Number(a.episodes)||(String(d?.format||a.subtype||'').toLowerCase()==='movie'?1:0);w.queueAir={aired:total||null,next:null};}else if(/upcoming|not[ _]yet[ _]released/i.test(d?.status||a.status||''))w.queueAir={aired:0,next:null};else w.queueAir={aired:null,next:null};}catch{w.queueAir={aired:null,next:null};}
  }};await Promise.all([worker(),worker(),worker()]);return verified;
}
function buildQueue(resume, up, watching, airing = null) {
  const seen = new Set(), q = [], now = Date.now();
  const fromLibrary = (ep, inProgress) => {
    const movie = ep.Type === 'Movie', key = movie ? ep.Id : ep.SeriesId;
    if (!key || seen.has(key)) return;
    seen.add(key);
    const pct = inProgress ? ep.UserData?.PlayedPercentage || 0 : 0;
    const mins = ep.RunTimeTicks ? ep.RunTimeTicks / TICKS / 60 : 0;
    const left = pct && mins ? Math.max(1, Math.round(mins * (1 - pct / 100))) : null;
    const m = App.matches?.[Matcher.key(key, movie ? 1 : ep.ParentIndexNumber ?? 1)];
    // Jellyfin lists announced episodes it doesn't have yet as "Virtual"; those can't play.
    const premiere = Date.parse(ep.PremiereDate || '') || 0;
    const wait = premiere > now ? premiere : ep.LocationType === 'Virtual' ? -1 : null;
    const backdrop = ep.ParentBackdropItemId ? Jellyfin.img(ep.ParentBackdropItemId, 'Backdrop', { maxWidth: 3840, quality: 95 })
      : ep.BackdropImageTags?.length ? Jellyfin.img(ep.Id, 'Backdrop', { maxWidth: 3840 }) : Jellyfin.img(key, 'Backdrop', { maxWidth: 3840 });
    q.push({ kind: movie ? 'movie' : 'lib', id: ep.Id, series: key, title: movie ? ep.Name : ep.SeriesName, ep: movie ? 'Movie' : epLabel(ep),
      season: movie ? 1 : ep.ParentIndexNumber ?? 1, pct, backdrop, about: ep.Overview || '',
      thumb: ep.ImageTags?.Primary ? Jellyfin.img(ep.Id, 'Primary', { fillWidth: 640, quality: 95 }) : backdrop,
      badge: inProgress ? (left ? `${left} min left` : 'In progress') : 'Up next', kid: m && !m.none ? String(m.id) : null, wait });
  };
  resume.forEach((e) => fromLibrary(e, true));
  up.forEach((e) => fromLibrary(e, false));
  for (const w of watching) {
    if (q.filter(it=>it.wait==null).length >= QUEUE_MAX) break;
    const a = w.anime;
    if (!a || seen.has(String(a.id))) continue;
    const libraryMatch = Jellyfin.connected() ? App.libIndex?.find(a) : null;
    if (libraryMatch && q.some(it => it.series === libraryMatch.Id && it.wait == null)) continue;
    seen.add(String(a.id));
    const al=String(a.id).startsWith('al:'),progress=Math.max(0,Math.floor(Number(w.progress)||0)),total=Math.max(0,Math.floor(Number(a.episodes)||0));
    const movie=String(a.subtype||a.format||'').toLowerCase()==='movie';
    if((total&&progress>=total)||(movie&&progress>=1))continue;
    const num=movie?1:progress+1,air=airing?.(a)||w.queueAir;
    const unreleased=!air&&/upcoming|not[ _]yet[ _]released/i.test(a.status||'');
    const unknownOngoing=!air&&/^(current|releasing|airing)$/i.test(a.status||'');
    const wait=unreleased||unknownOngoing||air?.aired===null?-1:air&&num>air.aired?(air.next?.episode===num?air.next.at:-1):null;
    q.push({ kind: 'remote', kitsu: a.id, title: a.title, titleAliases:[...(a.titles||[]),a.canonical].filter(v=>v&&v!==a.title).slice(0,8), num, movie, total, ep: movie?'Movie':`Episode ${num}`, pct: 0,
      backdrop: '', banner:a.coverHd||a.cover||'', thumb: a.poster || '', poster: a.poster || '', about: a.synopsis || '', badge: '',
      kid: al ? null : String(a.id), alId: al ? String(a.id).slice(3) : null, wait });
  }
  // Upcoming and unverified airings belong in Schedule, not the ready-to-watch queue.
  return q.filter(it=>it.wait==null).slice(0,QUEUE_MAX);
}
function queueTitleMarkup(title) {
  const text=String(title||'');
  const season=text.match(/^(.*?)\s*[:–—-]?\s+(?:Season\s+(\d+)|(\d+)(?:st|nd|rd|th)\s+Season)$/i);
  return (season?`<span class="yn-title-season">Season ${Number(season[2]||season[3])}</span>`:'')+`<span class="yn-title-name">${esc(season?season[1]:text)}</span>`;
}
function ynHero(it) {
  const play = it.kind === 'remote' ? `data-act="queuePlay" data-titles="${esc(JSON.stringify(it.titleAliases||[]))}" data-title="${esc(it.title)}" data-ep="${it.num}" data-kitsu="${esc(it.kitsu)}" data-poster="${esc(it.poster || '')}" data-movie="${it.movie?'1':'0'}" data-total="${it.total||0}"`
    : it.kind === 'movie' ? `data-act="playMovie" data-id="${esc(it.id)}"` : `data-act="play" data-id="${esc(it.id)}" data-series="${esc(it.series)}"`;
  const open = it.kind === 'remote' ? `data-act="anime" data-id="${esc(it.kitsu)}"` : it.kind === 'movie' ? `data-act="movie" data-id="${esc(it.id)}"` : `data-act="series" data-id="${esc(it.series)}" data-season="${esc(it.season)}"`;
  const art = it.resolvedBackdrop || it.backdrop || it.banner || ''; // Real landscape sources only; never promote a poster into the hero.
  return `<div class="yn-art"><img class="yn-bg" ${art?`src="${esc(art)}"`:"hidden"} alt=""></div>
    <div class="yn-text">
      ${it.badge ? `<div class="yn-eyebrow">${esc(it.badge)}</div>` : ''}
      <h1 class="yn-title logo-pending" aria-label="${esc(it.title)}">${queueTitleMarkup(it.title)}</h1>
      <div class="yn-ep">${esc(it.ep)}</div>
      ${it.about ? `<p class="yn-about">${esc(it.about)}</p>` : ''}
      ${it.wait != null ? `<div class="yn-wait" role="timer">${it.wait > 0
        ? `<span class="yn-wait-label">${esc(it.ep)} comes out in</span><b class="yn-clock" data-clock="${it.wait}">${esc(countdownText(it.wait))}</b><small>${esc(new Date(it.wait).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }))}</small>`
        : `<span class="yn-wait-label">${esc(it.ep)} isn’t out yet</span><small>It’ll show up here once it airs.</small>`}</div>` : ''}
      <div class="yn-actions">${it.wait != null ? '' : `<button class="btn primary yn-play" ${play}>${icon('play', 'fill')}${it.pct ? 'Resume' : 'Play'}</button>`}<button class="btn ghost glass" ${open}>Episodes & Details</button></div>
      ${it.pct ? `<div class="yn-progress" title="${Math.round(it.pct)}% watched"><div style="width:${Math.round(it.pct)}%"></div></div>` : ''}
    </div>`;
}
function emptyQueueHero(failed) {
  const loggedIn=Tracker.loggedIn(),exhausted=typeof QueueRecovery!=='undefined'&&QueueRecovery.tries>=3;
  return `<section class="yn yn-empty" ${failed?'data-queue-failed="true"':''} aria-label="Your queue"><div class="yn-empty-copy"><span class="yn-eyebrow">YOUR QUEUE</span><h1>${failed?(exhausted?'Your tracker is unavailable.':'Getting your queue ready…'):'You’re all caught up.'}</h1><p>${failed?(exhausted?'You can keep browsing, or try your tracker again below.':'Your tracker didn’t respond. AniDeck is reconnecting automatically; you can keep browsing.'):loggedIn?'Your queue shows episodes ready to watch. Upcoming episodes are in Schedule and On the horizon.':'Start a local watchlist or connect a tracker to build your queue.'}</p><div class="row gap">${failed?'<button class="btn primary" data-act="retry">Try again</button>':`<button class="btn primary" data-act="ad-route" data-view="${loggedIn?'mylist':'settings'}">${loggedIn?'Open my list':'Connect a tracker'}</button>`}</div></div></section>`;
}
function yourNextHero(queue, failed = false) {
  if (!queue.length) return emptyQueueHero(failed);
  return `<section class="yn" id="yn" data-queue="${esc(JSON.stringify(queue))}">
    <div class="yn-hero" id="yn-hero">${ynHero(queue[0])}</div>
    <aside class="yn-queue" aria-label="Your queue"><div class="yn-qhead">Your queue <span>${queue.length}</span></div>${queueWatchingCache?.stale?'<small class="yn-cached-note">Saved queue · Reconnecting to your tracker</small>':''}<div class="yn-qlist at-top">
      ${queue.map((it, i) => `<button class="yn-item ${i ? '' : 'on'}" data-yn="${i}" aria-pressed="${!i}"><span class="yn-thumb">${it.thumb ? `<img class="${it.kind==='remote'&&!it.resolvedBackdrop?'portrait':''}" src="${esc(it.thumb)}" alt="" loading="lazy">` : ''}${it.pct ? `<i style="width:${Math.round(it.pct)}%"></i>` : ''}</span>
        <span class="yn-meta"><b>${esc(it.title)}</b><small>${esc(it.ep)}</small><em class="${it.wait != null ? 'wait' : ''}" ${it.wait > 0 ? `data-until="${it.wait}"` : ''}>${esc(it.wait > 0 ? untilText(it.wait) : it.badge)}</em></span></button>`).join('')}
    </div></aside></section>`;
}
// Legacy timing preferences retain their relative pace, with 40% less time per slide.
function spotlightDuration(value = App.settings.spotlightMs) {
  const legacy = {5000:3000,8000:4800,12000:7200};
  return legacy[value] || ([3000,4800,7200].includes(Number(value)) ? Number(value) : 4800);
}
function queueArtworkScore(image, box, dpr = 1) {
  if (!image?.w || !image?.h || !box.width || !box.height) return 0;
  const ratio=image.w/image.h,view=box.width/box.height;
  const retained=Math.min(ratio/view,view/ratio);
  const pixels=Math.min(image.w/(box.width*dpr),image.h/(box.height*dpr));
  // Wide windows and high-DPI screens rank good 1080p artwork lower; they must not discard it.
  if(ratio<1.4||image.w<960||image.h<300||retained<.22)return 0;
  return Math.min(2,pixels)*retained;
}
const queueArtCache = new Map();
function bindYourNext(rid) {
  const sec=$('#yn');if(!sec)return;
  const queue=JSON.parse(sec.dataset.queue||'[]');let selected=0,generation=0,hovering=false,visible=true,artPending=false;
  const stale=version=>App.stale(rid)||!sec.isConnected||version!==generation;
  const measure=u=>new Promise(resolve=>{const image=new Image(),timer=setTimeout(()=>resolve(null),5000);image.onload=()=>{clearTimeout(timer);resolve({u,w:image.naturalWidth,h:image.naturalHeight});};image.onerror=()=>{clearTimeout(timer);resolve(null);};image.src=u;});
  // The sharpest landscape art for a queue item (library backdrop, TheTVDB fanart, AniList banner, then Trakt), found once
  // per show and kept on the item, so switching to it later is instant.
  const details=it=>it.detailsP||(it.detailsP=Promise.resolve().then(()=>{const key=it.kid||it.kitsu||(it.alId?'al:'+it.alId:null);return key?AniList.details(key):null;}).catch(()=>null));
  const findArt=(it)=>it.artP||(it.artP=(async()=>{
    const key=it.kid||it.kitsu||(it.alId?'al:'+it.alId:null);
    const al=await details(it);
    if(!sec.isConnected)return {al,art:null};
    const box=sec.querySelector('.yn-hero').getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    const cacheKey=[typeof Tracker!=='undefined'?Tracker.name:'',key||it.series||it.id,Math.ceil(box.width/400),Math.ceil(box.height/200),dpr].join(':');
    let art=queueArtCache.get(cacheKey);
    if(!art){
      const [zip,hd]=await Promise.all([al?AniZip.get(al.id).catch(()=>null):null,typeof HDArt==='undefined'?[]:HDArt.backdrops({seriesId:it.series||null,alId:al?.id||null}).catch(()=>[]).then(urls=>urls.slice(0,2))]);
      const outside=!hd.length&&!it.backdrop;
      const kc=outside&&typeof kitsuCover==='function'?await kitsuCover({kitsuId:it.kid&&!String(it.kid).startsWith('al:')?it.kid:null,alId:al?.id||null,any:!al?.banner}):'';
      const candidates=[...new Set([...hd,it.backdrop,kc,zip?.fanart,al?.banner,it.banner].filter(Boolean))];
      let best=null,score=0;
      const measured=await Promise.all(candidates.map(measure));
      for(const image of measured){const rank=queueArtworkScore(image,box,dpr);if(rank>score){best=image;score=rank;}}
      // Rank native resolution and crop quality together; a weaker preferred source cannot replace sharper art.
      if(best&&typeof bannerSrcOf!=='undefined'){if(best.u===kc)bannerSrcOf.set(best.u,'kitsu');else if(best.u===al?.banner)bannerSrcOf.set(best.u,'anilist');}
      if(score<.9){const fanart=await Promise.race([Trakt.fanartFor(it.title,al?.year||'').catch(()=>[]),new Promise(resolve=>setTimeout(()=>resolve([]),3500))]);for(const image of await Promise.all(fanart.slice(0,4).filter(u=>!candidates.includes(u)).map(measure))){const rank=queueArtworkScore(image,box,dpr);if(rank>score){best=image;score=rank;}}}
      if(best){art=best.u;if(queueArtCache.size>=80)queueArtCache.delete(queueArtCache.keys().next().value);queueArtCache.set(cacheKey,art);}
    }
    if(art){it.resolvedBackdrop=art;if(typeof QueueArt!=='undefined')QueueArt.set(it,art);}
    return {al,art};
  })().then(result=>{if(!result.art)delete it.artP;return result;},error=>{delete it.artP;throw error;}));
  // Sidebar previews use the same verified landscape instead of a portrait letterboxed in the box.
  const setThumb=(i,art)=>{const thumb=sec.querySelector(`[data-yn="${i}"] .yn-thumb img`);if(thumb&&art&&thumb.getAttribute('src')!==art){thumb.src=art;thumb.classList.remove('portrait');}};
  const dress=async(it,version)=>{
    // A title logo must not wait for backdrop services, image measurements or fanart fallback.
    const key=it.kid||it.kitsu,knownId=it.alId||(String(key||'').startsWith('al:')?String(key).slice(3):AniList.idCache?.[key]);
    if(knownId)showLogo(sec.querySelector('.yn-title'),knownId,it.kind==='lib'?it.season:seasonNumberIn(it.title||''),it.title||'');
    details(it).then(al=>{if(stale(version))return;if(al){showTint(sec,al.color);if(!knownId||String(knownId)!==String(al.id))showLogo(sec.querySelector('.yn-title'),al.id,it.kind==='lib'?it.season:seasonNumberIn(al.title||''),al.englishTitle||al.title||'');}else if(!knownId)sec.querySelector('.yn-title')?.classList.remove('logo-pending');});
    const {al,art}=await findArt(it);
    if(stale(version))return;
    if(!art)return;
    const image=sec.querySelector('.yn-bg');if(image){image.src=art;image.hidden=false;image.classList.remove('soft');}
    sec.querySelector('.yn-poster-fallback')?.remove();
    setThumb(selected,art);
    // Outside your library, the banner's source and a click to use the other one.
    const hero=sec.querySelector('.yn-hero');
    if(hero?.querySelector){hero.querySelector('.banner-src')?.remove();const using=typeof bannerSrcOf!=='undefined'?bannerSrcOf.get(art):'';if(using&&al?.id&&al?.banner)hero.insertAdjacentHTML('beforeend',bannerPill(al.id,using));}
  };
  // As the queue rotates, scroll its list (only the list, never the page) so the current show stays in view.
  const keepInView=()=>{const ql=sec.querySelector('.yn-qlist'),on=sec.querySelector('.yn-item.on');if(!ql||!on)return;
   if(ql.scrollHeight>ql.clientHeight+2){if(on.offsetTop<ql.scrollTop+8||on.offsetTop+on.offsetHeight>ql.scrollTop+ql.clientHeight-24)ql.scrollTo({top:Math.max(0,on.offsetTop-12),behavior:'smooth'});}
   else if(ql.scrollWidth>ql.clientWidth+2&&(on.offsetLeft<ql.scrollLeft||on.offsetLeft+on.offsetWidth>ql.scrollLeft+ql.clientWidth))ql.scrollTo({left:Math.max(0,on.offsetLeft-16),behavior:'smooth'});};
  const choose=index=>{artPending=true;selected=(index+queue.length)%queue.length;generation++;sec.querySelectorAll('.yn-item').forEach((item,i)=>{item.classList.toggle('on',i===selected);item.setAttribute('aria-pressed',String(i===selected));});keepInView();showTint(sec,null);const hero=$('#yn-hero');hero.classList.remove('swap');void hero.offsetWidth;hero.classList.add('swap');hero.innerHTML=ynHero(queue[selected]);const version=generation;dress(queue[selected],version).catch(error=>console.warn('Queue artwork:',error.message)).finally(()=>{if(version===generation)artPending=false;});};
  const paused=()=>artPending||hovering||!visible||document.hidden||!$('#player')?.hidden||sec.contains(document.activeElement);
  const rotate=()=>{clearInterval(App.ynRotationTimer);if(queue.length>1)App.ynRotationTimer=setInterval(()=>{if(!sec.isConnected||App.stale(rid)){clearInterval(App.ynRotationTimer);return;}if(!paused())choose(selected+1);},spotlightDuration());};
  sec.querySelector('.yn-queue').onclick=e=>{const button=e.target.closest('[data-yn]');if(button){choose(Number(button.dataset.yn));rotate();}};
  sec.onmouseenter=()=>hovering=true;sec.onmouseleave=()=>{hovering=false;rotate();};
  new IntersectionObserver(([entry],observer)=>{if(!sec.isConnected){observer.disconnect();return;}visible=entry.isIntersecting;},{threshold:.35}).observe(sec);
  choose(0);rotate();
  // Then, in the background (two at a time, after Home has drawn), the rest of the queue's art: every preview fills in
  // with its real banner, and picking any of them swaps straight away.
  setTimeout(()=>{let next=0;const worker=async()=>{while(next<queue.length&&sec.isConnected&&!App.stale(rid)){const i=next++;const {art}=await findArt(queue[i]).catch(()=>({}));if(art&&sec.isConnected)setThumb(i,art);}};worker();worker();},700);
  // The list scrolls on its own; fade an edge only while there's more past it.
  const list = sec.querySelector('.yn-qlist');
  if (list) {
    const edges = () => {
      const v = list.scrollHeight > list.clientHeight + 2, h = list.scrollWidth > list.clientWidth + 2;
      list.classList.toggle('at-top', v ? list.scrollTop < 4 : !h || list.scrollLeft < 4);
      list.classList.toggle('at-end', v ? list.scrollTop + list.clientHeight >= list.scrollHeight - 4 : !h || list.scrollLeft + list.clientWidth >= list.scrollWidth - 4);
    };
    list.addEventListener('scroll', edges, { passive: true });
    new ResizeObserver(edges).observe(list);
    edges();
  }
  clearInterval(App.ynTimer);
  if(queue.some(it=>it.wait>0)){let n=0;App.ynTimer=setInterval(()=>{if(!sec.isConnected){clearInterval(App.ynTimer);return;}const t=Date.now();sec.querySelectorAll('[data-clock]').forEach(el=>el.textContent=countdownText(Number(el.dataset.clock),t));if(++n%30===0)sec.querySelectorAll('[data-until]').forEach(el=>el.textContent=untilText(Number(el.dataset.until),t));if(queue.some(it=>it.wait>0&&it.wait<=t)&&App.view==='home'&&$('#player').hidden){clearInterval(App.ynTimer);App.refresh();}},1000);}
}

// "This week": the Schedule's day tabs (with a 24-hour strip of when things air), then the chosen day as a row
// of episode cards in time order, each with where it stands for you; on today a "Now" line sits between aired and coming.
function weekRibbon(items) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), next = +day + 86400000;
    return { day, eps: items.filter((x) => x.at >= +day && x.at < next).sort((a, b) => a.at - b.at) };
  });
  if (!days.some((x) => x.eps.length)) return '';
  const sel = days[0].eps.length ? 0 : days.findIndex((x) => x.eps.length);
  const upNext = items.filter((x) => x.at > now).reduce((a, b) => (!a || b.at < a.at ? b : a), null);
  const card = (x, i) => {
    const a = x.anime, st = airState(x, now), lib = App.libIndex?.find(a);
    return `<button class="wk2-card ${x.at <= now ? 'aired' : ''} ${x === upNext ? 'next' : ''}" ${schAttrs(a)} title="${esc(a.title)}" style="--i:${Math.min(i, 10)}">
      <span class="wk2-poster">${a.poster ? `<img src="${esc(a.poster)}" alt="" loading="lazy">` : ''}${lib ? '<i class="wk2-lib" title="In your library"></i>' : ''}</span>
      <span class="wk2-info"><span class="wk2-time">${esc(schClock(x.at))}</span><b>${esc(a.title)}</b><small>Episode ${esc(x.episode)}${a.episodes ? ` of ${esc(a.episodes)}` : ''}</small>
        <span class="tl-state ${st.cls}" ${x.at > now ? `data-until="${x.at}"` : ''}>${esc(st.text)}</span></span></button>`;
  };
  const panel = ({ eps }, i) => {
    if (!eps.length) return `<div class="wk2-panel" data-panel="${i}" ${i === sel ? '' : 'hidden'}><div class="wk2-empty">${icon('clock')}Nothing of yours airs this day.</div></div>`;
    let html = '', nowDone = i !== 0;
    eps.forEach((x, j) => {
      if (!nowDone && x.at > now) { html += `<div class="wk2-now" aria-label="Now"><span>Now</span></div>`; nowDone = true; }
      html += card(x, j);
    });
    return `<div class="wk2-panel at-start" data-panel="${i}" ${i === sel ? '' : 'hidden'}>${html}</div>`;
  };
  return `<div class="section-head"><h2>This week</h2><button class="see-all" data-act="seeAll" data-target="${esc(JSON.stringify(['schedule', {}]))}">Full schedule${icon('chev')}</button></div>
    <section class="wk2" id="wk"><div class="sch-days wk2-days" role="tablist" aria-label="Day">${schDayTabs(days, sel, now)}</div>${days.map(panel).join('')}</section>`;
}
function bindWeek() {
  const wk = $('#wk');
  if (!wk) return;
  // The row scrolls sideways (the mouse wheel too, until it reaches an end); today opens at what's next.
  const edges = (p) => { p.classList.toggle('at-start', p.scrollLeft < 4); p.classList.toggle('at-end', p.scrollLeft + p.clientWidth >= p.scrollWidth - 4); };
  const open = (p) => {
    const mark = p.querySelector('.wk2-now') || p.querySelector('.wk2-card.next');
    p.scrollLeft = mark ? Math.max(0, mark.offsetLeft - 60) : 0;
    edges(p);
  };
  wk.querySelectorAll('.wk2-panel').forEach((p) => {
    p.addEventListener('scroll', () => edges(p), { passive: true });
    p.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || p.scrollWidth <= p.clientWidth) return;
      const end = e.deltaY > 0 ? p.scrollLeft + p.clientWidth >= p.scrollWidth - 2 : p.scrollLeft <= 0;
      if (end) return;
      e.preventDefault(); p.scrollLeft += e.deltaY;
    }, { passive: false });
  });
  const tabs = wk.querySelector('.wk2-days');
  const show = (i) => {
    tabs.querySelectorAll('.sch-dtab').forEach((b) => { const on = Number(b.dataset.day) === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    wk.querySelectorAll('.wk2-panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== i; if (!p.hidden) open(p); });
  };
  tabs.onclick = (e) => { const b = e.target.closest('.sch-dtab'); if (b) show(Number(b.dataset.day)); };
  const first = wk.querySelector('.wk2-panel:not([hidden])');
  if (first) requestAnimationFrame(() => open(first));
  // Countdowns stay current while Home is open.
  clearInterval(App.wkTimer);
  App.wkTimer = setInterval(() => {
    if (!wk.isConnected) { clearInterval(App.wkTimer); return; }
    const t = Date.now();
    wk.querySelectorAll('[data-until]').forEach((el) => { el.textContent = untilText(Number(el.dataset.until), t); });
  }, 30000);
}

// Trending mosaic: #1 as a big feature (poster, info, summary, buttons), #2–#5 as smaller ranked tiles. Poster-led,
// so it never depends on wide art.
const mzCount = () => (App.settings.trendingCount === 5 ? 5 : 9); // #1 plus the ranked list (Settings → Home screen)
function mosaicRow(list) {
  if (list.length < 3) return '';
  const [lead, ...rest] = list;
  const attrs = (a) => `data-total="${Number(a.episodes)||0}" data-act="anime" data-id="${esc(a.id)}" data-mal="${esc(a.malId || '')}" data-titles="${esc(JSON.stringify(a.titles || []))}"`;
  const lib = App.libIndex?.find(lead);
  const meta = [lead.rating ? `★ ${lead.rating}%` : '', lead.subtype, lead.year, lead.episodes ? `${lead.episodes} eps` : ''].filter(Boolean).join(' · ');
  return `<div class="section-head"><h2>Trending now</h2><button class="see-all" data-act="seeAll" data-target="${esc(JSON.stringify(['browse', { src: 'anime', f: { status: 'current', sort: 'popular' } }]))}">See all${icon('chev')}</button></div>
    <section class="mz ${list.length <= 5 ? 'mz-short' : ''}" id="mz" data-kid="${esc(lead.id)}" data-cover="${esc(lead.coverHd || lead.cover || '')}">
      <div class="mz-lead">
        <button class="mz-poster" ${attrs(lead)} aria-label="${esc(lead.title)}"><img src="${esc(lead.poster || '')}" alt=""></button>
        <div class="mz-text"><span class="mz-rank">#1 trending</span><h3 class="mz-title">${esc(lead.title)}</h3><div class="mz-meta">${esc(meta)}</div>
          ${lead.synopsis ? `<p class="mz-about">${esc(lead.synopsis.replace(SOURCE_NOTE, ''))}</p>` : ''}
          <div class="row gap">${lib ? `<button class="btn primary" data-act="series" data-id="${esc(lib.Id)}">${icon('play', 'fill')} Watch</button>` : ''}<button class="btn ${lib ? 'ghost' : 'primary'}" ${attrs(lead)}>Details</button></div></div>
      </div>
      <div class="mz-grid">${rest.map((a, i) => `<article class="mz-tile ta-compact" tabindex="0" role="link" ${attrs(a)}><span class="mz-n">${i + 2}</span><img src="${esc(a.poster || '')}" alt="" loading="lazy">
        <span class="mz-tile-text"><b>${esc(a.title)}</b><small>${esc([a.rating ? `★ ${a.rating}%` : '', a.subtype, a.year].filter(Boolean).join(' · '))}</small>
          ${a.synopsis ? `<span class="mz-tile-about">${esc(a.synopsis.replace(SOURCE_NOTE, ''))}</span>` : ''}</span><button type="button" class="ta-compact-more" data-ta="menu" aria-label="More actions for ${esc(a.title)}">${icon('more')}</button></article>`).join('')}</div>
    </section>`;
}
async function enhanceMosaic(rid) {
  const mz = $('#mz');
  if (!mz) return;
  const al = await AniList.details(mz.dataset.kid).catch(() => null);
  if (App.stale(rid)) return;
  // #1's own artwork, faded wide behind the feature so the space between it and the list isn't empty: TheTVDB fanart,
  // AniList's banner, or (if AniList is busy) its Kitsu cover, so the band is never left bare.
  const art = (al ? (await AniZip.get(al.id).catch(() => null))?.fanart || al.banner : '') || mz.dataset.cover || '';
  if (art && !App.stale(rid)) {
    const t = new Image();
    t.onload = () => { if (!mz.isConnected) return; mz.style.setProperty('--mz-art', `url("${art.replace(/"/g, '%22')}")`); mz.classList.add('has-art'); };
    t.src = art;
  }
  if (!al) return;
  showTint(mz, al.color);
  if (al.title) mz.querySelector('.mz-title').textContent = al.title;
  if (al.cover) mz.querySelector('.mz-poster img').src = al.cover;
  const meta = [al.score ? `★ ${al.score}%` : '', al.format, al.year, al.episodes ? `${al.episodes} eps` : '', ...(al.genres || []).slice(0, 2)].filter(Boolean).join(' · ');
  if (meta) mz.querySelector('.mz-meta').textContent = meta;
}

// Home greeting: "Good evening, Machaur" and a line about today (Settings → Home screen → Home rows → Greeting).
function homeGreeting(today, resume) {
  const h = new Date().getHours();
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  const name = (Tracker.loggedIn() ? Tracker.userName : '') || Jellyfin.userName || '';
  const out = today.filter((x) => x.at <= Date.now()).length, later = today.length - out;
  const bits = [out ? `${out} new episode${out === 1 ? '' : 's'} today` : '', later ? `${later} more later` : '', resume.length ? `${resume.length} in progress` : ''].filter(Boolean);
  return `<section class="home-greet"><h2>Good ${part}${name ? `, ${esc(name)}` : ''}</h2><p>${esc(bits.join(' · ') || 'Nothing new today. A good day to start something.')}</p></section>`;
}
// "Airing today": today's episodes of your shows in time order, with a "now" marker between aired and upcoming.
function airingTodayRow(today) {
  if (!today.length) return '';
  const now = Date.now(), upNext = today.find((x) => x.at > now);
  const items = [];
  today.forEach((x) => {
    if (x === upNext) items.push('<div class="now-mark" aria-label="Now"><span>Now</span></div>');
    items.push(scheduleCard(x, now, x === upNext));
  });
  if (!upNext) items.push('<div class="now-mark" aria-label="Now"><span>Now</span></div>');
  return rail('Airing today', items, { cls: 'today-strip', more: ['schedule', {}] });
}

// Hover previews add context and a list action without duplicating poster badges.
const HoverPreview = {
  card:null,timer:null,hideTimer:null,pop:null,
  bind(){
    document.addEventListener('pointerover',e=>{
      if(!App.settings.hoverPreview||e.pointerType==='touch')return;
      if(e.target.closest?.('[data-ta]')){this.hide();return;}
      if(e.target.closest?.('.hover-pop')){clearTimeout(this.hideTimer);return;}
      const card=e.target.closest?.('#main .rail .card[data-id], #main .grid .card[data-id], #main .mz-tile[data-id]');
      if(card&&(card.querySelector('.poster')||['series','movie'].includes(card.dataset.act)))return this.hide();
      if(card===this.card){clearTimeout(this.hideTimer);return;}
      clearTimeout(this.timer);if(!card){this.hideSoon();return;}this.hide();
      this.card=card;this.timer=setTimeout(()=>this.show(card),650);
    });
    document.addEventListener('scroll',event=>{if(!event.target.closest?.('.hover-pop'))this.hide();},true);
    document.addEventListener('mousedown',e=>{if(!e.target.closest?.('.hover-pop'))this.hide();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.hide();});
  },
  hideSoon(){clearTimeout(this.hideTimer);this.hideTimer=setTimeout(()=>this.hide(),200);},
  hide(){clearTimeout(this.timer);clearTimeout(this.hideTimer);this.card=null;this.pop?.remove();this.pop=null;},
  async load(card){
    const d={...card.dataset},service=Tracker.svc,userId=service?.userId;
    const lib=['series','movie'].includes(d.act)?App.itemById(d.id):null;
    let id=d.act==='anime'?String(d.id):null;
    if(lib){const match=App.matches?.[Matcher.key(d.id,d.act==='movie'?1:d.season??1)];if(match&&!match.none)id=String(match.id);}
    const [al,k]=await Promise.all([id?AniList.details(id).catch(()=>null):null,id&&!id.startsWith('al:')?Kitsu.animeFull(id).catch(()=>null):null]);
    let trackerId=id,entry=null,entryKnown=!Tracker.loggedIn();
    if(Tracker.loggedIn()&&id){try{
      if(service===AniList)trackerId=al?.id?'al:'+al.id:(id.startsWith('al:')?id:'al:'+await AniList.mediaId(id));
      else if(Tracker.name!=='AniDeck'&&id.startsWith('al:'))trackerId=await AniList.kitsuIdFor(id.slice(3),null);
      if(trackerId&&Tracker.svc===service&&service?.userId===userId){entry=await Tracker.entry(trackerId);entryKnown=true;}
    }catch{entryKnown=false;}}
    return {d,lib,id,al,k,trackerId,entry,entryKnown,service,userId};
  },
  text(value){return String(value||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(SOURCE_NOTE,'').replace(/\s+/g,' ').trim();},
  position(card,pop){const r=card.getBoundingClientRect(),box=pop.getBoundingClientRect(),zoom=Number(getComputedStyle(document.body).zoom)||1;pop.style.left=Math.max(12,Math.min(innerWidth-box.width-12,r.left+r.width/2-box.width/2))/zoom+'px';pop.style.top=Math.max(12,Math.min(innerHeight-box.height-12,r.top-24))/zoom+'px';},
  async show(card){
    const rid=App.renderId,data=await this.load(card),{d,lib,al,k,entry}=data;
    if(!App.settings.hoverPreview||this.card!==card||!card.isConnected||App.stale(rid)||Tracker.svc!==data.service||data.service?.userId!==data.userId)return;
    const title=al?.title||k?.title||lib?.Name||card.querySelector('.card-title')?.textContent||'';
    const genres=(al?.genres?.length?al.genres:k?.genres?.length?k.genres:lib?.Genres||[]).slice(0,3);
    const about=this.text(TitleSynopsis.choose(al?.synopsis,k?.synopsis)||lib?.Overview);
    const meta=[al?.format||k?.subtype,al?.year||k?.year||lib?.ProductionYear,al?.status||k?.status,al?.duration?al.duration+' min per '+(String(al.format).toLowerCase()==='movie'?'movie':'episode'):''].filter(Boolean).join(' · ');
    const status=entry?({current:'Watching',planned:'Planning',completed:'Completed',on_hold:'On hold',dropped:'Dropped'})[entry.status]||'On your list':'';
    const next=al?.next?.at>Date.now()?`Episode ${al.next.episode} airs ${new Date(al.next.at).toLocaleDateString([],{month:'short',day:'numeric'})}`:'';
    const canPlan=Tracker.loggedIn()&&data.trackerId&&data.entryKnown&&!entry;
    this.pop?.remove();const pop=document.createElement('section');pop.className='hover-pop';pop.setAttribute('aria-label','Quick look: '+title);
    pop.innerHTML=`<div class="hp-body"><span class="hp-eyebrow">QUICK LOOK</span><b class="hp-title">${esc(title)}</b>${meta?`<div class="hp-meta">${esc(meta)}</div>`:''}${genres.length?`<div class="hp-genres">${genres.map(g=>`<span>${esc(g)}</span>`).join('')}</div>`:''}<div class="hp-story"><span class="hp-story-label">THE STORY</span><p class="hp-about">${esc(about||'A synopsis isn’t available for this title yet.')}</p>${about.length>220?'<button class="hp-read-more" aria-expanded="false">Read full synopsis</button>':''}</div>${al?.studios?.length?`<small class="hp-studio">${esc(al.studios.slice(0,2).join(' · '))}</small>`:''}${entry||next?`<div class="hp-context">${entry?`<span>${icon('check')}<b>${esc(status)}</b>${Number(entry.progress)>0?' · '+Number(entry.progress)+' watched':''}</span>`:''}${next?`<span>${icon('clock')}${esc(next)}</span>`:''}</div>`:''}<div class="hp-actions"><button class="btn primary hp-watch">${icon('play','fill')}Play next episode</button><button class="btn ghost hp-open">Details</button></div>${canPlan?`<button class="btn ghost hp-plan">${icon('plus')}Add to Planning</button><p class="hp-feedback" role="status" hidden></p>`:''}</div>`;
    showTint(pop,al?.color);document.body.appendChild(pop);this.pop=pop;
    this.position(card,pop);
    const more=pop.querySelector('.hp-read-more');if(more)more.onclick=()=>{const expanded=pop.classList.toggle('hp-expanded');more.setAttribute('aria-expanded',String(expanded));more.textContent=expanded?'Show less':'Read full synopsis';this.position(card,pop);};
    pop.querySelector('.hp-watch').onclick=()=>{if(typeof TitleActions!=='undefined')TitleActions.watch(data,card);};pop.querySelector('.hp-open').onclick=()=>{this.hide();App.act(d.act,d,card);};
    const button=pop.querySelector('.hp-plan');if(button)button.onclick=async()=>{
      if(button.disabled)return;button.disabled=true;button.textContent='Adding…';
      const feedback=pop.querySelector('.hp-feedback');
      try{if(Tracker.svc!==data.service||data.service?.userId!==data.userId)throw Error('Account changed. Open this preview again.');
        const existing=await Tracker.entry(data.trackerId);if(Tracker.svc!==data.service||data.service?.userId!==data.userId)throw Error('Account changed. Open this preview again.');
        if(!existing)await Tracker.setStatus(data.trackerId,'planned');
        if(button.isConnected)button.textContent=existing?'Already on your list':'Added to Planning';
      }catch(error){if(button.isConnected){feedback.hidden=false;feedback.textContent=error.message||'Couldn’t save. Try again.';button.disabled=false;button.textContent='Retry adding';}}
    };
  },
};

// Home "New episodes this week": the latest aired episode of each show on your watching list.
function newEpisodes(aired = [], entries = []) {
  const keys = new Set();
  for (const e of entries) { if (!e.anime) continue; keys.add(String(e.anime.id)); for (const t of e.anime.titles || []) if (titleKey(t)) keys.add(titleKey(t)); }
  const seen = new Set(), out = [];
  for (const x of aired) {
    const k = keys.has(x.anime.id) ? x.anime.id : (x.anime.titles || []).map(titleKey).find((t) => t && keys.has(t));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const days = Math.floor((Date.now() - x.at) / 86400000);
    out.push(animeCard(x.anime, `EP ${x.episode} · ${days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`));
  }
  return out;
}

// A shelf. `more` = [view, params] adds a "See all" that opens the full page; `cls` styles special rows (top10, today).
function rail(title, items, { wide = false, sub = '', more = null, cls = '' } = {}) {
  if (!items.length) return '';
  return `<div class="section-head"><h2>${esc(title)}</h2>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}${more ? `<button class="see-all" data-act="seeAll" data-target="${esc(JSON.stringify(more))}">See all${icon('chev')}</button>` : ''}</div>
    <div class="rail-wrap"><button class="rail-arrow left" aria-label="Scroll left" hidden>‹</button>
      <div class="rail ${wide ? 'wide' : ''} ${cls}">${items.join('')}</div>
      <button class="rail-arrow right" aria-label="Scroll right" hidden>›</button></div>`;
}

// Home-only treatment: shared shelf navigation and card actions stay intact.
function homeShelf(html, id) {
  if(!html||!html.includes('class="rail-wrap"'))return html;
  const notes={top10:'The most-watched titles airing now.',toprated:'Standouts, sorted by score.',popular:'The titles people keep coming back to.',upcoming:'A little further on the horizon.',newin:'Fresh additions to your Jellyfin library.',season:'A new season, a fresh stack.',trending:'Find your next pick among what’s moving now.',watching:'A few familiar faces to return to.',watchingAiring:'New episodes from your rotation.',planning:'Good things waiting their turn.',neweps:'The latest episodes from your watching list.'};
  const note=id.startsWith('g:')?'A stack of '+id.slice(2)+' titles to explore.':notes[id]||'';
  let body=html.replace('class="section-head"','class="section-head ad-shelf-head"');
  body=body.replace(/<h2>([\s\S]*?)<\/h2>/,(all,title)=>`<div class="ad-shelf-heading"><h2>${title}</h2>${note?`<p>${esc(note)}</p>`:''}</div>`);
  return `<section class="ad-home-shelf" data-shelf="${esc(id)}">${body}</section>`;
}

function updateText(s) {
  switch(s?.state){
    case 'checking':return 'Checking GitHub for a newer release…';
    case 'available':return `Version ${s.version} is available. View the release notes and downloads on GitHub.`;
    case 'latest':return 'No newer public release was found.';
    case 'unpublished':return 'No public release is available yet.';
    case 'error':return s.message||'Couldn’t check GitHub. Try again later.';
    default:return (s?.state==='test'||s?.channel==='test'||s?.testBuild||App.config?.testBuild)?'Test builds install manually. Automatic updates are off. Check GitHub for public releases.':s?.packaged===false?'Development build · check public releases manually.':'Checks GitHub automatically. Choose when to download and install.';
  }
}

// Loading follows readiness; start the short entrance when the native window becomes visible.
function replaySplash(el=$('#splash')){if(!el||el.hidden)return;el.getAnimations?.({subtree:true}).forEach(animation=>{animation.cancel();animation.play();});}
let splashExitTimer=null;
let splashShownAt=null,splashReady=false;
window.native?.onWindowShown?.(()=>{splashShownAt=Date.now();replaySplash();if(splashReady)hideSplash();});
function splash(msg){
  const el=$('#splash');if(!el)return;
  clearTimeout(splashExitTimer);splashExitTimer=null;
  const replay=el.hidden||el.classList.contains('out');
  el.hidden=false;el.classList.remove('out','failed');if(replay)replaySplash(el);el.setAttribute('aria-busy','true');
  const retry=$('#splash-retry');if(retry)retry.hidden=true;
  const status=$('#splash-msg');if(status){status.setAttribute('role','status');if(msg)status.textContent=msg;}
}
function hideSplash(){
  const el=$('#splash');if(!el||el.hidden||el.classList.contains('out'))return;
  const reduced=App.settings?.reduceMotion;
  splashReady=true;clearTimeout(splashExitTimer);
  if(!reduced&&window.native?.onWindowShown){if(splashShownAt===null)return;const remaining=900-(Date.now()-splashShownAt);if(remaining>0){splashExitTimer=setTimeout(hideSplash,remaining);return;}}
  el.setAttribute('aria-busy','false');el.classList.add('out');
  splashExitTimer=setTimeout(()=>{if(el.classList.contains('out'))el.hidden=true;splashExitTimer=null;},reduced?0:280);
}
function startupFailed(error){
  splash('Couldn’t open your deck. Check your connection and try again.');
  const el=$('#splash');el.classList.add('failed');el.setAttribute('aria-busy','false');
  $('#splash-msg')?.setAttribute('role','alert');
  const retry=$('#splash-retry');if(retry){retry.hidden=false;retry.onclick=()=>window.location.reload();}
  console.error('AniDeck startup failed:',error);
}

// Errors and "couldn't do that" notes always show; plain confirmations ('good': "Saved", "Episode 5 watched"…) only
// when Settings → Appearance → Confirmation pop-ups is on.
function toast(msg, kind = '', sub = '') {
  if (kind === 'good' && !App.settings?.confirmToasts) return;
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<i class="toast-dot"></i><div class="toast-text"><div></div>${sub ? '<small></small>' : ''}</div>`;
  t.querySelector('.toast-text div').textContent = msg;
  if (sub) t.querySelector('small').textContent = sub;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 4000);
}

/* ================================ SHOW PAGE EXTRAS ================================ */
const REL_ORDER = ['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'COMPILATION', 'CHARACTER', 'OTHER'];
const REL_LABELS = { SPIN_OFF: 'Spin-off', SIDE_STORY: 'Side story', PARENT: 'Main story' };
const relLabel = (r) => REL_LABELS[r] || r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ');
const relationsCache = {};

// "Related" in the show page's left column: prequels, sequels, spin-offs from AniList.
// Coming soon: the earlier seasons go behind the cover (the story so far), each opening its season.
async function soonPrequels(rid) {
  try {
    const id = await App.showMediaId();
    const rels = relationsCache[id] || (relationsCache[id] = await AniList.relations(id));
    const first = rels.find((r) => r.relation === 'PREQUEL')?.anime;
    if (!first || App.stale(rid)) return;
    let second = null;
    const fid = String(first.id).replace(/^al:/, '');
    if (/^\d+$/.test(fid)) { const r2 = relationsCache[fid] || (relationsCache[fid] = await AniList.relations(fid).catch(() => [])); second = r2.find((r) => r.relation === 'PREQUEL')?.anime || null; }
    const stack = $('#soon2-stack');
    if (!stack || App.stale(rid)) return;
    const back = (a, k) => `<button class="soon2-back b${k}" data-act="anime" data-id="${esc(a.id)}" data-mal="${esc(a.malId || '')}" data-titles="${esc(JSON.stringify(a.titles || []))}" title="${esc(a.title)}" aria-label="Open ${esc(a.title)}">${a.poster ? `<img src="${esc(a.poster)}" alt="">` : ''}</button>`;
    stack.insertAdjacentHTML('afterbegin', (second ? back(second, 2) : '') + back(first, 1));
  } catch { /* no relations: just the cover */ }
}

async function fillRelated(rid) {
  try {
    const id = await App.showMediaId();
    const rels = relationsCache[id] || (relationsCache[id] = await AniList.relations(id));
    const box = $('#related-box');
    if (App.stale(rid) || !box) return;
    const rank = (r) => { const i = REL_ORDER.indexOf(r); return i < 0 ? 99 : i; };
    // Prequels/sequels that are other seasons of this same library show are already listed (from Jellyfin).
    const sameShow = (r) => ['PREQUEL', 'SEQUEL'].includes(r.relation) && App.libIndex?.find(r.anime)?.Id === App.showCtx?.id;
    const cards = [...rels].filter((r) => !sameShow(r)).sort((a, b) => rank(a.relation) - rank(b.relation)).slice(0, 10).map(({ relation, anime: a }) => {
      const meta = [a.subtype, a.year, App.libIndex?.find(a) ? 'In library' : ''].filter(Boolean).join(' · ');
      return `<button class="rel-card" data-act="anime" data-id="${esc(a.id)}" data-mal="${esc(a.malId || '')}" data-titles="${esc(JSON.stringify(a.titles))}">
        <div class="rel-poster">${a.poster ? `<img loading="lazy" src="${esc(a.poster)}" alt="">` : ''}</div>
        <div class="rel-text"><span class="rel-badge">${esc(relLabel(relation))}</span><div class="rel-title">${esc(a.title)}</div>${meta ? `<div class="small muted">${esc(meta)}</div>` : ''}</div>
      </button>`;
    });
    if (!cards.length) return;
    box.querySelector('.rel-list').insertAdjacentHTML('beforeend', cards.join(''));
    box.hidden = false;
  } catch { /* not on AniList, or offline: just leave the section out */ }
}

// "now", "5m", "3h", "2d", "9mo"… for discussion comments.
function shortAgo(sec) {
  const s = Math.max(0, Date.now() / 1000 - Number(sec || 0));
  const steps = [[60, 's'], [3600, 'm', 60], [86400, 'h', 3600], [604800, 'd', 86400], [2629800, 'w', 604800], [31557600, 'mo', 2629800], [Infinity, 'y', 31557600]];
  if (s < 60) return 'now';
  for (const [lim, unit, div] of steps.slice(1)) if (s < lim) return `${Math.floor(s / div)}${unit}`;
  return '';
}
// AniList comment markup -> safe HTML: images/videos become placeholders, ~!spoilers!~ stay hidden until clicked.
function commentText(raw) {
  let t = esc(String(raw || ''));
  t = t.replace(/&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/img\d*%?\(([^)]*)\)/gi, '[image]')
    .replace(/(?:youtube|webm)\(([^)]*)\)/gi, '[video]')
    .replace(/~!([\s\S]*?)!~/g, '<span class="th-spoiler" title="Spoiler: click to show">$1</span>')
    .replace(/~~~([\s\S]*?)~~~/g, '$1')
    .replace(/__(.+?)__|\*\*(.+?)\*\*/g, (_, a, b) => `<b>${a || b}</b>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1')
    .replace(/&lt;\/?[a-z][a-z0-9]*(?:\s[^&]*?)?&gt;/gi, '')
    .replace(/\n{3,}/g, '\n\n').trim()
    .replace(/\n/g, '<br>');
  return t;
}
function commentNode(c) {
  const name = c.user?.name || 'Someone', av = c.user?.avatar?.medium || c.user?.avatar?.large || '';
  const kids = c.childComments || [];
  return `<div class="th-c" data-cid="${esc(c.id)}" data-user="${esc(name)}">
    <div class="th-head"><span class="avatar">${esc(name.slice(0, 1).toUpperCase())}${av ? `<img src="${esc(av)}" alt="">` : ''}</span><b>${esc(name)}</b><span class="muted">· ${shortAgo(c.createdAt)}</span></div>
    <div class="th-body">${commentText(c.comment)}</div>
    <div class="th-acts"><button class="th-like ${c.isLiked ? 'on' : ''}" data-like="${esc(c.id)}" title="Like">${icon('heart')}<span>${c.likeCount || 0}</span></button><button class="th-reply" data-reply="${esc(c.id)}">Reply</button></div>
    ${kids.length ? `<div class="th-kids">${kids.map(commentNode).join('')}</div>` : ''}
  </div>`;
}

function titleSections(tab,action){
  return `<nav class="title-sections" aria-label="Explore this title">${[['episodes','Episodes','Choose your next episode','play'],['discussion','Discussion','Conversations & thoughts','chat'],['friends','Friends','Your circle’s progress','user']].map(([id,label,hint,glyph])=>`<button class="title-section ${tab===id?'active':''}" data-act="${action}" data-tab="${id}" aria-current="${tab===id?'page':'false'}"><span class="title-section-mark">${icon(glyph)}</span><span><b>${label}</b><small>${hint}</small></span>${icon('chev')}</button>`).join('')}</nav>`;
}

// The Discussion and Friends tabs on the show page.
async function fillSocial(tab, rid) {
  if(tab==='discussion'&&typeof Discussions!=='undefined')return Discussions.show(rid);
  if(tab==='friends'&&typeof Friends!=='undefined')return Friends.titleActivity(rid);
  const box = () => (App.stale(rid) ? null : $('#show-social'));
  const { id: seriesId, n, match } = App.showCtx || {};
  if (!match) {
    if (box()) box().innerHTML = `<div class="empty">${n === 0 ? 'Specials don’t have discussions or friends activity.' : `Find this season on Kitsu to see ${tab === 'friends' ? 'what friends think' : 'discussions'}.<br><br><button class="btn" data-act="fixMatch" data-series="${esc(seriesId)}" data-season="${n}">Find it on Kitsu</button>`}</div>`;
    return;
  }
  try {
    const mediaId = await App.showMediaId();
    const openBtn = Tracker.svc === AniList || !Kitsu.loggedIn()
      ? `<button class="btn ghost sm" data-act="link" data-url="https://anilist.co/anime/${mediaId}">Open on AniList ${icon('external')}</button>`
      : `<button class="btn ghost sm" data-act="link" data-url="${esc(match.url)}">Open on Kitsu ${icon('external')}</button>`;
    if (tab === 'discussion') {
      const threads = await AniList.threads(mediaId);
      if (!box()) return;
      box().innerHTML = `<div class="social-head"><span class="muted small">Threads from the AniList forum</span><span class="spacer"></span>${openBtn}</div>
        ${threads.length ? `<div class="thread-list">${threads.map((t) => {
          const spoiler = /^\s*\[spoilers?\]\s*/i.test(t.title);
          const isEpisode = /\bepisode\s*\d+/i.test(t.title); // episode threads get a video icon, the rest a speech bubble
          const at = t.repliedAt || t.createdAt;
          return `<button class="thread" data-act="thread" data-id="${esc(t.id)}"><span class="thread-ico ${isEpisode ? 'ep' : ''}">${icon(isEpisode ? 'video' : 'chat')}</span>
            <div class="grow"><div class="thread-title">${spoiler ? '<span class="spoiler-tag">Spoilers</span>' : ''}${esc(t.title.replace(/^\s*\[spoilers?\]\s*/i, ''))}</div>
              <div class="small muted">${t.replyCount || 0} ${t.replyCount === 1 ? 'reply' : 'replies'}${at ? ` · active ${esc(timeAgo(at * 1000))}` : ''}</div></div>${icon('external')}</button>`;
        }).join('')}</div>` : '<div class="empty">No discussion threads for this show yet.</div>'}`;
      return;
    }
    if (!AniList.loggedIn()) {
      if (!box()) return;
      box().innerHTML = `<div class="empty">${Kitsu.loggedIn() ? 'Kitsu doesn’t share what the people you follow are watching, so Friends uses AniList.' : 'Sign in to AniList to see which people you follow are watching this.'}
        ${AniList.available() ? '<br><br><button class="btn primary" data-act="anilistLogin">Sign in to AniList</button>' : ''}</div>`;
      return;
    }
    const friends = await AniList.friends(mediaId);
    if (!box()) return;
    box().innerHTML = `<div class="social-head"><span class="muted small">People you follow on AniList</span><span class="spacer"></span>${openBtn}</div>
      ${friends.length ? `<div class="friend-list">${friends.map((f) => `<button class="friend" data-act="link" data-url="${esc(f.user.siteUrl)}">
          <img src="${esc(f.user.avatar?.medium || '')}" alt=""><div class="grow"><b>${esc(f.user.name)}</b>
          <div class="small muted"><span class="friend-status ${esc(f.status)}">${esc(f.rewatching ? 'Rewatching' : STATUS_LABELS[f.status] || f.status)}</span>${f.progress ? ` · Episode ${f.progress}` : ''}${f.score ? ` · ★ ${f.score}` : ''}</div></div>
          ${f.updatedAt ? `<span class="friend-time">${esc(timeAgo(f.updatedAt * 1000))}</span>` : ''}</button>`).join('')}</div>`
        : '<div class="empty">None of the people you follow have this on their list yet.</div>'}`;
  } catch (e) {
    if (box()) box().innerHTML = `<div class="empty">Couldn’t load this from AniList: ${esc(e.message)}<br><br><button class="btn" data-act="retry">Try again</button></div>`;
  }
}

// "5m ago", "3h ago", "2d ago", "4mo ago", "1y ago"
function timeAgo(t) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  if (m < 525600) return `${Math.round(m / 43200)}mo ago`;
  return `${Math.round(m / 525600)}y ago`;
}

// One airing in a schedule day: poster, time, title, episode. `isNext` = the next thing to air this week.
function scheduleCard(x, now, isNext = false) {
  const a = x.anime, inLib = App.libIndex?.find(a);
  const time = new Date(x.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const meta = [`EP ${esc(x.episode)}`, isNext ? 'next' : '', inLib ? '<span class="sch-lib">In library</span>' : ''].filter(Boolean).join(' · ');
  return `<button class="sch-card ${x.at <= now ? 'aired' : ''} ${isNext ? 'next' : ''}" data-act="anime" data-id="${esc(a.id)}" data-mal="${esc(a.malId || '')}" data-titles="${esc(JSON.stringify(a.titles))}" title="${esc(a.title)}${a.episodes ? ` · ${esc(a.episodes)} episodes` : ''}">
    <div class="sch-poster">${a.poster ? `<img loading="lazy" src="${esc(a.poster)}" alt="">` : ''}</div>
    <div class="sch-info"><span class="sch-time">${esc(time)}</span><span class="sch-title">${esc(a.title)}</span><span class="sch-ep">${meta}</span></div>
  </button>`;
}

/* ---------- My list: progress tracks, what's out, quick +1 ---------- */
// For each show on your list that's airing: how many episodes are out and when the next one airs, from this week's
// schedule and the past week's airings. Matched by AniList id, or by title for Kitsu lists.
async function listAiring() {
  const [week, recent] = await Promise.all([Schedule.week().catch(() => []), Schedule.recent().catch(() => [])]);
  const now = Date.now(), byId = new Map(), byKey = new Map();
  const keysOf = (a) => (a.titles || []).slice(0, 4).filter((t) => String(t).trim().length >= 4).map(titleKey).filter(Boolean);
  const add = (x) => {
    const id = String(x.anime.id);
    const cur = byId.get(id) || { aired: 0, next: null };
    if (x.at <= now) cur.aired = Math.max(cur.aired, x.episode);
    else if (!cur.next || x.at < cur.next.at) cur.next = { episode: x.episode, at: x.at };
    byId.set(id, cur);
    for (const k of keysOf(x.anime)) if (!byKey.has(k)) byKey.set(k, cur);
  };
  [...recent, ...week].forEach(add);
  for (const v of byId.values()) if (v.next) v.aired = Math.max(v.aired, v.next.episode - 1);
  return (anime) => byId.get(String(anime.id)) || (String(anime.id).startsWith('al:')?null:keysOf(anime).map((k) => byKey.get(k)).find(Boolean)) || null;
}
// Episodes watched, time spent, completed and your mean score, over your whole list.
function listStats(entries) {
  const eps = entries.reduce((n, e) => n + (e.progress || 0), 0);
  const mins = eps * 24, d = Math.floor(mins / 1440), h = Math.round((mins % 1440) / 60);
  const rated = entries.filter((e) => e.rating);
  const mean = rated.length ? (rated.reduce((n, e) => n + Number(e.rating), 0) / rated.length) : 0;
  const tile = (v, l) => `<div class="ml-stat"><b>${v}</b><span>${l}</span></div>`;
  return tile(eps.toLocaleString(), 'episodes watched') + tile(d ? `${d}d ${h}h` : `${h}h`, 'time watched (approx.)')
    + tile(entries.filter((e) => e.status === 'completed').length.toLocaleString(), 'completed') + tile(mean ? mean.toFixed(1) : '—', 'your mean score');
}
// Progress as a track: watched, out but unwatched, still to come. Short shows get one segment per episode.
function listTrack(progress, total, aired) {
  const span = total || Math.max(aired || 0, progress, 1);
  const w = Math.min(100, (progress / span) * 100), a = Math.min(100, (Math.max(progress, aired || 0) / span) * 100);
  const seg = total && total <= 30 ? ` seg" style="--w:${w}%;--a:${a}%;--n:${total}` : `" style="--w:${w}%;--a:${a}%`;
  return `<div class="ml-track${seg}"></div>`;
}

/* ---------- Schedule: a day timeline beside what's on air next ---------- */
const schClock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
// "in 2h 14m", "in 3d 4h", "in 40s"; once it's out, "aired 3h ago".
function untilText(at, now = Date.now()) {
  const s = Math.round((at - now) / 1000);
  if (s <= 0) return `aired ${timeAgo(at)}`;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `in ${d}d ${h}h` : h ? `in ${h}h ${m}m` : m ? `in ${m}m` : `in ${s}s`;
}
// The big countdown: "04:12:08", or "2d 04:12:08".
function countdownText(at, now = Date.now()) {
  const s = Math.max(0, Math.floor((at - now) / 1000)), p = (n) => String(n).padStart(2, '0');
  const d = Math.floor(s / 86400), hms = `${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return d ? `${d}d ${hms}` : hms;
}
// Where an airing stands for you: counting down, out now, new for you, watched, or how many to catch up on.
function airState(x, now) {
  if (x.at > now) return { cls: 'soon', text: untilText(x.at, now) };
  const p = x.progress;
  if (p == null) return { cls: 'out', text: 'Out now' };
  if (p >= x.episode) return { cls: 'done', text: 'Watched' };
  if (p === x.episode - 1) return { cls: 'new', text: 'New for you' };
  return { cls: 'behind', text: `${x.episode - p} to catch up` };
}
const schAttrs = (a) => `data-act="anime" data-id="${esc(a.id)}" data-mal="${esc(a.malId || '')}" data-titles="${esc(JSON.stringify(a.titles || []))}"`;
const partOfDay = (t) => { const h = new Date(t).getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night'; };

// One airing on the timeline: time in the gutter, then poster, title, episode and where it stands for you.
function schRow(x, now, i, showTime, isNext) {
  const a = x.anime, lib = App.libIndex?.find(a), st = airState(x, now);
  const sub = [`Episode ${x.episode}${a.episodes ? ` of ${a.episodes}` : ''}`, ...(a.genres || []).slice(0, 2)].join(' · ');
  return `<div class="tl-row ${x.at <= now ? 'aired' : ''} ${isNext ? 'next' : ''}" style="--i:${Math.min(i, 14)}">
    <span class="tl-time">${showTime ? esc(schClock(x.at)) : ''}</span><span class="tl-dot" aria-hidden="true"></span>
    <button class="tl-card" ${schAttrs(a)} title="${esc(a.title)}">
      <span class="tl-poster">${a.poster ? `<img loading="lazy" src="${esc(a.poster)}" alt="">` : ''}</span>
      <span class="tl-info"><b>${esc(a.title)}</b><small>${esc(sub)}</small></span>
      ${lib ? '<span class="tl-lib">In library</span>' : '<span></span>'}
      <span class="tl-state ${st.cls}" ${x.at > now ? `data-until="${x.at}"` : ''}>${esc(st.text)}</span>
    </button>
    ${lib ? `<button class="tl-open" data-act="series" data-id="${esc(lib.Id)}" title="Open in your library" aria-label="Open ${esc(a.title)} in your library">${icon('play', 'fill')}</button>` : '<span></span>'}
  </div>`;
}
// A day's airings, grouped Morning / Afternoon / Evening…, with a "now" line on today.
function schTimeline(eps, now, isToday, upNext) {
  if (!eps.length) return `<div class="tl-empty">${icon('clock')}<b>Nothing airs this day</b><span>Pick another day above, or switch to All shows.</span></div>`;
  let html = '', part = '', lastTime = '', nowDone = !isToday;
  eps.forEach((x, i) => {
    if (!nowDone && x.at > now) { html += `<div class="tl-now" id="tl-now"><span>Now · ${esc(schClock(now))}</span></div>`; nowDone = true; }
    const p = partOfDay(x.at);
    if (p !== part) { html += `<div class="tl-part">${esc(p)}</div>`; part = p; lastTime = ''; }
    const t = schClock(x.at);
    html += schRow(x, now, i, t !== lastTime, x === upNext);
    lastTime = t;
  });
  if (!nowDone) html += `<div class="tl-now" id="tl-now"><span>Now · ${esc(schClock(now))}</span></div>`;
  return `<div class="tl-list">${html}</div>`;
}
// The seven days across the top; each has a 24-hour strip with a tick for every airing (and "now" on today).
function schDayTabs(days, sel, now) {
  const pos = (t) => { const d = new Date(t); return ((d.getHours() + d.getMinutes() / 60) / 24 * 100).toFixed(2); };
  return days.map(({ day, eps }, i) => {
    const ticks = eps.map((x) => `<i class="${x.at <= now ? 'past' : ''}" style="left:${pos(x.at)}%"></i>`).join('');
    const nowMark = i === 0 ? `<em style="left:${pos(now)}%"></em>` : '';
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : day.toLocaleDateString(undefined, { weekday: 'short' });
    return `<button class="sch-dtab ${i === sel ? 'on' : ''} ${eps.length ? '' : 'empty'}" data-day="${i}" role="tab" aria-selected="${i === sel}"
      aria-label="${esc(day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}, ${eps.length} airing">
      <span class="sch-dtab-top"><span class="sch-dtab-wd">${esc(name)}</span><b>${day.getDate()}</b></span>
      <span class="sch-dtab-strip">${ticks}${nowMark}</span>
      <small>${eps.length ? `${eps.length} episode${eps.length === 1 ? '' : 's'}` : 'Nothing'}</small></button>`;
  }).join('');
}
// "On air next": the week's next airing with a live countdown, the week at a glance, then what follows.
function schSide(items, now, upNext) {
  const later = items.filter((x) => x.at > now && x !== upNext).sort((a, b) => a.at - b.at).slice(0, 4);
  const forYou = items.filter((x) => x.at <= now && x.progress != null && x.progress < x.episode).length;
  const inLib = new Set(items.filter((x) => App.libIndex?.find(x.anime)).map((x) => String(x.anime.id))).size;
  const counts = {};
  items.forEach((x) => { const k = new Date(x.at).toDateString(); counts[k] = (counts[k] || 0) + 1; });
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const busyDay = busiest ? new Date(busiest[0]).toLocaleDateString(undefined, { weekday: 'long' }) : '—';
  let next = `<div class="sch-next empty"><span class="sch-next-label">On air next</span><b class="sch-next-done">That’s everything this week</b><span class="muted small">New airings show up here as they’re announced.</span></div>`;
  if (upNext) {
    const a = upNext.anime, lib = App.libIndex?.find(a);
    const day = new Date(upNext.at), today = new Date(now);
    const dayName = day.toDateString() === today.toDateString() ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'long' });
    next = `<div class="sch-next" id="sch-next" data-al="${esc(String(a.id).replace(/^al:/, ''))}" style="--next-art:url(&quot;${esc(a.poster || '')}&quot;)">
      <div class="sch-next-art" aria-hidden="true"></div>
      <span class="sch-next-label"><i></i>On air next</span>
      <div class="sch-clock" data-clock="${upNext.at}">${esc(countdownText(upNext.at, now))}</div>
      <div class="sch-next-when">${esc(dayName)} · ${esc(schClock(upNext.at))}</div>
      <button class="sch-next-show" ${schAttrs(a)}>${a.poster ? `<img src="${esc(a.poster)}" alt="">` : ''}
        <span><b>${esc(a.title)}</b><small>Episode ${esc(upNext.episode)}${a.episodes ? ` of ${esc(a.episodes)}` : ''}</small></span></button>
      <div class="row gap">${lib ? `<button class="btn primary sm" data-act="series" data-id="${esc(lib.Id)}">${icon('play', 'fill')} Open</button>` : ''}<button class="btn ${lib ? 'ghost' : 'primary'} sm" ${schAttrs(a)}>Details</button></div>
    </div>`;
  }
  return `${next}
    <div class="sch-glance"><h4>This week</h4><div class="sch-stats">
      <div><b>${items.length}</b><span>episodes</span></div>
      <div><b>${forYou}</b><span>out for you</span></div>
      <div><b>${inLib}</b><span>in your library</span></div>
      <div><b>${esc(busyDay)}</b><span>busiest day</span></div></div></div>
    ${later.length ? `<div class="sch-then"><h4>After that</h4>${later.map((x) => `<button class="sch-then-row" ${schAttrs(x.anime)}>
      <span class="sch-then-when" data-until="${x.at}">${esc(untilText(x.at, now))}</span><span class="sch-then-title">${esc(x.anime.title)}</span><small>Ep ${esc(x.episode)}</small></button>`).join('')}</div>` : ''}`;
}
function scheduleTimelineSkeleton() {
  const row = '<div class="sk-sch"><div class="skel sk-sch-poster"></div><div class="sk-stack"><div class="skel sk-line" style="width:45%"></div><div class="skel sk-line" style="width:25%"></div></div></div>';
  return `<div class="sch-days">${'<div class="skel" style="height:86px;border-radius:14px"></div>'.repeat(7)}</div>
    <div class="sch-body"><aside class="sch-side"><div class="skel" style="height:300px;border-radius:18px;flex:none"></div><div class="skel" style="height:130px;border-radius:16px;flex:none"></div></aside>
    <div class="sch-tl"><div class="tl-list" style="gap:12px">${row.repeat(6)}</div></div></div>`;
}

function firstUsableArtwork(groups,measure,score,deadlineMs=2200){
 return new Promise(resolve=>{let remaining=groups.length,best=null,bestScore=0,done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve(best);};const timer=setTimeout(finish,deadlineMs);
 if(!remaining)return finish();for(const group of groups)Promise.resolve().then(group).then(urls=>Promise.all([...new Set((urls||[]).filter(Boolean))].slice(0,3).map(async url=>{const image=await measure(url);if(done)return;const value=score(image);if(value>bestScore){best=image;bestScore=value;}if(value>=.65)finish();}))).catch(()=>{}).finally(()=>{if(!--remaining)finish();});
 });
}
const HomeReads={active:null,budgetMs:600,
 scope(){return queueScope()+':'+(typeof Cloud==='undefined'?'':Cloud.ident());},
 begin(rid){let b=this.active;if(!b||b.nextRid!==rid||b.scope!==this.scope())b={scope:this.scope(),rid,values:new Map(),pending:new Map(),failed:new Set(),timer:null,nextRid:null,painted:false,dirty:false};b.rid=rid;b.nextRid=null;this.active=b;return b;},
 markPaint(rid){const b=this.active;if(b?.rid!==rid)return;b.painted=true;if(b.dirty)this.schedule(b);},
 schedule(b){b.dirty=true;clearTimeout(b.timer);b.timer=setTimeout(()=>{if(this.active!==b||App.view!=='home'||App.stale(b.rid)||b.scope!==this.scope()||!b.painted)return;b.dirty=false;b.nextRid=App.renderId+1;Promise.resolve(App.refresh()).catch(()=>{});},120);},
 async read(b,key,loader,fallback=[]){if(b.values.has(key))return b.values.get(key);if(b.pending.has(key))return fallback;
 const job=Promise.resolve().then(loader).catch(()=>{b.failed.add(key);return fallback;}).then(value=>{b.values.set(key,value);b.pending.delete(key);this.schedule(b);return value;});b.pending.set(key,job);let timer;try{return await Promise.race([job,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),this.budgetMs);})]);}finally{clearTimeout(timer);}
 }
};

/* ================================ VIEWS ================================ */
const Views = {
  async home(_params={},rid=App.renderId) {
    const batch=HomeReads.begin(rid),read=(key,loader,fallback=[])=>HomeReads.read(batch,key,loader,fallback);
    const sections = homeOrder().filter((s) => s.on).map((s) => s.id); // Settings → Home screen → Sections
    const want = (...ids) => ids.some((x) => sections.includes(x)); // only fetch what's shown
    const none = () => [];
    let queueFailed = false;
    const queueFailure = () => { queueFailed = true;batch.failed.add('watching');return []; };
    const browse = (f) => read('browse:'+JSON.stringify(f),()=>Kitsu.browse(f,0,20).then(r=>r.items));
    const genreIds = sections.filter((x) => x.startsWith('g:'));
    const airingP = want('yournext') ? read('airing',()=>listAiring(),null) : Promise.resolve(null); // which queue episodes are out yet
    const [resume, nextUp, latestByLib, watching, trending, seasonal, popular, planning, topRated, allTime, upcoming, recent, mineThisWeek, ...genreLists] = await Promise.all([
      [],
      [],
      [],
      want('watching', 'watchingAiring', 'yournext') ? read('watching',()=>(want('yournext')?queueWatching():Tracker.watching()).catch(queueFailure)) : [],
      want('featured', 'trending', 'mosaic') ? read('trending',()=>Kitsu.trending()) : [],
      want('featured', 'season') ? read('seasonal',()=>Kitsu.seasonal()) : [],
      want('trending', 'top10', 'mosaic') ? read('popular-airing',()=>Kitsu.popularAiring()) : [],
      want('planning') ? read('planning',()=>Tracker.list('planned',0,24).then(r=>r.entries)) : [],
      want('toprated') ? browse({ sort: 'rating' }) : [],
      want('popular') ? browse({ sort: 'popular' }) : [],
      want('upcoming') ? browse({ status: 'upcoming' }) : [],
      want('neweps') ? read('recent',()=>Promise.all([Schedule.recent(),Tracker.list('current',0,100).then(r=>r.entries)]),[[],[]]) : [[], []],
      want('greeting', 'airingToday', 'week') ? read('week',()=>Schedule.week().then(mySchedule)) : [],
      ...genreIds.map((g) => browse({ genre: g.slice(2) })),
    ]);
    [trending, seasonal, popular, topRated, allTime, upcoming, ...genreLists].forEach((l) => l.splice(0, l.length, ...sfw(l)));
    if (ANIME_ONLY) {
      const keep = (x) => App.isAnime(x.SeriesId || x.Id);
      [resume, nextUp].forEach((l) => l.splice(0, l.length, ...l.filter(keep)));
      latestByLib.forEach((l) => l.splice(0, l.length, ...l.filter(keep)));
    }
    const resumeIds = new Set(resume.map((e) => e.SeriesId));
    const up = nextUp.filter((e) => !resumeIds.has(e.SeriesId));

    // Carousel: trending anime with artwork; falls back to your newest library items.
    // Banner art, best first: your library's backdrop, Kitsu's full-size banner, then Trakt HD fanart.
    // homeAfter() measures each image and drops anything too small to look sharp.
    const inMosaic = new Set(sections.includes('mosaic') ? uniqueShows([...trending, ...popular]).slice(0, mzCount()).map((a) => String(a.id)) : []);
    const candidates = sections.includes('featured') ? uniqueShows([...seasonal.slice(0, 10), ...trending]).filter((a) => !inMosaic.has(String(a.id))).slice(0, 10) : [];
    let slides = await Promise.all(candidates.map(async (a) => {
      const lib = App.libIndex?.find(a);
      // homeAfter() tries AniList's banner and ani.zip fanart first, then these, then Trakt fanart (only if needed).
      const srcs = [lib?.BackdropImageTags?.length ? Jellyfin.img(lib.Id, 'Backdrop', { maxWidth: 3840, quality: 92 }) : '',AniList.detailsCache?.[a.id]?.value?.banner,a.coverHd||a.cover].filter(Boolean);
      return { kind: 'anime', a, srcs, fan: [a.canonical || a.title, a.year] };
    }));
    slides = slides.filter(Boolean);
    if (sections.includes('featured') && slides.length < 3) slides = slides.concat(latestByLib.flat().filter((x) => x.BackdropImageTags?.length).slice(0, 6)
      .map((x) => ({ kind: 'item', x, srcs: [Jellyfin.img(x.Id, 'Backdrop', { maxWidth: 3840, quality: 92 })] })));
    App.slides = slides;

    const carouselHtml = slides.length ? `<section class="hero-carousel" id="carousel">
      ${slides.map((sl, i) => heroSlide(sl, i)).join('')}
      <div class="car-nav"><button class="car-arrow" data-car="-1" aria-label="Previous">${icon('chev')}</button>
        <div class="car-dots"></div>
        <button class="car-arrow" data-car="1" aria-label="Next">${icon('chev')}</button></div>
    </section>` : '';
    const heroFirst = sections.includes('yournext');
    const airingForQueue=heroFirst?await airingP:null;
    const verificationKey='queue-verified:'+watching.map(w=>w.anime?.id+':'+w.progress).join(',')+':'+batch.values.has('airing');
    const queueWatchingVerified=heroFirst?await read(verificationKey,()=>verifyQueueAiring(watching,airingForQueue)):watching;
    if(heroFirst)await read('queue-art',()=>QueueArt.load(),null);
    if(batch.pending.has('watching')||batch.failed.has('watching')||batch.pending.has(verificationKey))queueFailed=true;
    const queueItems = heroFirst ? buildQueue(resume, up, queueWatchingVerified, airingForQueue) : [];
    for (const it of queueItems) { const u = QueueArt.get(it); if (u) { it.resolvedBackdrop = u; it.thumb = u; } } // last time's banner, straight away
    let html = heroFirst ? yourNextHero(queueItems, queueFailed) : carouselHtml;
    html += '<div class="page home-rows">';
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const today = mineThisWeek.filter((x) => x.at >= +dayStart && x.at < +dayStart + 86400000).sort((a, b) => a.at - b.at);
    const cs = Kitsu.currentSeason();
    const airing = (a) => /current|releasing|airing/.test(a?.status || '');
    const progressCard = (w) => animeCard(w.anime, `Ep ${w.progress}${w.anime.episodes ? ` / ${w.anime.episodes}` : ''}`, {...w,status:w.status||'current'});
    const splitWatching = sections.includes('watchingAiring');
    const shows = (list) => uniqueShows(list).map((a) => animeCard(a));
    const rows = {
      greeting: () => homeGreeting(today, resume),
      airingToday: () => airingTodayRow(today),
      continue: () => rail('Continue watching', resume.map(episodeCard), { wide: true }),
      upnext: () => rail('Up next', up.map(episodeCard), { wide: true }),
      neweps: () => rail('New this week', newEpisodes(...recent)),
      watchingAiring: () => rail('Airing now', watching.filter((w) => airing(w.anime)).map(progressCard)),
      watching: () => rail(splitWatching ? 'Keep watching' : `Watching on ${Tracker.name}`, (splitWatching ? watching.filter((w) => !airing(w.anime)) : watching).map(progressCard)),
      planning: () => rail('Plan to watch', sfw(planning.map((e) => e.anime).filter(Boolean)).map((a) => animeCard(a)), { more: ['mylist', { tab: 'planned' }] }),
      season: () => (seasonal.length ? rail(`This season · ${cs.label}`, shows(seasonal), { more: ['browse', { src: 'anime', f: { season: cs.season, year: String(cs.year) } }] }) : ''),
      deck: () => '<!--home-deck-->', // filled in by deck-features.js
      week: () => weekRibbon(mineThisWeek),
      featured: () => (heroFirst && carouselHtml ? `<div class="spot-wrap">${carouselHtml}</div>` : ''),
      mosaic: () => mosaicRow(uniqueShows([...trending, ...popular]).slice(0, mzCount())),
      // With the chart on, the shelf starts after the shows it already has.
      trending: () => rail('Trending now', uniqueShows([...trending, ...popular]).slice(sections.includes('mosaic') ? mzCount() : 0, 29).map((a) => animeCard(a)), { more: ['browse', { src: 'anime', f: { status: 'current', sort: 'popular' } }] }),
      top10: () => rail('Top 10 airing now', uniqueShows(popular).slice(0, 10).map((a, i) => `<div class="top10-item"><span class="top10-n" aria-hidden="true">${i + 1}</span>${animeCard(a)}</div>`), { cls: 'top10' }),
      toprated: () => rail('Top rated', shows(topRated), { more: ['browse', { src: 'anime', f: { sort: 'rating' } }] }),
      popular: () => rail('All-time popular', shows(allTime), { more: ['browse', { src: 'anime', f: { sort: 'popular' } }] }),
      upcoming: () => rail('Coming soon', shows(upcoming), { more: ['browse', { src: 'anime', f: { status: 'upcoming' } }] }),
      newin: () => App.libraries.map((l, i) => rail(`New in ${l.Name}`, latestByLib[i].map((it) => posterCard(App.latestEntry(it))))).join(''),
    };
    genreIds.forEach((g, i) => { rows[g] = () => rail(g.slice(2), shows(genreLists[i]), { more: ['browse', { src: 'anime', f: { genre: g.slice(2) } }] }); });
    let lowerShelves=false;
    for(const id of sections){if(id==='mosaic'||id==='trending')lowerShelves=true;const row=rows[id]?.()||'';html+=lowerShelves?homeShelf(row,id):row;}
    return html + '</div>';
  },
  async homeAfter(_p, rid) {
    QueueRecovery.schedule(rid);
    // Each part on its own, so one failing can't leave the rest (Trending's art, the carousel…) undone.
    for (const step of [() => bindYourNext(rid), () => bindWeek(), () => enhanceMosaic(rid).catch((e) => console.warn('Trending:', e.message))]) {
      try { step(); } catch (e) { console.warn('Home:', e.message); }
    }
    const car = $('#carousel');
    if (!car) return;
    // Each slide's art, in order of preference: AniList banner, ani.zip (TheTVDB) fanart, Kitsu cover, Trakt fanart,
    // your library's backdrop. The first that's sharp enough for the carousel at this size wins (like title pages);
    // a slide with nothing reasonably sharp is dropped. Anime slides also switch to AniList's title and info.
    const box = car.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);

    const measure = (u) => new Promise((res) => {
      const t = new Image(), timer = setTimeout(() => res(null), 7000);
      t.onload = () => { clearTimeout(timer); res({ u, w: t.naturalWidth, h: t.naturalHeight }); };
      t.onerror = () => { clearTimeout(timer); res(null); };
      t.src = u;
    });
    const loadBest = async (slide) => {
      const img=slide.querySelector('.slide-img'),fan=JSON.parse(img.dataset.fan||'null');
      const alP=slide.dataset.kid?AniList.details(slide.dataset.kid).catch(()=>null):Promise.resolve(null);
      alP.then(al=>{if(!al||App.stale(rid)||!slide.isConnected)return;if(al.cover)slide.dataset.poster=al.cover;const heading=slide.querySelector('.slide-text h1');if(!heading.querySelector('.hero-logo'))heading.textContent=al.title||heading.textContent;slide.querySelector('.slide-meta').textContent=[al.score?'★ '+al.score+'%':'',al.format,al.year,al.episodes?al.episodes+' eps':'',...(al.genres||[]).slice(0,2)].filter(Boolean).join(' · ');showLogo(heading,al.id,seasonNumberIn(al.title||''),al.englishTitle||al.title||'');}).catch(()=>{});
      const known=JSON.parse(img.dataset.srcs||'[]');
      const groups=[()=>known,async()=>[(await alP)?.banner],async()=>[(await AniZip.get((await alP)?.id))?.fanart],async()=>typeof kitsuCover==='function'?[await kitsuCover({kitsuId:slide.dataset.kid||null})]:[],async()=>typeof HDArt==='undefined'?[]:(await HDArt.backdrops({seriesId:slide.dataset.lib||null,alId:(await alP)?.id})).slice(0,2),async()=>fan?.[0]?Trakt.fanartFor(fan[0],fan[1]):[]];
      const best=await firstUsableArtwork(groups,measure,image=>carouselArtworkScore(image,box,dpr));
      if(App.stale(rid)||!slide.isConnected)return 0;if(best)img.dataset.best=best.u;return carouselArtworkScore(best,box,dpr);
    };
    car.classList.add('loading-art');
    const pendingSlides=[...car.querySelectorAll('.slide')],scores=new Array(pendingSlides.length).fill(0);
    let artCursor=0,firstPainted=false;
    car.querySelector('.car-nav').hidden=true;
    const loadWorker=async()=>{
      while(artCursor<pendingSlides.length){
        if(App.stale(rid))return;
        const index=artCursor++,slide=pendingSlides[index];
        scores[index]=await loadBest(slide);
        if(App.stale(rid))return;
        if(!firstPainted&&scores[index]>=.65){
          firstPainted=true;const image=slide.querySelector('.slide-img');image.src=image.dataset.best;
          pendingSlides.forEach(s=>s.classList.toggle('on',s===slide));car.classList.remove('loading-art');
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(3,pendingSlides.length)},loadWorker));
    if (App.stale(rid)) return;
    // Sharp art only, unless that leaves fewer than three slides: then slightly softer landscape art may fill in, so a
    // wide window never empties the Spotlight.
    const floor = scores.filter((x) => x >= 0.65).length >= 3 ? 0.65 : 0.5;
    [...car.querySelectorAll('.slide')].forEach((sl, j) => {
      const img = sl.querySelector('.slide-img');
      if (scores[j] >= floor && img.dataset.best) img.src = img.dataset.best;
      else sl.remove();
    });
    const dotsBox = car.querySelector('.car-dots');
    const slides = [...car.querySelectorAll('.slide')];
    if (!slides.length) { car.remove(); return; }
    // Dots, with the current slide as a pill that fills up until the next one (pauses while you hover).
    dotsBox.innerHTML = slides.map((sl, j) => {
      const name = sl.querySelector('.slide-text h1')?.textContent?.trim() || `Slide ${j + 1}`;
      return `<button class="car-dot ${j ? '' : 'on'}" data-dot="${j}" aria-label="${esc(name)}" title="${esc(name)}"><i></i></button>`;
    }).join('');
    slides.forEach((sl, j) => sl.classList.toggle('on', j === 0));
    car.querySelector('.car-nav').hidden = slides.length < 2;
    car.classList.remove('loading-art');
    const dots = [...car.querySelectorAll('.car-dot')];
    // 4.8 seconds a slide by default (Settings → Home screen). It waits while you hover, while the window is hidden or the
    // player is open, and while the carousel is scrolled out of view, so you never come back to it halfway through a show.
    const SLIDE_MS = spotlightDuration();
    car.style.setProperty('--slide-ms', `${SLIDE_MS}ms`);
    let i = 0, visible = true, hovering = false;
    const paused = () => hovering || !visible || document.hidden || !$('#player').hidden;
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, j) => s.classList.toggle('on', j === i));
      dots.forEach((d, j) => { d.classList.remove('on'); if (j === i) { void d.offsetWidth; d.classList.add('on'); } }); // restart the fill
    };
    const tick = () => { if (!paused()) go(i + 1); };
    const restart = () => { clearInterval(App.carouselTimer); App.carouselTimer = setInterval(tick, SLIDE_MS); car.classList.toggle('paused', paused()); };
    car.querySelectorAll('[data-car]').forEach((b) => { b.onclick = () => { go(i + Number(b.dataset.car)); restart(); }; });
    dots.forEach((d) => { d.onclick = () => { go(Number(d.dataset.dot)); restart(); }; });
    car.onmouseenter = () => { hovering = true; car.classList.add('paused'); clearInterval(App.carouselTimer); };
    car.onmouseleave = () => { hovering = false; go(i); restart(); };
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was && !hovering) { go(i); restart(); } // back in view: this slide gets its full time again
      else car.classList.toggle('paused', paused());
    }, { threshold: 0.35 }).observe(car);
    go(0);
    restart();
  },

  async library({ cat }) {
    if(Jellyfin.connected()&&(!App.libraryLoadedAt||Date.now()-App.libraryLoadedAt>120000))await App.refreshLibrary();
    if (!Jellyfin.connected()) return `<div class="page"><h1>Your Jellyfin library</h1><div class="empty">Connect a Jellyfin server to browse your own media here.<br>You can browse and stream anime without one.<br><br><button class="btn primary" data-act="jellyLogin">Connect Jellyfin library</button></div></div>`;
    const cats = [['tv','TV shows'],['movies','Movies'],['anime','Anime']];
    const counts = Object.fromEntries(cats.map(([c]) => [c, App.allItems.filter((x) => App.category(x) === c).reduce((n, x) => n + App.entriesFor(x).length, 0)]));
    if (!cat || !counts[cat]) cat = cats.find(([c]) => counts[c])?.[0] || cats[0][0];
    App.params.cat = cat;
    return `<div class="page">
      <div class="page-head"><h1>Your Jellyfin library</h1><span class="spacer"></span>
        <select id="lib-sort" style="width:180px"><option value="name">A–Z</option><option value="added">Recently added</option><option value="year">Newest first</option><option value="unwatched">Unwatched</option></select>
        <input type="search" id="lib-filter" placeholder="Filter…" style="width:240px"></div>
      <div class="tabs" ${cats.length < 2 ? 'hidden' : ''}>${cats.filter(([c]) => counts[c]).map(([c, l]) => `<button class="tab ${c === cat ? 'active' : ''}" data-act="libTab" data-cat="${c}">${l}<span class="tab-count"> ${counts[c]}</span></button>`).join('')}</div>
      <div class="grid" id="lib-grid"></div></div>`;
  },
  libraryAfter() {
    if(!Jellyfin.connected()||!$('#lib-filter')||!$('#lib-sort')||!$('#lib-grid'))return;
    const all = App.allItems.filter((x) => App.category(x) === App.params.cat).flatMap((x) => App.entriesFor(x));
    const draw = () => {
      const q = norm($('#lib-filter').value);
      let list = all.filter((e) => !q || norm(entryTitle(e)).includes(q) || norm(e.item.Name).includes(q) || norm(e.item.OriginalTitle).includes(q));
      const sort = $('#lib-sort').value;
      // Seasons of one show stay together and in order when sorting by name.
      const seasonOrder = (e) => (e.season === 0 ? 99 : e.season ?? 1); // specials last
      if (sort === 'name') list = [...list].sort((a, b) => String(a.item.SortName || a.item.Name).localeCompare(String(b.item.SortName || b.item.Name)) || seasonOrder(a) - seasonOrder(b));
      if (sort === 'added') list = [...list].sort((a, b) => String((b.seasonItem || b.item).DateCreated || '').localeCompare(String((a.seasonItem || a.item).DateCreated || '')));
      if (sort === 'year') list = [...list].sort((a, b) => entryYear(b) - entryYear(a));
      if (sort === 'unwatched') list = list.filter((e) => (e.seasonItem || e.item).UserData?.UnplayedItemCount || (e.item.Type === 'Movie' && !e.item.UserData?.Played));
      $('#lib-grid').innerHTML = list.length ? list.map(posterCard).join('') : '<div class="empty" style="grid-column:1/-1">Nothing here.</div>';
    };
    $('#lib-filter').oninput = draw; $('#lib-sort').onchange = draw;
    draw();
  },

  // One season's page. Each season is its own entry (like AniList/Kitsu); the others are linked under Related.
  async show({ id, season, range, tab = 'episodes' }, rid) {
    const [series, seasonList] = await Promise.all([Jellyfin.item(id), Jellyfin.seasons(id)]); // together, not one after the other
    const seasons = seasonList.sort((a, b) => (a.IndexNumber ?? 99) - (b.IndexNumber ?? 99));
    if (!seasons.length) return `<div class="page"><div class="empty">No seasons found for ${esc(series.Name)}.</div></div>`;
    const firstUnwatched = seasons.find((s) => s.IndexNumber > 0 && s.UserData?.UnplayedItemCount) || seasons.find((s) => s.IndexNumber > 0) || seasons[0];
    const cur = seasons.find((s) => String(s.IndexNumber) === String(season)) || firstUnwatched;
    const episodes = await Jellyfin.episodes(id, cur.Id);
    if (App.stale(rid)) return '';
    const n = cur.IndexNumber ?? 1;
    const anime = App.isAnime(id);if(!anime)tab='episodes';
    let match = n === 0 || !anime ? null : await Matcher.auto(series, cur, episodes.filter((e) => e.IndexNumber > 0).length);
    // Only the first season decides (later seasons can legitimately be missing on Kitsu).
    if (anime && !match && n <= 1 && await App.confirmAnime(series, match)) return Views.show({ id, season, range, tab }, rid);
    App.matches = await Matcher.all(); App.libIndex = buildLibraryIndex([], {});
    App.showCtx = { id, n, match };
    App.showEps = episodes; // for "Watched up to here"
    App.showAl = null;
    const [entry, kfull, al] = await Promise.all([
      match && Tracker.loggedIn() ? Tracker.entry(match.id).catch(() => null) : null,
      match ? Kitsu.animeFull(match.id).catch(() => null) : null,
      match && anime ? AniList.details(match.id).catch(() => null) : null, // AniList art + next episode
    ]);
    if (App.stale(rid)) return '';
    App.showAl = al;

    // ---- summary numbers
    const real = episodes.filter((e) => e.IndexNumber > 0);
    const watchedCount = real.filter((e) => e.UserData?.Played).length;
    const resumeEp = episodes.find((e) => e.UserData?.PlaybackPositionTicks > 0 && !e.UserData?.Played);
    const nextEp = resumeEp || real.find((e) => !e.UserData?.Played) || real[0] || episodes[0];
    const total = al?.episodes || kfull?.episodes || match?.episodes || real.length;
    const rating = al?.score || kfull?.rating || (n <= 1 && series.CommunityRating ? Math.round(series.CommunityRating * 10) : null);
    const genres = (al?.genres?.length ? al.genres : kfull?.genres?.length ? kfull.genres : series.Genres || []).slice(0, 8);
    const statusText = al?.status || kfull?.status || (series.Status === 'Continuing' ? 'airing' : series.Status === 'Ended' ? 'finished' : series.Status || '');
    // Planned episode count from AniList/Kitsu when they have one ("3 / 12"); "?" only when neither knows.
    const knownTotal = al?.episodes || kfull?.episodes || match?.episodes || (!/current|airing|releasing|upcoming|unreleased|tba/i.test(statusText) ? real.length : null) || null;
    const year = al?.year || kfull?.year || cur.ProductionYear || series.ProductionYear || '';
    // A matched season uses AniList's own title ("Black Clover Season 2") and art: its cover and banner usually beat library images.
    const title = (n > 0 && al?.title) || entryTitle({ item: series, season: n, seasonItem: seasons.length > 1 ? cur : undefined });
    const posterImg = al?.cover || (cur.ImageTags?.Primary ? Jellyfin.img(cur.Id, 'Primary', { fillHeight: 540 }) : series.ImageTags?.Primary ? Jellyfin.img(id, 'Primary', { fillHeight: 540 }) : kfull?.poster || '');
    const bg = al?.banner || (series.BackdropImageTags?.length ? Jellyfin.img(id, 'Backdrop', { fillWidth: 1920 }) : (kfull?.cover || ''));
    // upgradeBackdrop() swaps in the first of these that's sharp enough (anime art first, then fanart, then your library's).
    const jellyBg = series.BackdropImageTags?.length ? Jellyfin.img(id, 'Backdrop', { maxWidth: 3840, quality: 92 }) : '';
    const bgSrcs = { lib: id, first: anime ? [al?.banner] : [jellyBg], alId: anime ? al?.id : null, mid: [kfull?.coverHd], last: anime ? [jellyBg] : [], fanart: [al?.title || series.Name, year] };
    const seasonLabel = (d) => { if (!d) return ''; const m = Number(d.slice(5, 7)); return `${m <= 3 ? 'Winter' : m <= 6 ? 'Spring' : m <= 9 ? 'Summer' : 'Fall'} ${d.slice(0, 4)}`; };
    const mins = real[0]?.RunTimeTicks ? Math.round(real[0].RunTimeTicks / TICKS / 60) : kfull?.episodeLength;

    // ---- hero
    const meta = metaLine({ rating, next: al?.next, rest: [esc(al?.format || kfull?.subtype || (anime ? 'TV' : 'TV show')), esc(year), total ? `${total} eps` : '', esc(statusText)] });
    const playLabel = nextEp ? `${resumeEp ? 'Resume' : 'Play'} Episode ${nextEp.IndexNumber ?? ''}` : (real.length ? `Rewatch Episode 1` : 'Play');
    const allWatched = real.length && watchedCount === real.length;
    const menu = `<button data-act="markSeason" data-series="${esc(id)}" data-season-id="${esc(cur.Id)}" data-season="${n}" data-played="${allWatched ? 0 : 1}">${allWatched ? 'Mark season unwatched' : 'Mark season watched'}</button>`
      + `<button data-act="selectAllEps">Select episodes…</button>`
      + (anime && n > 0 ? `<button data-act="fixMatch" data-series="${esc(id)}" data-season="${n}">${match ? 'Wrong show? Change Kitsu match' : 'Find it on Kitsu'}</button>` : '')
      + (ANIME_ONLY ? `<button data-act="setAnime" data-id="${esc(id)}" data-val="0">Use Jellyfin progress only</button>` : '');
    const wrongShow = anime && n > 0
      ? `<button class="wrong-show" data-act="fixMatch" data-series="${esc(id)}" data-season="${n}" title="${match ? `Matched to ${esc(match.title)} on Kitsu` : 'Not matched on Kitsu yet'}">⇄ ${match ? 'Wrong show?' : 'Find on Kitsu'}</button>` : '';
    const tracker = anime
      ? (match ? (Tracker.loggedIn() ? statusPicker(match.id, entry?.status, entry?.reconsuming) : '<button class="btn ghost" data-act="goAccount">Sign in to track</button>') : '')
      : (Trakt.available() && !Trakt.loggedIn() ? '<button class="btn ghost" data-act="traktLogin">Connect Trakt</button>' : '');

    // ---- left column
    const progressNum = anime && entry ? entry.progress : watchedCount;
    const barTotal = knownTotal || Math.max(real.length, progressNum);
    const progressPct = barTotal ? Math.min(100, (progressNum / barTotal) * 100) : 0;
    const editable = anime && match && Tracker.loggedIn();
    // Matched shows keep the card clean ("Wrong show?" and the ⋮ menu still change the match); otherwise explain why it isn't tracking.
    const note = anime
      ? (match ? '' : n === 0 ? 'Specials aren’t tracked' : `No Kitsu match found · <button class="link-btn small" data-act="fixMatch" data-series="${esc(id)}" data-season="${n}">find it</button>`)
      : (Trakt.loggedIn() ? (App.settings.traktTrack ? 'Tracking on Trakt' : 'Trakt auto-tracking off') : 'Not tracked') + (App.animeSignal[id] ? ` · Actually anime? <button class="link-btn small" data-act="fixMatch" data-series="${esc(id)}" data-season="${n || 1}">Find it on Kitsu</button>` : '');
    const progressCardHtml = progressCard({
      editable, kitsuId: match?.id, total, title: match?.title || '', num: progressNum, of: knownTotal, pct: progressPct, note,
      label: anime && entry ? (entry.reconsuming ? 'Rewatching' : STATUS_LABELS[entry.status] || entry.status) : editable ? 'Add to your list' : anime && match ? 'Not on your list' : 'Watched',
    });
    const playSub = `<span class="hero-srv">Jellyfin</span> · ${resumeEp ? `from ${fmtTime(resumeEp.UserData.PlaybackPositionTicks / TICKS)}` : esc(n === 0 ? 'Specials' : `Season ${n}`)}`;
    const details = [
      ['Format', kfull?.subtype || (anime ? 'TV' : 'TV show')], ['Episodes', total], ['Status', statusText],
      ['Season', al?.season || (kfull?.startDate ? seasonLabel(kfull.startDate) : (cur.PremiereDate || series.PremiereDate) ? seasonLabel(cur.PremiereDate || series.PremiereDate) : '')],
      ['Score', rating ? `${rating}%` : ''], ['Studio', (series.Studios || []).map((x) => x.Name).slice(0, 2).join(', ')],
      ['Rating', series.OfficialRating || kfull?.ageRating || ''], ['Runtime', mins ? `${mins} min / ep` : ''],
    ].filter(([, v]) => v);
    // A later season's own synopsis (from Kitsu) beats the show-wide one from Jellyfin.
    const about = (n > 1 ? kfull?.synopsis || cur.Overview || series.Overview : series.Overview || kfull?.synopsis) || '';

    // Prequel / sequel = the neighbouring seasons in your library; AniList's other relations are added after load.
    const near = [[n - 1, 'Prequel'], [n + 1, 'Sequel']].map(([k, rel]) => [seasons.find((s) => n > 0 && k > 0 && (s.IndexNumber ?? 1) === k), rel]).filter(([s]) => s);
    const nearCards = near.map(([s, rel]) => {
      const e = { item: series, season: s.IndexNumber ?? 1, seasonItem: s };
      const img = s.ImageTags?.Primary ? s.Id : series.ImageTags?.Primary ? id : null;
      return `<button class="rel-card" data-act="series" data-id="${esc(id)}" data-season="${esc(e.season)}">
        <div class="rel-poster">${img ? `<img loading="lazy" src="${esc(Jellyfin.img(img, 'Primary', { fillHeight: 160 }))}" alt="">` : ''}</div>
        <div class="rel-text"><span class="rel-badge">${rel}</span><div class="rel-title">${esc(entryTitle(e))}</div><div class="small muted">${esc([entryYear(e) || '', 'In library'].filter(Boolean).join(' · '))}</div></div>
      </button>`;
    }).join('');

    // ---- episodes (long seasons are split into pages of 50)
    let list = [...episodes];
    const CHUNK = 50;
    const ranges = [];
    if (real.length > CHUNK) for (let i = 0; i < episodes.length; i += CHUNK) ranges.push([i, Math.min(i + CHUNK, episodes.length)]);
    const nextIdx = Math.floor(Math.max(0, episodes.indexOf(nextEp)) / CHUNK);
    const r = ranges.length ? Math.min(Number(range ?? nextIdx), ranges.length - 1) : 0;
    if (ranges.length) { const [a, b] = ranges[r]; list = episodes.slice(a, b); }
    if (App.settings.epSort === 'desc') list.reverse(); // "Newest first" / "Oldest first" under the action bar
    const label = (e) => e.IndexNumber ?? '';
    const epRows = list.map((ep, row) => {
      const eager = row < 8 ? 'eager" fetchpriority="high' : 'lazy'; // the first rows load straight away
      const img = ep.ImageTags?.Primary ? Jellyfin.img(ep.Id, 'Primary', { fillWidth: 440 }) : bg;
      const rel = !ep.ImageTags?.Primary && match && ep.IndexNumber > 0 ? relativeEpisodeNumber(ep, episodes) : null; // filled from Kitsu in showAfter
      const pct = ep.UserData?.PlayedPercentage, played = typeof isEpPlayed === "function" ? isEpPlayed(ep) : ep.UserData?.Played, isNext = nextEp && ep.Id === nextEp.Id;
      const epMeta = [ep.RunTimeTicks ? `${Math.round(ep.RunTimeTicks / TICKS / 60)} min` : '', ep.PremiereDate ? ep.PremiereDate.slice(0, 10) : ''].filter(Boolean).join(' · ');
      return `<div class="ep ${isNext ? 'next' : ''} ${played ? 'played' : ''}" id="ep-row-${esc(label(ep))}" data-ep="${esc(ep.Id)}"${rel ? ` data-kthumb="${rel}"` : ''}>
        <button class="card" data-act="play" data-id="${esc(ep.Id)}" data-series="${esc(id)}"><div class="thumb">${img ? `<img loading="${eager}" src="${esc(img)}" alt="">` : ''}<div class="play">▶</div>${played ? `<span class="ep-badge" title="Watched">${icon('tick')}</span>` : ''}${pct ? `<div class="bar"><div style="width:${Math.round(pct)}%"></div></div>` : ''}</div></button>
        <div class="ep-info"><div class="ep-num">Episode ${esc(label(ep))}${isNext ? ' <span class="up-next">UP NEXT</span>' : ''}${epMeta ? ` <span class="ep-meta">${esc(epMeta)}</span>` : ''}</div>
          <div class="ep-title">${esc(ep.Name || '')}</div>
          ${ep.Overview ? `<div class="ep-overview">${esc(ep.Overview)}</div>` : ''}</div>
        <div class="ep-actions">
          <button class="ep-act ${played ? 'on' : ''}" data-act="epUpTo" data-id="${esc(ep.Id)}" data-played="${played ? 1 : 0}" data-tip="${played ? 'Unwatch from here' : 'Watched up to here'}" aria-label="${played ? 'Unwatch from here' : 'Watched up to here'}">${icon('checkCircle')}</button>
          ${match && ep.IndexNumber > 0 ? `<button class="ep-act" data-act="epDiscuss" data-num="${esc(ep.IndexNumber)}" data-watched="${played ? 1 : 0}" data-tip="Discuss this episode" aria-label="Discuss this episode">${icon('chat')}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // ---- main column: Episodes / Discussion / Friends
    const audioMode = App.settings.showAudio?.[id] || (App.settings.audioLang === 'eng' ? 'dub' : 'sub');
    const actionBar = `<div class="ep-actionbar">
        <span class="server-pill" title="Playback from your private library">${getServerLabel('jellyfin',true)}</span>
        ${wrongShow}
        <span class="spacer"></span>
        <div class="seg" role="group" aria-label="Audio">${[['sub', 'Sub'], ['dub', 'Dub']].map(([v, l]) => `<button class="${audioMode === v ? 'on' : ''}" data-act="subDub" data-mode="${v}" data-series="${esc(id)}" title="${v === 'sub' ? 'Japanese audio with subtitles' : 'English audio'}">${l}</button>`).join('')}</div>
      </div>`;
    const tip = App.settings.hideEpTip ? '' : `<div class="ep-tip">${icon('info')}<span>Right-click an episode for more, or Ctrl+click to select several</span><button class="link-btn" data-act="hideEpTip" data-tip="Got it" aria-label="Got it">${icon('close')}</button></div>`;
    const episodesTab = `${actionBar}${tip}${epSortLink()}
          ${ranges.length ? `<div class="ep-tools">
            <form id="go-ep" class="go-ep"><span>#</span><input type="number" min="1" placeholder="Go to episode" id="go-ep-n"></form>
            ${ranges.map(([a, b], i) => `<button class="chip ${i === r ? 'on' : ''}" data-act="epRange" data-range="${i}">${label(episodes[a])}–${label(episodes[b - 1])}</button>`).join('')}
          </div>` : ''}
          <div class="ep-list">${epRows}</div>`;
    const mainTabs = [['episodes', 'Episodes'], ['discussion', 'Discussion'], ['friends', 'Friends']];

    return `
      <div class="detail-hero"><div class="hero-bg" data-bgs="${esc(JSON.stringify(bgSrcs))}" style="${bg ? `background-image:url('${esc(bg)}')` : ''}"></div>
        <div class="hero-inner">
          <div class="hero-poster">${posterImg ? `<img src="${esc(posterImg)}" alt="">` : ''}</div>
          <div class="hero-text">
            ${logoHeading(title,titleArtworkId(match?.id,al),al?.englishTitle||al?.title||title)}
            <div class="meta-line">${meta}</div>
            ${genres.length ? `<div class="genre-chips">${genres.map((g) => `<button class="genre" data-act="browseGenre" data-genre="${esc(g)}" data-src="${anime ? 'anime' : 'show'}">${esc(g)}</button>`).join('')}</div>` : ''}
            <div class="row gap hero-actions">
              ${nextEp ? `<button class="btn primary resume-btn" data-act="play" data-id="${esc(nextEp.Id)}" data-series="${esc(id)}" title="${esc(nextEp.Name || '')}">${icon('play', 'fill')}<span class="resume-text"><b>${esc(playLabel)}</b><small>${playSub}</small></span></button>` : ''}
              ${tracker}
              <div class="chip-wrap"><button class="icon-btn more-btn" data-act="toggleMenu" title="More">${icon('more')}</button><div class="chip-menu" hidden>${menu}</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <aside class="detail-side">
          ${progressCardHtml}
          ${anime?titleStoryMarkup(match?.id,about,al?.synopsis):about?`<h3>About</h3><p class="about">${esc(about)}</p>`:''}
          <h3>Details</h3>
          <dl class="details">${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd data-k="${esc(k)}">${esc(v)}</dd>`).join('')}</dl>
          ${nearCards || match ? `<div id="related-box" ${nearCards ? '' : 'hidden'}><h3>Related</h3><div class="rel-list">${nearCards}</div></div>` : ''}
        </aside>
        <section class="detail-main">
          ${anime?titleSections(tab,'showTab'):'<div class="library-context-note">Your Jellyfin library · Playback and progress stay in your library</div>'}
          ${tab === 'episodes' ? episodesTab : `<div id="show-social" class="social-box"><div class="social-sk">${commentSkeleton(4)}</div></div>`}
        </section>
      </div>`;
  },
  showAfter({ tab = 'episodes' }, rid) {
    App.paintSelection();
    upgradeBackdrop(rid);
    enrichTitleStory(rid).catch(()=>{});
    showLogo($('.detail-hero .hero-text h1'), App.showAl?.id, App.showCtx?.n,App.showAl?.englishTitle||App.showAl?.title||'');
    fillMissingThumbs(rid);
    if ($('#related-box')) fillRelated(rid);
    if ($('#show-social')) fillSocial(tab, rid);
    const f = $('#go-ep');
    if (f) f.onsubmit = (e) => {
      e.preventDefault();
      const n = $('#go-ep-n').value;
      const row = document.getElementById(`ep-row-${n}`);
      if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1500); }
      else {
        // might be in another range
        const btns = [...document.querySelectorAll('[data-act=epRange]')];
        const hit = btns.find((b) => { const [x, y] = b.textContent.split('–').map(Number); return n >= x && n <= y; });
        if (hit) { App.params.goto = n; hit.click(); } else toast(`No episode ${n} in this season`);
      }
    };
    if (App.params.goto) { const n = App.params.goto; delete App.params.goto; setTimeout(() => { $('#go-ep-n').value = n; f.requestSubmit(); }, 50); }
  },

  async movie({ id }) {
    const m = await Jellyfin.item(id);
    let anime = App.isAnime(id);
    const match = anime ? await Matcher.auto(m, null, 1) : null;
    if (anime && !match && await App.confirmAnime(m, match)) anime = false;
    App.matches = await Matcher.all(); App.libIndex = buildLibraryIndex([], {});
    const [entry, kfull, al] = await Promise.all([
      match && Tracker.loggedIn() ? Tracker.entry(match.id).catch(() => null) : null,
      match ? Kitsu.animeFull(match.id).catch(() => null) : null,
      match && anime ? AniList.details(match.id).catch(() => null) : null,
    ]);
    App.showAl = al; // the page's colour and logo
    const bg = (m.BackdropImageTags?.length ? Jellyfin.img(id, 'Backdrop', { fillWidth: 1920 }) : '') || al?.banner || kfull?.cover || '';
    const pct = m.UserData?.PlayedPercentage, played = m.UserData?.Played;
    const mins = m.RunTimeTicks ? Math.round(m.RunTimeTicks / TICKS / 60) : 0;
    const runtime = mins ? `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)}h ` : ''}${mins % 60}m` : '';
    const rating = al?.score || kfull?.rating || (m.CommunityRating ? Math.round(m.CommunityRating * 10) : null);
    const genres = (al?.genres?.length ? al.genres : kfull?.genres?.length ? kfull.genres : m.Genres || []).slice(0, 8);
    const meta = [rating ? `<span class="pill-rating">★ ${rating}%</span>` : '', 'Movie', esc(m.ProductionYear || ''), esc(runtime), esc(m.OfficialRating || '')].filter(Boolean).join(' · ');
    const menu = [
      anime && match ? `<button data-act="link" data-url="${esc(match.url)}">Open on Kitsu</button>` : '',
      anime ? `<button data-act="fixMatch" data-series="${esc(id)}" data-season="1">${match ? 'Fix Kitsu match' : 'Find on Kitsu'}</button>` : '',
      !anime && Trakt.loggedIn() ? `<button data-act="traktSync" data-series="${esc(id)}" data-season="1">Send to Trakt</button>` : '',
      `<button data-act="toggleWatched" data-id="${esc(id)}" data-played="${played ? 1 : 0}">${played ? 'Mark unwatched' : 'Mark watched'}</button>`,
      ANIME_ONLY ? `<button data-act="setAnime" data-id="${esc(id)}" data-val="0">Use Jellyfin progress only</button>` : anime ? `<button data-act="setAnime" data-id="${esc(id)}" data-val="0">Use Jellyfin progress only</button>` : `<button data-act="setAnime" data-id="${esc(id)}" data-val="1">This is anime (enable episode tracking)</button>`,
    ].filter(Boolean).join('');
    const tracker = anime
      ? (match ? (Tracker.loggedIn() ? statusPicker(match.id, entry?.status, entry?.reconsuming) : '<button class="btn ghost" data-act="goAccount">Sign in to track</button>') : '')
      : (Trakt.available() && !Trakt.loggedIn() ? '<button class="btn ghost" data-act="traktLogin">Connect Trakt</button>' : '');
    const details = [
      ['Format', 'Movie'], ['Released', m.PremiereDate ? m.PremiereDate.slice(0, 10) : m.ProductionYear], ['Runtime', runtime],
      ['Score', rating ? `${rating}%` : ''], ['Rating', m.OfficialRating || ''], ['Studio', (m.Studios || []).map((x) => x.Name).slice(0, 2).join(', ')],
      ['Director', (m.People || []).filter((p) => p.Type === 'Director').map((p) => p.Name).slice(0, 2).join(', ')],
    ].filter(([, v]) => v);
    const cast = (m.People || []).filter((p) => p.Type === 'Actor').slice(0, 12);
    const status = played ? 'Watched' : pct ? `${Math.round(pct)}% watched` : 'Not watched yet';
    return `
      <div class="detail-hero"><div class="hero-bg" style="${bg ? `background-image:url('${esc(bg)}')` : ''}"></div>
        <div class="hero-inner">
          <div class="hero-poster">${al?.cover || m.ImageTags?.Primary ? `<img src="${esc(al?.cover || Jellyfin.img(id, 'Primary', { fillHeight: 540 }))}" alt="">` : ''}</div>
          <div class="hero-text">
            <h1>${esc(m.Name)}</h1>
            <div class="meta-line">${meta}</div>
            ${genres.length ? `<div class="genre-chips">${genres.map((g) => `<button class="genre" data-act="browseGenre" data-genre="${esc(g)}" data-src="${anime ? 'anime' : 'movie'}">${esc(g)}</button>`).join('')}</div>` : ''}
            <div class="row gap hero-actions">
              <button class="btn primary resume-btn" data-act="playMovie" data-id="${esc(id)}">${icon('play', 'fill')}<span class="resume-text"><b>${pct && !played ? 'Resume' : played ? 'Watch again' : 'Play'}</b><small>${pct && !played ? `${Math.round(pct)}% in` : esc(runtime)}</small></span></button>
              ${tracker}
              <div class="chip-wrap"><button class="icon-btn more-btn" data-act="toggleMenu" title="More">${icon('more')}</button><div class="chip-menu" hidden>${menu}</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <aside class="detail-side">
          <div class="side-card"><div class="row gap"><span class="side-status">${anime && entry ? esc(STATUS_LABELS[entry.status] || entry.status) : esc(status)}</span></div>
            <div class="side-bar"><div style="width:${played ? 100 : Math.round(pct || 0)}%"></div></div>
            <div class="small muted">${anime ? (match ? `Kitsu: ${esc(match.title)}` : 'No Kitsu match yet — use ⋮ to find it') : Trakt.loggedIn() ? 'Tracking on Trakt' : 'Not tracked'}</div></div>
          <h3>Details</h3>
          <dl class="details">${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd data-k="${esc(k)}">${esc(v)}</dd>`).join('')}</dl>
        </aside>
        <section class="detail-main">
          ${m.Overview || kfull?.synopsis ? `<h3 style="margin-top:0">About</h3><p class="about about-scroll">${esc(m.Overview || kfull?.synopsis)}</p>` : ''}
          ${cast.length ? `<h3>Cast</h3><div class="cast">${cast.map((p) => `<div class="person"><span class="avatar">${esc((p.Name || '?').slice(0, 1))}${p.PrimaryImageTag ? `<img loading="lazy" src="${esc(`${Jellyfin.server}/Items/${p.Id}/Images/Primary?fillHeight=120&quality=90`)}" alt="">` : ''}</span><div><div class="p-name">${esc(p.Name)}</div><div class="small muted">${esc(p.Role || '')}</div></div></div>`).join('')}</div>` : ''}
        </section>
      </div>`;
  },

  async media({ id }) {
    const x = App.traktCache?.[id];
    if (!x) return '<div class="page"><div class="empty">That title isn’t loaded anymore. Try searching for it.</div></div>';
    const requested = await Requests.has(x.id);
    const lib = App.findByIds(x.ids, x.title, x.year, x.kind);
    return `
      <div class="hero"><div class="hero-bg" style="${x.cover || x.poster ? `background-image:url('${esc(x.cover || x.poster)}')` : ''}"></div>
        <div class="hero-inner">
          <div class="hero-poster">${x.poster ? `<img src="${esc(x.poster)}" alt="">` : ''}</div>
          <div class="hero-text">
            ${App.history.length ? '<div><button class="btn ghost sm" data-act="back">← Back</button></div>' : ''}
            <h1>${esc(x.title)}</h1>
            <div class="meta">${[x.kind === 'movie' ? 'Movie' : 'TV show', x.year, x.rating ? `★ ${x.rating}%` : '', (x.genres || []).slice(0, 3).map((g) => g.replace(/(^|-)\w/g, (c) => c.toUpperCase()).replace(/-/g, ' ')).join(', ')].filter(Boolean).map((v) => `<span>${esc(v)}</span>`).join('')}</div>
            <p class="overview">${esc(x.synopsis)}</p>
            <div class="row gap">
              ${lib ? `<button class="btn primary" data-act="series" data-id="${esc(lib.Id)}">▶ Watch in library</button>`
                : !Requests.enabled() ? '' : requested ? '<button class="btn done" disabled>✓ Requested</button>'
                : `<button class="btn primary" data-act="request" data-id="${esc(x.id)}">＋ Request</button>`}
              <button class="btn ghost" data-act="link" data-url="${esc(x.url)}">Open on Trakt</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  // Title page for a show that isn't in your Jellyfin library: same layout as library show pages,
  // with AniList art and episodes streamed from the chosen server. Episode names/thumbnails fill in from Kitsu.
  async anime({ id, tab = 'episodes', range, snapshot }, rid) {
    const values = snapshot || await Promise.all([
      Kitsu.animeFull(id).catch(() => Kitsu.anime(id)), Requests.has(id), trackingEntryState(id), AniList.details(id).catch(() => null),
    ]);
    if (App.stale(rid)) return '';
    const [a, requested, entryState, al]=values;
    App.remoteEpisodeSnapshot={id,range,values};
    const {entry,error:entryError}=entryState;
    App.showCtx = { id: null, n: 1, match: { id: a.id, title: a.title, titleAliases:[...new Set([...(a.titles||[]),a.canonical,...(al?.titles||[])].filter(v=>v&&v!==a.title))].slice(0,8), url: a.url, episodes: a.episodes, movie: String(a.subtype || al?.format || '').toLowerCase() === 'movie' } };
    const inLib = App.libIndex?.find(a);
    const remServer = remotePlaybackProvider();
    const audioMode = App.settings.showAudio?.[a.id] || (App.settings.audioLang === 'eng' ? 'dub' : 'sub');
    const total = al?.episodes || a.episodes || null;
    // Only list episodes that are out: up to the next airing one when it's still airing.
    const aired = al?.next ? al.next.episode - 1 : null;
    // Not out yet (AniList says "not yet released", or episode 1 is the next to air): no episode list at all.
    const notOut = /not.?yet|upcoming|unreleased|tba/i.test(String(al?.status || a.status || '')) || al?.next?.episode === 1;
    const episodeRequest={provider:remServer,title:a.title,titleAliases:App.showCtx.match.titleAliases,seasonNumber:seasonNumberIn(a.title)||1,audio:audioMode};
    const availability=notOut?{status:'ready',episodes:[]}:RemoteEpisodes.peek(episodeRequest);
    App.remoteEpisodeRequest=episodeRequest;
    const available=notOut?[]:(availability?.episodes||[]).filter(n=>aired==null||n<=aired);
    const epCount=available.length?Math.max(...available):0;
    const watchedEps = Number(entry?.progress) || 0;
    const nextEpNum = available.includes(watchedEps+1) ? watchedEps+1 : null;
    // Long shows are split into pages of 50, opening on the one with your next episode (same as library pages).
    const CHUNK = 50;
    const chunks = epCount > CHUNK ? Math.ceil(epCount / CHUNK) : 1;
    const chunk = Math.min(chunks - 1, Number(range ?? Math.floor(((nextEpNum || 1) - 1) / CHUNK)) || 0);
    const firstEp = chunk * CHUNK + 1, lastEp = Math.min(epCount, firstEp + CHUNK - 1);
    const title = al?.title || a.title;
    const poster = al?.cover || a.poster;
    const bg = al?.banner || a.coverHd || a.cover || '';
    const bgLib = App.libIndex?.find(a)?.Id || null;
    const useAl = trackerBanner() === 'anilist';
    const bgSrcs = { lib: bgLib, first: bgLib || useAl ? [al?.banner] : [a.coverHd, al?.banner], alId: al?.id, mid: [a.coverHd], last: [], fanart: [title, a.year],
      force: bgLib ? '' : (useAl ? al?.banner || a.coverHd : a.coverHd || al?.banner) || '',
      kitsu: bgLib ? '' : a.coverHd || '', alBanner: al?.banner || '', pill: !bgLib && !!(a.coverHd && al?.banner) };
    AniZip.get(al?.id); // episode stills + fanart start downloading now
    const thumbFallback = al?.banner || a.coverHd || a.cover || poster || ''; // when an episode has no still of its own
    App.showAl = al; // animeAfter() also uses AniList's streaming episodes
    // Episode names and thumbnails start downloading now; animeAfter() fills them in (same cached request).
    if(epCount)Kitsu.episodes(a.id, lastEp - firstEp + 1, firstEp - 1).catch(() => []);
    const synopsis = TitleSynopsis.choose(a.synopsis, al?.synopsis);
    const statusText = al?.status || a.status || '';
    const genres = (al?.genres?.length ? al.genres : a.genres || []).slice(0, 8);
    const rating = al?.score || a.rating;

    const epNums = available.filter(n=>n>=firstEp&&n<=lastEp);
    if (App.settings.epSort === 'desc') epNums.reverse();
    const epRows = epNums.map((n) => {
      const played = n <= watchedEps, isNext = n === nextEpNum;
      return `<div class="ep ${isNext ? 'next' : ''} ${played ? 'played' : ''}" id="ep-row-${n}" data-num="${n}">
        <button class="card" data-act="playRemote" data-title="${esc(a.title)}" data-ep="${n}" data-kitsu="${esc(a.id)}" data-poster="${esc(a.poster || '')}"><div class="thumb" data-fallback="${esc(thumbFallback)}" data-poster="${esc(poster||'')}"><img loading="lazy" decoding="async" alt="" ${thumbFallback?`src="${esc(thumbFallback)}"`:"hidden"}><div class="play">▶</div>${played ? `<span class="ep-badge" title="Watched">${icon('tick')}</span>` : ''}</div></button>
        <div class="ep-info"><div class="ep-num">Episode ${n}${isNext ? ' <span class="up-next">UP NEXT</span>' : ''} <span class="ep-meta"></span></div>
          <div class="ep-title"></div>
          <div class="ep-overview muted">Streams from <span class="ep-sub-srv">${esc(shortServerName(remServer))}</span> · ${audioMode.toUpperCase()}</div></div>
        <div class="ep-actions">
          <button class="ep-act ${played ? 'on' : ''}" data-act="remoteWatched" data-kitsu="${esc(a.id)}" data-num="${n}" data-played="${played ? 1 : 0}" data-total="${esc(total || '')}" data-tip="${played ? 'Unwatch from here' : 'Watched up to here'}" aria-label="${played ? 'Unwatch from here' : 'Watched up to here'}">${icon('checkCircle')}</button>
          <button class="ep-act" data-act="epDiscuss" data-num="${n}" data-watched="${played ? 1 : 0}" data-tip="Discuss this episode" aria-label="Discuss this episode">${icon('chat')}</button>
        </div>
      </div>`;
    }).join('');
    const rangeChips = chunks > 1 ? `<div class="ep-tools">${Array.from({ length: chunks }, (_, i) => `<button class="chip ${i === chunk ? 'on' : ''}" data-act="animeRange" data-range="${i}">${i * CHUNK + 1}–${Math.min(epCount, (i + 1) * CHUNK)}</button>`).join('')}</div>` : '';

    const episodeEmpty = `<div class="remote-episode-state" role="status"><span class="remote-episode-mark">${icon(!availability?'clock':'search')}</span><h3>${!availability?'Checking '+esc(shortServerName(remServer))+'…':availability.status==='error'?'Couldn’t check this server':'No episodes found on '+esc(shortServerName(remServer))}</h3><p>${!availability?'Looking for this title’s episode list.':availability.status==='error'?'The server may be temporarily unavailable. Try again or choose another server above.':'Try another server above. You can still track this title and join its discussions.'}</p>${availability?'<button class="btn ghost" data-act="retryEpisodes">'+icon('refresh')+'<span>Check again</span></button>':''}</div>`;
    const editable = Tracker.loggedIn()&&!entryError;
    const statusLabel = entry ? (entry.reconsuming ? 'Rewatching' : (STATUS_LABELS[entry.status] || entry.status)) : editable ? 'Add to your list' : 'Not on your list';
    const progressCardHtml = progressCard({
      error:entryError, editable, kitsuId: a.id, total, title: a.title, label: statusLabel, num: watchedEps, of: total,
      pct: total ? Math.min(100, (watchedEps / total) * 100) : 0, note: editable ? '' : 'Sign in to Kitsu or AniList to track this',
    });
    const details = [
      ['Format', al?.format || a.subtype || 'TV'], ['Episodes', total || ''], ['Status', statusText],
      ['Season', al?.season || (a.startDate ? a.startDate.slice(0, 4) : a.year || '')], ['Score', rating ? `${rating}%` : ''],
      ['Studio', (al?.studios || []).slice(0, 2).join(', ')], ['Rating', a.ageRating || ''],
      ['Runtime', (al?.duration || a.episodeLength) ? `${al?.duration || a.episodeLength} min / ep` : ''],
    ].filter(([, v]) => v);
    const playBtn = inLib
      ? `<button class="btn primary resume-btn" data-act="series" data-id="${esc(inLib.Id)}">${icon('play', 'fill')}<span class="resume-text"><b>Watch in library</b><small>Jellyfin</small></span></button>`
      : nextEpNum ? `<button class="btn primary resume-btn" data-act="playRemote" data-title="${esc(a.title)}" data-ep="${nextEpNum}" data-kitsu="${esc(a.id)}">${icon('play', 'fill')}<span class="resume-text"><b>${watchedEps ? 'Continue' : 'Play'} Episode ${nextEpNum}</b><small><span class="hero-srv">${esc(shortServerName(remServer))}</span> · ${audioMode.toUpperCase()}</small></span></button>` : '';
    const menu = `<button data-act="link" data-url="${esc(a.url)}">Open on Kitsu</button>`
      + (al?.id ? `<button data-act="link" data-url="https://anilist.co/anime/${esc(al.id)}">Open on AniList</button>` : '')
      + (Requests.enabled() && !inLib && !requested ? `<button data-act="request" data-id="${esc(a.id)}">Request it for the library</button>` : '');
    const actionBar = `<div class="ep-actionbar">
        <div class="chip-wrap"><button class="server-pill" data-act="toggleMenu" title="Where episodes play from">${getServerLabel(remServer, false)}<span class="caret">▾</span></button>${renderWatchOnMenu(remServer, false)}</div>
        <span class="spacer"></span>
        <div class="seg" role="group" aria-label="Audio">${[['sub', 'Sub'], ['dub', 'Dub']].map(([v, l]) => `<button class="${audioMode === v ? 'on' : ''}" data-act="remoteSubDub" data-mode="${v}" data-series="${esc(a.id)}" title="${v === 'sub' ? 'Japanese audio with subtitles' : 'English audio'}">${l}</button>`).join('')}</div>
      </div>`;
    const tabs = [['episodes', 'Episodes'], ['discussion', 'Discussion'], ['friends', 'Friends']];
    const premiere = al?.next?.episode === 1 ? al.next.at : 0;
    // When a season is all AniList has: its first day, for "about N months away" and how close it is.
    const seasonStart = (() => { const m = String(al?.season || '').match(/(Winter|Spring|Summer|Fall)\s+(\d{4})/i); return m ? new Date(Number(m[2]), { winter: 0, spring: 3, summer: 6, fall: 9 }[m[1].toLowerCase()], 1).getTime() : 0; })();
    const awayText = (t) => { const d = Math.round((t - Date.now()) / 86400000); return d <= 0 ? 'any day now' : d < 45 ? `about ${d} day${d === 1 ? '' : 's'} away` : `about ${Math.round(d / 30.4)} months away`; };
    const target = premiere || seasonStart, closeness = target ? Math.max(0.04, Math.min(1, 1 - (target - Date.now()) / (365 * 86400000))) : 0;
    const facts = [al?.format || a.subtype, (al?.studios || [])[0], total ? `${total} episodes` : '', al?.season].filter(Boolean);
    const comingSoon = `<div class="soon2">${poster ? `<div class="soon2-bg" style="--soon:url(&quot;${esc(poster)}&quot;)"></div>` : ''}
      <div class="soon2-stack" id="soon2-stack"><span class="soon2-cover">${poster ? `<img src="${esc(poster)}" alt="">` : ''}<em>${icon('clock')}Coming soon</em></span></div>
      <div class="soon2-info">
        <span class="soon-eyebrow">${icon('clock')}Not out yet</span>
        <h3>${premiere ? 'Episode 1 premieres in' : `Arrives ${esc(al?.season || a.year || 'soon')}`}</h3>
        ${premiere ? `<div class="soon-clock" data-clock="${premiere}">${esc(countdownText(premiere))}</div><p>${esc(new Date(premiere).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</p>`
          : seasonStart ? `<p class="soon2-away">${esc(awayText(seasonStart))} · no exact date yet</p>` : '<p>No air date has been announced yet.</p>'}
        ${target ? `<div class="soon2-bar" title="How close it is"><i style="width:${Math.round(closeness * 100)}%"></i></div>` : ''}
        ${facts.length ? `<div class="soon2-facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        <p class="soon2-note">Episodes show up here as soon as it starts airing.</p>
        <div class="soon-acts">${editable && !entry ? `<button class="btn primary ad2-btn" data-act="setKStatus" data-kitsu="${esc(a.id)}" data-status="planned">${icon('plus')}Plan to watch</button>` : entry ? `<span class="soon-on">${icon('check')}On your list · ${esc(statusLabel)}</span>` : ''}<button class="btn ghost ad2-btn" data-act="ad-add-current" data-id="${esc(a.id)}">${icon('bookmark')}Add to a deck</button></div>
      </div></div>`;

    return `
      <div class="detail-hero"><div class="hero-bg" data-bgs="${esc(JSON.stringify(bgSrcs))}" style="${bg ? `background-image:url('${esc(bg)}')` : ''}"></div>
        <div class="hero-inner">
          <div class="hero-poster">${poster ? `<img src="${esc(poster)}" alt="">` : ''}</div>
          <div class="hero-text">
            ${logoHeading(title,titleArtworkId(id,al),al?.englishTitle||al?.title||title)}
            <div class="meta-line">${metaLine({ rating, next: al?.next, rest: [esc(al?.format || a.subtype || 'TV'), esc(a.year || ''), total ? `${total} eps` : '', esc(statusText)] })}</div>
            ${genres.length ? `<div class="genre-chips">${genres.map((g) => `<button class="genre" data-act="browseGenre" data-genre="${esc(g)}" data-src="anime">${esc(g)}</button>`).join('')}</div>` : ''}
            <div class="row gap hero-actions">
              ${playBtn}
              ${entryError ? '<button class="btn ghost" data-act="retry">Retry list lookup</button>' : editable ? statusPicker(a.id, entry?.status, entry?.reconsuming) : '<button class="btn ghost" data-act="goAccount">Sign in to track</button>'}
              ${!inLib && requested ? '<button class="status-btn" disabled>✓ Requested</button>' : ''}
              <div class="chip-wrap"><button class="icon-btn more-btn" data-act="toggleMenu" title="More">${icon('more')}</button><div class="chip-menu right" hidden>${menu}</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <aside class="detail-side">
          ${progressCardHtml}
          ${titleStoryMarkup(id,a.synopsis,al?.synopsis)}
          <h3>Details</h3>
          <dl class="details">${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd data-k="${esc(k)}">${esc(v)}</dd>`).join('')}</dl>
          <div id="related-box" hidden><h3>Related</h3><div class="rel-list"></div></div>
        </aside>
        <section class="detail-main">
          ${titleSections(tab,'animeTab')}
          ${tab === 'episodes' ? (notOut ? comingSoon : `${actionBar}${renderServerErrorBanner()}${epCount?epSortLink()+rangeChips+'<div class="ep-list">'+epRows+'</div>':episodeEmpty}`)
            : `<div id="show-social" class="social-box"><div class="social-sk">${commentSkeleton(4)}</div></div>`}
        </section>
      </div>`;
  },
  async animeAfter({ id, tab = 'episodes' }, rid) {
    checkRemoteEpisodes(rid); // Start independently of optional artwork/related-title enrichment.
    enrichTitleStory(rid).catch(()=>{});
    upgradeBackdrop(rid);
    if ($('#soon2-stack')) soonPrequels(rid);
    const soon = $('.soon-clock');
    if (soon) { clearInterval(App.soonTimer); App.soonTimer = setInterval(() => { if (!soon.isConnected) return clearInterval(App.soonTimer); soon.textContent = countdownText(Number(soon.dataset.clock)); }, 1000); }
    showLogo($('.detail-hero .hero-text h1'), App.showAl?.id, seasonNumberIn(App.showAl?.title || ''),App.showAl?.englishTitle||App.showAl?.title||'');
    if ($('#related-box')) fillRelated(rid);
    if ($('#show-social')) return fillSocial(tab, rid);
    const rows = [...document.querySelectorAll('.ep-list .ep[data-num]')];
    if (!rows.length) return;
    const from = Math.min(...rows.map((r) => Number(r.dataset.num))) - 1;
    let eps=[],zip=null;
    const apply=()=>{if(App.stale(rid))return;
    const byNum = new Map(eps.map((e) => [e.number, e]));
    // An episode with an air date still ahead isn't out: take it off the list (clicking it would open an empty player).
    const now = Date.now();
    for (const row of [...rows]) {
      if(!row.isConnected)continue;
      const n = Number(row.dataset.num), air = Date.parse(zip?.episodes?.[n]?.airDate || byNum.get(n)?.airdate || '');
      if (air > now + 3600000) { row.remove(); rows.splice(rows.indexOf(row), 1); }
    }
    for (const row of rows) {
      if(!row.isConnected)continue;
      const n = Number(row.dataset.num), z = zip?.episodes?.[n], st = App.showAl?.streams?.[n];
      let e = byNum.get(n);
      // Each detail from the best source that has it: ani.zip (TheTVDB), then Kitsu, then AniList's streaming episodes.
      if (z) e = { ...(e || {}), title: z.title || e?.title, synopsis: z.overview || e?.synopsis, airdate: z.airDate || e?.airdate, length: z.runtime || e?.length, thumb: z.image || e?.thumb };
      if (st?.title && !e?.title) row.querySelector('.ep-title').textContent = st.title;
      setEpisodeThumb(row,[z?.image,byNum.get(n)?.thumb,st?.thumb,row.querySelector('.thumb')?.dataset.fallback]);
      if (!e) continue;
      if (e.title && !/^episode \d+$/i.test(e.title)) row.querySelector('.ep-title').textContent = e.title;
      row.querySelector('.ep-meta').textContent = [e.length ? `${e.length} min` : '', e.airdate || ''].filter(Boolean).join(' · ');
      if (e.synopsis) { const o = row.querySelector('.ep-overview'); o.textContent = e.synopsis.replace(SOURCE_NOTE, ''); o.classList.remove('muted'); }
    }
    };
    apply();
    await Promise.allSettled([
      Kitsu.episodes(id,Math.max(...rows.map(r=>Number(r.dataset.num)))-from,from).then(value=>{eps=value;apply();}),
      AniZip.get(App.showAl?.id).then(value=>{zip=value;apply();})
    ]);
  },

  async schedule() {
    const who = App.settings.scheduleWho || 'mine', mode = App.settings.scheduleView === 'week' ? 'week' : 'timeline';
    const seg = (label, act, key, cur, opts) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-${key}="${v}">${l}</button>`).join('')}</div>`;
    return `<div class="page schedule sch-${mode}" id="sch-root">
      <div class="page-head"><div><h1>Schedule</h1><div class="muted small">${who === 'all' ? 'Every show airing this week' : 'Shows you’re watching or watched recently'} · times in your time zone</div></div>
        <span class="spacer"></span>
        ${seg('Layout', 'scheduleView', 'mode', mode, [['timeline', 'Timeline'], ['week', 'Week']])}
        ${seg('Which shows', 'scheduleWho', 'who', who, [['mine', 'My shows'], ['all', 'All shows']])}</div>
      <div id="sch-grid" class="${mode === 'week' ? 'sch-grid' : 'sch-wrap'}">${mode === 'week' ? scheduleSkeleton() : scheduleTimelineSkeleton()}</div></div>`;
  },
  async scheduleAfter(_p, rid) {
    const who = App.settings.scheduleWho || 'mine';
    let items;
    try { items = await Schedule.week(); }
    catch (e) {
      if (!App.stale(rid)) $('#sch-grid').innerHTML = `<div class="empty">Couldn’t load the schedule: ${esc(e.message)}<br><br><button class="btn" data-act="retry">Try again</button></div>`;
      return;
    }
    items = await mySchedule(items, who === 'mine').catch(() => (who === 'mine' ? [] : items));
    if (App.stale(rid)) return;
    if (!items.length) {
      $('#sch-grid').innerHTML = `<div class="empty">Nothing you watch airs this week.<br><br><button class="btn" data-act="scheduleWho" data-who="all">Show all shows</button></div>`;
      return;
    }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const now = Date.now();
    const upNext = items.filter((x) => x.at > now).reduce((a, b) => (!a || b.at < a.at ? b : a), null);
    if (App.settings.scheduleView !== 'week') return this.scheduleTimeline(items, start, now, upNext, rid);
    $('#sch-grid').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
      const eps = items.filter((x) => x.at >= day && x.at < next);
      const name = i === 0 ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' });
      return `<section class="sch-day ${i === 0 ? 'today' : ''}" aria-label="${esc(day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}">
        <header><span class="sch-wd">${esc(name)}</span><b class="sch-date">${day.getDate()}</b><span class="sch-count" title="${eps.length} airing">${eps.length}</span></header>
        <div class="sch-list">${eps.length ? eps.map((x) => scheduleCard(x, now, x === upNext)).join('') : '<div class="sch-empty">Nothing airing</div>'}</div>
      </section>`;
    }).join('');
    // Today's list opens at the next airing instead of at episodes that already aired.
    const nextCard = $('#sch-grid .sch-card.next'), list = nextCard?.closest('.sch-list');
    if (list) list.scrollTop += nextCard.getBoundingClientRect().top - list.getBoundingClientRect().top - 4;
  },
  // Timeline layout: day tabs, "On air next" on the left, the chosen day's airings on the right. Countdowns tick live,
  // and the page redraws itself when the next episode comes out.
  scheduleTimeline(items, start, now, upNext, rid) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
      return { day, eps: items.filter((x) => x.at >= day && x.at < end).sort((a, b) => a.at - b.at) };
    });
    // Today, unless nothing airs today: then the first day with something on.
    let sel = Number.isInteger(App.params.day) ? App.params.day : 0;
    if (!Number.isInteger(App.params.day) && !days[0].eps.length) sel = Math.max(0, days.findIndex((d) => d.eps.length));
    const grid = $('#sch-grid');
    grid.innerHTML = `<div class="sch-days" role="tablist" aria-label="Day">${schDayTabs(days, sel, now)}</div>
      <div class="sch-body"><aside class="sch-side">${schSide(items, now, upNext)}</aside><div class="sch-tl" id="sch-tl"></div></div>`;
    const tl = $('#sch-tl'), tabs = grid.querySelector('.sch-days');
    const show = (i) => {
      sel = i; App.params.day = i;
      tabs.querySelectorAll('.sch-dtab').forEach((b) => { const on = Number(b.dataset.day) === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      tl.innerHTML = schTimeline(days[i].eps, Date.now(), i === 0, upNext);
      // Today opens just above "now", so what's coming is in view and what aired is a scroll up.
      const mark = i === 0 && $('#tl-now', tl);
      tl.scrollTop = mark ? Math.max(0, mark.offsetTop - 120) : 0;
    };
    tabs.onclick = (e) => { const b = e.target.closest('.sch-dtab'); if (b) show(Number(b.dataset.day)); };
    tabs.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const n = Math.min(6, Math.max(0, sel + (e.key === 'ArrowRight' ? 1 : -1)));
      show(n); tabs.querySelector(`.sch-dtab[data-day="${n}"]`)?.focus();
    };
    show(sel);
    // Live countdowns; when the next episode airs, redraw so it moves to "Out now".
    clearInterval(App.schedTimer);
    let ticks = 0;
    App.schedTimer = setInterval(() => {
      const root = $('#sch-root');
      if (!root || !$('#sch-tl')) { clearInterval(App.schedTimer); return; }
      const t = Date.now();
      root.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = countdownText(Number(el.dataset.clock), t); });
      if (++ticks % 15 === 0) root.querySelectorAll('[data-until]').forEach((el) => { el.textContent = untilText(Number(el.dataset.until), t); });
      if (upNext && t >= upNext.at && App.view === 'schedule' && $('#player').hidden) { clearInterval(App.schedTimer); App.refresh(); }
    }, 1000);
    // The next show's own wide art behind the countdown (TheTVDB fanart via ani.zip), once it has loaded.
    const card = $('#sch-next');
    if (card?.dataset.al) AniZip.get(card.dataset.al).then((z) => {
      if (!z?.fanart || App.stale(rid)) return;
      const im = new Image();
      im.onload = () => { if (!card.isConnected) return; card.style.setProperty('--next-art', `url("${z.fanart.replace(/"/g, '%22')}")`); card.classList.add('has-art'); };
      im.src = z.fanart;
    });
  },

  homesections() {
    return `<div class="page sub-page hs-page">
      <div class="sub-head"><button class="icon-btn" data-act="back" title="Back">${icon('arrowLeft')}</button><h1>Home rows</h1><button class="link-btn sub-head-act" id="hs-reset">Reset</button></div>
      <div id="hs-list" class="hs-list" role="list" style="--rows:${Math.ceil(HOME_SECTIONS.length / 2)}"></div></div>`;
  },
  homesectionsAfter() {
    const list = $('#hs-list');
    const info = Object.fromEntries(HOME_SECTIONS.map(([id, title, desc]) => [id, { title, desc }]));
    let order = homeOrder();
    const save = async (o) => { order = o; App.settings.homeSections = o; await App.saveSettings(); };
    const draw = () => {
      list.innerHTML = order.map((s) => `<div class="hs-row" role="listitem" data-id="${esc(s.id)}">
        <button class="hs-grip" title="Drag to reorder (or focus and use ↑ ↓)" aria-label="Move ${esc(info[s.id].title)}">${icon('grip', 'fill')}</button>
        <div class="grow"><div class="hs-name">${esc(info[s.id].title)}</div><div class="desc">${esc(info[s.id].desc)}</div></div>
        <label class="switch" title="Show on home"><input type="checkbox" ${s.on ? 'checked' : ''} aria-label="Show ${esc(info[s.id].title)} on home"><span></span></label></div>`).join('');
    };
    const fromDom = () => [...list.children].map((r) => order.find((s) => s.id === r.dataset.id));
    // Drag a row by its handle; it moves live under the pointer and saves on drop.
    let dragging = null;
    list.onpointerdown = (e) => {
      const grip = e.target.closest('.hs-grip');
      if (!grip || e.button !== 0) return;
      e.preventDefault();
      dragging = grip.closest('.hs-row');
      dragging.classList.add('dragging');
      grip.setPointerCapture(e.pointerId);
    };
    list.onpointermove = (e) => {
      if (!dragging) return;
      // Works in one column or two: take the row under the pointer's place in the order.
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.hs-row');
      if (!over || over === dragging || over.parentElement !== list) return;
      const kids = [...list.children];
      list.insertBefore(dragging, kids.indexOf(dragging) < kids.indexOf(over) ? over.nextElementSibling : over);
    };
    const drop = () => {
      if (!dragging) return;
      dragging.classList.remove('dragging');
      dragging = null;
      save(fromDom());
    };
    list.onpointerup = drop;
    list.onpointercancel = drop;
    // Keyboard: arrow keys on a focused handle move its row.
    list.onkeydown = (e) => {
      const grip = e.target.closest('.hs-grip');
      if (!grip || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const row = grip.closest('.hs-row');
      const other = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!other) return;
      if (e.key === 'ArrowUp') list.insertBefore(row, other); else list.insertBefore(other, row);
      grip.focus();
      save(fromDom());
    };
    list.onchange = (e) => {
      const row = e.target.closest('.hs-row');
      if (row) save(order.map((s) => (s.id === row.dataset.id ? { ...s, on: e.target.checked } : s)));
    };
    draw();
    $('#hs-reset').onclick = async () => { await save(HOME_DEFAULTS()); draw(); toast('Home rows reset', 'good'); };
  },

  /* ---------- an AniList discussion thread, read and replied to in the app ---------- */
  async thread({ id }, rid) {
    const t = await AniList.thread(id).catch(() => null);
    if (App.stale(rid)) return '';
    const canPost = AniList.loggedIn();
    return `<div class="page sub-page thread-page">
      <div class="sub-head"><button class="icon-btn" data-act="back" title="Back">${icon('arrowLeft')}</button><h1>${esc((t?.title || 'Discussion').replace(/^\s*\[spoilers?\]\s*/i, ''))}</h1>${t?.siteUrl ? `<button class="link-btn sub-head-act" data-act="link" data-url="${esc(t.siteUrl)}">Open on AniList</button>` : ''}</div>
      <div id="th-list" class="th-list">${commentSkeleton()}</div>
      <div id="th-more"></div>
      <form id="th-form" class="th-compose"><input id="th-input" placeholder="${canPost ? 'Add a comment' : 'Sign in to AniList to comment'}" ${canPost ? '' : 'disabled'} autocomplete="off"><button class="icon-btn" title="Post" ${canPost ? '' : 'disabled'}>${icon('send')}</button></form>
    </div>`;
  },
  async threadAfter({ id }, rid) {
    const list = $('#th-list'), more = $('#th-more');
    if (!list) return;
    let page = 0;
    const load = async () => {
      page++;
      more.innerHTML = '';
      const r = await AniList.threadComments(id, page).catch((e) => ({ comments: [], more: false, error: e.message }));
      if (App.stale(rid)) return;
      if (page === 1) list.innerHTML = r.comments.length ? '' : `<div class="empty">${r.error ? `Couldn’t load the discussion: ${esc(r.error)}` : 'No comments yet. Be the first.'}</div>`;
      list.insertAdjacentHTML('beforeend', r.comments.map((c) => commentNode(c)).join(''));
      if (r.more) { more.innerHTML = '<button class="btn ghost" id="th-load">Load more comments</button>'; $('#th-load').onclick = load; }
    };
    load();
    const needAniList = () => { toast('Sign in to AniList to like and reply', 'bad'); return false; };
    list.onclick = async (e) => {
      const sp = e.target.closest('.th-spoiler');
      if (sp) return sp.classList.add('shown');
      const like = e.target.closest('[data-like]');
      if (like) {
        if (!AniList.loggedIn()) return needAniList();
        like.disabled = true;
        const r = await AniList.likeComment(like.dataset.like).catch((x) => { toast(x.message, 'bad'); return null; });
        like.disabled = false;
        if (r) { like.classList.toggle('on', !!r.isLiked); like.querySelector('span').textContent = r.likeCount || 0; }
        return;
      }
      const reply = e.target.closest('[data-reply]');
      if (reply) {
        if (!AniList.loggedIn()) return needAniList();
        const c = reply.closest('.th-c');
        if (c.querySelector(':scope > .th-reply-form')) return c.querySelector(':scope > .th-reply-form input').focus();
        c.querySelector(':scope > .th-acts').insertAdjacentHTML('afterend', `<form class="th-compose th-reply-form"><input placeholder="Reply to ${esc(c.dataset.user)}" autocomplete="off"><button class="icon-btn" title="Post reply">${icon('send')}</button></form>`);
        const f = c.querySelector(':scope > .th-reply-form');
        f.querySelector('input').focus();
        f.onsubmit = async (ev) => {
          ev.preventDefault();
          const text = f.querySelector('input').value.trim();
          if (!text) return;
          f.querySelector('button').disabled = true;
          const posted = await AniList.postComment(id, text, c.dataset.cid).catch((x) => { toast(x.message, 'bad'); return null; });
          if (!posted) { f.querySelector('button').disabled = false; return; }
          let kids = c.querySelector(':scope > .th-kids');
          if (!kids) { c.insertAdjacentHTML('beforeend', '<div class="th-kids"></div>'); kids = c.querySelector(':scope > .th-kids'); }
          kids.insertAdjacentHTML('beforeend', commentNode(posted));
          f.remove();
        };
      }
    };
    const form = $('#th-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = $('#th-input'), text = input.value.trim();
      if (!text || !AniList.loggedIn()) return;
      input.disabled = true;
      const posted = await AniList.postComment(id, text).catch((x) => { toast(x.message, 'bad'); return null; });
      input.disabled = false;
      if (!posted) return;
      input.value = '';
      list.querySelector('.empty')?.remove();
      list.insertAdjacentHTML('beforeend', commentNode(posted));
      list.lastElementChild.scrollIntoView({ block: 'nearest' });
    };
  },

  async mylist({ tab = 'current', sort = '-updatedAt' }) {
    App.params.tab = tab; App.params.sort = sort;
    if (!Tracker.loggedIn()) {
      return `<div class="page"><div class="page-head"><h1>My List</h1></div>
        <div class="empty">Your list comes from Kitsu or AniList.<br><br><div class="row gap" style="justify-content:center"><button class="btn primary" data-act="kitsuLogin">Sign in to Kitsu</button><button class="btn" data-act="anilistLogin">Sign in to AniList</button></div></div></div>`;
    }
    const view = App.settings.myListView || 'list';
    const tabs = [['', 'All'], ['current', 'Watching'], ['planned', 'Planning'], ['completed', 'Completed'], ['on_hold', 'Paused'], ['dropped', 'Dropped']];
    const sorts = [['-updatedAt', 'Recently updated'], ['anime.titles.canonical', 'Title A–Z'], ['-progress', 'Most progress'], ['-ratingTwenty', 'Your rating'], ['-anime.averageRating', 'Score']];
    return `<div class="page mylist">
      <div class="ml-hero">
        <div class="ml-title"><span class="ml-eyebrow">${Tracker.name==='AniDeck'?'On this device':esc(Tracker.name)+' · synced'}</span><h1>My list</h1><div class="muted small" id="ml-total">&nbsp;</div></div>
        <div class="ml-stats" id="ml-stats">${'<div class="ml-stat"><div class="skel" style="width:70px;height:26px"></div><div class="skel sk-line" style="width:96px"></div></div>'.repeat(4)}</div>
      </div>
      <div class="ml-head">
        <div class="ml-tabs" role="tablist">${tabs.map(([v, l]) => `<button class="ml-tab ${tab === v ? 'on' : ''}" data-act="listTab" data-tab="${v}" data-st="${v || 'all'}" role="tab" aria-selected="${tab === v}"><i></i>${l}<span data-count="${v || 'all'}"></span></button>`).join('')}</div>
        <span class="spacer"></span>
        <label class="ml-search">${icon('search')}<input type="search" id="ml-filter" placeholder="Search this list"></label>
        <div class="chip-wrap"><button class="icon-btn tool" id="ml-sort-btn" title="Sort">${icon('sort')}</button>
          <div class="chip-menu right" id="ml-sort-menu" hidden>${sorts.map(([v, l]) => `<button data-sort="${v}" class="${sort === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <button class="icon-btn tool" id="ml-view" title="${view === 'grid' ? 'Show as list' : 'Show posters'}">${icon(view === 'grid' ? 'list' : 'grid')}</button>
        <button class="icon-btn tool" id="ml-select" title="Select several">${icon('check')}</button>
      </div>
      <div id="ml-items" class="${view === 'grid' ? 'grid ml-grid' : 'ml-rows'}"></div>
      <div id="ml-more" style="text-align:center;margin-top:24px"></div>
      <div class="select-bar" id="ml-bar" hidden>
        <button class="icon-btn" id="sb-close" title="Done">${icon('close')}</button><b id="sb-count">0 selected</b>
        <button class="link-btn" id="sb-all">Select all</button>
        <div class="chip-wrap"><button class="btn ghost sm" id="sb-move" disabled>⇢ Move to ▾</button>
          <div class="chip-menu up" id="sb-move-menu" hidden>${Object.entries(STATUS_LABELS).map(([v, l]) => `<button data-move="${v}">${l}</button>`).join('')}</div></div>
        <button class="btn ghost sm danger" id="sb-remove" disabled>🗑 Remove</button>
      </div>
    </div>`;
  },
  async mylistAfter({ tab = 'current', sort = '-updatedAt' }, rid) {
    if (!Tracker.loggedIn()) return;
    const box = $('#ml-items'), more = $('#ml-more');
    const view = App.settings.myListView || 'list';
    let loaded = [], total = 0, loading = false, selecting = false;
    const selected = new Set();
    const label = (e) => (e.reconsuming ? 'Rewatching' : STATUS_LABELS[e.status] || e.status);
    const prog = (e) => `EP ${e.progress} / ${e.anime.episodes || '?'}`;
    const pct = (e) => (e.anime.episodes ? Math.min(100, (e.progress / e.anime.episodes) * 100) : e.status === 'completed' ? 100 : 0);
    const titlesAttr = (e) => esc(JSON.stringify(e.anime.titles));
    let airing = () => null; // filled in by listAiring() once the schedule has loaded
    const canBump = (e) => e.status !== 'completed' && !(e.anime.episodes && e.progress >= e.anime.episodes);
    // "2 new" when episodes are out that you haven't watched; otherwise when the next one airs.
    const outNote = (e) => {
      const air = e.status === 'completed' ? null : airing(e.anime);
      const behind = air ? air.aired - e.progress : 0;
      if (behind > 0) return `<span class="ml-new">${behind} new</span>`;
      if (air?.next) return `<span class="ml-next" title="${esc(new Date(air.next.at).toLocaleString())}">Ep ${air.next.episode} ${esc(untilText(air.next.at))}</span>`;
      return '';
    };
    const row = (e) => {
      const lib = App.libIndex?.find(e.anime), air = e.status === 'completed' ? null : airing(e.anime);
      const meta = [e.anime.subtype, e.anime.year, e.anime.episodes ? `${e.anime.episodes} eps` : '', ...(e.anime.genres || []).slice(0, 2)].filter(Boolean).join(' · ');
      return `<div class="ml-row ${selected.has(e.anime.id) ? 'sel' : ''}" data-aid="${esc(e.anime.id)}" data-st="${esc(e.reconsuming ? 'current' : e.status)}">
        <button class="sel-dot" data-sel="${esc(e.anime.id)}" title="Select"></button>
        <button class="ml-open" data-act="anime" data-id="${esc(e.anime.id)}" data-mal="${esc(e.anime.malId || '')}" data-titles="${titlesAttr(e)}">
          ${e.anime.poster ? `<img loading="lazy" src="${esc(e.anime.poster)}" alt="">` : '<div class="ph">◆</div>'}
          <div class="ml-name"><b>${esc(e.anime.title)}</b><span>${esc(meta)}</span>
            <span class="ml-chips"><span class="ml-status"><i></i>${esc(label(e))}</span>${lib ? '<span class="ml-lib">In library</span>' : ''}${outNote(e)}</span></div>
        </button>
        <div class="ml-prog"><div class="ml-prog-text"><b>${e.progress}</b><span>/ ${e.anime.episodes || '?'}</span></div>${listTrack(e.progress, e.anime.episodes, air?.aired)}</div>
        <span class="ml-score" title="Your rating · community score">${e.rating ? `<b>${esc(Number(e.rating).toFixed(Number(e.rating) % 1 ? 1 : 0))}</b>` : '<b class="dim">–</b>'}<small>${e.anime.rating ? `★ ${e.anime.rating}%` : ''}</small></span>
        <div class="ml-acts">
          ${canBump(e) ? `<button class="ml-bump" data-bump="${esc(e.anime.id)}" title="Watched episode ${e.progress + 1}">${icon('plus')}<span>1</span></button>` : ''}
          <button class="ml-act" data-act="editEntry" data-kitsu="${esc(e.anime.id)}" data-total="${esc(e.anime.episodes || '')}" data-title="${esc(e.anime.title)}" data-watched="${esc(e.progress)}" title="Edit status, progress and rating">${icon('pencil')}</button>
          ${lib ? `<button class="ml-act" data-act="series" data-id="${esc(lib.Id)}" title="Open in your library">${icon('play', 'fill')}</button>` : ''}
        </div>
      </div>`;
    };
    const card = (e) => {
      const lib = App.libIndex?.find(e.anime);
      return `<div class="ml-card ${selected.has(e.anime.id) ? 'sel' : ''}" data-aid="${esc(e.anime.id)}">
        <button class="card" data-list-status="${esc(e.status)}" data-list-progress="${Number(e.progress)||0}" data-total="${Number(e.anime.episodes)||0}" data-act="anime" data-id="${esc(e.anime.id)}" data-mal="${esc(e.anime.malId || '')}" data-titles="${titlesAttr(e)}">
          <div class="poster">${e.anime.poster ? `<img loading="lazy" src="${esc(e.anime.poster)}" alt="">` : '<div class="ph">◆</div>'}
            ${e.anime.rating ? `<span class="badge right rating">★ ${e.anime.rating}%</span>` : `<span class="badge right rating" data-rate="${esc(e.anime.id)}" hidden></span>`}${lib ? '<span class="badge in" style="top:auto;bottom:10px">In library</span>' : ''}
            ${e.status !== 'completed' && pct(e) ? `<div class="bar"><div style="width:${pct(e)}%"></div></div>` : ''}</div>
          <div class="card-title">${esc(e.anime.title)}</div><div class="card-sub">${!tab ? `${esc(label(e))} · ` : ''}${prog(e)} ${outNote(e)}</div>
        </button>
        <button class="sel-dot" data-sel="${esc(e.anime.id)}" title="Select"></button>
        ${canBump(e) ? `<button class="ml-bump on-card" data-bump="${esc(e.anime.id)}" title="Watched episode ${e.progress + 1}">${icon('plus')}<span>1</span></button>` : ''}
      </div>`;
    };
    const draw = () => {
      const q = norm($('#ml-filter')?.value);
      const list = q ? loaded.filter((e) => e.anime.titles.some((t) => norm(t).includes(q))) : loaded;
      box.innerHTML = list.length ? list.map(view === 'grid' ? card : row).join('')
        : `<div class="empty" style="grid-column:1/-1">${q ? 'Nothing matches that search.' : 'Nothing here yet.'}</div>`;
      more.innerHTML = loaded.length < total ? `<button class="btn" id="ml-load">Load more (${total - loaded.length} left)</button>` : '';
      if ($('#ml-load')) $('#ml-load').onclick = load;
      $('.mylist').classList.toggle('selecting', selecting);
    };
    const syncBar = () => {
      $('#ml-bar').hidden = !selecting;
      $('#sb-count').textContent = `${selected.size} selected`;
      $('#sb-move').disabled = $('#sb-remove').disabled = !selected.size;
      box.querySelectorAll('[data-aid]').forEach((el) => el.classList.toggle('sel', selected.has(el.dataset.aid)));
    };
    const load = async () => {
      if (loading) return; loading = true;
      if ($('#ml-load')) $('#ml-load').textContent = 'Loading…';
      try {
        const r = await Tracker.list(tab, loaded.length, 40, sort);
        if (App.stale(rid)) return;
        loaded = loaded.concat(r.entries); total = r.total;
        if (r.statusCounts) {
          const c = r.statusCounts, map = { current: c.current, planned: c.planned, completed: c.completed, on_hold: c.onHold ?? c.on_hold, dropped: c.dropped };
          map.all = Object.values(map).reduce((a, b) => a + (b || 0), 0);
          document.querySelectorAll('[data-count]').forEach((el) => { const n = map[el.dataset.count]; el.textContent = n != null ? ` · ${n}` : ''; });
          $('#ml-total').textContent = `${map.all} title${map.all === 1 ? '' : 's'}`;
        } else {
          const el = document.querySelector(`[data-count="${tab || 'all'}"]`); if (el) el.textContent = ` · ${total}`;
          $('#ml-total').textContent = `${total} title${total === 1 ? '' : 's'}`;
        }
      } catch (e) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn't load your ${Tracker.name} list: ${esc(e.message)}</div>`; loading = false; return; }
      loading = false;
      draw(); syncBar();
    };
    // --- header tools
    $('#ml-filter').oninput = async () => { draw(); syncBar(); while ($('#ml-filter')?.value && loaded.length < total && !App.stale(rid)) await load(); };
    $('#ml-sort-btn').onclick = (e) => { e.stopPropagation(); $('#ml-sort-menu').hidden = !$('#ml-sort-menu').hidden; };
    $('#ml-sort-menu').onclick = (e) => { const b = e.target.closest('[data-sort]'); if (b) App.nav('mylist', { tab, sort: b.dataset.sort }, false); };
    $('#ml-view').onclick = async () => { App.settings.myListView = view === 'grid' ? 'list' : 'grid'; await App.saveSettings(); App.nav('mylist', { tab, sort }, false); };
    $('#ml-select').onclick = () => { selecting = !selecting; if (!selecting) selected.clear(); draw(); syncBar(); };
    // --- selection
    box.addEventListener('click', (e) => {
      const dot = e.target.closest('[data-sel]');
      const item = e.target.closest('[data-aid]');
      if (!dot && !(selecting && item)) return;
      e.preventDefault(); e.stopPropagation();
      const id = (dot || item).dataset.sel || item.dataset.aid;
      if (!selecting) selecting = true;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      $('.mylist').classList.add('selecting'); syncBar();
    }, true);
    $('#sb-close').onclick = () => { selecting = false; selected.clear(); draw(); syncBar(); };
    $('#sb-all').onclick = () => { loaded.forEach((x) => selected.add(x.anime.id)); syncBar(); };
    $('#sb-move').onclick = (e) => { e.stopPropagation(); $('#sb-move-menu').hidden = !$('#sb-move-menu').hidden; };
    const bulk = async (fn, done) => {
      const ids = [...selected];
      $('#sb-count').textContent = `Updating ${ids.length}…`;
      let ok = 0;
      for (const id of ids) { try { await fn(id); ok++; } catch { /* keep going */ } }
      toast(`${done} ${ok} of ${ids.length}`, ok === ids.length ? 'good' : 'bad');
      App.nav('mylist', { tab, sort }, false);
    };
    $('#sb-move-menu').onclick = (e) => { const b = e.target.closest('[data-move]'); if (b) bulk((id) => Tracker.setStatus(id, b.dataset.move), `Moved to ${STATUS_LABELS[b.dataset.move]}:`); };
    $('#sb-remove').onclick = () => bulk((id) => Tracker.setStatus(id, 'remove'), 'Removed');
    // +1: one more episode watched, straight from the list (completes the show on its last episode).
    box.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-bump]');
      if (!b || selecting) return;
      ev.preventDefault(); ev.stopPropagation();
      const e = loaded.find((x) => String(x.anime.id) === b.dataset.bump);
      if (!e || b.disabled) return;
      b.disabled = true;
      const to = e.progress + 1;
      try {
        await Tracker.setProgress(e.anime.id, to, e.anime.episodes);
        e.progress = to;
        if (e.anime.episodes && to >= e.anime.episodes) e.status = 'completed'; else if (e.status === 'planned') e.status = 'current';
        toast(e.status === 'completed' ? `Completed ${e.anime.title}` : `${e.anime.title}: episode ${to} watched`, 'good');
        draw(); syncBar();
      } catch (x) { b.disabled = false; toast(`${Tracker.name} update failed: ${x.message}`, 'bad'); }
    });
    const skRow = '<div class="ml-row sk"><span></span><div class="ml-open"><div class="skel" style="width:46px;height:66px;border-radius:8px"></div><div class="sk-stack" style="flex:1"><div class="skel sk-line" style="width:48%"></div><div class="skel sk-line" style="width:30%"></div></div></div><div class="skel sk-line" style="height:8px"></div><span></span><span></span></div>';
    box.innerHTML = view === 'grid' ? posterSkeleton(18) : skRow.repeat(8);
    // In the background: what's out for airing shows, and stats over your whole list.
    // When the schedule arrives, fill in "2 new" / "Ep 8 in 2d" and the progress tracks row by row, in place, so the
    // titles' entrance animation isn't cut short by a full redraw.
    const patchAiring = () => {
      const tmp = document.createElement('div');
      for (const e of loaded) {
        const el = box.querySelector(`[data-aid="${CSS.escape(String(e.anime.id))}"]`);
        if (!el) continue;
        tmp.innerHTML = (view === 'grid' ? card : row)(e);
        const next = tmp.firstElementChild;
        for (const sel of view === 'grid' ? ['.card-sub'] : ['.ml-chips', '.ml-prog']) {
          const a = el.querySelector(sel), b = next?.querySelector(sel);
          if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
        }
      }
    };
    listAiring().then((fn) => { if (App.stale(rid)) return; airing = fn; if (loaded.length) patchAiring(); }).catch(() => {});
    Tracker.list('', 0, 500).then((r) => { if (!App.stale(rid) && $('#ml-stats')) $('#ml-stats').innerHTML = listStats(r.entries || []); })
      .catch(() => { if ($('#ml-stats')) $('#ml-stats').hidden = true; });
    await load();
  },

  async browse({ src = 'anime' }) {
    const f = (App.params.f ||= {});delete f.inLibrary;
    const labelFor = { anime: 'anime', show: 'TV shows', movie: 'movies' };
    const animeGenres = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Isekai', 'Josei', 'Magic', 'Mecha', 'Military', 'Music', 'Mystery', 'Psychological', 'Romance', 'School', 'Science Fiction', 'Seinen', 'Shoujo', 'Shounen', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
    const traktGenres = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'];
    const genres = src === 'anime' ? animeGenres : traktGenres;
    if (f.genre && !genres.some((g) => g.toLowerCase() === String(f.genre).toLowerCase())) genres.unshift(f.genre);
    const years = [['', 'Any year'], ...Array.from({ length: 8 }, (_, i) => [String(2026 - i), String(2026 - i)]), ['2010s', '2010s'], ['2000s', '2000s'], ['1990s', '1990s']];
    const chip = (key, label, options) => {
      const cur = options.find(([v]) => String(v).toLowerCase() === String(f[key] ?? '').toLowerCase());
      const on = !!f[key];
      return `<div class="chip-wrap"><button class="chip ${on ? 'on' : ''}" data-chip="${key}">${esc(on ? `${label} · ${cur?.[1] || f[key]}` : label)} ▾</button>
        <div class="chip-menu" data-menu="${key}" hidden>${options.map(([v, l]) => `<button data-pick="${key}" data-val="${esc(v)}" class="${String(v).toLowerCase() === String(f[key] ?? '').toLowerCase() ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
    };
    const sorts = src === 'anime'
      ? [['', 'Sort · Popular'], ['rating', 'Sort · Rating'], ['new', 'Sort · Newest'], ['old', 'Sort · Oldest'], ['az', 'Sort · A–Z']]
      : [['', 'Sort · Popular'], ['trending', 'Sort · Trending'], ['watched', 'Sort · Most watched']];
    const active = Object.entries(f).filter(([k, v]) => v && !['sort', 'hideWatched'].includes(k));
    const pretty = { genre: (v) => v, year: (v) => v, season: (v) => v[0].toUpperCase() + v.slice(1), format: (v) => ({ TV: 'TV', movie: 'Movie', ONA: 'ONA', OVA: 'OVA', special: 'Special' })[v] || v, status: (v) => ({ current: 'Airing', finished: 'Finished', upcoming: 'Upcoming', airing: 'Airing' })[v] || v };
    return `<div class="page browse-page">
      <div class="page-head"><h1>Browse ${src === 'anime' ? '' : labelFor[src]}</h1><span class="spacer"></span><span class="muted" id="b-count"></span></div>
      <div class="chips" id="b-chips">
        <div class="seg-switch">${['anime', 'show', 'movie'].map((x) => `<button class="${x === src ? 'on' : ''}" data-src="${x}">${x === 'anime' ? 'Anime' : x === 'show' ? 'TV' : 'Movies'}</button>`).join('')}</div>
        ${chip('genre', 'Genre', [['', 'Any genre'], ...genres.map((g) => [g, g])])}
        ${chip('year', 'Year', years)}
        ${src === 'anime' ? chip('season', 'Season', [['', 'Any season'], ['winter', 'Winter'], ['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall']]) : ''}
        ${src === 'anime' ? chip('format', 'Format', [['', 'Any format'], ['TV', 'TV'], ['movie', 'Movie'], ['ONA', 'ONA'], ['OVA', 'OVA'], ['special', 'Special']]) : ''}
        ${src !== 'movie' ? chip('status', 'Status', src === 'anime' ? [['', 'Any status'], ['current', 'Airing'], ['finished', 'Finished'], ['upcoming', 'Upcoming']] : [['', 'Any status'], ['airing', 'Airing'], ['finished', 'Ended']]) : ''}
        <button class="chip ${f.hideWatched ? 'on' : ''}" data-toggle="hideWatched">Hide what I've watched</button>
        <span class="chip-sep"></span>
        ${chip('sort', 'Sort', sorts)}
      </div>
      ${active.length ? `<div class="pills">${active.map(([k, v]) => `<button class="pill" data-clear="${k}">${esc((pretty[k] || ((x) => x))(String(v)))} ✕</button>`).join('')}<button class="link-btn" data-clear="*">Clear all</button></div>` : ''}
      <div class="grid browse-grid" id="b-grid"></div>
      <div id="b-more" class="loading" hidden><div class="spinner"></div></div>
    </div>`;
  },
  async browseAfter({ src = 'anime' }, rid) {
    const f = App.params.f || {};
    const grid = $('#b-grid'), more = $('#b-more');
    let offset = 0, page = 1, total = null, done = false, loading = false, shown = 0;
    const reqs = new Set((await Requests.list()).map((r) => r.kitsuId));
    const card = (x) => {
      const lib = x.kind === 'anime' ? App.libIndex?.find(x) : App.findByIds(x.ids, x.title, x.year, x.kind);
      if (f.hideWatched && lib?.UserData?.Played) return '';
      if (x.kind !== 'anime') App.traktCache = { ...(App.traktCache || {}), [x.id]: x };
      const act = lib ? ['series', lib.Id] : x.kind === 'anime' ? ['anime', x.id] : ['media', x.id];
      const meta = [x.rating ? `★ ${x.rating}%` : '', x.kind === 'anime' ? x.subtype : x.kind === 'movie' ? 'Movie' : 'TV', x.year, x.episodes && x.kind !== 'movie' ? `${x.episodes} eps` : ''].filter(Boolean).join(' · ');
      shown++;
      return `<button class="card hover-card" data-act="${act[0]}" data-id="${esc(act[1])}" ${x.titles ? `data-titles="${esc(JSON.stringify(x.titles))}"` : ''}>
        <div class="poster">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" alt="">` : `<div class="ph">◆</div>`}
          ${lib ? '<span class="badge in">In library</span>' : reqs.has(x.id) ? '<span class="badge req">Requested</span>' : ''}
          ${x.rating ? `<span class="badge right rating">★ ${x.rating}%</span>` : src === 'anime' ? `<span class="badge right rating" data-rate="${esc(x.id)}" hidden></span>` : ''}
          <div class="hover-info"><span class="hover-play">${lib ? '▶' : '＋'}</span><div class="hover-meta">${esc(meta)}</div><div class="hover-syn">${esc(x.synopsis || '')}</div></div></div>
        <div class="card-title">${esc(x.title)}</div>
      </button>`;
    };
    const load = async () => {
      if (loading || done) return;
      loading = true; more.hidden = false;
      try {
        let items;
        if (src === 'anime') {
          const r = await Kitsu.browse(f, offset, 20);
          items = sfw(r.items).map((a) => ({ ...a, kind: 'anime' })); total = r.total; offset += 20;
          if (!r.items.length || (total != null && offset >= total)) done = true;
        } else {
          items = await Trakt.browse(src, f, page, 24); page++;
          if (!items.length || page > 40) done = true;
        }
        if (App.stale(rid)) return;
        grid.insertAdjacentHTML('beforeend', items.map(card).join(''));
        $('#b-count').textContent = total != null ? `${total.toLocaleString()} ${src === 'anime' ? 'shows' : src === 'movie' ? 'movies' : 'shows'}` : `${shown}${done ? '' : '+'} ${src === 'movie' ? 'movies' : 'shows'}`;
        if (!grid.children.length && done) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Nothing matches these filters.</div>';
      } catch (e) {
        done = true;
        if (!grid.children.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn’t load: ${esc(e.message)}</div>`;
      }
      loading = false; more.hidden = true;
      // keep filling until the page can scroll
      const main = $('#main');
      if (!done && main.scrollHeight <= main.clientHeight + 200) load();
    };
    const main = $('#main');
    main.onscroll = () => { if (App.view === 'browse' && main.scrollTop + main.clientHeight > main.scrollHeight - 900) load(); };
    const chips = $('#b-chips');
    const go = (nf, nsrc = src) => App.nav('browse', { src: nsrc, f: nf }, false);
    chips.onclick = (e) => {
      const open = e.target.closest('[data-chip]'), pick = e.target.closest('[data-pick]'), tog = e.target.closest('[data-toggle]'), sw = e.target.closest('[data-src]');
      if (sw) return go({ hideWatched: f.hideWatched }, sw.dataset.src);
      if (open) {
        e.stopPropagation();
        const m = chips.querySelector(`[data-menu="${open.dataset.chip}"]`); const was = m.hidden;
        chips.querySelectorAll('.chip-menu').forEach((x) => { x.hidden = true; }); m.hidden = !was; return;
      }
      if (pick) return go({ ...f, [pick.dataset.pick]: pick.dataset.val });
      if (tog) return go({ ...f, [tog.dataset.toggle]: !f[tog.dataset.toggle] });
    };
    document.querySelectorAll('[data-clear]').forEach((b) => { b.onclick = () => go(b.dataset.clear === '*' ? { sort: f.sort } : { ...f, [b.dataset.clear]: '' }); });
    load();
  },

  async search({ q }) {
    q = (q || '').trim();
    $('#tb-q').value = q; syncSearchClear();
    if (q.length < 2) return `<div class="page"><div class="empty">${ANIME_ONLY ? 'Type an anime name in the search bar above.' : 'Type a show or movie name in the search bar above.'}</div></div>`;
    const f = App.params.f || {};
    const chip = (key, label, options) => {
      const cur = options.find(([v]) => String(v) === String(f[key] ?? ''));
      const on = f[key] !== undefined && f[key] !== '';
      return `<div class="chip-wrap"><button class="chip ${on ? 'on' : ''}" data-chip="${key}">${esc(on ? cur?.[1] || label : label)} ▾</button>
        <div class="chip-menu" data-menu="${key}" hidden>${options.map(([v, l]) => `<button data-pick="${key}" data-val="${esc(v)}" class="${String(v) === String(f[key] ?? '') ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
    };
    return `<div class="page search-page">
      <div class="page-head"><h1>Results for “${esc(q)}”</h1><span class="spacer"></span><span class="muted" id="s-count"></span></div>
      <div class="chips" id="s-chips">
        ${chip('type', 'Type', ANIME_ONLY ? [['', 'All types'], ['TV', 'TV'], ['movie', 'Movies'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['special', 'Specials']] : [['', 'All types'], ['anime', 'Anime'], ['show', 'TV shows'], ['movie', 'Movies']])}
        <div id="s-genre-chip" class="chip-slot"></div>
        ${chip('year', 'Year', [['', 'Any year'], ...[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((y) => [y, String(y)]), ['2010s', '2010s'], ['2000s', '2000s'], ['1990s', '1990s'], ['old', 'Before 1990']])}
        ${chip('status', 'Status', [['', 'Any status'], ['airing', 'Airing'], ['finished', 'Finished'], ['upcoming', 'Upcoming']])}
        <button class="chip ${f.hideWatched ? 'on' : ''}" data-toggle="hideWatched">Hide what I've watched</button>
        <span class="chip-sep"></span>
        ${chip('sort', 'Sort · Best match', [['', 'Sort · Best match'], ['rating', 'Sort · Rating'], ['new', 'Sort · Newest'], ['old', 'Sort · Oldest'], ['az', 'Sort · A–Z']])}
      </div>
      <div class="grid" id="s-grid">${posterSkeleton(12)}</div>
    </div>`;
  },
  async searchAfter({ q }, rid) {
    q = (q || '').trim();
    if (q.length < 2) return;
    const f = (App.params.f ||= {});delete f.inLibrary;
    // Gather results: Kitsu (anime), Trakt (movies & TV), plus matching items already in your library.
    let anime = [], tv = [], catalogError=null;
    await Promise.all([
      Kitsu.searchWithGenres(q, 20).then((r) => { anime = sfw(r); }).catch(() => Kitsu.search(q, 20).then((r) => { anime = sfw(r); }).catch(error => {catalogError=error;})),
      Trakt.search(q, 20).then((r) => { tv = r.filter((x) => !x.genres.includes('anime')); }).catch(() => {}),
    ]);
    if (App.stale(rid)) return;
    if(catalogError&&!anime.length){$('#s-grid').innerHTML=`<div class="empty"><b>Couldn’t verify anime results</b><p>${esc(catalogError.message||'The anime catalog is temporarily unavailable.')}</p><button class="btn ghost" data-act="retry">Try again</button></div>`;return;}
    App.traktCache = { ...(App.traktCache || {}), ...Object.fromEntries(tv.map((x) => [x.id, x])) };
    const reqs = new Set((await Requests.list()).map((r) => r.kitsuId));
    const statusOf = (s) => (/current|returning|production/.test(s || '') ? 'airing' : /finished|ended|canceled|released/.test(s || '') ? 'finished' : /upcoming|unreleased|tba|planned|rumored|post production/.test(s || '') ? 'upcoming' : '');
    const cap = (g) => String(g).replace(/(^|[\s-])\w/g, (c) => c.toUpperCase()).replace(/-/g, ' ');
    const items = [];
    const seenLib = new Set();
    anime.forEach((a, i) => {
      const lib = App.libIndex?.find(a);
      if (lib) seenLib.add(lib.Id);
      items.push({ key: a.id, kind: 'anime', subtype: a.subtype, title: a.title, year: Number(a.year) || 0, rating: a.rating, poster: a.poster, genres: (a.genres || []).map(cap), status: statusOf(a.status), lib, requested: reqs.has(a.id), order: i * 2, open: lib ? ['series', lib.Id, App.librarySeason(lib, a)] : ['anime', a.id], titles: a.titles });
    });
    tv.forEach((x, i) => {
      const lib = App.findByIds(x.ids, x.title, x.year, x.kind);
      if (lib) seenLib.add(lib.Id);
      items.push({ key: x.id, kind: x.kind, title: x.title, year: Number(x.year) || 0, rating: x.rating, poster: x.poster, genres: (x.genres || []).map(cap), status: statusOf(x.status || ''), lib, requested: reqs.has(x.id), order: i * 2 + 1, open: lib ? ['series', lib.Id] : ['media', x.id] });
    });
    const nq = norm(q);


    // Genre chip is built from what came back.
    const genres = [...new Set(items.flatMap((x) => x.genres))].sort();
    $('#s-genre-chip').outerHTML = genres.length ? `<div class="chip-wrap"><button class="chip ${f.genre ? 'on' : ''}" data-chip="genre">${esc(f.genre || 'Genre')} ▾</button>
      <div class="chip-menu" data-menu="genre" hidden><button data-pick="genre" data-val="" class="${f.genre ? '' : 'on'}">Any genre</button>${genres.map((g) => `<button data-pick="genre" data-val="${esc(g)}" class="${f.genre === g ? 'on' : ''}">${esc(g)}</button>`).join('')}</div></div>` : '';

    const yearOk = (y) => {
      if (!f.year) return true;
      if (!y) return false;
      if (f.year === 'old') return y < 1990;
      if (/s$/.test(f.year)) { const d = Number(f.year.slice(0, 4)); return y >= d && y < d + 10; }
      return y === Number(f.year);
    };
    const draw = () => {
      let list = items.filter((x) => (!f.type || x.kind === f.type || String(x.subtype || '').toLowerCase() === String(f.type).toLowerCase()) && (!f.genre || x.genres.includes(f.genre)) && yearOk(x.year)
        && (!f.status || x.status === f.status) && (!f.hideWatched || !x.lib?.UserData?.Played) && (!f.inLibrary || x.lib));
      if (f.sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      else if (f.sort === 'new') list.sort((a, b) => (b.year || 0) - (a.year || 0));
      else if (f.sort === 'old') list.sort((a, b) => (a.year || 9999) - (b.year || 9999));
      else if (f.sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
      else list.sort((a, b) => a.order - b.order);
      $('#s-count').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;
      $('#s-grid').innerHTML = list.length ? list.map((x) => `<button class="card" data-act="${x.open[0]}" data-id="${esc(x.open[1])}" ${x.open[2] != null ? `data-season="${esc(x.open[2])}"` : ''} ${x.titles ? `data-titles="${esc(JSON.stringify(x.titles))}"` : ''}>
          <div class="poster">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" alt="">` : `<div class="ph">${x.kind === 'movie' ? '🎬' : x.kind === 'show' ? '▦' : '◆'}</div>`}
            ${x.lib ? '<span class="badge in">In library</span>' : x.requested ? '<span class="badge req">Requested</span>' : ''}
            ${x.rating ? `<span class="badge right rating">★ ${x.rating}%</span>` : x.kind === 'anime' ? `<span class="badge right rating" data-rate="${esc(x.key)}" hidden></span>` : ''}</div>
          <div class="card-title">${esc(x.title)}</div>
          <div class="card-sub">${esc([x.kind === 'anime' ? 'Anime' : x.kind === 'movie' ? 'Movie' : 'TV show', x.year || ''].filter(Boolean).join(' · '))}</div>
        </button>`).join('') : '<div class="empty" style="grid-column:1/-1">Nothing matches these filters.</div>';
    };
    const chips = $('#s-chips');
    chips.onclick = (e) => {
      const open = e.target.closest('[data-chip]'), pick = e.target.closest('[data-pick]'), tog = e.target.closest('[data-toggle]');
      if (open) {
        e.stopPropagation();
        const m = chips.querySelector(`[data-menu="${open.dataset.chip}"]`);
        const was = m.hidden;
        chips.querySelectorAll('.chip-menu').forEach((x) => { x.hidden = true; });
        m.hidden = !was;
        return;
      }
      if (pick) { f[pick.dataset.pick] = pick.dataset.val; App.nav('search', { q, f }, false); return; }
      if (tog) { f[tog.dataset.toggle] = !f[tog.dataset.toggle]; App.nav('search', { q, f }, false); }
    };
    draw();
  },

  async requests() {
    if (!Requests.enabled()) return `<div class="page"><h1>Library requests</h1><div class="empty">Requests are available when a Jellyfin library is connected.</div></div>`;
    const list = await Requests.list();
    const hook = await Requests.webhook();
    let html = `<div class="page"><div class="page-head"><h1>Requests</h1><span class="muted">Things you've asked to have added</span></div>`;
    if (!hook) html += `<div class="track-box"><div class="grow"><b>Requests aren't connected yet.</b><div class="small muted">The server owner needs to add a Discord webhook in Settings.</div></div><button class="btn sm" data-act="goSettings">Settings</button></div>`;
    if (!list.length) return html + '<div class="empty">No requests yet. Search for something and hit “Request”.</div></div>';
    const rows = list.map((r) => ({ r, lib: App.requestHit(r) }));
    for (const { r, lib } of rows) if (lib && !r.addedAt) { Requests.markAdded(r.kitsuId); r.addedAt = Date.now(); }
    const card = ({ r, lib }) => `<div class="result">
        ${r.poster ? `<img src="${esc(r.poster)}" alt="">` : '<div class="ph">◆</div>'}
        <div><h3>${esc(r.title)}</h3><div class="small muted">${esc(r.kind === 'movie' ? 'Movie' : r.kind === 'show' ? 'TV show' : 'Anime')}${r.year ? ` · ${esc(r.year)}` : ''} · requested ${esc(new Date(r.at).toLocaleDateString())}${r.note ? ` · “${esc(r.note)}”` : ''}</div>
          ${lib ? `<div class="watched" style="margin-top:8px">✓ Added ${esc(new Date(r.addedAt).toLocaleDateString())} · clears from this list after 14 days</div>` : '<div class="small muted" style="margin-top:8px">Waiting to be added</div>'}</div>
        <div class="result-actions">
          ${lib ? `<button class="btn primary" data-act="series" data-id="${esc(lib.Id)}">▶ Watch</button>` : ''}
          <button class="btn ghost" data-act="link" data-url="${esc(r.url)}">${r.kind && r.kind !== 'anime' ? 'Trakt' : 'Kitsu'} ↗</button>
          <button class="btn ghost" data-act="unrequest" data-id="${esc(r.kitsuId)}">${lib ? 'Dismiss' : 'Cancel'}</button>
        </div></div>`;
    const waiting = rows.filter((x) => !x.lib), added = rows.filter((x) => x.lib);
    if (added.length) html += `<h2>Added to the library</h2><div class="results">${added.map(card).join('')}</div>`;
    if (waiting.length) html += `<h2>Waiting</h2><div class="results">${waiting.map(card).join('')}</div>`;
    return html + '</div>';
  },

  // The profile page (yours and AniDeck friends') lives in watcher.js.

  async settings() {
    const s = App.settings;
    const cfg = await window.native.config();
    const hook = (await window.native.get('requestWebhook')) || '';
    const version = await window.native.version();
    let koFiUrl = '';
    try {
      const url = new URL(cfg.koFiUrl);
      if (url.protocol === 'https:' && ['ko-fi.com', 'www.ko-fi.com'].includes(url.hostname) && !url.username && !url.password && !url.port && url.pathname !== '/') koFiUrl = url.href;
    } catch { /* No support page configured yet. */ }
    const sw = (key) => `<label class="switch"><input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''}><span></span></label>`;
    const langs = [['jpn', 'Japanese'], ['eng', 'English'], ['spa', 'Spanish'], ['por', 'Portuguese'], ['fre', 'French'], ['ger', 'German']];
    const opt = (list, val) => list.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="settings-layout"><nav class="set-nav" aria-label="Settings sections"><div class="set-identity"><img class="set-wordmark" src="brand/wordmark.svg" alt="AniDeck"><small>Your next watch, on deck.</small></div><h1>Settings</h1><div id="set-menu"></div><p class="set-autosave">Your preferences save automatically.</p></nav><div class="settings">
      <div class="set-card set-account"><h3>Account</h3><p class="set-section-intro">Your identity, your list, your library. Connect a tracker to keep your anime in sync; Jellyfin is optional.</p>
        ${accountProfileCard()}<div class="acct-list">${trackerRows()}
        <div class="acct-row"><span class="avatar">${icon('grid')}</span>
          <div class="grow"><b>Jellyfin library</b><div class="desc">${Jellyfin.connected() ? `${esc(Jellyfin.userName)} · ${esc(Jellyfin.server)}` : 'Optional · connect your own media server and library'}</div></div>
          <button class="btn ghost sm" data-act="${Jellyfin.connected() ? 'jellyLogout' : 'jellyLogin'}">${Jellyfin.connected() ? 'Disconnect' : 'Connect library'}</button></div></div>
        ${Jellyfin.connected() ? `<div class="set-row"><div><div>Jellyfin home network address</div><div class="desc">Optional. The local address of this Jellyfin server, such as http://192.168.1.50:8096. AniDeck uses it to access your Jellyfin library faster at home. This only affects Jellyfin library playback. ${Jellyfin.usingLocal ? '<b style="color:var(--good)">Using the local Jellyfin address now.</b>' : ''}</div></div></div>
        <div class="row gap"><input type="url" id="lan" aria-label="Jellyfin home network address" placeholder="http://192.168.x.x:8096" value=""><button class="btn" id="lan-save">Save Jellyfin address</button></div>` : ''}</div>

      <div class="set-card"><h3>Appearance</h3>
        <div class="set-row"><div><div>Use AniList artwork</div><div class="desc">Anime in your library show AniList’s covers and banners instead of Jellyfin’s.</div></div>${sw('alArt')}</div>
        <div class="set-row"><div><div>Accent color</div><div class="desc">Used for highlights, buttons and progress bars.</div></div>
          <div class="swatches">${Object.entries(ACCENTS).map(([k, [l, rgb]]) => `<button class="swatch ${(s.accent || 'lavender') === k ? 'on' : ''}" data-accent="${k}" title="${l}" style="--c:rgb(${rgb})"></button>`).join('')}</div></div>
        <div class="set-row"><div><div>Interface size</div><div class="desc">Makes everything bigger or smaller.</div></div>
          <select data-set="uiScale">${opt([[0.9, 'Small'], [1, 'Normal'], [1.1, 'Large'], [1.25, 'Extra large']], s.uiScale)}</select></div>
        <div class="set-row"><div><div>Poster size</div><div class="desc">How big show posters are in rows and grids.</div></div>
          <select data-set="posterSize">${opt([['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], s.posterSize)}</select></div>
        <div class="set-row"><div><div>Show titles in</div><div class="desc">English names, or the original Japanese names in English letters.</div></div>
          <select data-set="titleLang">${opt([['en', 'English'], ['romaji', 'Romaji (Shingeki no Kyojin)']], s.titleLang)}</select></div>
        <div class="set-row"><div><div>Reduce motion</div><div class="desc">Turns off animations.</div></div>${sw('reduceMotion')}</div>
        <div class="set-row"><div><div>Confirmation pop-ups</div><div class="desc">Little notes like “Saved” or “Episode 5 watched” in the corner. Errors always show.</div></div>${sw('confirmToasts')}</div>
      </div>

      <div class="set-card"><h3>Tracking</h3>
        <div class="set-row"><div><div>Update ${esc(Tracker.name)} automatically</div><div class="desc">Marks the episode on your list when you finish it.</div></div>${sw('autoTrack')}</div>
        <div class="set-row"><div><div>Count as watched at</div><div class="desc">How far into an episode before it counts.</div></div>
          <select data-set="threshold">${opt([[0.75, '75%'], [0.8, '80%'], [0.85, '85%'], [0.9, '90%'], [0.95, '95%']], s.threshold)}</select></div>
        <div class="set-row"><div><div>Reset show matches</div><div class="desc">Re-detect which Kitsu entry each season belongs to.</div></div><button class="btn ghost sm" data-act="clearMatches">Reset</button></div>
      </div>

      <div class="set-card"><h3>Keyboard</h3>
        <div class="desc">Click a shortcut, then press the key you want. Esc always leaves the player.</div>
        ${KEY_ACTIONS.map(([a, label]) => `<div class="set-row"><div>${esc(label)}</div><button class="keycap" data-key="${a}">${esc(keyLabel(keyFor(a)))}</button></div>`).join('')}
        <div class="set-shortcut-reset"><div><b>Start with the original shortcuts</b><p>Restore AniDeck’s default keys. Your other preferences stay as they are.</p></div><button class="btn ghost" id="keys-reset">${icon('refresh')}Restore shortcuts</button></div>
      </div>

      <div class="set-card"><h3>Home screen</h3>
        <button class="set-row set-link" id="shuffle-pick"><div><div>Shuffle picks from</div><div class="desc" id="shuffle-cur">${esc(shuffleLabel(s.shuffleFrom, true))}</div></div></button>
        <button class="set-row set-link" data-act="homeSections"><div><div>Home rows</div><div class="desc">Pick what Home shows, and in what order</div></div></button>
        <button class="set-row set-link" data-act="ad-widget-settings"><div><div>Deck widgets</div><div class="desc">Choose, size and order the widgets in “Your deck”</div></div></button>
        <div class="set-row"><div><div>Section style</div><div class="desc">Spotlight and Trending run edge to edge and fade into the page, or sit in framed cards.</div></div>
          <select data-set="homeStyle">${opt([['bleed', 'Edge to edge'], ['card', 'Framed']], s.homeStyle || 'bleed')}</select></div>
        <div class="set-row"><div><div>Spotlight speed</div><div class="desc">How long each Spotlight slide stays before the next one.</div></div>
          <select data-set="spotlightMs">${opt([[3000, 'Quick (3 s)'], [4800, 'Normal (4.8 s)'], [7200, 'Relaxed (7.2 s)']], spotlightDuration(s.spotlightMs))}</select></div>
        <div class="set-row"><div><div>Trending chart</div><div class="desc">How many shows the Trending chart ranks.</div></div>
          <select data-set="trendingCount">${opt([[5, 'Top 5'], [9, 'Top 9']], s.trendingCount === 5 ? 5 : 9)}</select></div>
        <div class="set-row"><div><div>Hover previews</div><div class="desc">Expanded quick looks for compact titles. Poster cards show their story directly on hover.</div></div>${sw('hoverPreview')}</div>
        <div class="set-row"><div><div>Hide NSFW shows</div><div class="desc">Keeps ecchi and adult titles out of home, browse and search.</div></div>${sw('hideNsfw')}</div>
      </div>

      <div class="set-card"><h3>TV</h3>
        <div class="tv-intro">
          <span class="tv-intro-icon" aria-hidden="true">${icon('cast')}</span>
          <div class="tv-intro-copy"><span class="tv-intro-kicker">A little more room to watch</span><h4>Your deck. Big screen.</h4><p>Watch on your TV. Keep the controls on your PC.</p><span class="tv-intro-note">A compatible TV browser · Same home network</span></div>
        </div>
        <button class="about-row" data-act="castTv">${icon('cast')}<div class="grow"><b>Cast to TV</b><div class="desc">Open AniDeck in your TV’s browser and connect using its code.</div></div>${icon('chev')}</button>
        <div class="set-row"><div><div>TV interface</div><div class="desc">Larger controls and full screen when using this PC directly on a TV.</div></div>${sw('tvMode')}</div>
      </div>

      ${Jellyfin.connected() ? `<div class="set-card"><h3>Libraries</h3>
        <div class="desc">Choose which libraries are anime. Only anime gets Kitsu tracking. “Auto” checks each show’s genres for Anime.</div>
        ${App.libraries.map((l) => `<div class="set-row"><div><div>${esc(l.Name)}</div><div class="desc">${esc((App.items[l.Id] || []).length)} items · ${esc(l.CollectionType || 'mixed')}</div></div>
          <select data-libmode="${esc(l.Id)}">${opt([['anime', 'Anime'], ['none', 'Not anime'], ['auto', 'Auto-detect']], App.libraryMode(l))}</select></div>`).join('') || '<div class="desc">No libraries found.</div>'}
      </div>` : ''}

      <div class="set-card"><h3>Playback</h3>
        <div class="set-row"><div>Preferred audio</div><select data-set="audioLang">${opt(langs, s.audioLang)}</select></div>
        <div class="set-row"><div><div>Streaming quality cap</div><div class="desc">Lower this if playback buffers away from home.</div></div>
          <select data-set="maxBitrate">${opt([[40000000, 'Original (best)'], [20000000, 'High (20 Mbps)'], [10000000, '1080p (10 Mbps)'], [6000000, '720p (6 Mbps)'], [3000000, '480p (3 Mbps)']], s.maxBitrate)}</select></div>
        <div class="set-row"><div>Auto-play next episode</div>${sw('autoNext')}</div>
        <div class="set-row"><div><div>Default speed</div></div><select data-set="speed">${opt([[0.75, '0.75×'], [1, 'Normal'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']], s.speed)}</select></div>
        <div class="set-row"><div><div>Default picture</div><div class="desc">Fit shows the whole picture, Fill crops to the screen, Stretch fills it.</div></div><select data-set="fit">${opt([['contain', 'Fit'], ['cover', 'Fill'], ['fill', 'Stretch']], s.fit)}</select></div>
        <div class="set-row"><div><div>Skip button length</div><div class="desc">The “+85s” button in the player (handy for openings).</div></div><select data-set="skipLen">${opt([[30, '30s'], [60, '60s'], [85, '85s'], [90, '90s'], [120, '2 min']], s.skipLen)}</select></div>
        <div class="set-row"><div><div>Left / right seek</div></div><select data-set="seekStep">${opt([[5, '5s'], [10, '10s'], [15, '15s'], [30, '30s']], s.seekStep)}</select></div>
        <div class="set-row"><div><div>Auto-skip intros & recaps</div><div class="desc">Otherwise a “Skip intro” button shows up.</div></div>${sw('autoSkip')}</div></div>

      <div class="set-card"><h3>Subtitles</h3>
        <div class="set-row"><div>Preferred subtitles</div><select data-set="subLang">${opt([['off', 'Off'], ...langs.filter((l) => l[0] !== 'jpn')], s.subLang)}</select></div>
        <div class="set-row"><div><div>Size</div></div><select data-set="subSize">${opt([['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large'], ['xl', 'Extra large']], s.subSize || 'md')}</select></div>
        <div class="set-row"><div><div>Style</div><div class="desc">Clean outline keeps the picture clear; Dark box is easiest to read on bright scenes.</div></div>
          <select data-set="subStyle">${opt([['outline', 'Clean outline'], ['shadow', 'Soft shadow'], ['box', 'Dark box']], s.subStyle || 'outline')}</select></div>
        <div class="sub-preview" id="sub-preview"><div class="p-subs"><div class="p-sub"><span>I’ll keep walking, <i>for those who come after.</i></span></div></div></div>
      </div>

      ${Requests.enabled() ? `<div class="set-card"><h3>Requests</h3>
        <div class="desc">Requests post to a Discord channel through a webhook. Leave blank to use the built-in one (only works on the app owner’s server).</div>
        <div class="row gap"><input type="url" id="hook" placeholder="https://discord.com/api/webhooks/…" value="${esc(hook)}"><button class="btn" id="hook-save">Save</button><button class="btn ghost" id="hook-test">Test</button></div></div>` : ''}

      <div class="set-card"><h3>About</h3>
        <div class="about-build"><img src="brand/mark.svg" alt="" aria-hidden="true"><div><b>AniDeck</b><p>Version ${esc(version)} <span class="about-channel">${cfg.testBuild?'Test build':App.update?.packaged===false?'Development':'Release build'}</span></p>${cfg.testBuild?`<small>Build ${esc(cfg.testBuild)}</small>`:''}</div></div>
        <button class="about-row" id="upd-check">${icon('refresh')}<div class="grow"><b>Check for releases</b><div class="desc" id="upd-status">${esc(updateText(App.update))}</div></div>${icon('chev')}</button>
        <button class="about-row" id="upd-release" ${App.update.state==='available'?'':'hidden'}>${icon('external')}<div class="grow"><b>View release${App.update.version?' v'+esc(App.update.version):''}</b><div class="desc">Read what’s changed and choose a download on GitHub</div></div>${icon('chev')}</button>
        <button class="about-row" id="wn-open">${icon('spark')}<div class="grow"><b>What’s new</b><div class="desc">Changes in version ${esc(version)}</div></div>${icon('chev')}</button>
        <button class="about-row" data-act="systemChecks">${icon('checkCircle')}<div class="grow"><b>System checks</b><div class="desc">Check saving, catalogs and account connections. Copy a report if something needs attention.</div></div>${icon('chev')}</button>
        <button class="about-row support-row" data-act="link" data-url="${esc(koFiUrl)}" ${koFiUrl ? '' : 'disabled'}>${icon('heart')}<div class="grow"><b>Support AniDeck on Ko-fi</b><div class="desc">${koFiUrl ? 'Help keep AniDeck growing. Thank you for your support.' : 'Support link coming soon'}</div></div>${icon('external')}</button>
        <button class="about-row" data-act="link" data-url="${GITHUB_URL}">${icon('code')}<div class="grow"><b>GitHub</b><div class="desc">${GITHUB_URL.replace('https://', '')}</div></div>${icon('external')}</button>
        <button class="about-row" data-act="link" data-url="${GITHUB_URL}/issues/new">${icon('bug')}<div class="grow"><b>Report a problem</b><div class="desc">Opens a new issue on GitHub</div></div>${icon('external')}</button>
      </div>
    </div></div>`;
  },
  settingsAfter() {
    // Left-hand section menu; only one section shows at a time.
    const cards = [...document.querySelectorAll('.settings .set-card')];
    const show = (i) => {
      App.params.section = i;
      cards.forEach((c, j) => { c.hidden = j !== i; });
      document.querySelectorAll('#set-menu button').forEach((b) => { const active = Number(b.dataset.i) === i; b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
    };
    const groups = [
      ['Your shelf', ['Appearance', 'Home screen', 'Tracking']],
      ['Watching', ['Playback', 'Subtitles', 'Keyboard']],
      ['Connections', ['Account', 'Libraries', 'TV', 'Requests']],
      ['App', ['Notifications','About']],
    ];
    $('#set-menu').innerHTML = groups.map(([label, titles]) => `<div class="set-group"><span class="set-group-label">${esc(label)}</span>${titles.map((title) => { const i = cards.findIndex((c) => c.querySelector('h3').textContent === title); return i < 0 ? '' : `<button class="set-tab" data-i="${i}">${esc(title)}</button>`; }).join('')}</div>`).join('');
    $('#set-menu').querySelectorAll('button').forEach((b) => { b.onclick = () => show(+b.dataset.i); });
    const appearance=cards.findIndex(card=>card.querySelector('h3')?.textContent==='Appearance');
    const requested=App.params.section;const selected=typeof requested==='string'?cards.findIndex(card=>card.querySelector('h3')?.textContent===requested):requested;
    show(Number.isInteger(selected)&&selected>=0&&selected<cards.length?selected:Math.max(0,appearance));
    bindSettingInputs();
    applySubStyle($('#sub-preview'));
    $('#shuffle-pick').onclick = () => pickShuffleSource();
    window.native.get('localServer').then((v) => { if ($('#lan')) $('#lan').value = v || ''; });
    if ($('#lan-save')) $('#lan-save').onclick = async () => {
      const v = $('#lan').value.trim();
      await window.native.set('localServer', v || null);
      await Jellyfin.pickFastestServer();
      toast(!v ? 'Home address removed' : Jellyfin.usingLocal ? 'Saved — connected over your home network' : 'Saved — not reachable right now, using the internet address', Jellyfin.usingLocal || !v ? 'good' : '');
    };
    document.querySelectorAll('[data-libmode]').forEach((el) => {
      el.onchange = async () => {
        App.settings.libraryModes = { ...(App.settings.libraryModes || {}), [el.dataset.libmode]: el.value };
        await App.saveSettings();
        await App.refreshLibrary();
        toast('Saved', 'good');
      };
    });
    document.querySelectorAll('[data-accent]').forEach((b) => {
      b.onclick = async () => {
        App.settings.accent = b.dataset.accent; await App.saveSettings(); applyAppearance();
        document.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    document.querySelectorAll('[data-key]').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.keycap.listen').forEach((x) => { x.classList.remove('listen'); x.textContent = keyLabel(keyFor(x.dataset.key)); });
        b.classList.add('listen'); b.textContent = 'Press a key…';
        const onKey = async (e) => {
          e.preventDefault(); e.stopPropagation();
          document.removeEventListener('keydown', onKey, true);
          b.classList.remove('listen');
          if (e.key === 'Escape') { b.textContent = keyLabel(keyFor(b.dataset.key)); return; }
          const k = keyName(e), action = b.dataset.key;
          const keys = { ...(App.settings.keys || {}) };
          const clash = KEY_ACTIONS.find(([a]) => a !== action && keyFor(a) === k);
          if (clash) keys[clash[0]] = keyFor(action); // swap, so nothing is left without a key
          keys[action] = k;
          App.settings.keys = keys; await App.saveSettings();
          document.querySelectorAll('[data-key]').forEach((x) => { x.textContent = keyLabel(keyFor(x.dataset.key)); });
          toast(clash ? `Saved. Swapped with “${clash[1]}”` : 'Saved', 'good');
        };
        document.addEventListener('keydown', onKey, true);
      };
    });
    $('#keys-reset').onclick = async () => { App.settings.keys = {}; await App.saveSettings(); document.querySelectorAll('[data-key]').forEach((x) => { x.textContent = keyLabel(keyFor(x.dataset.key)); }); toast('Shortcuts reset', 'good'); };
    $('#wn-open').onclick = () => showWhatsNew();
    if($('#upd-check'))$('#upd-check').onclick=async()=>{
      const button=$('#upd-check'),status=$('#upd-status');button.disabled=true;status.textContent='Checking for updates…';
      try{const state=await window.native.checkUpdate();App.applyUpdate(state);if(state.state==='available'&&typeof ReleaseNotice!=='undefined')await ReleaseNotice.show(state,{force:true});}
      catch(error){if(status.isConnected)status.textContent='Update check failed: '+error.message;}
      finally{if(button.isConnected)button.disabled=false;}
    };
    if ($('#upd-release')) $('#upd-release').onclick = () => App.openRelease();
    const valid = (u) => !u || /^https:\/\/(canary\.|ptb\.)?(discord\.com|discordapp\.com)\/api\/webhooks\//.test(u);
    if ($('#hook-save')) $('#hook-save').onclick = async () => {
      const u = $('#hook').value.trim();
      if (!valid(u)) return toast('That doesn’t look like a Discord webhook URL', 'bad');
      await window.native.set('requestWebhook', u || null); toast('Saved', 'good');
    };
    if ($('#hook-test')) $('#hook-test').onclick = async () => {
      const u = $('#hook').value.trim() || (await window.native.config()).requestWebhook;
      if (!u || !valid(u)) return toast('Add a Discord webhook URL first', 'bad');
      try { await http(u, { method: 'POST', json: { username: 'AniDeck Requests', content: `✅ AniDeck requests are connected (test from ${Jellyfin.userName}).` } }); toast('Test sent — check Discord', 'good'); }
      catch (e) { toast(`Webhook failed: ${e.message}`, 'bad'); }
    };
  },
};

// Hide broken images (missing thumbnails) without inline handlers.
document.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

window.addEventListener('DOMContentLoaded', () => Promise.resolve().then(()=>App.boot()).catch(startupFailed));

// Dock: rises from the bottom edge; reveal on edge dwell or deliberate keyboard navigation; pointer input owns dismissal.
(() => {
  const ZONE=64,DWELL=140;
  let revealTimer=null,armed=true,keyboard=false;
  const bar=()=>document.querySelector('#shell .topbar');
  const cancel=()=>{clearTimeout(revealTimer);revealTimer=null;};
  const hide=()=>{cancel();const el=bar();if(!el)return;el.classList.remove('auto-reveal');if(el.contains(document.activeElement))document.activeElement.blur();for(const id of ['nav','tb-suggest','notif-panel']){const menu=document.getElementById(id);if(menu)menu.hidden=true;}document.getElementById('nav-current')?.setAttribute('aria-expanded','false');};
  const allowed=()=>{const shell=document.getElementById('shell'),player=document.getElementById('player'),modal=document.getElementById('modal');return shell&&!shell.hidden&&(!player||player.hidden)&&(!modal||modal.hidden)&&!document.getElementById('entry-pop');};
  const reveal=()=>{cancel();if(allowed())bar()?.classList.add('auto-reveal');};
  const near=event=>{const el=bar(),r=el?.getBoundingClientRect?.();const height=document.documentElement?.clientHeight||window.innerHeight;
    const bottom=height-event.clientY;return bottom>=0&&bottom<=ZONE&&(!r||(event.clientX>=r.left-16&&event.clientX<=r.right+16));};
  const move=event=>{if(event.pointerType==='touch')return;keyboard=false;const el=bar();if(!el)return;if(!allowed()){hide();return;}
    const inside=near(event)||el.contains(event.target);if(!inside){armed=true;hide();return;}
    if(!el.classList.contains('auto-reveal')&&armed&&!revealTimer)revealTimer=setTimeout(()=>{revealTimer=null;armed=false;reveal();},DWELL);
  };
  document.addEventListener('pointermove',move,{passive:true});
  document.addEventListener('pointerdown',event=>{keyboard=false;if(!near(event)&&!bar()?.contains(event.target))hide();},{passive:true});
  const leave=()=>{keyboard=false;armed=true;hide();};
  document.addEventListener('pointerleave',leave);
  document.addEventListener('pointerout',event=>{if(!event.relatedTarget)leave();});
  // Scrolling can move a hovered control without another pointermove.
  document.addEventListener('wheel',event=>{if(!bar()?.contains(event.target))leave();},{passive:true});
  document.addEventListener('focusin',event=>{if(keyboard&&bar()?.contains(event.target))reveal();});
  document.addEventListener('focusout',()=>queueMicrotask(()=>{if(keyboard&&!bar()?.contains(document.activeElement))hide();}));
  window.addEventListener('blur',leave);
  window.addEventListener('resize',leave);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
  document.addEventListener('keydown',event=>{if(event.key==='Tab'||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f')){keyboard=true;if(event.key!=='Tab')reveal();}if(event.key==='Escape')leave();},true);
})();
