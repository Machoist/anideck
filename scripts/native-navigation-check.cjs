/* Exercise real destroyed-window cleanup in an isolated Electron profile. */
const path=require('node:path');
if(!process.versions.electron){
 const {spawn}=require('node:child_process'),binary=process.argv[2];if(!binary)throw Error('Usage: node scripts/native-navigation-check.cjs path/to/electron.exe');
 const child=spawn(path.resolve(binary),[__filename],{stdio:['ignore','pipe','pipe'],windowsHide:true});for(const stream of [child.stdout,child.stderr])stream.on('data',b=>process.stdout.write(b));const timer=setTimeout(()=>{child.kill();process.exitCode=1;},20000);child.on('close',code=>{clearTimeout(timer);process.exitCode=code||0;});child.on('error',error=>{clearTimeout(timer);console.error(error.message);process.exitCode=1;});
}else{
 const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');require('../src/logging-pipe.cjs').guardLoggingPipes(process.stdout,process.stderr);
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'anideck-navigation-')));app.on('window-all-closed',()=>{});process.once('uncaughtException',error=>{console.error(error.stack);app.exit(1);});
 app.whenReady().then(async()=>{let arrived;const server=http.createServer((req,res)=>{if(req.url==='/ready')res.end('<!doctype html><title>Ready</title>');else{arrived?.();req.on('close',()=>res.end());}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,Resolver=require('../src/streamResolver'),load=Resolver.loadProviderPage;const windows=[];
 try{for(let i=0;i<8;i++){const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(w);const requested=new Promise(r=>arrived=r),loading=load(w,base+'/pending');loading.catch(()=>{});await requested;w.destroy();await assert.rejects(loading,/window closed/);assert(w.isDestroyed());}
 const ready=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(ready);await load(ready,base+'/ready');ready.destroy();console.log('Native navigation cleanup passed: 8 closes during pending loads; fresh navigation still succeeds.');
 }catch(error){console.error(error.stack);process.exitCode=1;}finally{for(const w of windows)if(!w.isDestroyed())w.destroy();server.closeAllConnections?.();await new Promise(r=>server.close(r));app.exit(process.exitCode||0);}});
}
