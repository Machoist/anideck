const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function fixture(){const api=vm.runInNewContext(source+';({Kitsu,AniList,CatalogEligibility,Trakt})',{window:{native:{get:async()=>({}),set:async()=>{}}},URLSearchParams,Map,Set,Date,console,setTimeout,clearTimeout});return api;}
function row(id,format='TV',mapping='m'+id){return {id:String(id),attributes:{canonicalTitle:'Anime '+id,subtype:format},relationships:{mappings:{data:[{type:'mappings',id:mapping}]}}};}
const mapping=(id,site,externalId)=>({id,type:'mappings',attributes:{externalSite:site,externalId}});
test('discovery excludes music and titles without exact AniList support, without title-name guesses',async()=>{
 const {Kitsu,AniList}=fixture();let calls=0;AniList.gql=async(q,v,auth)=>{calls++;assert.equal(auth,false);assert(q.includes('idMal_in'));return {byMal:{media:[{id:1,idMal:1,type:'ANIME',format:'TV'},{id:2,idMal:2,type:'ANIME',format:'MUSIC'}]}};};
 const payload={data:[row(1),row(2),row(3),row(4,'music')],included:[mapping('m1','myanimelist/anime',1),mapping('m2','myanimelist/anime',2),mapping('m3','imdb/episodes','tt13309742'),mapping('m4','myanimelist/anime',4),mapping('noise','anilist/anime',99)]};
 assert.deepEqual(Array.from(await Kitsu.discoveryData(payload),x=>x.id),['1']);assert.equal(calls,1);await Kitsu.discoveryData(payload);assert.equal(calls,1);
});
test('parallel catalog sections share a batched verification request and failed verification is retryable',async()=>{
 const {Kitsu,AniList}=fixture();let calls=0,failed=true;AniList.gql=async()=>{calls++;if(failed)throw Error('Offline');return {byId:{media:[{id:1,type:'ANIME',format:'TV'},{id:2,type:'ANIME',format:'ONA'}]}};};
 const payload=id=>({data:[row(id)],included:[mapping('m'+id,'anilist/anime',id)]});
 const first=await Promise.allSettled([Kitsu.discoveryData(payload(1)),Kitsu.discoveryData(payload(2))]);assert(first.every(x=>x.status==='rejected'));assert.equal(calls,1);failed=false;
 const result=await Promise.all([Kitsu.discoveryData(payload(1)),Kitsu.discoveryData(payload(2))]);assert.equal(calls,2);assert(result.every(x=>x.length===1));
});
test('trending hydration trusts only requested IDs and valid mapping relationships',async()=>{
 const {Kitsu,AniList}=fixture();Kitsu.call=async url=>{assert(url.includes('filter%5Bid%5D=1'));return {data:[row(1),row(999)],included:[mapping('m1','anilist/anime',1),mapping('m999','anilist/anime',999)]};};AniList.gql=async()=>({byId:{media:[{id:1,type:'ANIME',format:'TV'},{id:999,type:'ANIME',format:'TV'}]}});
 const payload={data:[{id:'1',attributes:{canonicalTitle:'Known',subtype:'TV'}}]};assert.deepEqual(Array.from(await Kitsu.discoveryData(payload),x=>x.id),['1']);
});
test('anime artwork never falls back to a title-only live-action lookup',async()=>{const {Trakt}=fixture();assert.equal((await Trakt.fanartFor('Gifted',2024)).length,0);});

test('TVDB logo index accepts only clearlogo assets belonging to the exact mapped series and caches the read',async()=>{
 let reads=0;const ctx={URL,URLSearchParams,Map,Set,Date,console,setTimeout,clearTimeout,window:{native:{get:async()=>({}),set:async()=>{}}},testHttp:async (url,options)=>{reads++;assert.equal(options.allowChallenge,false);assert.equal(url,'https://thetvdb.com/dereferrer/series/352408');return '<img src="https://artworks.thetvdb.com/banners/v4/series/352408/clearlogo/a.png"><img src="https://artworks.thetvdb.com/banners/v4/series/999/clearlogo/b.png"><img src="https://artworks.thetvdb.com/banners/v4/series/352408/posters/c.png">';}};
 const api=vm.runInNewContext(source+';http=testHttp;AniZip',ctx);assert.deepEqual(Array.from(await api.clearlogos(352408)),['https://artworks.thetvdb.com/banners/v4/series/352408/clearlogo/a.png']);await api.clearlogos(352408);assert.equal(reads,1);assert.equal((await api.clearlogos('../other')).length,0);assert.equal(reads,1);
});
