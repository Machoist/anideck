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
 const allowed=new Set(['jellyfinUrl','requestWebhook','requestOwnerName','koFiUrl','cloudUrl','discordClientId']);
 for(const key of Object.keys(config))if(!allowed.has(key))throw Error('Unexpected release configuration field: '+key);
 if(config.jellyfinUrl||config.requestWebhook||config.requestOwnerName!=='Library owner')throw Error('Release configuration contains a personal library setting');
 if(config.koFiUrl!=='https://ko-fi.com/machorp'||config.cloudUrl!=='https://anideck-cloud.anideck-cloud.workers.dev')throw Error('Unexpected public service URL');
 if(config.discordClientId!==undefined&&config.discordClientId!==''&&!/^[0-9]{17,20}$/.test(String(config.discordClientId)))throw Error('Discord configuration must contain only a public application ID');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const expected=['main.js','preload.js','package.json','src/**/*','build/icon.png'];
 if(JSON.stringify([...pkg.build.files].sort())!==JSON.stringify(expected.sort()))throw Error('Review the release file allowlist before building');
 if(JSON.stringify(pkg.build.extraResources)!==JSON.stringify([{from:'config.release.json',to:'config.json'}]))throw Error('Only the public release configuration may be copied to resources');
 return true;
}
// Full pre-package gate: runtime/public-configuration checks, then the installer retention policy.
function verifyRelease(root){
 verify(root);
 return verifyInstallerRetention(root,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')));
}

// ---------- installer data retention ----------
// AniDeck never deletes local data from the installer or uninstaller. build/installer.nsh is
// included automatically by electron-builder and may only refuse explicit --delete-app-data requests.
const RETENTION_HELPER='anideckRefuseAppDataDeletion';
// The approved build/installer.nsh as normalized statements. Changing the guard means changing this list in review.
const RETENTION_STATEMENTS=[
 '!include LogicLib.nsh','!include FileFunc.nsh',
 '!ifdef DELETE_APP_DATA_ON_UNINSTALL','!error <message>','!endif',
 '!macro '+RETENTION_HELPER,
 'Push $R0','Push $R1',
 '${GetParameters} $R0',
 'ClearErrors',
 '${GetOptions} $R0 "--delete-app-data" $R1',
 '${IfNot} ${Errors}','SetErrorLevel 2','Quit','${EndIf}',
 '${StdUtils.TestParameter} $R1 "delete-app-data"',
 '${If} $R1 == "true"','SetErrorLevel 2','Quit','${EndIf}',
 'Pop $R1','Pop $R0',
 '!macroend',
 '!macro customInit','!insertmacro '+RETENTION_HELPER,'!macroend',
 '!macro customUnInit','!insertmacro '+RETENTION_HELPER,'!macroend',
];
function nsisStatements(text){
 const out=[];let block=false;
 for(const raw of String(text).replace(/\\\r?\n/g,' ').split(/\r?\n/)){
  let line='',quote='';
  for(let i=0;i<raw.length;i++){const ch=raw[i];
   if(block){if(ch==='*'&&raw[i+1]==='/'){block=false;i++;}continue;}
   if(quote){line+=ch;if(ch===quote)quote='';continue;}
   if(ch==='"'||ch==="'"||ch==='`'){quote=ch;line+=ch;continue;}
   if(ch==='/'&&raw[i+1]==='*'){block=true;i++;continue;}
   if(ch===';'||ch==='#')break;
   line+=ch;
  }
  const tokens=line.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g);if(tokens)out.push(tokens);
 }
 return out;
}
function verifyInstallerRetention(root,pkg){
 const fail=reason=>{throw Error('Review the installer retention policy: '+reason);};
 const build=pkg.build||{},nsis=build.nsis||{};
 if((build.directories||{}).buildResources!=='build')fail('build resources must stay in build/ so installer.nsh is included');
 if(nsis.oneClick!==true||nsis.perMachine!==false)fail('the per-user one-click installer is required');
 for(const key of ['include','script','deleteAppDataOnUninstall'])if(Object.hasOwn(nsis,key))fail('nsis.'+key+' must not be set');
 const file=path.join(root,'build','installer.nsh');
 if(!fs.existsSync(file))fail('build/installer.nsh is missing');
 const statements=nsisStatements(fs.readFileSync(file,'utf8'));
 const allowed=new Set(RETENTION_STATEMENTS.map(s=>s.split(' ')[0]));
 for(const [cmd] of statements)if(!allowed.has(cmd))fail('unexpected installer.nsh instruction '+cmd);
 // The guard is intentionally tiny and fixed: every statement is compared, in order, after
 // comments are removed and whitespace is normalized. Only the !error message text may differ.
 const actual=statements.map(t=>t[0]==='!error'&&t.length===2&&/^"[^"]+"$/.test(t[1])?'!error <message>':t.join(' '));
 for(let i=0;i<Math.max(actual.length,RETENTION_STATEMENTS.length);i++)
  if(actual[i]!==RETENTION_STATEMENTS[i])fail('installer.nsh must match the approved retention guard; statement '+(i+1)+' should be '+JSON.stringify(RETENTION_STATEMENTS[i]??'(end of file)')+' but is '+JSON.stringify(actual[i]??'(end of file)'));
 return true;
}
module.exports=async context=>verifyRelease(context.packager.info.appDir);module.exports.verify=verify;module.exports.verifyRelease=verifyRelease;module.exports.assertRuntimePath=assertRuntimePath;module.exports.verifyInstallerRetention=verifyInstallerRetention;module.exports.nsisStatements=nsisStatements;
if(require.main===module){verifyRelease(path.resolve(__dirname,'..'));console.log('Release allowlist, public configuration and installer retention policy passed');}
