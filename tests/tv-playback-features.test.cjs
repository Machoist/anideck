const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/player.js'),'utf8');
function setup(){
 const nodes=new Map(),commands=[],updates=[],reports=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}}});return nodes.get(id);};
 const ctx={console,Date,setTimeout,clearTimeout,clearInterval,App:{settings:{autoSkip:true,autoNext:true,autoTrack:true,threshold:.8},isAnime:()=>true},window:{native:{get:async()=>({}),set(){}}},Tracker:{name:'AniList',loggedIn:()=>true,setProgress:async(...args)=>{updates.push(args);return {progress:args[1]};}},Jellyfin:{report:(...args)=>reports.push(args)},Cast:{command:async(...args)=>commands.push(args)},fmtTime:String,TICKS:10000000,toast(){},relativeEpisodeNumber:()=>1,document:{getElementById:node}};
 const player=vm.runInNewContext(source+'\nPlayer',ctx);
 player.el={hidden:false,classList:{toggle(){}}};player.video={currentTime:0,duration:0,paused:true};player.loadSeq=1;player.segments=[{type:'intro',start:60,end:120}];player.ctx={remoteOnly:true,series:{Name:'Example'},episode:{Id:'remote-4',IndexNumber:4},episodes:[{Id:'remote-4',IndexNumber:4},{Id:'remote-5',IndexNumber:5}],match:{id:'al:42',episodes:12}};
 player.casting={mediaId:'media',time:70,duration:1400,paused:false};player.preloadNextEpisode=()=>{};
 return {player,ctx,commands,updates,reports,node};
}
test('TV progress loads skip timings from receiver duration and auto-skips while the PC video is paused',async()=>{
 const f=setup();f.player.segments=[];let duration;f.player.loadSegments=()=>{duration=f.player.dur();};f.player.tick();assert.equal(duration,1400);
 f.player.segments=[{type:'intro',start:60,end:120}];f.player.tick();assert.deepEqual(f.commands,[['seek',120]]);assert.equal(f.node('p-skip').hidden,true);f.player.tick();assert.equal(f.commands.length,1);
 f.player.casting.paused=true;f.player.lastAutoSkip=null;f.player.tick();assert.equal(f.commands.length,1);assert.equal(f.node('p-skip').hidden,false);
});
test('TV manual intro and outro controls use receiver position and preserve the after-credits portion',()=>{
 const f=setup();f.ctx.App.settings.autoSkip=false;f.player.tick();assert.equal(f.node('p-skip-label').textContent,'Skip intro');f.player.skipSegment();assert.deepEqual(f.commands,[['seek',120]]);
 f.player.ctx.episodes=[f.player.ctx.episode];f.player.segments=[{type:'outro',start:1200,end:1300}];f.player.casting.time=1220;f.player.tick();assert.equal(f.node('p-skip-label').textContent,'Skip credits');f.player.skipSegment();assert.deepEqual(f.commands[1],['seek',1300]);
});
test('TV watch threshold records the actual remote episode once, and respects tracking off',async()=>{
 const f=setup();f.player.casting.time=1130;f.player.tick();await new Promise(setImmediate);assert.equal(f.updates.length,1);assert.deepEqual(f.updates[0],['al:42',4,12]);f.player.tick();assert.equal(f.updates.length,1);
 const off=setup();off.ctx.App.settings.autoTrack=false;off.player.casting.time=1130;off.player.tick();await new Promise(setImmediate);assert.equal(off.updates.length,0);
});
test('TV up-next and end handling advance on auto-next, with cancellation respected',()=>{
 const f=setup();f.player.casting.time=1390;f.player.tracked=true;f.player.tick();assert.equal(f.node('p-next').hidden,false);assert.equal(f.node('p-next').dataset.ep,'remote-5');let loaded;f.player.load=ep=>loaded=ep;f.player.ended();assert.equal(loaded.Id,'remote-5');
 loaded=null;f.player.cancelNext();f.player.ended();assert.equal(loaded,null);f.ctx.App.settings.autoNext=false;f.player.nextCancelled=false;f.player.ended();assert.equal(loaded,null);
});
test('Jellyfin TV progress reports receiver time and pause state rather than the dormant PC video',()=>{
 const f=setup();f.player.item={Id:'local-ep'};f.player.casting.time=250;f.player.casting.paused=false;f.player.report('progress');assert.equal(f.reports[0][1].PositionTicks,2500000000);assert.equal(f.reports[0][1].IsPaused,false);
});

test('next-episode preloading waits until near the end instead of competing with playback startup',()=>{
 const {player}=setup();player.remote=true;player.tracked=true;let calls=0;player.preloadNextEpisode=()=>calls++;player.casting.time=20;player.tick();assert.equal(calls,0);player.casting.time=1320;player.tick();assert.equal(calls,1);
});
