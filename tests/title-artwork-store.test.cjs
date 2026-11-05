const {test}=require('node:test'),assert=require('node:assert/strict');
const {ArtworkStore,retained,valid,MAX_ENTRIES,MAX_BYTES,TTL}=require('../src/title-artwork-store.js');
const now=1800000000000,logo={url:'https://artworks.thetvdb.com/banners/test.png',ratio:3};
const row=(id,at=now)=>({id:String(id),at,logo});

test('validated public artwork survives a fresh store without rediscovery',async()=>{
 let disk,writes=0;const io={read:async()=>structuredClone(disk),write:async value=>{disk=structuredClone(value);writes++;}};
 const first=new ArtworkStore(io,()=>now);await first.load(new Map());first.remember(42,logo);await first.flush();
 const second=new ArtworkStore(io,()=>now+1000),target=new Map();assert.equal(await second.load(target),1);assert.deepEqual(target.get('42'),logo);assert.equal(writes,1);
 await second.load(target);assert.equal(writes,1,'reading retained artwork must not reset its age');
});
test('artwork retention rejects stale, future, unscoped and private inputs',()=>{
 assert(valid(row(1),now));
 for(const input of [row('kitsu:1'),row(1,now-TTL),row(1,now+1),{...row(1),logo:{...logo,ratio:NaN}},...['http://artworks.thetvdb.com/a.png','https://127.0.0.1/a.png','https://private.example/Items/a/Images/Logo','https://artworks.thetvdb.com/a.png?api_key=secret','https://u:p@artworks.thetvdb.com/a.png','data:image/svg+xml,<svg/>'].map(url=>({...row(1),logo:{url,ratio:3}}))])assert(!valid(input,now));
 assert.equal(retained([row(1,now-TTL)],now).length,0);
});
test('retention bounds decoded string storage and keeps the newest exact IDs',()=>{
 const rows=Array.from({length:100},(_,i)=>row(i+1,now-i)),result=retained(rows,now);assert.equal(result.length,MAX_ENTRIES);assert.equal(result[0].id,'1');
 const png='data:image/png;base64,iVBORw0KGgo'+'A'.repeat(400000),large=retained(rows.map(r=>({...r,logo:{url:png,ratio:3}})),now);
 assert(large.length>0&&large.length<MAX_ENTRIES);assert(large.reduce((n,r)=>n+r.logo.url.length*2+128,0)<=MAX_BYTES);
});
test('storage failure is optional and invalidated logos stay removed across restart',async()=>{
 const failed=new ArtworkStore({read:async()=>{throw Error('unavailable')},write:async()=>{throw Error('quota')}},()=>now);assert.equal(await failed.load(new Map()),0);failed.remember(1,logo);await failed.flush();
 let disk=[row(1),row(2)];const io={read:async()=>disk,write:async rows=>{disk=rows;}};const store=new ArtworkStore(io,()=>now);await store.load(new Map());store.forget(1);await store.flush();const target=new Map();await new ArtworkStore(io,()=>now).load(target);assert(!target.has('1'));assert(target.has('2'));await store.clear();assert.equal(disk.length,0);
});
test('startup hydration does not overwrite newer in-session artwork',async()=>{
 let finish;const store=new ArtworkStore({read:()=>new Promise(resolve=>finish=resolve),write:async()=>{}},()=>now);const target=new Map(),pending=store.load(target),newLogo={...logo,url:'https://image.tmdb.org/t/p/original/new.png'};store.remember(1,newLogo);target.set('1',newLogo);finish([row(1)]);await pending;assert.deepEqual(target.get('1'),newLogo);assert.deepEqual(store.rows.get('1').logo,newLogo);await store.flush();
});
