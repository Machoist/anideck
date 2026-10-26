const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../src/deck-core'),source=fs.readFileSync(path.join(__dirname,'../src/deck-features.js'),'utf8');
function setup(){
 const saved=new Map(),nav=[],nodes=new Map();let service={userId:'alice',list:async()=>({entries:[{anime:{id:'al:1',title:'Example',genres:['Drama']},progress:2,status:'planned'}],total:1}),entry:async()=>({progress:2}),setProgress:async(_,n)=>({progress:n})};
 const tracker={loggedIn:()=>true,name:'AniList',userName:'Alice',get svc(){return service},watching:async()=>[]};
 const ctx={DeckCore:C,App:{enter:async()=>true,useTracker:async()=>{},buildNav(){},markNav(){},act(){},itemById(){},view:'home',nav:(...args)=>nav.push(args),settings:{},stale:()=>false},Views:{home:async()=>'<div class="page home-rows"><!--home-deck--></div>',homeAfter(){},anime:async()=>'',show:async()=>'',mylist:async()=>'<div class="page mylist"></div>',profile:async()=>'<div class="page profile"></div>',settings:async()=>'<h3>Home screen</h3>'},Kitsu:{anime:async()=>({id:'1',title:'Example'}),animeFull:async()=>({id:'1',title:'Example'})},Player:{markWatched:async()=>{},ctx:{},dur:()=>0},Tracker:tracker,Jellyfin:{userId:'',connected:()=>false},VIEW_TITLES:{},window:{native:{get:async key=>saved.get(key),set:async(key,value)=>saved.set(key,JSON.parse(JSON.stringify(value))),saveArtifact:async()=>({ok:true})}},AniList:{details:async()=>({title:'Example',duration:24,genres:['Drama'],studios:['Studio']})},$:selector=>nodes.get(selector),untilText:()=> 'tomorrow',esc:x=>String(x??''),icon:()=>'',toast(){},console,crypto:require('node:crypto').webcrypto,setInterval,clearInterval};
 const api=vm.runInNewContext(source+'\n({DeckStore,DeckUI,wrapCanvas})',ctx);return {...api,ctx,saved,nav,nodes,setService:next=>{service=next}};
}
test('feature storage serializes edits and keeps each account separate',async()=>{
 const {DeckStore:S,DeckUI:UI,saved,setService}=setup();await S.load();await Promise.all([S.commit({type:'create',id:'a',name:'First'}),S.commit({type:'create',id:'b',name:'Second'})]);assert.equal(S.state.decks.length,4);assert.equal(saved.get('anideck-features:AniList:alice').decks.length,4);
 UI.pool=[{id:'al:1'}];setService({userId:'bob'});await S.load();assert.equal(S.state.decks.length,2);assert.equal(UI.pool.length,0);setService({userId:'alice'});await S.load();assert.equal(S.state.decks.length,4);
});
test('new screens and dashboard routes are installed and render real controls',async()=>{
 const {DeckStore:S,DeckUI:UI,ctx}=setup();await ctx.App.enter();assert(ctx.VIEW_TITLES.decks);const html=await ctx.Views.decks({});assert(html.includes('New deck'));assert(html.includes('Import deck'));assert(html.includes('Tonight'));assert((await ctx.Views.home()).includes('ad-dashboard'));const backlog=await ctx.Views.backlog();assert(backlog.includes('Passing never drops'));await UI.loadBacklog(1);assert.equal(UI.backlog.length,1);const review=await ctx.Views.review({period:'all'});assert(review.includes('ad-review-main'));assert(review.includes('Only activity recorded in AniDeck'));
});
test('local swipe decisions make no tracker writes and undo restores the card',async()=>{
 const {DeckStore:S,DeckUI:UI,ctx}=setup();await S.load();ctx.Tracker.svc.setStatus=()=>{throw new Error('Must not write tracker status')};ctx.Tracker.svc.setProgress=()=>{throw new Error('Must not write tracker progress')};UI.swipeItem={id:'al:1',title:'Example'};UI.renderSwipe=()=>{};await UI.decide('pass');assert.equal(S.state.swipes['al:1'].decision,'pass');await S.commit({type:'undo'});assert.equal(S.state.swipes['al:1'],undefined);
});
test('Quick Log reads fresh progress, records only requested increments, and deduplicates later playback',async()=>{
 const {DeckStore:S,DeckUI:UI,nodes,ctx}=setup();await S.load();let writes=0;ctx.Tracker.svc.setProgress=async(_,n)=>{writes++;return {progress:n}};UI.quickEntries=[{anime:{id:'al:1',title:'Example',episodes:12},progress:0}];const button={},row={isConnected:true,querySelector:selector=>selector==='input'?{value:'4'}:button};nodes.set('[data-log-row="0"]',row);await UI.quickLog(0);assert.equal(writes,1);assert.equal(S.state.events.length,2);assert.equal(S.state.events[0].count,1);
 await UI.record({id:'al:1',title:'Example'},1,1440,'watch',null,S.key,4);assert.equal(S.state.events.length,2);
 ctx.Tracker.svc.entry=async()=>({progress:5});await UI.quickLog(0);assert.equal(writes,1);
});
test('review canvas wraps long names inside bounds and exports both cards',async()=>{
 const {DeckUI:UI,nodes,ctx,wrapCanvas}=setup();const drawn=[];const canvasContext={measureText:text=>({width:text.length*12}),fillText:(text,x,y)=>drawn.push({text,x,y})};wrapCanvas(canvasContext,'A very long display name that will not fit',0,0,100,20,2);assert(drawn.length<=2);assert(drawn.every(x=>x.text.length*12<=100));
 const names=[];ctx.window.native.saveArtifact=async artifact=>{names.push(artifact.name);return {ok:true}};for(const id of ['#ad-review-main','#ad-review-taste'])nodes.set(id,{toDataURL:()=> 'data:image/png;base64,iVBORw0KGgo='});UI.reviewData={label:'Fall 2026'};await UI.exportReview();assert.equal(names.length,2);assert(names[0].includes('Activity'));assert(names[1].includes('Taste'));
});

