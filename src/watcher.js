/* AniDeck watcher profiles: your profile page, AniDeck friends (opt-in, through AniDeck cloud) and comparing with them.
   A "watcher card" is a plain snapshot of the stats (built from your AniList / Kitsu list); the same drawing code shows
   yours and a friend's. Only AniDeck users who join with a handle are visible, and only to friends unless they choose. */
'use strict';

// Milestones: [id, icon, name, what it takes, how many, which metric]
const MILESTONES = [
  ['first-steps', 'spark', 'First steps', 'Finish your first show', 1, 'completed'],
  ['completionist', 'checkCircle', 'Completionist', 'Finish 25 shows', 25, 'completed'],
  ['centurion', 'play', 'Centurion', 'Watch 100 episodes', 100, 'eps'],
  ['thousand-club', 'video', 'Thousand club', 'Watch 1,000 episodes', 1000, 'eps'],
  ['marathoner', 'clock', 'Marathoner', 'Watch 12 episodes in one day', 12, 'maxDay'],
  ['streak-keeper', 'calendar', 'Streak keeper', 'Watch 7 days in a row', 7, 'longest'],
  ['explorer', 'grid', 'Explorer', '3+ shows in each of 6 genres', 6, 'genres3'],
  ['critic', 'heart', 'Critic', 'Rate 20 shows', 20, 'rated'],
  ['long-haul', 'bookmark', 'Long haul', 'Reach episode 100 of one show', 100, 'maxProgress'],
  ['time-traveller', 'rewind', 'Time traveller', 'Watch a show from before 2000', 1, 'oldies'],
];
const RANKS = [[1, 'Fresh recruit'], [3, 'Weekend watcher'], [6, 'Seasoned viewer'], [10, 'Binge veteran'], [15, 'Sakuga sage'], [20, 'Legend of the shelf']];
const STATUS_CARDS = [['Watching', '#5ad19a', 'current'], ['Planning', '#6aa8ff', 'planned'], ['Completed', 'var(--accent)', 'completed'], ['Paused', '#ffbf5a', 'on_hold'], ['Dropped', '#ff6b7a', 'dropped']];
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const showKey = (a) => titleKey(a.canonical || a.title || '');

/* ---------------- the card: everything the profile shows, as plain data ---------------- */
function watcherCard(st, entries, act, who = {}) {
  const eps = st?.episodes || entries.reduce((n, e) => n + (e.progress || 0), 0), seconds = st?.seconds || eps * 24 * 60;
  const level = Math.floor(Math.sqrt(eps / 5)) + 1, lo = 5 * (level - 1) ** 2, hi = 5 * level ** 2;
  const c = st?.counts || {}, counts = [c.current || 0, c.planned || 0, c.completed || 0, c.on_hold || 0, c.dropped || 0];
  // habits
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const val = (d) => act[dayKey(d)] || 0;
  let streak = 0; { const d = new Date(today); if (!val(d)) d.setDate(d.getDate() - 1); while (val(d)) { streak++; d.setDate(d.getDate() - 1); } }
  const days = Object.keys(act).filter((k) => act[k] > 0).sort();
  let longest = 0, run = 0, prev = null;
  for (const k of days) { const t = Date.parse(k); run = prev != null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = t; }
  const best = days.reduce((b, k) => (act[k] > (act[b] || 0) ? k : b), days[0]);
  const perDay = days.length ? days.reduce((n, k) => n + act[k], 0) / days.length : 0;
  // taste
  const gw = new Map();
  for (const e of entries) for (const g of e.anime.genres || []) gw.set(g, (gw.get(g) || 0) + Math.max(1, e.progress || 0));
  const allGenres = [...gw].sort((a, b) => b[1] - a[1]);
  // scores
  const rated = entries.filter((e) => e.rating);
  const scores = Array.from({ length: 10 }, (_, i) => { const l = rated.filter((e) => Math.round(Number(e.rating)) === i + 1); return { n: l.length, covers: l.slice(0, 5).map((e) => e.anime.poster || ''), titles: l.slice(0, 8).map((e) => e.anime.title) }; });
  const both = rated.filter((e) => e.anime.rating);
  const gaps = both.map((e) => ({ t: e.anime.title, p: e.anime.poster || '', s: Number(e.rating), c: e.anime.rating / 10, d: Number(e.rating) - e.anime.rating / 10 }));
  // eras and formats
  const decades = new Map(), formats = new Map();
  for (const e of entries) { const y = Number(e.anime.year); if (y) { const d = `${Math.floor(y / 10) * 10}s`; decades.set(d, (decades.get(d) || 0) + 1); } const f = e.anime.subtype || 'Other'; formats.set(f, (formats.get(f) || 0) + 1); }
  // activity: the last 26 weeks only
  const from = new Date(today); from.setDate(from.getDate() - today.getDay() - 25 * 7);
  const activity = Object.fromEntries(Object.entries(act).filter(([k, n]) => n > 0 && Date.parse(k) >= +from - 86400000));
  const metrics = {
    completed: counts[2], eps, maxDay: days.length ? Math.max(...days.map((k) => act[k])) : 0, longest,
    genres3: [...gw.keys()].filter((g) => entries.filter((e) => (e.anime.genres || []).includes(g)).length >= 3).length,
    rated: rated.length, maxProgress: Math.max(0, ...entries.map((e) => e.progress || 0)), oldies: entries.filter((e) => Number(e.anime.year) && Number(e.anime.year) < 2000 && e.progress).length,
  };
  return {
    v: 1, at: Date.now(), name: who.name || '', avatar: who.avatar || '', tracker: who.tracker || '',
    eps, seconds, level, frac: Math.min(1, (eps - lo) / Math.max(1, hi - lo)), next: hi - eps, rank: [...RANKS].reverse().find(([n]) => level >= n)[1],
    counts, total: counts.reduce((a, b) => a + b, 0) || entries.length,
    habits: { streak, longest, best: best ? [best, act[best]] : null, perDay },
    genres: allGenres.slice(0, 12),
    watchedGenres: (()=>{const weights=new Map();for(const e of entries){const progress=Math.max(0,Number(e.progress)||0);if(progress)for(const genre of e.anime.genres||[])weights.set(genre,(weights.get(genre)||0)+progress);}return [...weights].sort((a,b)=>b[1]-a[1]).slice(0,3);})(),
    scores, mean: rated.length ? rated.reduce((s, e) => s + Number(e.rating), 0) / rated.length : 0,
    gap: gaps.length ? gaps.reduce((s, g) => s + g.d, 0) / gaps.length : null,
    kind: [...gaps].sort((a, b) => b.d - a.d).filter((g) => g.d > 0.5).slice(0, 2), harsh: [...gaps].sort((a, b) => a.d - b.d).filter((g) => g.d < -0.5).slice(0, 2),
    decades: [...decades].sort((a, b) => a[0].localeCompare(b[0])), formats: [...formats].sort((a, b) => b[1] - a[1]), listSize: entries.length,
    ...(() => {
      const dated = entries.filter((e) => Number(e.anime.year)).map((e) => ({ t: e.anime.title, p: e.anime.poster || '', y: Number(e.anime.year), s: Number(e.rating) || 0, pr: e.progress || 0 }));
      const topDec = [...decades].sort((a, b) => b[1] - a[1])[0]?.[0];
      const inTop = dated.filter((x) => topDec && `${Math.floor(x.y / 10) * 10}s` === topDec).sort((a, b) => b.s - a.s || b.pr - a.pr).slice(0, 6);
      const byYear = [...dated].sort((a, b) => a.y - b.y);
      return { eraPicks: inTop.map(({ t, p, y }) => ({ t, p, y })), oldest: byYear[0] ? { t: byYear[0].t, p: byYear[0].p, y: byYear[0].y } : null, newest: byYear.at(-1) ? { t: byYear.at(-1).t, p: byYear.at(-1).p, y: byYear.at(-1).y } : null };
    })(),
    watching: entries.filter((e) => e.status === 'current').slice(0, 10).map((e) => ({ id: e.anime.id, t: e.anime.title, p: e.anime.poster || '', pr: e.progress || 0, ep: e.anime.episodes || 0, titles: (e.anime.titles || []).slice(0, 4) })),
    metrics, badges: MILESTONES.filter(([, , , , need, m]) => metrics[m] >= need).map(([id]) => id), activity,
    // for comparing with friends: what's on the list and how it was scored
    shows: entries.slice(0, 450).map((e) => ({ k: showKey(e.anime), id: e.anime.id, t: e.anime.title, p: e.anime.poster || '', s: e.rating ? Number(e.rating) : 0, st: e.status, pr: e.progress || 0, ep: e.anime.episodes || 0, titles: (e.anime.titles || []).slice(0, 3) })),
  };
}

