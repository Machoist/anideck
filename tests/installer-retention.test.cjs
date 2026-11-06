const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),guard=require('../scripts/release-guard.cjs');
const root=path.join(__dirname,'..'),helperSource=fs.readFileSync(path.join(root,'build','installer.nsh'),'utf8').replace(/\r\n/g,'\n');

// Generated release-guard fixture: the public package files plus build/installer.nsh, all in a fresh temp folder.
function fixture(t,{pkg,nsh=helperSource}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anideck-retention-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const data=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));if(pkg)pkg(data);
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(data));
 fs.copyFileSync(path.join(root,'config.release.json'),path.join(dir,'config.release.json'));
 if(nsh!==null){fs.mkdirSync(path.join(dir,'build'));fs.writeFileSync(path.join(dir,'build','installer.nsh'),nsh);}
 return dir;
}
const edit=(from,to)=>{const next=helperSource.replace(from,to);assert.notEqual(next,helperSource,'fixture edit target missing: '+from);return next;};
const helperQuit='    SetErrorLevel 2\n    Quit\n  ${EndIf}\n  ${StdUtils.TestParameter}';

test('the repository passes with the per-user one-click installer and unchanged runtime packaging',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(guard.verifyRelease(root),true);
 assert.equal(pkg.build.nsis.oneClick,true);assert.equal(pkg.build.nsis.perMachine,false);assert.equal(pkg.build.appId,'com.machoist.anishelf');
 assert.deepEqual(pkg.build.files,['main.js','preload.js','package.json','src/**/*','build/icon.png'],'installer.nsh is a build resource, not an app file');
 assert.deepEqual(pkg.build.extraResources,[{from:'config.release.json',to:'config.json'}]);
 for(const key of ['include','script','deleteAppDataOnUninstall'])assert(!Object.hasOwn(pkg.build.nsis,key));
});

test('a generated public package with the retention helper passes the full guard',t=>{
 assert.equal(guard.verifyRelease(fixture(t)),true);
});

test('the electron-builder beforePack hook enforces the retention policy',async t=>{
 await guard({packager:{info:{appDir:fixture(t)}}});
 await assert.rejects(guard({packager:{info:{appDir:fixture(t,{nsh:null})}}}),/installer\.nsh is missing/);
 await assert.rejects(guard({packager:{info:{appDir:fixture(t,{pkg:p=>{p.build.nsis.deleteAppDataOnUninstall=true;}})}}}),/deleteAppDataOnUninstall/);
});

test('missing helper, overrides and stock deletion settings are refused',t=>{
 assert.throws(()=>guard.verifyRelease(fixture(t,{nsh:null})),/installer\.nsh is missing/);
 for(const [key,value] of [['include','build/other.nsh'],['script','build/installer.nsi'],['deleteAppDataOnUninstall',true],['deleteAppDataOnUninstall',false]])
  assert.throws(()=>guard.verifyRelease(fixture(t,{pkg:p=>{p.build.nsis[key]=value;}})),new RegExp('nsis\\.'+key+' must not be set'));
 assert.throws(()=>guard.verifyRelease(fixture(t,{pkg:p=>{p.build.nsis.oneClick=false;}})),/one-click/);
 assert.throws(()=>guard.verifyRelease(fixture(t,{pkg:p=>{p.build.nsis.perMachine=true;}})),/one-click/);
 assert.throws(()=>guard.verifyRelease(fixture(t,{pkg:p=>{p.build.directories.buildResources='resources';}})),/build resources/);
});

test('helper changes that could remove, write or skip the refusal are rejected',t=>{
 const cases=[
  [edit('  Pop $R1\n','  RMDir /r "$APPDATA\\AniDeck"\n  Pop $R1\n'),/instruction RMDir/],
  [edit('  Pop $R1\n','  Delete "$APPDATA\\AniShelf\\store.json"\n  Pop $R1\n'),/instruction Delete/],
  [edit('  Pop $R1\n','  WriteRegStr HKCU "Software\\x" "y" "z"\n  Pop $R1\n'),/instruction WriteRegStr/],
  [edit('  Pop $R1\n','  ExecWait "cmd /c rd /s /q x"\n  Pop $R1\n'),/instruction ExecWait/],
  [edit(helperQuit,'    SetErrorLevel 2\n  ${EndIf}\n  ${StdUtils.TestParameter}'),/must match the approved retention guard/],
  [edit(helperQuit,'    SetErrorLevel 0\n    Quit\n  ${EndIf}\n  ${StdUtils.TestParameter}'),/must match the approved retention guard/],
  [edit('"--delete-app-data" $R1','"--delete-app-data-x" $R1'),/must match the approved retention guard/],
  [edit('$R1 "delete-app-data"','$R1 "updated"'),/must match the approved retention guard/],
  [edit('!macro customUnInit\n  !insertmacro anideckRefuseAppDataDeletion\n','!macro customUnInit\n'),/must match the approved retention guard/],
  [edit('!macro customInit\n  !insertmacro anideckRefuseAppDataDeletion\n','!macro customInit\n  !insertmacro anideckRefuseAppDataDeletion\n  Quit\n'),/must match the approved retention guard/],
  [helperSource+'\n!macro customUnInstall\n!macroend\n',/must match the approved retention guard/],
  [edit('!ifdef DELETE_APP_DATA_ON_UNINSTALL','!ifdef SOMETHING_ELSE'),/must match the approved retention guard/],
  [edit('!include FileFunc.nsh','!include FileFunc.nsh\n!include extra.nsh'),/must match the approved retention guard/],
  [helperSource+'\nPush $R0\n',/must match the approved retention guard/],
  [helperSource+'\n!macro customInit\n!macroend\n',/must match the approved retention guard/],
 ];
 for(const [nsh,error] of cases)assert.throws(()=>guard.verifyRelease(fixture(t,{nsh})),error);
});

