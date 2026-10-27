const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.join(__dirname,'..'),pkg=require('../package.json'),audit=require('../scripts/audit-package.cjs');
test('Mac package has separate Intel and Apple Silicon targets and manual test builds',()=>{
 assert.equal(pkg.build.mac.minimumSystemVersion,'11.0');assert.deepEqual(pkg.build.mac.target[0].arch,['x64','arm64']);assert.match(pkg.build.mac.artifactName,/\$\{arch\}/);assert.match(pkg.scripts['dist:mac:test'],/sign-mac-test/);assert.match(pkg.scripts['dist:mac:test'],/testBuild/);assert.match(pkg.scripts['dist:mac:test'],/publish never/);
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/mac-test.yml'),'utf8');for(const text of ['macos-15-intel','arch: arm64','arch: x64','npm test','codesign --verify','mac-smoke.cjs','if-no-files-found: error'])assert(workflow.includes(text));assert(!workflow.includes('publish always'));
});
test('Mac menu supplies standard application, edit, zoom and window roles without devtools',()=>{
 const source=fs.readFileSync(path.join(root,'main.js'),'utf8'),start=source.indexOf('function applicationMenuTemplate('),end=source.indexOf('app.whenReady()',start);
 const menu=vm.runInNewContext(source.slice(start,end)+'\napplicationMenuTemplate');assert.equal(menu('win32'),null);assert.equal(menu('linux'),null);const roles=JSON.stringify(menu('darwin'));for(const role of ['appMenu','editMenu','windowMenu','togglefullscreen'])assert(roles.includes(role));assert(!roles.includes('toggleDevTools'));
});
test('package audit verifies actual Windows and Mac bundle layouts and rejects stale Mac assets',async t=>{
 const asar=require('@electron/asar'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'anideck-layout-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const runtime=path.join(temp,'runtime');fs.mkdirSync(path.join(runtime,'build'),{recursive:true});
 for(const file of ['main.js','preload.js','package.json'])fs.copyFileSync(path.join(root,file),path.join(runtime,file));fs.copyFileSync(path.join(root,'build/icon.png'),path.join(runtime,'build/icon.png'));fs.cpSync(path.join(root,'src'),path.join(runtime,'src'),{recursive:true});
 for(const layout of ['win','mac']){const out=path.join(temp,layout),resources=layout==='mac'?path.join(out,'AniDeck.app','Contents','Resources'):path.join(out,'resources');fs.mkdirSync(resources,{recursive:true});await asar.createPackage(runtime,path.join(resources,'app.asar'));fs.copyFileSync(path.join(root,'config.release.json'),path.join(resources,'config.json'));assert.equal(audit.audit(out),true);if(layout==='mac')assert.equal(audit.audit(path.join(out,'AniDeck.app')),true);}
 const metadata=JSON.parse(fs.readFileSync(path.join(runtime,'package.json'),'utf8'));metadata.testBuild=['mac-preview','mac-x64-fixture'];fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify(metadata));await asar.createPackage(runtime,path.join(temp,'mac','AniDeck.app','Contents','Resources','app.asar'));asar.uncacheAll();assert.throws(()=>audit.audit(path.join(temp,'mac')),/testBuild must be a non-empty string/);fs.copyFileSync(path.join(root,'package.json'),path.join(runtime,'package.json'));
 fs.writeFileSync(path.join(runtime,'main.js'),'// stale');const mac=path.join(temp,'mac','AniDeck.app','Contents','Resources');await asar.createPackage(runtime,path.join(mac,'app.asar'));asar.uncacheAll();assert.throws(()=>audit.audit(path.join(temp,'mac')),/stale/);
});
test('ad-hoc signing refuses release builds and preserves Electron per-file entitlements',async()=>{
 let metadata={},received;const ctx={module:{exports:{}},require:name=>name==='node:path'?path:name==='node:module'?{createRequire:()=>()=>({signAsync:async options=>received=options})}:{extractFile:()=>Buffer.from(JSON.stringify(metadata))}};ctx.require.resolve=()=>path.join(root,'node_modules/app-builder-lib/package.json');
 vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/sign-mac-test.cjs'),'utf8'),ctx);const sign=ctx.module.exports,options={app:'/test/AniDeck.app',optionsForFile:()=>({entitlements:'electron.plist',hardenedRuntime:true})};await assert.rejects(sign(options),/test build/);metadata={testBuild:'mac-preview'};await sign(options);assert.equal(received.identity,'-');assert.equal(received.identityValidation,false);assert.equal(received.preAutoEntitlements,false);assert.equal(received.optionsForFile('helper').entitlements,'electron.plist');assert.equal(received.optionsForFile('helper').hardenedRuntime,false);
});

test('smoke startup isolates its profile instead of reading existing sign-ins',()=>{
 const source=fs.readFileSync(path.join(root,'main.js'),'utf8'),start=source.indexOf('const legacyProfile ='),end=source.indexOf('const CONFIG_FILE',start),calls=[];
 const ctx={smokeTest:true,path:path.posix,os:{tmpdir:()=>'/tmp'},fs:{mkdtempSync:prefix=>prefix+'isolated',existsSync:()=>{throw Error('Must not inspect legacy profile');}},app:{getPath:()=>'/user-data',setPath:(...args)=>calls.push(args)}};
 vm.runInNewContext(source.slice(start,end),ctx);assert.deepEqual(calls,[['userData','/tmp/anideck-smoke-isolated'],['sessionData','/tmp/anideck-smoke-isolated']]);
});
