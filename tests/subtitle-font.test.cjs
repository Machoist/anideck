const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {MAX_BYTES,validateFont,createFontStore,pickFont}=require('../src/subtitle-font-native.cjs');
const font={name:'Example.ttf',data:Buffer.concat([Buffer.from([0,1,0,0]),Buffer.alloc(20)]).toString('base64')};
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'anideck-font-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('font storage persists one bounded record, preserves prior font on invalid replacement and removes only its record',async t=>{
 const dir=await temporary(t),store=createFontStore(dir);await fs.writeFile(path.join(dir,'settings.json'),'keep');assert.equal(await store.read(),null);await store.save(font);assert.deepEqual(await createFontStore(dir).read(),font);
 await assert.rejects(store.save({...font,name:'bad.exe'}));assert.deepEqual(await store.read(),font);await store.remove();assert.equal(await store.read(),null);assert.equal(await fs.readFile(path.join(dir,'settings.json'),'utf8'),'keep');
});
test('font validation rejects size, mismatched signature, malformed base64 and unsupported files',()=>{
 for(const bad of [{...font,data:'?'},{...font,name:'x.woff'},{...font,data:Buffer.alloc(MAX_BYTES+1).toString('base64')},{...font,data:'AAAA'},null])assert.throws(()=>validateFont(bad));
 assert.equal(validateFont({...font,name:'../Example.ttf'}).name,'Example.ttf');
});
test('native picker is parented, filtered and canceling does not read or save a file',async()=>{
 const parent={id:3};let options;assert.equal(await pickFont({showOpenDialog:async(p,o)=>{assert.equal(p,parent);options=o;return {canceled:true,filePaths:[]};}},parent),null);
 assert.deepEqual(options.properties,['openFile']);assert.deepEqual(options.filters[0].extensions,['ttf','otf','woff','woff2']);assert.match(options.title,/AniDeck/);
});
test('native picker reads selected bytes with validation and rejects oversized files',async t=>{
 const dir=await temporary(t),file=path.join(dir,font.name);await fs.writeFile(file,Buffer.from(font.data,'base64'));const dialog={showOpenDialog:async()=>({filePaths:[file]})};assert.deepEqual(await pickFont(dialog,{}),font);await fs.truncate(file,MAX_BYTES+1);await assert.rejects(pickFont(dialog,{}),/4 MB/);
});
async function renderer(native){
 const source=await fs.readFile(path.join(__dirname,'../src/subtitle-font.js'),'utf8'),faces=new Set(),properties=new Map();
 class Face{constructor(name,bytes){this.name=name;this.bytes=bytes;}async load(){if(this.bytes[0]===255)throw Error('Invalid font data');return this;}}
 const context=vm.createContext({window:{native:{subtitleFont:native}},document:{fonts:{add:f=>faces.add(f),delete:f=>faces.delete(f)},documentElement:{style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}},querySelector:()=>null},atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,FontFace:Face});vm.runInContext(source+';globalThis.font=SubtitleFont',context);return {manager:context.font,faces,properties};
}
test('renderer decodes before saving, retains old font on failed save, and restores default',async()=>{
 let fail=false;const actions=[],r=await renderer(async(action,value)=>{actions.push(action);if(action==='get')return {ok:true,font};if(action==='pick')return {ok:true,font:{...font,name:'New.ttf'}};if(action==='save')return fail?{ok:false,error:'Disk full'}:{ok:true,font:value};return {ok:true};});
 await r.manager.init();assert.equal(r.faces.size,1);fail=true;await r.manager.change();assert.equal(r.manager.name,font.name);assert.equal(r.manager.error,'Disk full');fail=false;await r.manager.change();assert.equal(r.manager.name,'New.ttf');assert.equal(r.faces.size,1);await r.manager.change(true);assert.equal(r.faces.size,0);assert.equal(r.properties.size,0);assert.equal(actions.at(-1),'remove');
});
test('cancel and malformed fonts never write or replace the current face',async()=>{
 let picked=null;const actions=[],r=await renderer(async action=>{actions.push(action);return {ok:true,font:action==='get'?font:picked};});await r.manager.init();const previous=r.manager.face;await r.manager.change();assert.equal(r.manager.face,previous);assert.ok(!actions.includes('save'));picked={name:'broken.ttf',data:'/w=='};await r.manager.change();assert.match(r.manager.error,/Invalid font/);assert.equal(r.manager.face,previous);assert.ok(!actions.includes('save'));
});
test('an import during hydration waits for the saved font and serializes repeated clicks',async()=>{
 let finish;const actions=[],r=await renderer(async action=>{actions.push(action);if(action==='get')return new Promise(resolve=>finish=resolve);return {ok:true,font:null};});const loading=r.manager.init(),first=r.manager.change();await r.manager.change();assert.deepEqual(actions,['get']);finish({ok:true,font});await loading;await first;assert.equal(r.manager.name,font.name);assert.deepEqual(actions,['get','pick']);assert.equal(r.manager.busy,false);
});
test('corrupt saved fonts give a recoverable error and default removal clears it',async()=>{
 const r=await renderer(async action=>action==='get'?{ok:false,error:'Saved font unreadable'}:{ok:true});await r.manager.init();assert.equal(r.manager.error,'Saved font unreadable');await r.manager.change(true);assert.equal(r.manager.error,'');assert.equal(r.manager.name,'');
});
