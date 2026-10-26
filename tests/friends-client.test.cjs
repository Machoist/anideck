const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/friends.js'),'utf8');
function fixture(){const elements={'#af-draft':{value:'Hello',isConnected:true,focus(){}},'#af-send':{},'#af-message-error':{},'#af-char-count':{}};const ctx={$:s=>elements[s],Cloud:{ident:()=> 'alice'},Tracker:{loggedIn:()=>true},App:{renderId:1,stale:id=>id!==1,nav(){},act(){}},Views:{watcherAfter:async()=>{}},crypto,clearTimeout,setTimeout,document:{}};const friends=vm.runInNewContext(source+'\nFriends',ctx);friends.handle='bob';friends.generation=1;friends.paintMessages=()=>{};return {friends,elements,ctx};}
test('failed messages keep the draft and reuse the same ID on retry',async()=>{
 const {friends,elements}=fixture(),ids=[];friends.request=async(path,opts)=>{ids.push(opts.json.clientId);if(ids.length===1)throw Error('Offline');return {message:{id:'stored',text:opts.json.text,mine:true,at:1}}};
 await friends.send(1,'alice',1);assert.equal(elements['#af-draft'].value,'Hello');assert.match(elements['#af-message-error'].textContent,/draft is kept/);
 await friends.send(1,'alice',1);assert.equal(ids[0],ids[1]);assert.equal(friends.messages.length,1);assert.equal(elements['#af-draft'].value,'');
});
test('an old response cannot replace a newly opened conversation or clear its draft',async()=>{
 const {friends,elements}=fixture();let finish;friends.request=()=>new Promise(r=>finish=r);const pending=friends.send(1,'alice',1);friends.generation=2;friends.handle='carol';elements['#af-draft'].isConnected=false;finish({message:{id:'old',text:'old',mine:true,at:1}});await pending;assert.equal(friends.messages.length,0);assert.equal(elements['#af-draft'].value,'Hello');
});
test('leaving Friends stops polling and discards conversation-specific retry state',()=>{const {friends}=fixture();friends.pendingSend={text:'draft'};friends.stop();assert.equal(friends.handle,'');assert.equal(friends.pendingSend,null);assert.equal(friends.timer,null);});

test('Friends initial reads run concurrently rather than waiting for profile and health in sequence',async()=>{
 const f=fixture(),started=[],pending={};f.ctx.Cloud.loadMe=()=>{started.push('profile');return new Promise(resolve=>pending.profile=resolve);};f.friends.capability=()=>{started.push('health');return new Promise(resolve=>pending.health=resolve);};f.ctx.Cloud.friends=()=>{started.push('friends');return new Promise(resolve=>pending.friends=resolve);};f.friends.request=()=>{started.push('inbox');return new Promise(resolve=>pending.inbox=resolve);};const task=f.friends.initialData();assert.deepEqual(started,['profile','health','friends','inbox']);pending.inbox({conversations:[]});pending.friends({friends:[]});pending.health(['messages']);pending.profile({handle:'alice'});assert.equal((await task).me.handle,'alice');
});

function openingFixture(){const f=fixture(),actions={hidden:true},content={innerHTML:'Loading friends…'};f.ctx.esc=String;f.ctx.document.querySelector=()=>actions;f.ctx.Cloud.enabled=()=>true;f.ctx.Cloud.base=()=> 'https://fixture.invalid';f.elements['#af-content']=content;f.friends.schedule=()=>{};let paints=0;f.friends.renderRoster=box=>{paints++;box.innerHTML='Painted friend list';};f.friends.paintList=()=>{};f.friends.paintRequestBadge=()=>{};f.friends.reconcileThread=()=>false;return {...f,actions,content,paints:()=>paints};}

test('reopening Friends paints a recent own-account roster before network completion without replacing the conversation',async()=>{
 const f=openingFixture();f.friends.snapshot={who:'alice',base:'https://fixture.invalid',at:Date.now(),me:{handle:'alice'},social:{friends:[]},rows:[]};let finish;f.friends.initialData=()=>new Promise(resolve=>finish=resolve);const opening=f.friends.after({},1);assert.equal(f.content.innerHTML,'Painted friend list');assert.equal(f.actions.hidden,false);f.content.innerHTML='User opened a conversation';finish({me:{handle:'alice'},features:['messages'],friends:{friends:[]},inbox:{conversations:[]}});await opening;assert.equal(f.paints(),1);assert.equal(f.content.innerHTML,'User opened a conversation');
});

test('Friends never paints another account, another server, expired, or departed profile from cache',async()=>{
 for(const patch of [{who:'bob'},{base:'https://other.invalid'},{at:Date.now()-31000},{left:true}]){const f=openingFixture();f.friends.snapshot={who:'alice',base:'https://fixture.invalid',at:Date.now(),me:{handle:'alice'},social:{friends:[]},rows:[],...patch};if(patch.left)f.ctx.Cloud.me=null;let finish;f.friends.initialData=()=>new Promise(resolve=>finish=resolve);const opening=f.friends.after({},1);assert.equal(f.paints(),0);assert.equal(f.actions.hidden,true);finish({me:null});await opening;assert.equal(f.friends.snapshot,null);}
});

test('a failed warm refresh removes cached controls and requests reconnection rather than leaving stale personal data',async()=>{
 const f=openingFixture();f.friends.snapshot={who:'alice',base:'https://fixture.invalid',at:Date.now(),me:{handle:'alice'},social:{friends:[]},rows:[]};f.friends.initialData=async()=>{throw Object.assign(Error('Expired'),{data:{code:'provider_reauth'}});};await f.friends.after({},1);assert.equal(f.actions.hidden,true);assert.equal(f.friends.meWho,null);assert.equal(f.friends.snapshot,null);assert.match(f.content.innerHTML,/Reconnect/);
});

test('title Friends activity loads its capability before using it and works with native identity',async()=>{const f=fixture();const box={innerHTML:''};f.elements['#show-social']=box;f.ctx.Cloud.base=()=> 'https://example.test';f.ctx.Cloud.enabled=()=>true;f.ctx.Cloud.loadMe=async()=>({handle:'alice'});f.ctx.App.showCtx={match:{id:'42',title:'Example'}};f.ctx.App.showAl={id:12,title:'Example'};f.ctx.esc=String;f.ctx.icon=()=>'';f.ctx.STATUS_LABELS={};f.friends.capability=async()=>['media-friends'];let route;f.friends.request=async path=>{route=path;return {friends:[]}};await f.friends.titleActivity(1);assert(route.startsWith('/v1/media/al%3A12/friends'));assert(box.innerHTML.includes('None of your AniDeck friends'));assert(!box.innerHTML.includes('not defined'));});
