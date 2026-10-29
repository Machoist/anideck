const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function services(){return vm.runInNewContext(source+'\n({AniList,Kitsu})',{window:{},URLSearchParams,console,Map,Set});}
test('score-only changes and clearing use provider scales without changing status or progress',async()=>{for(const provider of ['AniList','Kitsu']){const svc=services()[provider];svc.token='fixture';svc.userId='1';svc.mediaId=async()=>42;svc.entry=async()=>({id:'7',status:'planned',progress:2});const calls=[];svc.gql=async(q,v)=>{calls.push(v);return {SaveMediaListEntry:{id:7,status:'PLANNING',progress:2,score:8.5}}};svc.call=async(p,o)=>calls.push(o.json.data.attributes);await svc.saveEntry('42',{scoreOnly:true,rating:8.5});await svc.saveEntry('42',{scoreOnly:true,rating:null});if(provider==='AniList'){assert.deepEqual(Object.keys(calls[0]).sort(),['mediaId','scoreRaw']);assert.equal(calls[0].scoreRaw,85);assert.equal(calls[1].scoreRaw,0);}else{assert.deepEqual(Object.keys(calls[0]),['ratingTwenty']);assert.equal(calls[0].ratingTwenty,17);assert.equal(calls[1].ratingTwenty,null);}await assert.rejects(svc.saveEntry('42',{scoreOnly:true,rating:99}),/score/);assert.equal(calls.length,2);}});
test('import scores use AniList raw 100-point scale and ordinary status changes omit score arguments',async()=>{const {AniList}=services();AniList.token='fixture';AniList.userId=1;AniList.mediaId=async()=>42;const calls=[];AniList.gql=async(q,v)=>{calls.push({q,v});return {SaveMediaListEntry:{id:1,status:v.status,progress:v.progress}}};await AniList.saveEntry('al:42',{status:'current',progress:4,rating:8.5});assert.equal(calls[0].v.scoreRaw,85);assert(calls[0].q.includes('scoreRaw:$scoreRaw'));await AniList.setStatus('al:42','planned');assert.equal(calls[1].v.scoreRaw,undefined);assert(!calls[1].q.includes('scoreRaw:'));});
test('Kitsu import preserves rating/progress and rejects an account swap before writing',async()=>{const {Kitsu}=services();Kitsu.token='fixture';Kitsu.userId='1';Kitsu.entry=async()=>null;let body;Kitsu.call=async(_p,o)=>body=o.json;await Kitsu.saveEntry('42',{status:'current',progress:4,rating:8.5});assert.equal(body.data.attributes.ratingTwenty,17);assert.equal(body.data.attributes.progress,4);let finish,wrote=false;Kitsu.entry=()=>new Promise(r=>finish=r);Kitsu.call=async()=>wrote=true;const pending=Kitsu.saveEntry('42',{status:'planned',progress:0});Kitsu.userId='2';finish(null);await assert.rejects(pending,/account changed/);assert.equal(wrote,false);});

test('progress-only import sends only progress and rechecks destination for both providers',async()=>{
 for(const provider of ['AniList','Kitsu']){
  const service=services()[provider];service.token='fixture';service.userId='1';service.mediaId=async()=>42;
  let remote={id:'7',status:'current',progress:3,rating:9,reconsuming:false},calls=[];
  service.entry=async(_id,options)=>{if(provider==='AniList')assert.equal(options.fresh,true);return remote;};
  service.gql=async(q,v)=>{calls.push({q,v});return {SaveMediaListEntry:{id:7,status:'CURRENT',progress:v.progress,score:9}};};
  service.call=async(p,o)=>{calls.push({p,o});};
  const values={progressOnly:true,progress:4,expectedStatus:'current',expectedReconsuming:false};
  await service.saveEntry('42',values);assert.equal(calls.length,1);
  if(provider==='AniList'){assert.equal(calls[0].v.progress,4);assert(!calls[0].q.includes('status:'));assert(!calls[0].q.includes('scoreRaw:'));}
  else{assert.equal(calls[0].o.method,'PATCH');assert.deepEqual(Object.keys(calls[0].o.json.data.attributes),['progress']);}
  for(const changed of [{...remote,progress:5},{...remote,status:'completed'},{...remote,reconsuming:true},null]){
   remote=changed;assert.equal((await service.saveEntry('42',values)).unchanged,true);assert.equal(calls.length,1);
  }
 }
});