test('Quick log omits completed titles and widgets load independently',async()=>{
 const {DeckStore:S,DeckUI:UI,nodes,ctx}=setup();await S.load();let resolveWatching,scheduleStarted=false;ctx.Tracker.watching=()=>new Promise(resolve=>resolveWatching=resolve);
 ctx.Schedule={week:async()=>{scheduleStarted=true;return []}};ctx.mySchedule=async()=>[];
 const root={querySelectorAll:()=>[]},quick={isConnected:true,innerHTML:'',querySelectorAll:()=>[]},airing={isConnected:true,innerHTML:''};nodes.set('#ad-dashboard',root);nodes.set('#ad-widget-quicklog',quick);nodes.set('#ad-widget-airing',airing);
 const loading=UI.homeAfter(1);assert.equal(scheduleStarted,true);resolveWatching([{anime:{id:'al:1',title:'Finished',episodes:12},progress:12},{anime:{id:'al:2',title:'Watching',episodes:24},progress:4}]);await loading;assert.equal(UI.quickEntries.length,1);assert.equal(UI.quickEntries[0].anime.title,'Watching');assert(quick.innerHTML.includes('Ep 5'));assert(airing.innerHTML.includes('No upcoming'));
});
test('arranging the deck updates only the dashboard and preserves Home navigation',async()=>{
 const {DeckStore:S,DeckUI:UI,nodes,ctx,nav}=setup();await S.load();const root={outerHTML:''};nodes.set('#ad-dashboard',root);UI.homeAfter=async()=>{};await ctx.App.act('ad-edit-home',{});assert.equal(UI.editHome,true);assert(root.outerHTML.includes('Done'));assert.equal(nav.length,0);await UI.layout({type:'layout',id:'quicklog',span:12});assert.equal(S.state.layout.find(w=>w.id==='quicklog').span,12);assert.equal(nav.length,0);
});

test('Tonight and Almost finished use saved titles and actual remaining progress',async()=>{
 const {DeckStore:S,DeckUI:UI}=setup();await S.load();for(let i=1;i<=4;i++)await S.commit({type:'add',deckId:'tonight',item:{id:'al:'+i,title:'Pick '+i}});
 const tonight=UI.tonightWidget();assert(tonight.includes('Pick 1'));assert(!tonight.includes('Pick 4'));assert(tonight.includes('4 titles'));
 const entries=[{anime:{id:'al:1',title:'Near',episodes:12},progress:11},{anime:{id:'al:2',title:'Done',episodes:12},progress:12},{anime:{id:'al:3',title:'Unknown'},progress:5},{anime:{id:'al:4',title:'Long way',episodes:24},progress:2}];const html=UI.finishWidget(entries);assert(html.includes('Near'));assert(html.includes('1 left'));assert(!html.includes('Done'));assert(!html.includes('Unknown'));assert(!html.includes('Long way'));
});
test('Almost finished loads without enabling Quick Log or making extra schedule requests',async()=>{
 const {DeckStore:S,DeckUI:UI,nodes,ctx}=setup();await S.load();let reads=0;ctx.Tracker.watching=async()=>{reads++;return [{anime:{id:'al:1',title:'Final stretch',episodes:12},progress:9}]};ctx.listAiring=()=>{throw Error('No schedule read needed')};nodes.set('#ad-dashboard',{querySelectorAll:()=>[]});const box={isConnected:true};nodes.set('#ad-widget-finishline',box);await UI.homeAfter(1);assert.equal(reads,1);assert(box.innerHTML.includes('3 left'));
});
test('Quick Log locks controls, ignores duplicate clicks, and avoids writes after an account change',async()=>{
 const {DeckStore:S,DeckUI:UI,nodes,ctx}=setup();await S.load();let resolveRead,writes=0;ctx.Tracker.svc.entry=()=>new Promise(r=>resolveRead=r);ctx.Tracker.svc.setProgress=async()=>{writes++;return {progress:3}};const label={textContent:'Log Ep 3'},button={disabled:false,querySelector:()=>label},minus={disabled:true},plus={disabled:false},controls=[minus,button,plus];const row={isConnected:true,querySelector:s=>s==='input'?{value:'3'}:button,querySelectorAll:()=>controls,setAttribute(){},removeAttribute(){}};nodes.set('[data-log-row="0"]',row);UI.quickEntries=[{anime:{id:'al:1',title:'Example',episodes:12},progress:2}];const pending=UI.quickLog(0);assert(controls.every(b=>b.disabled));assert.equal(label.textContent,'Saving…');await UI.quickLog(0);S.key='another-account';resolveRead({progress:2});await pending;assert.equal(writes,0);assert.equal(minus.disabled,true);assert.equal(plus.disabled,false);assert.equal(button.disabled,false);assert.equal(label.textContent,'Log Ep 3');
});

