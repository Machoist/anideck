const fs=require('node:fs'),path=require('node:path');
function verify(root){
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
module.exports=async context=>verify(context.packager.info.appDir);module.exports.verify=verify;
if(require.main===module){verify(path.resolve(__dirname,'..'));console.log('Release allowlist and public configuration passed');}
