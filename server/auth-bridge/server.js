import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {verifyProvider,ProviderSignInError} from '../src/provider-auth.js';
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
const digest=value=>createHash('sha256').update(value).digest();
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384){const error=new Error('Request too large');error.status=413;throw error;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const error=new Error('Invalid JSON');error.status=400;throw error;}}
// No database, files, request-body logs or stored provider tokens. Only server-to-server verification.
export function createIdentityBridge({secret=process.env.PROVIDER_AUTH_BRIDGE_SECRET,verify=verifyProvider,request=fetch,now=Date.now,maxRequestsPerMinute=30}={}){
 if(typeof secret!=='string'||secret.length<32)throw new Error('PROVIDER_AUTH_BRIDGE_SECRET must contain at least 32 characters.');
 const secretHash=digest(secret);let windowAt=now(),used=0;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'anideck-identity'});
  const authorization=req.headers.authorization||'',candidate=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!timingSafeEqual(secretHash,digest(candidate)))return json(res,401,{error:'Unauthorized bridge request',code:'bridge_unauthorized'});
  if(req.method!=='POST'||!['/verify','/probe'].includes(url.pathname))return json(res,404,{error:'Not found'});
  if(now()-windowAt>=60000){windowAt=now();used=0;}if(++used>maxRequestsPerMinute)return json(res,503,{error:'Sign-in verification is busy. Try again shortly.',code:'provider_unavailable'});
  try{
   if(url.pathname==='/probe'){
    // Public metadata only: verify host compatibility before routing anyone's access token here.
    const response=await request('https://graphql.anilist.co',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json',accept:'application/json','user-agent':'AniDeck/1.0 (+https://github.com/Machoist/anideck)'},body:JSON.stringify({query:'{ Media(id:1,type:ANIME) { id } }'})});
    const data=await response.json().catch(()=>null),reachable=response.ok&&data?.data?.Media?.id===1;
    return json(res,reachable?200:503,{reachable,upstreamStatus:response.status});
   }
   const input=await body(req);
   if(!['anilist','kitsu'].includes(input.provider)||typeof input.token!=='string'||input.token.length<10||input.token.length>12000)return json(res,400,{error:'A supported provider and access token are required.'});
   const user=await verify(input.provider,input.token);return json(res,200,{verified:true,user});
  }catch(error){
   if(error instanceof ProviderSignInError)return json(res,error.status,{error:error.message,code:error.code,...(error.code==='provider_unavailable'?{upstreamStatus:error.upstreamStatus||0}:{})});
   if(error.status===413||error.status===400)return json(res,error.status,{error:error.message});
   return json(res,503,{error:'Sign-in verification is temporarily unavailable.',code:'provider_unavailable'});
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=50;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createIdentityBridge(),port=Number(process.env.PORT)||8080;
 server.listen(port,'0.0.0.0',()=>console.log('AniDeck identity service ready on port '+port));
 const stop=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
