const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),appSource=fs.readFileSync(path.join(root,'src/app.js'),'utf8'),main=fs.readFileSync(path.join(root,'main.js'),'utf8');
test('AniDeck reuses an existing profile and browser sessions before the app starts',()=>{
 const start=main.indexOf('const legacyProfile ='),end=main.indexOf('const CONFIG_FILE',start),calls=[];
 const context={smokeTest:false,path:path.win32,app:{getPath:()=> 'C:\\Profile',setPath:(...args)=>calls.push(args)},fs:{existsSync:()=>true}};
 vm.runInNewContext(main.slice(start,end),context);assert.deepEqual(calls,[['userData','C:\\Profile\\AniShelf'],['sessionData','C:\\Profile\\AniShelf']]);
 calls.length=0;context.fs.existsSync=()=>false;vm.runInNewContext(main.slice(start,end),{...context});assert.equal(calls.length,0);
});
test('installer and app use AniDeck while upgrade identity stays stable and releases use the AniDeck repository',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.productName,'AniDeck');assert.equal(pkg.build.productName,'AniDeck');assert.equal(pkg.build.nsis.shortcutName,'AniDeck');assert.equal(pkg.build.appId,'com.machoist.anishelf');assert.equal(pkg.build.publish[0].repo,'anideck');
 const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');assert(html.includes('<title>AniDeck</title>'));assert(html.includes('src="brand/wordmark.svg"'));assert(!html.includes('<span>niDeck</span>'));assert(!html.includes('AniShelf'));
});
test('About opens only the configured HTTPS Ko-fi page and clearly handles a missing URL',async()=>{
 let support='';const start=appSource.indexOf('  async settings() {'),end=appSource.indexOf('\n  },',start);
 const context={URL,App:{settings:{},libraries:[],update:{}},window:{native:{config:async()=>({koFiUrl:support}),get:async()=>'',version:async()=> 'test'}},Tracker:{name:'AniList'},Jellyfin:{connected:()=>false},Requests:{enabled:()=>false},ACCENTS:{},KEY_ACTIONS:[],CHANGELOG:[{v:'test'}],GITHUB_URL:'https://example.com',icon:()=>'',esc:x=>String(x??''),trackerRows:()=>'',shuffleLabel:()=>'',updateText:()=>''};
 vm.runInNewContext(appSource.slice(appSource.indexOf('function spotlightDuration('),appSource.indexOf('function queueArtworkScore(')),context);
 const render=vm.runInNewContext('({'+appSource.slice(start,end)+'\n}}).settings',context);
 for(const invalid of ['', 'javascript:alert(1)','http://ko-fi.com/creator','https://ko-fi.com.evil.example/creator','https://user:password@ko-fi.com/creator']){
  support=invalid;const html=await render();const row=html.match(/<button class="about-row support-row"[^>]+>/)[0];assert(row.includes('disabled'));assert(row.includes('data-url=""'));
 }
 support='https://ko-fi.com/testcreator';const html=await render();const row=html.match(/<button class="about-row support-row"[^>]+>/)[0];assert(!row.includes('disabled'));assert(row.includes(support));assert(html.includes('Support AniDeck on Ko-fi'));
});
