/* Native acceptance for main.js profile selection: development, legacy, default and smoke.
 * Runs the real selection block from an explicit app root inside a generated Electron shell app.
 * Every appData/userData/sessionData/temp path is inside a new fixture root.
 * Nothing is deleted. The fixture is kept for review.
 * Usage: node scripts/native-development-profile.cjs <app-root> <electron.exe> [fixture-parent] */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const [appRootArg,electronArg,parentArg]=process.argv.slice(2);
if(!appRootArg||!electronArg)throw Error('Usage: node scripts/native-development-profile.cjs <app-root> <electron.exe> [fixture-parent]');
const appRoot=fs.realpathSync.native(path.resolve(appRootArg)),electron=path.resolve(electronArg);
const START='const smokeTest =',END='const CONFIG_FILE';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const mainSource=fs.readFileSync(path.join(appRoot,'main.js'),'utf8'),start=mainSource.indexOf(START),end=mainSource.indexOf(END,start);
if(start<0||end<0)throw Error('Profile-selection block markers not found in '+path.join(appRoot,'main.js'));
const block=mainSource.slice(start,end);
const git=args=>{try{return execFileSync('git',['-C',appRoot,...args],{encoding:'utf8'}).trim();}catch{return 'unavailable';}};
const source={revision:git(['rev-parse','HEAD']),mainDirty:git(['status','--porcelain','--','main.js'])||'clean',mainSha256:sha(mainSource),blockSha256:sha(block),blockLines:[mainSource.slice(0,start).split('\n').length,mainSource.slice(0,end).split('\n').length-1]};

// ---------- fixture layout ----------
const root=fs.realpathSync.native(fs.mkdtempSync(path.join(path.resolve(parentArg||os.tmpdir()),'anideck-devprofile-')));
const P=(...parts)=>path.join(root,...parts);
const PRODUCT='AniDeck Fixture';// shell productName; its default profile simulates %APPDATA%\AniDeck
const markers={};
function marker(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);markers[file]=sha(text);}
marker(P('appData-legacy','AniShelf','marker.txt'),'simulated legacy profile\n');
marker(P('appData-legacy',PRODUCT,'marker.txt'),'simulated production profile (legacy machine)\n');
marker(P('appData-nolegacy',PRODUCT,'marker.txt'),'simulated production profile\n');
fs.mkdirSync(P('tmp'));
const shellMain=`// Generated fixture shell. Runs the real profile-selection block from the app root, not a copy.
const {app,session}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),vm=require('vm');
const c=JSON.parse(process.env.ANIDECK_FIXTURE_CASE);
const inside=p=>{const a=path.resolve(p).toLowerCase(),b=path.resolve(c.root).toLowerCase();return a===b||a.startsWith(b+path.sep);};
const done=(code,r)=>{process.stdout.write('FIXTURE_RESULT '+JSON.stringify(r)+'\\n');app.exit(code);};
try{
 // Isolate every Electron profile path before any selection code runs.
 app.setPath('appData',c.appData);app.setPath('userData',c.defaultProfile);app.setPath('sessionData',c.defaultProfile);
 for(const n of ['appData','userData','sessionData'])if(!inside(app.getPath(n)))throw Error(n+' escaped the fixture');
 if(!inside(os.tmpdir()))throw Error('os.tmpdir() escaped the fixture');
 const source=fs.readFileSync(path.join(c.appRoot,'main.js'),'utf8'),start=source.indexOf(${JSON.stringify(START)}),end=source.indexOf(${JSON.stringify(END)},start);
 const block=source.slice(start,end);
 if(crypto.createHash('sha256').update(block).digest('hex')!==c.blockSha256)throw Error('Selection block changed during the run');
 // Controlled packaged seam: a view of the real app whose isPackaged is fixed. null means use the real app object.
 const appView=c.packaged===null?app:{get isPackaged(){return c.packaged;},getPath:n=>app.getPath(n),setPath:(n,p)=>app.setPath(n,p)};
 const req=id=>{if(id==='./package.json')return c.testBuild?{testBuild:c.testBuild}:{};throw Error('Unexpected require: '+id);};
 vm.compileFunction(block,['app','fs','path','os','crypto','require','process','__dirname'],{filename:path.join(c.appRoot,'main.js')})(appView,fs,path,os,crypto,req,process,__dirname);
 const selected={appData:app.getPath('appData'),userData:app.getPath('userData'),sessionData:app.getPath('sessionData')};
 for(const [n,p] of Object.entries(selected))if(!inside(p))return done(3,{error:n+' selected outside the fixture'});
 app.whenReady().then(async()=>{
  const s=session.defaultSession,prior=(await s.cookies.get({name:'fixture'})).map(x=>x.value);
  await s.cookies.set({url:'https://fixture.invalid/',name:'fixture',value:c.id,expirationDate:Math.floor(Date.now()/1000)+86400});
  await s.cookies.flushStore();
  done(0,{...selected,storagePath:s.storagePath??null,realIsPackaged:app.isPackaged,dirname:__dirname,priorCookies:prior});
 }).catch(error=>done(4,{error:String(error.stack||error)}));
}catch(error){done(2,{error:String(error.stack||error)});}
`;
function shell(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'anideck-profile-fixture',productName:PRODUCT,version:'0.0.0',main:'main.js'}));fs.writeFileSync(path.join(dir,'main.js'),shellMain);}
shell(P('checkouts','alpha'));shell(P('checkouts','beta'));
fs.mkdirSync(P('links'));fs.symlinkSync(P('checkouts','alpha'),P('links','alpha-junction'),'junction');

