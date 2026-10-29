const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), {EventEmitter}=require('node:events');
const provider=require('../src/aniwatch');
const base=provider.BASE;
const hash=url=>Buffer.from(url).toString('base64');
test('AniWatch matches exact search titles and keeps seasonal and continuous episode numbering distinct',()=>{
 const links=[{title:'Black Clover',url:base+'/black-clover-episode-170/'},{title:'Black Clover Season 2',url:base+'/black-clover-season-2-episode-3/'}];
 const hit=provider.chooseTitle(links,'Black Clover',2);assert.equal(hit.seasonal,true);assert.match(hit.url,/season-2/);
 assert.throws(()=>provider.chooseTitle(links,'Clover'),/No exact/);
 assert.throws(()=>provider.chooseTitle([{title:'Black Clover',url:'https://unrelated.test/'}],'Black Clover'),/Unexpected/);
 const eps=[{number:'1',url:base+'/black-clover-season-2-episode-1/'},{number:'52',url:base+'/black-clover-episode-52/'}];
 assert.match(provider.chooseEpisode(eps,1,{seasonNumber:2},true),/season-2-episode-1/);
 assert.throws(()=>provider.chooseEpisode(eps,1,{seasonNumber:2},false),/absolute episode/);
 assert.match(provider.chooseEpisode(eps,1,{seasonNumber:2,absoluteEpisodeNum:52},false),/episode-52/);
 assert.throws(()=>provider.chooseEpisode(eps,99,{},false),/unavailable/);
});
test('AniWatch filters audio before decoding and deduplicating server embeds',()=>{
 const servers=[{audio:'sub',name:'HD-1',hash:hash('https://embed.test/sub')},{audio:'dub',name:'HD-1',hash:hash('https://embed.test/dub')},{audio:'dub',name:'HD-2',hash:hash('https://embed.test/dub')},{audio:'dub',name:'unsafe',hash:hash('javascript:alert(1)')}];
 assert.deepEqual(provider.chooseEmbeds(servers,'dub'),['https://embed.test/dub']);
 assert.throws(()=>provider.chooseEmbeds(servers.filter(s=>s.audio==='sub'),'dub'),/no usable dub/);
});
function resolverFixture(){
 const source=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');
 provider.listingCache.clear();const requests=[];const read=async url=>{requests.push(url);const u=new URL(url);return u.pathname==='/'?'<div id="main-content"><h3><a href="'+base+'/black-clover-episode-170/">Black Clover</a></h3></div>':u.pathname.startsWith('/black-clover')?'<div id="ani_detail" data-anime-id="1"></div>':u.pathname.includes('/episode/list/')?JSON.stringify({status:true,html:'<a class="ep-item" data-number="1" data-id="2" href="'+base+'/black-clover-episode-1/"></a>'}):JSON.stringify({status:true,html:'<div class="server-item" data-type="sub" data-hash="'+hash('https://embed.test/sub')+'"></div><div class="server-item" data-type="dub" data-hash="'+hash('https://embed.test/dub')+'"></div>'});};
 const ctx={module:{exports:{}},require:id=>id==='electron'?{net:{fetch:async url=>({ok:true,text:()=>read(url)})},app:{isReady:()=>true},session:{defaultSession:{webRequest:{onBeforeSendHeaders(){}}}}}:require(path.join(__dirname,'../src',id)),process,console,URL,Map,Set,AbortController,AbortSignal,setTimeout,clearTimeout};
 vm.runInNewContext(source,ctx);
 const resolver=new ctx.module.exports();
 let current='',listener,disposed=false;const visited=[];let windows=0;
 const wc=new EventEmitter();wc.session={webRequest:{onBeforeSendHeaders:(filter,fn)=>{listener=fn||null}}};
 wc.setUserAgent=wc.setAudioMuted=wc.setWindowOpenHandler=()=>{};wc.getURL=()=>current;
 wc.executeJavaScript=async()=>current.includes('?s=')?{titles:[{title:'Black Clover',url:base+'/black-clover-episode-170/'}]}:{episodes:[{number:1,url:base+'/black-clover-episode-1/'}],servers:[{audio:'sub',name:'HD-1',hash:hash('https://embed.test/sub')},{audio:'dub',name:'HD-1',hash:hash('https://embed.test/dub')}]};
 const win=new EventEmitter();win.webContents=wc;win.isDestroyed=()=>disposed;win.destroy=()=>{disposed=true};
 win.loadURL=async url=>{current=url;visited.push(url);listener?.({url:'https://cdn.test/'+(url.startsWith('https://embed.test')?'correct':'wrong')+'.m3u8',requestHeaders:{Referer:url,Origin:new URL(url).origin}},()=>{});};
 resolver.createResolverWindow=()=>{windows++;return win;};
 return {resolver,visited,requests,get windows(){return windows},get disposed(){return disposed},get listener(){return listener}};
}
test('AniWatch resolution routes explicitly, ignores premature media, selects requested audio and cleans up',async()=>{
 const f=resolverFixture();const result=await f.resolver.resolveUncached({provider:'aniwatch',title:'Black Clover',episodeNum:1,audio:'dub'});
 assert.equal(result.provider,'aniwatch');assert.equal(result.streamUrl,'https://cdn.test/correct.m3u8');assert.equal(result.headers.Referer,'https://embed.test/dub');
 assert.deepEqual(f.visited,['https://embed.test/dub']);assert.equal(f.disposed,true);assert.equal(f.listener,null);
});


test('AniWatch retries punctuation-sensitive searches broadly without accepting the wrong season',()=>{
 assert.deepEqual(provider.searchTerms('Frieren: Beyond Journey’s End Season 2'),['Frieren',"Frieren: Beyond Journey's End Season 2"]);
 const links=[{title:'Frieren: Beyond Journey’s End',url:base+'/frieren-episode-28/'},{title:'Frieren: Beyond Journey’s End Season 2',url:base+'/frieren-season-2-episode-10/'}];
 assert.match(provider.chooseTitle(links,"Frieren: Beyond Journey's End Season 2",2).url,/season-2/);
 assert.throws(()=>provider.chooseTitle(links.slice(0,1),"Frieren: Beyond Journey's End Season 2",2),/No exact/);
});

test('AniWatch catalog uses the public REST listing and normalizes ordinal season names without a window',async()=>{const f=resolverFixture();const result=await f.resolver.resolveUncached({provider:'aniwatch',title:'Black Clover',episodeNum:1,audio:'sub',catalogOnly:true});assert.equal(f.windows,0);assert.deepEqual(Array.from(result.episodes),[1]);assert(f.requests.some(url=>url.includes('/wp-json/v1/otakuthemes/episode/list/1')));assert(!f.requests.some(url=>url.includes('/episode/servers')));const hit=provider.chooseTitle([{title:'Jujutsu Kaisen 2nd Season',url:base+'/jujutsu-kaisen-2nd-season-episode-23/'}],'JUJUTSU KAISEN Season 2',2);assert.equal(hit.seasonal,true);});
