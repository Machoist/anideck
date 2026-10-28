const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const api=vm.runInNewContext(read('synopsis.js')+'\nTitleSynopsis');
test('a season relationship placeholder yields to the same season’s actual plot',()=>{
 const story='Asta and his friends travel into enemy territory to rescue their captains.';
 for(const stub of ['The second season of Black Clover.','Second season of Black Clover. (Source: Catalog)','Sequel to Black Clover.','Season 2 of Black Clover.']){
  assert.equal(api.isStub(stub),true);assert.equal(api.choose(stub,story),story);assert.equal(api.choose(story,stub),story);
 }
});
test('short actual stories and full descriptions remain intact, with no fabricated prequel fallback',()=>{
 const story='A young mage returns home.';assert.equal(api.isStub(story),false);assert.equal(api.choose(story,'A much longer alternative.'),story);
 assert.equal(api.choose('The second season of Example.',''),'The second season of Example.');assert.equal(api.choose(null,null),'');
 assert.equal(api.choose('<p>A &amp; B<br>continue.</p>',''),'A & B\ncontinue.');
 assert.equal(api.isStub('The second season of Example. The team returns to rescue their friends.'),false);
});
test('detail and floating preview both use the season-safe selection, and the helper loads first',()=>{
 assert(read('app.js').includes('const synopsis = TitleSynopsis.choose(a.synopsis, al?.synopsis)'));
 assert(read('app.js').includes('titleStoryMarkup(id,a.synopsis,al?.synopsis)'));
 assert(read('app.js').includes('esc(text)'));
 assert(read('app.js').includes('TitleSynopsis.choose(al?.synopsis,k?.synopsis)'));
 assert(read('index.html').indexOf('synopsis.js')<read('index.html').indexOf('app.js'));
});
test('poster stubs are enriched through the existing exact AniList mapping and cached',async()=>{
 let calls=0;const ctx={document:{readyState:'loading',addEventListener(){}},Kitsu:{animeFull:async()=>({synopsis:'Second season of Example.',subtype:'TV'})},AniList:{details:async id=>{calls++;assert.equal(id,'123');return {synopsis:'The party ventures into a new kingdom.'};}}};
 const poster=vm.runInNewContext(read('synopsis.js')+'\n'+read('card-synopsis.js')+'\nCardSynopsis',ctx);
 assert.equal((await poster.metadata('123')).text,'The party ventures into a new kingdom.');await poster.metadata('123');assert.equal(calls,1);
 poster.cache.clear();ctx.AniList.details=async()=>{throw Error('offline')};assert.equal((await poster.metadata('123')).text,'Second season of Example.');
});
test('AniList poster placeholders also use only the externally mapped Kitsu season',async()=>{
 const ctx={document:{readyState:'loading',addEventListener(){}},AniList:{details:async()=>({id:42,malId:72,synopsis:'Second season of Example.'}),kitsuIdFor:async(id,mal)=>{assert.equal(id,42);assert.equal(mal,72);return '123';}},Kitsu:{animeFull:async id=>{assert.equal(id,'123');return {synopsis:'The party searches for their missing captain.'};}}};
 const poster=vm.runInNewContext(read('synopsis.js')+'\n'+read('card-synopsis.js')+'\nCardSynopsis',ctx);
 assert.equal((await poster.metadata('al:42')).text,'The party searches for their missing captain.');
});

test('additional synopsis source uses exact MAL IDs, validates returned identity and caches shared work',async()=>{
 let calls=0;const ctx={Kitsu:{externalIds:async()=>({mal:123})},http:async url=>{calls++;assert.equal(url,'https://api.jikan.moe/v4/anime/123');return {data:{mal_id:123,synopsis:'The team crosses a dangerous kingdom to rescue their captain.'}}},setTimeout,clearTimeout};
 const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',ctx);
 const values=await Promise.all([helper.resolve('42','Second season of Example.',''),helper.resolve('42','Second season of Example.','')]);assert.equal(calls,1);assert(values.every(v=>v.text.includes('dangerous kingdom')));assert.equal(values[0].source,'MyAnimeList via Jikan');await helper.resolve('42','','');assert.equal(calls,1);
});
test('real synopsis skips fallback requests; missing or mismatched mappings never borrow another story',async()=>{
 let calls=0;const ctx={Kitsu:{externalIds:async()=>({})},http:async()=>{calls++;return {data:{mal_id:999,synopsis:'Wrong story'}}},setTimeout,clearTimeout};const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',ctx);
 assert.equal((await helper.resolve('42','A short real plot.','')).text,'A short real plot.');assert.equal(calls,0);assert.equal((await helper.resolve('42','','')).text,'');assert.equal(calls,0);
 ctx.Kitsu.externalIds=async()=>({mal:123});assert.equal((await helper.resolve('42','Second season of Example.','')).text,'Second season of Example.');assert.equal(helper.cache.size,0);
});
