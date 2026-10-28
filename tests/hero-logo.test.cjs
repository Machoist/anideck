const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const fn=source.slice(source.indexOf('function showLogo('),source.indexOf('// Hovering a title',source.indexOf('function showLogo(')));
async function render(ratio,{reject=false,connected=true}={}){
 const classes=new Set(['logo-pending']),node={isConnected:connected,textContent:'JUJUTSU KAISEN Season 2',classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},prepend:im=>node.image=im,insertAdjacentHTML:()=>node.season=true};
 const context={Number,Math,setTimeout:()=>1,clearTimeout(){},AniZip:{get:async()=>{if(reject)throw Error('Unavailable');return {logo:'fixture'};}},trimLogo:async()=>({ratio,url:'fixture'}),esc:s=>s,requestAnimationFrame:f=>f(),Image:class{style={setProperty(){}};classList={add(){}};set src(_){this.onload();}}};
 vm.runInNewContext(fn+';showLogo',context)(node,42,2);await new Promise(r=>setImmediate(r));return {node,classes};
}
test('portrait and invalid logos keep the readable title and do not add a detached season label',async()=>{
 for(const ratio of [.2,.8,1,NaN,Infinity]){const {node,classes}=await render(ratio);assert(!node.image);assert(!node.season);assert(!classes.has('has-logo'));assert(!classes.has('logo-pending'));assert.equal(node.textContent,'JUJUTSU KAISEN Season 2');}
});
test('landscape logos still render while failures reveal the fallback title',async()=>{
 const {node,classes}=await render(3);assert(node.image);assert(node.season);assert(classes.has('has-logo'));assert(!classes.has('logo-pending'));
 const failed=await render(3,{reject:true});assert(!failed.classes.has('logo-pending'));assert(!failed.node.image);
 const detached=await render(3,{connected:false});assert(!detached.node.image);
});
