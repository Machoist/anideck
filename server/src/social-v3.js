const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'}});
const future=value=>Number.isSafeInteger(value)&&value>Date.now()&&value<Date.now()+366*86400000;
export function cleanMessagePayload(value){
 if(value==null)return null;
 if(!value||typeof value!=='object'||!['anime','invite'].includes(value.type))throw new Error('Choose an anime card or watch invitation.');
 const anime=value.anime;if(!anime||typeof anime!=='object'||! /^(al:)?[1-9][0-9]{0,14}$/.test(String(anime.id||'')))throw new Error('Choose a valid anime.');
 const title=typeof anime.title==='string'?anime.title.trim().slice(0,200):'';if(!title)throw new Error('An anime title is required.');
 const poster=typeof anime.poster==='string'&&/^https:\/\//i.test(anime.poster)&&anime.poster.length<=2048?anime.poster:'';
 const titles=Array.isArray(anime.titles)?anime.titles.filter(t=>typeof t==='string').slice(0,4).map(t=>t.slice(0,200)):[];
 const score=Number(anime.score),payload={type:value.type,anime:{id:String(anime.id),title,poster,titles,...(Number.isFinite(score)&&score>=1&&score<=10?{score}: {})}};
 if(value.type==='invite'){if(!future(value.at))throw new Error('Choose a future time within the next year.');payload.at=value.at;}
 return payload;
}
export const messageFallback=payload=>payload?`${payload.type==='invite'?'Watch invitation':'Shared anime'}: ${payload.anime.title}`:'';
export async function hydrateMessages(env,rows,uid){
 if(!rows.length)return [];
 const extras=await all(env,`SELECT e.*,i.state,i.proposed_at,i.responded_by FROM message_extras e LEFT JOIN watch_invites i ON i.message_id=e.message_id WHERE e.message_id IN (${rows.map(()=>'?').join(',')})`,...rows.map(r=>r.id));const map=new Map(extras.map(e=>[e.message_id,e]));
 return rows.map(m=>{const extra=map.get(m.id);let payload=null;try{payload=extra?.payload?JSON.parse(extra.payload):null;}catch{}
  return {id:m.id,text:extra?.deleted_at?'Message removed':m.body,at:m.created_at,mine:m.sender===uid,...(extra?.edited_at?{editedAt:extra.edited_at}:{}),...(extra?.deleted_at?{deleted:true}:{}),...(m.client_id==='invitation-response-'+m.id?{system:true}:{}),...(!extra?.deleted_at&&payload?{payload}:{}),...(!extra?.deleted_at&&extra?.state?{invite:{state:extra.state,at:extra.proposed_at,canRespond:['pending','proposed'].includes(extra.state)&&extra.responded_by!==uid}}:{})};
 });
}
export async function controlMessage(req,env,uid,peer,id,invitation=false){
 const message=await one(env,'SELECT m.*,e.deleted_at,e.payload FROM messages m LEFT JOIN message_extras e ON e.message_id=m.id WHERE m.id=? AND ((m.sender=? AND m.recipient=?) OR (m.sender=? AND m.recipient=?))',id,uid,peer.id,peer.id,uid);
 if(!message)return json({error:'Message not found.'},404);
 if(message.deleted_at)return json({error:'This message was removed.'},410);
 if(invitation&&req.method==='POST'){
  const row=await one(env,'SELECT * FROM watch_invites WHERE message_id=?',id);if(!row)return json({error:'This message has no invitation.'},400);
  const body=((await req.json().catch(()=>({})))||{});if(!['accepted','declined','proposed'].includes(body.action))return json({error:'Choose accept, decline or propose a time.'},400);
  if(!['pending','proposed'].includes(row.state)||row.responded_by===uid)return json({error:'This invitation is waiting for the other person or has already been answered.'},409);
  if(body.action==='proposed'&&!future(body.at))return json({error:'Choose a future time within the next year.'},400);
  if(body.action==='accepted'&&row.proposed_at<=Date.now())return json({error:'This time has passed. Suggest a new time instead.'},400);
  const at=body.action==='proposed'?body.at:row.proposed_at;
  const recent=await one(env,'SELECT COUNT(*) AS n FROM messages WHERE sender=? AND created_at>?',uid,Date.now()-60000);if((recent?.n||0)>=30)return json({error:'A little fast—try again in a minute.'},429);
  let title='this anime';try{title=JSON.parse(message.payload||'{}').anime?.title||title;}catch{}
  const responseId=crypto.randomUUID(),updated=Date.now(),time=new Date(at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC';
  const text=body.action==='accepted'?`Accepted the watch invitation for ${title}.`:body.action==='declined'?`Declined the watch invitation for ${title}.`:`Suggested ${time} for ${title}.`;
  await env.DB.batch([
   env.DB.prepare("UPDATE watch_invites SET state=?,proposed_at=?,responded_by=?,updated_at=?,response_id=? WHERE message_id=? AND responded_by<>? AND state IN ('pending','proposed')").bind(body.action,at,uid,updated,responseId,id,uid),
   env.DB.prepare('INSERT OR IGNORE INTO messages(id,sender,recipient,body,created_at,client_id) SELECT ?,?,?,?,?,? FROM watch_invites WHERE message_id=? AND response_id=?').bind(responseId,uid,peer.id,text,updated,'invitation-response-'+responseId,id,responseId)
  ]);
  const reply=await one(env,'SELECT * FROM messages WHERE id=?',responseId);
  return json({message:(await hydrateMessages(env,[message],uid))[0],...(reply?{reply:(await hydrateMessages(env,[reply],uid))[0]}:{})});
 }
 if(message.client_id==='invitation-response-'+message.id)return json({error:'System events cannot be edited or removed.'},403);
 if(message.sender!==uid)return json({error:'You can only change your own messages.'},403);
 if(req.method==='PATCH'){
  const body=((await req.json().catch(()=>({})))||{}),text=typeof body.text==='string'?body.text.trim():'';if(!text||text.length>2000)return json({error:'Write a message of 1–2,000 characters.'},400);
  const at=Date.now();await env.DB.batch([env.DB.prepare('UPDATE messages SET body=? WHERE id=? AND sender=?').bind(text,id,uid),env.DB.prepare('INSERT INTO message_extras(message_id,edited_at) VALUES(?,?) ON CONFLICT(message_id) DO UPDATE SET edited_at=excluded.edited_at').bind(id,at)]);message.body=text;
  return json({message:(await hydrateMessages(env,[message],uid))[0]});
 }
 if(req.method==='DELETE'){
  await env.DB.batch([env.DB.prepare("UPDATE messages SET body='Message removed' WHERE id=? AND sender=?").bind(id,uid),env.DB.prepare('INSERT INTO message_extras(message_id,deleted_at) VALUES(?,?) ON CONFLICT(message_id) DO UPDATE SET payload=NULL,deleted_at=excluded.deleted_at').bind(id,Date.now()),env.DB.prepare('DELETE FROM watch_invites WHERE message_id=?').bind(id)]);
  return json({message:(await hydrateMessages(env,[message],uid))[0]});
 }
 return json({error:'Not found.'},404);
}
