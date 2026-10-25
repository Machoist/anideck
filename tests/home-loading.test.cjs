const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function api(){return vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8')+'\nAniList',{window:{},URLSearchParams,console,Map,Set});}
test('airing batch is one public query with deduplicated numeric IDs and normalized timestamps',async()=>{
 const al=api(),calls=[];al.gql=async(...args)=>{calls.push(args);return {Page:{media:[{id:1,status:'RELEASING',episodes:12,format:'TV',nextAiringEpisode:{episode:4,airingAt:2000000000}}]}};};
 const result=await al.airingBatch(['al:1','al:1','al:2','bad','al:0','al:9999999999999999999']);assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0][1].ids),[1,2]);assert.equal(calls[0][2],false);assert.match(calls[0][0],/id_in:\$ids/);assert.equal(result['al:1'].next.at,2000000000000);assert.equal(result['al:1'].status,'releasing');
});
test('empty airing batches make no network call and large inputs stay within a single page',async()=>{const al=api();let calls=0;al.gql=async(_,vars)=>{calls++;assert.equal(vars.ids.length,50);return {Page:{media:[]}};};await al.airingBatch(['not-an-anilist-id']);assert.equal(calls,0);await al.airingBatch(Array.from({length:75},(_,i)=>'al:'+(i+1)));assert.equal(calls,1);});
