const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const appSource=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),apiSource=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function method(name,ctx){const start=Math.max(appSource.indexOf(`  async ${name}(`),appSource.indexOf(`  ${name}(`));assert(start>=0,name);const end=appSource.indexOf('\n  },',start);return vm.runInNewContext('({'+appSource.slice(start,end)+'\n}}).'+name,ctx);}
function fixture(){
 let connected=true,matches={};const lookups=[],errors=[],ctx={ANIME_ONLY:true,Set,Map,Date,setTimeout:fn=>{fn()},toast:message=>errors.push(message),$:()=>({hidden:true}),
  Jellyfin:{server:'https://private.fixture',userId:'first',token:'first-token',connected:()=>connected,libraries:async()=>[{Id:'library'}],libraryItems:async()=>[{Id:'film',Name:'Private film',Genres:['Drama']}],librarySeasons:async()=>[]},
  Matcher:{lastOk:true,all:async()=>matches,auto:async item=>{lookups.push(item.Id);matches[item.Id+':1']={id:'42',title:'Fixture anime'};}},MAL:{has:async()=>false},buildLibraryIndex:items=>{assert.equal(items.length,0);return {find:()=>null};}};
 ctx.animeSignal=vm.runInNewContext(appSource.slice(appSource.indexOf('function animeSignal('),appSource.indexOf('function looksAnime('))+'\nanimeSignal',{});
 const instance={settings:{},libraries:[],rawLists:[],animeIds:new Set(),animeSignal:{},matches:{},libraryMode:lib=>lib.mode||'auto',animated:it=>(it.Genres||[]).some(g=>/^(animation|anime)$/i.test(g)),saveSettings:async()=>{},buildNav(){},refresh(){}};
 for(const name of ['refreshLibrary','registered','classify','verifyWithKitsu'])instance[name]=method(name,ctx);
 instance.kitsuSays=id=>instance.matches[id+':1']?!instance.matches[id+':1'].none:undefined;
 return {app:instance,ctx,lookups,errors,disconnect:()=>connected=false,setMatches:value=>{matches=value;instance.matches=value;}};
}
test('background verification excludes ordinary private films and western animation while retaining anime candidates',async()=>{
 const f=fixture();f.app.libraries=[{Id:'library'}];f.app.rawLists=[[{Id:'film',Name:'Private film',Genres:['Drama']},{Id:'cartoon',Name:'Private cartoon',Genres:['Animation']},{Id:'anime',Name:'Anime fixture',Genres:['Anime']}]];
 f.app.classify();await f.app.verifyWithKitsu();assert.deepEqual(f.lookups,['anime']);assert.equal(f.app.allItems.length,3);assert.equal(f.app.libIndex.find({id:'42'}),null);
});
test('an explicitly anime library can be checked, but explicit non-anime item choices are respected',async()=>{
 const f=fixture();f.app.libraries=[{Id:'library',mode:'anime'}];f.app.rawLists=[[{Id:'chosen',Name:'Chosen fixture'},{Id:'excluded',Name:'Private film'}]];f.app.settings.animeOverride={excluded:false};f.app.classify();await f.app.verifyWithKitsu();assert.deepEqual(f.lookups,['chosen']);
});
test('old automatic fuzzy matches cannot classify ordinary films as anime; explicit manual matches remain usable',()=>{
 const f=fixture();f.app.libraries=[{Id:'library'}];f.app.rawLists=[[{Id:'film',Name:'Private film'},{Id:'manual',Name:'Manually matched title'}]];f.app.settings.registry={film:true};f.setMatches({'film:1':{id:'42',manual:false},'manual:1':{id:'43',manual:true}});f.app.classify();assert.equal(f.app.animeIds.has('film'),false);assert.equal(f.app.animeIds.has('manual'),true);assert.equal(f.app.allItems.length,2);
});
test('a stale library read cannot repopulate data after switching servers',async()=>{
 const f=fixture();let finish;f.ctx.Jellyfin.libraries=()=>new Promise(resolve=>finish=resolve);const old=f.app.refreshLibrary();
 f.ctx.Jellyfin.server='https://second.fixture';f.ctx.Jellyfin.userId='second';f.ctx.Jellyfin.libraries=async()=>[{Id:'second-library'}];f.ctx.Jellyfin.libraryItems=async()=>[{Id:'second-film'}];await f.app.refreshLibrary();
 finish([{Id:'old-library'}]);await old;assert.equal(f.app.libraries[0].Id,'second-library');assert.equal(f.app.allItems[0].Id,'second-film');assert.equal(f.errors.length,0);
});
test('disconnect clears visible data and rejects a late item response',async()=>{
 const f=fixture();let finish;f.ctx.Jellyfin.libraryItems=()=>new Promise(resolve=>finish=resolve);const pending=f.app.refreshLibrary();await new Promise(setImmediate);f.disconnect();await f.app.refreshLibrary();finish([{Id:'old-film'}]);await pending;assert.equal(f.app.allItems.length,0);assert.equal(f.app.libraries.length,0);assert.equal(f.app.libraryLoadedAt,0);
});
test('background verification stops before applying late matches or starting additional lookups after disconnect',async()=>{
 const f=fixture();f.app.libraries=[{Id:'library'}];f.app.rawLists=[[{Id:'one',Genres:['Anime']},{Id:'two',Genres:['Anime']}]];f.app.classify();let finish;f.ctx.Matcher.auto=(_s,_n,_c,{active})=>new Promise(resolve=>finish=()=>{assert.equal(active(),false);resolve(null)});const pending=f.app.verifyWithKitsu();f.disconnect();finish();await pending;assert.equal(f.app.verifying,false);assert.equal(f.lookups.length,0);
});
test('Jellyfin GET cache is separated by server, account and session',async()=>{
 let calls=0;const ctx={Map,Date,APP_VERSION:'test',navigator:{platform:'Win32'},http:async(_url,options)=>({call:++calls,authorization:options.headers.Authorization})};
 const jf=vm.runInNewContext(apiSource.slice(apiSource.indexOf('const Jellyfin = {'),apiSource.indexOf('/* ================================ KITSU'))+'\nJellyfin',ctx);Object.assign(jf,{server:'https://fixture.invalid',userId:'first',token:'first-token'});
 await jf.call('/Items/shared');await jf.call('/Items/shared');assert.equal(calls,1);jf.userId='second';jf.token='second-token';assert.match((await jf.call('/Items/shared')).authorization,/second-token/);assert.equal(calls,2);jf.token='renewed-token';await jf.call('/Items/shared');assert.equal(calls,3);
});
function matcherFixture(){let active=true,finish;const writes=[],ctx={Jellyfin:{server:'https://fixture.invalid',userId:'first',connected:()=>true},window:{native:{get:async()=>({}),set:async(k,v)=>writes.push({k,v})}},Kitsu:{search:()=>new Promise(resolve=>finish=resolve)},similarity:()=>1,stripSeason:x=>x};const matcher=vm.runInNewContext(apiSource.slice(apiSource.indexOf('const Matcher = {'),apiSource.indexOf('// Builds a lookup to tell'))+'\nMatcher',ctx);return {matcher,ctx,writes,active:()=>active,cancel:()=>active=false,finish:value=>finish(value)};}
test('cancelled background catalog responses cannot save matches',async()=>{
 const f=matcherFixture(),pending=f.matcher.auto({Id:'private',Name:'Fixture',Type:'Series'},null,null,{active:f.active});await new Promise(setImmediate);f.cancel();f.finish([{id:'42',title:'Fixture',titles:['Fixture'],subtype:'TV'}]);assert.equal(await pending,null);assert.equal(f.writes.length,0);
});
test('cancellation during a saved-match read cannot write a stale result',async()=>{
 const f=matcherFixture();let finish;f.ctx.window.native.get=()=>new Promise(resolve=>finish=resolve);const pending=f.matcher.set('private',1,{id:'42'},false,'title',f.active);f.cancel();finish({});await pending;assert.equal(f.writes.length,0);
});

