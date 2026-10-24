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
