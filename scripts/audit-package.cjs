const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
function audit(appOutDir){
 const resources=path.join(appOutDir,'resources'),archive=path.join(resources,'app.asar');
 const entries=asar.listPackage(archive).map(name=>name.replaceAll('\\','/'));
 for(const name of ['/config.json','/config.release.json','/store.json','/secrets.json','/tests','/server','/.git','/work'])assert(!entries.some(entry=>entry===name||entry.startsWith(name+'/')),'Private/development path packaged: '+name);
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
 const references=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match=>match[1]).filter(value=>!value.startsWith('#')&&!/^(?:https?:|data:|\/\/)/i.test(value));
 const runtime=new Set(['/main.js','/preload.js','/src/index.html','/src/providerSubtitles.js','/src/mediaRelay.js','/src/casting/server.js','/src/casting/receiver.js','/src/friends.js','/src/friends-plus.js','/src/friends.css','/src/watcher.js','/build/icon.png',...references.map(value=>'/src/'+value)]);
 for(const name of runtime){
  assert(entries.includes(name),'Missing runtime asset '+name);
  assert(asar.extractFile(archive,path.normalize(name.slice(1))).equals(fs.readFileSync(path.join(root,name.slice(1)))),'Packaged runtime is stale: '+name);
 }
 const config=JSON.parse(fs.readFileSync(path.join(resources,'config.json'),'utf8'));
 assert.deepEqual(config,JSON.parse(fs.readFileSync(path.join(__dirname,'../config.release.json'),'utf8')),'Packaged configuration differs from public defaults');
 return true;
}
module.exports=async context=>audit(context.appOutDir);module.exports.audit=audit;
if(require.main===module){audit(path.resolve(process.argv[2]||'dist/win-unpacked'));console.log('Packaged archive audit passed: public configuration only; private/development paths excluded; runtime assets included.');}
