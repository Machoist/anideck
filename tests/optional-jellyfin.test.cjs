const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),api=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function method(name,context){const start=app.indexOf(`  async ${name}(`)>=0?app.indexOf(`  async ${name}(`):app.indexOf(`  ${name}(`);assert(start>=0,name);const end=app.indexOf('\n  },',start);return vm.runInNewContext('({'+app.slice(start,end)+'\n}}).'+name,context);}
function jellyfin(context){return vm.runInNewContext(api.slice(api.indexOf('const Jellyfin = {'),api.indexOf('/* ================================ KITSU'))+'\nJellyfin',context);}
test('startup restores either tracker without requiring Jellyfin; a fresh install opens onboarding',async()=>{
 for(const tracked of [true,false]){
  let entered=0,onboarded=0,jellyCalls=0;
  const svc={init:async()=>{}};
  const ctx={window:{native:{config:async()=>({}),version:async()=> 'test',get:async()=>({})}},DEFAULT_SETTINGS:{gamepad:false},applyAppearance(){},TV:{init(){}},Prefetch:{bind(){}},HoverPreview:{bind(){}},Kitsu:svc,Trakt:svc,AniList:svc,Jellyfin:{init:async()=>false,call:async()=>jellyCalls++},Tracker:{loggedIn:()=>tracked},preconnectImageHosts(){},LocalTracker:{init:async()=>false},Art:{load:async()=>{}},hideSplash(){}};
  const instance={bindUpdates(){},bindShell(){},enter(){entered++},showLogin(){onboarded++}};
  await method('boot',ctx).call(instance);assert.equal(entered,tracked?1:0);assert.equal(onboarded,tracked?0:1);assert.equal(jellyCalls,0);
 }
});
test('AniList authentication enters the app directly from onboarding',async()=>{
 let entered=false,chosen;
 const instance={useTracker:async name=>chosen=name,updateWho(){},enter:async()=>entered=true,refresh(){throw new Error('Cannot refresh an unopened app')}};
 await method('anilistLogin',{AniList:{login:async()=>{},userName:'Viewer'},$:()=>({hidden:false}),toast(){}}).call(instance);
 assert.equal(chosen,'anilist');assert.equal(entered,true);
});
test('refreshing without Jellyfin clears stale libraries without any network lookup',async()=>{
 let classified=false,built=false;
 const instance={libraries:[{Id:'old'}],classify(){classified=true},buildNav(){built=true}};
 await method('refreshLibrary',{Jellyfin:{connected:()=>false,libraries(){throw new Error('Must not query Jellyfin')}}}).call(instance);
 assert.equal(instance.libraries.length,0);assert.equal(classified,true);assert.equal(built,true);
});
test('Jellyfin authentication is allowed before a session while disconnected library calls fail locally',async()=>{
 const calls=[],stored={};
 const context={Map,navigator:{platform:'Win32'},APP_VERSION:'test',http:async(url,options)=>{calls.push(url);return url.endsWith('/System/Info/Public')?{Id:'server'}:{AccessToken:'token',User:{Id:'user',Name:'Viewer'}}},window:{native:{get:async()=>null,set:async(k,v)=>stored[k]=v,setSecret:async(k,v)=>stored[k]=v}}};
 const jf=jellyfin(context);await assert.rejects(jf.call('/Items'),/Connect a Jellyfin/);assert.equal(calls.length,0);
 await jf.login('http://jellyfin','Viewer','password');assert.equal(jf.connected(),true);assert.equal(stored.jellyfinToken,'token');assert(calls.includes('http://jellyfin/Users/AuthenticateByName'));
 await jf.logout();assert.equal(jf.connected(),false);assert.equal(jf.server,'');assert.equal(jf.userName,'');
});
test('request history, sending, and navigation are available only with a connected Jellyfin library',async()=>{
 let connected=false,reads=0,sends=0;
 const ctx={Jellyfin:{connected:()=>connected},App:{libraries:[]},window:{native:{get:async()=>{reads++;return [{kitsuId:'1'}]},config:async()=>{sends++;return {}}}}};
 const requests=vm.runInNewContext(api.slice(api.indexOf('const Requests = {'),api.indexOf('/* ================================ MATCHING'))+'\nRequests',ctx);
 assert.equal(requests.enabled(),false);assert.equal((await requests.list()).length,0);await assert.rejects(requests.send({id:1}),/Connect a Jellyfin/);assert.equal(reads,0);assert.equal(sends,0);
 connected=true;assert.equal(requests.enabled(),false);ctx.App.libraries.push({Id:'library'});assert.equal(requests.enabled(),true);assert.equal((await requests.list()).length,1);
 const nav={};const build=method('buildNav',{Tracker:{loggedIn:()=>false},$:()=>nav,icon:()=>'',Requests:requests,Jellyfin:ctx.Jellyfin});build.call({markNav(){}});assert(nav.innerHTML.includes('data-view="requests"'));assert(nav.innerHTML.includes('data-view="library"'));
 connected=false;build.call({markNav(){}});assert(!nav.innerHTML.includes('data-view="requests"'));assert(!nav.innerHTML.includes('data-view="library"'));
});
test('Account labels distinguish the optional Jellyfin library and its local server address',async()=>{
 let connected=false;
 const ctx={App:{settings:{},libraries:[],update:{},libraryMode:()=> 'auto'},window:{native:{config:async()=>({}),get:async()=>'',version:async()=> 'test'}},Tracker:{name:'AniList'},Jellyfin:{connected:()=>connected,userName:'Viewer',server:'http://jellyfin'},Requests:{enabled:()=>connected},ACCENTS:{},KEY_ACTIONS:[],CHANGELOG:[{v:'test'}],GITHUB_URL:'https://example.com',icon:()=>'',esc:x=>String(x??''),trackerRows:()=>'',shuffleLabel:()=>'',updateText:()=>''};
 vm.runInNewContext(app.slice(app.indexOf('function spotlightDuration('),app.indexOf('function queueArtworkScore(')),ctx);
 const render=method('settings',ctx);let html=await render();assert(html.includes('Jellyfin library'));assert(html.includes('data-act="jellyLogin"'));assert(!html.includes('id="lan"'));assert(!html.includes('<h3>Requests</h3>'));
 connected=true;html=await render();assert(html.includes('Jellyfin home network address'));assert(html.includes('This only affects Jellyfin library playback'));assert(html.includes('data-act="jellyLogout"'));assert(html.includes('<h3>Requests</h3>'));
});
test('Kitsu sign-in also finishes onboarding without asking for Jellyfin',async()=>{
 const elements=Object.fromEntries(['k-user','k-pass','k-go','k-err','k-cancel','k-new','kitsu-form','login'].map(id=>[id,{value:'value',hidden:false,focus(){}}]));
 let entered=false,chosen;
 const ctx={$:selector=>elements[selector.slice(1)],Kitsu:{login:async()=>{},userName:'Viewer'},toast(){}};
 const instance={modal(){},closeModal(){},updateWho(){},useTracker:async name=>chosen=name,enter:async()=>entered=true,refresh(){throw new Error('App is not open yet')}};
 method('kitsuLogin',ctx).call(instance);await elements['kitsu-form'].onsubmit({preventDefault(){}});assert.equal(chosen,'kitsu');assert.equal(entered,true);
});
test('catalog playback updates its tracker without sending any Jellyfin watched request',async()=>{
 const player=fs.readFileSync(path.join(__dirname,'../src/player.js'),'utf8'),start=player.indexOf('  async markWatched() {'),end=player.indexOf('\n  },',start);
 let progress;const label={classList:{add(){},remove(){}}};
 const context={Jellyfin:{connected:()=>false,markPlayed(){throw new Error('No Jellyfin request permitted')}},window:{native:{get:async()=>({}),set(){}}},App:{settings:{autoTrack:true},isAnime(){throw new Error('Catalog titles need no Jellyfin classification')}},Tracker:{loggedIn:()=>true,name:'AniList',setProgress:async(id,num,total)=>{progress={id,num,total};return {unchanged:true,progress:num}}},$p:()=>label,relativeEpisodeNumber:ep=>ep.IndexNumber,toast(){}};
 const mark=vm.runInNewContext('({'+player.slice(start,end)+'\n}}).markWatched',context);
 await mark.call({ctx:{remoteOnly:true,episode:{Id:'remote-1-2',IndexNumber:2},match:{id:'1',episodes:12,title:'Example'},season:{IndexNumber:1}},sendToTrakt(){throw new Error('Catalog title must stay with anime tracker')}});
 assert.deepEqual(progress,{id:'1',num:2,total:12});assert(label.innerHTML.includes('AniList'));
});

test('disconnected library after-render does not bind missing controls',()=>{
 const start=app.indexOf('  libraryAfter() {'),end=app.indexOf('\n  },',start);
 const after=vm.runInNewContext('({'+app.slice(start,end)+'\n}}).libraryAfter',{Jellyfin:{connected:()=>false},$:()=>null});assert.doesNotThrow(()=>after());
});