test('saved title matches and reset are isolated by server and user even when item IDs repeat',async()=>{
 const f=matcherFixture(),store={};f.ctx.window.native.get=async key=>structuredClone(store[key]);f.ctx.window.native.set=async(key,value)=>store[key]=structuredClone(value);
 await f.matcher.set('same',1,{id:'42',title:'First account'},true);
 f.ctx.Jellyfin.userId='second';assert.equal(await f.matcher.get('same',1),null);await f.matcher.set('same',1,{id:'43',title:'Second account'},true);
 f.ctx.Jellyfin.server='https://another.fixture';assert.equal(await f.matcher.get('same',1),null);
 f.ctx.Jellyfin.server='https://fixture.invalid';assert.equal((await f.matcher.get('same',1)).id,'43');await f.matcher.clearAll();
 f.ctx.Jellyfin.userId='first';assert.equal((await f.matcher.get('same',1)).id,'42');
});

test('legacy matches migrate only for the connection restored at startup and remain preserved',async()=>{
 const f=matcherFixture(),legacy={'same:1':{id:'42',manual:true}},store={jellyfin:{server:'https://fixture.invalid',userId:'first'},kitsuMatches:legacy};
 f.ctx.window.native.get=async key=>structuredClone(store[key]);f.ctx.window.native.set=async(key,value)=>store[key]=structuredClone(value);
 await f.matcher.initScope();assert.equal((await f.matcher.get('same',1)).id,'42');f.ctx.Jellyfin.userId='second';assert.equal(await f.matcher.get('same',1),null);assert.deepEqual(store.kitsuMatches,legacy);
});