test('control flow, registers, ordering, stack and compile-time guard changes are rejected',t=>{
 const testParameter='  ${StdUtils.TestParameter} $R1 "delete-app-data"\n',secondCheck=testParameter+'  ${If} $R1 == "true"\n    SetErrorLevel 2\n    Quit\n  ${EndIf}\n';
 const mutations={
  'inverted stock-option branch':edit('${IfNot} ${Errors}','${If} ${Errors}'),
  'TestParameter result in another register':edit('${StdUtils.TestParameter} $R1','${StdUtils.TestParameter} $R2'),
  'GetParameters removed':edit('  ${GetParameters} $R0\n',''),
  'GetParameters into the wrong register':edit('${GetParameters} $R0','${GetParameters} $R1'),
  'GetOptions reads the wrong register':edit('${GetOptions} $R0 "--delete-app-data" $R1','${GetOptions} $R1 "--delete-app-data" $R1'),
  'ClearErrors removed':edit('  ClearErrors\n',''),
  'ClearErrors after GetOptions':edit('  ClearErrors\n  ${GetOptions} $R0 "--delete-app-data" $R1\n','  ${GetOptions} $R0 "--delete-app-data" $R1\n  ClearErrors\n'),
  'TestParameter compared with false':edit('$R1 == "true"','$R1 == "false"'),
  'TestParameter comparison negated':edit('$R1 == "true"','$R1 != "true"'),
  'TestParameter conditional removed':edit(secondCheck,testParameter+'  SetErrorLevel 2\n  Quit\n'),
  'TestParameter read after its comparison':edit(secondCheck,'  ${If} $R1 == "true"\n    SetErrorLevel 2\n    Quit\n  ${EndIf}\n'+testParameter),
  'stock-option conditional removed':edit('  ${IfNot} ${Errors}\n    SetErrorLevel 2\n    Quit\n  ${EndIf}\n','  SetErrorLevel 2\n  Quit\n'),
  'pops restored in the wrong order':edit('  Pop $R1\n  Pop $R0\n','  Pop $R0\n  Pop $R1\n'),
  'Push removed':edit('  Push $R1\n',''),
  'compile-time refusal downgraded to a warning':edit('  !error ','  !warning '),
  'compile-time guard without !error':edit(/  !error "[^"]*"\r?\n/,''),
  'compile-time refusal for a different define':edit('!ifdef DELETE_APP_DATA_ON_UNINSTALL','!ifdef DELETE_APP_DATA_ON_UPDATE'),
  'compile-time refusal inverted':edit('!ifdef DELETE_APP_DATA_ON_UNINSTALL','!ifndef DELETE_APP_DATA_ON_UNINSTALL'),
  'compile-time guard left unbalanced':edit(/  !error "[^"]*"\r?\n!endif\r?\n/,m=>m.replace(/!endif\r?\n/,'')),
  'helper macro left unterminated':edit(/  Pop \$R0\r?\n!macroend\r?\n/,'  Pop $R0\n'),
 };
 const accepted=Object.entries(mutations).filter(([,nsh])=>{try{guard.verifyRelease(fixture(t,{nsh}));return true;}catch(error){assert.match(error.message,/installer retention policy/);return false;}}).map(([name])=>name);
 assert.deepEqual(accepted,[],'unsafe helper mutations accepted by the release guard');
});

test('comments and quoted prose do not count as instructions',t=>{
 const prose='; Never RMDir /r "$APPDATA\\AniDeck" or Delete anything here.\n# WriteRegStr is not used either.\n/* A block comment\n   that mentions Delete and RMDir */\n';
 assert.equal(guard.verifyRelease(fixture(t,{nsh:prose+helperSource.replace('  Pop $R1\n','  Pop $R1 ; RMDir is never called\n')})),true);
 const reformatted=helperSource.replace(/^ +/gm,'\t').replace(/\n/g,'\r\n\r\n').replace('"--delete-app-data" $R1','"--delete-app-data"    $R1');
 assert.equal(guard.verifyRelease(fixture(t,{nsh:reformatted})),true,'indentation, blank lines, CRLF and spacing are harmless');
 assert.deepEqual(guard.nsisStatements('!error "a ; b # c" ; trailing\nPush \\\n  $R0'),[['!error','"a ; b # c"'],['Push','$R0']]);
});

test('existing privacy and allowlist checks still apply with a valid helper',t=>{
 const dir=fixture(t),cfgFile=path.join(dir,'config.release.json'),cfg=JSON.parse(fs.readFileSync(cfgFile,'utf8'));
 fs.writeFileSync(cfgFile,JSON.stringify({...cfg,jellyfinUrl:'http://private.test'}));
 assert.throws(()=>guard.verifyRelease(dir),/personal library/);
 assert.throws(()=>guard.verifyRelease(fixture(t,{pkg:p=>{p.build.files.push('config.json');}})),/allowlist/);
 assert.throws(()=>guard.verifyRelease(fixture(t,{pkg:p=>{p.build.extraResources.push({from:'secrets.json',to:'secrets.json'});}})),/public release configuration/);
});
