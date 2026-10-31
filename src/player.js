/* AniDeck - video player (Jellyfin HLS + Kitsu tracking + skip intro) */
'use strict';

const $p = (id) => document.getElementById(id);
function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
}

// A cue's text -> safe HTML: keeps <i>, <b>, <u> and line breaks; drops voice/class tags and anything else.
function cueHtml(text) {
  return String(text || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/&lt;(\/?)([ibu])(?:\.[^&]*)?&gt;/gi, '<$1$2>')
    .replace(/&lt;[^&]*?&gt;/g, '')
    .replace(/\n/g, '<br>');
}

const Player = {
  el: null, video: null, hls: null,
  ctx: null,            // { episode, series, season, episodes, match }
  item: null, source: null,
  audioIndex: null, subIndex: null, subMode: 'off', // 'text' | 'burn' | 'off'
  playSessionId: '', segments: [], tracked: false, reportTimer: null, idleTimer: null,
  nextTimer: null, onClose: null, bound: false, duration: 0,
  server: 'jellyfin', remote: false, pendingServer: null, serverSeq: 0, // 'jellyfin' | 'anikoto' | 'hianime' | 'aniwatch'

  bind() {
    if (this.bound) return; this.bound = true;
    this.el = $p('player'); this.video = $p('video');
    const v = this.video;

    // Subtitles: any text track that gets switched on (ours from Jellyfin, or hls.js's) is drawn by drawSubs()
    // instead of the browser's grey cue box.
    v.textTracks.addEventListener('change', () => this.hookSubs());
    v.textTracks.addEventListener('addtrack', () => this.hookSubs());
    $p('p-back').onclick = () => this.close();
    $p('p-play').onclick = () => this.toggle();
    $p('p-prevbtn').onclick = () => this.playPrev();
    $p('p-nextbtn').onclick = () => this.playNext();
    $p('p-skipfwd').onclick = () => this.seekBy(App.settings.skipLen || 85);
    $p('p-cast').onclick = () => Cast.open();
    $p('p-tv-controls').onclick=()=>Cast.open();
    $p('p-tv-return').onclick=()=>Cast.returnToPc();
    $p('p-pip').onclick = async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { this.osd('Picture-in-picture isn’t available'); } };
    $p('p-eps-btn').onclick = (e) => { e.stopPropagation(); this.toggleDrawer(); };
    $p('p-drawer-close').onclick = () => this.closeDrawer();
    $p('p-drawer-sort').onclick = (e) => { e.stopPropagation(); this.drawerNewest = !this.drawerNewest; window.native.set('drawerNewest', this.drawerNewest); this.renderDrawer(); };
    $p('p-drawer-go').oninput = () => this.drawerJump();
    $p('p-drawer-go').onkeydown = (e) => {
      e.stopPropagation(); // don't trigger player shortcuts while typing
      if (e.key === 'Enter') { const b = $p('p-drawer-list').querySelector('.d-ep.hit'); if (b) b.click(); }
      if (e.key === 'Escape') this.closeDrawer();
    };
    window.native.get('drawerNewest').then((v) => { this.drawerNewest = !!v; });
    $p('p-fit-btn').onclick = (e) => { e.stopPropagation(); const order = ['contain', 'cover', 'fill']; this.setFit(order[(order.indexOf(this.fit || 'contain') + 1) % 3]); };
    for (const [btn, menu, build] of [['p-server-btn', 'p-server-menu', 'buildServerMenu'], ['p-sub-btn', 'p-sub-menu', null],['p-quality-btn', 'p-quality-menu', 'buildQuality'], ['p-speed-btn', 'p-speed-menu', 'buildSpeed']]) {
      $p(btn).onclick = (e) => { e.stopPropagation(); if (build) this[build](); this.toggleMenu(menu); };
    }
    $p('p-full').onclick = () => this.fullscreen();
    $p('p-mute').onclick = () => { v.muted = !v.muted; this.syncVol(); };
    $p('p-vol').oninput = (e) => { v.volume = +e.target.value; v.muted = v.volume === 0; this.syncVol();clearTimeout(this.volumeSaveTimer);const value=v.volume;this.volumeSaveTimer=setTimeout(()=>window.native.set('volume',value),200); };
    $p('p-vol').onchange=()=>{clearTimeout(this.volumeSaveTimer);window.native.set('volume',v.volume);};
    $p('p-skip').onclick = () => this.skipSegment();
    $p('p-next-go').onclick = () => this.playNext();
    $p('p-next-cancel').onclick = () => this.cancelNext();
    v.onclick = () => this.toggle();
    v.ondblclick = () => this.fullscreen();

    v.addEventListener('play', () => { $p('p-play').innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; this.report('progress'); });
    v.addEventListener('pause', () => { $p('p-play').innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; this.report('progress'); this.wake(); });
    v.addEventListener('waiting', () => { $p('p-spinner').hidden = false; });
    v.addEventListener('playing', () => { $p('p-spinner').hidden = true; });
    v.addEventListener('canplay', () => { $p('p-spinner').hidden = true; });
    v.addEventListener('timeupdate', () => this.tick());
    v.addEventListener('progress', () => this.drawBuffer());
    v.addEventListener('ended', () => this.ended());

    // seek bar
    const seek = $p('p-seek');
    const posFrom = (e) => { const r = seek.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
    let dragging = false;
    let seekPreview = 0;
    const previewSeek = (e) => { seekPreview = posFrom(e); $p('p-thumb').style.left = `${seekPreview * 100}%`; $p('p-cur').textContent = fmtTime(seekPreview * this.dur()); };
    seek.addEventListener('mousedown', (e) => { dragging = true; previewSeek(e); });
    window.addEventListener('mousemove', (e) => {
      if (this.el.hidden) return;
      if (dragging) previewSeek(e);
    });
    window.addEventListener('mouseup', () => { if (dragging) { dragging = false; this.seekTo(seekPreview * this.dur()); } });
    seek.addEventListener('mousemove', (e) => {
      const tip = $p('p-tip'); const f = posFrom(e);
      tip.hidden = false; tip.style.left = `${f * 100}%`; tip.textContent = fmtTime(f * this.dur());
    });
    seek.addEventListener('mouseleave', () => { $p('p-tip').hidden = true; });

    // idle-hide controls
    this.el.addEventListener('mousemove', () => this.wake());
    document.addEventListener('click', (e) => {
      if (e.target.closest('.menu')) return;
      this.el.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
      if (!e.target.closest('.p-drawer')) this.closeDrawer();
    });

    document.addEventListener('keydown', (e) => {
      if (this.el.hidden || !$p('modal').hidden || e.target.matches('input, textarea, select')) return;
      if (e.key === 'Escape') { if (this.drawerOpen()) this.closeDrawer(); else if (this.el.querySelector('.menu:not([hidden])')) this.el.querySelectorAll('.menu').forEach(m=>m.hidden=true); else if (document.fullscreenElement) document.exitFullscreen(); else this.close(); this.wake(); return; }
      const act = actionForKey(e); // shortcuts are set in Settings → Keyboard
      const step = App.settings.seekStep || 10;
      if (act === 'playPause') { e.preventDefault(); this.toggle(); }
      else if (act === 'seekBack') { e.preventDefault(); this.seekBy(-step); }
      else if (act === 'seekFwd') { e.preventDefault(); this.seekBy(step); }
      else if (act === 'volUp') { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.05); this.syncVol(); }
      else if (act === 'volDown') { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.05); this.syncVol(); }
      else if (act === 'fullscreen') this.fullscreen();
      else if (act === 'mute') { v.muted = !v.muted; this.syncVol(); }
      else if (act === 'next') this.playNext();
      else if (act === 'prev') this.playPrev();
      else if (act === 'faster') this.setSpeed(Math.min(2, (v.playbackRate || 1) + 0.25));
      else if (act === 'slower') this.setSpeed(Math.max(0.25, (v.playbackRate || 1) - 0.25));
      else if (act === 'skipIntro') this.skipSegment();
      else if (act === 'skipAhead') this.seekBy(App.settings.skipLen || 85);
      else if (act === 'episodes') this.toggleDrawer();
      else return;
      this.wake();
    });
  },

  dur() { return this.casting?.duration || this.duration || this.video.duration || 0; },

  wake() {
    this.el.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { if (!this.video.paused && !this.menuOpen()) this.el.classList.add('idle'); }, 2800);
  },

  async open(ctx, onClose) {
    if(ctx.provider==='animepahe')ctx={...ctx,provider:'hianime',streamUrl:null};
    this.bind();
    applySubStyle(this.el); // Settings → Subtitles
    // Opened from a title page: the player wears that show's colour too.
    showTint(this.el, ['show', 'anime', 'movie'].includes(App.view) ? App.showAl?.color : null);
    this.onClose = onClose;
    this.ctx = ctx;
    // The caller may have already resolved an outside stream; otherwise play from Jellyfin.
    this.server = ctx.provider || (ctx.streamUrl ? activeStreamingServer : 'jellyfin');
    this.pendingServer = null; const openSeq = ++this.serverSeq;
    this.el.hidden = false;
    App.markNav?.();
    this.wake();
    const vol = await window.native.get('volume');
    if (openSeq !== this.serverSeq || this.ctx !== ctx || this.el.hidden) return;
    if (typeof vol === 'number') this.video.volume = vol;
    this.syncVol();
    await this.load(ctx.episode, ctx.streamUrl ? { stream: { streamUrl: ctx.streamUrl, isHLS: ctx.isHLS, provider: ctx.provider } } : {});
  },

  // stream: an already-resolved outside stream; at: start position (default: Jellyfin resume point).
  async load(episode, { stream = null, at = null, keepTracked = false } = {}) {
    this.teardown();
    const loadSeq = this.loadSeq;
    this.cancelNext();
    this.nextCancelled = false;
    this.ctx.episode = episode;
    if (!keepTracked) this.tracked = false;
    this.forceConvert = false;
    this.segments = [];this.segmentDuration=null;this.lastAutoSkip=null;
    this.playSessionId = crypto.randomUUID().replace(/-/g, '');
    $p('p-spinner').hidden = false;
    this.updateTitle(episode);
    $p('p-quality-btn').hidden = this.server !== 'jellyfin' || !Jellyfin.connected();
    if ($p('p-quality-btn').hidden) $p('p-quality-menu').hidden=true;
    $p('p-nextbtn').disabled = !this.nextEpisode();
    $p('p-prevbtn').disabled = !this.prevEpisode();
    $p('p-skiplen').textContent = `+${App.settings.skipLen || 85}s`;
    this.setFit(this.fit || App.settings.fit || 'contain', true);
    this.setTrackLabel();
    this.buildServerMenu();

    try {
      if (this.server !== 'jellyfin') {
        await this.startRemote(episode, stream, at || 0);
        if (loadSeq !== this.loadSeq || this.el.hidden) return;
        this.loadSegments();
        return;
      }
      const item = await Jellyfin.item(episode.Id);
      if (loadSeq !== this.loadSeq || this.el.hidden) return;
      this.item = item;
      this.source = this.item.MediaSources?.[0];
      if (!this.source) throw new Error('This episode has no playable file.');
      this.duration = (this.item.RunTimeTicks || this.source.RunTimeTicks || 0) / TICKS;
      this.pickTracks();
      this.buildMenus();
      await this.startStream(at ?? (this.item.UserData?.PlaybackPositionTicks ? this.item.UserData.PlaybackPositionTicks / TICKS : 0));
      this.loadSegments();
    } catch (err) {
      if (loadSeq !== this.loadSeq || this.el.hidden) return;
      $p('p-spinner').hidden = true;
      let detail = '';
      // Ask the server directly so the error says why (login, transcoding, etc.).
      if (this.item && this.source) {
        const url = Jellyfin.streamUrl(this.item, this.source, { audioIndex: this.audioIndex, maxBitrate: App.settings.maxBitrate, playSessionId: this.playSessionId });
        const r = await window.native.request({ url }).catch(() => null);
        if (r && !r.ok) detail = ` — server said HTTP ${r.status}${r.text ? `: ${String(r.text).slice(0, 140)}` : ''}${r.error ? `: ${r.error}` : ''}`;
      }
      toast(`Couldn't play: ${err.message}${detail}`, 'bad');
      console.error('Playback failed', err, detail);
    }
  },

  pickTracks() {
    // A per-show Sub/Dub pick (show page) beats the global audio setting.
    const mode = App.settings.showAudio?.[this.ctx?.series?.Id];
    const subLang = App.settings.subLang;
    const s = mode === 'sub' ? { audioLang: 'jpn', subLang } : mode === 'dub' ? { audioLang: 'eng', subLang } : App.settings;
    const streams = this.source.MediaStreams || [];
    const audios = streams.filter((x) => x.Type === 'Audio');
    const subs = streams.filter((x) => x.Type === 'Subtitle');
    const a = audios.find((x) => x.Language === s.audioLang) || audios.find((x) => x.Index === this.source.DefaultAudioStreamIndex) || audios[0];
    this.audioIndex = a ? a.Index : null;
    const isSigns = (x) => x.IsForced || /sign|song/i.test(`${x.DisplayTitle || ''} ${x.Title || ''}`);
    const inLang = subs.filter((x) => x.Language === s.subLang);
    let sub = null;
    if (s.subLang === 'off') sub = null;
    else if (a && a.Language === s.subLang) sub = inLang.find(isSigns) || null;      // dub in your language: signs only
    else sub = inLang.find((x) => !isSigns(x)) || inLang[0] || subs.find((x) => x.IsDefault) || null; // full subs
    this.setSub(sub);
  },

  setSub(sub) {
    if (!sub) { this.subIndex = null; this.subMode = 'off'; return; }
    this.subIndex = sub.Index;
    this.subMode = sub.IsTextSubtitleStream ? 'text' : 'burn';
  },

  // What this PC can decode natively.
  caps() {
    if (this._caps) return this._caps;
    const ms = (t) => { try { return window.MediaSource?.isTypeSupported(t) || false; } catch { return false; } };
    this._caps = {
      hevc: ms('video/mp4; codecs="hvc1.1.6.L150.90"') || ms('video/mp4; codecs="hev1.1.6.L150.90"'),
      av1: ms('video/mp4; codecs="av01.0.08M.08"'),
      vp9: ms('video/webm; codecs="vp9"'),
    };
    return this._caps;
  },

  // Direct play when the file, audio track and subtitles all work as-is; otherwise convert.
  decide() {
    const streams = this.source.MediaStreams || [];
    const video = streams.find((x) => x.Type === 'Video');
    const audios = streams.filter((x) => x.Type === 'Audio');
    const audio = audios.find((x) => x.Index === this.audioIndex) || audios[0];
    const c = this.caps();
    const vc = String(video?.Codec || '').toLowerCase(), ac = String(audio?.Codec || '').toLowerCase();
    const container = String(this.source.Container || '').toLowerCase();
    const videoOk = vc === 'h264' || (vc === 'hevc' && c.hevc) || (vc === 'av1' && c.av1) || (vc === 'vp9' && c.vp9);
    const audioOk = !audio || ['aac', 'mp3', 'opus', 'flac', 'vorbis'].includes(ac);
    const containerOk = /(mp4|m4v|mov|mkv|matroska|webm)/.test(container);
    const firstAudio = !audio || audio.Index === (audios.find((x) => x.IsDefault) || audios[0]).Index;
    const cap = this.qualityCap ?? App.settings.maxBitrate;
    const bitrateOk = !this.source.Bitrate || !cap || cap >= 40000000 || this.source.Bitrate <= cap * 1.05;
    const subsOk = this.subMode !== 'burn';
    if (!this.forceConvert && videoOk && audioOk && containerOk && firstAudio && bitrateOk && subsOk) return { mode: 'direct', video };
    // Converting: keep the original picture when possible (only audio/container change).
    return { mode: videoOk && bitrateOk && subsOk ? 'remux' : 'transcode', video };
  },

  async startStream(startAt = 0) {
    const v = this.video;
    const plan = this.decide();
    this.playMethod = plan.mode === 'direct' ? 'DirectPlay' : plan.mode === 'remux' ? 'DirectStream' : 'Transcode';
    const res = plan.video?.Height ? (plan.video.Height >= 2000 ? '4K' : `${plan.video.Height}p`) : '';
    $p('p-mode').textContent = [plan.mode === 'direct' ? 'Direct play' : plan.mode === 'remux' ? 'Original quality' : 'Converting', res].filter(Boolean).join(' · ');
    [...v.querySelectorAll('track')].forEach((t) => t.remove());

    if (plan.mode === 'direct') {
      const ok = await new Promise((resolve) => {
        const done = (r) => { clearTimeout(timer); v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onErr); resolve(r); };
        const onMeta = () => { if (startAt > 5) v.currentTime = startAt; done(true); };
        const onErr = () => done(false);
        const timer = setTimeout(() => done(false), 12000);
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('error', onErr);
        v.src = Jellyfin.directUrl(this.item, this.source, this.playSessionId);
      });
      if (!ok) { // this file won't play as-is here; fall back to converting
        this.forceConvert = true;
        v.removeAttribute('src'); v.load();
        return this.startStream(startAt);
      }
      return this.afterStart();
    }

    const c = this.caps();
    const url = Jellyfin.streamUrl(this.item, this.source, {
      audioIndex: this.audioIndex,
      burnSubIndex: this.subMode === 'burn' ? this.subIndex : null,
      maxBitrate: this.qualityCap ?? App.settings.maxBitrate,
      playSessionId: this.playSessionId,
      copyVideo: plan.mode === 'remux',
      hevc: c.hevc, av1: c.av1,
    });

    await this.attachSource(url, startAt);
    return this.afterStart();
  },

  // Loads a URL into the video element: HLS through hls.js, anything else natively.
  attachSource(url, startAt = 0, isHLS = true) {
    this.sourceCancel?.();
    if(url!==this.pcRelayUrl)this.castSource = { url, isHLS };
    const v=this.video,seq=this.loadSeq;
    return new Promise((resolve,reject)=>{
      let settled=false,timer;
      const cleanup=()=>{clearTimeout(timer);v.removeEventListener('loadedmetadata',metadata);v.removeEventListener('error',nativeError);if(this.sourceCancel===cancel)this.sourceCancel=null;};
      const finish=error=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else {this.localSourceReady=true;resolve();}};
      const cancel=()=>{const error=new Error('Playback source superseded');error.name='AbortError';finish(error);};
      const metadata=()=>{if(seq!==this.loadSeq)return cancel();if(startAt>5)v.currentTime=startAt;finish();};
      const nativeError=()=>finish(new Error('stream error'));
      this.sourceCancel=cancel;
      timer=setTimeout(()=>finish(new Error('Video initialization timed out. Try another server.')),20000);
      if(isHLS&&window.Hls&&Hls.isSupported()){
        const hls=this.hls=new Hls({maxBufferLength:90,maxMaxBufferLength:120,maxBufferSize:120*1000*1000,backBufferLength:120,startPosition:startAt>5?startAt:-1,startFragPrefetch:true,maxStarvationDelay:2,startLevel:-1,capLevelToPlayerSize:true});
        let retries=0;
        hls.on(Hls.Events.MANIFEST_PARSED,()=>seq===this.loadSeq?finish():cancel());
        hls.on(Hls.Events.ERROR,(_event,data)=>{
          if(seq!==this.loadSeq||this.hls!==hls||!data.fatal)return;
          if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&retries++<3){hls.startLoad();return;}
          if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&retries++<3){hls.recoverMediaError();return;}
          const code=data.response?.code||data.networkDetails?.status;
          const error=new Error(`${data.details||'stream error'}${code?` (HTTP ${code})`:''}`);
          if(settled){$p('p-spinner').hidden=true;toast(`Playback stopped: ${error.message}`,'bad');}else finish(error);
        });
        hls.loadSource(url);hls.attachMedia(v);
      }else{
        v.addEventListener('loadedmetadata',metadata);v.addEventListener('error',nativeError);v.src=url;
      }
    });
  },

  async resumeFromCast(at=0) {
    const seq=this.loadSeq,source=this.castSource;
    if(!this.localSourceReady&&source?.url)await this.attachSource(await this.localRemoteSource({streamUrl:source.url,headers:this.castHeaders}),at,source.isHLS);
    if(seq!==this.loadSeq||this.el.hidden)return;
    if(this.remote&&this.subMode==='text')await this.attachTextSub();
    this.seekTo(at);await this.video.play();this.tick();
  },

  // Plays the episode from an outside site, resolved by the stream resolver in the main process.
  async startRemote(episode, stream, startAt) {
    const server = this.server, loadSeq = this.loadSeq;
    const s = stream || await this.resolveRemote(server, episode);
    if (loadSeq !== this.loadSeq || this.ctx.episode !== episode || this.server !== server || this.el.hidden) return; // superseded or closed while resolving
    if (s.provider && s.provider !== server) { // the resolver fell back to another site
      this.osd(`Playing on ${this.serverName(s.provider)}`);
      this.server = s.provider;
      this.buildServerMenu();
    }
    this.castHeaders = s.headers || {};
    this.remote = true;
    this.prepareRemoteSubtitles(s.subtitles||s.tracks||[]);
    this.playMethod = 'DirectPlay';
    $p('p-mode').textContent = this.serverName(this.server);
    [...this.video.querySelectorAll('track')].forEach((t) => t.remove());
    this.buildMenus();
    this.castSource={url:s.streamUrl,isHLS:s.isHLS!==false};
    if(typeof Cast!=='undefined'&&(Cast.ready||Cast.active)){
      try{await Cast.sendCurrent({at:startAt});}
      catch(error){Cast.ready=false;Cast.active=false;this.casting=null;toast(`Couldn’t send to TV: ${error.message}. Trying this PC.`, 'bad');await this.attachSource(await this.localRemoteSource(s),startAt,s.isHLS!==false);}
    }else await this.attachSource(await this.localRemoteSource(s), startAt, s.isHLS !== false);
    if (loadSeq !== this.loadSeq || this.el.hidden) return;
    return this.afterStart();
  },

  async localRemoteSource(stream){if(this.server==='jellyfin'||!window.native.relayStream||stream.streamUrl===this.pcRelayUrl)return stream.streamUrl;const seq=this.loadSeq;const url=await window.native.relayStream({url:stream.streamUrl,headers:stream.headers||this.castHeaders||{}});if(seq!==this.loadSeq){const error=new Error('Playback superseded');error.name='AbortError';throw error;}this.pcRelayUrl=url;return url;},

  async resolveRemote(server, episode, prefetch = false) {
    const sid = this.ctx.series?.Id;
    const audio = this.ctx.audio || App.settings.showAudio?.[sid] || (App.settings.audioLang === 'eng' ? 'dub' : 'sub');
    let s;
    try {
      s = await window.native.resolveStream({ provider: remotePlaybackProvider(server), title: this.ctx.series?.Name || episode.SeriesName || '',
        episodeNum: episode.IndexNumber || 1, audio, prefetch, episodeCount:Number(this.ctx.match?.episodes)||null, mediaFormat:this.ctx.match?.mediaFormat||(this.ctx.movie?'MOVIE':null), titleAliases:this.ctx.match?.titleAliases||[],
        seasonNumber: episode.ParentIndexNumber ?? this.ctx.season?.IndexNumber ?? 1,
        episodeTitle: /^Episode \d+$/i.test(episode.Name || '') ? '' : episode.Name || '',
        absoluteEpisodeNum: episode.AbsoluteEpisodeNumber || null });
    } catch (e) { throw new Error(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    if (!s?.streamUrl) throw new Error(`No stream found on ${this.serverName(server)}`);
    return s;
  },

  updateTitle(episode) {
    const movie = !!this.ctx.movie || episode.Type === 'Movie';
    $p('p-show').textContent = movie ? this.ctx.series?.Name || episode.Name || '' : this.ctx.series?.Name || episode.SeriesName || '';
    $p('p-ep').textContent = movie ? '' : epLabel(episode);
    $p('p-ep').hidden = movie;
    this.enrichDrawer?.(); // streamed shows: real episode names from ani.zip, then the title redraws
  },

  serverName(id) { return (EXTERNAL_SERVERS.find((s) => s.id === id) || { name: id }).name; },

  buildServerMenu() {
    const m = $p('p-server-menu');
    m.innerHTML = '<div class="menu-h">Server</div>' + EXTERNAL_SERVERS.filter(s => s.id !== 'jellyfin' || Jellyfin.connected()).map((s) => {
      const off = s.id === 'jellyfin' && this.ctx?.remoteOnly; // not in the library, nothing to play locally
      const cls = [s.id === this.server ? 'on' : '', s.id === this.pendingServer ? 'pending' : ''].join(' ').trim();
      return `<button data-srv="${s.id}" class="${cls}"${off ? ' disabled title="Not in your Jellyfin library"' : ''}><span class="m-text"><span class="m-num">${String(s.num).replace('#', '')}</span>${s.name.replace(/\s*\((.+)\)$/, ' <small class="m-tag">$1</small>')}</span></button>`;
    }).join('');
    m.onclick = (e) => { const b = e.target.closest('[data-srv]'); if (b && !b.disabled) this.switchServer(b.dataset.srv); };
    $p('p-server-btn').title = `Server: ${this.serverName(this.server)}`;
  },

  // Moves playback to another server at the same spot. The current stream keeps playing until the new one is found.
  async switchServer(id) {
    if(id==='animepahe')id='hianime';
    if (id === 'jellyfin' && (!Jellyfin.connected() || this.ctx?.remoteOnly)) return;
    $p('p-server-menu').hidden = true;
    if (id === this.server && !this.pendingServer) return;
    const seq = ++this.serverSeq, ep = this.ctx.episode, v = this.video;
    this.pendingServer = id === this.server ? null : id;
    this.buildServerMenu();
    if (!this.pendingServer) return; // picked the current server again: just cancel the pending switch
    this.osd(`Switching to ${this.serverName(id)}…`);
    try {
      const stream = id === 'jellyfin' ? null : await this.resolveRemote(id, ep);
      if (seq !== this.serverSeq || this.ctx?.episode !== ep || this.el.hidden) return; // another pick, episode change or close won
      const at = v.currentTime, wasPaused = v.paused;
      this.pendingServer = null;
      this.server = id;
      activeStreamingServer = id; // keep the show page's "Watch on" pick in sync
      await this.load(ep, { stream, at, keepTracked: true });
      if (wasPaused) v.pause();
    } catch (e) {
      if (seq === this.serverSeq) toast(`Couldn't switch to ${this.serverName(id)}: ${e.message}`, 'bad');
    } finally {
      if (seq === this.serverSeq) { this.pendingServer = null; this.buildServerMenu(); }
    }
  },

  async afterStart() {
    const v = this.video;
    v.playbackRate = this.rate || App.settings.speed || 1;
    v.onratechange = () => { this.rate = v.playbackRate; };
    if(this.casting){this.video.pause();this.tick();}
    else if (typeof Cast !== 'undefined' && (Cast.active || Cast.ready)) await Cast.sendCurrent().catch(error => { Cast.ready = false; Cast.active = false; this.casting = null; v.play().catch(() => {}); toast(error.message, 'bad'); });
    else v.play().catch(error=>{if(!this.el.hidden){$p('p-spinner').hidden=true;toast('Couldn’t start playback: '+error.message,'bad');}});
    this.monitorStalls();
    if (this.subMode === 'text'&&!this.casting) this.attachTextSub(); // don't hold up the picture for subtitles
    this.report('start');
    clearInterval(this.reportTimer);
    this.reportTimer = setInterval(() => this.report('progress'), 10000);
  },

  monitorStalls() {
    clearInterval(this.stallTimer);
    const v = this.video;
    let lastTime = v.currentTime, unchangedSince = Date.now(), lastRecovery = 0;
    this.stallTimer = setInterval(() => {
      if (!this.remote || !this.hls || v.paused || v.ended || v.seeking || this.el.hidden) {
        lastTime = v.currentTime; unchangedSince = Date.now(); return;
      }
      if (Math.abs(v.currentTime - lastTime) > 0.1) { lastTime = v.currentTime; unchangedSince = Date.now(); return; }
      if (Date.now() - unchangedSince < 10000 || Date.now() - lastRecovery < 30000) return;
      lastRecovery = Date.now();
      let bufferedAhead = 0;
      for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) > v.currentTime) bufferedAhead = v.buffered.end(i) - v.currentTime;
      if (bufferedAhead > 2) { console.warn('[Player] Recovering stalled decoder'); this.hls.recoverMediaError(); }
      else { console.warn('[Player] Restarting stalled segment loading'); this.hls.startLoad(v.currentTime); }
    }, 2000);
  },

  // Takes over the track the browser would show: keeps it 'hidden' (cues still fire) and draws the lines ourselves.
  hookSubs() {
    const tracks = [...this.video.textTracks];
    const t = tracks.find((x) => x.mode === 'showing') || (this.subTrack && tracks.includes(this.subTrack) && this.subTrack.mode !== 'disabled' ? this.subTrack : null);
    if (this.subTrack && this.subTrack !== t) this.subTrack.oncuechange = null;
    this.subTrack = t || null;
    if (!t) return this.clearSubs();
    if (t.mode === 'showing') t.mode = 'hidden';
    t.oncuechange = () => this.drawSubs();
    this.drawSubs();
  },
  drawSubs() {
    const cues = [...(this.subTrack?.activeCues || [])];
    // Lines a subtitle file pins near the top (signs, translations of on-screen text) stay at the top.
    const isTop = (c) => typeof c.line === 'number' && c.line >= 0 && (c.snapToLines ? c.line < 4 : c.line < 40);
    const html = (list) => list.map((c) => `<div class="p-sub"><span>${cueHtml(c.text)}</span></div>`).join('');
    $p('p-subs').innerHTML = html(cues.filter((c) => !isTop(c)));
    $p('p-subs-top').innerHTML = html(cues.filter(isTop));
  },
  clearSubs() { $p('p-subs').innerHTML = ''; $p('p-subs-top').innerHTML = ''; },

  prepareRemoteSubtitles(tracks){
    this.remoteSubtitles=tracks.filter(t=>{try{return /^https?:$/.test(new URL(t.url||t.file).protocol);}catch{return false;}}).slice(0,20).map(t=>({...t,url:t.url||t.file}));
    const lang=App.settings.subLang||'eng',normal=s=>String(s||'').toLowerCase().replace(/^eng(?:lish)?$/,'en').replace(/^jpn$/,'ja');
    this.remoteSubIndex=lang==='off'?-1:this.remoteSubtitles.findIndex(t=>normal(t.language)===normal(lang));
    if(lang!=='off'&&this.remoteSubIndex<0)this.remoteSubIndex=Math.max(0,this.remoteSubtitles.findIndex(t=>t.default));
    if(!this.remoteSubtitles.length)this.remoteSubIndex=-1;
    this.subMode=this.remoteSubIndex>=0?'text':'off';
  },
  async changeRemoteSub(index){
    this.remoteSubIndex=index;this.subMode=index>=0?'text':'off';
    [...this.video.querySelectorAll('track')].forEach(t=>t.remove());this.subTrack=null;this.clearSubs();
    if(this.casting)await Cast.sendCurrent({at:this.casting.time}).catch(error=>toast(error.message,'bad'));
    else if(index>=0)await this.attachTextSub();
    this.buildMenus();$p('p-sub-menu').hidden=true;
  },
  async attachTextSub() {
    const seq=this.loadSeq,remoteTrack=this.remote?this.remoteSubtitles?.[this.remoteSubIndex]:null;
    if(this.remote&&!remoteTrack)return;
    try {
      const res = await window.native.request({ url: remoteTrack?.url||Jellyfin.subtitleVttUrl(this.item, this.source, this.subIndex),headers:remoteTrack?.headers||this.castHeaders||{} });
      if (!res.ok || !res.text) throw new Error('Subtitle download failed');
      if(seq!==this.loadSeq||this.el.hidden)return;
      const blob = new Blob([res.text.replace(/^\uFEFF/,'')], { type: 'text/vtt' });
      const track = document.createElement('track');
      track.kind = 'subtitles';track.label=remoteTrack?.label||'Subtitles';track.srclang=remoteTrack?.language||'und'; track.default = true; track.src = URL.createObjectURL(blob);if(this.subtitleBlob)URL.revokeObjectURL(this.subtitleBlob);this.subtitleBlob=track.src;
      this.video.appendChild(track);
      track.track.mode = 'hidden'; // never the browser's box; hookSubs() draws it
      this.subTrack = track.track;
      track.track.oncuechange = () => this.drawSubs();
      track.addEventListener('load', () => {if(seq===this.loadSeq)this.drawSubs();});
      track.addEventListener('error',()=>{if(seq===this.loadSeq)toast('This subtitle track could not be read. Try another track or server.','bad');});
    } catch {
      if(seq!==this.loadSeq)return;
      if(this.remote){toast('Couldn’t load subtitles from this source. Try another subtitle track or server.','bad');return;}
      // Text track failed (unusual format) - fall back to burning it into the video.
      this.subMode = 'burn';
      const t = this.video.currentTime;
      await this.restartStream(t);
    }
  },

  async restartStream(at) {
    const wasPaused = this.video.paused;
    Jellyfin.stopEncoding(this.playSessionId);
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    this.video.removeAttribute('src');
    this.playSessionId = crypto.randomUUID().replace(/-/g, '');
    $p('p-spinner').hidden = false;
    try { await this.startStream(at); if (wasPaused) this.video.pause(); }
    catch (e) { toast(`Couldn't switch track: ${e.message}`, 'bad'); }
    this.buildMenus();
  },

  buildMenus() {
    if(this.remote){
      const menu=$p('p-sub-menu');menu.innerHTML='<div class="menu-h">Subtitles</div>';
      const choices=[{label:'Off',index:-1},...(this.remoteSubtitles||[]).map((t,index)=>({label:t.label||t.language||`Track ${index+1}`,index}))];
      for(const choice of choices){const b=document.createElement('button');b.textContent=choice.label;if(choice.index===this.remoteSubIndex)b.className='on';b.onclick=()=>this.changeRemoteSub(choice.index);menu.appendChild(b);}
      $p('p-sub-btn').disabled=!(this.remoteSubtitles?.length);$p('p-sub-btn').title=this.remoteSubtitles?.length?'Subtitles':'This source has no separate subtitle tracks';$p('p-quality-btn').disabled=true;return;
    }
    const streams = this.source?.MediaStreams || [];
    $p('p-quality-btn').disabled = this.remote;
    const audios = streams.filter((x) => x.Type === 'Audio');
    const subs = streams.filter((x) => x.Type === 'Subtitle');
    const sm = $p('p-sub-menu');
    sm.innerHTML = '<div class="menu-h">Subtitles</div>';
    const add = (box, label, on, fn) => { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; b.onclick = fn; box.appendChild(b); };
    add(sm, 'Off', this.subMode === 'off', () => this.changeSub(null));
    for (const x of subs) add(sm, (x.DisplayTitle || x.Language || `Track ${x.Index}`) + (x.IsTextSubtitleStream ? '' : ' (image)'), this.subMode !== 'off' && x.Index === this.subIndex, () => this.changeSub(x));
    if (audios.length > 1) {
      const h = document.createElement('div'); h.className = 'menu-h'; h.textContent = 'Audio'; sm.appendChild(h);
      for (const x of audios) add(sm, x.DisplayTitle || x.Language || `Track ${x.Index}`, x.Index === this.audioIndex, () => { this.audioIndex = x.Index; sm.hidden = true; this.forceConvert = false; this.restartStream(this.video.currentTime); });
    }
    $p('p-sub-btn').disabled = !subs.length && audios.length < 2;
  },

  menuList(id, title, items) {
    const m = $p(id);
    m.innerHTML = `<div class="menu-h">${title}</div>` + items.map(([v, l, on]) => `<button data-v="${v}" class="${on ? 'on' : ''}">${l}</button>`).join('');
    return m;
  },
  buildSpeed() {
    const cur = this.video.playbackRate || 1;
    const m = this.menuList('p-speed-menu', 'Speed', [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((x) => [x, `${Number.isInteger(x) ? x.toFixed(1) : x}×`, Math.abs(cur - x) < 0.01]));
    m.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { this.setSpeed(Number(b.dataset.v)); m.hidden = true; } };
  },
  setSpeed(x) { this.video.playbackRate = x; this.osd(x === 1 ? 'Normal speed' : `${x}× speed`); },
  setFit(f, quiet) {
    this.fit = f; this.video.style.objectFit = f;
    const name = { contain: 'Fit', cover: 'Fill', fill: 'Stretch' }[f];
    $p('p-fit-btn').title = `Picture: ${name} (click to change)`;
    if (!quiet) this.osd(name);
  },
  buildQuality() {
    if(this.server!=='jellyfin'||!Jellyfin.connected())return;
    const cur = this.qualityCap ?? App.settings.maxBitrate;
    const opts = [[40000000, 'Original'], [20000000, 'High · 20 Mbps'], [10000000, '1080p · 10 Mbps'], [6000000, '720p · 6 Mbps'], [3000000, '480p · 3 Mbps']];
    const m = this.menuList('p-quality-menu', `Quality <small>${this.playMethod === 'DirectPlay' ? 'Direct play' : this.playMethod === 'DirectStream' ? 'Original picture' : 'Converting'}</small>`, opts.map(([v, l]) => [v, l, Number(v) === Number(cur)]));
    m.onclick = (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      m.hidden = true;
      this.qualityCap = Number(b.dataset.v);
      this.forceConvert = false;
      this.restartStream(this.video.currentTime);
    };
  },
  osd(text) {
    const o = $p('p-osd'); o.textContent = text; o.hidden = false;
    clearTimeout(this._osdT); this._osdT = setTimeout(() => { o.hidden = true; }, 1200);
  },

  drawerOpen() { return $p('p-drawer').classList.contains('open'); },
  closeDrawer() { const d = $p('p-drawer');const restoreFocus=d.matches?.(':focus-within'); d.classList.remove('open'); d.inert=true;d.setAttribute?.('aria-hidden','true');$p('p-eps-btn')?.setAttribute('aria-expanded','false');$p('p-drawer-go').blur();if(restoreFocus)$p('p-eps-btn')?.focus({preventScroll:true}); },
  toggleDrawer() {
    this.el.querySelectorAll('.menu').forEach(m => { m.hidden = true; });
    if (this.drawerOpen()) return this.closeDrawer();
    $p('p-drawer-go').value = '';
    this.renderDrawer();
    $p('p-drawer').classList.add('open');
    $p('p-drawer').inert=false;$p('p-drawer').setAttribute?.('aria-hidden','false');$p('p-eps-btn')?.setAttribute('aria-expanded','true');this.wake();
    const on = $p('p-drawer-list').querySelector('.d-ep.on');
    if (on) on.scrollIntoView({ block: 'center' });
  },
  // Shows played from outside your library get real titles, stills, summaries and air dates from ani.zip.
  enrichDrawer() {
    const m = this.ctx?.match;
    if (!this.ctx?.remoteOnly || this.ctx.movie || !m?.id || this.ctx.zipP) return;
    const ctx = this.ctx;
    // Your list's progress marks streamed episodes as watched (they have no Jellyfin watched state).
    Tracker.entry?.(m.id).then((e) => {
      if (this.ctx !== ctx || !e) return;
      ctx.watchedUpTo = Number(e.progress) || 0;
      if (this.drawerOpen()) this.renderDrawer(true);
    }).catch(() => {});
    ctx.zipP = (async () => { const al = await AniList.details(m.id).catch(() => null); ctx.al = al; return al?.id ? AniZip.get(al.id) : null; })()
      .then((z) => {
        ctx.zip = z;
        if (!z || this.ctx !== ctx) return;
        // A streamed show whose length wasn't known: list every episode that has aired (ani.zip air dates / AniList's next).
        const known = Object.keys(z.episodes || {}).map(Number).filter((n) => { const d = Date.parse(z.episodes[n].airDate || ''); return n > 0 && (!d || d <= Date.now()); });
        const aired = Math.max(ctx.al?.next ? ctx.al.next.episode - 1 : 0, known.length ? Math.max(...known) : 0, ctx.episode?.IndexNumber || 0);
        if (aired > (ctx.episodes || []).length && aired <= 3000 && ctx.episode) {
          const base = ctx.episode, have = new Map((ctx.episodes || []).map((e) => [e.IndexNumber, e]));
          ctx.episodes = Array.from({ length: aired }, (_, i) => have.get(i + 1) || { ...base, Id: String(base.Id).replace(/-\d+$/, `-${i + 1}`), IndexNumber: i + 1, Name: `Episode ${i + 1}`, Overview: '', UserData: undefined });
          const cur = ctx.episodes.find((e) => e.IndexNumber === base.IndexNumber); if (cur) ctx.episode = cur;
        }
        // "Episode 4" placeholders get their real names (and summaries), here and in the drawer.
        for (const ep of [...(ctx.episodes || []), ctx.episode]) {
          const e = ep && z.episodes?.[ep.IndexNumber];
          if (e?.title && (!ep.Name || /^Episode \d+$/i.test(ep.Name))) ep.Name = e.title;
          if (e?.overview && !ep.Overview) ep.Overview = e.overview;
        }
        if (ctx.episode) this.updateTitle(ctx.episode);
        if (this.drawerOpen()) this.renderDrawer(true);
      }).catch(() => {});
  },
  // The episode drawer: show name and how far you are, then one row per episode (still, number, title, length, air date,
  // summary), the playing one marked; long shows get range chips to jump through the list.
  renderDrawer(keepScroll = false) {
    this.enrichDrawer();
    const zip = this.ctx.zip?.episodes || {};
    // Only episodes that are out: nothing announced-but-unaired, which would open an empty player.
    const nowT = Date.now(), aired = (ep) => { const z = zip[ep.IndexNumber], d = Date.parse(ep.PremiereDate || z?.airDate || ''); return ep.LocationType !== 'Virtual' && !(d > nowT + 3600000) && !(this.ctx.al?.next && ep.IndexNumber >= this.ctx.al.next.episode && !ep.MediaSources && String(ep.Id).startsWith('remote-')); };
    const list = (this.ctx.episodes || []).filter((ep) => ep.Id === this.ctx.episode?.Id || aired(ep));
    if (this.drawerNewest) list.reverse();
    const box = $p('p-drawer-list'), scroll = box.scrollTop;
    const watched = list.filter((ep) => ep.UserData?.Played || (this.ctx.watchedUpTo > 0 && ep.IndexNumber <= this.ctx.watchedUpTo)).length;
    const total = list.length;
    const movie=!!this.ctx.movie||this.ctx.episode?.Type==='Movie';
    const drawer=$p('p-drawer');drawer.classList.toggle('is-movie',movie);drawer.classList.toggle('is-short',total<=3);
    $p('p-drawer-tools').hidden=movie||total<=1;
    $p('p-drawer-title').innerHTML=`<span class="d-show">${esc(this.ctx.series?.Name||this.ctx.episode?.Name||'')}</span><span class="d-heading">${movie?'Movie':'Episodes'}${movie?'':`<em>${total}</em>`}</span>`;
    $p('p-eps-btn').title=movie?'Movie details':'Episodes';
    $p('p-eps-btn').setAttribute('aria-label',movie?'Open movie details':'Open episode panel');
    $p('p-drawer-sort').title = this.drawerNewest ? 'Oldest first' : 'Newest first';
    $p('p-drawer-sort').setAttribute('aria-label',this.drawerNewest?'Show oldest episodes first':'Show newest episodes first');
    $p('p-drawer-sort').classList.toggle('on', !!this.drawerNewest);
    const now = Date.now(), fmtLen = (min) => (min ? `${Math.round(min)}m` : '');
    const rows = list.map((ep, i) => {
      const n = ep.IndexNumber ?? '', z = movie ? {} : zip[n] || {};
      const img = ep.ImageTags?.Primary ? Jellyfin.img(ep.Id, 'Primary', { fillWidth: 300 }) : z.image || '';
      const on = ep.Id === this.ctx.episode.Id, played = !!ep.UserData?.Played || (this.ctx.watchedUpTo > 0 && Number(n) > 0 && Number(n) <= this.ctx.watchedUpTo), pct = ep.UserData?.PlayedPercentage || 0;
      const name = ep.Name && !/^Episode \d+$/.test(ep.Name) ? ep.Name : z.title || '';
      const mins = ep.RunTimeTicks ? ep.RunTimeTicks / TICKS / 60 : z.runtime || 0;
      const air = Date.parse(ep.PremiereDate || z.airDate || '') || 0, future = air > now;
      const meta = [future ? `Airs ${new Date(air).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : air ? new Date(air).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '', fmtLen(mins)].filter(Boolean).join(' · ');
      const about = (ep.Overview || z.overview || '').replace(/</g, '&lt;');
      return `<button class="d-ep ${on ? 'on' : ''} ${played ? 'played' : ''} ${future ? 'future' : ''}" data-ep="${esc(ep.Id)}" data-n="${n}" data-title="${esc(name || (movie ? this.ctx.series?.Name : `Episode ${n}`))}" aria-current="${on?'true':'false'}" style="--i:${Math.min(i, 14)}">
        <span class="d-thumb">${img ? `<img loading="lazy" src="${img}" alt="">` : '<span class="d-ph"></span>'}<span class="d-num">${!movie && n !== '' ? `E${n}` : ''}</span>${fmtLen(mins) ? `<span class="d-len">${fmtLen(mins)}</span>` : ''}
          ${on ? '<span class="d-playing"><i></i><i></i><i></i><i></i></span>' : played ? '<span class="d-check">✓</span>' : ''}${pct && !played ? `<span class="d-bar"><i style="width:${Math.round(pct)}%"></i></span>` : ''}</span>
        <span class="d-text">${on ? '<span class="d-now">Now playing</span>' : ''}<b>${movie ? esc(this.ctx.series?.Name || ep.Name || 'Movie') : name ? name.replace(/</g, '&lt;') : `Episode ${n}`}</b>${meta ? `<small>${meta}</small>` : ''}${about ? `<span class="d-about">${about}</span>` : ''}</span></button>`;
    }).join('');
    // Range chips (1–50, 51–100…) for long shows.
    const chunk = 50, ranges = !movie && total > 60 ? Array.from({ length: Math.ceil(total / chunk) }, (_, k) => { const a = k * chunk; const nums = list.slice(a, a + chunk).map((e) => e.IndexNumber).filter((x) => x != null); return [a, Math.min(...nums), Math.max(...nums)]; }) : [];
    box.innerHTML = `${!movie && total > 1 ? `<div class="d-progress"><span>${watched ? `Watched <b>${watched}</b> of ${total}` : `${total} episodes`}</span><i><b style="width:${total ? Math.round(watched / total * 100) : 0}%"></b></i></div>` : ''}
      ${ranges.length ? `<div class="d-ranges">${ranges.map(([a, lo, hi]) => `<button data-range="${a}">${lo}–${hi}</button>`).join('')}</div>` : ''}${rows}`;
    box.classList.toggle('fresh', !keepScroll);
    if (keepScroll) box.scrollTop = scroll;
    box.onclick = (e) => {
      const r = e.target.closest('[data-range]');
      if (r) { const t = box.querySelectorAll('.d-ep')[Number(r.dataset.range)]; t?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      const b = e.target.closest('[data-ep]'); if (!b) return;
      const ep = list.find((x) => x.Id === b.dataset.ep);
      this.closeDrawer();
      if (ep && ep.Id !== this.ctx.episode.Id) { this.report('stopped'); this.load(ep); }
    };
    this.drawerJump();
  },
  drawerJump() {
    const q=$p('p-drawer-go').value.trim().toLowerCase(),box=$p('p-drawer-list');
    const items=[...box.querySelectorAll('.d-ep')];let first=null,count=0;
    for(const b of items){const match=!q||(/^\d+$/.test(q)?String(b.dataset.n)===String(Number(q)):(b.dataset.title||b.textContent).toLowerCase().includes(q));b.hidden=!match;b.classList.remove('hit');if(match){count++;if(!first)first=b;}}
    box.querySelectorAll('.d-progress,.d-ranges').forEach(el=>el.hidden=!!q);
    const status=$p('p-drawer-status');status.hidden=!q;status.textContent=count?count+' matching episode'+(count===1?'':'s'):'No matching episodes. Try another number or title.';
    if(q&&first){first.classList.add('hit');first.scrollIntoView({block:'nearest',behavior:App.settings.reduceMotion?'auto':'smooth'});}
  },

  async changeSub(sub) {
    $p('p-sub-menu').hidden = true;
    const prevMode = this.subMode;
    this.setSub(sub);
    if(this.casting){await Cast.sendCurrent({at:this.casting.time});this.buildMenus();return;}
    const t = this.video.currentTime;
    if (prevMode === 'burn' || this.subMode === 'burn') return this.restartStream(t);
    [...this.video.querySelectorAll('track')].forEach((x) => x.remove());
    this.subTrack = null; this.clearSubs();
    if (this.subMode === 'text') await this.attachTextSub();
    this.buildMenus();
  },

  toggleMenu(id) {
    const m = $p(id), was = m.hidden;
    this.el.querySelectorAll('.menu').forEach((x) => { x.hidden = true; });
    m.hidden = !was;
    if (!m.hidden) { this.closeDrawer(); this.placeMenu(m); this.wake(); }
  },
  menuOpen() { return this.drawerOpen() || !!this.el.querySelector('.menu:not([hidden])'); },

  // Opens the menu upward from just above its button, centered on it and kept inside the player.
  // The menu is positioned inside its .menu-wrap, so every offset here is relative to the wrap, not the player.
  placeMenu(m) {
    const wrap = m.parentElement.getBoundingClientRect();
    const box = this.el.getBoundingClientRect();
    const pad = 12;

    m.style.bottom = `${wrap.height + 8}px`; // 8px above the button
    m.style.maxHeight = `${Math.max(160, wrap.top - box.top - 8 - pad)}px`; // only the room above it; longer lists scroll

    const w = m.offsetWidth || 180;
    const left = Math.min(Math.max(wrap.left + wrap.width / 2 - w / 2, box.left + pad), box.right - pad - w);
    m.style.left = `${left - wrap.left}px`;
    m.style.right = 'auto';

    const on = m.querySelector('button.on');
    m.scrollTop = on ? on.offsetTop - m.clientHeight / 2 : 0;
  },

  async loadSegments() {
    const ctx=this.ctx,ep=ctx?.episode,seq=this.loadSeq;if(!ep||ctx.movie)return;
    const duration=this.casting?.duration||this.dur();
    const key=[seq,ep.Id,ctx.match?.id||'',Math.round(duration||0)].join(':');
    if(this.segmentPending?.key===key)return this.segmentPending.promise;
    const request={key};this.segmentPending=request;this.segmentDuration=Math.round(duration||0);
    request.promise=(async()=>{try{
      let segs=ctx.remoteOnly?[]:await Jellyfin.segments(ep.Id).catch(()=>[]);
      if(!segs.length&&ctx.match?.id&&duration>0){
        const id=String(ctx.match.id);
        const mal=id.startsWith('al:')?(await AniList.details(id))?.malId:await Kitsu.malId(id);
        if(this.ctx!==ctx||this.ctx.episode!==ep||this.loadSeq!==seq)return;
        const number=ctx.remoteOnly?Number(ep.IndexNumber):relativeEpisodeNumber(ep,ctx.episodes);
        if(mal&&number>0)segs=await aniSkip(mal,number,duration);
      }
      if(this.ctx!==ctx||this.ctx.episode!==ep||this.loadSeq!==seq||this.el.hidden||this.segmentPending!==request)return;
      this.segments=segs.filter(s=>['intro','outro','recap'].includes(s.type)&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start&&(!duration||s.end<=duration));
      this.drawMarks();
    }catch(error){console.warn('Intro timings unavailable:',error.message);}
    finally{if(this.segmentPending===request)this.segmentPending=null;}})();return request.promise;
  },

  autoSkipSegment(segment){
    if(!App.settings.autoSkip||!segment||segment.type==='outro'||(this.casting?.paused??this.video.paused))return false;
    const key=[this.loadSeq,segment.type,segment.start,segment.end].join(':'),now=Date.now();
    if(this.lastAutoSkip?.key===key&&now-this.lastAutoSkip.at<2000)return true;
    this.lastAutoSkip={key,at:now};const result=this.seekTo(segment.end);result?.catch?.(error=>console.warn('Auto-skip seek failed:',error.message));return true;
  },

  drawMarks() {
    const box = $p('p-marks'); box.innerHTML = '';
    const d = this.dur(); if (!d) return;
    for (const s of this.segments) {
      const m = document.createElement('div');
      m.className = 'seek-mark';
      m.style.left = `${(s.start / d) * 100}%`;
      m.style.width = `${((s.end - s.start) / d) * 100}%`;
      m.title = s.type;
      box.appendChild(m);
    }
  },

  activeSegment() {
    const t = this.casting?.time ?? this.video.currentTime;
    return this.segments.find((s) => t >= s.start && t < s.end - 1);
  },

  skipSegment() {
    const s = this.activeSegment();
    if (!s) return;
    if (s.type === 'outro' && this.nextEpisode() && s.end >= this.dur() - 10) return this.playNext();
    this.seekTo(s.end);
  },

  tick() {
    const v = this.video, d = this.casting?.duration || this.dur(), t = this.casting?.time ?? v.currentTime;
    this.el.classList.toggle('casting',!!this.casting);
    $p('p-tv-remote').hidden=!this.casting;
    if(!this.casting)$p('p-play').title=v.paused?'Play':'Pause';
    if(this.casting)$p('p-tv-status').textContent=this.casting.error|| (this.casting.needsInteraction?'Press Play on your TV remote':this.casting.loading?'Loading on your TV…':this.casting.paused?'Paused on your TV':'Playing on your TV');
    $p('p-cur').textContent = fmtTime(t); $p('p-dur').textContent = fmtTime(d);
    const f = d ? (t / d) * 100 : 0;
    $p('p-fill').style.width = `${f}%`;
    $p('p-thumb').style.left = `${f}%`;

    // Receiver progress drives the same tracking, skip and next-episode controls as local playback.
    if (!this.tracked && d && t / d >= App.settings.threshold) { this.tracked = true; this.markWatched(); }
    if (this.remote && d > 120 && t > 15 && d - t <= 90) this.preloadNextEpisode();
    const upNext = this.updateUpNext(t, d);
    if(!this.segments.length&&!this.segmentPending&&d>0&&this.segmentDuration!==Math.round(d))this.loadSegments();
    const seg = this.activeSegment();
    const skip = $p('p-skip');
    if (seg && !(seg.type === 'outro' && upNext)) {
      if (this.autoSkipSegment(seg)) { skip.hidden=true; return; }
      skip.hidden = false;
      $p('p-skip-label').textContent = seg.type === 'outro' ? (this.nextEpisode() ? 'Next episode' : 'Skip credits') : seg.type === 'recap' ? 'Skip recap' : 'Skip intro';
    } else skip.hidden = true;

    if (!this.tracked && d && t / d >= App.settings.threshold) { this.tracked = true; this.markWatched(); }
  },

  drawBuffer() {
    const v = this.video, d = this.dur();
    if (!d || !v.buffered.length) return;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 1) end = Math.max(end, v.buffered.end(i));
    $p('p-buf').style.width = `${(end / d) * 100}%`;
  },

  async markWatched() {
    const ep = this.ctx.episode;
    if (!this.ctx.remoteOnly && Jellyfin.connected()) Jellyfin.markPlayed(ep.Id).catch(() => {});
    ep.UserData = { ...(ep.UserData || {}), Played: true };
    // Library film/TV playback must never enter anime stats, lists, or social profiles.
    if(!this.ctx.remoteOnly&&!App.isAnime(this.ctx.series?.Id))return;
    // Local watch log for the profile's activity chart.
    try {
      const d = new Date(), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const log = (await window.native.get('watchLog')) || {};
      log[k] = (log[k] || 0) + 1;
      const cutoff = Date.now() - 400 * 86400000;
      for (const day of Object.keys(log)) if (Date.parse(day) < cutoff) delete log[day];
      window.native.set('watchLog', log);
    } catch { /* optional */ }
    const m = this.ctx.match;
    const label = $p('p-track');
    if (!this.ctx.remoteOnly) this.sendToTrakt(ep);
    if (!this.ctx.remoteOnly && !App.isAnime(this.ctx.series?.Id)) return;
    if (!App.settings.autoTrack || !Tracker.loggedIn() || !m?.id || (this.ctx.season?.IndexNumber === 0)) return;
    const num = this.ctx.movie ? 1 : this.ctx.remoteOnly ? Number(ep.IndexNumber) : relativeEpisodeNumber(ep, this.ctx.episodes);
    if (!num) return;
    try {
      const r = await Tracker.setProgress(m.id, num, this.ctx.movie ? (m.episodes || 1) : m.episodes);
      label.innerHTML = `<i></i>${Tracker.name} ✓`;
      label.title = this.ctx.movie ? 'Marked completed' : r.unchanged ? `Already at episode ${r.progress}` : `Updated to episode ${num}`;
      label.classList.add('ok');
      if (!r.unchanged) toast(this.ctx.movie ? 'Marked as completed' : `Episode ${num} watched`, 'good', `${Tracker.name} · ${m.title}`);
    } catch (e) {
      label.innerHTML = `<i></i>${Tracker.name} update failed`;
      label.classList.remove('ok');
      toast(`${Tracker.name} update failed: ${e.message}`, 'bad');
    }
  },

  usesTrakt() {
    if (this.ctx?.remoteOnly) return false;
    const anime = App.isAnime(this.ctx.series?.Id);
    return Trakt.loggedIn() && App.settings.traktTrack && (!anime || App.settings.traktAnime);
  },

  async sendToTrakt(ep) {
    if (!this.usesTrakt() || this.ctx.season?.IndexNumber === 0) return;
    const anime = App.isAnime(this.ctx.series?.Id);
    try {
      if (this.ctx.movie) await Trakt.markMovie(ep);
      else await Trakt.markEpisodes(this.ctx.series, [ep]);
      if (!anime) { const l = $p('p-track'); l.textContent = '✓ Trakt: marked watched'; l.classList.add('ok'); }
      toast(`Trakt: ${this.ctx.movie ? ep.Name : `${this.ctx.series.Name} ${epLabel(ep).split(' — ')[0]}`} marked watched`, 'good');
    } catch (e) { toast(`Trakt update failed: ${e.message}`, 'bad'); }
  },

  // Called when the Kitsu match finishes looking up after playback already started.
  setMatch(match) {
    if (!this.ctx) return;
    this.ctx.match = match;
    this.setTrackLabel();
    if (!this.segments.length) this.loadSegments();
  },

  setTrackLabel() {
    const l = $p('p-track'); l.classList.remove('ok');
    this.setTrackLabelText(l);
    l.title = l.textContent;
    const on = /^Tracking on/.test(l.textContent);
    l.classList.toggle('ok', on);
    l.innerHTML = l.textContent ? `<i></i>${on ? Tracker.name : /looking/.test(l.textContent) ? `${Tracker.name}…` : 'Not tracking'}` : '';
  },
  setTrackLabelText(l) {
    const m = this.ctx.match;
    if (!this.ctx.remoteOnly && !App.isAnime(this.ctx.series?.Id)) l.textContent = this.usesTrakt() ? 'Tracking on Trakt' : '';
    else if (!Tracker.loggedIn()) l.textContent = 'Not signed in to Kitsu or AniList';
    else if (m === undefined) l.textContent = 'Kitsu: looking up…';
    else if (!m?.id) l.textContent = this.ctx.movie ? 'Kitsu: no match for this movie' : 'Kitsu: no match for this season';
    else if (!App.settings.autoTrack) l.textContent = 'Tracking off';
    else l.textContent = `Tracking on ${Tracker.name}: ${m.title}`;
  },

  preloadNextEpisode() {
    const next = this.nextEpisode();
    if (!next || this.server === 'jellyfin' || this.el.hidden) return;
    const audio = this.ctx.audio || App.settings.showAudio?.[this.ctx.series?.Id] || (App.settings.audioLang === 'eng' ? 'dub' : 'sub');
    const key = JSON.stringify([this.ctx.series?.Id, next.Id, this.server, audio]);
    if (this.preloadKey === key && Date.now() - this.preloadAt < 120000) return;
    this.preloadKey = key;
    this.preloadAt = Date.now();
    // Resolution is speculative: it never attaches media or changes the current player's headers.
    this.resolveRemote(this.server, next, true).catch(err => console.warn('[Player] Next episode preload skipped:', err.message));
  },

  nextEpisode() {
    const list = this.ctx.episodes || [];
    const i = list.findIndex((e) => e.Id === this.ctx.episode.Id);
    const next = i >= 0 ? list[i + 1] : null;
    if (!next) return null;
    // Not out yet (announced in Jellyfin, a future air date, or at/after AniList's next airing): no next episode.
    const z = this.ctx.zip?.episodes?.[next.IndexNumber], air = Date.parse(next.PremiereDate || z?.airDate || '');
    if (next.LocationType === 'Virtual' || air > Date.now() + 3600000) return null;
    if (String(next.Id).startsWith('remote-') && this.ctx.al?.next && next.IndexNumber >= this.ctx.al.next.episode) return null;
    return next;
  },

  // "Up next" card: shows during the ending credits (or the last 20s), fills up, then plays the next episode.
  updateUpNext(t, d) {
    const card = $p('p-next');
    const next = this.nextEpisode();
    if (!next || !d || this.nextCancelled || d < 120) { card.hidden = true; return false; }
    const outro = this.segments.find((x) => x.type === 'outro' && x.start > d * 0.5);
    const start = outro ? outro.start : d - 20;
    if (t < start) { card.hidden = true; return false; }
    if (card.hidden || card.dataset.ep !== next.Id) {
      card.dataset.ep = next.Id;
      const img = next.ImageTags?.Primary ? Jellyfin.img(next.Id, 'Primary', { fillWidth: 320 }) : '';
      $p('p-next-img').src = img; $p('p-next-img').hidden = !img;
      $p('p-next-title').textContent = [next.IndexNumber != null ? `Episode ${next.IndexNumber}` : '', next.Name].filter(Boolean).join(' · ');
      $p('p-next-label').textContent = App.settings.autoNext ? 'Up next' : 'Next episode';
      card.hidden = false;
    }
    $p('p-next-bar').style.width = App.settings.autoNext ? `${Math.min(100, ((t - start) / Math.max(1, d - start)) * 100)}%` : '0';
    return true;
  },

  ended() {
    if (!this.tracked) { this.tracked = true; this.markWatched(); }
    const next = this.nextEpisode();
    if (next && App.settings.autoNext && !this.nextCancelled) this.playNext();
  },

  cancelNext() { clearInterval(this.nextTimer); this.nextTimer = null; this.nextCancelled = true; const c = $p('p-next'); if (c) c.hidden = true; },

  prevEpisode() {
    const list = this.ctx.episodes || [];
    const i = list.findIndex((e) => e.Id === this.ctx.episode.Id);
    return i > 0 ? list[i - 1] : null;
  },
  playPrev() {
    if ((this.casting?.time ?? this.video.currentTime) > 10) return this.seekTo(0); // like most players: first press restarts
    const prev = this.prevEpisode();
    if (!prev) return;
    this.report('stopped');
    this.load(prev);
  },

  playNext() {
    const next = this.nextEpisode();
    if (!next) return;
    this.report('stopped');
    this.load(next);
  },

  toggle() { if (this.casting) return Cast.command(this.casting.paused ? 'play' : 'pause'); const v = this.video; if (v.paused) v.play().catch(() => {}); else v.pause(); },
  seekBy(s) { this.seekTo((this.casting?.time ?? this.video.currentTime) + s); },
  seekTo(t) { if (this.casting) return Cast.command('seek', t); const d = this.dur(); this.video.currentTime = Math.max(0, d ? Math.min(t, d - 0.5) : t); },
  fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else this.el.requestFullscreen().catch(() => {}); },
  syncVol() {
    const v = this.video;
    $p('p-vol').value = v.muted ? 0 : v.volume;
    const muted = v.muted || v.volume === 0;
    $p('p-mute').innerHTML = muted
      ? '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.4V12zM19 12c0 .9-.2 1.8-.5 2.6l1.5 1.5A9 9 0 0 0 14 3.2v2.1A7 7 0 0 1 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.2c-.7.5-1.4.9-2.3 1.2v2.1a9 9 0 0 0 3.7-1.8L19.7 21 21 19.7l-9-9L4.3 3zM12 4 9.9 6.1 12 8.2V4z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  },

  reportPayload() {
    return {
      ItemId: this.item?.Id, MediaSourceId: this.source?.Id, PlaySessionId: this.playSessionId,
      PositionTicks: Math.floor((this.casting?.time ?? this.video.currentTime ?? 0) * TICKS), IsPaused: this.casting?.paused ?? this.video.paused,
      CanSeek: true, PlayMethod: this.playMethod || 'Transcode', AudioStreamIndex: this.audioIndex,
      SubtitleStreamIndex: this.subMode === 'off' ? -1 : this.subIndex,
    };
  },
  report(kind) { if (this.item) Jellyfin.report(kind, this.reportPayload()); },

  teardown() {
    if (typeof Cast !== 'undefined') Cast.onTeardown();
    this.loadSeq = (this.loadSeq || 0) + 1;
    clearInterval(this.stallTimer);
    clearInterval(this.reportTimer);
    if (this.item) { this.report('stopped'); Jellyfin.stopEncoding(this.playSessionId); }
    this.localSourceReady=false;this.casting = null; this.el.classList.remove('casting'); $p('p-tv-remote').hidden=true; this.castSource = null; this.castHeaders = null;
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    const v = this.video;
    if (v) { v.pause(); v.removeAttribute('src'); [...v.querySelectorAll('track')].forEach((t) => t.remove()); v.load(); }
    this.subTrack = null; this.clearSubs();
    if(this.subtitleBlob){URL.revokeObjectURL(this.subtitleBlob);this.subtitleBlob=null;}this.remoteSubtitles=[];this.remoteSubIndex=-1;
    this.item = null; this.source = null; this.duration = 0; this.remote = false;
    $p('p-skip').hidden = true; $p('p-marks').innerHTML = ''; $p('p-fill').style.width = '0'; $p('p-buf').style.width = '0';
  },

  close() {
    if (typeof Cast !== 'undefined') Cast.active = false;
    this.serverSeq++;
    this.preloadKey = null;
    window.native.cancelStreamResolution?.().catch(err => console.warn('Could not cancel stream resolution:', err.message));
    this.cancelNext();
    this.teardown();
    if (document.fullscreenElement) document.exitFullscreen();
    this.el.hidden = true;
    window.native.stopMediaRelay?.().catch(()=>{});
    App.markNav?.();
    const cb = this.onClose; this.onClose = null;
    if (cb) cb();
  },
};

function epLabel(ep) {
  if (ep.Type === 'Movie') return [ep.ProductionYear, 'Movie'].filter(Boolean).join(' · ');
  const s = ep.ParentIndexNumber, e = ep.IndexNumber;
  const code = s === 0 ? `Special ${e ?? ''}` : `${s != null ? `S${s} · ` : ''}E${e ?? '?'}`;
  return ep.Name ? `${code} — ${ep.Name}` : code;
}

// Episode number within the season (handles shows whose season 2 starts at episode 13).
function relativeEpisodeNumber(ep, seasonEpisodes) {
  if (ep.IndexNumber == null) return null;
  const nums = (seasonEpisodes || []).map((e) => e.IndexNumber).filter((n) => n != null && n > 0);
  const first = nums.length ? Math.min(...nums) : 1;
  return first > 1 ? ep.IndexNumber - first + 1 : ep.IndexNumber;
}
