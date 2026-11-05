const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {ImageMeasurements,TTL}=require('../src/title-artwork-store.js');
const url='https://artworks.thetvdb.com/banners/backgrounds/example.jpg',now=1800000000000;
function fixture({fail=false}={}){let disk,loads=0;const io={read:async()=>structuredClone(disk),write:async rows=>{disk=structuredClone(rows);return true;}};const make=()=>({naturalWidth:3840,naturalHeight:2160,set src(_u){loads++;queueMicrotask(()=>fail?this.onerror():this.onload());}});return {io,make,count:()=>loads,disk:()=>disk};}
test('dimensions coalesce concurrent reads and survive a fresh app store without loading pixels',async()=>{
 const f=fixture(),store=new ImageMeasurements(f.io,()=>now,f.make);await store.load();const [a,b]=await Promise.all([store.measure(url),store.measure(url)]);assert.deepEqual(a,b);assert.equal(f.count(),1);await store.flush();
 const next=new ImageMeasurements(f.io,()=>now+1000,()=>{throw Error('Warm dimension lookup must not load an image');});await next.load();assert.deepEqual(await next.measure(url),a);assert.equal(f.count(),1);await next.clear();assert.deepEqual(f.disk(),[]);
});
test('private library images and authenticated/query URLs are never retained',async()=>{
 const f=fixture(),store=new ImageMeasurements(f.io,()=>now,f.make);for(const u of ['https://private.example/Items/a/Images/Backdrop','https://artworks.thetvdb.com/a.jpg?token=secret','http://artworks.thetvdb.com/a.jpg']){await store.measure(u);await store.measure(u);}assert.equal(f.count(),6);assert.equal(store.rows.size,0);await store.flush();assert.deepEqual(f.disk(),[]);
});
test('expired/corrupt dimensions are rechecked and URL variants keep their exact sizes',async()=>{
 const f=fixture(),store=new ImageMeasurements({read:async()=>[{u:url,w:3840,h:2160,at:now-TTL},{u:url+'x',w:-1,h:3,at:now}],write:f.io.write},()=>now,f.make);await store.load();assert.equal(store.rows.size,0);await store.measure(url);await store.measure(url.replace('example.jpg','other.jpg'));assert.equal(f.count(),2);await store.flush();
});
test('failed image checks are retryable; failed storage remains optional',async()=>{
 const f=fixture({fail:true}),store=new ImageMeasurements({read:async()=>{throw Error('blocked')},write:async()=>{throw Error('quota')}},()=>now,f.make);await store.load();assert.equal(await store.measure(url),null);assert.equal(await store.measure(url),null);assert.equal(f.count(),2);assert.equal(store.rows.size,0);assert.equal(await store.flush(),false);
});
test('hung image checks settle, cancel their image request and allow a later retry',async()=>{
 let stopped=0;const store=new ImageMeasurements({read:async()=>[],write:async()=>true},()=>now,()=>({set src(_u){},removeAttribute(name){assert.equal(name,'src');stopped++;}}));assert.equal(await store.measure(url,5),null);assert.equal(stopped,1);assert.equal(store.pending.size,0);assert.equal(await store.measure(url,5),null);assert.equal(stopped,2);
});
test('display errors remove stale dimension records from future launches',async()=>{
 const f=fixture(),store=new ImageMeasurements(f.io,()=>now,f.make);await store.measure(url);await store.flush();store.forget(url);await store.flush();const next=new ImageMeasurements(f.io,()=>now,f.make);await next.load();assert.equal(next.rows.size,0);await next.measure(url);assert.equal(f.count(),2);await next.flush();
});
test('a selected backdrop prevents late metadata groups from starting more image checks',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),fn=vm.runInNewContext(src.slice(src.indexOf('function firstUsableArtwork('),src.indexOf('const HomeReads='))+';firstUsableArtwork',{setTimeout,clearTimeout});let release;const late=new Promise(r=>release=r),measured=[];
 const result=await fn([()=>['chosen'],()=>late],async u=>{measured.push(u);return {u,w:3840,h:2160}},()=>1);assert.equal(result.u,'chosen');release(['unneeded-large-image']);await new Promise(setImmediate);assert.deepEqual(measured,['chosen']);
});
