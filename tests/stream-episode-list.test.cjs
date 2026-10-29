const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),resolver=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');
function catalog(read){return vm.runInNewContext(app.slice(app.indexOf('const RemoteEpisodes ='),app.indexOf('let lastServerError'))+';RemoteEpisodes',{window:{native:{streamEpisodes:read}},Map,Set,Date,Number,JSON});}
test('episode availability deduplicates checks, retains gaps and separates provider/audio/season',async()=>{
 let calls=0;const c=catalog(async p=>{calls++;return {provider:p.provider,episodes:[1,3,3,0,-1,'bad',3001]};}),p={provider:'anikoto',title:'Fixture',seasonNumber:1,audio:'sub'};
 const [a,b]=await Promise.all([c.load(p),c.load(p)]);assert.equal(calls,1);assert.equal(a,b);assert.deepEqual(Array.from(a.episodes),[1,3]);await c.load(p);assert.equal(calls,1);
 for(const patch of [{provider:'hianime'},{audio:'dub'},{seasonNumber:2}])await c.load({...p,...patch});assert.equal(calls,4);c.clear(p);assert.equal(c.peek(p),null);
});
test('a failed lookup or wrong provider never invents episodes; an empty real listing stays empty',async()=>{
 for(const read of [async()=>{throw Error('offline')},async()=>({provider:'wrong',episodes:[1]})]){const c=catalog(read),state=await c.load({provider:'anikoto'});assert.equal(state.status,'error');assert.equal(state.episodes.length,0);}
 const c=catalog(async()=>({provider:'anikoto',episodes:[]}));assert.equal((await c.load({provider:'anikoto'})).status,'ready');assert.equal(c.peek({provider:'anikoto'}).episodes.length,0);
});
test('catalog resolution accepts only actual episode numbers without requesting a media stream',async()=>{
 const ctx={require:()=>({app:{isReady:()=>true},session:{defaultSession:{webRequest:{onBeforeSendHeaders(){}}}}}),module:{exports:{}},process,console,URL,Map,Set};vm.runInNewContext(resolver,ctx);const r=new ctx.module.exports();let got;
 r.resolveAnikoto=async(...args)=>{got=args[3];return {episodes:[1,4,4,0,4000]};};const out=await r.resolveUncached({provider:'anikoto',title:'Fixture',catalogOnly:true});assert.equal(got.catalogOnly,true);assert.deepEqual(Array.from(out.episodes),[1,4]);assert.equal(out.provider,'anikoto');assert.equal(out.streamUrl,undefined);
});
test('Anikoto catalog inspection lists real DOM episodes and omits unavailable audio without clicking play',()=>{
 const start=resolver.indexOf('    const inspect = (opts, currentStage) =>'),end=resolver.indexOf('    // Observe the headers',start),text=resolver.slice(start,end).replace('const inspect =','const inspect =');
 const episodes=[1,3,8].map(n=>({dataset:{num:String(n)},getAttribute:key=>key==='data-dub'&&n===3?'0':null}));const inspect=vm.runInNewContext(text+';inspect',{document:{title:'Fixture',body:{innerText:''},querySelectorAll:()=>episodes}});
 assert.deepEqual(Array.from(inspect({catalogOnly:true,seasonNumber:1,audio:'dub'},'episode').episodes),[1,8]);assert(inspect({catalogOnly:true,seasonNumber:2,audio:'sub'},'episode').error);
});
test('HiAnime catalog stops at the exact title episode listing and never reads a player',async()=>{
 const api=require('../src/hianime'),calls=[];const read=async url=>{calls.push(url);if(url.includes('/browse?'))return '<a href="/watch/fixture-5" title="Fixture" data-id="5"></a>';assert(url.endsWith('/episode/list/5'));return JSON.stringify({status:true,html:'<a class="ep-item" data-id="40" data-number="1"></a><a class="ep-item" data-id="42" data-number="3"></a>'});};
 assert.deepEqual(await api.metadata(read,'Fixture',1,'sub',{catalogOnly:true,seasonNumber:1}),{episodes:[1,3]});assert.equal(calls.length,2);assert.deepEqual(await api.metadata(async()=>'<p>No results</p>','Missing',1,'sub',{catalogOnly:true}),{episodes:[]});
});
test('unlisted playback is refused and the player drawer contains only listed episodes',async()=>{
 const begin=app.indexOf(' async playRemoteEpisode('),end=app.indexOf('  async requestAnime(',begin);let listing={status:'ready',episodes:[]},opened,notice;
 const ctx={RemoteEpisodes:{load:async()=>listing},remotePlaybackProvider:()=> 'anikoto',seasonNumberIn:()=>1,shortServerName:()=> 'Anikoto',document:{getElementById:()=>null},Player:{open:value=>opened=value},toast:value=>notice=value,lastServerError:null};const play=vm.runInNewContext('({'+app.slice(begin,end)+'}).playRemoteEpisode',ctx),instance={settings:{}};
 await play.call(instance,{title:'Missing',episodeNum:1,kitsuId:'5',total:12});assert.equal(opened,undefined);assert.match(notice,/wasn’t found/);
 listing={status:'ready',episodes:[1,3]};await play.call(instance,{title:'Fixture',episodeNum:1,kitsuId:'5',total:12});assert.deepEqual(Array.from(opened.episodes,e=>e.IndexNumber),[1,3]);
});
