/* Inert NSIS probe for build/installer.nsh retention guards.
 * Compiles the real guards behind the header the pinned builder generates: StdUtils include, the
 * generated is* flag macros from the real NsisScriptGenerator, and the same plugin and include
 * directories. The probe executables only exit with a code and write sentinel files into a new
 * fixture folder. No File/Delete/RMDir/registry/shortcut/process actions; AniDeck's real installer
 * and uninstaller are never built or run. The fixture is kept for review.
 * Usage: node scripts/check-installer-retention.cjs <app-builder-lib dir> <nsis-3.x dir> <nsis-resources dir> [fixture-parent] */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const [libArg,nsisArg,resArg,parentArg]=process.argv.slice(2);
if(!libArg||!nsisArg||!resArg)throw Error('Usage: node scripts/check-installer-retention.cjs <app-builder-lib> <nsis dir> <nsis-resources dir> [fixture-parent]');
const lib=path.resolve(libArg),nsis=path.resolve(nsisArg),resources=path.resolve(resArg),repo=path.resolve(__dirname,'..');
const guard=path.join(repo,'build','installer.nsh'),makensis=path.join(nsis,'Bin','makensis.exe');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root=fs.realpathSync.native(fs.mkdtempSync(path.join(path.resolve(parentArg||os.tmpdir()),'anideck-retention-probe-')));
if(/\s/.test(root))throw Error('Fixture path must not contain spaces (needed for the unquoted _?= argument): '+root);
const P=(...p)=>path.join(root,...p);for(const d of ['tmp','sentinels','instdir'])fs.mkdirSync(P(d));

// ---------- the builder's real generated header ----------
const {NsisScriptGenerator}=require(path.join(lib,'out','targets','nsis','nsisScriptGenerator.js'));
const target=fs.readFileSync(path.join(lib,'out','targets','nsis','NsisTarget.js'),'utf8');
const flagList=JSON.parse(target.match(/scriptGenerator\.flags\((\[[^\]]+\])\)/)[1]);
const templates=path.join(lib,'templates','nsis');
const g=new NsisScriptGenerator();
g.include(path.join(templates,'include','StdUtils.nsh'));g.addIncludeDir(path.join(templates,'include'));g.flags(flagList);
g.addPluginDir('x86-unicode',path.join(resources,'plugins','x86-unicode'));
g.addIncludeDir(path.join(repo,'build'));g.include(guard);// as NsisTarget.js:553-556 does for build/installer.nsh
const header=g.build();
const S=P('sentinels');
const installerScript=`Unicode true
${header}
Name "AniDeck retention probe"
OutFile "${P('probe-installer.exe')}"
RequestExecutionLevel user
SilentInstall silent
Function .onInit
  !insertmacro customInit
FunctionEnd
Section
  ReadEnvStr $0 PROBECASE
  FileOpen $1 "${S}\\$0.installer-section" w
  FileWrite $1 "reached"
  FileClose $1
  SetErrorLevel 7
SectionEnd
`;
// Writes the probe uninstaller (as electron-builder's BUILD_UNINSTALLER pass does) and exits.
// un.onInit sets silent before customUnInit, matching the one-click order at uninstaller.nsh:11-28.
const uninstallerScript=`Unicode true
${header}
Name "AniDeck retention probe"
OutFile "${P('probe-uninstaller-writer.exe')}"
RequestExecutionLevel user
SilentInstall silent
Function .onInit
  WriteUninstaller "${P('probe-uninstaller.exe')}"
  SetErrorLevel 0
  Quit
FunctionEnd
Section
SectionEnd
Function un.onInit
  SetSilent silent
  !insertmacro customUnInit
FunctionEnd
Section "Uninstall"
  ReadEnvStr $0 PROBECASE
  FileOpen $1 "${S}\\$0.uninstall-section" w
  FileWrite $1 "reached"
  FileClose $1
  SetErrorLevel 7
SectionEnd
`;
// The stock decisions, evaluated without the guard:
// - uninstaller.nsh:202-203 deletes app data when FileFunc GetOptions finds "--delete-app-data";
// - installUtil.nsh:202-203 forwards --delete-app-data on update when the generated ${isDeleteAppData} is true.
// Exit code = 20 + 1 (stock uninstaller would delete) + 2 (stock installer would forward).
const stockScript=`Unicode true
${header}
!include LogicLib.nsh
!include FileFunc.nsh
Name "AniDeck stock decision probe"
OutFile "${P('probe-stock-decision.exe')}"
RequestExecutionLevel user
SilentInstall silent
Function .onInit
  StrCpy $2 20
  \${GetParameters} $R0
  ClearErrors
  \${GetOptions} $R0 "--delete-app-data" $R1
  \${IfNot} \${Errors}
    IntOp $2 $2 + 1
  \${EndIf}
  \${If} \${isDeleteAppData}
    IntOp $2 $2 + 2
  \${EndIf}
  SetErrorLevel $2
  Quit
FunctionEnd
Section
SectionEnd
`;
const env={...process.env,TEMP:P('tmp'),TMP:P('tmp')};
function compile(name,script){
 fs.writeFileSync(P(name),script);
 const r=spawnSync(makensis,['-WX','-INPUTCHARSET','UTF8','-V2',P(name)],{encoding:'utf8',env});
 fs.writeFileSync(P(name+'.log'),r.stdout+r.stderr);
 console.log('compile '+name+': exit '+r.status);
 if(r.status!==0){console.error(r.stdout+r.stderr);process.exit(1);}
}
compile('probe-installer.nsi',installerScript);
compile('probe-uninstaller.nsi',uninstallerScript);
compile('probe-stock-decision.nsi',stockScript);
const writer=spawnSync(P('probe-uninstaller-writer.exe'),[],{env});
console.log('probe uninstaller written: exit '+writer.status+', exists '+fs.existsSync(P('probe-uninstaller.exe')));
if(writer.status!==0||!fs.existsSync(P('probe-uninstaller.exe')))process.exit(1);