test('Quick Log caps known airing titles and shows caught-up state until the next episode airs',()=>{
 const {DeckUI:UI}=setup();UI.airing=()=>({aired:4,next:{episode:5,at:Date.now()+86400000}});const entry={anime:{id:'al:1',title:'Weekly show',episodes:12},progress:4};assert.equal(UI.quickLimit(entry),4);const html=UI.quickRows([entry]);assert(html.includes('Caught up'));assert(!html.includes('Log Ep 5'));assert(html.includes('max="4"'));
 UI.airing=()=>({aired:5});assert.equal(UI.quickLimit(entry),5);assert(UI.quickRows([entry]).includes('Log Ep 5'));
});
test('Quick Log rejects an unaired episode even if the form value is changed',async()=>{
 const {DeckStore:S,DeckUI:UI,nodes,ctx}=setup();await S.load();let writes=0;ctx.Tracker.svc.setProgress=async()=>{writes++;};UI.airing=()=>({aired:4,next:{episode:5}});UI.quickEntries=[{anime:{id:'al:1',title:'Weekly show',episodes:12},progress:3}];const button={querySelector:()=>({})};nodes.set('[data-log-row="0"]',{querySelector:s=>s==='input'?{value:'5'}:button});await UI.quickLog(0);assert.equal(writes,0);
});

test('Add titles searches while typing and stale or cleared queries cannot replace current results',async()=>{
 const f=setup(),timers=new Map();let next=0;f.ctx.setTimeout=fn=>{timers.set(++next,fn);return next;};f.ctx.clearTimeout=id=>timers.delete(id);f.ctx.sfw=values=>values;f.ctx.App.modal=()=>{};const box={isConnected:true,innerHTML:'',setAttribute(){},removeAttribute(){},querySelectorAll:()=>[]},query={value:'',focus(){}};f.nodes.set('#ad-search-results',box);f.nodes.set('#ad-query',query);f.nodes.set('#ad-search-form',{});f.nodes.set('#ad-search-done',{});const searches=[];f.ctx.Kitsu.search=text=>new Promise(resolve=>searches.push({text,resolve}));f.DeckUI.addSearch('tonight');
 query.value='Fri';query.oninput();query.value='Frieren';query.oninput();assert.equal(timers.size,1);const callback=[...timers.values()][0];timers.clear();const pending=callback();assert.equal(searches[0].text,'Frieren');query.value='One Piece';query.oninput();const newer=[...timers.values()][0]();searches[1].resolve([{id:'2',title:'One Piece'}]);await newer;assert.match(box.innerHTML,/One Piece/);searches[0].resolve([{id:'1',title:'Frieren'}]);await pending;assert.doesNotMatch(box.innerHTML,/Frieren/);
 query.value='';query.oninput();assert.match(box.innerHTML,/Start typing/);
});

test('Quick Log distinguishes released unwatched episodes from the total season count',()=>{const {DeckUI:UI}=setup();UI.airing=()=>({aired:4,next:{episode:5}});const entry={anime:{id:'al:1',title:'Weekly',episodes:10,status:'releasing'},progress:0};const html=UI.quickRows([entry]);assert.match(html,/0 of 10 watched/);assert.match(html,/4 aired · ready to watch/);assert.equal(UI.quickLimit(entry),4);entry.anime.status='finished';assert.equal(UI.quickLimit(entry),10);assert.match(UI.quickRows([entry]),/10 left to watch/);assert.doesNotMatch(UI.quickRows([entry]),/4 aired/);});

test('pinned decks preserve routes, accurate counts, descriptions and empty states in the new layout',async()=>{const {DeckUI:UI,DeckStore:S}=setup();await S.load();S.state.decks[0].items=[{id:'al:1',title:'Example',poster:'https://example.test/a.jpg'}];const html=UI.pinned();assert.match(html,/ad-pinned3/);assert.match(html,/data-id="tonight"/);assert.match(html,/1 title/);assert.match(html,/Ready for your next watch/);assert.match(html,/Add titles/);});