/* ---------------- page markup (yours, or a friend's) ---------------- */
function profileMarkup({ self = true, handle = '' } = {}) {
  const card = (id, title, sub, body, cls = '') => `<section class="pf2-card ${cls} pf-in" id="${id}"><header><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div></header>${body}</section>`;
  const acts = self
    ? `<button class="btn ghost ad2-btn" data-act="friendsOpen">${icon('chat')}Social</button><button class="btn ghost ad2-btn" data-act="ad-route" data-view="review">${icon('spark')}Season in review</button><button class="btn ghost ad2-btn" data-act="wfSettings">${icon('settings')}Profile privacy</button>`
    : `<button class="btn ghost ad2-btn" data-act="profileNav">${icon('arrowLeft')}Your profile</button><button class="btn ghost ad2-btn" id="wf-friend-btn" hidden></button>`;
  return `<div class="page profile pf2 ${self ? '' : 'pf2-peer-profile'}">
    <section class="pf2-hero pf3-hero pf-in" style="--d:0ms"><div id="pf-banner" class="profile-cover" hidden></div>
      <header class="pf3-topline">${self?`<button class="btn primary" data-act="aniEdit">${icon('pencil')}Customize profile</button>`:''}</header>
      <div class="pf2-id" ${self?'':'tabindex="0" aria-label="Profile actions: press Shift+F10"'}>
        <div class="pf2-ava"><svg class="pf2-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55"/><circle class="pf2-ring-fill" id="pf2-ring" cx="60" cy="60" r="55" stroke-dasharray="0 400"/></svg>
          <span class="avatar xl" id="pf-avatar">${icon('user', 'pf-ph')}${self && Tracker.avatar ? `<img src="${esc(Tracker.avatar)}" alt="">` : ''}</span><span class="pf2-lvl" id="pf2-lvl">Lv 1</span></div>
        <div class="pf2-who"><span class="pf2-rank" id="pf2-rank">${self ? 'Fresh recruit' : '&nbsp;'}</span><h1 id="pf-name">${esc(self ? Tracker.userName || '' : handle ? `@${handle}` : '')}</h1><span class="pf2-handle" id="pf2-handle" ${self?'hidden':''}>${self?'':'@'+esc(handle)}</span>
          <div class="pf2-xp"><i><b id="pf2-xp"></b></i><small id="pf2-xp-t">&nbsp;</small></div></div>
      </div>
      <div class="pf3-story"><div id="pf3-snapshot" class="pf3-snapshot" hidden></div></div>
      <div class="pf2-time"><span class="pf2-eyebrow">Time watched</span><div class="pf-days"><b id="pf-days">0.0</b><span>days</span></div><p class="pf-sub" id="pf-sub">&nbsp;</p></div>
      <footer class="pf3-footer"><span class="pf3-footer-note">${icon('deck')}${self?'Your taste. Your pace. Your deck.':'A little of what makes their deck.'}</span><div class="pf2-hero-acts">${acts}</div></footer>
    </section>
    <div class="profile-personal">
    <section class="profile-about-card" id="pf-about" hidden><div class="profile-about-body"><header><div><span class="ad-eyebrow">BEHIND THE WATCHER CARD</span><h2 id="pf-about-title">About me</h2></div>${self?'<button class="btn ghost sm" data-act="aniEdit">Edit introduction</button>':''}</header><div id="pf-bio" class="profile-rich-text"></div></div><aside id="pf-timezone" class="profile-timezone" hidden></aside></section>
    <section id="pf-favorites" class="pf-favorites" hidden></section>
    </div>
    ${self ? '<section class="pf2-social pf-in" id="pf2-social" style="--d:60ms" hidden></section>' : '<section class="pf2-compare pf-in" id="pf2-compare" style="--d:60ms" hidden></section>'}
    <section class="pf2-habits pf-in" style="--d:80ms" id="pf2-habits">${['Current streak', 'Longest streak', 'Best day', 'Per active day'].map((l) => `<div><b>–</b><span>${l}</span></div>`).join('')}</section>
    <div class="pf2-grid">
      ${card('pf2-taste', 'Taste fingerprint', 'The genres they keep coming back to'.replace('they', self ? 'you' : 'they'), '<div class="pf2-radar" id="pf2-radar"></div>', 'pf2-span2')}
      ${card('pf2-list', self ? 'Your list' : 'Their list', '<span id="pf2-list-total">0</span> titles'+(self?' · Open a status to explore':' · A look at their list'), '<div class="pf2-hand" id="pf2-hand"></div>')}
      ${card('pf2-score', self ? 'How you score' : 'How they score', `Every show ${self ? 'you’ve' : 'they’ve'} rated, piled by score`, '<div class="pf2-axis"><button class="link-btn" id="pf-score-browse">Browse ratings →</button></div><div class="pf2-stacks" id="pf2-hist"></div><p class="pf2-note" id="pf2-score-note">&nbsp;</p><div class="pf2-calls" id="pf2-calls"></div>')}
      ${card('pf2-erascard', 'Eras & formats', `When ${self ? 'your' : 'their'} shows are from, and what kind`, '<div class="pf2-eras" id="pf2-eras"></div><div class="pf2-formats" id="pf2-formats"></div>')}
      ${card('pf2-now', 'Watching now', '', '<div class="pf2-now" id="pf2-nowlist"></div>', 'pf2-span2')}
      ${card('pf2-badges', 'Milestones', '<span id="pf2-badge-count">0</span> unlocked', '<div class="pf2-badges" id="pf2-badgelist"></div>', 'pf2-span2')}
      ${card('pf2-act', 'Activity', '<span id="pf-streak">Last 26 weeks</span>', '<div class="pf2-months" id="pf2-months"></div><div class="pf-heat pf2-heat" id="pf-heat"></div><div class="pf2-legend"><span>Less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>More</span></div>', 'pf2-span2')}
    </div>
  </div>`;
}

