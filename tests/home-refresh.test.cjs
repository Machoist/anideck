const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/home-refresh.js'),'utf8');
function fixture(){
 const live=new Map(),next=new Map(),batch={rid:1,scope:'owner',dirty:false},calls={after:0,schedule:0,arrows:0};
 const root={scrollTop:100,getBoundingClientRect:()=>({top:0,bottom:500})},document={activeElement:{},getElementById:()=>root};
 const App={view:'home',params:{},renderId:1,stale:id=>App.renderId!==id},HomeReads={active:batch,scope:()=> 'owner',schedule:()=>calls.schedule++};
 const Views={home:async()=>'',homeAfter:(_p,_rid,options)=>{calls.after++;calls.options=options;}};const helper=vm.runInNewContext(source+';HomeRefresh',{document,App,HomeReads,Views,clearInterval(){},queueMicrotask,requestAnimationFrame:fn=>fn(),updateRailArrows:()=>calls.arrows++,bindWeek(){},enhanceMosaic(){},console});
 helper.parts=()=>live;helper.snapshot=()=>next;
 const node=(id,html)=>{const listeners={},el={dataset:{homeSlot:id},outerHTML:html,top:20,bottom:200,querySelector:()=>null,contains:who=>who===el.focused,getBoundingClientRect:()=>({top:el.top,bottom:el.bottom}),replaceWith:newEl=>live.set('slot:'+id,newEl),addEventListener:(name,fn)=>listeners[name]=fn,listeners};return el;};
 const add=(id,oldHtml,newHtml=oldHtml)=>{const old=node(id,oldHtml),fresh=node(id,newHtml);live.set('slot:'+id,old);next.set('slot:'+id,fresh);return old;};
 return {helper,live,next,batch,calls,App,Views,HomeReads,document,root,node,add};
}
test('late shelf data keeps unrelated mounted nodes, live state and background callbacks',async()=>{
 const f=fixture(),hero=f.add('hero','same'),shelf=f.add('trending','old','new');hero.selection=2;f.helper.record(f.batch,'');f.batch.homeMarkup.set('slot:trending','old');await f.helper.refresh(f.batch);assert.equal(f.live.get('slot:hero'),hero);assert.equal(hero.selection,2);assert.notEqual(f.live.get('slot:trending'),shelf);assert.equal(f.calls.after,0);assert.equal(f.calls.arrows,1);assert.equal(f.App.renderQuiet,false);
});
test('focused changed sections wait for focusout; dashboard widgets retain their own state',async()=>{
 const f=fixture(),focused=f.add('trending','old','new'),dashboard=f.add('deck','old','new');f.document.activeElement=focused.focused={};dashboard.querySelector=()=>({});f.batch.homeMarkup=new Map([['slot:trending','old'],['slot:deck','old']]);await f.helper.refresh(f.batch);assert.equal(f.live.get('slot:trending'),focused);assert.equal(f.live.get('slot:deck'),dashboard);focused.listeners.focusout();await new Promise(setImmediate);assert.equal(f.calls.schedule,1);f.document.activeElement={};await f.helper.refresh(f.batch);assert.notEqual(f.live.get('slot:trending'),focused);
});
test('navigation or owner changes discard a completed background render',async()=>{
 for(const change of [f=>f.App.view='anime',f=>f.App.renderId++,f=>f.HomeReads.scope=()=> 'other']){const f=fixture(),old=f.add('hero','old','new');f.batch.homeMarkup=new Map([['slot:hero','old']]);let release;f.Views.home=()=>new Promise(resolve=>release=resolve);const pending=f.helper.refresh(f.batch);change(f);release('');await pending;assert.equal(f.live.get('slot:hero'),old);assert.equal(f.calls.after,0);assert.equal(f.batch.updating,false);}
});
test('a changed hero is rebound and failed background work leaves the mounted page intact',async()=>{
 const f=fixture();f.add('hero','old','new');f.batch.homeMarkup=new Map([['slot:hero','old']]);await f.helper.refresh(f.batch);assert.equal(f.calls.after,1);const kept=f.live.get('slot:hero');f.Views.home=async()=>{throw Error('fixture failure')};await f.helper.refresh(f.batch);assert.equal(f.live.get('slot:hero'),kept);assert.equal(f.App.renderQuiet,false);
});
test('cached queue artwork changes do not reset the selected show',()=>{
 const f=fixture(),a=f.node('hero','old'),b=f.node('hero','new');a.querySelector=()=>({dataset:{queue:JSON.stringify([{kind:'remote',id:'al:1',num:3,thumb:'poster'}])}});b.querySelector=()=>({dataset:{queue:JSON.stringify([{kind:'remote',id:'al:1',num:3,thumb:'wide',resolvedBackdrop:'wide'}])}});assert.equal(f.helper.signature(a),f.helper.signature(b));b.querySelector=()=>({dataset:{queue:JSON.stringify([{kind:'remote',id:'al:1',num:4}])}});assert.notEqual(f.helper.signature(a),f.helper.signature(b));
});
test('a late featured carousel does not rebind the unchanged queue hero',async()=>{
 const f=fixture(),hero=f.add('hero','same'),featured=f.add('featured','empty','carousel');f.next.get('slot:featured').querySelector=selector=>selector==='#carousel'?{}:null;f.batch.homeMarkup=new Map([['slot:hero','same'],['slot:featured','empty']]);await f.helper.refresh(f.batch);assert.equal(f.live.get('slot:hero'),hero);assert.notEqual(f.live.get('slot:featured'),featured);assert.equal(f.calls.options.hero,false);assert.equal(f.calls.options.carousel,true);
});
test('hydrated Spotlight artwork/logos do not replace an unchanged set of candidates',()=>{
 const f=fixture(),a=f.node('featured','cold markup'),b=f.node('featured','warm logo and artwork markup');let id='1';a.querySelector=()=>({querySelectorAll:()=>[{dataset:{kid:'1',lib:''}}]});b.querySelector=()=>({querySelectorAll:()=>[{dataset:{kid:id,lib:''}}]});assert.equal(f.helper.signature(a),f.helper.signature(b));id='2';assert.notEqual(f.helper.signature(a),f.helper.signature(b));
});
test('a newly filled slot above the viewport preserves the current visual anchor',async()=>{
 const f=fixture(),late=f.add('late','empty','filled'),stable=f.add('stable','same');late.top=-100;late.bottom=-10;let base=120;stable.getBoundingClientRect=()=>({top:base-f.root.scrollTop,bottom:base+200-f.root.scrollTop});late.replaceWith=el=>{f.live.set('slot:late',el);base+=100;};f.batch.homeMarkup=new Map([['slot:late','empty'],['slot:stable','same']]);await f.helper.refresh(f.batch);assert.equal(f.root.scrollTop,200);assert.equal(stable.getBoundingClientRect().top,20);
});
