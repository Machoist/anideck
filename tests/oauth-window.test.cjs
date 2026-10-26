const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
function fixture(){let handler,window;const scheduled=[],external=[];
 class Window extends EventEmitter{static getAllWindows(){return []}constructor(){super();window=this;this.loads=[];this.closed=false;this.webContents=new EventEmitter();this.webContents.setUserAgent=()=>{};this.webContents.setWindowOpenHandler=fn=>this.popup=fn;}loadURL(url){this.loads.push(url);return Promise.resolve()}isDestroyed(){return this.closed}close(){this.closed=true;this.emit('closed')}}
 const block=source.slice(source.indexOf("ipcMain.handle('oauth:open'"),source.indexOf("ipcMain.handle('shell:open'"));vm.runInNewContext(block,{ipcMain:{handle:(_name,fn)=>handler=fn},BrowserWindow:Window,CHROME_UA:'test',require:name=>require(path.join(__dirname,'..',name)),setImmediate:fn=>scheduled.push(fn),shell:{openExternal:url=>external.push(url)}});
 return {open:opts=>handler(null,opts),get window(){return window},flush:()=>{while(scheduled.length)scheduled.shift()()},external};
}
const url='https://anilist.co/api/v2/oauth/authorize?client_id=fixture&response_type=token',redirectPrefix='https://anilist.co/api/v2/oauth/pin';
test('SPA registration and popup navigation return to authorization without treating the homepage as success',async()=>{
 const f=fixture();let resolved=false;const result=f.open({url,redirectPrefix}).then(value=>{resolved=true;return value});f.window.webContents.emit('did-navigate-in-page',{},'https://anilist.co/signup');f.window.webContents.emit('did-navigate-in-page',{},'https://anilist.co/home');f.window.webContents.emit('did-navigate',{},'https://anilist.co/home');f.flush();assert.equal(f.window.loads.filter(x=>x===url).length,2);assert.equal(resolved,false);
 f.window.popup({url:'https://anilist.co/verify-email'});f.flush();assert(f.window.loads.includes('https://anilist.co/verify-email'));
 f.window.webContents.emit('will-redirect',{},redirectPrefix+'#access_token=fixture');assert.equal(await result,redirectPrefix+'#access_token=fixture');assert(f.window.closed);
});
test('closing authorization resolves cancellation and cannot restart a queued resume',async()=>{
 const f=fixture(),pending=f.open({url,redirectPrefix});f.window.webContents.emit('did-navigate',{},'https://anilist.co/signup');f.window.webContents.emit('did-navigate',{},'https://anilist.co/');f.window.close();f.flush();assert.equal(await pending,null);assert.equal(f.window.loads.length,1);
});
