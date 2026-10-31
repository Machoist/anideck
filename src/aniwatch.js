'use strict';
const BASE = 'https://aniwatchtv.ro';
const matching=require('./provider-title-match'),{norm}=matching,{load}=require('cheerio');
const listingCache=new Map(),searchCache=new Map();
function searchTerms(title){
 const plain=String(title||'').normalize('NFKC').replace(/[‘’]/g,"'").trim();
 const broad=plain.split(/[:–—]/)[0].replace(/\bseason\s*\d+\b/ig,'').trim().split(/\s+/).slice(0,3).join(' ');
 return [...new Set([broad,plain].filter(Boolean))];
}
function siteUrl(value) {
  const url = new URL(value, BASE);
  if (url.origin !== BASE || url.username || url.password) throw new Error('Unexpected AniWatch navigation');
  return url.href;
}
function chooseTitle(links,title,season=1,aliases=[],format,count){const hit=matching.chooseTitle(links,title,season,aliases,format,count,{identity:x=>siteUrl(x.url),label:'AniWatch'});if(!hit)throw Error(`AniWatch: No exact title match for ${title}`);return {...hit,url:siteUrl(hit.url)};}
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
function parseTitles(html){const $=load(html);return $('#main-content .film-name a, #main-content h3 a').map((_,a)=>{const e=$(a);try{return {title:e.attr('title')||e.text().trim(),jp:e.attr('data-jname'),url:siteUrl(e.attr('href'))};}catch{return null;}}).get().filter(Boolean);}
async function metadata(read,title,number,audio,request={}){
 const season=request.seasonNumber??1;if(!Number.isInteger(season)||season<1)throw Error('AniWatch specials require their own title');if(!['sub','dub'].includes(audio))throw Error('Unsupported AniWatch audio');
 const aliases=matching.aliases(request,title),key=JSON.stringify([title,season,aliases,request.mediaFormat,request.episodeCount]);try{let data=listingCache.get(key);if(!data||Date.now()-data.at>120000){let match;for(const term of [...new Set([...searchTerms(title),...aliases])].slice(0,4)){try{const hit=searchCache.get(term);let items=hit&&Date.now()-hit.at<60000?hit.items:null;if(!items){items=parseTitles(await read(BASE+'/?s='+encodeURIComponent(term)));if(items.length){if(searchCache.size>=100)searchCache.delete(searchCache.keys().next().value);searchCache.set(term,{items,at:Date.now()});}}match=chooseTitle(items,title,season,aliases,request.mediaFormat,request.episodeCount);break;}catch(error){if(!/No exact title match/.test(error.message))throw error;}}
 if(!match){if(request.catalogOnly)return {episodes:[]};throw Error('AniWatch has no exact title match');}
 const $=load(await read(match.url)),ids=[...new Set($('#ani_detail[data-anime-id],.anis-watch-detail .anis-content[data-anime-id]').map((_,e)=>$(e).attr('data-anime-id')).get())];if(ids.length!==1||!/^\d+$/.test(ids[0]))throw Error('AniWatch title metadata unavailable');
 const result=JSON.parse(await read(BASE+'/wp-json/v1/otakuthemes/episode/list/'+ids[0]));if(!result.status||typeof result.html!=='string')throw Error('AniWatch episode list unavailable');const e=load(result.html),episodes=e('a.ep-item[data-number][data-id]').map((_,a)=>({number:Number(e(a).attr('data-number')),id:e(a).attr('data-id'),url:siteUrl(e(a).attr('href'))})).get().filter(a=>Number.isInteger(a.number)&&a.number>0&&a.number<=3000&&/^\d+$/.test(a.id));data={at:Date.now(),match,episodes:matching.boundEpisodes(episodes,match,request.episodeCount,'AniWatch')};if(listingCache.size>=100)listingCache.delete(listingCache.keys().next().value);listingCache.set(key,data);}
 if(request.catalogOnly){if(season>1&&!data.match.seasonal)throw Error('AniWatch needs an exact season title to list episodes');return {episodes:data.episodes.map(e=>e.number)};}
 const url=chooseEpisode(data.episodes,number,request,data.match.seasonal),episode=data.episodes.find(e=>e.url===url);const result=JSON.parse(await read(BASE+'/wp-json/v1/otakuthemes/episode/servers?episodeId='+episode.id));if(!result.status||typeof result.html!=='string')throw Error('AniWatch servers unavailable');const $=load(result.html),servers=$('.server-item[data-hash]').map((_,e)=>({audio:$(e).attr('data-type'),name:$(e).attr('data-server-name'),hash:$(e).attr('data-hash')})).get();return chooseEmbeds(servers,audio);
 }catch(error){listingCache.delete(key);throw error;}
}
module.exports = {BASE, searchTerms, siteUrl, chooseTitle, chooseEpisode, chooseEmbeds, inspectPage,parseTitles,metadata,listingCache,searchCache};
