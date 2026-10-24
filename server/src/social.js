import {cleanMessagePayload,messageFallback,hydrateMessages,controlMessage} from './social-v3.js';
const headers={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const error=(status,message)=>response({error:message},status);
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const person=u=>({handle:u.handle,name:u.name||u.handle,avatar:u.avatar||''});
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const isBlocked=async(env,a,b)=>!!await one(env,'SELECT owner FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)',a,b,b,a);
const friend=async(env,a,b)=>!!await one(env,"SELECT a FROM friends WHERE status='accepted' AND ((a=? AND b=?) OR (a=? AND b=?))",a,b,b,a);
export async function socialRoute(req,env,uid,me){
 const url=new URL(req.url),path=url.pathname.replace(/\/+$/,''),method=req.method;
 if(!/^\/v1\/(blocks|conversations|messages|media)(\/|$)/.test(path))return null;
 if(!me?.handle)return error(403,'Join AniDeck profiles first.');
 if(path==='/v1/blocks'&&method==='GET')return response({users:(await all(env,'SELECT u.handle,u.name,u.avatar FROM blocks b JOIN users u ON b.target=u.id WHERE b.owner=? ORDER BY b.created_at DESC',uid)).map(person)});
 if(path==='/v1/blocks'&&method==='POST'){
  const body=((await req.json().catch(()=>({})))||{});const target=await one(env,'SELECT * FROM users WHERE handle=?',String(body.to||'').replace(/^@/,''));
  if(!target)return error(404,'Profile not found.');if(target.id===uid)return error(400,'You cannot block yourself.');
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO blocks(owner,target,created_at) VALUES(?,?,?)').bind(uid,target.id,Date.now()),env.DB.prepare('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)').bind(uid,target.id,target.id,uid)]);return response({ok:true});
 }
 let match=path.match(/^\/v1\/blocks\/([^/]+)$/);
 if(match&&method==='DELETE'){const target=await one(env,'SELECT id FROM users WHERE handle=?',decodeURIComponent(match[1]));if(target)await env.DB.prepare('DELETE FROM blocks WHERE owner=? AND target=?').bind(uid,target.id).run();return response({ok:true});}
 if(path==='/v1/conversations'&&method==='GET'){
  const rows=await all(env,`SELECT u.handle,u.name,u.avatar,m.id AS last_id,m.body,m.created_at,m.sender,
    (SELECT COUNT(*) FROM messages incoming WHERE incoming.sender=u.id AND incoming.recipient=? AND incoming.seq>COALESCE((SELECT read_seq FROM message_reads WHERE owner=? AND peer=u.id),0)) AS unread
    FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END
    LEFT JOIN messages m ON m.seq=(SELECT MAX(seq) FROM messages latest WHERE (latest.sender=? AND latest.recipient=u.id) OR (latest.sender=u.id AND latest.recipient=?))
    WHERE f.status='accepted' AND (f.a=? OR f.b=?) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=u.id) OR (owner=u.id AND target=?))
    ORDER BY m.created_at DESC,u.handle LIMIT 200`,uid,uid,uid,uid,uid,uid,uid,uid,uid);
  return response({conversations:rows.map(peer=>({...person(peer),last:peer.last_id?{text:peer.body,at:peer.created_at,mine:peer.sender===uid}:null,unread:peer.unread||0}))});
 }
 match=path.match(/^\/v1\/media\/([^/]+)\/friends$/);
 if(match&&method==='GET'){
  const ids=new Set([decodeURIComponent(match[1]),...(url.searchParams.get('ids')||'').split(',')].filter(Boolean).slice(0,6));const keys=new Set((url.searchParams.get('keys')||'').split(',').slice(0,6).map(norm).filter(k=>k.length>=4));
  const peers=await all(env,"SELECT u.* FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.status='accepted' AND (f.a=? OR f.b=?) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=u.id) OR (owner=u.id AND target=?)) LIMIT 200",uid,uid,uid,uid,uid);const friends=[];
  for(const peer of peers){let card;try{card=JSON.parse(peer.card||'{}')}catch{continue}const show=(card.shows||[]).find(s=>ids.has(String(s.id))||keys.has(norm(s.k||s.t))||(s.titles||[]).some(t=>keys.has(norm(t))));if(show){const watching=(card.watching||[]).find(s=>String(s.id)===String(show.id));friends.push({...person(peer),status:show.st||'planned',progress:Number(show.pr??watching?.pr)||0,episodes:Number(show.ep??watching?.ep)||0,score:Number(show.s)||0,updatedAt:peer.card_at||0});}}
  return response({friends});
 }
 const control=path.match(/^\/v1\/messages\/([^/]+)\/([^/]+)(\/invite)?$/);
 if(control&&control[2]!=='read'){const peer=await one(env,'SELECT * FROM users WHERE handle=?',decodeURIComponent(control[1]));if(!peer?.handle)return error(404,'Profile not found.');if(await isBlocked(env,uid,peer.id)||!await friend(env,uid,peer.id))return error(403,'Messages are available between accepted AniDeck friends.');return controlMessage(req,env,uid,peer,decodeURIComponent(control[2]),!!control[3]);}
 match=path.match(/^\/v1\/messages\/([^/]+)(\/read)?$/);
 if(match){
  const peer=await one(env,'SELECT * FROM users WHERE handle=?',decodeURIComponent(match[1]));if(!peer?.handle)return error(404,'Profile not found.');if(await isBlocked(env,uid,peer.id)||!await friend(env,uid,peer.id))return error(403,'Messages are available between accepted AniDeck friends.');
  if(match[2]&&method==='POST'){const {through}=((await req.json().catch(()=>({})))||{});const last=await one(env,'SELECT seq FROM messages WHERE id=? AND sender=? AND recipient=?',String(through||''),peer.id,uid);if(last)await env.DB.prepare('INSERT INTO message_reads(owner,peer,read_seq) VALUES(?,?,?) ON CONFLICT(owner,peer) DO UPDATE SET read_seq=MAX(read_seq,excluded.read_seq)').bind(uid,peer.id,last.seq).run();return response({ok:true});}
  if(!match[2]&&method==='GET'){
   let before=null;if(url.searchParams.has('before')){before=await one(env,'SELECT id,seq FROM messages WHERE id=? AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))',url.searchParams.get('before'),uid,peer.id,peer.id,uid);if(!before)return error(400,'Invalid message cursor.');}
   const rows=before?await all(env,'SELECT * FROM messages WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND seq<? ORDER BY seq DESC LIMIT 51',uid,peer.id,peer.id,uid,before.seq):await all(env,'SELECT * FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) ORDER BY seq DESC LIMIT 51',uid,peer.id,peer.id,uid);
   const more=rows.length>50,chosen=rows.slice(0,50);return response({peer:person(peer),messages:await hydrateMessages(env,chosen.reverse(),uid),nextCursor:more?chosen[0].id:null});
  }
  if(!match[2]&&method==='POST'){
   const body=((await req.json().catch(()=>({})))||{});let payload;try{payload=cleanMessagePayload(body.payload);}catch(e){return error(400,e.message);}
   const text=(typeof body.text==='string'?body.text.trim():'')||messageFallback(payload),clientId=String(body.clientId||'');if(!text||text.length>2000)return error(400,'Write a message of 1–2,000 characters.');if(!/^[a-zA-Z0-9_-]{16,80}$/.test(clientId))return error(400,'A valid message ID is required.');
   const existing=await one(env,'SELECT * FROM messages WHERE sender=? AND client_id=?',uid,clientId);if(existing){if(existing.recipient!==peer.id)return error(409,'Message ID already used.');return response({message:(await hydrateMessages(env,[existing],uid))[0]});}
   const recent=await one(env,'SELECT COUNT(*) AS n FROM messages WHERE sender=? AND created_at>?',uid,Date.now()-60000);if((recent?.n||0)>=30)return error(429,'A little fast—try again in a minute.');
   const id=crypto.randomUUID(),at=Date.now(),writes=[env.DB.prepare("INSERT OR IGNORE INTO messages(id,sender,recipient,body,created_at,client_id) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM friends WHERE status='accepted' AND ((a=? AND b=?) OR (a=? AND b=?))) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?))").bind(id,uid,peer.id,text,at,clientId,uid,peer.id,peer.id,uid,uid,peer.id,peer.id,uid)];
   if(payload){writes.push(env.DB.prepare('INSERT INTO message_extras(message_id,payload) SELECT id,? FROM messages WHERE id=?').bind(JSON.stringify(payload),id));if(payload.type==='invite')writes.push(env.DB.prepare('INSERT INTO watch_invites(message_id,proposed_at,responded_by,updated_at) SELECT id,?,?,? FROM messages WHERE id=?').bind(payload.at,uid,at,id));}
   await env.DB.batch(writes);const saved=await one(env,'SELECT * FROM messages WHERE sender=? AND client_id=?',uid,clientId);if(!saved)return error(403,'Messages are available between accepted AniDeck friends.');return response({message:(await hydrateMessages(env,[saved],uid))[0]},201);
  }
 }
 return error(404,'Not found.');
}
