const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {createCasting}=require('../src/casting/server');
test('real panel footer unpairs the real receiver and reopening stays unpaired',async t=>{
 const backend=createCasting({port:0,host:'127.0.0.1'});const status=await backend.start();t.after(()=>backend.stop());const base=`http://127.0.0.1:${status.port}`;
 const hello=await (await fetch(base+'/hello',{method:'POST',body:'{}'})).json();backend.connect(hello.code);
 let nodes={},panel;const make=()=>({style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},focus(){},querySelector:()=>make()});
 const doc={getElementById:id=>nodes[id]||null,querySelector:()=>panel,querySelectorAll:()=>[]};
 const App={settings:{},modal(html){nodes={};for(const m of html.matchAll(/id="([^"]+)"/g))nodes[m[1]]=make();panel=make();},closeModal(){nodes={};panel=null;}};
 const native={};for(const method of ['start','status','disconnect','stop','command'])native[method]=async(...args)=>({ok:true,value:await backend[method](...args)});
 const ctx={App,Player:{ctx:null,el:null,video:null,tick(){throw Error('empty player')}},window:{native:{cast:native}},document:doc,icon:()=>'',esc:String,epLabel:()=>'',toast(){},setTimeout(){},setInterval(){return 1},clearInterval(){}};
 const cast=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/cast.js'),'utf8')+'\nCast',ctx);cast.showAddresses=()=>{};
 await cast.open();assert.equal(panel.dataset.state,'connected');await nodes['cast-disconnect'].onclick();assert.equal(backend.status().screen,null);assert.equal(panel.dataset.state,'waiting');
 await cast.open();assert.equal(panel.dataset.state,'waiting');await nodes['cast-off'].onclick();assert.equal(backend.status().running,false);assert.equal(panel,null);
});
