'use strict';
// Serialized into the provider window: only reads public player track metadata.
function discoverSubtitleTracks(){
 const candidates=[...document.querySelectorAll('track')].map(t=>({url:t.src||t.getAttribute('src'),label:t.label,language:t.srclang,kind:t.kind,default:t.default}));
 try{if(typeof window.jwplayer==='function'){const p=window.jwplayer();for(const t of p.getPlaylist?.()?.[0]?.tracks||[])candidates.push(t);}}catch{}
 const seen=new Set(),out=[];
 for(const t of candidates){
  if(t.kind&&!['captions','subtitles'].includes(String(t.kind).toLowerCase()))continue;
  const address=t.url||t.file||t.src;if(typeof address!=='string'||!address.trim())continue;
  try{const url=new URL(address,location.href);if(!['https:','http:'].includes(url.protocol)||seen.has(url.href))continue;seen.add(url.href);out.push({url:url.href,label:String(t.label||t.language||'Subtitles').slice(0,80),language:String(t.language||t.srclang||'und').slice(0,20),default:!!t.default});}catch{}
 }
 return out.slice(0,20);
}
module.exports={discoverSubtitleTracks};
