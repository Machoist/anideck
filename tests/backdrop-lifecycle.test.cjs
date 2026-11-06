const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const start=source.indexOf('const bgChoice = new Map()'),end=source.indexOf('// Sets your list',start);

function hero(config,background){
 const node={isConnected:true,dataset:{bgs:JSON.stringify(config)},style:{backgroundImage:background},children:[],
  getBoundingClientRect:()=>({width:1280,height:480,top:0,left:0,right:1280,bottom:480}),closest:()=>null};
 node.appendChild=img=>{img.parent=node;node.children.push(img);return img;};
 node.removeChild=img=>{node.children=node.children.filter(item=>item!==img);img.parent=null;};
 node.querySelectorAll=selector=>selector==='.hero-bg-img'?node.children.filter(img=>String(img.className).includes('hero-bg-img')):[];
 return node;
}
function image(){
 const img={className:'',alt:'',naturalWidth:0,naturalHeight:0,parent:null,_src:'',classList:{add(name){this[name]=true;},contains(name){return !!this[name];}}};
 Object.defineProperty(img,'src',{get(){return this._src;},set(value){this._src=value;}});
 img.getAttribute=name=>name==='src'?img._src:null;
 img.remove=()=>{if(img.parent)img.parent.removeChild(img);};
 return img;
}
function world(){
 const idle=[],pending=[],raf=[];let active=null;const App={stale:()=>false,settings:{}};
 const requestIdleCallback=fn=>idle.push(fn),requestAnimationFrame=fn=>raf.push(fn);
 const window={devicePixelRatio:1,requestIdleCallback};
 const ArtworkImages={measure(url){return new Promise(resolve=>pending.push({url,resolve}));}};
 const upgrade=vm.runInNewContext(source.slice(start,end)+'\nupgradeBackdrop',{Map,Set,Image:class Image{},App,window,requestIdleCallback,requestAnimationFrame,document:{querySelector:()=>active,createElement:()=>image()},AniZip:{get:async()=>null},Trakt:{fanartFor:async()=>[]},ArtworkImages,setTimeout,clearTimeout});
 return {upgrade,App,idle,pending,raf,use(node){active=node;},resolve(){const item=pending.shift();assert.ok(item);item.resolve({u:item.url,w:3000,h:1100});return item.url;},reject(){const item=pending.shift();assert.ok(item);item.resolve(null);}};
}
async function tick(){await Promise.resolve();await Promise.resolve();}
async function flushIdle(env){const queued=env.idle.splice(0);for(const fn of queued)fn();await tick();}
const initial='url("http://fixture/backdrop-initial.png")';
const sharpConfig=()=>({first:['http://fixture/backdrop-sharp.png'],mid:[],last:[],fanart:[],force:'',alId:null,lib:null,pill:false});

test('overlapping delayed upgrades of one hero append the sharper image once',async()=>{
 const env=world(),node=hero(sharpConfig(),initial);env.use(node);
 const first=env.upgrade(1),second=env.upgrade(1);
 await flushIdle(env);
 assert.equal(node.children.length,0);
 while(env.pending.length)env.resolve();
 await first;await second;
 assert.deepEqual(node.children.map(img=>img.src),['http://fixture/backdrop-sharp.png']);
 assert.equal(node.style.backgroundImage,initial);
});

test('repeated upgrades before and after load keep a single image node',async()=>{
 const env=world(),node=hero(sharpConfig(),initial);env.use(node);
 const first=env.upgrade(1);
 await flushIdle(env);env.resolve();await first;
 const beforeLoad=env.upgrade(1);await flushIdle(env);if(env.pending.length)env.resolve();await beforeLoad;
 assert.deepEqual(node.children.map(img=>img.src),['http://fixture/backdrop-sharp.png']);
 node.children[0].onload();env.raf.splice(0).forEach(fn=>fn());
 assert.equal(node.children[0].classList.contains('on'),true);
 const afterLoad=env.upgrade(1);await flushIdle(env);if(env.pending.length)env.resolve();await afterLoad;
 assert.equal(node.children.length,1);
 assert.equal(node.children[0].classList.contains('on'),true);
 assert.equal(node.style.backgroundImage,initial);
});

test('distinct heroes and configs upgrade independently',async()=>{
 const env=world();
 const firstHero=hero({first:['http://fixture/a.png'],mid:[],last:[],fanart:[],force:'',pill:false},initial);
 const secondHero=hero({first:['http://fixture/b.png'],mid:[],last:[],fanart:[],force:'',pill:false},initial);
 env.use(firstHero);const first=env.upgrade(1);
 env.use(secondHero);const second=env.upgrade(2);
 await flushIdle(env);
 assert.equal(env.pending.length,2);
 env.pending.splice(0).forEach(item=>item.resolve({u:item.url,w:3000,h:1100}));
 await first;await second;
 assert.deepEqual(firstHero.children.map(img=>img.src),['http://fixture/a.png']);
 assert.deepEqual(secondHero.children.map(img=>img.src),['http://fixture/b.png']);
});

test('stale navigation and a detached hero receive no image write, then a live hero can retry',async()=>{
 const env=world(),node=hero(sharpConfig(),initial);env.use(node);
 env.App.stale=()=>true;
 const stale=env.upgrade(1);
 await flushIdle(env);if(env.pending.length)env.resolve();await stale;
 assert.equal(node.children.length,0);
 env.App.stale=()=>false;node.isConnected=false;
 const detached=env.upgrade(1);
 await flushIdle(env);if(env.pending.length)env.resolve();await detached;
 assert.equal(node.children.length,0);
 node.isConnected=true;
 const retry=env.upgrade(1);
 await flushIdle(env);assert.ok(env.pending.length);env.resolve();await retry;
 assert.deepEqual(node.children.map(img=>img.src),['http://fixture/backdrop-sharp.png']);
});

test('a changed configuration does not receive the previous candidate',async()=>{
 const env=world(),node=hero(sharpConfig(),initial);env.use(node);
 const first=env.upgrade(1);
 await flushIdle(env);
 node.dataset.bgs=JSON.stringify({first:['http://fixture/other.png'],mid:[],last:[],fanart:[],force:'',pill:false});
 if(env.pending.length)env.resolve();
 await first;
 assert.equal(node.children.length,0);
 const second=env.upgrade(1);
 await flushIdle(env);env.resolve();await second;
 assert.deepEqual(node.children.map(img=>img.src),['http://fixture/other.png']);
 assert.equal(node.style.backgroundImage,initial);
});

test('failed measurement and a failed image load release the hero for one retry',async()=>{
 const env=world(),node=hero(sharpConfig(),initial);env.use(node);
 const failed=env.upgrade(1);
 await flushIdle(env);env.reject();await failed;
 assert.equal(node.children.length,0);
 const loaded=env.upgrade(1);
 await flushIdle(env);env.resolve();await loaded;
 assert.equal(node.children.length,1);
 if(typeof node.children[0].onerror==='function')node.children[0].onerror();
 assert.equal(node.children.length,0);
 const retry=env.upgrade(1);
 await flushIdle(env);if(env.pending.length)env.resolve();await retry;
 assert.deepEqual(node.children.map(img=>img.src),['http://fixture/backdrop-sharp.png']);
});
