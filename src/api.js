/* AniDeck - API layer: Jellyfin, Kitsu, AniSkip, requests.
   All JSON calls go through the main process (window.native.request). */
'use strict';
// Anime-only edition: hides regular movies/TV and everything Trakt. Flip to false to bring them back.
const ANIME_ONLY = true;
// Thin line icons used across the app.
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  send: '<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5 21 3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>',
  shuffle: '<path d="M16 3.5h4.5V8M3.5 20 20.5 3.5M20.5 16v4.5H16M14.5 14.5l6 6M3.5 4l5 5"/>',
  bell: '<path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sort: '<path d="M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12 3 3 5-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 10 7M15 5.5 14 7M3.5 13H7M17 13h3.5M4.5 18.5 7.5 17M19.5 18.5 16.5 17M4.5 8 7.5 9.5M19.5 8l-3 1.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  more: '<circle cx="12" cy="5.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18.5" r="1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chat: '<path d="M20.5 12a8 8 0 0 1-11.6 7.1L3.5 20.5l1.4-5.1A8 8 0 1 1 20.5 12z"/>',
  tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  video: '<rect x="3" y="5.5" width="13.5" height="13" rx="2.5"/><path d="m16.5 10.5 4.5-3v9l-4.5-3"/>',
  // Use icon(name, 'fill') for the solid ones (bookmark, play, caret)
  bookmark: '<path d="M6.5 4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16L12 16.5l-5.5 4z"/>',
  // AniDeck's deck mark: two stacked cards, the front one lightly filled (decks, pinned decks, "Add to Deck").
  deck: '<rect x="3.5" y="6" width="11" height="14.5" rx="2.6" transform="rotate(-9 9 13.25)"/><rect x="9" y="3.5" width="11.5" height="15" rx="2.6" fill="currentColor" fill-opacity=".2"/>',
  bookmarkCheck: '<path d="M13 3.5H7.5a1 1 0 0 0-1 1v16l5.5-4 5.5 4V11"/><path d="m14.5 6 2 2 3.5-4"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  play: '<path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7z"/>',
  caret: '<path d="M7 10h10l-5 5.5z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  minus: '<path d="M5.5 12h13"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  cast: '<path d="M3 8V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M3 12a7 7 0 0 1 7 7M3 15.5A3.5 3.5 0 0 1 6.5 19M3 19h.01"/>',
  searchX: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M9 9l4 4M13 9l-4 4"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  house: '<path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-4.5V15h-5v5.5H5a1 1 0 0 1-1-1z"/>',
  rewind: '<path d="M11 6.5 4 12l7 5.5zM20 6.5 13 12l7 5.5z"/>',
  forward: '<path d="m13 6.5 7 5.5-7 5.5zM4 6.5l7 5.5-7 5.5z"/>',
  skipPrev: '<path d="M6 5.5v13M18.5 6 9 12l9.5 6z"/>',
  skipNext: '<path d="M18 5.5v13M5.5 6 15 12l-9.5 6z"/>',
  playPause: '<path d="M4 5.5v13l8-6.5zM15 6v12M19.5 6v12"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.3 2.5 2.5 4.8-5"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-10.1A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.2c0 5.5-7.5 10.1-7.5 10.1z"/>',
  send: '<path d="M4.5 12 20 4.5l-4 15-4-6z"/><path d="m12 13.5 8-9"/>',
  eyeOff: '<path d="M3.5 3.5l17 17"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c5 0 8.5 4.8 9.3 6.1a.8.8 0 0 1 0 .8 15 15 0 0 1-2.6 3.2M6.6 6.6A15.7 15.7 0 0 0 2.7 11.6a.8.8 0 0 0 0 .8c.8 1.3 4.3 6.1 9.3 6.1a9.4 9.4 0 0 0 4.6-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  grip: '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>',
  signin: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H4"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