// ---------- snapshots ----------
function walk(dir,out={}){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isSymbolicLink()){out[f]='link';continue;}if(e.isDirectory()){out[f]='dir';walk(f,out);}else{const st=fs.statSync(f);out[f]=st.size+':'+st.mtimeMs;}}return out;}
const rel=p=>p&&p.toLowerCase().startsWith(root.toLowerCase())?'<fixture>'+p.slice(root.length):p;
const under=(p,base)=>{const a=p.toLowerCase(),b=base.toLowerCase();return a===b||a.startsWith(b+path.sep);};

function launch(c){return new Promise(resolve=>{
 const env={...process.env,TEMP:P('tmp'),TMP:P('tmp'),ANIDECK_FIXTURE_CASE:JSON.stringify({...c,root,appRoot,blockSha256:source.blockSha256,defaultProfile:path.join(c.appData,PRODUCT)})};
 delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(electron,[c.launch,...(c.flag?['--anideck-smoke-test']:[])],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';
 for(const s of [child.stdout,child.stderr])s.on('data',d=>output+=d);
 const timer=setTimeout(()=>child.kill(),30000);
 child.on('close',code=>{clearTimeout(timer);const line=output.split(/\r?\n/).find(l=>l.startsWith('FIXTURE_RESULT '));resolve({code,result:line?JSON.parse(line.slice(15)):{error:'no result',output:output.slice(-2000)}});});
});}

const cases=[
 {id:'source-alpha-1',kind:'development',appData:P('appData-legacy'),packaged:null,launch:P('checkouts','alpha')},
 {id:'source-alpha-2',kind:'development',appData:P('appData-legacy'),packaged:null,launch:P('checkouts','alpha'),same:'source-alpha-1',cookieFrom:'source-alpha-1'},
 {id:'source-alpha-upper-case',kind:'development',appData:P('appData-legacy'),packaged:null,launch:P('checkouts','ALPHA'),same:'source-alpha-1'},
 {id:'source-alpha-junction',kind:'development',appData:P('appData-legacy'),packaged:null,launch:P('links','alpha-junction'),same:'source-alpha-1'},
 {id:'source-beta',kind:'development',appData:P('appData-legacy'),packaged:null,launch:P('checkouts','beta'),differs:'source-alpha-1'},
 {id:'source-flag-without-testBuild',kind:'development',appData:P('appData-legacy'),packaged:null,flag:true,launch:P('checkouts','alpha'),same:'source-alpha-1'},
 {id:'controlled-packaged-legacy',kind:'legacy',appData:P('appData-legacy'),packaged:true,launch:P('checkouts','alpha')},
 {id:'controlled-packaged-preview-legacy',kind:'legacy',appData:P('appData-legacy'),packaged:true,testBuild:'preview-fixture',launch:P('checkouts','alpha')},
 {id:'controlled-packaged-default',kind:'default',appData:P('appData-nolegacy'),packaged:true,launch:P('checkouts','alpha')},
 {id:'controlled-packaged-smoke',kind:'smoke',appData:P('appData-legacy'),packaged:true,testBuild:'preview-fixture',flag:true,launch:P('checkouts','alpha')},
 {id:'source-smoke',kind:'smoke',appData:P('appData-legacy'),packaged:null,testBuild:'preview-fixture',flag:true,launch:P('checkouts','alpha')},
];
function classify(c,r){
 const u=r.userData||'',parent=path.dirname(u),base=path.basename(u);
 if(c.kind==='development')return parent.toLowerCase()===path.join(c.appData,'AniDeck Development').toLowerCase()&&/^[0-9a-f]{16}$/.test(base);
 if(c.kind==='legacy')return u.toLowerCase()===path.join(c.appData,'AniShelf').toLowerCase();
 if(c.kind==='default')return u.toLowerCase()===path.join(c.appData,PRODUCT).toLowerCase();
 if(c.kind==='smoke')return parent.toLowerCase()===P('tmp').toLowerCase()&&base.startsWith('anideck-smoke-');
}

(async()=>{
 const results={},failures=[],realProbe=process.env.APPDATA&&path.join(process.env.APPDATA,PRODUCT);// unique fixture name: existence check only
 if(realProbe&&fs.existsSync(realProbe))throw Error('A folder named "'+PRODUCT+'" already exists in APPDATA; refusing to run');
 for(const c of cases){
  const before=walk(root),{code,result:r}=await launch(c),after=walk(root),checks=[];
  const ok=(cond,msg)=>{checks.push((cond?'pass ':'FAIL ')+msg);if(!cond)failures.push(c.id+': '+msg);};
  ok(code===0&&!r.error,'launch exit '+code+(r.error?' ('+r.error.split('\n')[0]+')':''));
  if(!r.error){
   ok(classify(c,r),'selected '+c.kind+' profile');
   ok(r.userData===r.sessionData,'userData equals sessionData');
   ok(!r.storagePath||under(r.storagePath,r.sessionData),'session storage inside sessionData');
   if(c.packaged===null)ok(r.realIsPackaged===false,'real app.isPackaged is false');
   if(c.same)ok(results[c.same]?.userData===r.userData,'same profile as '+c.same);
   if(c.differs)ok(results[c.differs]?.userData!==r.userData,'different profile from '+c.differs);
   if(c.cookieFrom)ok(r.priorCookies.includes(c.cookieFrom),'browser session cookie from '+c.cookieFrom+' persisted');
   if(c.kind==='smoke')ok(!r.priorCookies.length,'smoke profile starts with no cookies');
   if(c.id==='source-beta')ok(!r.priorCookies.length,'other checkout does not see alpha cookies');
   const changed=Object.keys({...before,...after}).filter(f=>before[f]!==after[f]);
   const stray=changed.filter(f=>!under(f,r.userData)&&!(c.kind==='development'&&f.toLowerCase()===path.dirname(r.userData).toLowerCase()&&!before[f]));
   ok(!stray.length,'no writes outside the selected profile'+(stray.length?': '+stray.map(rel).join(', '):''));
  }
  for(const [file,hash] of Object.entries(markers))ok(fs.existsSync(file)&&sha(fs.readFileSync(file))===hash,'marker unchanged '+rel(file));
  results[c.id]={...r,code};
  console.log('\n'+c.id+' -> '+rel(r.userData||'(none)')+'\n  '+checks.join('\n  '));
 }
 const realLeak=!!realProbe&&fs.existsSync(realProbe);
 if(realLeak)failures.push('a folder named "'+PRODUCT+'" appeared in the real APPDATA');
 const versions=execFileSync(electron,['-e','console.log(JSON.stringify(process.versions))'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8'}).trim();
 const report={fixture:root,electron,versions:JSON.parse(versions),source:{appRoot,...source},realAppDataFixtureFolderExists:realLeak,results:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{...v,userData:rel(v.userData),sessionData:rel(v.sessionData),appData:rel(v.appData),storagePath:rel(v.storagePath),dirname:rel(v.dirname)}])),failures};
 fs.writeFileSync(P('report.json'),JSON.stringify(report,null,2));
 console.log('\nSource: '+JSON.stringify(source)+'\nElectron: '+report.versions.electron+' (node '+report.versions.node+', chrome '+report.versions.chrome+')\nReal APPDATA fixture folder exists: '+realLeak+'\nFixture kept at: '+root);
 if(failures.length){console.error('\nNative development-profile check FAILED:\n- '+failures.join('\n- '));process.exitCode=1;}
 else console.log('\nNative development-profile check passed ('+cases.length+' launches)');
})();