// ---------- cases: raw command lines, passed verbatim ----------
const quotedPath='--package-file="C:\\fixture\\a --delete-app-data b.7z"';
const cases=[
 ['no-arguments','',7],
 ['flag','--delete-app-data',2],
 ['silent-flag','/S --delete-app-data',2],
 ['flag-then-silent','--delete-app-data /S',2],
 ['updated','--updated',7],
 ['stock-update','/S /KEEP_APP_DATA --updated',7],
 ['stock-update-keep-shortcuts','/S /KEEP_APP_DATA --keep-shortcuts --updated',7],
 ['stock-update-delete','/S /KEEP_APP_DATA --delete-app-data',2],
 ['updated-and-delete','--updated --delete-app-data',2],
 ['upper-case-flag','--DELETE-APP-DATA',2],
 ['flag-with-value','--delete-app-data=1',2],
 ['flag-prefix-of-longer-option','--delete-app-data-later',2],
 ['single-dash','-delete-app-data',7],// not recognized by either stock parser (see stock column)
 ['slash-form','/delete-app-data',2],
 ['quoted-flag-token','"--delete-app-data"',2],
 ['unquoted-path-containing-flag-text','C:\\dir--delete-app-data',2],
 ['quoted-path-containing-flag-text',quotedPath,7],
 ['current-user','/currentuser',7],
 ['quiet-uninstall-string','/currentuser /S',7],
 ['current-user-delete','/currentuser --delete-app-data',2],
];
function run(exe,args,id){return new Promise(resolve=>{
 const child=spawn(exe,args?[args]:[],{env:{...env,PROBECASE:id},windowsVerbatimArguments:true,stdio:'ignore'});
 const timer=setTimeout(()=>child.kill(),20000);
 child.on('close',code=>{clearTimeout(timer);resolve(code);});
});}
(async()=>{
 const rows=[],failures=[];
 for(const [id,args,expected] of cases){
  const stockCode=await run(P('probe-stock-decision.exe'),args,'s-'+id);
  const stock={uninstallerWouldDelete:!!((stockCode-20)&1),installerWouldForward:!!((stockCode-20)&2)};
  const inst=await run(P('probe-installer.exe'),args,'i-'+id);
  const un=await run(P('probe-uninstaller.exe'),(args?args+' ':'')+'_?='+P('instdir'),'u-'+id);
  const instSection=fs.existsSync(path.join(S,'i-'+id+'.installer-section')),unSection=fs.existsSync(path.join(S,'u-'+id+'.uninstall-section'));
  // Safety property: whenever a stock decision would act, both guards must refuse.
  const stockActs=stock.uninstallerWouldDelete||stock.installerWouldForward;
  const ok=stockCode>=20&&stockCode<=23&&(!stockActs||(inst===2&&un===2))&&inst===expected&&un===expected&&instSection===(expected===7)&&unSection===(expected===7);
  if(!ok)failures.push(id);
  rows.push({id,args,expected,stock,installer:inst,uninstaller:un,installerSection:instSection,uninstallerSection:unSection,ok});
 }
 // The ordinary UninstallString path, without _?=: the stub copies itself to TEMP, relaunches and exits.
 const relaunch=[];
 for(const [id,args,expectSection] of [['relaunch-no-flag','/currentuser',true],['relaunch-flag','/currentuser --delete-app-data',false]]){
  const code=await run(P('probe-uninstaller.exe'),args,'r-'+id);
  const file=path.join(S,'r-'+id+'.uninstall-section');
  for(let i=0;i<40&&!fs.existsSync(file);i++)await new Promise(r=>setTimeout(r,250));
  const reached=fs.existsSync(file),ok=reached===expectSection;
  if(!ok)failures.push(id);
  relaunch.push({id,args,stubExit:code,sectionReachedInRelaunchedCopy:reached,ok});
 }
 const report={fixture:root,makensis,makensisVersion:spawnSync(makensis,['-VERSION'],{encoding:'utf8'}).stdout.trim(),builderLib:lib,builderVersion:require(path.join(lib,'package.json')).version,flagList,guardSha256:sha(guard),rows,relaunch,failures};
 fs.writeFileSync(P('report.json'),JSON.stringify(report,null,2));
 console.log('\n'+'case'.padEnd(38)+'args'.padEnd(60)+'stock(del,fwd) expect installer uninstaller');
 for(const r of rows)console.log((r.ok?'pass ':'FAIL ')+r.id.padEnd(33)+' '+JSON.stringify(r.args).padEnd(60)+((r.stock.uninstallerWouldDelete?'Y':'n')+','+(r.stock.installerWouldForward?'Y':'n')).padEnd(15)+String(r.expected).padEnd(7)+String(r.installer).padEnd(10)+r.uninstaller);
 for(const r of relaunch)console.log((r.ok?'pass ':'FAIL ')+r.id+' '+JSON.stringify(r.args)+' stub exit '+r.stubExit+', relaunched section reached '+r.sectionReachedInRelaunchedCopy);
 console.log('\nmakensis '+report.makensisVersion+', app-builder-lib '+report.builderVersion+', flags '+flagList.join(',')+'\nguard sha256 '+report.guardSha256+'\nFixture kept at: '+root);
 if(failures.length){console.error('Installer retention probe FAILED: '+failures.join(', '));process.exitCode=1;}else console.log('Installer retention probe passed ('+rows.length+' command lines x 2 + '+relaunch.length+' relaunch checks)');
})();
