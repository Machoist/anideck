const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function fixture(imdb,images=[]){let requests=0;const ctx={Map,Set,Date,qs:()=>'?anilist_id=145064',http:async()=>{requests++;return {mappings:{imdb_id:imdb},images,episodes:{}};}};const api=vm.runInNewContext(source.slice(source.indexOf('const AniZip ='),source.indexOf('// Optional on-device tracking.'))+';AniZip',ctx);return {api,count:()=>requests};}
test('artwork metadata retains all provider logos and adds only an exact valid IMDb logo mapping',async()=>{
 const f=fixture('tt12343534',[{coverType:'Clearlogo',url:'https://art.test/portrait.png'},{coverType:'Clearlogo',url:'https://art.test/wide.png'},{coverType:'Clearlogo',url:'https://art.test/wide.png'},{coverType:'Fanart',url:'https://art.test/fanart.jpg'}]);
 const data=await f.api.get(145064);assert.deepEqual(Array.from(data.logos),['https://art.test/portrait.png','https://art.test/wide.png','https://images.metahub.space/logo/medium/tt12343534/img']);assert.equal(data.logo,'https://art.test/portrait.png');assert.equal(data.fanart,'https://art.test/fanart.jpg');await f.api.get(145064);assert.equal(f.count(),1);
});
test('missing or invalid mappings do not produce guessed alternate logo URLs',async()=>{
 for(const id of [null,'','12345','tt123/other','tt12343534?x=1','https://wrong.test']){const f=fixture(id);assert.equal((await f.api.get(42)).logos.length,0);}
});

test('mislabelled TVDB icons are tried after the exact mapped alternate logo',async()=>{
 const f=fixture('tt12343534',[{coverType:'Clearlogo',url:'https://art.test/icons/vertical.png'}]);
 assert.deepEqual(Array.from((await f.api.get(145064)).logos),['https://images.metahub.space/logo/medium/tt12343534/img','https://art.test/icons/vertical.png']);
});
