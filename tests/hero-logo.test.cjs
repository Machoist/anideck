const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const fn=source.slice(source.indexOf('async function findTitleLogo('),source.indexOf('// Hovering a title',source.indexOf('function showLogo(')));
async function render(ratio,{reject=false,connected=true}={}){
 const classes=new Set(['logo-pending']),node={isConnected:connected,textContent:'JUJUTSU KAISEN Season 2',classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},prepend:im=>node.image=im,insertAdjacentHTML:()=>node.season=true};
 const context={titleLogoCache:new Map(),Number,Math,setTimeout:()=>1,clearTimeout(){},AniZip:{get:async()=>{if(reject)throw Error('Unavailable');return {logo:'fixture'};}},trimLogo:async()=>({ratio,url:'fixture'}),esc:s=>s,requestAnimationFrame:f=>f(),Image:class{style={setProperty(){}};classList={add(){}};set src(_){this.onload();}}};
 vm.runInNewContext(fn+';showLogo',context)(node,42,2);await new Promise(r=>setImmediate(r));return {node,classes};
}
test('portrait and invalid logos keep the readable title and do not add a detached season label',async()=>{
 for(const ratio of [.2,.8,1,NaN,Infinity]){const {node,classes}=await render(ratio);assert(!node.image);assert(!node.season);assert(!classes.has('has-logo'));assert(!classes.has('logo-pending'));assert.equal(node.textContent,'JUJUTSU KAISEN Season 2');}
});
test('landscape logos still render while failures reveal the fallback title',async()=>{
 const {node,classes}=await render(3);assert(node.image);assert(node.season);assert(classes.has('has-logo'));assert(!classes.has('logo-pending'));
 const failed=await render(3,{reject:true});assert(!failed.classes.has('logo-pending'));assert(!failed.node.image);
 const detached=await render(3,{connected:false});assert(!detached.node.image);
});

test('queue title treatment separates seasons for any title and safely renders unseasoned names',()=>{
 const start=source.indexOf('function queueTitleMarkup('),end=source.indexOf('function ynHero(',start);
 const title=vm.runInNewContext(source.slice(start,end)+';queueTitleMarkup',{esc:s=>String(s).replaceAll('<','&lt;')});
 for(const name of ['JUJUTSU KAISEN Season 2','Tokyo Revengers Season 3','Frieren: Beyond Journey’s End 2nd Season']){const html=title(name);assert(html.includes('yn-title-season'));assert(html.includes('yn-title-name'));}
 assert(!title('ONE PIECE').includes('yn-title-season'));assert(title('<unsafe>').includes('&lt;unsafe>'));
});

test('logo selection tries alternate exact-ID artwork after portrait, invalid or failed assets',async()=>{
 const start=source.indexOf('async function findTitleLogo('),end=source.indexOf('function showLogo(',start),seen=[];
 const pick=vm.runInNewContext(source.slice(start,end)+';findTitleLogo',{Set,Array,Number,trimLogo:async src=>{seen.push(src);if(src==='failed')throw Error('Unavailable');return {url:src,ratio:src==='wide'?3:.2};}});
 assert.equal((await pick({logo:'portrait',logos:['portrait','failed','wide','wide']})).url,'wide');assert.deepEqual(seen,['portrait','failed','wide']);
 seen.length=0;assert.equal(await pick({logos:['portrait','failed']}),null);assert.equal(await pick(null),null);
});

test('cached headings render logo artwork immediately across rerenders without the plaintext fallback',()=>{
 const cache=new Map([['42',{url:'data:image/png;base64,fixture',ratio:3}]]),start=source.indexOf('function logoHeading('),end=source.indexOf('async function findTitleLogo(',start);
 const render=vm.runInNewContext(source.slice(start,end)+';logoHeading',{titleLogoCache:cache,esc:s=>String(s).replaceAll('<','&lt;')});
 for(let i=0;i<5;i++){const html=render('チェンソーマン',42,'Chainsaw Man');assert(html.includes('hero-logo ready'));assert(!html.includes('logo-pending'));assert(html.includes('<p class="logo-english">Chainsaw Man</p>'));}
 assert(render('Chainsaw Man',99,'Chainsaw Man').includes('logo-pending'));
});
