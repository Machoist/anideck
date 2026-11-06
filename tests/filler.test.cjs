const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('src/filler.js','utf8');
function fixture(options={}){const calls=[];const helper=vm.runInNewContext(source+';FillerEpisodes',{Map,Promise,Date,setTimeout,Number,window:{native:{get:async()=>({'10':{mal:20,anilist:30},'11':{mal:21,anilist:31}})}},AniZip:{get:async()=>({malId:20,kitsu:10})},Kitsu:{externalIds:async()=>({mal:20})},http:async(url)=>{calls.push(url);return {data:[{mal_id:1,filler:false,recap:false},{mal_id:26,filler:true,recap:false},{mal_id:101,filler:true,recap:false}]};},...options});return {helper,calls};}
test('explicit flags only; false, absent, conflicting, specials and invalid rows stay unclassified',()=>{const {helper}=fixture(),rows=helper.parse({data:[{mal_id:1,filler:false},{mal_id:2,filler:true},{mal_id:3,recap:true},{mal_id:4,filler:true,recap:true},{mal_id:5,filler:true},{mal_id:5,filler:false},{mal_id:'S1',filler:true},{mal_id:0,filler:true}]});assert.deepEqual([...rows],[[1,'unknown'],[2,'filler'],[3,'recap'],[4,'unknown'],[5,'unknown']]);assert.throws(()=>helper.parse({data:null}));});
test('exact mappings, combined entries and conflicting catalogs cannot silently transfer classifications',async()=>{for(const identity of [{kitsuId:11,alId:30,total:12,kitsuTotal:12},{kitsuId:10,alId:30,malId:21},{kitsuId:10,alId:30,total:26,kitsuTotal:12},{kitsuId:'bad'}]){const {helper,calls}=fixture();assert.equal((await helper.read(identity,[26])).size,0);assert.equal(calls.length,0);}});
test('same public annotations work without tracker identity and preserve original numbers across page ranges',async()=>{const {helper,calls}=fixture();const result=await helper.read({kitsuId:10,alId:30,total:220,kitsuTotal:220},[26,101]);assert.equal(result.get(26).classification,'filler');assert.equal(result.get(101).classification,'filler');assert.equal(result.has(1),false);assert.equal(result.get(101).sourceUrl,'https://myanimelist.net/anime/20/episode/101');assert.equal(calls.length,2);assert.match(calls[1],/page=2$/);});
test('concurrent reads deduplicate; outage backoff covers other titles too and eventually permits retry',async()=>{let failures=0;const {helper}=fixture({http:async()=>{failures++;throw Error('429');}});const [a,b]=await Promise.all([helper.page('20',1),helper.page('20',1)]);assert.equal(a,null);assert.equal(b,null);await helper.page('20',1);await helper.page('21',1);assert.equal(failures,2);helper.cache.get('20:1').until=0;helper.nextAt=0;helper.cooldown.clear();await helper.page('20',1);assert.equal(failures,4);});
test('Jellyfin/non-catalog identity never makes a public request',async()=>{const {helper,calls}=fixture();assert.equal((await helper.read({kitsuId:'private-library-id'},[1])).size,0);assert.equal(calls.length,0);});
test('filler choices persist per title, ignore old global options and survive another title change',async()=>{
 let saved;const App={settings:{hideFiller:true,showFillerIndicators:false},saveSettings:async()=>{saved=JSON.stringify(App.settings);}}, {helper}=fixture({App});
 assert.deepEqual({...helper.preference('10')},{indicators:true,hide:false});
 await helper.savePreference('10',{indicators:false,hide:true});
 assert.deepEqual({...helper.preference('10')},{indicators:false,hide:true});assert.deepEqual({...helper.preference('11')},{indicators:true,hide:false});
 await helper.savePreference('11',{indicators:true,hide:true});App.settings=JSON.parse(saved);
 assert.deepEqual({...helper.preference('10')},{indicators:false,hide:true});assert.deepEqual({...helper.preference('11')},{indicators:true,hide:true});
});
test('failed preference storage restores only that title without discarding other saved choices',async()=>{
 const App={settings:{episodeFiller:{11:{indicators:false,hide:true}}},saveSettings:async()=>{throw Error('disk failure');}},{helper}=fixture({App});
 await assert.rejects(helper.savePreference('10',{indicators:true,hide:true}),/disk failure/);
 assert.deepEqual({...helper.preference('10')},{indicators:true,hide:false});assert.deepEqual({...helper.preference('11')},{indicators:false,hide:true});
});
test('exact catalog MAL mapping works when artwork mapping and optional Kitsu services are unavailable',{timeout:1000},async()=>{
 const {helper,calls}=fixture({AniZip:{get:()=>new Promise(()=>{})},Kitsu:{externalIds:()=>new Promise(()=>{})}});
 const result=await helper.read({kitsuId:12,alId:21,malId:21},[26]);assert.equal(result.get(26).classification,'filler');assert.match(calls[0],/tenrai\.org\/v1\/anime\/21\/episodes/);
});
test('a failed annotation service does not cool down its healthy fallback',async()=>{
 let first=0,second=0;const {helper}=fixture({http:async url=>{if(url.includes('tenrai')){first++;throw Error('offline');}second++;return {data:[{mal_id:26,filler:true}]};}});
 assert.equal((await helper.page('20',1)).get(26),'filler');helper.nextAt=0;assert.equal((await helper.page('21',1)).get(26),'filler');assert.equal(first,1);assert.equal(second,2);
});
test('conflicting external catalog IDs and wrong episode-source identity are rejected',async()=>{
 const {helper,calls}=fixture({window:{native:{get:async()=>({'10':{mal:20,anilist:99}})}}});assert.equal((await helper.read({kitsuId:10,alId:30,malId:20},[26])).size,0);assert.equal(calls.length,0);
 assert.throws(()=>helper.parse({data:[{mal_id:26,filler:true,url:'https://myanimelist.net/anime/21/One_Piece/episode/26'}]},20),/identity mismatch/);
});
test('different running episode totals on an airing title do not suppress exact-ID annotations',async()=>{
 const {helper}=fixture();const result=await helper.read({kitsuId:10,alId:30,malId:20,total:1200,kitsuTotal:1199,status:'releasing'},[26]);assert.equal(result.get(26).classification,'filler');
});
