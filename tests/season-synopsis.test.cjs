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
 let calls=0;const ctx={Kitsu:{externalIds:async()=>({mal:123})},http:async url=>{calls++;assert.equal(url,'https://api.tenrai.org/v1/anime/123');return {data:{mal_id:123,synopsis:'The team crosses a dangerous kingdom to rescue their captain.'}}},setTimeout,clearTimeout};
 const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',ctx);
 const values=await Promise.all([helper.resolve('42','Second season of Example.',''),helper.resolve('42','Second season of Example.','')]);assert.equal(calls,1);assert(values.every(v=>v.text.includes('dangerous kingdom')));assert.equal(values[0].source,'MyAnimeList via Tenrai');await helper.resolve('42','','');assert.equal(calls,1);
});
test('real synopsis skips fallback requests; missing or mismatched mappings never borrow another story',async()=>{
 let calls=0;const ctx={Kitsu:{externalIds:async()=>({})},http:async()=>{calls++;return {data:{mal_id:999,synopsis:'Wrong story'}}},setTimeout,clearTimeout};const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',ctx);
 assert.equal((await helper.resolve('42','A short real plot.','')).text,'A short real plot.');assert.equal(calls,0);assert.equal((await helper.resolve('42','','')).text,'');assert.equal(calls,0);
 ctx.Kitsu.externalIds=async()=>({mal:123});assert.equal((await helper.resolve('42','Second season of Example.','')).text,'Second season of Example.');assert.equal(helper.cache.size,0);
});

test('unmapped titles do not display an indefinite synopsis loading state',()=>{
 const src=read('app.js'),start=src.indexOf('function titleStoryMarkup('),end=src.indexOf('async function enrichTitleStory(',start),render=vm.runInNewContext(src.slice(start,end)+';titleStoryMarkup',{TitleSynopsis:api,esc:s=>String(s)});assert(!render(null,'Second season of Example.').includes('Looking for'));assert(render('42','Second season of Example.').includes('Looking for'));
});


test('a failed first source uses the second exact-ID source with no challenge windows',async()=>{
 const requests=[];const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',{setTimeout,clearTimeout,http:async(url,options)=>{requests.push({url,options});if(url.includes('tenrai'))throw Error('offline');return {data:{mal_id:72,synopsis:'The expedition begins its journey through a frozen kingdom.'}};}});
 const value=await helper.resolve('al:42','Second season of Example.','',{id:42,malId:72});assert.equal(value.source,'MyAnimeList via Jikan');assert.equal(requests.length,2);assert(requests.every(r=>r.options.allowChallenge===false&&r.options.timeout===3000));
});

test('failed shared work keeps each caller’s own placeholder and backs off repeated reads',async()=>{
 let calls=0;const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',{setTimeout,clearTimeout,http:async()=>{calls++;throw Error('offline')}});
 const media={id:42,malId:72};const [a,b]=await Promise.all([helper.resolve('al:42','Second season of Example.','',media),helper.resolve('al:42','Sequel to Example.','',media)]);
 assert.equal(a.text,'Second season of Example.');assert.equal(b.text,'Sequel to Example.');assert.equal(calls,2);assert.equal(helper.pending.size,0);
 await helper.resolve('al:42','','',media);assert.equal(calls,2);
 helper.retry.set('72',0);helper.slots.clear();await helper.resolve('al:42','','',media);assert.equal(calls,4);
});

test('rate-limited source is skipped for other titles while the alternate remains usable',async()=>{
 let firstCalls=0;const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',{setTimeout,clearTimeout,http:async url=>{if(url.includes('tenrai')){firstCalls++;throw Object.assign(Error('busy'),{status:429});}return {data:{mal_id:Number(url.split('/').pop()),synopsis:'The team begins a perilous journey across the sea.'}};}});
 await helper.resolve('al:42','','',{id:42,malId:72});helper.slots.delete('https://api.jikan.moe/v4/anime/');
 assert.equal((await helper.resolve('al:43','','',{id:43,malId:73})).source,'MyAnimeList via Jikan');assert.equal(firstCalls,1);
});

test('stalled mappings settle, and a stale page mapping cannot supply another season',async()=>{
 let calls=0;const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',{setTimeout,clearTimeout,AniZip:{get:()=>new Promise(()=>{})},http:async()=>{calls++;}});
 const bounded=helper.bounded;helper.bounded=function(task){return bounded.call(this,task,10)};
 const result=await helper.resolve('al:42','Second season of Example.','',{id:99,malId:123});assert.equal(result.text,'Second season of Example.');assert.equal(calls,0);
 await assert.rejects(bounded.call(helper,new Promise(()=>{}),10),/deadline/);
});

test('one slow title does not serialize another title behind its network response',async()=>{
 let finish;const pending=new Promise(r=>finish=r);const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',{setTimeout,clearTimeout,http:async url=>url.endsWith('/72')?pending:{data:{mal_id:73,synopsis:'A new expedition leaves the kingdom behind.'}}});
 const slow=helper.resolve('al:42','','',{id:42,malId:72});helper.slots.clear();
 const fast=await helper.resolve('al:43','','',{id:43,malId:73});assert(fast.text.includes('expedition'));
 finish({data:{mal_id:72,synopsis:'The first expedition returns to its homeland.'}});assert((await slow).text.includes('homeland'));
});


test('catalog contribution notices and malformed descriptions never become a season plot',async()=>{
 const helper=vm.runInNewContext(read('synopsis.js')+';TitleSynopsis',{setTimeout,clearTimeout,http:async url=>({data:{mal_id:72,synopsis:url.includes('tenrai')?'No synopsis information has been added to this title. Help improve our database.':{text:'Wrong data type'}}})});
 assert.equal(helper.isStub('No synopsis has been added for this series yet.'),true);
 const result=await helper.resolve('al:42','Second season of Example.','',{id:42,malId:72});assert.equal(result.text,'Second season of Example.');assert.equal(result.source,'');assert.equal(helper.cache.size,0);
});
