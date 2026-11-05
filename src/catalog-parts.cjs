/* Reconcile a combined catalog entry only through exact IDs and explicit sequel edges. */
'use strict';
const {titleKey,formatKey}=require('./provider-title-match'),BASE='https://kitsu.io/api/edge',cache=new Map();
const numeric=value=>/^[1-9][0-9]{0,8}$/.test(String(value||''));
function names(row){const a=row?.attributes||{};return [...new Set([a.canonicalTitle,...Object.values(a.titles||{}),...(a.abbreviatedTitles||[])].filter(v=>typeof v==='string'&&v.trim()))];}
function partName(name){const m=String(name||'').match(/^(.*?)\s+part\s+(\d+)$/i);return m?{base:titleKey(m[1].replace(/\s+part\s+\d+\s*:\s*/i,': ')),number:Number(m[2])}:null;}
function alMappings(response,row){const ids=new Set((row.relationships?.mappings?.data||[]).map(x=>String(x.id)));return (response.included||[]).filter(x=>x.type==='mappings'&&ids.has(String(x.id))&&x.attributes?.externalSite==='anilist/anime').map(x=>String(x.attributes.externalId));}
async function collect(read,request){
 const expected=Number(request.episodeCount),al=String(request.catalogAniListId||''),wanted=partName(request.title);
 if(!wanted||wanted.number<2||!numeric(al)||!Number.isInteger(expected)||expected<2||expected>3000)return null;
 const json=async url=>JSON.parse(await read(url));let id=String(request.catalogKitsuId||'');
 if(!numeric(id)){
  const response=await json(BASE+'/mappings?filter[externalSite]=anilist%2Fanime&filter[externalId]='+al+'&include=item');
  const matches=(response.data||[]).filter(x=>x.attributes?.externalSite==='anilist/anime'&&String(x.attributes.externalId)===al&&x.relationships?.item?.data?.type==='anime');
  const ids=[...new Set(matches.map(x=>String(x.relationships.item.data.id)))];if(ids.length!==1||!numeric(ids[0]))return null;id=ids[0];
 }
 let response=await json(BASE+'/anime/'+id+'?include=mappings'),row=response.data;
 if(row?.type!=='anime'||String(row.id)!==id||!alMappings(response,row).includes(al))return null;
 const firstLabels=names(row).map(partName).filter(Boolean);if(!firstLabels.some(x=>x.number===wanted.number&&x.base===wanted.base))return null;
 const baseYear=Number(String(row.attributes?.startDate||'').slice(0,4)),parts=[],visited=new Set();let total=0;
 for(let n=0;n<4;n++){
  const a=row.attributes||{},count=Number(a.episodeCount),year=Number(String(a.startDate||'').slice(0,4));
  if(visited.has(String(row.id))||!Number.isInteger(count)||count<1||count>3000||year!==baseYear||!['TV','ONA'].includes(formatKey(a.subtype)))return null;
  const mapped=alMappings(response,row);if(mapped.some(value=>value!==al))return null;
  visited.add(String(row.id));parts.push({id:String(row.id),title:names(row)[0],titles:names(row),episodes:count,year,format:formatKey(request.mediaFormat),offset:total});total+=count;
  if(total===expected)return parts.length>1?parts:null;if(total>expected)return null;
  const relations=await json(BASE+'/anime/'+row.id+'/media-relationships?include=destination&page[limit]=20');
  const edges=(relations.data||[]).filter(e=>e.attributes?.role==='sequel'&&e.relationships?.destination?.data?.type==='anime');
  const ids=[...new Set(edges.map(e=>String(e.relationships.destination.data.id)))];if(ids.length!==1||!numeric(ids[0]))return null;
  response=await json(BASE+'/anime/'+ids[0]+'?include=mappings');const next=response.data;
  if(next?.type!=='anime'||String(next.id)!==ids[0]||!names(next).map(partName).filter(Boolean).some(x=>x.number===wanted.number+parts.length&&x.base===wanted.base))return null;
  row=next;
 }
 return null;
}
async function load(read,request){
 const key=JSON.stringify([request.catalogKitsuId,request.catalogAniListId,request.title,request.episodeCount,request.mediaFormat]),saved=cache.get(key);if(saved&&Date.now()-saved.at<600000)return saved.promise;
 const entry={at:Date.now(),promise:null};entry.promise=collect(read,request).then(value=>{if(!value)cache.delete(key);return value;},error=>{cache.delete(key);throw error;});
 if(cache.size>=80)cache.delete(cache.keys().next().value);cache.set(key,entry);return entry.promise;
}
module.exports={load,cache,partName};
