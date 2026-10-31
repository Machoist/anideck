const {test}=require('node:test'),assert=require('node:assert/strict');
for(const name of ['hianime','aniwatch']){
 const api=require('../src/'+name),title='Haikyuu!!: To the Top';
 const request={seasonNumber:1,mediaFormat:'TV',episodeCount:13,titleAliases:['Haikyuu!! Fourth Season','Haikyuu!! 4th Season','Haikyuu 4','HAIKYU!! TO THE TOP'],catalogOnly:true};
 const clear=()=>{api.listingCache?.clear();api.searchCache?.clear();};
 function fixture({gap=false,duplicate=false}={}){return async url=>{
  if(url.includes('/browse?')||url.includes('/?s=')){
   const link=id=>`<h3><a href="${api.BASE}/${name==='hianime'?'watch/':''}haikyuu-to-the-top-${id}" title="Haikyuu!!: To the Top (Part 1+2)" data-id="${id}"></a></h3>`;
   return '<div id="main-content">'+link(933)+(duplicate?link(934):'')+'</div>';
  }
  if(url.includes('/episode/list/'))return JSON.stringify({status:true,html:Array.from({length:25},(_,i)=>i+1).filter(n=>!gap||n!==7).map(n=>`<a class="ep-item" data-number="${n}" data-id="${1000+n}" href="${api.BASE}/haikyuu-episode-${n}/"></a>`).join('')});
  return '<div id="ani_detail" data-anime-id="933"></div>';
 };}
 test(name+' lists only verified first-part entries with the complete renderer aliases',async()=>{
  clear();assert.deepEqual((await api.metadata(fixture(),title,1,'sub',request)).episodes,Array.from({length:13},(_,i)=>i+1));
  await assert.rejects(api.metadata(fixture(),title,14,'sub',{...request,catalogOnly:false}),/does not list|unavailable/);
  clear();assert.deepEqual((await api.metadata(fixture(),title+' Part 2',1,'sub',{...request,episodeCount:12,titleAliases:[title+' 2']})).episodes,[]);
 });
 test(name+' rejects incomplete combined boundaries, ambiguous matches and failed requests',async()=>{
  clear();await assert.rejects(api.metadata(fixture({gap:true}),title,1,'sub',request),/incomplete first-part/);
  clear();await assert.rejects(api.metadata(fixture({duplicate:true}),title,1,'sub',request),/ambiguous/);
  clear();await assert.rejects(api.metadata(async()=>{throw Error('HTTP 503');},title,1,'sub',request),/503/);
 });
}
test('HiAnime explicit second-cour URL can identify Part 2 without treating season and part numbers as synonyms',()=>{
 const api=require('../src/hianime'),items=api.titles(`<a href="${api.BASE}/watch/haikyu-to-the-top-2nd-cour-934" title="Haikyuu!!: To the Top 2nd Season"></a>`);
 assert.equal(api.chooseTitle(items,'Haikyuu!!: To the Top Part 2',1,['HAIKYU!! TO THE TOP Part 2'],'TV',12).id,'934');
 assert.throws(()=>api.chooseTitle(items,'Haikyuu!!: To the Top',1,[],'TV',13),/exact/);
 const combined=api.titles(`<a href="${api.BASE}/watch/haikyu-to-the-top-933" title="Haikyuu!!: To the Top (Part 1+2)"></a>`);
 assert.equal(combined[0].alt,undefined);assert.equal(api.chooseTitle(combined,'Haikyuu!!: To the Top',1,[],'TV',13).combinedFirst,true);
});
