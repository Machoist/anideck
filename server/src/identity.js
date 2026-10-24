import {verifyProvider,ProviderSignInError} from './provider-auth.js';
const unavailable=(reason='unknown',status=0)=>{
 console.warn('[Identity bridge]',reason,'status='+status);
 return new ProviderSignInError('AniDeck could not verify your sign-in right now. Please try again shortly.',503,'provider_unavailable');
};
// Explicit operator configuration is required; the desktop app never receives the bridge URL/key.
export async function verifyIdentity(env,provider,token,request=fetch,direct=verifyProvider){
 if(!env.PROVIDER_AUTH_BRIDGE_URL&&!env.PROVIDER_AUTH_BRIDGE_SECRET)return direct(provider,token);
 if(!env.PROVIDER_AUTH_BRIDGE_URL||typeof env.PROVIDER_AUTH_BRIDGE_SECRET!=='string'||env.PROVIDER_AUTH_BRIDGE_SECRET.length<32)throw unavailable('configuration');
 let url;try{url=new URL(env.PROVIDER_AUTH_BRIDGE_URL);}catch{throw unavailable('url');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/','/verify'].includes(url.pathname))throw unavailable('url');
 url.pathname='/verify';let response,data;
 try{response=await request(url.href,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PROVIDER_AUTH_BRIDGE_SECRET},body:JSON.stringify({provider,token})});data=await response.json().catch(()=>null);}catch(error){const message=String(error?.message||'');const reason=/AbortSignal|timeout.*function/i.test(message)?'timeout-api':/header|character|ByteString/i.test(message)?'request-header':/redirect/i.test(message)?'redirect':/fetch|connect|DNS|network/i.test(message)?'network':error?.name==='TimeoutError'?'timeout':'request-error';throw unavailable(reason);}
 if(!response.ok){
  if(response.status===401&&data?.code==='provider_reauth')throw new ProviderSignInError(`Reconnect ${provider==='anilist'?'AniList':'Kitsu'} to verify your AniDeck profile.`,401,'provider_reauth');
  const reason=data?.code==='bridge_unauthorized'?'bridge-key':data?.code==='provider_unavailable'?'provider':'bridge-response';
  throw unavailable(reason,response.status);
 }
 const user=data?.user;if(data?.verified!==true||!user||!new RegExp('^'+provider+':[1-9][0-9]{0,19}$').test(user.id||''))throw unavailable('identity');
 return {id:user.id,name:typeof user.name==='string'?user.name.slice(0,100):'',avatar:typeof user.avatar==='string'&&/^https:\/\//.test(user.avatar)?user.avatar.slice(0,2048):''};
}



