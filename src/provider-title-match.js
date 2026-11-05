'use strict';
const clean=s=>String(s||'').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]*>/g,'').trim();
const norm=s=>clean(s).normalize('NFKC').toLowerCase().replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g,'season $1').replace(/\(tv\)/g,'').replace(/[^\p{L}\p{N}]/gu,'');
// These suffixes distinguish seasons/specials (K-On!!, Quintuplets ~/*/∬); ordinary punctuation still normalizes.
function titleKey(value){const raw=String(value||'').normalize('NFKC').replace(/\(tv\)/gi,'').trim(),suffix=raw.match(/[!?:;~〜'’′*+\p{S}]+$/u)?.[0]||'';return norm(raw)+'|'+suffix;}
function formatKey(value){const key=String(value||'').toUpperCase().replace(/[^A-Z]/g,'');return key==='TVSHORT'?'TV':['TV','MOVIE','ONA','OVA','SPECIAL','MUSIC'].includes(key)?key:'';}
function seasonNamed(title){return /(?:season|series|part|cour)\s*\d+|\d+(?:st|nd|rd|th)\s*season|final\s+(?:season|series)|\s(?:ii|iii|iv|v|vi)$/i.test(title);}
function variantKey(title,format){
 let value=String(title||'').replace(/\bfinal\s+series\b/ig,'final season').replace(/\bseries\s*(\d+)\b/ig,'season $1');
 if(!/(?:season|part|cour|series)\s*\d+$/i.test(value))value=value.replace(/\s+(\d+)$/,' season $1');
 if(format==='MOVIE')value=value.replace(/\bmovie\s*:?\s*/ig,'');
 return titleKey(value);
}
function laterPart(title){const part=String(title||'').match(/(?:part|cour)\s*(\d+)/i)||String(title||'').match(/\s(\d+)$/);return !!part&&Number(part[1])>1;}
// Discovery only: provider franchise numbering can differ before an explicit named arc.
// Never remove trailing cour/season qualifiers or accept this key without independent metadata.
function arcKey(title){return titleKey(clean(title).replace(/\s+part\s+\d+\s*:\s*(?=\S)/i,': '));}
function identityCandidates(items,title,aliases,format){
 const names=[title,...aliases],keys=new Set(names.map(arcKey));
 return [...new Map(items.filter(x=>(!formatKey(format)||formatKey(x.format)===formatKey(format))&&[x.title,x.jp,x.alt].some(v=>v&&keys.has(arcKey(v))&&names.some(t=>arcKey(t)===arcKey(v)&&titleKey(t)!==titleKey(v)))).map(x=>[x.url,x])).values()];
}
function verifiedIdentity(actual,request){
 const year=Number(request.catalogYear),count=Number(request.episodeCount),description=norm(request.catalogSynopsis);
 const alternate=(request.titleAliases||[]).some(name=>norm(name).length>=16&&(actual.titles||[]).some(value=>titleKey(value)===titleKey(name)));
 const story=description.length>=160&&norm(actual.synopsis).startsWith(description.slice(0,160));
 return year>=1900&&year<=2200&&count>0&&count<=3000&&(alternate||story)&&actual.year===year&&actual.episodes===count&&formatKey(actual.format)===formatKey(request.mediaFormat)&&!!formatKey(request.mediaFormat);
}
function declaredSeason(title){const m=String(title||'').match(/^(.*?)\s*(?:(\d+)(?:st|nd|rd|th)\s+season|(?:season|series)\s*(\d+)|\s(\d+))$/i);return m&&m[1].trim()?{base:titleKey(m[1].trim()),number:Number(m[2]||m[3]||m[4])}:null;}
function chooseTitle(items,title,season,aliases=[],mediaFormat,episodeCount,{identity=x=>x.url,label="Provider"}={}){
 const format=formatKey(mediaFormat);if(format)items=items.filter(x=>!x.format||formatKey(x.format)===format);
 const names=[title,...aliases],requested=declaredSeason(title),bases=new Set(names.map(v=>declaredSeason(v)?.base||titleKey(v))),wanted=requested?.number||season;
 // Some catalogs reuse the English title for every season. A same-franchise explicit alternate season is stronger evidence.
 items=items.filter(x=>![x.title,x.jp,x.alt].some(v=>{const declared=declaredSeason(v);return declared&&bases.has(declared.base)&&declared.number!==wanted;}));
 const matching=t=>items.filter(x=>[x.title,x.jp,x.alt].some(v=>v&&titleKey(v)===titleKey(t)));
 const unique=rows=>[...new Map(rows.map(x=>[identity(x),x])).values()];
 const named=seasonNamed(title),safeNames=names.filter(v=>!named||season<=1||seasonNamed(v)||/\s\d+$/.test(v));
 let hits=season>1&&!named?matching(title+' Season '+season):[],seasonal=named||hits.length>0;
 if(!hits.length)hits=matching(title);
 if(!hits.length)hits=safeNames.slice(1).flatMap(matching);
 let matches=unique(hits);
 if(matches.length>1&&requested){const exact=matches.filter(x=>[x.title,x.jp,x.alt].some(v=>v&&variantKey(v,format)===variantKey(title,format)));if(exact.length===1)matches=exact;}
 if(matches.length>1)throw Error(label+' returned ambiguous title matches');
 if(matches.length===1)return {...matches[0],seasonal:seasonal||[matches[0].title,matches[0].jp,matches[0].alt].some(seasonNamed)};
 // Only equivalent complete names; never fuzzy franchise/substring or first-result selection.
 matches=unique(items.filter(x=>[x.title,x.jp,x.alt].some(v=>v&&safeNames.some(t=>variantKey(v,format)===variantKey(t,format)))));
 if(matches.length>1)throw Error(label+' returned ambiguous alternate title matches');
 if(matches.length===1)return {...matches[0],seasonal:seasonal||[matches[0].title,matches[0].jp,matches[0].alt].some(seasonNamed)||[matches[0].title,matches[0].jp].some(seasonNamed)};
 // A provider explicitly combining parts 1+2 can supply a bounded first-part catalog.
 // Later parts need a standalone exact match; no offset or missing episodes are invented.
 if(format==='TV'&&Number.isInteger(episodeCount)&&episodeCount>0&&episodeCount<=3000&&season<=1&&!laterPart(title)){
  matches=unique(items.filter(x=>[x.title,x.jp,x.alt].some(v=>{const m=String(v||'').match(/^(.*?)\s*\(part\s*1\s*\+\s*2\)$/i);return m&&names.some(t=>titleKey(t)===titleKey(m[1]));})));
  if(matches.length>1)throw Error(label+' returned ambiguous combined title matches');
  if(matches.length===1)return {...matches[0],seasonal:true,combinedFirst:true};
 }
 return null;
}

function aliases(request,title){return [...new Set((Array.isArray(request.titleAliases)?request.titleAliases:[]).filter(v=>typeof v==='string'&&v.trim()&&v.length<=200&&v!==title))].slice(0,8);}
function boundEpisodes(listed,match,count,label){if(!match.combinedFirst)return listed;if(listed.length<=count||!Array.from({length:count},(_,i)=>i+1).every(n=>listed.some(e=>e.number===n)))throw Error(label+' combined listing has incomplete first-part boundaries');return listed.filter(e=>e.number<=count);}
module.exports={norm,titleKey,formatKey,chooseTitle,aliases,boundEpisodes,identityCandidates,verifiedIdentity};
