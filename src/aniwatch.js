'use strict';
const BASE = 'https://aniwatchtv.ro';
const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function searchTerms(title){
 const plain=String(title||'').normalize('NFKC').replace(/[‘’]/g,"'").trim();
 const broad=plain.split(/[:–—]/)[0].replace(/\bseason\s*\d+\b/ig,'').trim().split(/\s+/).slice(0,3).join(' ');
 return [...new Set([plain,broad].filter(Boolean))];
}
function siteUrl(value) {
  const url = new URL(value, BASE);
  if (url.origin !== BASE || url.username || url.password) throw new Error('Unexpected AniWatch navigation');
  return url.href;
}
function chooseTitle(links, title, season = 1) {
  const matches = wanted => links.filter(link => [link.title, link.jp].some(s => norm(s) === norm(wanted)));
  const namedSeason = /(?:season\s*\d+|\d+(?:st|nd|rd|th)\s*season)/i.test(title);
  let hits = season > 1 && !namedSeason ? matches(`${title} Season ${season}`) : [];
  const seasonal = hits.length > 0 || namedSeason;
  if (!hits.length) hits = matches(title);
  const urls = [...new Set(hits.map(hit => siteUrl(hit.url)))];
  if (!urls.length) throw new Error(`AniWatch: No exact title match for ${title}`);
  if (urls.length > 1) throw new Error('AniWatch returned multiple matching titles; cannot select reliably');
  return { url: urls[0], seasonal };
}
function chooseEpisode(episodes, number, request, seasonal) {
  const season = request.seasonNumber == null ? 1 : Number(request.seasonNumber);
  const target = seasonal || season <= 1 ? number : Number(request.absoluteEpisodeNum);
  if (!Number.isInteger(target) || target < 1) throw new Error('AniWatch needs an absolute episode number for this season of a continuous series');
  const hit = episodes.find(ep => Number(ep.number) === target);
  if (!hit) throw new Error(`AniWatch: Episode ${target} is unavailable for this title`);
  return siteUrl(hit.url);
}
function chooseEmbeds(servers, audio) {
  const hits = servers.filter(s => s.audio === audio).sort((a,b) => Number(!/^Fast Player$/i.test(a.name)) - Number(!/^Fast Player$/i.test(b.name)));
  const urls = hits.map(s => {
    try {
      const url = new URL(Buffer.from(s.hash, 'base64').toString('utf8'));
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }).filter(Boolean);
  if (!urls.length) throw new Error(`AniWatch: This episode has no usable ${audio} server`);
  return [...new Set(urls)].slice(0, 3);
}
// Serialized into the isolated provider window. Return DOM data only.
function inspectPage() {
  return {
    titles: [...document.querySelectorAll('#main-content .film-name a, #main-content h3 a')].map(a => ({title:a.getAttribute('title') || a.textContent.trim(), jp:a.getAttribute('data-jname'), url:a.href})),
    episodes: [...document.querySelectorAll('#episodes-content a.ep-item[data-number]')].map(a => ({number:a.dataset.number,url:a.href})),
    servers: [...document.querySelectorAll('#servers-content .server-item[data-hash]')].map(a => ({audio:a.dataset.type,name:a.dataset.serverName,hash:a.dataset.hash})),
    emptySearch: document.readyState!=='loading'&&/no results found/i.test(document.querySelector('#main-content')?.innerText||''),
    challenge: /just a moment|checking your browser|verify you are human/i.test(document.title + ' ' + (document.body?.innerText || '').slice(0, 500))
  };
}
module.exports = {BASE, searchTerms, siteUrl, chooseTitle, chooseEpisode, chooseEmbeds, inspectPage};
