const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{load}=require('cheerio');
const src=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8'),part=src.slice(src.indexOf('const relationsCache ='),src.indexOf('// "now", "5m"'));
function fixture(){const $=load('<section id="related-box"><div class="rel-list"><button data-id="library-1">Library season</button></div></section>');const box=$('#related-box')[0],list=$('.rel-list')[0];
 box.querySelector=()=>list;list.querySelectorAll=selector=>$(list).find(selector).get().map(el=>({dataset:{id:$(el).attr('data-id')},remove:()=>$(el).remove()}));list.insertAdjacentHTML=(_pos,html)=>$(list).append(html);
 const row={relation:'PREQUEL',anime:{id:'al:42',title:'Earlier season',titles:[],subtype:'TV'}};let rows=[row,row,{...row,relation:'SEQUEL'},{relation:'SEQUEL',anime:{id:'al:99',title:'Self'}}];
 const App={showMediaId:async()=>99,showCtx:{id:null},stale:()=>false},ctx={App,$:()=>box,AniList:{relations:async()=>rows},REL_ORDER:['PREQUEL','SEQUEL'],esc:s=>String(s||''),relLabel:s=>s};
 return {$,App,ctx,fill:vm.runInNewContext(part+';fillRelated',ctx)};}
test('repeated and concurrent Related fills keep one card per title and preserve library rows',async()=>{const f=fixture();for(let i=0;i<15;i++)await f.fill(1);await Promise.all([f.fill(1),f.fill(1)]);assert.equal(f.$('[data-related-generated]').length,1);assert.equal(f.$('[data-id="library-1"]').length,1);assert.equal(f.$('[data-id="al:99"]').length,0);assert.match(f.$('[data-related-generated]').text(),/PREQUEL/);});
test('a stale Related response cannot append into the current page',async()=>{const f=fixture();f.App.stale=()=>true;await f.fill(1);assert.equal(f.$('[data-related-generated]').length,0);assert.equal(f.$('[data-id="library-1"]').length,1);});

test('embedded title relations need no second AniList request, even during a rate limit',async()=>{
 const rows=[{relation:'PREQUEL',anime:{id:'al:6702'}}],ctx={App:{showAl:{id:20626,relations:rows},showCtx:{match:{id:'8203'}},stale:()=>false},AniList:{relations:()=>{throw Error('No extra request');}}};const read=vm.runInNewContext(part+';titleRelations',ctx);const r=await read(1);assert.equal(r.rels,rows);assert.equal(r.id,20626);
});
test('Kitsu exact related media stays usable when AniList is limited, with stale-page guards',async()=>{
 let calls=0;const rows=[{relation:'PREQUEL',anime:{id:'4676'}}],ctx={App:{showAl:{id:20626},showCtx:{match:{id:'8203'}},stale:()=>false},AniList:{relations:async()=>{throw Object.assign(Error('Rate limited'),{status:429});}},Kitsu:{relations:async id=>{calls++;assert.equal(id,'8203');return rows;}}};const read=vm.runInNewContext(part+';titleRelations',ctx);assert.equal((await read(1)).rels,rows);assert.equal(calls,1);ctx.App.stale=()=>true;await assert.rejects(read(1));assert.equal(calls,1);
});
test('Kitsu related records include only exact anime destinations, cache in-flight reads and retry failures',async()=>{
 const api=fs.readFileSync(require('node:path').join(__dirname,'../src/api.js'),'utf8'),ctx={Map,Set,URLSearchParams,window:{native:{}},console},Kitsu=vm.runInNewContext(api+';Kitsu',ctx);let calls=0,fail=false;
 Kitsu.call=async url=>{calls++;assert.match(url,/\/edge\/anime\/8203\/media-relationships/);if(fail)throw Error('Offline');return {data:[{attributes:{role:'prequel'},relationships:{destination:{data:{type:'anime',id:'4676'}}}},{attributes:{role:'adaptation'},relationships:{destination:{data:{type:'manga',id:'4676'}}}},{attributes:{role:'sequel'},relationships:{destination:{data:{type:'anime',id:'999'}}}}],included:[{id:'4676',type:'anime',attributes:{canonicalTitle:'Fairy Tail',posterImage:{},subtype:'TV'}},{id:'4676',type:'manga',attributes:{canonicalTitle:'Manga'}}]};};
 const [a,b]=await Promise.all([Kitsu.relations('8203'),Kitsu.relations('8203')]);assert.equal(calls,1);assert.equal(a,b);assert.equal(a.length,1);assert.equal(a[0].relation,'PREQUEL');assert.equal(a[0].anime.id,'4676');await assert.rejects(Kitsu.relations('al:20626'),/exact/);
 Kitsu.relationCache.clear();fail=true;await assert.rejects(Kitsu.relations('8203'));fail=false;await Kitsu.relations('8203');assert.equal(calls,3);
});
