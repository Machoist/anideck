/* Public release discovery only. Never downloads or installs an update. */
'use strict';
const semver=require('semver');
const RELEASES='https://github.com/Machoist/anideck/releases';
const ENDPOINT='https://api.github.com/repos/Machoist/anideck/releases/latest';
function createReleaseChecker({version,fetch,now=Date.now,onState=()=>{}}){
 const current=semver.valid(version);if(!current)throw Error('Invalid installed version');
 let state={state:'idle',currentVersion:current},pending=null,cacheUntil=0,retryAt=0;
 const snapshot=()=>({...state});
 const publish=value=>{state={currentVersion:current,...value};onState(snapshot());return snapshot();};
 const check=({force=false}={})=>{
  if(pending)return pending;
  if(now()<retryAt||(!force&&now()<cacheUntil))return Promise.resolve(snapshot());
  pending=(async()=>{
   publish({state:'checking'});
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   try{
    const response=await fetch(ENDPOINT,{headers:{Accept:'application/vnd.github+json','User-Agent':'AniDeck-release-check'},credentials:'omit',redirect:'error',signal:controller.signal});
    const checkedAt=now();retryAt=checkedAt+60000;cacheUntil=checkedAt+4*60*60*1000;
    if(response.status===404)return publish({state:'unpublished',checkedAt});
    if(response.status===403||response.status===429){
     const seconds=Number(response.headers?.get('retry-after')),reset=Number(response.headers?.get('x-ratelimit-reset'));
     retryAt=Math.max(checkedAt+5*60000,Number.isFinite(seconds)&&seconds>0?checkedAt+seconds*1000:0,Number.isFinite(reset)&&reset>0?reset*1000:0);
     cacheUntil=retryAt;return publish({state:'error',checkedAt,retryAt,message:'GitHub is busy. Try checking again later.'});
    }
    if(!response.ok)throw Error('Unavailable');
    const release=await response.json(),tag=String(release?.tag_name||''),candidate=semver.valid(tag);
    if(!candidate||release.draft||release.prerelease||semver.prerelease(candidate))throw Error('Invalid release');
    if(!semver.gt(candidate,current))return publish({state:'latest',checkedAt});
    return publish({state:'available',checkedAt,version:tag.replace(/^v/,''),url:RELEASES+'/tag/'+encodeURIComponent(tag)});
   }catch{
    const checkedAt=now();cacheUntil=retryAt=checkedAt+5*60000;
    return publish({state:'error',checkedAt,retryAt,message:'Couldn’t check GitHub. Check your connection and try again later.'});
   }finally{clearTimeout(timer);}
  })().finally(()=>{pending=null;});
  return pending;
 };
 return {check,snapshot};
}
module.exports={createReleaseChecker,RELEASES,ENDPOINT};
