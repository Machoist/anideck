const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHmac}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
async function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const name of ['schema.sql','social-v2.sql','social-v3.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../server',name),'utf8'));
 const prepare=sql=>({bind(...args){const stmt=db.prepare(sql);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})}}});
 const env={DB:{prepare,batch:async statements=>{db.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}},SESSION_SECRET:'isolated-test-secret'};
 for(const name of ['alice','bob','carol'])db.prepare('INSERT INTO users(id,handle,name,friend_code,created_at,card) VALUES(?,?,?,?,?,?)').run(name,name,name.toUpperCase(),name+'code',1,JSON.stringify({level:4,shows:[{id:'al:1',t:'Example',pr:3,ep:12,st:'current'}]}));
 const worker=(await import('../server/src/worker.js')).default;
 const token=uid=>{const body=Buffer.from(JSON.stringify({uid,exp:Date.now()+60000})).toString('base64url');return body+'.'+createHmac('sha256',env.SESSION_SECRET).update(body).digest('base64url')};
 const call=async(uid,route,method='GET',body)=>{const response=await worker.fetch(new Request('https://test.invalid/v1'+route,{method,headers:{Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);return {...await response.json(),status:response.status}};
 const accept=()=>db.prepare("INSERT OR REPLACE INTO friends(a,b,status,created_at) VALUES('alice','bob','accepted',1)").run();
 return {db,call,accept,env,worker};
}
test('requests do not expose private summaries; accepting enables profile visits and title activity',async t=>{
 const {call}=await fixture(t);assert.equal((await call('alice','/friends','POST',{to:'bob'})).status,200);
 let r=await call('bob','/friends');assert.equal(r.incoming.length,1);assert.equal(r.incoming[0].summary,undefined);
 assert.equal((await call('bob','/friends/alice/accept','POST',{})).status,200);
 assert.equal((await call('alice','/users/bob')).user.card.level,4);
 assert.equal((await call('alice','/media/al%3A1/friends')).friends[0].progress,3);
 assert.equal((await call('carol','/media/al%3A1/friends')).friends.length,0);
});
test('messages require accepted friends, deduplicate retries, and protect read receipts',async t=>{
 const {call,accept}=await fixture(t),body={text:'Hello <script>plain text</script>',clientId:'test-message-00001'};
 assert.equal((await call('alice','/messages/bob','POST',body)).status,403);accept();
 const first=await call('alice','/messages/bob','POST',body);assert.equal(first.status,201);
 assert.equal((await call('alice','/messages/bob','POST',body)).message.id,first.message.id);
 assert.equal((await call('bob','/messages/alice')).messages.length,1);
 assert.equal((await call('bob','/conversations')).conversations[0].unread,1);
 await call('bob','/messages/alice/read','POST',{through:'not-in-this-thread'});assert.equal((await call('bob','/conversations')).conversations[0].unread,1);
 await call('bob','/messages/alice/read','POST',{through:first.message.id});assert.equal((await call('bob','/conversations')).conversations[0].unread,0);
 assert.equal((await call('carol','/messages/alice')).status,403);
 assert.equal((await call('alice','/messages/bob','POST',{text:'x'.repeat(2001),clientId:'test-message-00002'})).status,400);
});
test('message pages use isolated cursors and keep chronological order',async t=>{
 const {call,accept,db}=await fixture(t);accept();
 for(let i=0;i<55;i++)db.prepare('INSERT INTO messages(id,sender,recipient,body,created_at,client_id) VALUES(?,?,?,?,?,?)').run('m'+i,'alice','bob','message '+i,1000+i,'client-message-'+i);
 const page=await call('bob','/messages/alice');assert.equal(page.messages.length,50);assert.equal(page.messages[0].text,'message 5');assert.equal(page.nextCursor,'m5');
 const older=await call('bob','/messages/alice?before='+page.nextCursor);assert.equal(older.messages.length,5);assert.equal(older.nextCursor,null);
 db.prepare('INSERT INTO messages(id,sender,recipient,body,created_at,client_id) VALUES(?,?,?,?,?,?)').run('other','alice','carol','private',1000,'private-client');assert.equal((await call('bob','/messages/alice?before=other')).status,400);
});
test('blocking removes friendship and prevents messages/profile access; leaving clears personal records',async t=>{
 const {call,accept,db}=await fixture(t);accept();await call('alice','/messages/bob','POST',{text:'Hi',clientId:'test-message-00001'});
 assert.equal((await call('bob','/blocks','POST',{to:'alice'})).status,200);assert.equal((await call('alice','/friends')).friends.length,0);
 assert.equal((await call('alice','/messages/bob','POST',{text:'blocked',clientId:'test-message-00002'})).status,403);assert.equal((await call('alice','/users/bob')).status,404);
 assert.equal((await call('bob','/blocks')).users.length,1);await call('bob','/blocks/alice','DELETE');assert.equal((await call('bob','/blocks')).users.length,0);
 await call('alice','/me','DELETE');assert.equal(db.prepare('SELECT count(*) n FROM messages').get().n,0);assert.equal(db.prepare("SELECT count(*) n FROM users WHERE id='alice'").get().n,0);
});

test('anime cards validate structured content and survive retry without duplicate metadata',async t=>{
 const {call,accept,db}=await fixture(t);accept();
 const payload={type:'anime',anime:{id:'al:21',title:'Fixture anime',poster:'javascript:alert(1)',score:9,titles:['Fixture']}};
 const first=await call('alice','/messages/bob','POST',{clientId:'anime-card-fixture-001',payload});assert.equal(first.status,201);assert.equal(first.message.payload.anime.poster,'');assert.equal(first.message.text,'Shared anime: Fixture anime');
 const again=await call('alice','/messages/bob','POST',{clientId:'anime-card-fixture-001',payload});assert.equal(again.message.id,first.message.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM message_extras').get().n,1);
 assert.equal((await call('alice','/messages/bob','POST',{clientId:'anime-card-fixture-002',payload:{type:'anime',anime:{id:'untrusted',title:'Bad'}}})).status,400);
});
test('only the sender can edit or remove a message; removal keeps pagination and cannot resurrect on retry',async t=>{
 const {call,accept,db}=await fixture(t);accept();const body={clientId:'edit-delete-fixture-01',text:'Original'};
 const sent=await call('alice','/messages/bob','POST',body),route='/messages/bob/'+sent.message.id;
 assert.equal((await call('bob','/messages/alice/'+sent.message.id,'PATCH',{text:'Forged'})).status,403);
 const edited=await call('alice',route,'PATCH',{text:'Updated'});assert.equal(edited.message.text,'Updated');assert(edited.message.editedAt);
 const removed=await call('alice',route,'DELETE');assert.equal(removed.message.deleted,true);assert.equal(removed.message.text,'Message removed');
 assert.equal((await call('alice',route,'PATCH',{text:'Resurrect'})).status,410);
 const retry=await call('alice','/messages/bob','POST',body);assert.equal(retry.message.deleted,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM messages').get().n,1);
});
test('watch invitations enforce the responding person and negotiate alternate times',async t=>{
 const {call,accept}=await fixture(t);accept();const at=Date.now()+86400000,payload={type:'invite',anime:{id:'123',title:'Fixture watch'},at};
 const sent=await call('alice','/messages/bob','POST',{clientId:'watch-invite-fixture-1',payload});assert.equal(sent.message.invite.canRespond,false);
 const id=sent.message.id;
 assert.equal((await call('alice','/messages/bob/'+id+'/invite','POST',{action:'accepted'})).status,409);
 let received=await call('bob','/messages/alice');assert.equal(received.messages[0].invite.canRespond,true);
 let proposed=await call('bob','/messages/alice/'+id+'/invite','POST',{action:'proposed',at:at+3600000});assert.equal(proposed.message.invite.state,'proposed');assert.equal(proposed.message.invite.canRespond,false);assert.equal(proposed.reply.mine,true);const inbox=await call('alice','/conversations');assert(inbox.conversations.find(u=>u.handle==='bob').last.text.startsWith('Suggested '));
 const accepted=await call('alice','/messages/bob/'+id+'/invite','POST',{action:'accepted'});assert.equal(accepted.message.invite.state,'accepted');assert.equal(accepted.message.invite.at,at+3600000);
 assert.equal((await call('bob','/messages/alice/'+id+'/invite','POST',{action:'declined'})).status,409);
 assert.equal((await call('alice','/messages/bob','POST',{clientId:'watch-invite-fixture-2',payload:{...payload,at:1}})).status,400);
});
test('blocking revokes invitation and message controls, and leaving deletes structured social records',async t=>{
 const {call,accept,db}=await fixture(t);accept();const sent=await call('alice','/messages/bob','POST',{clientId:'blocked-card-fixture-1',payload:{type:'invite',anime:{id:'1',title:'Fixture'},at:Date.now()+86400000}});
 await call('bob','/blocks','POST',{to:'alice'});
 assert.equal((await call('alice','/messages/bob/'+sent.message.id,'DELETE')).status,403);
 assert.equal((await call('bob','/messages/alice/'+sent.message.id+'/invite','POST',{action:'accepted'})).status,403);
 await call('alice','/me','DELETE');assert.equal(db.prepare('SELECT COUNT(*) n FROM message_extras').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM watch_invites').get().n,0);
});

test('invitation responses are immutable system events, including older stored responses',async t=>{
 const {call,accept,db}=await fixture(t);accept();const sent=await call('alice','/messages/bob','POST',{clientId:'system-invitation-test',payload:{type:'invite',anime:{id:'1',title:'Example'},at:Date.now()+86400000}});
 const response=await call('bob','/messages/alice/'+sent.message.id+'/invite','POST',{action:'accepted'});assert.equal(response.reply.system,true);const route='/messages/alice/'+response.reply.id;assert.equal((await call('bob',route,'PATCH',{text:'Changed'})).status,403);assert.equal((await call('bob',route,'DELETE')).status,403);
 const received=await call('alice','/messages/bob');assert.equal(received.messages.find(m=>m.id===response.reply.id).system,true);
 db.prepare('INSERT INTO messages(id,sender,recipient,body,created_at,client_id) VALUES(?,?,?,?,?,?)').run('legacy-event','alice','bob','Declined the invitation.',Date.now(),'invitation-response-legacy-event');assert.equal((await call('alice','/messages/bob/legacy-event','DELETE')).status,403);
 const ordinary=await call('alice','/messages/bob','POST',{clientId:'ordinary-invite-text-01',text:'Accepted the watch invitation.'});assert.equal(ordinary.message.system,undefined);assert.equal((await call('alice','/messages/bob/'+ordinary.message.id,'PATCH',{text:'Still my message'})).status,200);
 assert.equal((await call('alice','/messages/bob','POST',{clientId:'invitation-response-forged',text:'Forged system event'})).status,400);
});

test('standalone AniDeck identities can recover a profile and use Friends without provider tokens',async t=>{
 const {db,env,worker,call}=await fixture(t);
 const invoke=async(route,method='GET',body,session)=>{const r=await worker.fetch(new Request('https://test.invalid/v1'+route,{method,headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);return {...await r.json(),httpStatus:r.status};};
 const key='adk_'+'1'.repeat(64),first=await invoke('/session','POST',{provider:'anideck',token:key});assert.equal(first.httpStatus,200);assert.equal(first.joined,false);
 const joined=await invoke('/me','PUT',{handle:'new_local',name:'New local'},first.session);assert.equal(joined.me.name,'New local');
 const resumed=await invoke('/session','POST',{provider:'anideck',token:key});assert.equal(resumed.me.handle,'new_local');assert.equal(resumed.me.name,'New local');
 assert.equal((await invoke('/friends','POST',{to:'bob'},resumed.session)).httpStatus,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM friends WHERE b=?').get('bob').n,1);await call('bob','/friends/new_local/accept','POST',{});
 const sent=await invoke('/messages/bob','POST',{text:'Isolated local account test',clientId:'local-account-message-001'},resumed.session);assert.equal(sent.httpStatus,201);
 const wrong=await invoke('/session','POST',{provider:'anideck',token:'adk_'+'2'.repeat(64)});assert.equal((await invoke('/me','GET',undefined,wrong.session)).me,null);
 assert.equal((await invoke('/session','POST',{provider:'anideck',token:'anideck:'+key})).httpStatus,401);
 assert(!JSON.stringify(db.prepare('SELECT * FROM users').all()).includes(key));
});