/* ---------------- drawing a card ---------------- */
function countUp(el, to, decimals = 0, ms = 1300) {
  if (!el) return;
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = decimals ? (to * e).toFixed(decimals) : Math.round(to * e).toLocaleString(); if (k < 1 && document.body.contains(el)) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function drawHand(vals, total, self = true) {
  const box=$('#pf2-hand');if(!box)return;
  box.innerHTML=STATUS_CARDS.map(([label,color,tab],i)=>{const count=vals[i]||0,pct=total?Math.round(count/total*100):0;
    const tag=self?'button':'div';
    return `<${tag} ${self?`type="button" data-act="listTab" data-tab="${tab}"`:''} class="pf2-pcard ${count?'':'empty'}" style="--col:${color};--fill:${pct}%;--i:${i};--tilt:${(i-2)*.75}deg" ${self?`aria-label="${label}: ${count} titles, ${pct}% of your list"`:''}><span class="pf2-pcard-fill"></span><span class="pf2-pcard-top"><i></i>${label}</span><b>${count}</b><small>${pct}% <span>of list</span></small>${self?`<span class="pf3-card-open" aria-hidden="true">${icon('arrowRight')}</span>`:''}</${tag}>`;
  }).join('');
}
function profileHeroSnapshot(cd,{self=true}={}){
  const genres=(cd.watchedGenres||cd.genres||[]).slice(0,3),label=cd.watchedGenres?'Most watched genres':'Top genres';
  const tags=`<div class="pf3-genre-group"><span class="ad-eyebrow">${label}</span>${genres.length?`<div class="pf3-genre-notes" aria-label="${label}">${genres.map(([name])=>`<span>${esc(name)}</span>`).join('')}</div>`:`<p>${self?'Log episodes to discover your most watched genres.':'No watched genres shared yet.'}</p>`}</div>`;
  if(!cd.metrics)return tags+'<div class="pf3-milestone pf3-milestone-private"><span class="ad-eyebrow">Milestones</span><p>Progress appears with a shared watcher card.</p></div>';
  const progress=MILESTONES.map(([id,glyph,name,description,need,metric])=>({id,glyph,name,description,need,have:Math.max(0,Number(cd.metrics[metric])||0)})),next=progress.filter(m=>m.have<m.need).sort((a,b)=>b.have/b.need-a.have/a.need)[0],earned=progress.filter(m=>m.have>=m.need).length;
  const milestone=next?`<button class="pf3-milestone" data-act="pfMilestones" aria-label="${esc(next.name)}: ${next.have} of ${next.need}. View milestones"><span class="pf3-milestone-mark">${icon(next.glyph)}</span><span class="pf3-milestone-copy"><small>${self?'NEXT MILESTONE':'MILESTONE IN REACH'}</small><b>${esc(next.name)}</b><span>${esc(next.description)}</span><span class="pf3-milestone-progress"><i><em style="width:${Math.min(100,next.have/next.need*100)}%"></em></i><small>${next.have} / ${next.need}</small></span></span>${icon('chev')}</button>`:`<button class="pf3-milestone" data-act="pfMilestones"><span class="pf3-milestone-mark">${icon('spark')}</span><span class="pf3-milestone-copy"><small>THE MILESTONE COLLECTION</small><b>${earned} milestones unlocked</b><span>Explore the achievements on this profile.</span></span>${icon('chev')}</button>`;
  return tags+milestone;
}
function paintProfileIdentity(user,{self=true}={}){
  ProfilePresentation.paint(user,{self});const handle=$('#pf2-handle');
  if(handle){handle.textContent=user?.handle?'@'+user.handle:'';handle.hidden=!user?.handle;}
  const name=$('#pf-name');if(name&&user?.name)name.textContent=user.name;
}
function radarSvg(series, labels) {
  // series: [{ values: [0..1], cls }]
  const n = labels.length, cx = 150, cy = 130, r = 96, pt = (i, k) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]; };
  const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${labels.map((_, i) => pt(i, k).join(',')).join(' ')}" class="pf2-r-grid"/>`).join('');
  const axes = labels.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" class="pf2-r-axis"/>`).join('');
  const shapes = series.map(({ values, cls }) => `<polygon points="${values.map((v, i) => pt(i, Math.max(0.1, v)).join(',')).join(' ')}" class="pf2-r-shape ${cls || ''}"/>${values.map((v, i) => { const [x, y] = pt(i, Math.max(0.1, v)); return `<circle cx="${x}" cy="${y}" r="3.5" class="pf2-r-dot ${cls || ''}"/>`; }).join('')}`).join('');
  const text = labels.map((g, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'}" dominant-baseline="middle">${esc(g)}</text>`; }).join('');
  return `<svg viewBox="0 0 300 260">${rings}${axes}${shapes}${text}</svg>`;
}
function paintProfile(cd, { self = true, rarity = null } = {}) {
  const you = self ? 'you' : 'they', your = self ? 'your' : 'their';
  const snapshot=$('#pf3-snapshot');if(snapshot){snapshot.innerHTML=profileHeroSnapshot(cd,{self});snapshot.hidden=false;}
  if (cd.avatar && !$('#pf-avatar img')) $('#pf-avatar').insertAdjacentHTML('beforeend', `<img src="${esc(cd.avatar)}" alt="">`);
  if (cd.name) $('#pf-name').textContent = cd.name;
  $('#pf2-lvl').textContent = `Lv ${cd.level}`;
  $('#pf2-rank').textContent = cd.rank;
  $('#pf2-xp').style.width = `${Math.round(cd.frac * 100)}%`;
  $('#pf2-xp-t').textContent = `${Math.max(0, cd.next).toLocaleString()} episodes to level ${cd.level + 1}`;
  requestAnimationFrame(() => { const r = $('#pf2-ring'); if (r) r.setAttribute('stroke-dasharray', `${(cd.frac * 2 * Math.PI * 55).toFixed(1)} 400`); });
  countUp($('#pf-days'), cd.seconds / 86400, 1);
  const hours = Math.round(cd.seconds / 3600);
  $('#pf-sub').textContent = `${hours.toLocaleString()} hours · ${cd.eps.toLocaleString()} episodes`;
  $('#pf-sub').classList.add('show');
  // list
  requestAnimationFrame(() => drawHand(cd.counts, cd.total, self)); countUp($('#pf2-list-total'), cd.total);
  // habits
  const h = cd.habits;
  $('#pf2-habits').innerHTML = [[`${h.streak}`, 'day current streak'], [`${h.longest}`, 'day longest streak'], [h.best ? `${h.best[1]}` : '–', h.best ? `episodes on ${new Date(h.best[0] + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'best day'], [h.perDay ? h.perDay.toFixed(1) : '–', 'episodes per active day']]
    .map(([v, l], i) => `<div style="--i:${i}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  // taste
  const top = cd.genres.slice(0, 6), gmax = Math.max(1, ...top.map((x) => x[1]));
  $('#pf2-radar').innerHTML = top.length >= 3 ? `${radarSvg([{ values: top.map(([, w]) => w / gmax) }], top.map(([g]) => g))}
    <ol class="pf2-r-list">${top.map(([g, w], i) => `<li style="--i:${i}"><span>${esc(g)}</span><i><b style="width:${Math.round(w / gmax * 100)}%"></b></i><small>${w.toLocaleString()} eps</small></li>`).join('')}</ol>`
    : `<p class="pf2-note">A few more shows and ${your} fingerprint takes shape here.</p>`;
  // scores
  $('#pf2-hist').innerHTML = cd.scores.map((sc, i) => `<button type="button" data-score="${i+1}" aria-label="Score ${i+1}: ${sc.n} rated titles" class="pf2-stack ${sc.n ? '' : 'zero'}" style="--i:${i}" title="${sc.n ? sc.titles.map(esc).join('&#10;') : `Nothing rated ${i + 1}`}"><div class="pf2-pile">${sc.covers.map((p, j) => `<span style="--j:${j}">${p ? `<img src="${esc(p)}" alt="" loading="lazy">` : ''}</span>`).join('')}${sc.n > 5 ? `<em>+${sc.n - 5}</em>` : ''}</div><b>${i + 1}</b><small>${sc.n ? `${sc.n} show${sc.n === 1 ? '' : 's'}` : ''}</small></button>`).join('');
  $('#pf-score-browse').onclick=()=>ProfileRatings.open(cd);
  $('#pf2-hist').onclick=event=>{const button=event.target.closest('[data-score]');if(button)ProfileRatings.open(cd,Number(button.dataset.score));};
  const rated = cd.scores.reduce((n, s) => n + s.n, 0);
  $('#pf2-score-note').innerHTML = !rated ? `Rate a few shows and ${your} piles appear here.`
    : `Average score <b>${cd.mean.toFixed(1)}</b>${cd.gap == null ? '' : ` · ${Math.abs(cd.gap) < 0.2 ? `${you} score <b>right in line with</b> AniList’s community` : `${you} score shows <b>${Math.abs(cd.gap).toFixed(1)} ${cd.gap > 0 ? 'higher' : 'lower'}</b> than AniList’s community does`}`}`;
  const call = (g, kind) => `<div class="pf2-call ${kind}">${g.p ? `<img src="${esc(g.p)}" alt="">` : '<span></span>'}<span><b>${esc(g.t)}</b><small>${kind === 'kind' ? `${self ? 'You' : 'They'} loved it more` : `${self ? 'You' : 'They'} weren’t sold`}</small></span><span class="pf2-call-nums"><b>${g.s}</b><small>vs ${g.c.toFixed(1)}</small></span></div>`;
  const calls = [...cd.kind.map((g) => call(g, 'kind')), ...cd.harsh.map((g) => call(g, 'harsh'))];
  $('#pf2-calls').innerHTML = calls.length ? `<span class="pf2-calls-h">Biggest disagreements with the community</span>${calls.join('')}` : '';
  // eras
  const dmax = Math.max(1, ...cd.decades.map((x) => x[1])), topDec = [...cd.decades].sort((a, b) => b[1] - a[1])[0];
  $('#pf2-eras').innerHTML = cd.decades.length ? `<div class="pf2-tl">${cd.decades.map(([d, n], i) => `<div class="pf2-tl-node ${topDec && d === topDec[0] ? 'top' : ''}" style="--s:${(0.45 + 0.55 * n / dmax).toFixed(2)};--i:${i}"><i></i><b>${esc(d)}</b><small>${n} title${n === 1 ? '' : 's'}</small></div>`).join('')}</div>${topDec ? `<p class="pf2-note">${self ? 'Your' : 'Their'} era: <b>the ${esc(topDec[0])}</b>, with ${Math.round(topDec[1] / Math.max(1, cd.listSize) * 100)}% of the list</p>` : ''}` : '<p class="pf2-note">No release years yet.</p>';
  const end = (x, label) => (x ? `<div class="pf2-end">${x.p ? `<img src="${esc(x.p)}" alt="" loading="lazy">` : '<span></span>'}<span><small>${label}</small><b>${esc(x.t)}</b><em>${x.y}</em></span></div>` : '');
  if (cd.decades.length) $('#pf2-eras').insertAdjacentHTML('beforeend', `${cd.oldest || cd.newest ? `<div class="pf2-ends">${end(cd.oldest, 'Oldest on the list')}${cd.newest && cd.newest.t !== cd.oldest?.t ? end(cd.newest, 'Newest on the list') : ''}</div>` : ''}
    ${cd.eraPicks?.length ? `<div class="pf2-era-picks"><span>Top of the ${esc(topDec[0])}</span><div>${cd.eraPicks.map((x, i) => `<i style="--i:${i}" title="${esc(x.t)} (${x.y})">${x.p ? `<img src="${esc(x.p)}" alt="" loading="lazy">` : ''}</i>`).join('')}</div></div>` : ''}`);
  // formats as one proportional bar, with a key
  const ftot = cd.formats.reduce((n, [, c]) => n + c, 0) || 1, fcol = ['var(--accent)', '#ff8fc7', '#6aa8ff', '#5ad19a', '#ffbf5a', '#8c899c'];
  $('#pf2-formats').innerHTML = cd.formats.length ? `<div class="pf2-fbar">${cd.formats.map(([f, n], i) => `<i style="--w:${(n / ftot * 100).toFixed(1)}%;--c:${fcol[i % fcol.length]}" title="${esc(f)}: ${n}"></i>`).join('')}</div>
    <div class="pf2-fkey">${cd.formats.map(([f, n], i) => `<span><i style="--c:${fcol[i % fcol.length]}"></i>${esc(f)} <b>${n}</b><small>${Math.round(n / ftot * 100)}%</small></span>`).join('')}</div>` : '';
  // watching now
  $('#pf2-nowlist').innerHTML = cd.watching.length ? cd.watching.map((w, i) => { const k = w.ep ? Math.min(1, w.pr / w.ep) : 0; return `<button class="pf2-wcard" data-act="anime" data-id="${esc(w.id)}" data-titles="${esc(JSON.stringify(w.titles || []))}" style="--i:${i}" title="${esc(w.t)}">
    <span class="pf2-wcard-art">${w.p ? `<img src="${esc(w.p)}" alt="" loading="lazy">` : ''}<span class="pf2-wcard-go">${icon(self ? 'play' : 'info', self ? 'fill' : '')}</span><i><b style="width:${Math.round(k * 100)}%"></b></i></span><b>${esc(w.t)}</b><small>Ep ${w.pr}${w.ep ? ` of ${w.ep}` : ''}</small></button>`; }).join('')
    : `<p class="pf2-note">Nothing in Watching right now.</p>`;
  // milestones (with how many AniDeck watchers have each, when AniDeck cloud is on)
  const unlocked = MILESTONES.filter(([id]) => cd.badges.includes(id)).length;
  $('#pf2-badge-count').textContent = `${unlocked} of ${MILESTONES.length}`;
  $('#pf2-badgelist').innerHTML = MILESTONES.map(([id, ic, name, desc, need, m], i) => {
    const have = cd.metrics?.[m] || 0, done = cd.badges.includes(id), k = Math.min(1, have / need);
    const share = rarity?.total ? (rarity.counts[id] || 0) / rarity.total : null;
    const rare = share == null ? '' : `<span class="pf2-tcard-rare ${share < 0.05 ? 'rare' : ''}">${done && (rarity.counts[id] || 0) <= 1 ? 'Only you so far' : `${share < 0.01 && share > 0 ? '<1' : Math.round(share * 100)}% of AniDeck watchers`}${share < 0.05 && (rarity.counts[id] || 0) > 1 ? ' · Rare' : ''}</span>`;
    return `<div class="pf2-tcard ${done ? 'done' : ''}" style="--i:${i}" title="${esc(desc)}"><span class="pf2-tcard-ic">${icon(ic, ic === 'play' ? 'fill' : '')}</span><b>${esc(name)}</b><small>${esc(desc)}</small>${rare}${done ? '<span class="pf2-tcard-stamp">Unlocked</span>' : `<span class="pf2-tcard-prog"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle class="f" cx="18" cy="18" r="15" stroke-dasharray="${(k * 94.2).toFixed(1)} 100"/></svg><em>${Math.min(have, need).toLocaleString()}/${need.toLocaleString()}</em></span>`}</div>`;
  }).join('');
  // activity
  const act = cd.activity || {}, today = new Date(); today.setHours(0, 0, 0, 0);
  const W = 26, start = new Date(today); start.setDate(start.getDate() - today.getDay() - (W - 1) * 7);
  const max = Math.max(1, ...Object.values(act));
  let cells = '', months = '';
  for (let w = 0; w < W; w++) {
    let col = '';
    const first = new Date(start); first.setDate(start.getDate() + w * 7);
    months += `<span>${first.getDate() <= 7 ? esc(first.toLocaleDateString(undefined, { month: 'short' })) : ''}</span>`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + w * 7 + i);
      if (d > today) { col += '<i class="future"></i>'; continue; }
      const n = act[dayKey(d)] || 0, lvl = !n ? 0 : n >= max * 0.75 ? 4 : n >= max * 0.5 ? 3 : n >= max * 0.25 ? 2 : 1;
      col += `<i class="l${lvl}" style="--i:${w}" title="${d.toLocaleDateString()} · ${n} episode${n === 1 ? '' : 's'}"></i>`;
    }
    cells += `<div class="pf-week">${col}</div>`;
  }
  $('#pf2-months').innerHTML = months;
  $('#pf-heat').innerHTML = cells;
  $('#pf-streak').textContent = `Last 26 weeks · ${Object.keys(act).filter((k) => Date.parse(k) >= +start).length} active days`;
}

/* ---------------- comparing two cards ---------------- */
function compareCards(mine, theirs, name) {
  // taste match: how alike the two genre mixes are (cosine similarity of episodes-per-genre)
  const gm = new Map(mine.genres), gt = new Map(theirs.genres), keys = [...new Set([...gm.keys(), ...gt.keys()])];
  const dot = keys.reduce((s, k) => s + (gm.get(k) || 0) * (gt.get(k) || 0), 0), na = Math.hypot(...keys.map((k) => gm.get(k) || 0)), nb = Math.hypot(...keys.map((k) => gt.get(k) || 0));
  const match = na && nb ? Math.round(dot / (na * nb) * 100) : 0;
  const sumM = [...gm.values()].reduce((a, b) => a + b, 0) || 1, sumT = [...gt.values()].reduce((a, b) => a + b, 0) || 1;
  const axes = keys.map((k) => [k, (gm.get(k) || 0) / sumM + (gt.get(k) || 0) / sumT]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const peak = Math.max(...axes.map((k) => Math.max((gm.get(k) || 0) / sumM, (gt.get(k) || 0) / sumT)), 0.0001);
  // shows on both lists, and their favourites you don't have
  const mineBy = new Map(); for (const s of mine.shows) { mineBy.set(String(s.id), s); if (s.k) mineBy.set(`k:${s.k}`, s); }
  const findMine = (s) => mineBy.get(String(s.id)) || (s.k && mineBy.get(`k:${s.k}`));
  const shared = theirs.shows.map((s) => [s, findMine(s)]).filter(([, m]) => m);
  const bothRated = shared.filter(([s, m]) => s.s && m.s).sort((a, b) => (b[0].s + b[1].s) - (a[0].s + a[1].s));
  const agree = bothRated.length ? Math.round(bothRated.filter(([s, m]) => Math.abs(s.s - m.s) <= 1).length / bothRated.length * 100) : null;
  const picks = theirs.shows.filter((s) => s.s >= 8 && !findMine(s)).sort((a, b) => b.s - a.s).slice(0, 8);
  const canAdd = (s) => Tracker.name==='AniDeck'||(Tracker.svc === AniList ? String(s.id).startsWith('al:') : /^\d+$/.test(String(s.id)));
  const ring = `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="f" cx="60" cy="60" r="52" stroke-dasharray="${(match / 100 * 326.7).toFixed(1)} 400"/></svg>`;
  return `<div class="pf2-cmp-head"><div class="pf2-cmp-ring">${ring}<b>${match}%</b><small>taste match</small></div>
      <div class="pf2-cmp-sum"><h3>You and ${esc(name)}</h3><p>${match >= 80 ? 'Practically the same watchlist brain.' : match >= 60 ? 'A lot in common, with a few detours.' : match >= 35 ? 'Some overlap, plenty to swap.' : 'Different tastes. Great for recommendations.'}</p>
        <div class="pf2-cmp-stats"><span><b>${shared.length}</b> shows in common</span>${agree != null ? `<span><b>${agree}%</b> scored within a point</span>` : ''}<span><b>Lv ${mine.level}</b> you · <b>Lv ${theirs.level}</b> them</span></div></div>
      <div class="pf2-cmp-radar">${axes.length >= 3 ? radarSvg([{ values: axes.map((k) => (gt.get(k) || 0) / sumT / peak), cls: 'them' }, { values: axes.map((k) => (gm.get(k) || 0) / sumM / peak), cls: 'me' }], axes) : ''}<div class="pf2-cmp-key"><span class="me"><i></i>You</span><span class="them"><i></i>${esc(name)}</span></div></div></div>
    ${bothRated.length ? `<div class="pf2-cmp-block"><h4>You both rated</h4><div class="pf2-cmp-rows">${bothRated.slice(0, 8).map(([s, m]) => `<button class="pf2-cmp-row" data-act="anime" data-id="${esc(m.id)}" data-titles="${esc(JSON.stringify(m.titles || []))}">${m.p ? `<img src="${esc(m.p)}" alt="">` : '<span></span>'}<b>${esc(m.t)}</b><span class="pf2-cmp-scores"><i class="me">${m.s}</i><i class="them">${s.s}</i></span></button>`).join('')}</div></div>` : ''}
    ${picks.length ? `<div class="pf2-cmp-block"><h4>${esc(name)} loved these, and they’re not on your list</h4><div class="pf2-cmp-picks">${picks.map((s) => `<div class="pf2-cmp-pick"><button class="pf2-cmp-art" data-act="anime" data-id="${esc(s.id)}" data-titles="${esc(JSON.stringify(s.titles || []))}">${s.p ? `<img src="${esc(s.p)}" alt="" loading="lazy">` : ''}<em>★ ${s.s}</em></button><b>${esc(s.t)}</b>${canAdd(s) ? `<button class="link-btn" data-act="wfPlan" data-id="${esc(s.id)}">${icon('plus')}Planning</button>` : ''}</div>`).join('')}</div></div>` : ''}`;
}

/* ---------------- AniDeck cloud ---------------- */
const Cloud = {
  session: null, who: '', me: undefined, publishedAt: 0, rarity: null, rarityAt: 0,
  identity:null,
  async init(){if(this.identity)return;const saved=await window.native.get('anideckSocialOwner').catch(()=>null),session=await window.native.getSecret('anideckCloud').catch(()=>null);const valid=id=>/^(anilist|kitsu):[1-9][0-9]*$/.test(id||'')||/^anideck:[a-f0-9]{64}$/.test(id||'');const choice=valid(saved)?saved:valid(session?.who)?session.who:this.ident();if(valid(choice)){this.identity=choice;await window.native.set('anideckSocialOwner',choice);}},
  service(){const provider=this.identity?.split(':')[0];return provider==='anideck'?LocalTracker:provider==='anilist'?AniList:provider==='kitsu'?Kitsu:Tracker.svc;},
  provider(){return this.identity?.split(':')[0]||(Tracker.name==='AniDeck'?'anideck':Tracker.svc===AniList?'anilist':'kitsu');},
  async useLocalIdentity(){this.identity='anideck:'+LocalTracker.userId;this.session=null;this.me=undefined;this.who='';await window.native.set('anideckSocialOwner',this.identity);},
  base() { return String(App.config?.cloudUrl || '').replace(/\/+$/, ''); },
  enabled() { return !!this.base() && (!!this.identity||Tracker.loggedIn()); },
  ident() { if(this.identity)return this.identity;return `${Tracker.name==='AniDeck'?'anideck':Tracker.svc === AniList ? 'anilist' : 'kitsu'}:${Tracker.svc.userId || Tracker.userName}`; },
  async call(path, { method = 'GET', json } = {}) {
    return httpUncached(`${this.base()}${path}`, { method, json, timeout: 12000, headers: this.session ? { Authorization: `Bearer ${this.session}` } : {} });
  },
  // An AniDeck session for the tracker in use (kept with your other sign-ins), made from its access token if needed.
  async ensure(force = false) {
    if (!this.enabled()) return false;
    const id=this.ident(),svc=this.service(),provider=this.provider();
    if(this.who!==id){this.session=null;this.me=undefined;this.publishedAt=0;this.who=id;}
    if(!force&&this.session)return true;
    if(this.authPending?.id===id&&(!force||this.authPending.force))return this.authPending.promise;
    const task={id,force,promise:null};
    task.promise=(async()=>{
      const saved=await window.native.getSecret('anideckCloud').catch(()=>null);
      if(this.ident()!==id||!this.enabled())return false;
      if(!force&&saved?.who===id&&saved.session){this.session=saved.session;return true;}
      // Older releases keyed sessions by display name. Migrate only after the server verifies ownership.
      if(!force&&saved?.session&&saved.who!==id){
        try{
          const previous=await httpUncached(this.base()+'/v1/me',{timeout:12000,headers:{Authorization:'Bearer '+saved.session}});
          if(this.ident()!==id||!this.enabled())return false;
          if(previous.accountId===id){this.session=saved.session;this.me=previous.me||null;await window.native.setSecret('anideckCloud',{who:id,session:saved.session});return true;}
        }catch(error){if(error.status!==401)throw error;}
      }
      if(!svc.token||id!==provider+':'+svc.userId){const error=Error('Reconnect '+(provider==='anilist'?'AniList':provider==='kitsu'?'Kitsu':'your AniDeck recovery key')+' to restore this AniDeck profile.');error.data={code:'provider_reauth'};throw error;}
      const r=await httpUncached(this.base()+'/v1/session',{method:'POST',json:{provider,token:svc.token},timeout:12000});
      if(this.ident()!==id||!this.enabled())return false;
      this.session=r.session;this.me=r.me||null;this.suggested=r.suggested||'';
      await window.native.setSecret('anideckCloud',{who:id,session:r.session});return true;
    })();this.authPending=task;
    try{return await task.promise;}finally{if(this.authPending===task)this.authPending=null;}
  },
  async withSession(fn) {
    if (!(await this.ensure())) throw new Error('Sign in to AniList or Kitsu first.');
    try { return await fn(); } catch (e) { if (e.status === 401) { await this.ensure(true); return fn(); } throw e; }
  },
  async loadMe() { const who=this.ident();return this.withSession(async () => { const r = await this.call('/v1/me'); if(this.ident()!==who)throw new Error('Account changed');this.me = r.me || null; return this.me; }); },
  async join(handle, visibility) {
    return this.withSession(async () => { const r = await this.call('/v1/me', { method: 'PUT', json: { handle, visibility, name: Tracker.name==='AniDeck'?handle:Tracker.userName, avatar: Tracker.avatar || '' } }); this.me = r.me; this.publishedAt = 0;if(Tracker.name==='AniDeck'){LocalTracker.userName=handle;await LocalTracker.persist();}return r.me; });
  },
  async update(fields) { return this.withSession(async () => { const r = await this.call('/v1/me', { method: 'PUT', json: fields }); this.me = r.me; return r.me; }); },
  async leave() { if(typeof Friends!=='undefined')Friends.snapshot=null;return this.withSession(async () => { await this.call('/v1/me', { method: 'DELETE' }); this.me = null; }); },
  // Your card goes up when you open your profile, at most every 10 minutes.
  async publish(card) {
    if (!this.me || Date.now() - this.publishedAt < 10 * 60000) return;
    this.publishedAt = Date.now();
    await this.withSession(() => this.call('/v1/me', { method: 'PUT', json: { card, name: this.me.name||card.name, avatar: this.me.avatar||card.avatar } })).catch(() => { this.publishedAt = 0; });
  },
  friends() { return this.withSession(() => this.call('/v1/friends')); },
  add(to) { return this.withSession(() => this.call('/v1/friends', { method: 'POST', json: { to } })); },
  accept(handle) { return this.withSession(() => this.call(`/v1/friends/${encodeURIComponent(handle)}/accept`, { method: 'POST' })); },
  remove(handle) { if(typeof Friends!=='undefined')Friends.snapshot=null;return this.withSession(() => this.call(`/v1/friends/${encodeURIComponent(handle)}`, { method: 'DELETE' })); },
  user(handle) { return this.withSession(() => this.call(`/v1/users/${encodeURIComponent(handle)}`)); },
  async milestones() {
    if (this.rarity && Date.now() - this.rarityAt < 10 * 60000) return this.rarity;
    this.rarity = await this.withSession(() => this.call('/v1/stats/milestones')).catch(() => null); this.rarityAt = Date.now();
    return this.rarity;
  },
};

/* ---------------- your stats, kept for a few minutes ---------------- */
async function myCard(rid) {
  const who = `${Tracker.name}:${Tracker.userName}`, kept = App.profileCache?.who === who ? App.profileCache : null;
  const fetchAll = () => Promise.all([Tracker.profileStats().catch(() => null), Tracker.list('', 0, 500).catch(() => null)]);
  let st = null, listRes = null, stale = false;
  if (kept && Date.now() - kept.at < 5 * 60000) ({ st, listRes } = kept);
  else {
    [st, listRes] = await fetchAll();
    if ((!st || !listRes) && !App.stale(rid)) { await new Promise((r) => setTimeout(r, 1500)); const [s2, l2] = await fetchAll(); st = st || s2; listRes = listRes || l2; }
    if (st && listRes) App.profileCache = { who, at: Date.now(), st, listRes };
    else if (kept) { st = st || kept.st; listRes = listRes || kept.listRes; stale = true; }
    else stale = true;
  }
  const local = await window.native.get('watchLog').catch(() => ({}));
  const act = { ...(st?.activity || {}) };
  for (const [k, n] of Object.entries(local || {})) act[k] = Math.max(act[k] || 0, n);
  const entries = (listRes?.entries || []).filter((e) => e.anime);
  return { card: watcherCard(st, entries, act, { name: st?.name || Tracker.userName, avatar: st?.avatar || Tracker.avatar || '', tracker: Tracker.name }), stale, kept: !!kept };
}

/* ---------------- the social strip on your profile ---------------- */
function circleHighlights(people,mine) {
  const own=Array.isArray(mine?.shows)?mine.shows:[],byId=new Map(),byKey=new Map();
  for(const show of own){if(show.id!=null&&String(show.id))byId.set(String(show.id),show);if(show.k)byKey.set(show.k,show);}
  const watching=[],shared=[],snapshots=[],seen=new Set();
  for(const person of people){
    const card=person.card;if(!card)continue;
    const current=Array.isArray(card.watching)?card.watching:[],shows=Array.isArray(card.shows)?card.shows:[];
    const watch=current.find(show=>show.id!=null&&show.t);if(watch)watching.push({person,show:watch});
    for(const show of shows){const match=(show.id!=null?byId.get(String(show.id)):null)||(show.k?byKey.get(show.k):null);const key=match?.id!=null?String(match.id):match?.k;
      if(match&&Number(show.s)>=8&&Number(match.s)>=8&&!seen.has(key)){seen.add(key);shared.push({person,show,mine:match});}
    }
    const completed=shows.filter(show=>show.st==='completed'&&show.t&&show.id!=null).sort((a,b)=>(Number(b.s)||0)-(Number(a.s)||0))[0];
    if(completed)snapshots.push({person,show:completed});
  }
  return {watching:watching.slice(0,3),shared:shared.sort((a,b)=>(Number(b.show.s)+Number(b.mine.s))-(Number(a.show.s)+Number(a.mine.s))).slice(0,2),snapshots:snapshots.slice(0,2)};
}
function paintCircleActivity(rid,mine) {
  const box=$('#pf2-social'),state=box?._circle,content=box?.querySelector('#pf2-circle-content');
  if(!state||!content||App.stale(rid)||state.who!==Cloud.ident())return;
  const highlights=circleHighlights(state.people,mine),{watching,shared,snapshots}=highlights;
  const latest=Math.max(0,...state.people.map(p=>Number(p.cardAt)||0)),updated=latest>946684800000&&latest<=Date.now()+60000?new Date(latest).toLocaleDateString([],{month:'short',day:'numeric'}):'';
  const art=show=>show.p?`<img src="${esc(show.p)}" alt="" loading="lazy" decoding="async">`:`<span class="pf2-circle-art-fallback">${icon('video')}</span>`;
  const anime=(show,body,cls='')=>`<button class="${cls}" data-act="anime" data-id="${esc(show.id)}" data-titles="${esc(JSON.stringify(show.titles||[]))}" title="${esc(show.t)}">${body}</button>`;
  const friend=person=>`<button class="pf2-circle-person" data-act="wfOpen" data-handle="${esc(person.handle)}">${esc(person.name||person.handle)}</button>`;
  if(!state.people.some(p=>p.card)){content.innerHTML=`<div class="pf2-circle-wait">${icon('deck')}<div><b>${state.failed?'Shared cards couldn’t load just now.':'Your circle’s next chapter starts here.'}</b><p>${state.failed?'Open Friends to visit a profile or try again later.':'Watching picks and shared favorites will appear as friends share their watcher cards.'}</p></div></div>`;return;}
  content.innerHTML=`<section class="pf2-circle-watching"><header><h4>${icon('play')}Watching around you</h4><small>From shared watcher cards</small></header>${watching.length?`<div class="pf2-circle-watch-grid">${watching.map(({person,show})=>`<article class="pf2-circle-watch">${anime(show,art(show),'pf2-circle-cover')}<div>${friend(person)}${anime(show,`<b>${esc(show.t)}</b>`,'pf2-circle-title')}<small>${Math.max(0,Number(show.pr)||0)}${Number(show.ep)>0?' / '+Number(show.ep):''} episodes watched</small><span class="pf2-circle-track" aria-hidden="true"><i style="width:${Number(show.ep)>0?Math.min(100,Math.max(0,(Number(show.pr)||0)/Number(show.ep)*100)):0}%"></i></span></div></article>`).join('')}</div>`:'<p class="pf2-circle-note">No Watching titles in your friends’ shared cards yet.</p>'}</section>
  <div class="pf2-circle-bottom"><section><header><h4>${icon('spark')}Shared favorites</h4><small>Both rated 8+</small></header>${shared.length?shared.map(({person,show,mine:own})=>`<article class="pf2-circle-pick">${anime(show,art(show),'pf2-circle-miniart')}<div>${anime(show,`<b>${esc(show.t)}</b>`,'pf2-circle-title')}<p>You ${Number(own.s)} · ${friend(person)} ${Number(show.s)}</p></div><span class="pf2-circle-score">${icon('spark')}</span></article>`).join(''):'<p class="pf2-circle-note">Titles you and a friend both rate 8 or higher will appear here.</p>'}</section>
  <section><header><h4>${icon('checkCircle')}From their lists</h4><small>Completed picks</small></header>${snapshots.length?snapshots.map(({person,show})=>`<article class="pf2-circle-listpick"><span aria-hidden="true">${icon('checkCircle')}</span><div>${anime(show,`<b>${esc(show.t)}</b>`,'pf2-circle-title')}<p>On ${friend(person)}’s completed list</p></div></article>`).join(''):'<p class="pf2-circle-note">Completed titles from shared lists will show up here.</p>'}</section></div>
  <p class="pf2-circle-footnote">${icon('info')}${state.partial?'Some shared cards couldn’t load. ':''}${updated?'Latest card shared '+esc(updated)+'. ':''}A look at your friends’ shared lists, updated when they share their profiles.</p>`;
}
async function paintSocial(rid) {
  const box = $('#pf2-social');if(!box||!Cloud.enabled())return;box._circle=null;
  const who=Cloud.ident(),current=()=>box.isConnected&&!App.stale(rid)&&Cloud.ident()===who;
  box.hidden=false;box.innerHTML='<div class="pf2-soc-loading"><span class="skel"></span><span class="skel"></span></div>';
  if(Cloud.who!==who)Cloud.me=undefined;let me=Cloud.me,data=null;
  try{if(me===undefined)me=await Cloud.loadMe();if(!current())return;if(me)data=await Cloud.friends();}
  catch(error){if(current())box.innerHTML=`<div class="pf2-social-summary"><span class="pf2-social-mark" aria-hidden="true">${icon('chat')}</span><div class="pf2-social-copy"><h3>Your circle</h3><p>Your circle is available from Friends.</p></div><button class="btn ghost" data-act="friendsOpen">Open Social ${icon('chev')}</button></div>`;return;}
  if(!current())return;const friends=data?.friends||[],preview=friends.slice(0,4);
  const avatars=preview.map(u=>`<span class="pf2-summary-avatar" title="${esc(u.name||u.handle)}">${u.avatar?`<img src="${esc(u.avatar)}" alt="${esc(u.name||u.handle)}" loading="lazy">`:`<span role="img" aria-label="${esc(u.name||u.handle)}">${esc((u.name||u.handle||'?')[0])}</span>`}</span>`).join('');
  box.innerHTML=`<div class="pf2-social-summary"><span class="pf2-social-mark" aria-hidden="true">${icon('deck')}</span><div class="pf2-social-copy"><h3>Your circle <span>${friends.length}</span></h3><p>${friends.length?'What’s on deck for your people.':'Good anime is better with good company.'}</p></div>${preview.length?`<div class="pf2-summary-avatars" aria-label="Friends preview">${avatars}${friends.length>4?`<span class="pf2-summary-more">+${friends.length-4}</span>`:''}</div>`:''}<button class="btn ghost" data-act="friendsOpen">Open Social ${icon('chev')}</button></div>${friends.length?'<div id="pf2-circle-content"><div class="pf2-circle-wait" role="status">Loading shared watcher cards…</div></div>':'<div class="pf2-circle-start"><span aria-hidden="true">'+icon('chat')+'</span><div><b>Build a circle around the shows you love.</b><p>See what friends are watching, find favorites in common, and explore their completed picks.</p></div></div>'}`;
  if(!friends.length){box._circle=null;return;}
  const selected=[...friends].sort((a,b)=>(Number(b.cardAt)||0)-(Number(a.cardAt)||0)).slice(0,4);
  const results=await Promise.allSettled(selected.map(u=>Cloud.user(u.handle)));if(!current())return;
  const people=results.flatMap((r,i)=>r.status==='fulfilled'&&!r.value.locked&&r.value.friend==='accepted'&&r.value.user?.card?[{...selected[i],...r.value.user}]:[]);
  box._circle={who,people,failed:results.some(r=>r.status==='rejected'),partial:results.some(r=>r.status==='rejected')};
  paintCircleActivity(rid,App.myCardWho===who?App.myCard:me?.card);
}

async function offerProfileIntro(){
 const key='anideckProfileIntro';if(await window.native.get(key))return false;
 if(!Cloud.enabled()||!document.getElementById('modal').hidden)return false;
 const who=Cloud.ident();let me;try{me=await Cloud.loadMe();}catch{return false;}
 if(Cloud.ident()!==who||!document.getElementById('modal').hidden)return false;
 if(me){await window.native.set(key,true);return false;}
 // Persist only after creation, key sign-in or an explicit skip. Interrupted setup resumes.
 joinDialog({onboarding:true,onDone:()=>window.native.set(key,true)});return true;
}

function joinDialog({onboarding=false,onDone}={}) {
  const base = (Cloud.suggested || Tracker.userName || '').replace(/[^a-z0-9_]/gi, '').slice(0, 20);
  App.modal(`<form class="wf-join wf-onboard" id="wf-join" novalidate>
    <header class="dk-head"><div class="wf-welcome"><span class="wf-profile-mark" aria-hidden="true">${icon('deck')}</span><div><span class="ad-eyebrow">YOUR ANIDECK IDENTITY</span><h2>Create your profile</h2></div></div><button type="button" class="icon-btn" id="wf-x" aria-label="Close">${icon('close')}</button></header>
    <p class="wf-intro">A familiar name for your anime circle. Add friends, compare your taste, and keep the conversation going.</p>
    <div class="wf-identity-field"><label class="dk-label" for="wf-handle">Choose your handle <span>Your name on AniDeck</span></label>
      <div class="wf-handle"><span aria-hidden="true">@</span><input id="wf-handle" value="${esc(base)}" minlength="3" maxlength="20" required autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="wf-handle-help wf-err"><span class="wf-handle-count" id="wf-handle-count" aria-hidden="true">${base.length}/20</span></div>
      <p class="dk-help" id="wf-handle-help">3–20 letters, numbers or underscores. You’ll also get a friend code.</p>
    </div>
    <fieldset class="wf-privacy"><legend>Who can see your watcher card?</legend><div class="wf-privacy-options">
      <label class="wf-opt"><input type="radio" name="wf-vis" value="friends" checked><span class="wf-option-copy"><span class="wf-option-icon" aria-hidden="true">${icon('user')}</span><b>Friends only</b><small>People you accept on AniDeck.</small><em>Private by default</em></span><span class="wf-radio" aria-hidden="true"></span></label>
      <label class="wf-opt"><input type="radio" name="wf-vis" value="public"><span class="wf-option-copy"><span class="wf-option-icon" aria-hidden="true">${icon('search')}</span><b>Anyone with your handle</b><small>AniDeck users who look you up.</small><em>Make your taste discoverable</em></span><span class="wf-radio" aria-hidden="true"></span></label>
    </div></fieldset>
    <details class="wf-sharing-note"><summary>${icon('info')}What will I share?${icon('chev')}</summary><p>Your watcher card, including watch time, genres, scores, milestones and what you’re watching, plus your list’s titles and scores for comparisons. Your visibility choice controls who can see it.</p><p>${Tracker.name==='AniDeck'?'An encrypted recovery key on this device secures your AniDeck profile. Save it from Settings → Account to recover your friends on another device.':'AniList or Kitsu verifies your identity. Your tracker access token isn’t stored by the AniDeck service.'} Friends and messages live in AniDeck.</p></details>
    <p class="wf-existing">Already have an AniDeck profile? <button type="button" class="link-btn" id="wf-key-login">Sign in with your key</button></p><p class="dk-error" id="wf-err" role="alert" hidden></p>
    <footer class="dk-foot"><span class="wf-footer-note">Your profile. Your circle.</span><button type="button" class="btn ghost ad2-btn" id="wf-cancel">${onboarding?'Skip for now':'Maybe later'}</button><button class="btn primary ad2-btn" id="wf-go">Create profile ${icon('chev')}</button></footer>
  </form>`, 'dk-modal wf-modal wf-onboard-modal');
  const form = $('#wf-join'), input = $('#wf-handle'), button = $('#wf-go'), error = $('#wf-err'), help = $('#wf-handle-help');
  let submitting = false;
  const valid = () => /^[a-z0-9_]{3,20}$/i.test(input.value.trim());
  const validate = () => {
    const value = input.value.trim(), ok = valid();
    $('#wf-handle-count').textContent = input.value.length + '/20';
    input.setAttribute('aria-invalid', String(!ok));
    help.textContent = ok ? '3–20 letters, numbers or underscores. You’ll also get a friend code.' : value.length < 3 ? 'Use at least 3 letters, numbers or underscores.' : 'Use letters, numbers and underscores only.';
    button.disabled = submitting || !ok;
    return ok;
  };
  $('#wf-x').onclick = $('#wf-cancel').onclick = () => { if (!submitting){App.closeModal();onDone?.();} };
  $('#wf-key-login').onclick=()=>{if(!submitting)AniAccount.signIn({onDone,back:()=>joinDialog({onboarding,onDone})});};
  input.oninput = () => { error.hidden = true; validate(); };
  form.onsubmit = async (event) => {
    event.preventDefault(); if (submitting || !validate()) { input.focus(); return; }
    submitting = true; button.disabled = true; input.readOnly = true; form.setAttribute('aria-busy','true');
    button.textContent = 'Creating profile…'; $('#wf-x').disabled = $('#wf-cancel').disabled = true;
    try { await Cloud.join(input.value.trim(), form.querySelector('[name="wf-vis"]:checked')?.value || 'friends'); if (!form.isConnected) return; App.closeModal(); onDone?.(); App.profileCache = App.profileCache && { ...App.profileCache }; App.refresh(); }
    catch (err) { if (!form.isConnected) return; error.textContent = err.data?.error || err.message; error.hidden = false; }
    finally { submitting = false; if (form.isConnected) { input.readOnly = false; form.removeAttribute('aria-busy'); button.innerHTML = 'Create profile ' + icon('chev'); $('#wf-x').disabled = $('#wf-cancel').disabled = false; validate(); } }
  };
  validate();
  requestAnimationFrame(() => { if (input.isConnected) { input.focus(); input.select(); } });
}
function sharingSettings() {
  const me = Cloud.me; if (!me) return;
  App.modal(`<div class="wf-settings-shell"><form class="wf-join wf-onboard wf-settings" id="wf-settings">
    <header class="dk-head"><div class="wf-welcome"><span class="wf-profile-mark" aria-hidden="true">${icon('eyeOff')}</span><div><span class="ad-eyebrow">YOUR CIRCLE · YOUR CHOICE</span><h2>Profile privacy</h2></div></div><button type="button" class="icon-btn" id="wf-x" aria-label="Close privacy settings">${icon('close')}</button></header>
    <div class="wf-settings-identity"><span>${icon('user')}@${esc(me.handle)}</span><small>Your AniDeck profile</small></div>
    <fieldset class="wf-privacy"><legend>Who can see your watcher card?</legend><div class="wf-privacy-options">
      <label class="wf-opt"><input type="radio" name="wf-vis" value="friends" ${me.visibility !== 'public' ? 'checked' : ''}><span class="wf-option-copy"><span class="wf-option-icon" aria-hidden="true">${icon('user')}</span><b>Friends only</b><small>People you accept on AniDeck.</small><em>Keep your circle close</em></span><span class="wf-radio" aria-hidden="true"></span></label>
      <label class="wf-opt"><input type="radio" name="wf-vis" value="public" ${me.visibility === 'public' ? 'checked' : ''}><span class="wf-option-copy"><span class="wf-option-icon" aria-hidden="true">${icon('search')}</span><b>Anyone with your handle</b><small>AniDeck users who look you up.</small><em>Make your taste discoverable</em></span><span class="wf-radio" aria-hidden="true"></span></label>
    </div></fieldset>
    <p class="wf-settings-help">Your watcher card includes your watch stats, list titles and scores. Message privacy is separate; choose whether other profiles can send introductions.</p>
    <div class="wf-leave-row"><div><b>Leave AniDeck profiles</b><p>Remove your social profile and shared data.</p></div><button type="button" class="btn ghost" id="wf-leave">${icon('logout')}Leave…</button></div>
    <p class="dk-error" id="wf-settings-error" role="alert" hidden></p>
    <footer class="dk-foot"><span class="wf-footer-note">Make yourself at home.</span><button type="button" class="btn ghost ad2-btn" id="wf-cancel">Cancel</button><button type="submit" class="btn primary ad2-btn" id="wf-save" disabled>Save changes</button></footer>
  </form>
  <section class="wf-join wf-onboard wf-confirm-danger" id="wf-leave-confirm" aria-labelledby="wf-leave-title" hidden>
    <header class="dk-head"><div class="wf-welcome"><span class="wf-profile-mark" aria-hidden="true">${icon('logout')}</span><div><span class="ad-eyebrow">LEAVE ANIDECK PROFILES</span><h2 id="wf-leave-title">Leaving your circle?</h2></div></div><button type="button" class="icon-btn" id="wf-confirm-x" aria-label="Close">${icon('close')}</button></header>
    <p class="wf-intro">Leaving permanently deletes <b>@${esc(me.handle)}</b> and its social data from AniDeck cloud.</p>
    <div class="wf-delete-summary"><h3>What gets deleted</h3><ul><li>${icon('user')}Your profile and shared watcher card</li><li>${icon('deck')}Your friends, requests and blocked list</li><li>${icon('chat')}Messages you’ve sent or received on AniDeck</li></ul></div>
    <p class="wf-keep-note">${icon('info')}<span>Your watchlist and episode tracking stay on your device or connected tracker. Creating an AniDeck profile again won’t restore deleted social data.</span></p>
    <p class="dk-error" id="wf-leave-error" role="alert" hidden></p>
    <footer class="dk-foot"><button type="button" class="btn ghost ad2-btn" id="wf-keep">Keep my profile</button><button type="button" class="btn danger ad2-btn" id="wf-delete">${icon('trash')}Delete AniDeck profile</button></footer>
  </section></div>`, 'dk-modal wf-modal wf-onboard-modal');
  const form=$('#wf-settings'),confirmation=$('#wf-leave-confirm'),save=$('#wf-save');let busy=false;
  const close=()=>{if(!busy)App.closeModal();};$('#wf-x').onclick=$('#wf-cancel').onclick=$('#wf-confirm-x').onclick=close;
  const selected=()=>form.querySelector('[name="wf-vis"]:checked')?.value||'friends';
  form.onchange=()=>{save.disabled=busy||selected()===(me.visibility==='public'?'public':'friends');$('#wf-settings-error').hidden=true;};
  const setBusy=(panel,value)=>{busy=value;panel.setAttribute('aria-busy',String(value));panel.querySelectorAll('button,input').forEach(el=>el.disabled=value);};
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||save.disabled)return;const visibility=selected();setBusy(form,true);save.textContent='Saving…';
    try{await Cloud.update({visibility});if(!form.isConnected)return;App.closeModal();App.refresh();}
    catch(error){if(form.isConnected){const el=$('#wf-settings-error');el.textContent=error.data?.error||error.message;el.hidden=false;}}
    finally{setBusy(form,false);if(form.isConnected){save.textContent='Save changes';save.disabled=selected()===(me.visibility==='public'?'public':'friends');}}
  };
  $('#wf-leave').onclick=()=>{if(busy)return;form.hidden=true;confirmation.hidden=false;$('#wf-keep').focus();};
  $('#wf-keep').onclick=()=>{if(busy)return;confirmation.hidden=true;form.hidden=false;$('#wf-leave-error').hidden=true;$('#wf-leave').focus();};
  $('#wf-delete').onclick=async()=>{
    if(busy)return;setBusy(confirmation,true);const button=$('#wf-delete');button.textContent='Deleting profile…';$('#wf-leave-error').hidden=true;
    try{await Cloud.leave();if(!confirmation.isConnected)return;App.closeModal();App.refresh();}
    catch(error){if(confirmation.isConnected){const el=$('#wf-leave-error');el.textContent=error.data?.error||error.message;el.hidden=false;}}
    finally{setBusy(confirmation,false);if(button.isConnected)button.innerHTML=icon('trash')+'Delete AniDeck profile';}
  };
  requestAnimationFrame(()=>{if(form.isConnected)$('#wf-x').focus();});
}

