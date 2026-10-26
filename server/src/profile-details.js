// Public identity fields. Credentials and local watchlists never enter this route.
export async function profileDetails(env,user,id){const detail=await env.DB.prepare('SELECT bio FROM profile_details WHERE owner=?').bind(id).first();return {...user,bio:detail?.bio||'',customized:!!detail,...(user.card?{card:{...user.card,name:user.name,avatar:user.avatar}}:{})};}
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
