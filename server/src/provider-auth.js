// Tracker identity verification is distinct from AniDeck's own friends and messages.
export class ProviderSignInError extends Error{
 constructor(message,status,code){super(message);this.status=status;this.code=code;}
}
const unavailable=(name,upstreamStatus=0)=>Object.assign(new ProviderSignInError(`${name} could not verify your sign-in right now. Your AniDeck profile is still there; try again shortly.`,503,'provider_unavailable'),{upstreamStatus});
const expired=name=>new ProviderSignInError(`Reconnect ${name} to verify your AniDeck profile. Friends and messages stay in AniDeck.`,401,'provider_reauth');
export async function verifyProvider(provider,token,request=fetch){
 const name=provider==='anilist'?'AniList':'Kitsu';let response,data;
 try{
  response=await request(provider==='anilist'?'https://graphql.anilist.co':'https://kitsu.app/api/edge/users?filter[self]=true&fields[users]=name,avatar',{
   method:provider==='anilist'?'POST':'GET',...(typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(8000)}:{}),
   headers:{'user-agent':'AniDeck/1.0 (+https://github.com/Machoist/anideck)',accept:provider==='anilist'?'application/json':'application/vnd.api+json',authorization:`Bearer ${token}`,...(provider==='anilist'?{'content-type':'application/json'}:{})},
   ...(provider==='anilist'?{body:JSON.stringify({query:'{ Viewer { id name avatar { large } } }'})}:{})
  });data=await response.json().catch(()=>null);
 }catch{throw unavailable(name);}
 if(response.status===401||data?.errors?.some?.(error=>error.status===401||/invalid token|unauthenticated|unauthorized/i.test(error.message||'')))throw expired(name);
 if(!response.ok||!data)throw unavailable(name,response.status);
 const user=provider==='anilist'?data.data?.Viewer:data.data?.[0];
 if(!user?.id)throw unavailable(name,response.status);
 return provider==='anilist'?{id:`anilist:${user.id}`,name:user.name,avatar:user.avatar?.large||''}:{id:`kitsu:${user.id}`,name:user.attributes?.name||'',avatar:user.attributes?.avatar?.large||user.attributes?.avatar?.medium||''};
}