let APP_VERSION = '1.0.0'; // replaced with the real version at startup
let KITSU_BASE = 'https://kitsu.app/api'; // overridable via config.json "kitsuBase"
const TICKS = 10_000_000; // Jellyfin ticks per second
async function httpUncached(url, { method = 'GET', headers = {}, json, form, body, timeout } = {}) {
  const h = { ...headers };
  let payload = body;
  if (json !== undefined) { payload = JSON.stringify(json); h['Content-Type'] ??= 'application/json'; }
  if (form !== undefined) { payload = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
  const res = await window.native.request({ url, method, headers: h, body: payload, timeout });
  let data = null;
  if (res.text) { try { data = JSON.parse(res.text); } catch { data = res.text; } }
  if (!res.ok) {
    const err = new Error(res.error || `HTTP ${res.status}` + (typeof data === 'string' && data ? `: ${data.slice(0, 160)}` : ''));
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}
// Share concurrent reads; briefly reuse public catalog data. Never retain account data or writes.
const readRequests = new Map();
function clearReadRequests() { readRequests.clear(); }
async function http(url, options = {}) {
  const method=String(options.method||'GET').toUpperCase();
  const queryRead=method==='POST' && typeof options.json?.query==='string' && /^\s*(query\b|\{)/.test(options.json.query);
  if(method!=='GET'&&!queryRead){clearReadRequests();return httpUncached(url,options);}
  const headers=Object.entries(options.headers||{}).sort(([a],[b])=>a.localeCompare(b));
  const key=JSON.stringify([url,method,headers,options.json,options.body,options.timeout]);
  const cached=readRequests.get(key);
  if(cached&&(cached.pending||cached.expires>Date.now()))return JSON.parse(JSON.stringify(await cached.promise));
  if(cached)readRequests.delete(key);
  const ttl=method==='GET'&&/\/edge\/(?:anime(?:[/?]|$)|trending\/anime)/.test(String(url))?20000:0;
  const entry={pending:true,expires:0};
  entry.promise=httpUncached(url,options).then(value=>{
    entry.pending=false;entry.expires=Date.now()+ttl;
    if(!ttl&&readRequests.get(key)===entry)readRequests.delete(key);
    return value;
  },error=>{if(readRequests.get(key)===entry)readRequests.delete(key);throw error;});
  if(readRequests.size>=128)readRequests.delete(readRequests.keys().next().value);
  readRequests.set(key,entry);
  return JSON.parse(JSON.stringify(await entry.promise));
}
function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else p.append(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
/* ============================== JELLYFIN ============================== */
const Jellyfin = {
  server: '', token: '', userId: '', userName: '', deviceId: '',
  connected() { return !!(this.server && this.token && this.userId); },
  async init() {
    this.deviceId = await window.native.get('deviceId');
    if (!this.deviceId) {
      this.deviceId = 'anishelf-' + crypto.randomUUID();
      await window.native.set('deviceId', this.deviceId);
    }
    const saved = await window.native.get('jellyfin');
    if (saved) Object.assign(this, { server: saved.server, userId: saved.userId, userName: saved.userName });
    this.token = (await window.native.getSecret('jellyfinToken')) || '';
    this.remoteServer = this.server;
    await this.pickFastestServer();
    return !!(this.server && this.token && this.userId);
  },
  // If a home network address is set and answers quickly, use it instead of the
  // internet address (much faster and full quality when you're at home).
  async pickFastestServer() {
    const local = this.normalizeServer((await window.native.get('localServer')) || '');
    this.usingLocal = false;
    if (!local || !this.remoteServer) return;
    try {
      const info = await http(local + '/System/Info/Public', { timeout: 1500 });
      if (info?.Id) { this.server = local; this.usingLocal = true; return; }
    } catch { /* not at home */ }
    this.server = this.remoteServer;
  },
  authHeader() {
    let h = `MediaBrowser Client="AniDeck", Device="${navigator.platform.includes('Win') ? 'Windows' : 'Desktop'}", DeviceId="${this.deviceId}", Version="${APP_VERSION}"`;
    if (this.token) h += `, Token="${this.token}"`;
    return h;
  },
  normalizeServer(url) {
    let u = String(url || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/+$/, '').replace(/\/web(\/.*)?$/i, '');
  },
  // Reads (GET) are shared for 30 seconds, so opening a page you just hovered or visited is instant. Anything that
  // changes data on the server (marking watched, playback reports, sign-in…) clears them, so nothing goes stale.
  getCache: new Map(),
  async call(path, opts = {}) {
    if (!this.connected() && path !== '/Users/AuthenticateByName') throw new Error('Connect a Jellyfin library to use this feature.');
    const method = (opts.method || 'GET').toUpperCase();
    const run = () => http(this.server + path, { ...opts, headers: { Authorization: this.authHeader(), ...(opts.headers || {}) } });
    if (method !== 'GET' || opts.json || opts.body) { this.getCache.clear(); return run(); }
    const key = this.server + path, hit = this.getCache.get(key);
    if (hit && Date.now() - hit.at < 30000) return hit.p;
    const p = run().catch((e) => { this.getCache.delete(key); throw e; });
    this.getCache.set(key, { at: Date.now(), p });
    if (this.getCache.size > 300) this.getCache.delete(this.getCache.keys().next().value);
    return p;
  },
  clearCache() { this.getCache.clear(); },
  // Newer Jellyfin moved some routes; try the new one first, then the old one.
  async callEither(newPath, oldPath, opts) {
    try { return await this.call(newPath, opts); }
    catch (e) { if (e.status === 404 || e.status === 405) return this.call(oldPath, opts); throw e; }
  },
  async login(server, username, password) {
    this.server = this.normalizeServer(server);
    this.token = '';
    const info = await http(this.server + '/System/Info/Public').catch(() => null);
    if (!info || !info.Id) throw new Error('Could not reach a Jellyfin server at that address.');
    const res = await this.call('/Users/AuthenticateByName', { method: 'POST', json: { Username: username, Pw: password } });
    this.token = res.AccessToken;
    this.userId = res.User.Id;
    this.userName = res.User.Name;
    await window.native.setSecret('jellyfinToken', this.token);
    await window.native.set('jellyfin', { server: this.server, userId: this.userId, userName: this.userName });
    await window.native.set('jellyfinShared', null); // our own session now
    this.remoteServer = this.server;
    await this.pickFastestServer();
    return res.User;
  },
  async logout() {
    // A TV signed in from a paired computer borrows that computer's session; ending it would sign the computer out too.
    const shared = await window.native.get('jellyfinShared');
    if (!shared) { try { await this.call('/Sessions/Logout', { method: 'POST' }); } catch { /* ignore */ } }
    this.clearCache();
    this.token = ''; this.userId = ''; this.userName = ''; this.server = ''; this.remoteServer = ''; this.usingLocal = false;
    await window.native.setSecret('jellyfinToken', null);
    await window.native.set('jellyfin', null);
    await window.native.set('jellyfinShared', null);
  },
  img(id, type = 'Primary', size = {}) {
    if (!id) return '';
    // High-quality source pixels for high-DPI cards, without forcing a crop or upscaling the source.
    const bounds = { ...size };
    const scale = Math.max(2, Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
    if (bounds.fillWidth) { bounds.maxWidth = Math.min(3840, Math.ceil(bounds.fillWidth * scale)); delete bounds.fillWidth; }
    if (bounds.fillHeight) { bounds.maxHeight = Math.min(4096, Math.ceil(bounds.fillHeight * scale)); delete bounds.fillHeight; }
    return `${this.server}/Items/${id}/Images/${type}${qs({ format: 'Webp', ...bounds, quality: 95 })}`;
  },
  fields: 'Overview,PrimaryImageAspectRatio,ProductionYear,ProviderIds,ChildCount,RecursiveItemCount,Genres,Tags,OriginalTitle,DateCreated,ProductionLocations,PremiereDate',
  // The user's Jellyfin libraries that hold video (shows, movies, mixed).
  async libraries() {
    const r = await this.callEither(`/UserViews${qs({ userId: this.userId })}`, `/Users/${this.userId}/Views`);
    const videoTypes = ['tvshows', 'movies', 'mixed', 'homevideos', undefined, null, ''];
    return (r.Items || []).filter((v) => videoTypes.includes(v.CollectionType));
  },
  // Every show and movie in one library.
  async libraryItems(libraryId) {
    const q = { ParentId: libraryId, IncludeItemTypes: 'Series,Movie', Recursive: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: this.fields, EnableUserData: true };
    const r = await this.callEither(`/Items${qs({ userId: this.userId, ...q })}`, `/Users/${this.userId}/Items${qs(q)}`);
    return r.Items || [];
  },
  // Every season of every show in a library (the library lists each season as its own entry).
  async librarySeasons(libraryId) {
    const q = { ParentId: libraryId, IncludeItemTypes: 'Season', Recursive: true, Fields: 'ProductionYear,PremiereDate,DateCreated,ChildCount', EnableUserData: true };
    const r = await this.callEither(`/Items${qs({ userId: this.userId, ...q })}`, `/Users/${this.userId}/Items${qs(q)}`);
    return r.Items || [];
  },
  // Episodes and movies you've played, most recent first (for the schedule's "watched recently").
  async recentlyPlayed(limit = 150) {
    const q = { SortBy: 'DatePlayed', SortOrder: 'Descending', IncludeItemTypes: 'Episode,Movie', Recursive: true, Limit: limit, EnableUserData: true, EnableImages: false };
    const r = await this.callEither(`/Items${qs({ userId: this.userId, ...q })}`, `/Users/${this.userId}/Items${qs(q)}`);
    return (r.Items || []).filter((i) => i.UserData?.LastPlayedDate);
  },
  async resume() {
    const q = { Limit: 16, MediaTypes: 'Video', Fields: this.fields, EnableUserData: true };
    const r = await this.callEither(`/UserItems/Resume${qs({ userId: this.userId, ...q })}`, `/Users/${this.userId}/Items/Resume${qs(q)}`);
    return (r.Items || []).filter((i) => i.Type === 'Episode' || i.Type === 'Movie');
  },
  async nextUp() {
    const r = await this.call(`/Shows/NextUp${qs({ userId: this.userId, Limit: 24, Fields: this.fields, EnableUserData: true })}`);
    return r.Items || [];
  },
  // Episodes most recently added to the server (newest first).
  async recentEpisodes(limit = 80) {
    const q = { IncludeItemTypes: 'Episode', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: limit, Fields: 'DateCreated', EnableUserData: true };
    const r = await this.callEither(`/Items${qs({ userId: this.userId, ...q })}`, `/Users/${this.userId}/Items${qs(q)}`);
    return r.Items || [];
  },
  async latest(libraryId) {
    const q = { ParentId: libraryId, IncludeItemTypes: 'Series,Movie', Recursive: true, SortBy: 'DateLastContentAdded,DateCreated', SortOrder: 'Descending', Limit: 20, Fields: this.fields, EnableUserData: true };
    const r = await this.callEither(`/Items${qs({ userId: this.userId, ...q })}`, `/Users/${this.userId}/Items${qs(q)}`);
    return r.Items || [];
  },
  async item(id) {
    return this.callEither(`/Items/${id}${qs({ userId: this.userId })}`, `/Users/${this.userId}/Items/${id}`);
  },
  async seasons(seriesId) {
    const r = await this.call(`/Shows/${seriesId}/Seasons${qs({ userId: this.userId, Fields: 'ChildCount', EnableUserData: true })}`);
    return r.Items || [];
  },
  async episodes(seriesId, seasonId) {
    const r = await this.call(`/Shows/${seriesId}/Episodes${qs({ userId: this.userId, seasonId, Fields: 'Overview,PrimaryImageAspectRatio,PremiereDate', EnableUserData: true })}`);
    // Only episodes you can actually play: no "virtual" (announced, not on the server) or future ones.
    const now = Date.now();
    return (r.Items || []).filter((e) => e.LocationType !== 'Virtual' && !(Date.parse(e.PremiereDate || '') > now && e.LocationType !== 'FileSystem'));
  },
  async markPlayed(id, played = true) {
    const method = played ? 'POST' : 'DELETE';
    return this.callEither(`/UserPlayedItems/${id}${qs({ userId: this.userId })}`, `/Users/${this.userId}/PlayedItems/${id}`, { method });
  },
  async segments(id) {
    try {
      const r = await this.call(`/MediaSegments/${id}`);
      return (r.Items || []).map((s) => ({ type: String(s.Type).toLowerCase(), start: s.StartTicks / TICKS, end: s.EndTicks / TICKS }));
    } catch { return []; }
  },
  // Original file, played as-is (instant start, full quality).
  directUrl(item, source, playSessionId) {
    return `${this.server}/Videos/${item.Id}/stream` + qs({ static: true, MediaSourceId: source.Id, DeviceId: this.deviceId, PlaySessionId: playSessionId, ApiKey: this.token, api_key: this.token });
  },
  // Server-side conversion (only when the file can't play directly).
  streamUrl(item, source, { audioIndex, burnSubIndex, maxBitrate, playSessionId, copyVideo = true, hevc = false, av1 = false }) {
    return `${this.server}/Videos/${item.Id}/master.m3u8` + qs({
      MediaSourceId: source.Id,
      DeviceId: this.deviceId,
      ApiKey: this.token,   // Jellyfin 10.11+
      api_key: this.token,  // older Jellyfin
      PlaySessionId: playSessionId,
      VideoCodec: ['h264', hevc ? 'hevc' : '', av1 ? 'av1' : ''].filter(Boolean).join(','),
      AudioCodec: 'aac',
      AllowVideoStreamCopy: burnSubIndex == null && copyVideo,
      VideoBitrate: maxBitrate || 20_000_000,
      AudioBitrate: 256000,
      Profile: 'high',
      SegmentLength: 3,
      AllowAudioStreamCopy: true,
      AudioStreamIndex: audioIndex,
      SubtitleStreamIndex: burnSubIndex,
      SubtitleMethod: burnSubIndex != null ? 'Encode' : undefined,
      MaxStreamingBitrate: maxBitrate || 20_000_000,
      TranscodingMaxAudioChannels: 2,
      SegmentContainer: hevc || av1 ? 'mp4' : 'ts',
      MinSegments: 1,
      BreakOnNonKeyFrames: true,
    });
  },
  subtitleVttUrl(item, source, index) {
    return `${this.server}/Videos/${item.Id}/${source.Id}/Subtitles/${index}/0/Stream.vtt${qs({ ApiKey: this.token, api_key: this.token })}`;
  },
  report(kind, payload) {
    const path = kind === 'start' ? '/Sessions/Playing' : kind === 'progress' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Stopped';
    return this.call(path, { method: 'POST', json: payload }).catch(() => {});
  },
  stopEncoding(playSessionId) {
    return this.call(`/Videos/ActiveEncodings${qs({ DeviceId: this.deviceId, PlaySessionId: playSessionId })}`, { method: 'DELETE' }).catch(() => {});
  },
};
/* ================================ KITSU ================================ */
const Kitsu = {
  token: '', refresh: '', expiresAt: 0, userId: '', userName: '', avatar: '',
  async init() {
    const raw = await window.native.getSecret('kitsuAuth');
    if (raw) { try { Object.assign(this, JSON.parse(raw)); } catch { /* ignore */ } }
    return this.loggedIn();
  },
  loggedIn() { return !!(this.token && this.userId); },
  async save() {
    await window.native.setSecret('kitsuAuth', JSON.stringify({
      token: this.token, refresh: this.refresh, expiresAt: this.expiresAt, userId: this.userId, userName: this.userName, avatar: this.avatar || '',
    }));
  },
  async login(username, password) {
    const t = await http(`${KITSU_BASE}/oauth/token`, { method: 'POST', form: { grant_type: 'password', username, password } })
      .catch((e) => {
        if (e.status === 400 || e.status === 401) throw new Error('Wrong Kitsu email or password.');
        if (e.status === 403 || e.status === 503) throw new Error('Kitsu’s site blocked the sign-in (Cloudflare check). Wait a minute and try again.');
        throw new Error(`Kitsu login failed (HTTP ${e.status || 'no response'}).`);
      });
    this.token = t.access_token; this.refresh = t.refresh_token;
    this.expiresAt = Date.now() + (t.expires_in || 2592000) * 1000;
    const me = await this.call('/edge/users?filter[self]=true&fields[users]=name,avatar');
    this.userId = me.data?.[0]?.id; this.userName = me.data?.[0]?.attributes?.name || username;
    const av = me.data?.[0]?.attributes?.avatar; this.avatar = av?.large || av?.medium || av?.original || '';
    if (!this.userId) throw new Error('Signed in, but Kitsu did not return your account.');
    await this.save();
  },
  async logout() {
    Object.assign(this, { token: '', refresh: '', expiresAt: 0, userId: '', userName: '', avatar: '' });
    await window.native.setSecret('kitsuAuth', null);
  },
  async ensureFresh() {
    if (!this.token || !this.refresh || Date.now() < this.expiresAt - 86_400_000) return;
    try {
      const t = await http(`${KITSU_BASE}/oauth/token`, { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: this.refresh } });
      this.token = t.access_token; this.refresh = t.refresh_token || this.refresh;
      this.expiresAt = Date.now() + (t.expires_in || 2592000) * 1000;
      await this.save();
    } catch { /* keep the old token; it may still work */ }
  },
  async call(path, opts = {}) {
    await this.ensureFresh();
    const headers = { Accept: 'application/vnd.api+json', ...(opts.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (opts.json) headers['Content-Type'] = 'application/vnd.api+json';
    return http(KITSU_BASE + path, { ...opts, headers });
  },
  toAnime(d) {
    if (!d) return null;
    const a = d.attributes || {};
    return {
      id: d.id,
      slug: a.slug,
      title: (typeof App !== 'undefined' && App.settings?.titleLang === 'romaji')
        ? (a.titles?.en_jp || a.canonicalTitle || a.titles?.en || a.titles?.en_us)
        : (a.titles?.en || a.titles?.en_us || a.canonicalTitle || a.titles?.en_jp),
      canonical: a.canonicalTitle,
      titles: [a.canonicalTitle, a.titles?.en, a.titles?.en_us, a.titles?.en_jp, ...(a.abbreviatedTitles || [])].filter(Boolean),
      synopsis: a.synopsis || '',
      poster: a.posterImage?.original || a.posterImage?.large || a.posterImage?.medium || a.posterImage?.small || '',
      cover: a.coverImage?.original || a.coverImage?.large || '',
      coverHd: a.coverImage?.original || a.coverImage?.large || '',
      episodes: a.episodeCount || null,
      subtype: a.subtype || a.showType || '',
      status: a.status || '',
      year: a.startDate ? a.startDate.slice(0, 4) : '',
      rating: a.averageRating ? Math.round(parseFloat(a.averageRating)) : null,
      startDate: a.startDate || '', endDate: a.endDate || '', ageRating: a.ageRatingGuide || a.ageRating || '', episodeLength: a.episodeLength || null,
      nsfw: !!a.nsfw || a.ageRating === 'R18',
      url: `https://kitsu.app/anime/${a.slug || d.id}`,
    };
  },
  async search(text, limit = 20) {
    const r = await this.call(`/edge/anime${qs({ 'filter[text]': text, 'page[limit]': limit })}`);
    return (r.data || []).map((d) => this.toAnime(d));
  },
  // Search with genres attached (for the search page filters).
  async searchWithGenres(text, limit = 20) {
    const r = await this.call(`/edge/anime${qs({ 'filter[text]': text, 'page[limit]': limit, include: 'categories', 'fields[categories]': 'title' })}`);
    const cats = Object.fromEntries((r.included || []).filter((x) => x.type === 'categories').map((x) => [x.id, x.attributes?.title]));
    return (r.data || []).map((d) => ({ ...this.toAnime(d), genres: (d.relationships?.categories?.data || []).map((c) => cats[c.id]).filter(Boolean) }));
  },
  // Full details for a show page (adds genres).
  // Show details rarely change; remembered for 10 minutes so re-opening or refreshing a page doesn't wait on Kitsu.
  fullCache: new Map(),
  async animeFull(id) {
    const hit = this.fullCache.get(String(id));
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
    const r = await this.call(`/edge/anime/${id}${qs({ include: 'categories', 'fields[categories]': 'title' })}`);
    const cats = Object.fromEntries((r.included || []).filter((x) => x.type === 'categories').map((x) => [x.id, x.attributes?.title]));
    const value = { ...this.toAnime(r.data), genres: (r.data?.relationships?.categories?.data || []).map((c) => cats[c.id]).filter(Boolean) };
    this.fullCache.set(String(id), { at: Date.now(), value });
    return value;
  },
  async anime(id) {
    const r = await this.call(`/edge/anime/${id}`);
    return this.toAnime(r.data);
  },
  // Episode titles, thumbnails, synopses and air dates (for title pages of shows not in your library).
  // Cached for the session (also while in flight), so the page can start fetching before it's drawn.
  epCache: new Map(),
  episodes(id, count = 24, from = 0) {
    const key = `${id}:${from}:${count}`;
    if (!this.epCache.has(key)) this.epCache.set(key, this.fetchEpisodes(id, count, from).catch((e) => { this.epCache.delete(key); throw e; }));
    return this.epCache.get(key);
  },
  async fetchEpisodes(id, count, from) {
    const pages = Math.min(10, Math.ceil(Math.max(1, count) / 20));
    const all = await Promise.all(Array.from({ length: pages }, (_, p) => this.call(`/edge/anime/${id}/episodes${qs({
      sort: 'number', 'page[limit]': 20, 'page[offset]': from + p * 20,
      'fields[episodes]': 'number,canonicalTitle,titles,synopsis,description,airdate,length,thumbnail',
    })}`).then((r) => r.data || []).catch(() => [])));
    return all.flat().map((d) => {
      const a = d.attributes || {};
      return { number: a.number, title: a.titles?.en_us || a.titles?.en || a.canonicalTitle || '', synopsis: a.description || a.synopsis || '',
        airdate: a.airdate || '', length: a.length || null, thumb: a.thumbnail?.original || '' };
    }).filter((e) => e.number);
  },
  // Current anime season, e.g. { season: 'fall', year: 2026, label: 'Fall 2026' }
  currentSeason(d = new Date()) {
    const m = d.getMonth();
    const season = m < 3 ? 'winter' : m < 6 ? 'spring' : m < 9 ? 'summer' : 'fall';
    return { season, year: d.getFullYear(), label: `${season[0].toUpperCase()}${season.slice(1)} ${d.getFullYear()}` };
  },
  async seasonal(limit = 20) {
    const { season, year } = this.currentSeason();
    const r = await this.call(`/edge/anime${qs({ 'filter[season]': season, 'filter[seasonYear]': year, 'filter[subtype]': 'TV,ONA', sort: 'popularityRank', 'page[limit]': limit })}`);
    return (r.data || []).map((d) => this.toAnime(d));
  },
  async popularAiring(limit = 20) {
    const r = await this.call(`/edge/anime${qs({ 'filter[status]': 'current', sort: 'popularityRank', 'page[limit]': limit })}`);
    return (r.data || []).map((d) => this.toAnime(d));
  },
  // Browse the catalog with filters. Returns { items, total }.
  async browse({ genre, year, season, format, status, sort }, offset = 0, limit = 20) {
    const sortMap = { '': 'popularityRank', popular: 'popularityRank', rating: '-averageRating', new: '-startDate', old: 'startDate', az: 'slug' };
    const r = await this.call(`/edge/anime${qs({
      'filter[categories]': genre ? genreSlug(genre) : undefined,
      'filter[seasonYear]': year && /^\d{4}$/.test(year) ? year : undefined,
      'filter[year]': year && /^\d{4}s$/.test(year) ? `${year.slice(0, 4)}..${Number(year.slice(0, 4)) + 9}` : undefined,
      'filter[season]': season || undefined,
      'filter[subtype]': format || undefined,
      'filter[status]': status || undefined,
      'filter[ageRating]': 'G,PG,R',
      sort: sortMap[sort || ''] || 'popularityRank',
      'page[limit]': limit, 'page[offset]': offset,
      include: 'categories', 'fields[categories]': 'title', // genres, so "Hide NSFW shows" can drop ecchi
    })}`);
    const cats = Object.fromEntries((r.included || []).filter((x) => x.type === 'categories').map((x) => [x.id, x.attributes?.title]));
    return { items: (r.data || []).map((d) => ({ ...this.toAnime(d), genres: (d.relationships?.categories?.data || []).map((c) => cats[c.id]).filter(Boolean) })), total: r.meta?.count ?? null };
  },
  // A random anime from the most popular ~2000 (safe-for-work ratings only).
  async random() {
    for (let tries = 0; tries < 3; tries++) {
      const offset = Math.floor(Math.random() * 2000);
      const r = await this.call(`/edge/anime${qs({ sort: 'popularityRank', 'filter[subtype]': 'TV,movie,ONA,OVA', 'filter[ageRating]': 'G,PG,R', 'page[limit]': 1, 'page[offset]': offset })}`);
      const a = r.data?.[0] && this.toAnime(r.data[0]);
      if (a) return a;
    }
    return null;
  },
  async trending() {
    const r = await this.call('/edge/trending/anime?limit=20').catch(() => ({ data: [] }));
    return (r.data || []).map((d) => this.toAnime(d));
  },
  // Exact lookup from another database's id (e.g. myanimelist/anime 5114, anilist/anime 21, anidb 69).
  async byExternal(site, externalId) {
    try {
      const r = await this.call(`/edge/mappings${qs({ 'filter[externalSite]': site, 'filter[externalId]': externalId, include: 'item' })}`);
      // Kitsu sometimes ignores the filter and returns unrelated mappings (which pointed everything at
      // One Piece, Kitsu id 12). Only trust a mapping that really is this site + id.
      const map = (r.data || []).find((m) => m.attributes?.externalSite === site && String(m.attributes?.externalId) === String(externalId));
      if (!map) return null;
      const itemId = map.relationships?.item?.data?.id;
      const item = (r.included || []).find((x) => x.type === 'anime' && (!itemId || x.id === itemId));
      return item ? this.toAnime(item) : null;
    } catch { return null; }
  },
  // MyAnimeList and AniList ids for a Kitsu anime (cached).
  async externalIds(kitsuId) {
    const cache = (await window.native.get('kitsuExtIds')) || {};
    if (cache[kitsuId]) return cache[kitsuId];
    const r = await this.call(`/edge/anime/${kitsuId}/mappings`);
    const find = (site) => (r.data || []).find((x) => x.attributes?.externalSite === site)?.attributes?.externalId || null;
    const ids = { mal: find('myanimelist/anime'), anilist: find('anilist/anime') };
    cache[kitsuId] = ids; await window.native.set('kitsuExtIds', cache);
    return ids;
  },
  async malId(kitsuId) {
    const cache = (await window.native.get('malIds')) || {};
    if (cache[kitsuId] !== undefined) return cache[kitsuId];
    let mal = null;
    try {
      const r = await this.call(`/edge/anime/${kitsuId}/mappings`);
      const m = (r.data || []).find((x) => x.attributes?.externalSite === 'myanimelist/anime');
      mal = m ? m.attributes.externalId : null;
    } catch { return null; } // offline: don't remember a wrong answer
    cache[kitsuId] = mal; await window.native.set('malIds', cache);
    return mal;
  },
  async streamingLinks(kitsuId) {
    try {
      const r = await this.call(`/edge/anime/${kitsuId}/streaming-links?include=streamer`);
      const streamers = Object.fromEntries((r.included || []).filter((x) => x.type === 'streamers').map((x) => [x.id, x.attributes?.siteName]));
      return (r.data || []).map((l) => ({
        url: l.attributes?.url,
        site: streamers[l.relationships?.streamer?.data?.id] || hostName(l.attributes?.url),
        dubs: l.attributes?.dubs || [],
      })).filter((l) => /^https?:\/\//.test(l.url || ''));
    } catch { return []; }
  },
  async entry(animeId) {
    if (!this.loggedIn()) return null;
    const r = await this.call(`/edge/library-entries${qs({ 'filter[userId]': this.userId, 'filter[animeId]': animeId })}`);
    const d = r.data?.[0];
    return d ? { id: d.id, progress: d.attributes.progress || 0, status: d.attributes.status, reconsuming: !!d.attributes.reconsuming, rating: d.attributes.ratingTwenty ? d.attributes.ratingTwenty / 2 : null } : null;
  },
  // Saves status, progress and score together (score is 1-10, stored by Kitsu as 2-20).
  async saveEntry(animeId, { status, progress, reconsuming }) {
    if (!this.loggedIn()) throw new Error('Not signed in to Kitsu');
    const attributes = { status, progress: Math.max(0, Number(progress) || 0), reconsuming: !!reconsuming };
    const existing = await this.entry(animeId);
    if (existing) {
      await this.call(`/edge/library-entries/${existing.id}`, { method: 'PATCH', json: { data: { id: existing.id, type: 'libraryEntries', attributes } } });
      return;
    }
    await this.call('/edge/library-entries', { method: 'POST', json: { data: { type: 'libraryEntries', attributes, relationships: {
      user: { data: { type: 'users', id: this.userId } }, anime: { data: { type: 'anime', id: String(animeId) } } } } } });
  },
  async watching() {
    if (!this.loggedIn()) return [];
    const r = await this.call(`/edge/library-entries${qs({ 'filter[userId]': this.userId, 'filter[kind]': 'anime', 'filter[status]': 'current', include: 'anime', sort: '-progressedAt', 'page[limit]': 20 })}`);
    const anime = Object.fromEntries((r.included || []).filter((x) => x.type === 'anime').map((x) => [x.id, this.toAnime(x)]));
    return (r.data || []).map((e) => ({ progress: e.attributes.progress || 0, anime: anime[e.relationships?.anime?.data?.id] })).filter((e) => e.anime);
  },
  // One page of the user's Kitsu list. status: current|planned|completed|on_hold|dropped or '' for all.
  async list(status, offset = 0, limit = 40, sort = '-updatedAt') {
    if (!this.loggedIn()) return { entries: [], total: 0 };
    const r = await this.call(`/edge/library-entries${qs({
      'filter[userId]': this.userId, 'filter[kind]': 'anime', 'filter[status]': status || undefined,
      include: 'anime,anime.categories', 'fields[categories]': 'title', sort, 'page[limit]': limit, 'page[offset]': offset,
    })}`);
    const cats = Object.fromEntries((r.included || []).filter((x) => x.type === 'categories').map((x) => [x.id, x.attributes?.title]));
    const anime = Object.fromEntries((r.included || []).filter((x) => x.type === 'anime').map((x) => [x.id, { ...this.toAnime(x), genres: (x.relationships?.categories?.data || []).map((c) => cats[c.id]).filter(Boolean) }]));
    const entries = (r.data || []).map((e) => ({
      id: e.id, status: e.attributes.status, reconsuming: !!e.attributes.reconsuming, progress: e.attributes.progress || 0,
      rating: e.attributes.ratingTwenty ? e.attributes.ratingTwenty / 2 : null, updatedAt: e.attributes.updatedAt,
      anime: anime[e.relationships?.anime?.data?.id],
    })).filter((e) => e.anime);
    return { entries, total: r.meta?.count ?? entries.length, statusCounts: r.meta?.statusCounts || null };
  },
  // Profile numbers: avatar, time spent, episodes, and how many shows are in each list.
  async profileStats() {
    if (!this.loggedIn()) return null;
    const [u, counts] = await Promise.all([
      this.call(`/edge/users/${this.userId}${qs({ include: 'stats', 'fields[users]': 'name,avatar,coverImage' })}`).catch(() => null),
      this.call(`/edge/library-entries${qs({ 'filter[userId]': this.userId, 'filter[kind]': 'anime', 'page[limit]': 1 })}`).catch(() => null),
    ]);
    const a = u?.data?.attributes || {};
    const sc = counts?.meta?.statusCounts || {};
    const out = {
      name: a.name || this.userName,
      avatar: a.avatar?.large || a.avatar?.medium || a.avatar?.original || '',
      counts: { completed: sc.completed || 0, current: sc.current || 0, planned: sc.planned || 0, on_hold: sc.onHold ?? sc.on_hold ?? 0, dropped: sc.dropped || 0 },
      seconds: 0, episodes: 0,
    };
    const st = (u?.included || []).find((x) => x.type === 'stats' && x.attributes?.kind === 'anime-amount-consumed');
    const d = st?.attributes?.statsData || {};
    out.seconds = Number(d.time) || 0; out.episodes = Number(d.units) || 0;
    if (!out.seconds && !out.episodes) {
      // Kitsu hasn't built the stats yet: add it up from the list (episodes watched x episode length).
      for (let offset = 0; offset < 3000; offset += 500) {
        const r = await this.call(`/edge/library-entries${qs({ 'filter[userId]': this.userId, 'filter[kind]': 'anime', include: 'anime', 'fields[libraryEntries]': 'progress,reconsumeCount,anime', 'fields[anime]': 'episodeLength', 'page[limit]': 500, 'page[offset]': offset })}`).catch(() => null);
        if (!r?.data?.length) break;
        const len = Object.fromEntries((r.included || []).map((x) => [x.id, Number(x.attributes?.episodeLength) || 24]));
        for (const e of r.data) {
          const eps = (e.attributes.progress || 0) * (1 + (e.attributes.reconsumeCount || 0));
          out.episodes += eps; out.seconds += eps * (len[e.relationships?.anime?.data?.id] || 24) * 60;
        }
        if (r.data.length < 500) break;
      }
    }
    // Activity for the last 20 weeks: one point per episode-progress event.
    out.activity = {};
    try {
      const since = Date.now() - 141 * 86400000;
      for (let page = 0; page < 15; page++) {
        const r = await this.call(`/edge/library-events${qs({ 'filter[userId]': this.userId, 'filter[kind]': 'progressed', sort: '-createdAt', 'page[limit]': 20, 'page[offset]': page * 20 })}`);
        const rows = r?.data || [];
        let old = false;
        for (const e of rows) {
          const t = Date.parse(e.attributes?.createdAt || '');
          if (!t || t < since) { old = true; break; }
          const k = new Date(t).toISOString().slice(0, 10);
          out.activity[k] = (out.activity[k] || 0) + 1;
        }
        if (old || rows.length < 20) break;
      }
    } catch { /* activity is optional */ }
    if (out.avatar && out.avatar !== this.avatar) { this.avatar = out.avatar; this.save(); }
    return out;
  },
  // Adds a show to the list or changes its status (Watching, Planning, ...). 'remove' deletes it.
  async setStatus(animeId, status) {
    if (!this.loggedIn()) throw new Error('Not signed in to Kitsu');
    const existing = await this.entry(animeId);
    if (status === 'remove') {
      if (existing) await this.call(`/edge/library-entries/${existing.id}`, { method: 'DELETE' });
      return null;
    }
    if (existing) {
      await this.call(`/edge/library-entries/${existing.id}`, { method: 'PATCH', json: { data: { id: existing.id, type: 'libraryEntries', attributes: { status } } } });
      return { ...existing, status };
    }
    const r = await this.call('/edge/library-entries', {
      method: 'POST',
      json: { data: { type: 'libraryEntries', attributes: { status, progress: 0 }, relationships: {
        user: { data: { type: 'users', id: this.userId } },
        anime: { data: { type: 'anime', id: String(animeId) } },
      } } },
    });
    return { id: r.data?.id, status, progress: 0 };
  },
  // Sets progress, never moving it backwards. Returns the resulting entry.
  async setProgress(animeId, episode, totalEpisodes) {
    if (!this.loggedIn()) throw new Error('Not signed in to Kitsu');
    const status = totalEpisodes && episode >= totalEpisodes ? 'completed' : 'current';
    const existing = await this.entry(animeId);
    if (existing) {
      if (existing.progress >= episode && existing.status !== 'planned') return { ...existing, unchanged: true };
      await this.call(`/edge/library-entries/${existing.id}`, {
        method: 'PATCH',
        json: { data: { id: existing.id, type: 'libraryEntries', attributes: { progress: Math.max(episode, existing.progress), status } } },
      });
      return { id: existing.id, progress: Math.max(episode, existing.progress), status };
    }
    const r = await this.call('/edge/library-entries', {
      method: 'POST',
      json: { data: { type: 'libraryEntries', attributes: { progress: episode, status }, relationships: {
        user: { data: { type: 'users', id: this.userId } },
        anime: { data: { type: 'anime', id: String(animeId) } },
      } } },
    });
    return { id: r.data?.id, progress: episode, status };
  },
};
/* ================================ TRAKT ================================ */
// Tracks regular movies and TV shows. Sign-in uses a short code you enter on trakt.tv.
let TRAKT_BASE = 'https://api.trakt.tv'; // overridable via config.json "traktBase" (testing)
const TRAKT_CLIENT_ID = 'Hb5dIk0uFEbZetEDgesxNkW2hCiEFM7XjFO3Kx4lXWs';
const TRAKT_REDIRECT = 'https://github.com/Machoist/anishelf';
/* ---------------------------- AniList (tracking) ---------------------------- */
// Optional alternative to Kitsu for your list. Only one tracker is signed in at a time.
// The catalog (search, browse, home rows, matching) still comes from Kitsu; list actions are translated
// to AniList ids (via MyAnimeList ids). Entries that come from AniList use ids like "al:21".
const ANILIST_CLIENT_ID = '54547'; // public id of AniDeck's AniList API client (implicit sign-in, no secret); config.json "anilistClientId" overrides it
let ANILIST_API = 'https://graphql.anilist.co';
const AL_STATUS = { current: 'CURRENT', planned: 'PLANNING', completed: 'COMPLETED', on_hold: 'PAUSED', dropped: 'DROPPED' };
const AL_BACK = { CURRENT: 'current', REPEATING: 'current', PLANNING: 'planned', COMPLETED: 'completed', PAUSED: 'on_hold', DROPPED: 'dropped' };
const AL_FORMAT = { TV: 'TV', TV_SHORT: 'TV', MOVIE: 'movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'special', MUSIC: 'music' };
const AniList = {
  token: '', userId: 0, userName: '', avatar: '', clientId: '', idCache: null, coll: null, collAt: 0,
  async init() {
    const cfg = await window.native.config();
    this.clientId = cfg.anilistClientId || ANILIST_CLIENT_ID;
    if (cfg.anilistApi) ANILIST_API = cfg.anilistApi;
    const raw = await window.native.getSecret('anilistAuth');
    if (raw) { try { Object.assign(this, JSON.parse(raw)); } catch { /* ignore */ } }
    return this.loggedIn();
  },
  available() { return !!this.clientId; },
  loggedIn() { return !!(this.token && this.userId); },
  async save() { await window.native.setSecret('anilistAuth', JSON.stringify({ token: this.token, userId: this.userId, userName: this.userName, avatar: this.avatar })); },
  async logout() { Object.assign(this, { token: '', userId: 0, userName: '', avatar: '', coll: null }); await window.native.setSecret('anilistAuth', null); },
  async gql(query, variables = {}, auth = true) {
    const headers = { Accept: 'application/json' };
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    let r;
    try { r = await http(ANILIST_API, { method: 'POST', headers, json: { query, variables }, timeout: 15000 }); }
    catch (e) {
      if (e.status === 401 || e.data?.errors?.some?.((x) => x.status === 401)) { await this.logout(); throw new Error('AniList sign-in expired. Please sign in again.'); }
      throw new Error(e.data?.errors?.[0]?.message || e.message);
    }
    if (r?.errors?.length) throw new Error(r.errors[0].message);
    return r.data;
  },
  // Opens AniList's sign-in page in a small window and picks the token up from the redirect.
  async login() {
    if (!this.clientId) throw new Error('AniList sign-in isn’t set up in this build yet.');
    const redirect = 'https://anilist.co/api/v2/oauth/pin';
    const url = await window.native.oauth({ url: `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(this.clientId)}&response_type=token`, redirectPrefix: redirect });
    if (!url) throw new Error('Sign-in was closed.');
    const token = new URLSearchParams(url.split('#')[1] || '').get('access_token');
    if (!token) throw new Error('AniList didn’t return a sign-in token.');
    this.token = token;
    const d = await this.gql('query{ Viewer{ id name avatar{ large } } }');
    this.userId = d.Viewer.id; this.userName = d.Viewer.name; this.avatar = d.Viewer.avatar?.large || '';
    await this.save();
  },
  // Title-page metadata from AniList (works signed out): its banner and cover art usually beat library art,
  // and it has the next airing episode. Kitsu id or "al:123" in. Cached for 30 minutes.
  detailsCache: {},
  async details(id) {
    const hit = this.detailsCache[id];
    if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
    const mediaId = await this.mediaId(id);
    const d = await this.gql(`query($id:Int){ Media(id:$id){ id title{ romaji english } bannerImage coverImage{ extraLarge large color }
      genres averageScore status season seasonYear episodes duration format studios(isMain:true){ nodes{ name } } nextAiringEpisode{ episode airingAt }
      streamingEpisodes{ title thumbnail } } }`, { id: mediaId }, false);
    const m = d?.Media;
    if (!m) return null;
    const t = m.title || {};
    const value = {
      id: m.id,
      title: (typeof App !== 'undefined' && App.settings?.titleLang === 'romaji') ? (t.romaji || t.english) : (t.english || t.romaji),
      banner: m.bannerImage || '', cover: m.coverImage?.extraLarge || m.coverImage?.large || '', color: m.coverImage?.color || '',
      genres: m.genres || [], score: m.averageScore || null, status: (m.status || '').toLowerCase().replace(/_/g, ' '),
      season: m.season && m.seasonYear ? `${m.season[0]}${m.season.slice(1).toLowerCase()} ${m.seasonYear}` : '', year: m.seasonYear ? String(m.seasonYear) : '',
      episodes: m.episodes || null, duration: m.duration || null, format: AL_FORMAT[m.format] || m.format || '',
      studios: (m.studios?.nodes || []).map((x) => x.name),
      next: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt * 1000 } : null,
      // Official streaming episodes ("Episode 3 - Title", with a still), when AniList lists them: number -> { title, thumb }
      streams: Object.fromEntries((m.streamingEpisodes || []).map((e) => {
        const x = String(e.title || '').match(/episode\s*(\d+)\s*[-–:]?\s*(.*)$/i);
        return x ? [Number(x[1]), { title: x[2].trim(), thumb: e.thumbnail || '' }] : null;
      }).filter(Boolean)),
    };
    this.detailsCache[id] = { at: Date.now(), value };
    return value;
  },
  // Kitsu anime id (or "al:123") -> AniList media id.
  async mediaId(id) {
    if (String(id).startsWith('al:')) return Number(String(id).slice(3));
    this.idCache ||= (await window.native.get('anilistIds')) || {};
    if (this.idCache[id]) return this.idCache[id];
    let al = null;
    const ext = await Kitsu.externalIds(id);
    if (ext.anilist) al = Number(ext.anilist);
    else if (ext.mal) { const d = await this.gql('query($m:Int){ Media(idMal:$m, type:ANIME){ id } }', { m: Number(ext.mal) }, false).catch(() => null); al = d?.Media?.id || null; }
    if (!al) throw new Error('Couldn’t find this show on AniList.');
    this.idCache[id] = al; window.native.set('anilistIds', this.idCache);
    return al;
  },
  toAnime(m) {
    const t = m.title || {};
    return {
      id: `al:${m.id}`, malId: m.idMal || null, title: (typeof App !== 'undefined' && App.settings?.titleLang === 'romaji') ? (t.romaji || t.english) : (t.english || t.userPreferred || t.romaji), canonical: t.romaji,
      titles: [t.romaji, t.english, t.userPreferred, t.native, ...(m.synonyms || [])].filter(Boolean),
      poster: m.coverImage?.extraLarge || m.coverImage?.large || '', episodes: m.episodes || null,
      year: m.seasonYear ? String(m.seasonYear) : '',
      subtype: AL_FORMAT[m.format] || m.format || '', rating: m.averageScore || null, genres: m.genres || [], url: m.siteUrl, status: (m.status || '').toLowerCase(),
    };
  },
  fromEntry(e) {
    return { id: e.id, status: AL_BACK[e.status] || 'current', reconsuming: e.status === 'REPEATING', progress: e.progress || 0, rating: e.score || null, updatedAt: e.updatedAt ? new Date(e.updatedAt * 1000).toISOString() : '' };
  },
  async entry(id) {
    if (!this.loggedIn()) return null;
    const mediaId = await this.mediaId(id);
    if (this.coll && Date.now() - this.collAt < 30000) { // the whole list was just fetched: read it from there
      const hit = this.coll.find((e) => String(e.anime?.id) === `al:${mediaId}`);
      if (hit) return { id: hit.id, status: hit.status, reconsuming: hit.reconsuming, progress: hit.progress, rating: hit.rating, updatedAt: hit.updatedAt };
    }
    const d = await this.gql('query($id:Int){ Media(id:$id){ id mediaListEntry{ id status progress score(format:POINT_10) repeat updatedAt } } }', { id: mediaId });
    const e = d?.Media?.mediaListEntry;
    return e ? this.fromEntry(e) : null;
  },
  async write(id, vars) {
    const mediaId = await this.mediaId(id);
    const d = await this.gql('mutation($mediaId:Int,$status:MediaListStatus,$progress:Int){ SaveMediaListEntry(mediaId:$mediaId, status:$status, progress:$progress){ id status progress score(format:POINT_10) repeat updatedAt } }', { mediaId, ...vars });
    this.coll = null;
    return this.fromEntry(d.SaveMediaListEntry);
  },
  async saveEntry(id, { status, progress, reconsuming }) {
    if (!this.loggedIn()) throw new Error('Not signed in to AniList');
    return this.write(id, { status: reconsuming ? 'REPEATING' : AL_STATUS[status] || 'CURRENT', progress: Math.max(0, Number(progress) || 0) });
  },
  async setStatus(id, status) {
    if (!this.loggedIn()) throw new Error('Not signed in to AniList');
    if (status === 'remove') {
      const e = await this.entry(id);
      if (e) await this.gql('mutation($id:Int){ DeleteMediaListEntry(id:$id){ deleted } }', { id: e.id });
      this.coll = null;
      return null;
    }
    return this.write(id, { status: AL_STATUS[status] || 'CURRENT' });
  },
  async setProgress(id, episode, totalEpisodes) {
    if (!this.loggedIn()) throw new Error('Not signed in to AniList');
    const status = totalEpisodes && episode >= totalEpisodes ? 'COMPLETED' : 'CURRENT';
    const e = await this.entry(id);
    if (e && e.progress >= episode && e.status !== 'planned') return { ...e, unchanged: true };
    return this.write(id, { progress: Math.max(episode, e?.progress || 0), status: e?.reconsuming && status === 'CURRENT' ? 'REPEATING' : status });
  },
  // Whole list, kept for 30 seconds so tabs and scrolling don't re-download it.
  async collection() {
    if (this.coll && Date.now() - this.collAt < 30000) return this.coll;
    const d = await this.gql(`query($u:Int){ MediaListCollection(userId:$u, type:ANIME){ lists{ entries{ id status progress score(format:POINT_10) repeat updatedAt
      media{ id idMal title{ romaji english native userPreferred } synonyms coverImage{ large extraLarge } episodes format seasonYear averageScore genres status siteUrl } } } } }`, { u: this.userId });
    const seen = new Set();
    this.coll = (d?.MediaListCollection?.lists || []).flatMap((l) => l.entries || []).filter((e) => !seen.has(e.id) && seen.add(e.id))
      .map((e) => ({ ...this.fromEntry(e), anime: this.toAnime(e.media) }));
    this.collAt = Date.now();
    return this.coll;
  },
  async watching() {
    if (!this.loggedIn()) return [];
    return (await this.collection()).filter((e) => e.status === 'current').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 20);
  },
  async list(status, offset = 0, limit = 40, sort = '-updatedAt') {
    if (!this.loggedIn()) return { entries: [], total: 0 };
    const all = await this.collection();
    const c = { current: 0, planned: 0, completed: 0, onHold: 0, dropped: 0 };
    for (const e of all) c[e.status === 'on_hold' ? 'onHold' : e.status]++;
    let list = status ? all.filter((e) => e.status === status) : [...all];
    const by = {
      '-updatedAt': (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
      'anime.titles.canonical': (a, b) => String(a.anime.canonical || a.anime.title).localeCompare(String(b.anime.canonical || b.anime.title)),
      '-progress': (a, b) => b.progress - a.progress,
      '-ratingTwenty': (a, b) => (b.rating || 0) - (a.rating || 0),
      '-anime.averageRating': (a, b) => (b.anime.rating || 0) - (a.anime.rating || 0),
    }[sort];
    if (by) list.sort(by);
    return { entries: list.slice(offset, offset + limit), total: list.length, statusCounts: c };
  },
  async profileStats() {
    if (!this.loggedIn()) return null;
    const d = await this.gql('query($u:Int){ User(id:$u){ name avatar{ large } stats{ activityHistory{ date amount } } statistics{ anime{ count episodesWatched minutesWatched statuses{ status count } } } } }', { u: this.userId });
    const activity = {};
    for (const h of d?.User?.stats?.activityHistory || []) { const k = new Date(h.date * 1000).toISOString().slice(0, 10); activity[k] = (activity[k] || 0) + (h.amount || 1); }
    const u = d?.User || {}, a = u.statistics?.anime || {};
    const st = Object.fromEntries((a.statuses || []).map((x) => [x.status, x.count]));
    return {
      name: u.name || this.userName, avatar: u.avatar?.large || this.avatar,
      counts: { completed: st.COMPLETED || 0, current: (st.CURRENT || 0) + (st.REPEATING || 0), planned: st.PLANNING || 0, on_hold: st.PAUSED || 0, dropped: st.DROPPED || 0 },
      seconds: (a.minutesWatched || 0) * 60, episodes: a.episodesWatched || 0, activity,
    };
  },
  // "al:123" -> Kitsu anime id, so AniList list entries can open the normal show page.
  // Prequels, sequels, spin-offs… of a show (public data, no sign-in needed).
  async relations(mediaId) {
    const d = await this.gql(`query($id:Int){ Media(id:$id){ relations{ edges{ relationType(version:2) node{ id idMal type format status seasonYear episodes
      title{ romaji english native userPreferred } synonyms coverImage{ extraLarge large } siteUrl averageScore genres } } } } }`, { id: mediaId }, false);
    return (d?.Media?.relations?.edges || []).filter((e) => e.node?.type === 'ANIME').map((e) => ({ relation: e.relationType, anime: this.toAnime(e.node) }));
  },
  // Forum threads attached to a show, newest first. `search` narrows it down (e.g. "Episode 5").
  async threads(mediaId, search, perPage = 25) {
    const d = await this.gql('query($id:Int,$s:String,$n:Int){ Page(perPage:$n){ threads(mediaCategoryId:$id, search:$s, sort:ID_DESC){ id title replyCount viewCount createdAt repliedAt siteUrl } } }', { id: mediaId, s: search || undefined, n: perPage }, false);
    return d?.Page?.threads || [];
  },
  // One discussion thread and its comments (25 per page; replies come nested in childComments).
  async thread(id) {
    const d = await this.gql('query($id:Int){ Thread(id:$id){ id title siteUrl replyCount } }', { id: Number(id) });
    return d?.Thread || null;
  },
  async threadComments(threadId, page = 1) {
    const d = await this.gql(`query($id:Int,$p:Int){ Page(page:$p, perPage:25){ pageInfo{ hasNextPage }
      threadComments(threadId:$id){ id comment likeCount isLiked createdAt user{ name avatar{ medium } } childComments } } }`, { id: Number(threadId), p: page });
    return { comments: d?.Page?.threadComments || [], more: !!d?.Page?.pageInfo?.hasNextPage };
  },
  async likeComment(id) {
    const d = await this.gql('mutation($id:Int){ ToggleLikeV2(id:$id, type:THREAD_COMMENT){ ... on ThreadComment { id likeCount isLiked } } }', { id: Number(id) });
    return d?.ToggleLikeV2 || null;
  },
  async postComment(threadId, comment, parentId) {
    const d = await this.gql('mutation($t:Int,$p:Int,$c:String){ SaveThreadComment(threadId:$t, parentCommentId:$p, comment:$c){ id comment likeCount isLiked createdAt user{ name avatar{ medium } } } }',
      { t: Number(threadId), p: parentId ? Number(parentId) : undefined, c: comment });
    return d?.SaveThreadComment || null;
  },
  // People you follow on AniList who have this show on their list.
  async friends(mediaId) {
    if (!this.loggedIn()) return [];
    const d = await this.gql('query($id:Int){ Page(perPage:50){ mediaList(mediaId:$id, isFollowing:true, sort:UPDATED_TIME_DESC){ status progress updatedAt score(format:POINT_10) user{ name avatar{ medium } siteUrl } } } }', { id: mediaId });
    return (d?.Page?.mediaList || []).map((e) => ({ ...e, status: AL_BACK[e.status] || 'current', rewatching: e.status === 'REPEATING' }));
  },
  async kitsuIdFor(alId, malId) {
    const cache = (await window.native.get('alToKitsu')) || {};
    if (cache[alId]) return cache[alId];
    let hit = await Kitsu.byExternal('anilist/anime', String(alId));
    if (!hit && malId) hit = await Kitsu.byExternal('myanimelist/anime', String(malId));
    if (!hit) return null;
    cache[alId] = hit.id; window.native.set('alToKitsu', cache);
    return hit.id;
  },
};
// What airs this week (today through the next 6 days), from AniList's public schedule.
const Schedule = {
  cache: null, day: '', at: 0,
  async week() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const day = start.toDateString();
    if (this.cache && this.day === day && Date.now() - this.at < 30 * 60_000) return this.cache;
    const a = Math.floor(start / 1000), b = a + 7 * 86400;
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const d = await AniList.gql(`query($a:Int,$b:Int,$p:Int){ Page(page:$p, perPage:50){ pageInfo{ hasNextPage } airingSchedules(airingAt_greater:$a, airingAt_lesser:$b, sort:TIME){ airingAt episode
        media{ id idMal isAdult format episodes seasonYear title{ romaji english native userPreferred } synonyms coverImage{ extraLarge large } siteUrl averageScore genres status } } } }`, { a: a - 1, b, p: page }, false);
      out.push(...(d?.Page?.airingSchedules || []));
      if (!d?.Page?.pageInfo?.hasNextPage) break;
    }
    this.cache = out.filter((x) => x.media && !x.media.isAdult).map((x) => ({ at: x.airingAt * 1000, episode: x.episode, anime: AniList.toAnime(x.media) }));
    this.day = day; this.at = Date.now();
    return this.cache;
  },
  // Episodes that aired in the past 7 days (home: "New episodes this week"), newest first.
  recentCache: null, recentAt: 0,
  async recent() {
    if (this.recentCache && Date.now() - this.recentAt < 30 * 60_000) return this.recentCache;
    const b = Math.floor(Date.now() / 1000), a = b - 7 * 86400;
    const out = [];
    for (let page = 1; page <= 6; page++) {
      const d = await AniList.gql(`query($a:Int,$b:Int,$p:Int){ Page(page:$p, perPage:50){ pageInfo{ hasNextPage } airingSchedules(airingAt_greater:$a, airingAt_lesser:$b, sort:TIME_DESC){ airingAt episode
        media{ id idMal isAdult format episodes seasonYear title{ romaji english native userPreferred } synonyms coverImage{ extraLarge large } siteUrl averageScore genres status } } } }`, { a, b, p: page }, false);
      out.push(...(d?.Page?.airingSchedules || []));
      if (!d?.Page?.pageInfo?.hasNextPage) break;
    }
    this.recentCache = out.filter((x) => x.media && !x.media.isAdult).map((x) => ({ at: x.airingAt * 1000, episode: x.episode, anime: AniList.toAnime(x.media) }));
    this.recentAt = Date.now();
    return this.recentCache;
  },
};
/* ================================ ANI.ZIP ================================ */
// Free per-show metadata keyed by AniList id (what AniView uses): each episode's title, summary, still (TheTVDB
// screencap), air date and runtime, plus TheTVDB fanart / banner / logo. Kept for 6 hours.
const AniZip = {
  cache: new Map(),
  get(alId) {
    if (!alId) return Promise.resolve(null);
    const hit = this.cache.get(String(alId));
    if (hit && Date.now() - hit.at < 6 * 3600000) return hit.p;
    const p = http(`https://api.ani.zip/mappings${qs({ anilist_id: alId })}`, { timeout: 8000 }).then((j) => {
      const img = (type) => (j?.images || []).find((i) => i.coverType === type)?.url || '';
      const episodes = {};
      for (const [k, e] of Object.entries(j?.episodes || {})) {
        const n = Number(k);
        if (!n || !e) continue; // specials are keyed "S1", "S2"…
        episodes[n] = { title: e.title?.en || e.title?.['x-jat'] || '', overview: e.overview || e.summary || '', image: e.image || '', airDate: e.airDate || '', runtime: e.runtime || e.length || null };
      }
      return { episodes, fanart: img('Fanart'), banner: img('Banner'), logo: img('Clearlogo'), poster: img('Poster'),
        tmdb: j?.mappings?.themoviedb_id || null, kitsu: j?.mappings?.kitsu_id || null, type: j?.mappings?.type || '' };
    }).catch(() => { this.cache.delete(String(alId)); return null; });
    this.cache.set(String(alId), { at: Date.now(), p });
    return p;
  },
};
// The list tracker in use. Kitsu and AniList can both stay signed in; settings.activeTracker picks which one
// your list, progress and status buttons go to (Settings → Account → Switch). Falls back to whichever is signed in.
const Tracker = {
  get svc() {
    const pick = typeof App !== 'undefined' ? App.settings?.activeTracker : null;
    if (pick === 'kitsu' && Kitsu.loggedIn()) return Kitsu;
    if (pick === 'anilist' && AniList.loggedIn()) return AniList;
    return AniList.loggedIn() ? AniList : Kitsu;
  },
  get name() { return this.svc === AniList ? 'AniList' : 'Kitsu'; },
  get userName() { return this.svc.userName; },
  get avatar() { return this.svc.avatar || ''; },
  loggedIn() { return Kitsu.loggedIn() || AniList.loggedIn(); },
  logout() { return this.svc.logout(); },
  entry(id) { return this.svc.entry(id); },
  setStatus(id, s) { return this.svc.setStatus(id, s); },
  setProgress(id, ep, total) { return this.svc.setProgress(id, ep, total); },
  saveEntry(id, v) { return this.svc.saveEntry(id, v); },
  watching() { return this.svc.watching(); },
  list(...a) { return this.svc.list(...a); },
  profileStats() { return this.svc.profileStats(); },
};
const Trakt = {
  token: '', refresh: '', expiresAt: 0, userName: '', secret: '',
  async init() {
    const cfg = await window.native.config();
    this.secret = cfg.traktClientSecret || '';
    if (cfg.traktBase) TRAKT_BASE = cfg.traktBase;
    this.clientId = cfg.traktClientId || TRAKT_CLIENT_ID;
    const raw = await window.native.getSecret('traktAuth');
    if (raw) { try { Object.assign(this, JSON.parse(raw)); } catch { /* ignore */ } }
    return this.loggedIn();
  },
  available() { return !ANIME_ONLY && !!(this.clientId && this.secret); },
  loggedIn() { return !!this.token; },
  async save() {
    await window.native.setSecret('traktAuth', JSON.stringify({ token: this.token, refresh: this.refresh, expiresAt: this.expiresAt, userName: this.userName }));
  },
  headers() {
    const h = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': this.clientId };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  },
  async call(path, opts = {}) {
    await this.ensureFresh();
    return http(TRAKT_BASE + path, { ...opts, headers: { ...this.headers(), ...(opts.headers || {}) } });
  },
  // Step 1: get a code for the user to type at trakt.tv/activate
  async startDeviceLogin() {
    return http(`${TRAKT_BASE}/oauth/device/code`, { method: 'POST', headers: this.headers(), json: { client_id: this.clientId } });
  },
  // Step 2: wait until they've approved it. onTick is called each poll.
  async finishDeviceLogin(dc, isCancelled) {
    let interval = (dc.interval || 5) * 1000;
    const until = Date.now() + (dc.expires_in || 600) * 1000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, interval));
      if (isCancelled()) throw new Error('cancelled');
      try {
        const t = await http(`${TRAKT_BASE}/oauth/device/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, json: { code: dc.device_code, client_id: this.clientId, client_secret: this.secret } });
        this.token = t.access_token; this.refresh = t.refresh_token;
        this.expiresAt = Date.now() + (t.expires_in || 7776000) * 1000;
        const me = await this.call('/users/settings').catch(() => null);
        this.userName = me?.user?.username || me?.user?.name || 'Trakt user';
        await this.save();
        return;
      } catch (e) {
        if (e.status === 400) continue;                       // not approved yet
        if (e.status === 429) { interval += 1000; continue; } // polling too fast
        if (e.status === 418) throw new Error('You denied the sign-in on Trakt.');
        if (e.status === 410 || e.status === 404) throw new Error('That code expired. Try again.');
        if (e.status === 409) throw new Error('That code was already used. Try again.');
        throw e;
      }
    }
    throw new Error('That code expired. Try again.');
  },
  async ensureFresh() {
    if (!this.refresh || Date.now() < this.expiresAt - 86_400_000) return;
    try {
      const t = await http(`${TRAKT_BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, json: {
        refresh_token: this.refresh, client_id: this.clientId, client_secret: this.secret, redirect_uri: TRAKT_REDIRECT, grant_type: 'refresh_token' } });
      this.token = t.access_token; this.refresh = t.refresh_token || this.refresh;
      this.expiresAt = Date.now() + (t.expires_in || 7776000) * 1000;
      await this.save();
    } catch { /* keep old token */ }
  },
  async logout() {
    if (this.token) http(`${TRAKT_BASE}/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, json: { token: this.token, client_id: this.clientId, client_secret: this.secret } }).catch(() => {});
    Object.assign(this, { token: '', refresh: '', expiresAt: 0, userName: '' });
    await window.native.setSecret('traktAuth', null);
  },
  // Movies & TV search. Works without signing in.
  async search(text, limit = 20) {
    if (ANIME_ONLY) return [];
    const r = await http(`${TRAKT_BASE}/search/movie,show${qs({ query: text, extended: 'full,images', limit })}`, { headers: this.headers() });
    return (r || []).map((x) => this.toItem(x.movie || x.show, x.type === 'movie' ? 'movie' : 'show')).filter(Boolean);
  },
  // Browse popular/trending movies or shows by genre/year. Returns items (no total from this API).
  async browse(kind, { genre, year, status, sort }, page = 1, limit = 24) {
    if (ANIME_ONLY) return [];
    const list = sort === 'trending' ? 'trending' : sort === 'watched' ? 'watched/yearly' : 'popular';
    const years = !year ? undefined : /^\d{4}$/.test(year) ? year : /s$/.test(year) ? `${year.slice(0, 4)}-${Number(year.slice(0, 4)) + 9}` : undefined;
    const r = await http(`${TRAKT_BASE}/${kind === 'movie' ? 'movies' : 'shows'}/${list}${qs({ extended: 'full,images', page, limit, genres: genre ? genreSlug(genre) : undefined, years, status: kind === 'show' && status ? ({ airing: 'returning series', finished: 'ended' })[status] : undefined })}`, { headers: this.headers() });
    return (r || []).map((x) => this.toItem(x.movie || x.show || x, kind)).filter((x) => x && !x.genres.includes('anime'));
  },
  // A random popular movie or show (top ~500), skipping anime.
  async random(kind) {
    if (ANIME_ONLY) return null;
    for (let tries = 0; tries < 4; tries++) {
      const page = 1 + Math.floor(Math.random() * 500);
      const r = await http(`${TRAKT_BASE}/${kind === 'movie' ? 'movies' : 'shows'}/popular${qs({ extended: 'full,images', page, limit: 1 })}`, { headers: this.headers() });
      const it = this.toItem(r?.[0], kind);
      if (it && !it.genres.includes('anime')) return it;
    }
    return null;
  },
  toItem(m, kind) {
    const img = (arr) => { const u = Array.isArray(arr) ? arr[0] : arr; return u ? (/^https?:/.test(u) ? u : `https://${u}`) : ''; };
    {
      if (!m) return null;
      return {
        id: `trakt:${kind}:${m.ids?.trakt}`, kind, title: m.title, year: m.year ? String(m.year) : '',
        synopsis: m.overview || '', poster: img(m.images?.poster) || img(m.images?.thumb), genres: m.genres || [],
        episodes: m.aired_episodes || null, rating: m.rating ? Math.round(m.rating * 10) : null,
        ids: Object.fromEntries(Object.entries({ tmdb: m.ids?.tmdb, imdb: m.ids?.imdb, tvdb: m.ids?.tvdb }).filter(([, v]) => v)),
        url: `https://trakt.tv/${kind === 'movie' ? 'movies' : 'shows'}/${m.ids?.slug || m.ids?.trakt}`,
        cover: img(m.images?.fanart) || img(m.images?.banner),
      };
    }
  },
  // HD wide artwork for a title (used for carousel banners when nothing better exists).
  async fanartFor(title, year) {
    try {
      const r = await http(`${TRAKT_BASE}/search/show,movie${qs({ query: title, extended: 'images', limit: 5 })}`, { headers: this.headers() });
      const items = (r || []).map((x) => x.show || x.movie).filter(Boolean);
      const best = items.find((m) => year && Math.abs((m.year || 0) - Number(year)) <= 1) || items[0];
      const u = best?.images?.fanart?.[0];
      if (!u) return [];
      const url = /^https?:/.test(u) ? u : `https://${u}`;
      return url.includes('/medium/') ? [url.replace('/medium/', '/full/'), url] : [url];
    } catch { return []; }
  },
  // Jellyfin provider ids -> Trakt ids
  ids(item) {
    const p = item?.ProviderIds || {};
    const ids = {};
    if (p.Tmdb) ids.tmdb = Number(p.Tmdb);
    if (p.Imdb) ids.imdb = p.Imdb;
    if (p.Tvdb) ids.tvdb = Number(p.Tvdb);
    return Object.keys(ids).length ? ids : null;
  },
  // Marks a movie, or a list of episodes of one show, as watched.
  async markMovie(movie) {
    const ids = this.ids(movie);
    const body = ids ? { movies: [{ ids, watched_at: new Date().toISOString() }] }
      : { movies: [{ title: movie.Name, year: movie.ProductionYear, watched_at: new Date().toISOString() }] };
    const r = await this.call('/sync/history', { method: 'POST', json: body });
    if (!r?.added?.movies) throw new Error('Trakt couldn’t find this movie');
  },
  async markEpisodes(series, episodes) {
    const ids = this.ids(series);
    const bySeason = {};
    for (const e of episodes) {
      if (e.IndexNumber == null) continue;
      const s = e.ParentIndexNumber ?? 1;
      (bySeason[s] ||= []).push({ number: e.IndexNumber, watched_at: new Date().toISOString() });
    }
    const show = { ...(ids ? { ids } : { title: series.Name, year: series.ProductionYear }), seasons: Object.entries(bySeason).map(([n, eps]) => ({ number: Number(n), episodes: eps })) };
    const r = await this.call('/sync/history', { method: 'POST', json: { shows: [show] } });
    if (!r?.added?.episodes) throw new Error('Trakt couldn’t find this show');
    return r.added.episodes;
  },
};
/* =============================== ANISKIP =============================== */
async function aniSkip(malId, episode, lengthSec) {
  if (!malId || !episode) return [];
  try {
    const r = await http(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}${qs({ 'types[]': ['op', 'ed', 'recap'], episodeLength: Math.round(lengthSec || 0) })}`);
    if (!r?.found) return [];
    const map = { op: 'intro', ed: 'outro', recap: 'recap', 'mixed-op': 'intro', 'mixed-ed': 'outro' };
    return (r.results || []).map((x) => ({ type: map[x.skipType] || x.skipType, start: x.interval.startTime, end: x.interval.endTime }));
  } catch { return []; }
}
/* =============================== REQUESTS =============================== */
const Requests = {
  enabled() { return Jellyfin.connected() && typeof App !== 'undefined' && App.libraries.length > 0; },
  // The webhook baked into the app only works on the owner's server; anyone
  // using their own server sets their own webhook in Settings.
  async webhook() {
    const own = await window.native.get('requestWebhook');
    if (own) return own;
    const cfg = await window.native.config();
    const ownersServer = cfg.jellyfinUrl && Jellyfin.normalizeServer(cfg.jellyfinUrl) === Jellyfin.server;
    return ownersServer ? cfg.requestWebhook || '' : '';
  },
  // Requests that were added to the library more than 14 days ago are cleared automatically.
  async list() {
    if (!this.enabled()) return [];
    const all = (await window.native.get('requests')) || [];
    const keep = all.filter((r) => !r.addedAt || Date.now() - r.addedAt < 14 * 86400000);
    if (keep.length !== all.length) await window.native.set('requests', keep);
    return keep;
  },
  async has(key) { return (await this.list()).some((r) => r.kitsuId === key); },
  async markAdded(key) {
    const all = (await window.native.get('requests')) || [];
    const r = all.find((x) => x.kitsuId === key);
    if (r && !r.addedAt) { r.addedAt = Date.now(); await window.native.set('requests', all); }
  },
  async send(anime, note) {
    if (!this.enabled()) throw new Error('Connect a Jellyfin library before sending requests.');
    const cfg = await window.native.config();
    const webhook = await Requests.webhook();
    if (!webhook) throw new Error('Requests are not set up yet. Ask whoever runs the server to add a request webhook in config.json.');
    const who = Jellyfin.userName || 'Someone';
    await http(webhook, {
      method: 'POST',
      json: {
        username: 'AniDeck Requests',
        embeds: [{
          title: `Request: ${anime.title}`.slice(0, 250),
          url: anime.url,
          description: (anime.synopsis || '').slice(0, 300) + ((anime.synopsis || '').length > 300 ? '…' : ''),
          color: 0xff7a59,
          thumbnail: anime.poster ? { url: anime.poster } : undefined,
          fields: [
            { name: 'Requested by', value: who, inline: true },
            { name: 'Type', value: anime.kind === 'movie' ? 'Movie' : anime.kind === 'show' ? 'TV show' : 'Anime', inline: true },
            ...(anime.kind === 'movie' ? [] : [{ name: 'Episodes', value: String(anime.episodes ?? '?'), inline: true }]),
            { name: 'Year', value: anime.year || '?', inline: true },
            ...(note ? [{ name: 'Note', value: String(note).slice(0, 500) }] : []),
          ],
          footer: { text: anime.kind && anime.kind !== 'anime' ? `Trakt · ${Object.entries(anime.ids || {}).map(([k, v]) => `${k}:${v}`).join(' ')}` : `Kitsu ID ${anime.id}` },
          timestamp: new Date().toISOString(),
        }],
      },
    });
    const list = await this.list();
    list.unshift({ kitsuId: anime.id, kind: anime.kind || 'anime', ids: anime.ids || null, year: anime.year || '', title: anime.title, poster: anime.poster, url: anime.url, note: note || '', at: Date.now() });
    await window.native.set('requests', list.slice(0, 200));
  },
  async remove(kitsuId) {
    await window.native.set('requests', (await this.list()).filter((r) => r.kitsuId !== kitsuId));
  },
};
// "Slice of Life" -> "slice-of-life", "Sci-Fi" -> "science-fiction"
function genreSlug(g) {
  const s = String(g).toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ({ 'sci-fi': 'science-fiction', scifi: 'science-fiction', 'science-fiction-and-fantasy': 'science-fiction' })[s] || s;
}
/* ================================ MATCHING ================================ */
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}
// norm() for matching titles across sites, or "" when nothing Latin is left to match on
// (a Japanese title would otherwise come out as "" or just "and" and match the wrong show).
function titleKey(s) {
  return norm(String(s || '').replace(/[&＆]/g, '')) ? norm(s) : '';
}
// "Season 3", "3rd Season", "Overlord III" -> 3; null when the title doesn't say.
function seasonNumberIn(s) {
  const t = String(s || '');
  const m = t.match(/\bseason\s*(\d+)\b/i) || t.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i);
  if (m) return Number(m[1]);
  const r = t.match(/\s(ii|iii|iv|v|vi)$/i);
  return r ? ['ii', 'iii', 'iv', 'v', 'vi'].indexOf(r[1].toLowerCase()) + 2 : null;
}
// Removes "Season 2", "2nd Season", "Part 2", "II" etc. so sequels match the series name.
function stripSeason(s) {
  return String(s || '')
    .replace(/[:\-–]\s*(season|part|cour)\s*\d+.*$/i, '')
    .replace(/\s+(season|part|cour)\s*\d+.*$/i, '')
    .replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, '')
    .replace(/\s+(ii|iii|iv|v|vi)$/i, '')
    .replace(/\s+\d+$/, '')
    .trim();
}
function hostName(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; } }
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.9;
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const ga = grams(a), gb = grams(b);
  let inter = 0; ga.forEach((x) => { if (gb.has(x)) inter++; });
  return (2 * inter) / (ga.size + gb.size || 1);
}
// Is this title on MyAnimeList? (Second opinion when Kitsu doesn't know it.) true / false / null (couldn't check)
const MAL = {
  last: 0,
  async has(title, year, isMovie) {
    const wait = 400 - (Date.now() - this.last); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    let r;
    try { r = await http(`https://api.jikan.moe/v4/anime${qs({ q: title, limit: 10 })}`, { timeout: 8000 }); } catch { return null; }
    return (r?.data || []).some((x) => {
      const names = [x.title, x.title_english, x.title_japanese, ...(x.title_synonyms || []), ...(x.titles || []).map((t) => t.title)].filter(Boolean);
      if (Math.max(0, ...names.map((n) => similarity(n, title))) < 0.88) return false;
      const y = x.year || x.aired?.prop?.from?.year || 0;
      if (year && y && Math.abs(y - year) > 1) return false;
      if (isMovie && x.type && !/movie/i.test(x.type)) return false;
      if (!isMovie && /^movie$/i.test(x.type || '')) return false;
      return true;
    });
  },
};
// Scores for anime Kitsu hasn't rated yet. Tries MyAnimeList (via Jikan) first, then AniList
// as a backup. Works by MAL id when Kitsu has one, otherwise by title + year. Refreshed twice a day.
const Ratings = {
  cache: null, queue: Promise.resolve(), pending: {}, aniDown: false,
  async load() { if (!this.cache) this.cache = (await window.native.get('ratingCache2')) || {}; return this.cache; },
  get(kitsuId) {
    if (!kitsuId) return Promise.resolve(null);
    return (this.pending[kitsuId] ||= this.lookup(kitsuId));
  },
  async anilist(mal, title, year) {
    if (this.aniDown) return null;
    const query = `query($id:Int,$s:String){ Page(perPage:5){ media(idMal:$id, search:$s, type:ANIME){ idMal averageScore meanScore seasonYear startDate{year} } } }`;
    try {
      const r = await http('https://graphql.anilist.co', { method: 'POST', timeout: 7000, headers: { Accept: 'application/json' }, json: { query, variables: mal ? { id: Number(mal) } : { s: title } } });
      const list = r?.data?.Page?.media || [];
      const m = mal ? list[0] : list.find((x) => !year || Math.abs((x.seasonYear || x.startDate?.year || 0) - year) <= 1) || null;
      return m ? (m.averageScore || m.meanScore || null) : null;
    } catch (e) { if (!e.status || e.status >= 500 || e.status === 429) this.aniDown = true; return null; }
  },
  async jikan(mal, title, year) {
    try {
      if (mal) { const r = await http(`https://api.jikan.moe/v4/anime/${mal}`, { timeout: 7000 }); return r?.data?.score ? Math.round(r.data.score * 10) : null; }
      const r = await http(`https://api.jikan.moe/v4/anime${qs({ q: title, limit: 5 })}`, { timeout: 7000 });
      const m = (r?.data || []).find((x) => x.score && (!year || Math.abs((x.year || x.aired?.prop?.from?.year || 0) - year) <= 1));
      return m ? Math.round(m.score * 10) : null;
    } catch { return null; }
  },
  async lookup(kitsuId) {
    const c = await this.load();
    const hit = c[kitsuId];
    if (hit && Date.now() - hit.t < (hit.v ? 12 : 6) * 3600000) return hit.v; // refresh scores twice a day
    const run = this.queue.then(async () => {
      const mal = await Kitsu.malId(kitsuId);
      let title = '', year = 0;
      if (!mal) { const a = await Kitsu.anime(kitsuId).catch(() => null); title = a?.canonical || a?.title || ''; year = Number(a?.year) || 0; if (!title) return null; }
      let v = await this.jikan(mal, title, year);
      await new Promise((res) => setTimeout(res, 400)); // Jikan allows ~3 requests/second
      if (!v) v = await this.anilist(mal, title, year);
      return v;
    });
    this.queue = run.catch(() => null);
    const v = await run.catch(() => null);
    c[kitsuId] = { v, t: Date.now() };
    setTimeout(() => { delete this.pending[kitsuId]; }, 3600000); // long sessions re-check hourly
    window.native.set('ratingCache2', c);
    return v;
  },
};
const Matcher = {
  key(seriesId, seasonNumber) { return `${seriesId}:${seasonNumber ?? 1}`; },
  async all() {
    const all = (await window.native.get('kitsuMatches')) || {};
    if (!this.cleaned) {
      // One-time cleanup: forget automatic id-based matches made before the mapping fix, so they're re-checked.
      this.cleaned = true;
      let changed = false;
      for (const [k, m] of Object.entries(all)) if (m && !m.manual && m.how === 'id' && (m.v || 0) < 3) { delete all[k]; changed = true; }
      if (changed) await window.native.set('kitsuMatches', all);
    }
    return all;
  },
  async get(seriesId, seasonNumber) { return (await this.all())[this.key(seriesId, seasonNumber)] || null; },
  VERSION: 3, // bump to re-check automatic matches made by older, looser rules
  async set(seriesId, seasonNumber, anime, manual, how) {
    const all = await this.all();
    all[this.key(seriesId, seasonNumber)] = anime
      ? { id: anime.id, title: anime.title, episodes: anime.episodes, url: anime.url, poster: anime.poster, manual: !!manual, how: how || (manual ? 'manual' : 'title'), v: this.VERSION }
      : { none: true, manual: !!manual, v: this.VERSION };
    await window.native.set('kitsuMatches', all);
  },
  async clearAll() { await window.native.set('kitsuMatches', {}); },
  // Finds the Kitsu entry for one Jellyfin season, remembering the answer.
  async auto(series, season, episodeCount) {
    const isMovie = series.Type === 'Movie';
    const n = isMovie ? 1 : (season?.IndexNumber ?? 1);
    this.lastOk = true; // stays true when the answer comes from cache
    const saved = await this.get(series.Id, n);
    if (saved && (saved.manual || saved.v === this.VERSION)) return saved.none ? null : saved;
    this.lastOk = false;
    // 1) Exact: anime database ids that Jellyfin already knows (season 1 / movies only).
    if (n <= 1) {
      const pid = Object.fromEntries(Object.entries(series.ProviderIds || {}).map(([k, v]) => [k.toLowerCase(), v]));
      const tries = [['kitsu', null], ['myanimelist', 'myanimelist/anime'], ['anilist', 'anilist/anime'], ['anidb', 'anidb']];
      for (const [key, site] of tries) {
        if (!pid[key]) continue;
        const hit = key === 'kitsu' ? await Kitsu.anime(pid[key]).catch(() => null) : await Kitsu.byExternal(site, pid[key]);
        if (hit) { this.lastOk = true; await this.set(series.Id, n, hit, false, 'id'); return { ...hit, manual: false, how: 'id' }; }
      }
    }
    // 2) Search by title, with a year check so look-alike names don't match.
    const wantYear = Number(season?.ProductionYear || (season?.PremiereDate || '').slice(0, 4) || (n <= 1 ? series.ProductionYear : 0)) || 0;
    const name = series.Name;
    const queries = n <= 1 ? [name] : [`${name} season ${n}`, `${name} ${n}`];
    if (isMovie) episodeCount = 1;
    let best = null, bestScore = 0;
    for (const q of queries) {
      let results = [];
      try { results = await Kitsu.search(q, 10); this.lastOk = true; } catch { continue; }
      for (const a of results) {
        if (a.subtype === 'music') continue;
        if (!isMovie && a.subtype === 'movie') continue;
        const titleScore = Math.max(...a.titles.map((t) => similarity(t, q)), ...a.titles.map((t) => similarity(t, name) * 0.85), ...a.titles.map((t) => similarity(stripSeason(t), name) * 0.9));
        if (titleScore < 0.75) continue; // names must be genuinely close, not just share letters
        let score = titleScore;
        if (wantYear && a.year) { const d = Math.abs(Number(a.year) - wantYear); score += d === 0 ? 0.25 : d === 1 ? 0.1 : -0.6; }
        if (episodeCount && a.episodes) score += a.episodes === episodeCount ? 0.35 : Math.abs(a.episodes - episodeCount) <= 2 ? 0.1 : -0.1;
        if (n > 1) {
          const hasNum = a.titles.some((t) => new RegExp(`(season\\s*${n}\\b|\\b${n}(st|nd|rd|th)\\s+season|\\s${n}$|\\b${['', 'i', 'ii', 'iii', 'iv', 'v', 'vi'][n] || 'x'}$)`, 'i').test(t));
          score += hasNum ? 0.3 : -0.25;
        } else if (a.titles.some((t) => /season\s*[2-9]|\b(2nd|3rd|[4-9]th)\s+season/i.test(t))) {
          score -= 0.3;
        }
        if (isMovie) {
          score += a.subtype === 'movie' ? 0.3 : -0.3;
          if (series.ProductionYear && a.year) score += String(series.ProductionYear) === a.year ? 0.2 : -0.1;
        } else if (a.subtype === 'TV') score += 0.05;
        if (score > bestScore) { bestScore = score; best = a; }
      }
      if (bestScore >= 1.1) break;
    }
    if (!best || bestScore < 0.85) { if (this.lastOk) await this.set(series.Id, n, null, false); return null; } // too unsure; user can pick with "Fix match"
    await this.set(series.Id, n, best, false, 'title');
    return { id: best.id, title: best.title, episodes: best.episodes, url: best.url, poster: best.poster, manual: false, how: 'title' };
  },
};
// Builds a lookup to tell whether a Kitsu show is in the Jellyfin library.
function buildLibraryIndex(series, matches) {
  const byName = new Map();
  for (const s of series) {
    for (const t of [s.Name, s.OriginalTitle]) { const k = titleKey(t); if (k) byName.set(k, s); }
  }
  const byKitsu = new Map();
  for (const [key, m] of Object.entries(matches || {})) {
    if (m && !m.none) {
      const sid = key.split(':')[0];
      const s = series.find((x) => x.Id === sid);
      if (s) byKitsu.set(String(m.id), { series: s, season: Number(key.split(':')[1]) });
    }
  }
  return {
    find(anime) {
      const hit = byKitsu.get(String(anime.id));
      if (hit) return hit.series;
      for (const t of anime.titles) {
        const k = titleKey(t), k2 = titleKey(stripSeason(t));
        const s = (k && byName.get(k)) || (k2 && byName.get(k2));
        if (s) return s;
      }
      return null;
    },
    // Which season of the library show it is: from saved matches, else a season number in its titles.
    season(anime) {
      const hit = byKitsu.get(String(anime.id));
      if (hit) return hit.season;
      for (const t of anime.titles || []) { const n = seasonNumberIn(t); if (n) return n; }
      return null;
    },
  };
}