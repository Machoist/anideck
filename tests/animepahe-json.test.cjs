const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/streamResolver.js'),'utf8');
function fixture(response){const ctx={module:{exports:{}},require:()=>({BrowserWindow:class{},app:{isReady:()=>false},net:{fetch:async(url,options)=>{ctx.options=options;return response}}}),process,console,URL,Map,Set,AbortController,AbortSignal};vm.runInNewContext(source,ctx);return {r:new ctx.module.exports(),parse:ctx.module.exports.parseProviderJson,ctx};}
test('AnimePahe JSON requests use JSON/XHR headers and retry HTML challenges even on HTTP 200',async()=>{
 const {r,ctx}=fixture({ok:true,status:200,text:async()=>'<html><title>Just a moment</title><div class="cf-chl"></div></html>'});let tries=0;r.fetchViaHiddenBrowser=async(url,referer,json)=>{tries++;assert.equal(json,true);return '{"data":[{"title":"Example"}]}';};const result=await r.fetchJsonWithCloudflareBypass('https://animepahe.com/api?m=search','https://animepahe.com');assert.equal(result.data[0].title,'Example');assert.equal(tries,1);assert.equal(ctx.options.headers.Accept,'application/json');assert.equal(ctx.options.headers['X-Requested-With'],'XMLHttpRequest');
});
test('wrong HTML endpoints and HTTP errors fail clearly without JSON parser traces or repeat browser attempts',async()=>{
 const {r}=fixture({ok:true,status:200,text:async()=>'<html><title>Not the API</title></html>'});let tries=0;r.fetchViaHiddenBrowser=async()=>{tries++;return ''};await assert.rejects(r.fetchJsonWithCloudflareBypass('https://pahe.tv/api'),/web page instead of search data/);assert.equal(tries,0);
 const bad=fixture({ok:false,status:404,text:async()=>'<html>Not found</html>'}).r;bad.fetchViaHiddenBrowser=()=>{throw new Error('Should not open a browser for 404')};await assert.rejects(bad.fetchJsonWithCloudflareBypass('https://example.test/api'),/HTTP 404/);
});
test('JSON extraction accepts encoded browser preformatted responses and diagnoses unresolved verification',()=>{
 const {parse}=fixture();assert.equal(parse('<pre>{&quot;data&quot;:[]}</pre>').data.length,0);assert.equal(parse('\uFEFF {"ok":true}').ok,true);assert.throws(()=>parse('<html>checking your browser</html>'),/verification/);assert.throws(()=>parse('not json'),/unreadable/);
});


test('a failed verification attempt is reported once without launching a second browser',async()=>{
 const {r}=fixture({ok:true,status:200,text:async()=>'<html>cf-chl</html>'});let attempts=0;
 r.fetchViaHiddenBrowser=async()=>{attempts++;throw new Error('Verification required')};
 await assert.rejects(()=>r.fetchJsonWithCloudflareBypass('https://animepahe.pw/api'),/Verification required/);assert.equal(attempts,1);
});

test('production verification becomes visible, resumes after completion and respects closing',async()=>{
 const {r,ctx}=fixture();ctx.setTimeout=fn=>fn();let shown=0,hidden=0,calls=0;
 const win={isDestroyed:()=>false,show:()=>shown++,focus(){},hide:()=>hidden++,webContents:{executeJavaScript:async()=>++calls===1?'Just a moment…':'AnimePahe'}};
 await r.waitForProviderVerification(win);assert.equal(shown,1);assert.equal(hidden,1);
 win.isDestroyed=()=>true;await assert.rejects(r.waitForProviderVerification(win),e=>e.code==='PROVIDER_VERIFICATION_CANCELLED');
});

test('closing AnimePahe verification stops mirror retries',async()=>{
 const {r}=fixture();let calls=0;r.fetchJsonWithCloudflareBypass=async()=>{calls++;const error=Error('Closed');error.code='PROVIDER_VERIFICATION_CANCELLED';throw error;};await assert.rejects(r.resolveAnimePahe('Example',1,'sub'),e=>e.code==='PROVIDER_VERIFICATION_CANCELLED');assert.equal(calls,1);
});

test('foreground verification opens before navigation completes',async()=>{
 const {r,ctx}=fixture();ctx.setTimeout=fn=>fn();let release,shown=0,focused=0,destroyed=false;const loading=new Promise(resolve=>release=resolve);
 const win={show:()=>shown++,focus:()=>focused++,isDestroyed:()=>destroyed,destroy:()=>destroyed=true,loadURL:()=>loading,webContents:{executeJavaScript:async()=>'{"data":[]}'}};
 r.createResolverWindow=()=>win;r.waitForProviderVerification=async()=>{};const task=r.fetchViaHiddenBrowser('https://animepahe.pw/api','',true);await new Promise(resolve=>setImmediate(resolve));
 try{assert.equal(shown,1);assert.equal(focused,1);}finally{release();await task;}
 assert.equal(destroyed,true);
});

test('background preloading never opens a verification window',async()=>{
 const {r}=fixture();r.interactive=false;r.createResolverWindow=()=>{throw Error('Background window must not open')};await assert.rejects(r.fetchViaHiddenBrowser('https://animepahe.pw/api'),e=>e.code==='PROVIDER_VERIFICATION_REQUIRED');
});
