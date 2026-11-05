const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
function fixture(){
 const calls=[],main={scrollTop:0,classList:{add(){},remove(){}},innerHTML:''},App={view:null,params:{},selected:new Set(),history:[],renderId:0,settings:{},stale(id){return id!==this.renderId;},closeEpMenu(){},markNav(){},mountPageShortcuts(){}};
 const Views={};for(const view of ['home','anime','show','mylist','settings','profile']){Views[view]=async()=>'<p>Generated '+view+'</p>';Views[view+'After']=(_p,_rid,options)=>calls.push({view,options});}
 const a=source.indexOf('  nav(view, params ='),b=source.indexOf('  // Re-draws the current page',a),context={App,Views,$:s=>s==='#main'?main:{},setTimeout:()=>1,clearTimeout(){},clearInterval(){},queueMicrotask,requestAnimationFrame(){},showTint(){},setWindowTitle(){},esc:String};App.nav=vm.runInNewContext('({'+source.slice(a,b).trim()+'}).nav',context);return {App,Views,calls,context};
}
test('ordinary navigation initializes complete pages; only title hooks receive title retention options',async()=>{const f=fixture();for(const view of ['home','anime','show','mylist','settings','profile'])await f.App.nav(view,{id:'fixture'});for(const {view,options} of f.calls)if(['anime','show'].includes(view))assert.equal(options.retainedTitle,false);else assert.equal(options,undefined,view+' must receive its full initialization path');});
test('real Home hook and dashboard integration run on navigation but retain scoped refresh semantics',async()=>{
 const f=fixture(),called={queue:0,week:0,mosaic:0,dashboard:0};Object.assign(f.context,{QueueRecovery:{schedule(){}},bindYourNext:()=>called.queue++,bindWeek:()=>called.week++,enhanceMosaic:async()=>called.mosaic++,DeckUI:{homeAfter:async()=>called.dashboard++},console});f.context.$=s=>s==='#main'?{scrollTop:0,classList:{add(){},remove(){}}}:s==='#carousel'?null:{};
 const a=source.indexOf('  async homeAfter('),b=source.indexOf('  async library(',a);f.Views.homeAfter=vm.runInNewContext('({'+source.slice(a,b).trim()+'}).homeAfter',f.context);
 const integration=fs.readFileSync(path.join(__dirname,'../src/deck-features.js'),'utf8').split(/\r?\n/).find(line=>line.includes('const homeAfter=Views.homeAfter;'));vm.runInNewContext('{'+integration+'}',f.context);
 await f.App.nav('home');await new Promise(setImmediate);assert.deepEqual(called,{queue:1,week:1,mosaic:1,dashboard:1});
 await f.Views.homeAfter({},f.App.renderId,{hero:true,carousel:false,week:false,mosaic:false});await new Promise(setImmediate);assert.deepEqual(called,{queue:2,week:1,mosaic:1,dashboard:1});
});
