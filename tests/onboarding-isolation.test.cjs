const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),watcher=fs.readFileSync(path.join(__dirname,'../src/watcher.js'),'utf8');
function introFixture(saved=new Map()){
 const modal={hidden:true};let options,offered=0,owner='anideck:fixture';
 const ctx={window:{native:{get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)}},Cloud:{enabled:()=>true,ident:()=>owner,loadMe:async()=>null},document:{getElementById:()=>modal},joinDialog:opts=>{offered++;options=opts;modal.hidden=false;}};
 const a=watcher.indexOf('async function offerProfileIntro()'),b=watcher.indexOf('function joinDialog(',a);
 return {offer:vm.runInNewContext(watcher.slice(a,b)+'\n'+'offerProfileIntro',ctx),ctx,saved,modal,get options(){return options},get offered(){return offered},setOwner:value=>owner=value};
}

test('first-run profile offer persists completion only after a deliberate choice',async()=>{
 const f=introFixture();assert.equal(await f.offer(),true);await f.offer();assert.equal(f.offered,1);assert.equal(f.options.onboarding,true);assert.equal(f.saved.has('anideckProfileIntro'),false);
 await f.options.onDone();f.modal.hidden=true;assert.equal(await f.offer(),false);assert.equal(f.offered,1);
 const existing=introFixture();existing.ctx.Cloud.loadMe=async()=>({handle:'existing'});assert.equal(await existing.offer(),false);assert.equal(existing.offered,0);assert.equal(existing.saved.get('anideckProfileIntro'),true);
});

test('interrupted profile creation resumes on the next launch after tracker sign-in is already saved',async()=>{
 const saved=new Map(),first=introFixture(saved);await first.offer();assert.equal(saved.size,0);
 const restarted=introFixture(saved);assert.equal(await restarted.offer(),true);assert.equal(restarted.offered,1);
 // enter() must consult persisted setup state even when showLogin() was skipped on this launch.
 const enter=app.slice(app.indexOf('  async enter() {'),app.indexOf('// Kitsu has no score',app.indexOf('  async enter() {')));
 assert(enter.includes("if(typeof offerProfileIntro==='function')"));assert(!enter.includes("if(this.needsProfileIntro&&"));
});

test('offline service, unrelated open dialogs and unavailable cloud do not consume profile setup',async()=>{
 const f=introFixture();f.ctx.Cloud.loadMe=async()=>{throw Error('offline')};assert.equal(await f.offer(),false);assert.equal(f.saved.size,0);assert.equal(f.offered,0);
 f.ctx.Cloud.loadMe=async()=>null;f.modal.hidden=false;assert.equal(await f.offer(),false);assert.equal(f.saved.size,0);
 f.modal.hidden=true;f.ctx.Cloud.enabled=()=>false;assert.equal(await f.offer(),false);assert.equal(f.saved.size,0);
 f.ctx.Cloud.enabled=()=>true;assert.equal(await f.offer(),true);
});

test('late profile reads cannot open setup for a replacement identity or replace an open dialog',async()=>{
 for(const change of ['identity','dialog']){const f=introFixture();let finish;f.ctx.Cloud.loadMe=()=>new Promise(resolve=>finish=resolve);const pending=f.offer();await new Promise(setImmediate);
  if(change==='identity')f.setOwner('another');else f.modal.hidden=false;
  finish(null);assert.equal(await pending,false);assert.equal(f.offered,0);assert.equal(f.saved.size,0);
 }
});

test('fresh onboarding has no Jellyfin entry and only the Account page owns its connection UI',()=>{const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');const login=html.slice(html.indexOf('<section id="login"'),html.indexOf('<!-- App -->'));assert(!login.includes('Jellyfin'));assert(!login.includes('login-server'));assert(login.includes('login-guest'));assert(app.includes('data-act="jellyLogin"'));});
test('global anime classification retains all media for its private library while exposing no global library index',()=>{const a=app.indexOf('  classify() {'),b=app.indexOf('\n  },',a);let indexInput;const instance={settings:{},libraries:[{Id:'private'}],rawLists:[[{Id:'film',Name:'Private film',Genres:['Drama']},{Id:'anime',Name:'Anime',Genres:['Anime']}]],animeSignal:{},matches:{},libraryMode:()=> 'auto',kitsuSays(){},registered:()=>undefined};const classify=vm.runInNewContext('({'+app.slice(a,b)+'\n}}).classify',{ANIME_ONLY:true,animeSignal:it=>it.Genres.includes('Anime')?'strong':false,buildLibraryIndex:(items)=>{indexInput=items;return {find:()=>null}}});classify.call(instance);assert.equal(instance.allItems.length,2);assert.equal(instance.items.private.length,2);assert.equal(instance.animeIds.has('film'),false);assert.equal(indexInput.length,0);});
