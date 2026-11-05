'use strict';
const {load}=require('cheerio');
const matching=require('./provider-title-match'),{norm,titleKey,formatKey}=matching;
const CatalogParts=require('./catalog-parts.cjs');
const BASE='https://anikototv.to',cache=new Map();
function siteUrl(value){const u=new URL(value,BASE);if(u.origin!==BASE||u.username||u.password||!u.pathname.startsWith('/watch/'))throw Error('Unexpected Anikoto title address');return u.href;}
function titleIdentity(value){const u=new URL(siteUrl(value));return u.origin+u.pathname.replace(/\/ep-[^/]+\/?$/,'').replace(/\/$/,'');}
function titles(html){const $=load(html),rows=new Map();$('a[href*="/watch/"]').each((_,a)=>{const el=$(a);try{const url=siteUrl(el.attr('href')),key=titleIdentity(url),old=rows.get(key),named=el.attr('title');rows.set(key,{url,title:named||(el.attr('data-jp')?el.text().trim():old?.title||el.text().trim()),jp:el.attr('data-jp')||old?.jp,alt:el.find('img').attr('alt')||old?.alt,format:formatKey(el.closest('.inner').find('.ani.poster .right').first().text())||old?.format||''});}catch{}});return [...rows.values()];}
function chooseTitle(items,title,season,aliases=[],mediaFormat,episodeCount){return matching.chooseTitle(items,title,season,aliases,mediaFormat,episodeCount,{identity:x=>titleIdentity(x.url),label:'Anikoto'});}
function pageId(html,url){const $=load(html),page=$('.watch-wrap[data-id]');if(page.length!==1||!/^\d+$/.test(page.attr('data-id')||''))throw Error('Anikoto title metadata unavailable');if(titleIdentity(url)!==titleIdentity(page.attr('data-url')))throw Error('Anikoto returned a different title');return page.attr('data-id');}
function identityMetadata(html){const $=load(html),info=$('.watch-wrap .info').filter((_,e)=>$(e).find('h1.title').length).first(),meta={synopsis:info.find('.synopsis .content').first().text().trim(),titles:[info.find('h1.title').first().text().trim(),info.find('h1.title').first().attr('data-jp'),...info.find('.names').first().text().split(/[;,]/)].filter(Boolean).map(v=>v.trim())};info.find('.bmeta .meta > div').each((_,e)=>{const text=$(e).text().trim();if(/^Type\s*:/i.test(text))meta.format=formatKey($(e).find('span').first().text());if(/^Episodes\s*:/i.test(text))meta.episodes=Number($(e).find('span').first().text().trim());if(/^Premiered\s*:/i.test(text))meta.premieredYear=Number(text.match(/\b(19|20|21)\d{2}\b/)?.[0]);if(/^Aired\s*:/i.test(text))meta.airedYear=Number(text.match(/\b(19|20|21)\d{2}\b/)?.[0]);});meta.year=meta.premieredYear||meta.airedYear||undefined;return meta;}
function episodes(html){const $=load(html);return $('a[data-num][data-id][data-ids]').map((_,a)=>{const e=$(a),number=Number(e.attr('data-num'));return Number.isInteger(number)&&number>0&&number<=3000&&/^\d+$/.test(e.attr('data-id')||'')?{number,id:e.attr('data-id'),servers:e.attr('data-ids'),title:e.closest('li').attr('title')||'',sub:Number(e.attr('data-sub'))>0,dub:Number(e.attr('data-dub'))>0}:null;}).get().filter(Boolean);}
function serverIds(html,audio,episodeId){const $=load(html);return [...new Set($('[data-type]').filter((_,e)=>$(e).attr('data-type')===audio).find('li[data-link-id]').filter((_,e)=>$(e).attr('data-ep-id')===episodeId).map((_,e)=>$(e).attr('data-link-id')).get().filter(Boolean))].slice(0,3);}
async function result(read,url){const text=await read(url);let response;try{response=JSON.parse(text);}catch{throw Error('Anikoto returned an invalid response');}if(response?.status!==200||!response.result)throw Error('Anikoto catalog is temporarily unavailable');return response.result;}
async function splitListing(read,request,found){
 const parts=await CatalogParts.load(read,request);if(!parts)return null;
 const joined=[];
 for(const part of parts){
  const aliases=part.titles.filter(t=>t!==part.title),rows=[...found.values()];let exact=chooseTitle(rows,part.title,1,aliases,part.format,part.episodes);
  let candidates=exact?[exact]:matching.identityCandidates(rows,part.title,aliases,part.format);
  if(!candidates.length){for(const row of titles(await read(BASE+'/filter?keyword='+encodeURIComponent(part.title))))found.set(titleIdentity(row.url),row);exact=chooseTitle([...found.values()],part.title,1,aliases,part.format,part.episodes);candidates=exact?[exact]:matching.identityCandidates([...found.values()],part.title,aliases,part.format);}
  if(candidates.length>4)throw Error('Anikoto returned ambiguous batch matches');const verified=[];
  for(const candidate of candidates){const page=await read(candidate.url),id=pageId(page,candidate.url),data=identityMetadata(page);if(data.year===part.year&&data.episodes===part.episodes&&data.format===part.format)verified.push({id,candidate});}
  if(verified.length>1)throw Error('Anikoto returned ambiguous batch identities');if(!verified.length)continue;
  const html=await result(read,BASE+'/ajax/episode/list/'+verified[0].id);if(typeof html!=='string')throw Error('Anikoto batch episode list unavailable');
  const batch=episodes(html);if(batch.some(e=>e.number>part.episodes))throw Error('Anikoto batch episode boundaries are inconsistent');
  joined.push(...batch.map(e=>({...e,number:part.offset+e.number,providerNumber:e.number,catalogPart:part.id})));
 }
 if(new Set(joined.map(e=>e.number)).size!==joined.length||new Set(joined.map(e=>e.id)).size!==joined.length)throw Error('Anikoto returned ambiguous batch episodes');
 return {episodes:joined,seasonal:true};
}
async function listing(read,title,season,aliases,mediaFormat,episodeCount,request={}){
 const key=JSON.stringify([title,season,aliases,formatKey(mediaFormat),episodeCount||null,request.catalogYear||null,String(request.catalogSynopsis||'').slice(0,220),request.catalogKitsuId||null,request.catalogAniListId||null]),hit=cache.get(key);if(hit&&Date.now()-hit.at<120000)return hit.value;
 const remember=value=>{if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value});return value;};
 const found=new Map();let match=null,matchedPage;
 for(const query of [...new Map([title,...aliases].map(v=>[titleKey(v),v])).values()].slice(0,4)){const rows=titles(await read(BASE+'/filter?keyword='+encodeURIComponent(query)));for(const row of rows)found.set(titleIdentity(row.url),row);match=chooseTitle([...found.values()],title,season,aliases,mediaFormat,episodeCount);if(match)break;}
 if(!match){const combined=await splitListing(read,{...request,title,mediaFormat,episodeCount},found);if(combined)return remember(combined);}
 if(!match&&Number(request.catalogYear)&&(aliases.length||String(request.catalogSynopsis||'').length>=160)){
  const candidates=matching.identityCandidates([...found.values()],title,aliases,mediaFormat);if(candidates.length>4)throw Error('Anikoto returned ambiguous identity candidates');const verified=[];
  for(const candidate of candidates){const page=await read(candidate.url);pageId(page,candidate.url);if(matching.verifiedIdentity(identityMetadata(page),{...request,titleAliases:aliases,mediaFormat,episodeCount}))verified.push({match:{...candidate,seasonal:true,verifiedIdentity:true},page});}
  if(verified.length>1)throw Error('Anikoto returned ambiguous verified identities');if(verified.length){match=verified[0].match;matchedPage=verified[0].page;}
 }
 if(!match)return {episodes:[],seasonal:true};
 const page=matchedPage||await read(match.url);if(identityMetadata(page).episodes<episodeCount){const combined=await splitListing(read,{...request,title,mediaFormat,episodeCount},found);if(combined)return remember(combined);}
 const id=pageId(page,match.url),html=await result(read,BASE+'/ajax/episode/list/'+id);if(typeof html!=='string')throw Error('Anikoto episode list unavailable');
 const listed=matching.boundEpisodes(episodes(html),match,episodeCount,'Anikoto');
 return remember({episodes:listed,seasonal:match.seasonal});
}
async function metadata(read,title,number,audio,request={}){
 const aliases=[...new Set((Array.isArray(request.titleAliases)?request.titleAliases:[]).filter(v=>typeof v==='string'&&v.trim()&&v.length<=200&&v!==title))].slice(0,8);
 const season=request.seasonNumber??1;if(!Number.isInteger(season)||season<1)throw Error('Anikoto specials require their own title');if(!['sub','dub'].includes(audio))throw Error('Unsupported Anikoto audio');if(!Number.isInteger(number)||number<1)throw Error('Invalid episode number');
 try{const data=await listing(read,title,season,aliases,request.mediaFormat,request.episodeCount,request);if(request.catalogOnly){if(season>1&&!data.seasonal)throw Error('Anikoto needs an exact season title to list episodes');return {episodes:data.episodes.filter(e=>e[audio]).map(e=>e.number)};}
 const target=data.seasonal||season<=1?number:Number(request.absoluteEpisodeNum),named=request.episodeTitle?data.episodes.filter(e=>norm(e.title)===norm(request.episodeTitle)):[];if((!Number.isInteger(target)||target<1)&&named.length!==1)throw Error('Anikoto needs an absolute episode number or unique episode title for this season');
 const matches=(named.length===1?named:data.episodes.filter(e=>e.number===target)).filter(e=>e[audio]);if(matches.length!==1)throw Error('Anikoto does not list this episode and audio');
 const episode=matches[0],html=await result(read,BASE+'/ajax/server/list?servers='+encodeURIComponent(episode.servers)),ids=serverIds(html,audio,episode.id),urls=[];
 for(const id of ids){try{const server=await result(read,BASE+'/ajax/server?get='+encodeURIComponent(id)),u=new URL(server.url);if(u.protocol==='https:'&&!u.username&&!u.password)urls.push(u.href);}catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw error;}}
 if(!urls.length)throw Error('Anikoto has no usable server for this episode and audio');return [...new Set(urls)];
 }catch(error){cache.delete(JSON.stringify([title,season,aliases,formatKey(request.mediaFormat),request.episodeCount||null,request.catalogYear||null,String(request.catalogSynopsis||'').slice(0,220),request.catalogKitsuId||null,request.catalogAniListId||null]));throw error;}
}
module.exports={BASE,titleIdentity,titleKey,formatKey,titles,chooseTitle,pageId,identityMetadata,episodes,serverIds,metadata,cache};
