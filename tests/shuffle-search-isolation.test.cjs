const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('popular navigator Random remains broad after repeated single-franchise searches',async()=>{
 const apiSource=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8'),source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const {Kitsu,AniList}=vm.runInNewContext(apiSource+';({Kitsu,AniList})',{window:{native:{get:async()=>({}),set:async()=>{}}},URLSearchParams,Map,Set,Date,console,setTimeout,clearTimeout});
 AniList.gql=async()=>({byId:{media:[1,2,3,41,42,43].map(id=>({id,type:'ANIME',format:'TV'}))}});
 const payload=ids=>({data:ids.map(id=>({id:String(id),type:'anime',attributes:{canonicalTitle:id<4?'One franchise Part '+id:'Independent title '+id,subtype:'TV',popularityRank:id},relationships:{mappings:{data:[{id:'m'+id}]},categories:{data:[]}}})),included:ids.map(id=>({id:'m'+id,type:'mappings',attributes:{externalSite:'anilist/anime',externalId:id}}))});
 let broadReads=0;Kitsu.call=async url=>{if(url.includes('filter%5Btext%5D'))return payload([1,2,3]);broadReads++;return payload([41,42,43]);};Kitsu.animeFull=async()=>({});
 const opens=[],context={Kitsu,AniList:{details:async()=>null},Tracker:{name:'local',loggedIn:()=>false,svc:{}},sfw:rows=>rows,titleKey:String,toast(){},console,$:()=>null};
 const a=source.indexOf('async function popularUnwatchedPool('),b=source.indexOf('/* ================================ ROW ARROWS',a);context.popularUnwatchedPool=vm.runInNewContext(source.slice(a,b)+';popularUnwatchedPool',context);
 const methods=source.slice(source.indexOf('  shuffleSource() {'),source.indexOf('\n  openItem(',source.indexOf('  shuffleKey() {'))),app=vm.runInNewContext('({'+methods+'})',context);Object.assign(app,{settings:{shuffleFrom:'popular'},view:'home',params:{},renderId:1,act:async(_name,data)=>opens.push(data.id)});
 for(let i=0;i<4;i++)await Kitsu.searchWithGenres('One franchise');assert.equal(Kitsu.recentDiscovery().length,0);
 for(let i=0;i<8;i++)await app.shuffle();assert.equal(broadReads,1);assert.equal(opens.length,8);assert(opens.every(id=>['41','42','43'].includes(id)));for(let i=1;i<opens.length;i++)assert.notEqual(opens[i],opens[i-1]);
});
