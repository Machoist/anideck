'use strict';
const {load}=require('cheerio');
const {norm}=require('./hianime');
const BASE='https://anikototv.to',cache=new Map();
function siteUrl(value){const u=new URL(value,BASE);if(u.origin!==BASE||u.username||u.password||!u.pathname.startsWith('/watch/'))throw Error('Unexpected Anikoto title address');return u.href;}
function titleIdentity(value){const u=new URL(siteUrl(value));return u.origin+u.pathname.replace(/\/ep-[^/]+\/?$/,'').replace(/\/$/,'');}
// These suffixes distinguish seasons/specials (K-On!!, Quintuplets ~/*/∬); ordinary punctuation still normalizes.
function titleKey(value){const raw=String(value||'').normalize('NFKC').replace(/\(tv\)/gi,'').trim(),suffix=raw.match(/[!?:;~〜'’′*+\p{S}]+$/u)?.[0]||'';return norm(raw)+'|'+suffix;}
function formatKey(value){const key=String(value||'').toUpperCase().replace(/[^A-Z]/g,'');return key==='TVSHORT'?'TV':['TV','MOVIE','ONA','OVA','SPECIAL','MUSIC'].includes(key)?key:'';}
function titles(html){const $=load(html);return $('a[href*="/watch/"]').map((_,a)=>{const el=$(a);try{return {url:siteUrl(el.attr('href')),title:el.attr('title')||el.text().trim(),jp:el.attr('data-jp'),alt:el.find('img').attr('alt'),format:formatKey(el.closest('.inner').find('.ani.poster .right').first().text())};}catch{return null;}}).get().filter(Boolean);}
function seasonNamed(title){return /(?:season|series|part|cour)\s*\d+|\d+(?:st|nd|rd|th)\s*season|final\s+(?:season|series)|\s(?:ii|iii|iv|v|vi)$/i.test(title);}
function variantKey(title,format){
 let value=String(title||'').replace(/\bfinal\s+series\b/ig,'final season').replace(/\bseries\s*(\d+)\b/ig,'season $1');
 if(!/(?:season|part|cour|series)\s*\d+$/i.test(value))value=value.replace(/\s+(\d+)$/,' season $1');
 if(format==='MOVIE')value=value.replace(/\bmovie\s*:?\s*/ig,'');
 return titleKey(value);
}
function chooseTitle(items,title,season,aliases=[],mediaFormat,episodeCount){
 const format=formatKey(mediaFormat);if(format)items=items.filter(x=>!x.format||formatKey(x.format)===format);
 const names=[title,...aliases],matching=t=>items.filter(x=>[x.title,x.jp,x.alt].some(v=>v&&titleKey(v)===titleKey(t)));
 const unique=rows=>[...new Map(rows.map(x=>[titleIdentity(x.url),x])).values()];
 const named=seasonNamed(title),safeNames=names.filter(v=>!named||season<=1||seasonNamed(v)||/\s\d+$/.test(v));
 let hits=season>1&&!named?matching(title+' Season '+season):[],seasonal=named||hits.length>0;
 if(!hits.length)hits=matching(title);
 if(!hits.length)hits=safeNames.slice(1).flatMap(matching);
 let matches=unique(hits);
 if(matches.length>1)throw Error('Anikoto returned ambiguous title matches');
 if(matches.length===1)return {...matches[0],seasonal:seasonal||[matches[0].title,matches[0].jp,matches[0].alt].some(seasonNamed)};
 // Only equivalent complete names; never fuzzy franchise/substring or first-result selection.
 matches=unique(items.filter(x=>[x.title,x.jp,x.alt].some(v=>v&&safeNames.some(t=>variantKey(v,format)===variantKey(t,format)))));
 if(matches.length>1)throw Error('Anikoto returned ambiguous alternate title matches');
 if(matches.length===1)return {...matches[0],seasonal:seasonal||[matches[0].title,matches[0].jp,matches[0].alt].some(seasonNamed)||[matches[0].title,matches[0].jp].some(seasonNamed)};
 // A provider explicitly combining parts 1+2 can supply a bounded first-part catalog.
 // Later parts need a standalone exact match; no offset or missing episodes are invented.
 if(format==='TV'&&Number.isInteger(episodeCount)&&episodeCount>0&&episodeCount<=3000&&season<=1&&!names.some(v=>/(?:part|cour)\s*[2-9]|\s[2-9]$|[2-9](?:st|nd|rd|th)\s*season/i.test(v))){
  matches=unique(items.filter(x=>[x.title,x.jp,x.alt].some(v=>{const m=String(v||'').match(/^(.*?)\s*\(part\s*1\s*\+\s*2\)$/i);return m&&names.some(t=>titleKey(t)===titleKey(m[1]));})));
  if(matches.length>1)throw Error('Anikoto returned ambiguous combined title matches');
  if(matches.length===1)return {...matches[0],seasonal:true,combinedFirst:true};
 }
 return null;
}
function pageId(html,url){const $=load(html),page=$('.watch-wrap[data-id]');if(page.length!==1||!/^\d+$/.test(page.attr('data-id')||''))throw Error('Anikoto title metadata unavailable');if(titleIdentity(url)!==titleIdentity(page.attr('data-url')))throw Error('Anikoto returned a different title');return page.attr('data-id');}
function episodes(html){const $=load(html);return $('a[data-num][data-id][data-ids]').map((_,a)=>{const e=$(a),number=Number(e.attr('data-num'));return Number.isInteger(number)&&number>0&&number<=3000&&/^\d+$/.test(e.attr('data-id')||'')?{number,id:e.attr('data-id'),servers:e.attr('data-ids'),title:e.closest('li').attr('title')||'',sub:Number(e.attr('data-sub'))>0,dub:Number(e.attr('data-dub'))>0}:null;}).get().filter(Boolean);}
function serverIds(html,audio,episodeId){const $=load(html);return [...new Set($('[data-type]').filter((_,e)=>$(e).attr('data-type')===audio).find('li[data-link-id]').filter((_,e)=>$(e).attr('data-ep-id')===episodeId).map((_,e)=>$(e).attr('data-link-id')).get().filter(Boolean))].slice(0,3);}
async function result(read,url){const text=await read(url);let response;try{response=JSON.parse(text);}catch{throw Error('Anikoto returned an invalid response');}if(response?.status!==200||!response.result)throw Error('Anikoto catalog is temporarily unavailable');return response.result;}
async function listing(read,title,season,aliases,mediaFormat,episodeCount){
 const key=JSON.stringify([title,season,aliases,formatKey(mediaFormat),episodeCount||null]),hit=cache.get(key);if(hit&&Date.now()-hit.at<120000)return hit.value;
 let match=null;for(const query of [...new Map([title,...aliases].map(v=>[titleKey(v),v])).values()].slice(0,4)){match=chooseTitle(titles(await read(BASE+'/filter?keyword='+encodeURIComponent(query))),title,season,aliases,mediaFormat,episodeCount);if(match)break;}if(!match)return {episodes:[],seasonal:true};
 const id=pageId(await read(match.url),match.url),html=await result(read,BASE+'/ajax/episode/list/'+id);if(typeof html!=='string')throw Error('Anikoto episode list unavailable');
 let listed=episodes(html);if(match.combinedFirst){if(listed.length<=episodeCount||!Array.from({length:episodeCount},(_,i)=>i+1).every(n=>listed.some(e=>e.number===n)))throw Error('Anikoto combined listing has incomplete first-part boundaries');listed=listed.filter(e=>e.number<=episodeCount);}
 const value={episodes:listed,seasonal:match.seasonal};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value});return value;
}
async function metadata(read,title,number,audio,request={}){
 const aliases=[...new Set((Array.isArray(request.titleAliases)?request.titleAliases:[]).filter(v=>typeof v==='string'&&v.trim()&&v.length<=200&&v!==title))].slice(0,8);
 const season=request.seasonNumber??1;if(!Number.isInteger(season)||season<1)throw Error('Anikoto specials require their own title');if(!['sub','dub'].includes(audio))throw Error('Unsupported Anikoto audio');if(!Number.isInteger(number)||number<1)throw Error('Invalid episode number');
 try{const data=await listing(read,title,season,aliases,request.mediaFormat,request.episodeCount);if(request.catalogOnly){if(season>1&&!data.seasonal)throw Error('Anikoto needs an exact season title to list episodes');return {episodes:data.episodes.filter(e=>e[audio]).map(e=>e.number)};}
 const target=data.seasonal||season<=1?number:Number(request.absoluteEpisodeNum),named=request.episodeTitle?data.episodes.filter(e=>norm(e.title)===norm(request.episodeTitle)):[];if((!Number.isInteger(target)||target<1)&&named.length!==1)throw Error('Anikoto needs an absolute episode number or unique episode title for this season');
 const matches=(named.length===1?named:data.episodes.filter(e=>e.number===target)).filter(e=>e[audio]);if(matches.length!==1)throw Error('Anikoto does not list this episode and audio');
 const episode=matches[0],html=await result(read,BASE+'/ajax/server/list?servers='+encodeURIComponent(episode.servers)),ids=serverIds(html,audio,episode.id),urls=[];
 for(const id of ids){try{const server=await result(read,BASE+'/ajax/server?get='+encodeURIComponent(id)),u=new URL(server.url);if(u.protocol==='https:'&&!u.username&&!u.password)urls.push(u.href);}catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw error;}}
 if(!urls.length)throw Error('Anikoto has no usable server for this episode and audio');return [...new Set(urls)];
 }catch(error){cache.delete(JSON.stringify([title,season,aliases,formatKey(request.mediaFormat),request.episodeCount||null]));throw error;}
}
module.exports={BASE,titleIdentity,titleKey,formatKey,titles,chooseTitle,pageId,episodes,serverIds,metadata,cache};
