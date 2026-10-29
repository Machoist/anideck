'use strict';
const {load}=require('cheerio');
const {norm}=require('./hianime');
const BASE='https://anikototv.to',cache=new Map();
function siteUrl(value){const u=new URL(value,BASE);if(u.origin!==BASE||u.username||u.password||!u.pathname.startsWith('/watch/'))throw Error('Unexpected Anikoto title address');return u.href;}
function titles(html){const $=load(html);return $('a[href*="/watch/"]').map((_,a)=>{const el=$(a);try{return {url:siteUrl(el.attr('href')),title:el.attr('title')||el.text().trim(),jp:el.attr('data-jp'),alt:el.find('img').attr('alt')};}catch{return null;}}).get().filter(Boolean);}
function chooseTitle(items,title,season,aliases=[]){
 const named=/season\s*\d+|\d+(?:st|nd|rd|th)\s*season|\s(?:ii|iii|iv|v|vi)$/i.test(title),matching=t=>items.filter(x=>[x.title,x.jp,x.alt].some(v=>v&&norm(v)===norm(t)));
 let hits=season>1&&!named?matching(title+' Season '+season):[];const seasonal=named||hits.length>0;if(!hits.length)hits=matching(title);
 const unique=[...new Map(hits.map(x=>[x.url,x])).values()];if(!unique.length){const alternate=aliases.filter(v=>!named||season<=1||/season\s*\d+|\d+(?:st|nd|rd|th)\s*season|\s(?:ii|iii|iv|v|vi)$/i.test(v)).map(v=>chooseTitle(items,v,season)).filter(Boolean),matches=[...new Map(alternate.map(x=>[x.url,x])).values()];if(matches.length>1)throw Error('Anikoto returned ambiguous alternate title matches');return matches[0]||null;}if(unique.length!==1)throw Error('Anikoto returned ambiguous title matches');return {...unique[0],seasonal};
}
function pageId(html,url){const $=load(html),page=$('.watch-wrap[data-id]');if(page.length!==1||!/^\d+$/.test(page.attr('data-id')||''))throw Error('Anikoto title metadata unavailable');const canonical=siteUrl(page.attr('data-url'));if(new URL(url).pathname.replace(/\/ep-[^/]+\/?$/,'').replace(/\/$/,'')!==new URL(canonical).pathname.replace(/\/$/,''))throw Error('Anikoto returned a different title');return page.attr('data-id');}
function episodes(html){const $=load(html);return $('a[data-num][data-id][data-ids]').map((_,a)=>{const e=$(a),number=Number(e.attr('data-num'));return Number.isInteger(number)&&number>0&&number<=3000&&/^\d+$/.test(e.attr('data-id')||'')?{number,id:e.attr('data-id'),servers:e.attr('data-ids'),title:e.closest('li').attr('title')||'',sub:Number(e.attr('data-sub'))>0,dub:Number(e.attr('data-dub'))>0}:null;}).get().filter(Boolean);}
function serverIds(html,audio,episodeId){const $=load(html);return [...new Set($('[data-type]').filter((_,e)=>$(e).attr('data-type')===audio).find('li[data-link-id]').filter((_,e)=>$(e).attr('data-ep-id')===episodeId).map((_,e)=>$(e).attr('data-link-id')).get().filter(Boolean))].slice(0,3);}
async function result(read,url){const text=await read(url);let response;try{response=JSON.parse(text);}catch{throw Error('Anikoto returned an invalid response');}if(response?.status!==200||!response.result)throw Error('Anikoto catalog is temporarily unavailable');return response.result;}
async function listing(read,title,season,aliases){
 const key=JSON.stringify([title,season,aliases]),hit=cache.get(key);if(hit&&Date.now()-hit.at<120000)return hit.value;
 let match=null;for(const query of [title,...aliases.slice(0,2)]){match=chooseTitle(titles(await read(BASE+'/filter?keyword='+encodeURIComponent(query))),title,season,aliases);if(match)break;}if(!match)return {episodes:[],seasonal:true};
 const id=pageId(await read(match.url),match.url),html=await result(read,BASE+'/ajax/episode/list/'+id);if(typeof html!=='string')throw Error('Anikoto episode list unavailable');
 const value={episodes:episodes(html),seasonal:match.seasonal};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value});return value;
}
async function metadata(read,title,number,audio,request={}){
 const aliases=[...new Set((Array.isArray(request.titleAliases)?request.titleAliases:[]).filter(v=>typeof v==='string'&&v.trim()&&v.length<=200&&v!==title))].slice(0,8);
 const season=request.seasonNumber??1;if(!Number.isInteger(season)||season<1)throw Error('Anikoto specials require their own title');if(!['sub','dub'].includes(audio))throw Error('Unsupported Anikoto audio');if(!Number.isInteger(number)||number<1)throw Error('Invalid episode number');
 try{const data=await listing(read,title,season,aliases);if(request.catalogOnly){if(season>1&&!data.seasonal)throw Error('Anikoto needs an exact season title to list episodes');return {episodes:data.episodes.filter(e=>e[audio]).map(e=>e.number)};}
 const target=data.seasonal||season<=1?number:Number(request.absoluteEpisodeNum),named=request.episodeTitle?data.episodes.filter(e=>norm(e.title)===norm(request.episodeTitle)):[];if((!Number.isInteger(target)||target<1)&&named.length!==1)throw Error('Anikoto needs an absolute episode number or unique episode title for this season');
 const matches=(named.length===1?named:data.episodes.filter(e=>e.number===target)).filter(e=>e[audio]);if(matches.length!==1)throw Error('Anikoto does not list this episode and audio');
 const episode=matches[0],html=await result(read,BASE+'/ajax/server/list?servers='+encodeURIComponent(episode.servers)),ids=serverIds(html,audio,episode.id),urls=[];
 for(const id of ids){try{const server=await result(read,BASE+'/ajax/server?get='+encodeURIComponent(id)),u=new URL(server.url);if(u.protocol==='https:'&&!u.username&&!u.password)urls.push(u.href);}catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw error;}}
 if(!urls.length)throw Error('Anikoto has no usable server for this episode and audio');return [...new Set(urls)];
 }catch(error){cache.delete(JSON.stringify([title,season,aliases]));throw error;}
}
module.exports={BASE,titles,chooseTitle,pageId,episodes,serverIds,metadata,cache};