/* ---------------- views ---------------- */
Object.assign(VIEW_TITLES, { watcher: 'Watcher' });
Object.assign(Views, {
  async profile() {
    if (!Tracker.loggedIn()) return `<div class="page profile pf2"><section class="pf-empty pf-in">
      <h2>See your anime stats</h2><p class="muted">Sign in to Kitsu or AniList to see how long you've spent watching anime and what's on your list.</p>
      <div class="row gap" style="margin-top:14px"><button class="btn primary" data-act="kitsuLogin">Sign in to Kitsu</button><button class="btn" data-act="anilistLogin">Sign in to AniList</button></div></section></div>`;
    return profileMarkup({ self: true });
  },
  async profileAfter(_p, rid) {
    App.updateWho();
    if (!Tracker.loggedIn()) return;
    drawHand([0, 0, 0, 0, 0], 0);
    paintSocial(rid);
    const { card, stale, kept } = await myCard(rid);
    if (App.stale(rid)) return;
    App.myCard = card; App.myCardWho = Cloud.ident();
    paintCircleActivity(rid,card);
    const hero = $('.pf2-hero');
    hero?.querySelector('.pf2-busy')?.remove();
    if (stale && hero) hero.insertAdjacentHTML('beforeend', `<div class="pf2-busy">${icon('info')}<span>${esc(Tracker.name)} is busy right now${kept ? ', so these are your last saved stats' : ', so some stats couldn’t load'}.</span><button class="link-btn" data-act="pfRetry">Try again</button></div>`);
    const rarity = Cloud.enabled() ? await Cloud.milestones().catch(() => null) : null;
    if (App.stale(rid)) return;
    let identity=null;try{identity=await Cloud.loadMe();}catch{}if(App.stale(rid))return;
    paintProfileIdentity(identity,{self:true});if(identity){card.name=identity.name||card.name;card.avatar=identity.avatar||'';const image=$('#pf-avatar img');if(image)image.remove();}
    AniFavorites.paint(identity,true);
    paintProfile(card, { self: true, rarity });
    if (!stale) Cloud.publish(card);
  },
  async watcher({ handle = '' } = {}) { return profileMarkup({ self: false, handle }); },
  async watcherAfter({ handle = '' } = {}, rid) {
    const fail = (msg) => { const h = $('.pf2-hero'); h?.insertAdjacentHTML('beforeend', `<div class="pf2-busy">${icon('info')}<span>${esc(msg)}</span></div>`); };
    if (!Cloud.enabled()) return fail('AniDeck profiles aren’t set up in this copy of AniDeck.');
    drawHand([0, 0, 0, 0, 0], 0, false);
    let r;
    try { r = await Cloud.user(handle); } catch (e) { if (!App.stale(rid)) fail(e.data?.error || e.message); return; }
    if (App.stale(rid)) return;
    const u = r.user, btn = $('#wf-friend-btn');
    if(r.friend==='accepted'||u.messagePolicy==='requests')document.querySelector('.pf2-hero-acts')?.insertAdjacentHTML('beforeend',`<button class="btn ghost ad2-btn" data-act="${r.friend==='accepted'?'friendsMessage':'requestMessage'}" data-handle="${esc(u.handle)}">${icon('chat')}${r.friend==='accepted'?'Message':'Send message request'}</button>`);
    AniFavorites.paint(u,false);
    paintProfileIdentity(u,{self:false});
    $('#pf-name').textContent = u.name || `@${u.handle}`;
    if (u.avatar && !$('#pf-avatar img')) $('#pf-avatar').insertAdjacentHTML('beforeend', `<img src="${esc(u.avatar)}" alt="">`);
    if (btn) {
      btn.hidden = false;
      btn.innerHTML = r.friend === 'accepted' ? `${icon('check')}Friends` : r.requested === 'out' ? `${icon('clock')}Request sent` : r.requested === 'in' ? `${icon('check')}Accept request` : `${icon('plus')}Add friend`;
      btn.dataset.act = r.friend === 'accepted' ? 'wfRemoveAsk' : r.requested === 'in' ? 'wfAccept' : r.requested === 'out' ? 'wfRemove' : 'wfAddHandle';
      btn.dataset.handle = u.handle;
    }
    if (r.locked || !u.card) {
      $('.pf2-grid')?.insertAdjacentHTML('beforebegin', `<div class="pf2-locked">${icon('eyeOff')}<b>${r.locked?esc(u.name || '@' + u.handle)+'’s card is for friends':'Their watcher card isn’t shared yet'}</b><span>${r.friend==='accepted'?'You’re friends. Their stats will appear when they share their card.':r.requested === 'out' ? 'Your request is waiting for them.' : 'Add them as a friend; once they accept, their card shows here.'}</span></div>`);
      const grid=document.querySelector('.pf2-peer-profile .pf2-grid');if(grid)grid.hidden=true;const habits=$('#pf2-habits');if(habits)habits.hidden=true;
      return;
    }
    const rarity = await Cloud.milestones().catch(() => null);
    if (App.stale(rid)) return;
    paintProfile({...u.card,name:u.name||u.card.name,avatar:u.avatar??u.card.avatar}, { self: false, rarity });
    // compare with yours (from the last time your profile loaded, or now)
    const mine = (App.myCardWho===Cloud.ident()?App.myCard:null) || (await myCard(rid).catch(() => null))?.card;
    if (App.stale(rid) || !mine) return;
    App.myCard = mine; App.myCardWho = Cloud.ident();
    const cmp = $('#pf2-compare');
    if (cmp) { cmp.hidden = false; cmp.innerHTML = compareCards(mine, u.card, u.name || `@${u.handle}`); }
  },
});

