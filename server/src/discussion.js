const headers={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const hidden=(env,a,b)=>one(env,'SELECT owner FROM blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)',a,b,b,a);
export async function discussionRoute(req,env,uid,me){
 const path=new URL(req.url).pathname,match=path.match(/^\/v1\/discussion\/(al:[1-9][0-9]*)(?:\/([a-z0-9-]+)(\/like)?)?$/i);if(!path.startsWith('/v1/discussion/'))return null;
 if(!match)return reply({error:'Choose a matched anime title.'},400);const [,media,id,like]=match,method=req.method;
 const hydrate=rows=>rows.map(r=>({id:r.id,text:r.body,parent:r.parent_id,spoiler:!!r.spoiler,at:r.created_at,editedAt:r.edited_at,mine:r.author===uid,handle:r.handle,name:r.name||r.handle,avatar:r.avatar||'',likes:r.likes||0,liked:!!r.liked}));
 if(!id&&method==='GET'){
  const params=new URL(req.url).searchParams,thread=params.get('thread'),topics=params.get('topics')==='1';let root=null;
  if(thread){root=await one(env,'SELECT c.*,u.handle,u.name,u.avatar,(SELECT COUNT(*) FROM title_comment_likes l WHERE l.comment_id=c.id) AS likes,EXISTS(SELECT 1 FROM title_comment_likes l WHERE l.comment_id=c.id AND l.owner=?) AS liked FROM title_comments c JOIN users u ON u.id=c.author WHERE c.id=? AND c.media_id=? AND c.parent_id IS NULL',uid,thread,media);if(!root||await hidden(env,uid,root.author))return reply({error:'That discussion is unavailable.'},404);}
  const tree=thread?'WITH RECURSIVE thread_ids(id) AS (SELECT id FROM title_comments WHERE id=? AND media_id=? UNION ALL SELECT c.id FROM title_comments c JOIN thread_ids t ON c.parent_id=t.id WHERE c.media_id=?) ':'';
  const treeArgs=thread?[thread,media,media]:[];
  const before=params.get('before');let cursor=null;if(before){cursor=await one(env,'SELECT created_at,id,parent_id FROM title_comments WHERE id=? AND media_id=?',before,media);if(!cursor||(topics&&cursor.parent_id)||(thread&&!await one(env,tree+'SELECT id FROM thread_ids WHERE id=?',...treeArgs,before)))return reply({error:'That page is unavailable. Reload the discussion.'},400);}
  const count=topics?`,(WITH RECURSIVE descendants(id,author) AS (SELECT id,author FROM title_comments WHERE parent_id=c.id AND media_id=c.media_id UNION ALL SELECT child.id,child.author FROM title_comments child JOIN descendants p ON child.parent_id=p.id WHERE child.media_id=c.media_id) SELECT COUNT(*) FROM descendants d WHERE NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner=? AND b.target=d.author) OR (b.target=? AND b.owner=d.author))) AS replies`:'';
  const rows=await all(env,`${tree}SELECT c.*,u.handle,u.name,u.avatar,(SELECT COUNT(*) FROM title_comment_likes l WHERE l.comment_id=c.id) AS likes,EXISTS(SELECT 1 FROM title_comment_likes l WHERE l.comment_id=c.id AND l.owner=?) AS liked ${count} FROM title_comments c JOIN users u ON u.id=c.author WHERE c.media_id=? ${topics?'AND c.parent_id IS NULL':''} ${thread?'AND c.id IN (SELECT id FROM thread_ids)':''} AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner=? AND b.target=c.author) OR (b.owner=c.author AND b.target=?)) ${cursor?'AND (c.created_at<? OR (c.created_at=? AND c.id<?))':''} ORDER BY c.created_at DESC,c.id DESC LIMIT 51`,...treeArgs,uid,...(topics?[uid,uid]:[]),media,uid,uid,...(cursor?[cursor.created_at,cursor.created_at,cursor.id]:[]));
  const page=rows.slice(0,50),comments=hydrate(page.reverse());if(topics)comments.forEach((c,i)=>c.replies=page[i].replies||0);
  return reply({comments,nextCursor:rows.length>50?page[0]?.id:null,...(root?{thread:hydrate([root])[0]}:{}),topics});
 }
 if(!id&&method==='POST'){
  const body=await req.json().catch(()=>null),text=body?.text;if(typeof text!=='string'||!text.trim()||text.length>2000)return reply({error:'Write a comment from 1 to 2,000 characters.'},400);
  if(typeof body.clientId!=='string'||!/^[-a-z0-9_]{8,100}$/i.test(body.clientId))return reply({error:'A comment request ID is required.'},400);const existing=await one(env,'SELECT id,media_id FROM title_comments WHERE author=? AND client_id=?',uid,body.clientId);if(existing)return existing.media_id===media?reply({ok:true,id:existing.id}):reply({error:'Request ID already used.'},409);
  const recent=await one(env,'SELECT COUNT(*) AS n FROM title_comments WHERE author=? AND created_at>?',uid,Date.now()-60000);if(recent.n>=10)return reply({error:'A little fast. Try again in a minute.'},429);
  if(body.parent){const parent=await one(env,'SELECT author FROM title_comments WHERE id=? AND media_id=?',body.parent,media);if(!parent||await hidden(env,uid,parent.author))return reply({error:'That comment is unavailable.'},404);}
  const newId=crypto.randomUUID();await env.DB.prepare('INSERT INTO title_comments(id,media_id,author,body,client_id,parent_id,spoiler,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(newId,media,uid,text.trim(),body.clientId,body.parent||null,body.spoiler?1:0,Date.now()).run();return reply({ok:true,id:newId},201);
 }
 const comment=await one(env,'SELECT * FROM title_comments WHERE id=? AND media_id=?',id,media);if(!comment||await hidden(env,uid,comment.author))return reply({error:'That comment is unavailable.'},404);
 if(like&&method==='POST'){const body=await req.json().catch(()=>({}));if(body.liked===true)await env.DB.prepare('INSERT OR IGNORE INTO title_comment_likes(comment_id,owner) VALUES(?,?)').bind(id,uid).run();else await env.DB.prepare('DELETE FROM title_comment_likes WHERE comment_id=? AND owner=?').bind(id,uid).run();return reply({ok:true});}
 if(comment.author!==uid)return reply({error:'You can change only your own comments.'},403);
 if(!like&&method==='PATCH'){const body=await req.json().catch(()=>null);if(typeof body?.text!=='string'||!body.text.trim()||body.text.length>2000)return reply({error:'Write a comment from 1 to 2,000 characters.'},400);await env.DB.prepare('UPDATE title_comments SET body=?,edited_at=? WHERE id=? AND author=?').bind(body.text.trim(),Date.now(),id,uid).run();return reply({ok:true});}
 if(!like&&method==='DELETE'){await env.DB.prepare('DELETE FROM title_comment_likes WHERE comment_id=?').bind(id).run();await env.DB.prepare('DELETE FROM title_comments WHERE id=? AND author=?').bind(id,uid).run();return reply({ok:true});}
 return reply({error:'Method not supported.'},405);
}
