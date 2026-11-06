const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const selection=main.slice(main.indexOf('const legacyProfile ='),main.indexOf('const CONFIG_FILE'));

// Runs main.js's real profile-selection code against an in-memory fixture; nothing touches the disk.
function select({platform='win32',packaged=false,smoke=false,checkout='C:\\Work\\anideck-claude',appData='C:\\Users\\Dev\\AppData\\Roaming',realpath=value=>value}={}){
 const calls=[],created=[],probed=[],resolved=[];
 const ctx={smokeTest:smoke,__dirname:checkout,crypto,path:platform==='win32'?path.win32:path.posix,process:{platform},os:{tmpdir:()=>platform==='win32'?'C:\\Temp':'/tmp'},
  fs:{realpathSync:{native:value=>{resolved.push(value);return realpath(value);}},mkdirSync:(dir,options)=>created.push([dir,{...options}]),mkdtempSync:prefix=>prefix+'isolated',existsSync:value=>{probed.push(value);return true;}},
  app:{isPackaged:packaged,getPath:name=>{assert.equal(name,'appData');return appData;},setPath:(...args)=>calls.push(args)}};
 vm.runInNewContext(selection,ctx);
 return {calls,created,probed,resolved,profile:calls[0]?.[1]};
}

test('source runs create their own profile for settings and browser sessions without probing the legacy profile',()=>{
 const r=select();
 assert.match(r.profile,/^C:\\Users\\Dev\\AppData\\Roaming\\AniDeck Development\\[0-9a-f]{16}$/);
 assert.deepEqual(r.calls,[['userData',r.profile],['sessionData',r.profile]]);
 assert.deepEqual(r.created,[[r.profile,{recursive:true}]]);
 assert.deepEqual(r.probed,[],'source runs must not inspect or adopt AniShelf');
 assert.deepEqual(r.resolved,['C:\\Work\\anideck-claude']);
});

test('the same checkout keeps one profile and different checkouts never share one',()=>{
 const a=select().profile;
 assert.equal(select().profile,a);
 assert.notEqual(select({checkout:'C:\\Work\\anideck-grok'}).profile,a);
 assert.notEqual(select({checkout:'C:\\Work\\anideck-upload'}).profile,a);
});

test('Windows checkout paths are compared case-insensitively after resolving links',()=>{
 const a=select().profile;
 assert.match(a,/\\AniDeck Development\\[0-9a-f]{16}$/);
 assert.equal(select({checkout:'c:\\work\\ANIDECK-CLAUDE'}).profile,a,'NTFS casing differences are the same checkout');
 assert.equal(select({checkout:'C:\\Work\\anideck-claude\\'}).profile,a,'a trailing separator is the same checkout');
 assert.equal(select({checkout:'C:\\Links\\claude',realpath:()=> 'C:\\Work\\anideck-claude'}).profile,a,'a junction resolves to its target checkout');
});

test('POSIX checkout paths keep their exact case',()=>{
 const base={platform:'darwin',appData:'/Users/dev/Library/Application Support'};
 const a=select({...base,checkout:'/Users/dev/work/AniDeck'});
 assert.match(a.profile,/^\/Users\/dev\/Library\/Application Support\/AniDeck Development\/[0-9a-f]{16}$/);
 assert.equal(select({...base,checkout:'/Users/dev/work/AniDeck'}).profile,a.profile);
 assert.notEqual(select({...base,checkout:'/Users/dev/work/anideck'}).profile,a.profile);
});

test('the development folder name does not reveal the checkout path',()=>{
 const name=path.win32.basename(select({checkout:'C:\\Users\\Private Name\\secret-project'}).profile);
 assert.match(name,/^[0-9a-f]{16}$/);
});

test('smoke isolation still wins over source and legacy selection',()=>{
 for(const packaged of [true,false]){
  const r=select({smoke:true,packaged});
  assert.deepEqual(r.calls,[['userData','C:\\Temp\\anideck-smoke-isolated'],['sessionData','C:\\Temp\\anideck-smoke-isolated']]);
  assert.deepEqual([r.created,r.probed,r.resolved],[[],[],[]]);
 }
});

test('the smoke gate still needs both test-build metadata and the smoke flag',()=>{
 const line=main.slice(main.indexOf('const smokeTest ='),main.indexOf('\n',main.indexOf('const smokeTest =')));
 const gate=(testBuild,argv)=>vm.runInNewContext(line+';smokeTest',{require:()=>(testBuild?{testBuild}:{}),process:{argv}});
 assert.equal(gate('preview-fixture',['AniDeck.exe','--anideck-smoke-test']),true);
 assert.equal(gate('preview-fixture',['AniDeck.exe']),false);
 assert.equal(gate(undefined,['electron','.','--anideck-smoke-test']),false,'source runs cannot opt into the smoke profile');
});

test('packaged builds keep legacy adoption and the default profile and never use the development root',()=>{
 const legacy=select({packaged:true});
 assert.deepEqual(legacy.calls,[['userData','C:\\Users\\Dev\\AppData\\Roaming\\AniShelf'],['sessionData','C:\\Users\\Dev\\AppData\\Roaming\\AniShelf']]);
 assert.deepEqual([legacy.created,legacy.resolved],[[],[]]);
 const ctx={smokeTest:false,__dirname:'C:\\Work\\x',crypto,path:path.win32,process:{platform:'win32'},os:{},calls:[],
  fs:{realpathSync:{native:()=>{throw Error('packaged builds must not resolve the checkout');}},mkdirSync:()=>{throw Error('packaged builds must not create folders');},existsSync:()=>false},
  app:{isPackaged:true,getPath:()=> 'C:\\AppData',setPath:(...args)=>ctx.calls.push(args)}};
 vm.runInNewContext(selection,ctx);
 assert.equal(ctx.calls.length,0,'no legacy folder keeps Electron\'s default AniDeck profile');
});
