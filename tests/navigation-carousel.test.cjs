const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const a=source.indexOf('function carouselArtworkScore('),b=source.indexOf('// One banner slide',a);const score=vm.runInNewContext(source.slice(a,b)+'\ncarouselArtworkScore');
test('carousel favors sharp proportionate art and rejects portrait or extreme cropping',()=>{const box={width:1440,height:500};assert(score({w:3000,h:1000},box,1)>score({w:1900,h:400},box,1));assert.equal(score({w:1200,h:1800},box,1),0);assert.equal(score({w:6000,h:400},box,1),0);assert(score({w:1900,h:400},box,1)<0.65);assert.equal(score(null,box),0)});
test('navigation dock rises from the bottom after a short dwell and hides outside the dock or its menus',()=>{const events={},windowEvents={},timers=new Map();let n=0,blurred=false;const classes=new Set(),player={hidden:true};const input={inHeader:true,blur(){blurred=true}};const nav={hidden:false},suggest={hidden:false},notif={hidden:false},button={setAttribute(){}};const bar={offsetHeight:56,classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x)},contains:target=>!!target?.inHeader};const shell={hidden:false};const ids={shell,player,nav,'tb-suggest':suggest,'notif-panel':notif,'nav-current':button};const ctx={document:{activeElement:input,getElementById:id=>ids[id],querySelector:()=>bar,addEventListener:(name,fn)=>events[name]=fn},window:{innerHeight:1000,addEventListener:(name,fn)=>windowEvents[name]=fn},setTimeout:fn=>{timers.set(++n,fn);return n},clearTimeout:id=>timers.delete(id)};const start=source.indexOf('// Dock: rises from the bottom edge');vm.runInNewContext(source.slice(start),ctx);
 const flush=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn()}};const move=(y,target={})=>events.pointermove({clientY:y,pointerType:'mouse',target});
 move(965);assert(!classes.has('auto-reveal'));flush();assert(classes.has('auto-reveal'));
 move(940);assert(classes.has('auto-reveal'));move(910);assert(!classes.has('auto-reveal'));assert.equal(timers.size,0);assert(blurred);assert(nav.hidden&&suggest.hidden&&notif.hidden);
 move(820);move(970);flush();assert(classes.has('auto-reveal'));
 move(850,{inHeader:true});assert.equal(timers.size,0);assert(classes.has('auto-reveal'));
 player.hidden=false;move(970);assert(!classes.has('auto-reveal'));player.hidden=true;
 move(500);move(975);assert.equal(timers.size,1);move(600);assert.equal(timers.size,0);assert(!classes.has('auto-reveal'));
 move(990);flush();assert(classes.has('auto-reveal'));events.pointerleave({clientY:999});assert(!classes.has('auto-reveal'));move(990);flush();events.pointerleave({clientY:400});assert(!classes.has('auto-reveal'));
});
test('carousel drops artless slides instead of rendering portrait fallback layouts',async()=>{
 let remaining=true,removed=false;const image={dataset:{srcs:'["portrait"]',fan:'null'}};const slide={dataset:{},querySelector:()=>image,remove:()=>remaining=false};
 const car={getBoundingClientRect:()=>({width:1440,height:500}),classList:{add(){},remove(){}},querySelectorAll:()=>remaining?[slide]:[],querySelector:()=>({}),remove:()=>removed=true};
 class Image{set src(value){this.naturalWidth=500;this.naturalHeight=1000;queueMicrotask(()=>this.onload())}}
 const ctx={bindYourNext(){},bindWeek(){},enhanceMosaic(){},$:()=>car,window:{devicePixelRatio:1},App:{stale:()=>false},Image,Set,JSON,AniZip:{get:async()=>null},carouselArtworkScore:score,setTimeout,clearTimeout};
 const start=source.indexOf('  async homeAfter('),end=source.indexOf('  async library(',start);const method=source.slice(start,end).trim().replace(/^async homeAfter/,'async function').replace(/,\s*$/,'');
 await vm.runInNewContext('('+method+')',ctx)({},1);assert(removed);assert(!remaining);
});