function homeFixture(localId='expected',known=true){
 const store={localServer:'http://lan.fixture',jellyfin:{server:'https://remote.fixture',userId:'first'}},calls=[];
 const ctx={Map,Date,window:{native:{get:async key=>store[key],set:async(key,value)=>store[key]=value}},http:async(url,options)=>{calls.push({url,options});return {Id:url.startsWith('http://lan')?localId:'expected'};}};
 const jf=vm.runInNewContext(apiSource.slice(apiSource.indexOf('const Jellyfin = {'),apiSource.indexOf('/* ================================ KITSU'))+'\nJellyfin',ctx);Object.assign(jf,{server:'https://remote.fixture',remoteServer:'https://remote.fixture',userId:'first',token:'fixture-token',serverId:known?'expected':''});return {jf,ctx,store,calls};
}
test('a home address belonging to another Jellyfin server never receives the signed-in session',async()=>{
 const f=homeFixture('another');await f.jf.pickFastestServer();assert.equal(f.jf.server,'https://remote.fixture');assert.equal(f.jf.usingLocal,false);assert(f.calls.every(c=>!c.options.headers));
});
test('the verified home server is selected and legacy connection identity is retained for future offline use',async()=>{
 const f=homeFixture('expected',false);await f.jf.pickFastestServer();assert.equal(f.jf.server,'http://lan.fixture');assert.equal(f.jf.usingLocal,true);assert.equal(f.store.jellyfin.serverId,'expected');assert.equal(f.calls.length,2);
 const known=homeFixture();await known.jf.pickFastestServer();assert.equal(known.calls.length,1);assert.equal(known.jf.usingLocal,true);
});
test('a late home-network probe cannot overwrite a newly selected server',async()=>{
 const f=homeFixture();let finish;f.ctx.http=()=>new Promise(resolve=>finish=resolve);const pending=f.jf.pickFastestServer();await new Promise(setImmediate);f.jf.remoteServer='https://second.fixture';f.jf.server='https://second.fixture';finish({Id:'expected'});await pending;assert.equal(f.jf.server,'https://second.fixture');assert.equal(f.jf.usingLocal,false);
});
