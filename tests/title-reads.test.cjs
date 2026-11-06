const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/title-reads.js'),'utf8'),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){const metadata=deferred(),entry=deferred(),request=deferred(),App={view:'anime',params:{id:'1'},settings:{titleLang:'en'},renderId:1,stale:id=>id!==App.renderId},Tracker={name:'local',loggedIn:()=>true,svc:{userId:'generated'}};const helper=vm.runInNewContext(source+';TitleReads',{App,Tracker,Kitsu:{animeFull:async()=>({id:'1',title:'Core title'})},AniList:{details:()=>metadata.promise},Requests:{has:()=>request.promise},trackingEntryState:()=>entry.promise,setTimeout,clearTimeout});helper.budgetMs=12;return {helper,App,Tracker,metadata,entry,request};}
test('slow optional metadata/list reads do not hold core title content or pretend unknown progress is empty',async()=>{const f=fixture(),values=await f.helper.read('1',1);assert.equal(values[0].title,'Core title');assert.equal(values[2].error.pending,true);assert.equal(values[3],null);let painted=0;f.helper.paint=async b=>{if(f.helper.valid(b))painted++;};f.helper.mounted(1);assert.equal(painted,0);f.metadata.resolve({id:1});f.entry.resolve({entry:{progress:7},error:null});f.request.resolve(false);await new Promise(setImmediate);assert.equal(painted,1);assert.equal(f.helper.active.values[2].entry.progress,7);});
test('fast optional reads render once without a redundant late patch',async()=>{const f=fixture();f.metadata.resolve({id:1});f.entry.resolve({entry:null,error:null});f.request.resolve(false);const values=await f.helper.read('1',1);assert.equal(values[3].id,1);let patches=0;f.helper.paint=async()=>patches++;f.helper.mounted(1);await new Promise(setImmediate);assert.equal(patches,0);});
test('late title responses cannot repaint a newer page or different tracking account',async()=>{for(const change of [f=>f.App.renderId++,f=>f.App.view='home',f=>f.Tracker.svc.userId='other']){const f=fixture();await f.helper.read('1',1);f.helper.mounted(1);change(f);f.metadata.resolve(null);f.entry.resolve({entry:null,error:null});f.request.resolve(false);await new Promise(setImmediate);assert.equal(f.helper.valid(f.helper.active),false);assert.equal(f.helper.active.painting,undefined);}});
test('core catalog failure stays an error and does not expose invented title content',async()=>{const f=fixture();const context={App:f.App,Tracker:f.Tracker,Kitsu:{animeFull:async()=>{throw Error('offline')},anime:async()=>{throw Error('offline')}},AniList:{details:async()=>null},Requests:{has:async()=>false},trackingEntryState:async()=>({entry:null,error:null}),setTimeout,clearTimeout};const helper=vm.runInNewContext(source+';TitleReads',context);await assert.rejects(helper.read('1',1),/Could not load this title/);});
test('an account swap during the initial budget cannot publish the previous account snapshot',async()=>{const f=fixture(),reading=f.helper.read('1',1);f.Tracker.svc.userId='other';await assert.rejects(reading,/account changed/);});

test('slow episode availability uses newly resolved progress instead of restoring the initial pending list snapshot',async()=>{
 const text=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),a=text.indexOf('function checkRemoteEpisodes('),b=text.indexOf('let lastServerError',a),pending=deferred(),original={id:'1',values:[null,false,{error:{pending:true}}]},latest={id:'1',values:[null,false,{entry:{progress:7},error:null}]};let painted;
 const App={remoteEpisodeRequest:{key:'same'},remoteEpisodeSnapshot:original,stale:()=>false},check=vm.runInNewContext(text.slice(a,b)+';checkRemoteEpisodes',{App,document:{querySelector:()=>({})},RemoteEpisodes:{peek:()=>null,key:r=>r.key,load:()=>pending.promise},paintRemoteEpisodes:(_rid,snapshot)=>painted=snapshot,console});
 const job=check(1);App.remoteEpisodeSnapshot=latest;pending.resolve();await job;assert.equal(painted,latest);assert.equal(painted.values[2].entry.progress,7);
});

function scrollingFixture(){
 let now=1000,nextTimer=0,commits=0,renders=0,after=0,prepare=null,progress=null;
 const timers=new Map(),heading={dataset:{}},text={children:[heading],querySelector:()=>heading,append(){}};
 const nav={},root={contains:()=>false,querySelector:selector=>selector==='.detail-hero .hero-text'?text:selector==='.detail-main'?{querySelector:()=>nav}:null};
 const App={view:'anime',params:{id:'1'},settings:{titleLang:'en'},renderId:1,scrollUntil:1200,stale:rid=>rid!==App.renderId},Tracker={name:'local',loggedIn:()=>true,svc:{userId:'fixture'}};
 const Views={anime:async params=>{renders++;progress=params.snapshot[2].entry.progress;if(prepare)await prepare.promise;return '<fixture>';},animeAfter:()=>{after++;}};
 const context={App,Tracker,Views,Date:{now:()=>now},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),queueMicrotask,
  document:{activeElement:null,getElementById:()=>root,createElement:()=>({content:{querySelector:selector=>selector==='.detail-hero .hero-text'?text:null}})},TitlePanels:{commit:()=>{commits++;}},showTint(){}};
 const helper=vm.runInNewContext(source+';TitleReads',context),batch={id:'1',rid:1,scope:helper.scope(),values:[{id:'1'},false,{entry:{progress:1}},null],painted:true,dirty:true};helper.active=batch;
 return {helper,batch,App,Tracker,timers,get commits(){return commits;},get renders(){return renders;},get after(){return after;},get progress(){return progress;},setNow:value=>now=value,holdRender:()=>prepare=deferred(),async retry(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());await new Promise(setImmediate);}};
}

test('title metadata keeps its mounted panel throughout scrolling and applies the latest values once after settling',async()=>{
 const f=scrollingFixture();await Promise.all([f.helper.paint(f.batch),f.helper.paint(f.batch)]);
 assert.equal(f.renders,0);assert.equal(f.commits,0);assert.equal(f.batch.dirty,true);assert.equal(f.timers.size,1);
 f.setNow(1150);f.App.scrollUntil=1350;await f.retry();assert.equal(f.commits,0);assert.equal(f.timers.size,1);
 f.batch.values[2]={entry:{progress:7}};f.setNow(1400);await f.retry();
 assert.equal(f.commits,1);assert.equal(f.renders,1);assert.equal(f.after,1);assert.equal(f.progress,7);assert.equal(f.batch.dirty,false);assert.equal(f.timers.size,0);
 await f.helper.paint(f.batch);assert.equal(f.commits,1);
});

test('a deferred title patch stops after navigation, title change or account change',async()=>{
 for(const change of [f=>f.App.renderId++,f=>f.App.view='home',f=>f.App.params.id='2',f=>f.Tracker.svc.userId='other']){
  const f=scrollingFixture();await f.helper.paint(f.batch);change(f);f.setNow(1400);await f.retry();
  assert.equal(f.renders,0);assert.equal(f.commits,0);assert.equal(f.timers.size,0);
 }
});

test('scrolling that resumes during async title preparation postpones the DOM commit',async()=>{
 const f=scrollingFixture();f.setNow(1400);const held=f.holdRender(),painting=f.helper.paint(f.batch);
 f.App.scrollUntil=1700;held.resolve();await painting;assert.equal(f.commits,0);assert.equal(f.batch.dirty,true);assert.equal(f.timers.size,1);
 f.setNow(1800);await f.retry();assert.equal(f.commits,1);assert.equal(f.after,1);
});
