const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const helpers=source.slice(source.indexOf('function spotlightDuration('),source.indexOf('const queueArtCache'));
const {duration,score}=vm.runInNewContext(helpers+'\n({duration:spotlightDuration,score:queueArtworkScore})',{App:{settings:{spotlightMs:8000}}});
test('carousel timing is 40 percent shorter including existing saved speed preferences',()=>{assert.equal(duration(),4800);assert.equal(duration(5000),3000);assert.equal(duration(12000),7200);assert.equal(duration(4800),4800);assert.equal(duration('invalid'),4800)});
test('queue artwork rejects portrait crops and sources too small for the window',()=>{const box={width:1720,height:608};assert.equal(score({w:600,h:200},box,1),0);assert.equal(score({w:2000,h:3000},box,1),0);assert(score({w:3840,h:2160},box,1)>score({w:1920,h:1080},box,1));assert(score({w:1920,h:1080},box,2)>0);});

test('queue loads full AniList metadata, chooses sharp art, and ignores a superseded artwork request',async()=>{
 const pending={},logos=[],timings=[];let currentImage={classList:{remove(){}},hidden:true};
 const queue=[{kind:'remote',kitsu:'al:1',alId:'1',title:'First'},{kind:'remote',kitsu:'al:2',alId:'2',title:'Second'}];
 const hero={classList:{remove(){},add(){}},offsetWidth:1,getBoundingClientRect:()=>({width:1000,height:500}),set innerHTML(v){currentImage={classList:{remove(){}},hidden:true}}};
 const sidebar={onclick:null};const buttons=queue.map((_,i)=>({dataset:{yn:String(i)},classList:{toggle(){}},setAttribute(){}}));
 const root={dataset:{queue:JSON.stringify(queue)},isConnected:true,contains:()=>false,querySelector:sel=>sel==='.yn-queue'?sidebar:sel==='.yn-hero'?hero:sel==='.yn-bg'?currentImage:null,querySelectorAll:sel=>sel==='.yn-item'?buttons:[]};
 const context={App:{settings:{spotlightMs:8000},stale:()=>false},$:s=>s==='#yn'?root:s==='#yn-hero'?hero:{hidden:true},window:{devicePixelRatio:1},document:{hidden:false,activeElement:null},AniList:{details:id=>new Promise(resolve=>pending[id]=resolve)},AniZip:{get:async id=>({fanart:'large-'+id})},kitsuCover:async()=> 'medium-kitsu',kitsuCoverOk:()=>true,Trakt:{fanartFor:async()=>[]},showTint(){},showLogo:(el,id)=>logos.push(id),seasonNumberIn:()=>1,ynHero:it=>it.title,console,IntersectionObserver:class{observe(){}},setInterval:(fn,ms)=>{timings.push(ms);return 1},clearInterval(){},setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t},clearTimeout,Image:class{set src(u){const dims=u.startsWith('large')?[2400,1200]:u==='medium-kitsu'?[1600,900]:[600,300];this.naturalWidth=dims[0];this.naturalHeight=dims[1];queueMicrotask(()=>this.onload())}}};
 vm.runInNewContext(source.slice(source.indexOf('function spotlightDuration('),source.indexOf('function weekRibbon('))+'\nbindYourNext(1)',context);
 assert(pending['al:1']);sidebar.onclick({target:{closest:()=>buttons[1]}});assert(pending['al:2']);pending['al:2']({id:2,banner:'small-2'});
 await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(currentImage.src,'large-2');assert.equal(currentImage.hidden,false);pending['al:1']({id:1,banner:'small-1'});await new Promise(setImmediate);assert.equal(currentImage.src,'large-2');assert.deepEqual(logos,[2]);assert(timings.includes(4800));
});

test('wide and high-DPI windows keep usable banners instead of switching to portrait fallback',()=>{
 for(const box of [{width:2529,height:739},{width:3440,height:700},{width:3840,height:720}])for(const dpr of [1,1.25,2]){assert(score({w:1920,h:1080},box,dpr)>0);assert(score({w:3840,h:2160},box,dpr)>score({w:1920,h:1080},box,dpr));}
 const start=source.indexOf('function queueTitleMarkup('),end=source.indexOf('function yourNextHero(',start);const render=vm.runInNewContext(source.slice(start,end)+'\nynHero',{esc:s=>String(s??''),icon:()=>''});const html=render({kind:'remote',title:'Example',num:1,poster:'https://art.test/poster.jpg',banner:'https://art.test/banner.jpg'});assert(html.includes('https://art.test/banner.jpg'));assert(!html.includes('class="yn-poster-fallback"'));
});
