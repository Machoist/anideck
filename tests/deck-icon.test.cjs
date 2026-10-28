const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/api.js'),'utf8');
test('deck icons mask hidden rear edges with independent per-icon IDs',()=>{
 const start=source.indexOf('const ICON_PATHS'),end=source.indexOf('const qs',start),render=vm.runInNewContext(source.slice(start,end)+';icon');const a=render('deck'),b=render('deck'),id=a.match(/mask id="([^"]+)"/)[1];assert(a.includes('mask="url(#'+id+')"'));assert(!b.includes('id="'+id+'"'));assert(a.includes('fill="black"'));assert(!a.includes('__ICON_ID__'));
});
