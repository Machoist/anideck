const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/release-notifications.js'),'utf8');
const release=version=>({state:'available',version,currentVersion:'1.0.0',url:'https://github.com/Machoist/anideck/releases/tag/v'+version});
function fixture(){let html='',opens=0,shown=0;const saved=new Map(),timers=[],nodes={'#shell':{hidden:false},'#modal':{hidden:true},'#player':{hidden:true},'#splash':{hidden:true},'#release-close':{},'#release-later':{},'#release-view':{}};
 const ctx={URL,Set,APP_VERSION:'1.0.0',App:{update:{state:'idle'},modal:s=>{html=s;shown++;nodes['#modal'].hidden=false;},closeModal:()=>nodes['#modal'].hidden=true,openRelease:async()=>{opens++;return true;}},document:{hidden:false,getElementById:()=>null},$:id=>nodes[id],esc:s=>String(s).replaceAll('<','&lt;'),icon:()=>'',window:{native:{get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 const api=vm.runInNewContext(source+';ReleaseNotice',ctx);return {api,ctx,nodes,saved,timers,get html(){return html;},get opens(){return opens;},get shown(){return shown;}};
}
test('new release prompt waits during playback, dialogs, setup, splash and hidden windows',async()=>{
 for(const id of ['#player','#modal','#splash','#shell','document']){const f=fixture();if(id==='document')f.ctx.document.hidden=true;else f.nodes[id].hidden=id==='#shell';f.api.receive(release('1.1.0'));f.timers[0]();await new Promise(r=>setImmediate(r));assert.equal(f.shown,0);if(id==='document')f.ctx.document.hidden=false;else f.nodes[id].hidden=id!=='#shell';await f.api.show(f.api.latest);assert.equal(f.shown,1);}
});
test('later persists the notified version, newer versions notify again and manual checks can reopen',async()=>{
 const f=fixture(),first=release('1.1.0');assert.equal(await f.api.show(first),true);assert.equal(f.saved.get('releaseNoticeVersion'),'1.1.0');f.nodes['#release-later'].onclick();assert.equal(await f.api.show(first),false);
 const restarted=fixture();restarted.saved.set('releaseNoticeVersion','1.1.0');assert.equal(await restarted.api.show(first),false);assert.equal(await restarted.api.show(first,{force:true}),true);restarted.nodes['#release-close'].onclick();assert.equal(await restarted.api.show(release('1.2.0')),true);
});
test('view release invokes the native-backed action only on a click and rejects unrelated URLs',async()=>{
 const f=fixture();await f.api.show(release('1.1.0'));assert.equal(f.opens,0);await f.nodes['#release-view'].onclick();assert.equal(f.opens,1);assert.equal(f.nodes['#modal'].hidden,true);
 for(const url of ['javascript:alert(1)','https://github.com.evil.test/Machoist/anideck/releases/tag/v1.2.0','https://github.com/other/repo/releases/tag/v1.2.0','https://github.com/Machoist/anideck/releases/tag/v1.2.0?redirect=bad'])assert.equal(await f.api.show({...release('1.2.0'),url}),false);
});
test('test builds do not schedule automatic release prompts and stale lookups do not open a dialog',async()=>{
 const f=fixture();f.api.receive({...release('1.1.0'),autoCheck:false});assert.equal(f.timers.length,0);assert.equal(await f.api.show(f.api.latest,{force:true}),true);f.nodes['#release-close'].onclick();
 const g=fixture();let finish;g.ctx.window.native.get=()=>new Promise(r=>finish=r);const pending=g.api.show(release('1.2.0'));g.api.receive({state:'error'});finish(null);assert.equal(await pending,false);assert.equal(g.shown,0);
});

test('release tags with build metadata retain their exact GitHub URL',async()=>{const f=fixture();const s=release('1.0.1+build.2');s.url='https://github.com/Machoist/anideck/releases/tag/v1.0.1%2Bbuild.2';assert.equal(await f.api.show(s),true);});

function addBar(f){const bar={hidden:true,querySelector:()=>({})};Object.assign(f.nodes,{'#release-bar':bar,'#release-bar-message':{},'#release-bar-view':{},'#release-bar-close':{}});return bar;}
test('bottom update reminder shows the version and opens the existing prompt only on request',async()=>{
 const f=fixture(),bar=addBar(f);f.api.receive(release('1.1.0'));await f.api.refreshBar();assert.equal(bar.hidden,false);assert.match(f.nodes['#release-bar-message'].textContent,/AniDeck v1.1.0 is available/);assert.equal(f.shown,0);await f.nodes['#release-bar-view'].onclick();assert.equal(f.shown,1);assert.equal(f.opens,0);
});
test('dismissing the bottom reminder persists per version and suppresses its delayed popup',async()=>{
 const f=fixture(),bar=addBar(f);f.api.receive(release('1.1.0'));await f.api.refreshBar();await f.nodes['#release-bar-close'].onclick();assert.equal(bar.hidden,true);assert.equal(f.saved.get('releaseBarDismissedVersion'),'1.1.0');assert.equal(await f.api.show(f.api.latest),false);
 const restarted=fixture(),next=addBar(restarted);restarted.saved.set('releaseBarDismissedVersion','1.1.0');restarted.api.receive(release('1.1.0'));await restarted.api.refreshBar();assert.equal(next.hidden,true);restarted.api.receive(release('1.2.0'));await restarted.api.refreshBar();assert.equal(next.hidden,false);
 restarted.api.receive({state:'latest'});await restarted.api.refreshBar();assert.equal(next.hidden,true);
});

test('closing the bottom bar cancels an automatic popup already waiting on storage',async()=>{
 const f=fixture();addBar(f);let finish;f.ctx.window.native.get=()=>new Promise(r=>finish=r);const pending=f.api.show(release('1.1.0'));await f.api.dismissBar();finish(null);assert.equal(await pending,false);assert.equal(f.shown,0);
});
