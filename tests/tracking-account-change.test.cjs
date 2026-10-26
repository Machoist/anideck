const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
function fixture(){return vm.runInNewContext(source+'\n({AniList,Kitsu})',{window:{},URLSearchParams,console,Map,Set});}
for(const name of ['AniList','Kitsu']) for(const action of ['progress','remove']) for(const change of ['switch','logout']) {
 test(`${name} ${action} cancels if the account ${change === 'switch'?'switches':'logs out'} while reading progress`,async()=>{
  const service=fixture()[name];service.token='fixture';service.userId='first';let finish,writes=0;
  service.entry=()=>new Promise(resolve=>finish=resolve);service.gql=service.call=service.write=async()=>{writes++;};
  const pending=action==='progress'?service.setProgress('42',4,12):service.setStatus('42','remove');
  if(change==='switch')service.userId='second';else service.token='';
  finish({id:7,progress:2,status:'current'});
  await assert.rejects(pending,/account changed/);assert.equal(writes,0);
 });
}
test('Kitsu cannot create a Planning entry for a different account after its initial lookup',async()=>{
 const service=fixture().Kitsu;service.token='fixture';service.userId='first';let finish,writes=0;
 service.entry=()=>new Promise(resolve=>finish=resolve);service.call=async()=>{writes++;};
 const pending=service.setStatus('42','planned');service.userId='second';finish(null);
 await assert.rejects(pending,/account changed/);assert.equal(writes,0);
});
