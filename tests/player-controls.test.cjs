const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/player.js'),'utf8');
function fixture(){
 let n=0;const timers=new Map(),classes=new Set(),menu={hidden:true},spinner={hidden:true},focus={visible:false,matches(){return this.visible;}};
 const el={hidden:false,classList:{remove:(...names)=>names.forEach(k=>classes.delete(k)),add:k=>classes.add(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},contains:node=>node===focus,querySelector:()=>menu.hidden?null:menu,querySelectorAll:()=>[menu]};
 const document={activeElement:null,getElementById:id=>id==='p-spinner'?spinner:id==='menu'?menu:null};
 const p=vm.runInNewContext(source+';Player',{document,console,setTimeout:fn=>{timers.set(++n,fn);return n},clearTimeout:id=>timers.delete(id)});p.el=el;p.video={paused:false,ended:false,seeking:false,error:null};p.drawerOpen=()=>false;p.closeDrawer=()=>p.wake();p.placeMenu=()=>{};
 const expire=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());};return {p,el,classes,timers,menu,spinner,focus,document,expire};
}
test('paused controls stay visible and resume rearms the idle deadline',()=>{const f=fixture();f.p.video.paused=true;f.p.wake();assert(f.classes.has('paused'));assert.equal(f.timers.size,0);f.expire();assert(!f.classes.has('idle'));f.p.video.paused=false;f.p.wake();assert.equal(f.timers.size,1);f.expire();assert(f.classes.has('idle'));});
test('closing an options menu rearms auto-hide without mouse movement',()=>{const f=fixture();f.p.wake();f.expire();assert(f.classes.has('idle'));f.p.toggleMenu('menu');assert(!f.menu.hidden);assert(!f.classes.has('idle'));assert.equal(f.timers.size,0);f.p.toggleMenu('menu');assert(f.menu.hidden);assert.equal(f.timers.size,1);f.expire();assert(f.classes.has('idle'));});
test('buffering, seeking, drag, hover, ended, error and casting prevent controls from hiding',()=>{
 for(const hold of [f=>f.spinner.hidden=false,f=>f.p.video.seeking=true,f=>f.p.controlsScrubbing=true,f=>f.p.controlsHover=true,f=>f.p.video.ended=true,f=>f.p.video.error={},f=>f.p.casting={paused:false}]){const f=fixture();f.p.wake();hold(f);f.expire();assert(!f.classes.has('idle'));f.p.wake();assert.equal(f.timers.size,0);}
});
test('keyboard-visible focus pins controls but ordinary mouse focus does not',()=>{const f=fixture();f.document.activeElement=f.focus;f.focus.visible=true;f.p.wake();assert.equal(f.timers.size,0);f.focus.visible=false;f.p.wake();f.expire();assert(f.classes.has('idle'));f.p.controlsKeyboardFocus=true;f.p.wake();assert(!f.classes.has('idle'));assert.equal(f.timers.size,0);f.p.controlsKeyboardFocus=false;f.p.wake();f.expire();assert(f.classes.has('idle'));});
test('stale timers cannot hide a newer playback state or a closed player',()=>{
 const f=fixture();f.p.wake();const old=[...f.timers.values()][0];f.p.video.paused=true;f.p.wake();old();assert(!f.classes.has('idle'));f.p.video.paused=false;f.p.wake();const previous=[...f.timers.values()][0];let canceled=0;f.p.cancelControlDrag=()=>canceled++;f.p.resetControls();f.el.hidden=true;previous();assert.equal(canceled,1);assert.equal(f.timers.size,0);assert(!f.classes.has('idle'));f.el.hidden=false;f.p.controlsStopped=false;f.p.wake();old();assert(!f.classes.has('idle'));f.expire();assert(f.classes.has('idle'));
});
test('pause occurring just before the deadline is checked against current video state',()=>{const f=fixture();f.p.wake();f.p.video.paused=true;f.expire();assert(!f.classes.has('idle'));f.p.wake();assert(f.classes.has('paused'));});
