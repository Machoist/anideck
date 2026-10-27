const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*'}});
const fail=(status,error)=>reply({error},status);
export const messagePolicy=async(env,id)=>(await one(env,'SELECT policy FROM message_preferences WHERE owner=?',id))?.policy||'friends';
export const conversationAllowed=async(env,a,b)=>!!(await one(env,"SELECT a FROM friends WHERE status='accepted' AND ((a=? AND b=?) OR (a=? AND b=?))",a,b,b,a)||await one(env,"SELECT id FROM message_requests WHERE status='accepted' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",a,b,b,a));
const blocked=async(env,a,b)=>!!await one(env,'SELECT owner FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)',a,b,b,a);
export async function messageRequestRoute(req,env,uid){
 const path=new URL(req.url).pathname.replace(/\/+$/,''),method=req.method;
 if(path==='/v1/me/message-policy'){
  if(method==='GET')return reply({policy:await messagePolicy(env,uid)});
  if(method!=='PUT')return fail(405,'Method not allowed.');const body=await req.json().catch(()=>null);if(!['friends','requests','none'].includes(body?.policy))return fail(400,'Choose a message privacy option.');
  await env.DB.prepare('INSERT INTO message_preferences(owner,policy) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET policy=excluded.policy').bind(uid,body.policy).run();return reply({ok:true,policy:body.policy});
 }
 if(!path.startsWith('/v1/message-requests'))return null;
 if(path==='/v1/message-requests'&&method==='GET'){
  const rows=await all(env,`SELECT r.*,u.handle,u.name,u.avatar FROM message_requests r JOIN users u ON u.id=CASE WHEN r.sender=? THEN r.recipient ELSE r.sender END WHERE (r.sender=? OR r.recipient=?) AND r.status='pending' AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=u.id) OR (owner=u.id AND target=?)) ORDER BY r.created_at DESC LIMIT 50`,uid,uid,uid,uid,uid);
  const map=r=>({id:r.id,handle:r.handle,name:r.name,avatar:r.avatar,text:r.body,at:r.created_at});return reply({incoming:rows.filter(r=>r.recipient===uid).map(map),outgoing:rows.filter(r=>r.sender===uid).map(map)});
 }
 if(path==='/v1/message-requests'&&method==='POST'){
  const body=await req.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return fail(400,'Write an introduction.');const peer=await one(env,'SELECT id,handle FROM users WHERE handle=?',String(body.to||'').replace(/^@/,''));if(!peer||peer.id===uid||await blocked(env,uid,peer.id))return fail(403,'This profile cannot receive a request.');
  if(await conversationAllowed(env,uid,peer.id))return reply({accepted:true,handle:peer.handle});if(await messagePolicy(env,peer.id)!=='requests')return fail(403,'This profile only accepts messages from existing contacts.');
  const text=typeof body.text==='string'?body.text.trim():'';if(!text||text.length>500||body.payload)return fail(400,'Introduce yourself in 1–500 characters, without attachments.');
  const existing=await one(env,'SELECT * FROM message_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',uid,peer.id,peer.id,uid);if(existing)return existing.status==='declined'?fail(403,'This request is no longer available.'):reply({ok:true,pending:true});
  const recent=await one(env,'SELECT COUNT(*) AS n FROM message_requests WHERE sender=? AND created_at>?',uid,Date.now()-86400000),pending=await one(env,"SELECT COUNT(*) AS n FROM message_requests WHERE recipient=? AND status='pending'",peer.id);if(recent.n>=10||pending.n>=20)return fail(429,'Message requests are limited. Try again later.');
  const id=crypto.randomUUID(),at=Date.now();await env.DB.prepare("INSERT OR IGNORE INTO message_requests(id,sender,recipient,body,status,created_at,updated_at) SELECT ?,?,?,?,'pending',?,? WHERE EXISTS(SELECT 1 FROM message_preferences WHERE owner=? AND policy='requests') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)) AND (SELECT COUNT(*) FROM message_requests WHERE sender=? AND created_at>?)<10 AND (SELECT COUNT(*) FROM message_requests WHERE recipient=? AND status='pending')<20").bind(id,uid,peer.id,text,at,at,peer.id,uid,peer.id,peer.id,uid,uid,at-86400000,peer.id).run();const saved=await one(env,'SELECT id FROM message_requests WHERE id=?',id);return saved?reply({ok:true,id},201):fail(403,'This profile cannot receive a request.');
 }
 const match=path.match(/^\/v1\/message-requests\/([^/]+)$/);if(!match||method!=='POST')return fail(404,'Request not found.');
 const row=await one(env,'SELECT * FROM message_requests WHERE id=? AND recipient=?',decodeURIComponent(match[1]),uid);if(!row||await blocked(env,uid,row.sender))return fail(404,'Request not found.');const action=(await req.json().catch(()=>null))?.action;if(!['accept','decline'].includes(action))return fail(400,'Choose Accept or Decline.');if(row.status!=='pending')return reply({ok:true});
 if(action==='accept'&&await messagePolicy(env,uid)==='none')return fail(403,'Enable messages before accepting a request.');
 if(action==='decline'){await env.DB.prepare("UPDATE message_requests SET status='declined',updated_at=? WHERE id=? AND recipient=? AND status='pending'").bind(Date.now(),row.id,uid).run();return reply({ok:true});}
 await env.DB.batch([env.DB.prepare("UPDATE message_requests SET status='accepted',updated_at=? WHERE id=? AND recipient=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)) AND NOT EXISTS(SELECT 1 FROM message_preferences WHERE owner=? AND policy='none')").bind(Date.now(),row.id,uid,uid,row.sender,row.sender,uid,uid),env.DB.prepare("INSERT OR IGNORE INTO messages(id,sender,recipient,body,created_at,client_id) SELECT id,sender,recipient,body,created_at,'request-'||id FROM message_requests WHERE id=? AND recipient=? AND status='accepted'").bind(row.id,uid)]);
 const accepted=await one(env,"SELECT id FROM message_requests WHERE id=? AND status='accepted'",row.id);return accepted?reply({ok:true}):fail(403,'This request cannot be accepted.');
}
