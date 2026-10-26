// Public identity fields. Credentials and local watchlists never enter this route.
export async function profileDetails(env,user,id){const detail=await env.DB.prepare('SELECT bio FROM profile_details WHERE owner=?').bind(id).first();const favorites=(await env.DB.prepare('SELECT media_id,title,poster FROM profile_favorites WHERE owner=? ORDER BY position').bind(id).all()).results||[];return {...user,favorites:favorites.map(f=>({id:'al:'+f.media_id,title:f.title,poster:f.poster})),bio:detail?.bio||'',customized:!!detail,...(user.card?{card:{...user.card,name:user.name,avatar:user.avatar}}:{})};}
export async function updateProfile(req,env,uid,me,headers){
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 const text=await req.text();if(text.length>51000)return response({error:'Choose a smaller profile picture.'},413);
 let body;try{body=JSON.parse(text);}catch{return response({error:'Invalid profile details.'},400);}
 if(!body||Array.isArray(body)||typeof body!=='object')return response({error:'Invalid profile details.'},400);
 const name=typeof body.name==='string'?body.name.trim():'',bio=typeof body.bio==='string'?body.bio.trim():'',avatar=typeof body.avatar==='string'?body.avatar:'';
 if(!name||name.length>80||bio.length>400||avatar.length>48000)return response({error:'Use a name up to 80 characters and a bio up to 400 characters.'},400);
 const uploaded=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar);
 const inherited=avatar===me.avatar;
 if(avatar&&!uploaded&&!inherited)return response({error:'Upload a PNG, JPEG or WebP picture.'},400);
 if(uploaded){let raw;try{raw=atob(avatar.split(',')[1]);}catch{return response({error:'Invalid picture format.'},400);}const valid=avatar.startsWith('data:image/png')?raw.startsWith('\x89PNG\r\n\x1a\n'):avatar.startsWith('data:image/jpeg')?raw.startsWith('\xff\xd8\xff'):raw.startsWith('RIFF')&&raw.slice(8,12)==='WEBP';if(!valid)return response({error:'Invalid picture format.'},400);}
 await env.DB.batch([env.DB.prepare('UPDATE users SET name=?,avatar=? WHERE id=?').bind(name,avatar,uid),env.DB.prepare('INSERT INTO profile_details(owner,bio) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET bio=excluded.bio').bind(uid,bio)]);
 return response({ok:true});
}

export async function updateFavorites(req,env,uid,headers){
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 const raw=await req.text();if(raw.length>8000)return reply({error:'Favorite selection is too large.'},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:'Invalid favorites.'},400);}
 if(!Array.isArray(body?.favorites)||body.favorites.length>8)return reply({error:'Choose up to eight favorite anime.'},400);
 const selected=[],seen=new Set();for(const item of body.favorites){if(!item||typeof item.id!=='string'||!/^al:[1-9][0-9]*$/.test(item.id))return reply({error:'Choose an anime from the catalog.'},400);const id=Number(item.id.slice(3));if(!Number.isSafeInteger(id)||id>2147483647||seen.has(id)||typeof item.title!=='string'||!item.title.trim()||item.title.length>200||typeof item.poster!=='string'||item.poster.length>500)return reply({error:'Invalid or duplicate favorite anime.'},400);if(item.poster){try{const url=new URL(item.poster);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{return reply({error:'Invalid cover image.'},400);}}seen.add(id);selected.push({id,title:item.title.trim(),poster:item.poster});}
 await env.DB.batch([env.DB.prepare('DELETE FROM profile_favorites WHERE owner=?').bind(uid),...selected.map((item,index)=>env.DB.prepare('INSERT INTO profile_favorites(owner,media_id,position,title,poster) VALUES(?,?,?,?,?)').bind(uid,item.id,index,item.title,item.poster))]);
 return reply({ok:true});
}
