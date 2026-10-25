const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
function fixture(){
 const listeners={},calls=[],app={act:(...args)=>calls.push(args)};
 const start=source.indexOf('    // Dialogs live outside #main');
 assert(start>=0);
 const end=source.indexOf("    $('#modal').addEventListener('mousedown'",start);
 const bind=vm.runInNewContext('(function(){'+source.slice(start,end)+'})',{$:selector=>{assert.equal(selector,'#modal');return {addEventListener:(name,fn)=>listeners[name]=fn};}});
 bind.call(app);
 const click=(button,prevented=false)=>{const event={target:{closest:selector=>{assert.equal(selector,'[data-act]');return button;}},defaultPrevented:prevented,preventDefault(){this.defaultPrevented=true;}};listeners.click(event);return event;};
 return {app,calls,click};
}
test('shared dialog routes nested icon clicks to current Friends action handlers',()=>{
 const f=fixture();
 for(const action of ['friendsFind','friendsModalClose','friendsCopyInvite','friendsUnblock','friendsPreferences']){
  const button={dataset:{act:action,handle:'test-peer',kind:'code'}};
  assert.equal(f.click(button).defaultPrevented,true);
  assert.deepEqual(f.calls.at(-1),[action,button.dataset,button]);
 }
 let routed=false;f.app.act=()=>routed=true;f.click({dataset:{act:'friendsRequests'}});assert.equal(routed,true);
});
test('shared dialog ignores disabled, handled and non-action clicks',()=>{
 const f=fixture();
 assert.equal(f.click(null).defaultPrevented,false);
 assert.equal(f.click({disabled:true,dataset:{act:'friendsUnblock'}}).defaultPrevented,false);
 f.click({dataset:{act:'friendsFind'}},true);
 assert.equal(f.calls.length,0);
});