/* ---------------- actions ---------------- */
{
  const act = App.act;
  App.act = async function (name, d, el) {
    if (!['profileNav', 'wfJoin', 'wfOpen', 'wfCopy', 'wfAccept', 'wfRemove', 'wfRemoveAsk', 'wfAddHandle', 'wfSettings', 'wfRefresh', 'wfPlan', 'pfMilestones'].includes(name)) return act.call(this, name, d, el);
    try {
      switch (name) {
        case 'pfMilestones': {const target=$('#pf2-badges');target?.scrollIntoView({behavior:App.settings.reduceMotion?'auto':'smooth',block:'start'});if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}return;}
        case 'profileNav': return this.nav('profile');
        case 'wfJoin': await Cloud.ensure().catch((e) => { throw e; }); return joinDialog();
        case 'wfOpen': return this.nav('watcher', { handle: d.handle });
        case 'wfCopy': await navigator.clipboard.writeText(d.code).catch(() => {}); el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1400); return;
        case 'wfAccept': await Cloud.accept(d.handle); toast(`You and @${d.handle} are now friends`, 'good'); return this.refresh();
        case 'wfRemove': await Cloud.remove(d.handle); return this.refresh();
        case 'wfRemoveAsk': if (confirm(`Remove @${d.handle} from your AniDeck friends?`)) { await Cloud.remove(d.handle); return this.refresh(); } return;
        case 'wfAddHandle': { const r = await Cloud.add(d.handle); toast(r.status === 'accepted' ? `You and @${d.handle} are now friends` : `Request sent to @${d.handle}`, 'good'); return this.refresh(); }
        case 'wfSettings': return sharingSettings();
        case 'wfRefresh': Cloud.me = undefined; return paintSocial(this.renderId);
        case 'wfPlan': await Tracker.setStatus(d.id, 'planned'); el.replaceWith(Object.assign(document.createElement('span'), { className: 'pf2-added', textContent: 'Added to Planning' })); return;
      }
    } catch (e) { toast(e.data?.error || e.message, 'bad'); }
  };
}

