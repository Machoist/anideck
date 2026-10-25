const fs=require('node:fs'),path=require('node:path');
function assertRuntimePath(name){
 const parts=String(name).replaceAll('\\','/').split('/').filter(Boolean),base=parts.at(-1)||'';
 if(parts.some(part=>['.git','.wrangler','work','tests','__tests__','fixtures'].includes(part.toLowerCase()))||/^(?:store|secrets|config)\.json$|^\.env(?:\.|$)|^\.dev\.vars$|\.(?:log|db|sqlite3?)$/i.test(base))throw Error('Private/development file in application runtime: '+name);
}
function verifyRuntimeFolder(folder,prefix='src'){
 if(!fs.existsSync(folder))return;
 for(const item of fs.readdirSync(folder,{withFileTypes:true})){
  const name=prefix+'/'+item.name;assertRuntimePath(name);
  if(item.isSymbolicLink())throw Error('Review symlink before packaging: '+name);
  if(item.isDirectory())verifyRuntimeFolder(path.join(folder,item.name),name);
 }
}
function verify(root){
 verifyRuntimeFolder(path.join(root,'src'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'config.release.json'),'utf8'));
 const allowed=new Set(['jellyfinUrl','requestWebhook','requestOwnerName','koFiUrl','cloudUrl']);
 for(const key of Object.keys(config))if(!allowed.has(key))throw Error('Unexpected release configuration field: '+key);
 if(config.jellyfinUrl||config.requestWebhook||config.requestOwnerName!=='Library owner')throw Error('Release configuration contains a personal library setting');
 if(config.koFiUrl!=='https://ko-fi.com/machorp'||config.cloudUrl!=='https://anideck-cloud.anideck-cloud.workers.dev')throw Error('Unexpected public service URL');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const expected=['main.js','preload.js','package.json','src/**/*','build/icon.png'];
 if(JSON.stringify([...pkg.build.files].sort())!==JSON.stringify(expected.sort()))throw Error('Review the release file allowlist before building');
 if(JSON.stringify(pkg.build.extraResources)!==JSON.stringify([{from:'config.release.json',to:'config.json'}]))throw Error('Only the public release configuration may be copied to resources');
 return true;
}
module.exports=async context=>verify(context.packager.info.appDir);module.exports.verify=verify;module.exports.assertRuntimePath=assertRuntimePath;
if(require.main===module){verify(path.resolve(__dirname,'..'));console.log('Release allowlist and public configuration passed');}
