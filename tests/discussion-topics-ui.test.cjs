const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/discussions.js'),'utf8');
function fixture(){const nodes={},node=id=>nodes[id]||(nodes[id]={hidden:false,value:'',checked:false,textContent:'',innerHTML:'',focus(){},querySelectorAll:()=>[]});
 const ctx={App:{stale:()=>false},Cloud:{ident:()=> 'owner',withSession:f=>f(),call:async()=>({comments:[],nextCursor:null})},document:{getElementById:node},URLSearchParams,Map,Set,Date,crypto:{randomUUID:()=> 'unique-request-id'},icon:()=>'',esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
 const api=vm.runInNewContext(source+';Discussions',ctx);Object.assign(api,{rid:1,who:'owner',media:'al:1',me:{handle:'owner'}});return {api,ctx,nodes,node};}
const root=(id,title)=>({id,text:'# '+title+'\n\nBody of '+title,parent:null,handle:'person',name:'Person',at:1});
test('topic lists contain named roots and each open topic renders only its own descendants',()=>{
 const f=fixture(),a=root('a','Topic A'),b=root('b','Topic B');f.api.comments=[a,b,{...root('a1','First reply'),parent:'a'},{...root('b1','Other reply'),parent:'b'}];f.api.paintTopics();assert(f.node('discussion-feed').innerHTML.includes('data-topic="a"'));assert(!f.node('discussion-feed').innerHTML.includes('data-topic="a1"'));
 f.api.mode='thread';f.api.thread=a;f.api.paint();const html=f.node('discussion-feed').innerHTML;assert(html.includes('Body of Topic A'));assert(html.includes('First reply'));assert(!html.includes('Other reply'));assert(!html.includes('Body of Topic B'));
});
test('thread drafts remain isolated and new-topic payloads have a title with no reply parent',async()=>{
 const f=fixture();f.api.mode='thread';f.api.thread=root('a','Topic A');f.node('discussion-draft').value='Draft A';f.api.keepDraft();f.api.thread=root('b','Topic B');f.api.restoreDraft();assert.equal(f.node('discussion-draft').value,'');f.api.thread=root('a','Topic A');f.api.restoreDraft();assert.equal(f.node('discussion-draft').value,'Draft A');
 f.api.mode='new';f.api.thread=null;f.node('discussion-topic').value='My new topic';f.node('discussion-draft').value='Opening thoughts';let sent;f.ctx.Cloud.call=async(_path,opts)=>{sent=opts.json;return {id:'created'};};f.api.load=async()=>{};await f.api.send();assert.equal(sent.parent,null);assert.equal(sent.text,'# My new topic\n\nOpening thoughts');assert.equal(f.api.thread.id,'created');assert.equal(f.api.mode,'thread');
});
test('late responses from another thread cannot replace the active conversation',async()=>{
 const f=fixture(),pending=[];f.ctx.Cloud.call=()=>new Promise(r=>pending.push(r));f.api.mode='thread';f.api.thread=root('a','Topic A');const first=f.api.load(false);const second=f.api.openTopic(root('b','Topic B'));pending[1]({comments:[root('b','Topic B')],thread:root('b','Topic B')});await second;pending[0]({comments:[root('a','Topic A')],thread:root('a','Topic A')});await first;assert.equal(f.api.thread.id,'b');assert.equal(f.api.comments[0].id,'b');assert(!f.node('discussion-feed').innerHTML.includes('Body of Topic A'));
});

test('server-filtered thread pages retain nested replies whose parent is on an earlier page',()=>{
 const f=fixture();f.api.mode='thread';f.api.threadSupport=true;f.api.thread=root('a','Topic A');f.api.comments=[{...root('nested','Nested reply'),parent:'earlier-parent'}];f.api.paint();assert(f.node('discussion-feed').innerHTML.includes('Nested reply'));assert(f.node('discussion-feed').innerHTML.includes('an earlier comment'));
});
