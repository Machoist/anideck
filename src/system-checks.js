/* Read-only readiness checks. Reports intentionally omit identities, credentials and private URLs. */
'use strict';
const SystemChecks={
 last:null,pending:null,
 labels:{pass:'Passed',attention:'Needs attention',manual:'Live test needed',skipped:'Not connected'},
 probe(url,options={}){return httpUncached(url,{...options,allowChallenge:false});},
 async collect(){
  const rows=[],add=(id,group,label,status,detail)=>rows.push({id,group,label,status,detail});
  const read=async(id,group,label,fn)=>{try{await fn();}catch(error){add(id,group,label,'attention',error?.status===429?'The service asked us to slow down. Wait before retrying.':error?.status===401?'Sign-in could not be verified. Reconnect in Account settings.':'The check could not finish. Check your connection and try again.');}};
  const cfg=await window.native.config(),version=await window.native.version();
  const native=await window.native.systemCheck().catch(()=>({}));
  add('storage','This device','Saving data',native.storage?'pass':'attention',native.storage?'A separate temporary file was saved, read back and removed.':'The temporary save check failed.');
  add('secure','This device','Secure sign-in storage',native.secureStorage?'pass':'attention',native.secureStorage?'The operating system encrypted and decrypted a generated test value.':'Operating-system encryption could not be verified.');
  const entries=Array.isArray(LocalTracker.coll)?LocalTracker.coll:[];
  const issues=entries.filter(e=>!/^(al:)?[1-9][0-9]*$/.test(String(e?.anime?.id))||!Number.isInteger(e?.progress)||e.progress<0||e.progress>100000||(e.rating!=null&&(!Number.isFinite(e.rating)||e.rating<0||e.rating>10)));
  const duplicate=new Set(entries.map(e=>String(e?.anime?.id))).size!==entries.length;
  add('local-list','This device','Local watchlist',issues.length||duplicate?'attention':'pass',issues.length||duplicate?'Some saved entries need review. No entries were changed.':`${entries.length} local titles checked. Progress and ratings were not changed.`);
  const provider=async(name,service)=>{
   const id=name.toLowerCase()+'-account';if(!service.loggedIn())return add(id,'Connected accounts',name,'skipped','Optional. Connect it in Settings → Account to check sign-in.');
   const user=String(service.userId),token=service.token;
   await read(id,'Connected accounts',name,async()=>{
    let actual;if(name==='AniList'){const r=await this.probe(ANILIST_API,{method:'POST',headers:{Authorization:'Bearer '+token},json:{query:'query{Viewer{id}}'},timeout:8000});actual=r.data?.Viewer?.id;}
    else{const r=await this.probe(KITSU_BASE+'/edge/users?filter[self]=true&fields[users]=name',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.api+json'},timeout:8000});actual=r.data?.[0]?.id;}
    if(service.token!==token||String(service.userId)!==user)return add(id,'Connected accounts',name,'attention','The account changed during this check. Run checks again.');
    add(id,'Connected accounts',name,String(actual)===user?'pass':'attention',String(actual)===user?'The provider confirmed the connected account. List writes and imports still need a live check.':'The provider did not confirm the connected account. Reconnect in Account settings.');
   });
  };
  const tasks=[
   read('anilist','Online services','AniList catalog',async()=>{const r=await this.probe(ANILIST_API,{method:'POST',json:{query:'query{Page(perPage:1){media(type:ANIME){id}}}'},timeout:8000});add('anilist','Online services','AniList catalog',r.data?.Page?.media?.length?'pass':'attention',r.data?.Page?.media?.length?'A public anime catalog response was received.':'The catalog response did not contain an anime title.');}),
   read('kitsu','Online services','Kitsu catalog',async()=>{const r=await this.probe(KITSU_BASE+'/edge/anime?page[limit]=1&fields[anime]=canonicalTitle',{timeout:8000});add('kitsu','Online services','Kitsu catalog',r.data?.length?'pass':'attention',r.data?.length?'A public anime catalog response was received.':'The catalog response did not contain an anime title.');}),
   read('cloud','Online services','AniDeck service',async()=>{
    if(!Cloud.base())return add('cloud','Online services','AniDeck service','attention','The service is not configured in this build.');
    const r=await this.probe(Cloud.base()+'/v1/health',{timeout:8000}),features=Array.isArray(r.features)?r.features:[];
    const needed=['friends','messages','watch-invites','anideck-accounts','discussions','profile-favorites'];
    const ready=r.ok&&needed.every(x=>features.includes(x));add('cloud','Online services','AniDeck service',ready?'pass':'attention',ready?'The service reports support for accounts, Friends, invitations, discussions and favorites. Delivery still needs a live check.':'The service is unreachable or missing required features.');
   }),provider('AniList',AniList),provider('Kitsu',Kitsu)
  ];
  const owner=Cloud.ident(),session=Cloud.session;
  if(!session)add('profile','Connected accounts','AniDeck profile','skipped','No active AniDeck session. This check does not create a profile or sign you in.');
  else tasks.push(read('profile','Connected accounts','AniDeck profile',async()=>{const r=await this.probe(Cloud.base()+'/v1/me',{headers:{Authorization:'Bearer '+session},timeout:8000});if(Cloud.ident()!==owner||Cloud.session!==session)return add('profile','Connected accounts','AniDeck profile','attention','The account changed during this check. Run checks again.');const ok=r.accountId===owner;add('profile','Connected accounts','AniDeck profile',ok?'pass':'attention',ok?(r.me?'The service confirmed your signed-in profile.':'The session is valid. Profile creation is optional.'):'The session did not match the current account.');}));
  await Promise.all(tasks);
  for(const [id,label,detail] of [
   ['playback','Video playback','Start an episode to verify the selected source, picture, sound and progress.'],
   ['tv','TV casting','A real TV or receiver is needed to verify pairing, playback and controls.'],
   ['friends','Friends delivery','Two consenting accounts are needed to verify notifications, messages and watch invitations.'],
   ['mac','Mac support','A Mac is needed to verify installation, sign-in and playback.']
  ])add(id,'Needs a real session',label,'manual',detail);
  const order=['storage','secure','local-list','anilist','kitsu','cloud','anilist-account','kitsu-account','profile','playback','tv','friends','mac'];rows.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  return {version,build:cfg.testBuild||'Release',checkedAt:new Date().toISOString(),rows};
 },
 report(data){return ['AniDeck system checks',`Version ${data.version} · ${data.build}`,`Checked ${data.checkedAt}`,'Read-only readiness checks; not proof of every feature working.','',...data.rows.map(r=>`${r.label}: ${this.labels[r.status]} — ${r.detail}`)].join('\n');},
 async open(){
  App.modal(`<section class="sys-panel"><header class="dk-head"><div><span class="ad-eyebrow">KNOW WHAT’S READY</span><h2>System checks</h2></div><button class="icon-btn" id="sys-close" aria-label="Close">${icon('close')}</button></header><p class="sys-intro">Check saving, catalogs and connected accounts. Your lists and messages stay unchanged. Playback and delivery need a real session.</p><p id="sys-summary" role="status">Checking…</p><div id="sys-rows" class="sys-rows"></div><footer class="dk-foot"><small>No keys, handles, titles or server addresses in the copied report.</small><button class="btn ghost" id="sys-copy" disabled>Copy report</button><button class="btn primary" id="sys-run" disabled>Checking…</button></footer></section>`,'dk-modal sys-modal');
  const panel=document.querySelector('.sys-panel'),button=$('#sys-run'),copy=$('#sys-copy');$('#sys-close').onclick=()=>App.closeModal();
  const run=async()=>{button.disabled=copy.disabled=true;button.textContent='Checking…';$('#sys-summary').textContent='Checking…';try{if(!this.pending)this.pending=this.collect().finally(()=>this.pending=null);const data=await this.pending;if(!panel.isConnected)return;this.last=data;const attention=data.rows.filter(r=>r.status==='attention').length;$('#sys-summary').textContent=`Checks finished · ${attention} need attention · ${data.rows.filter(r=>r.status==='manual').length} need a live test`;
    $('#sys-rows').innerHTML=['This device','Online services','Connected accounts','Needs a real session'].map(group=>`<section class="sys-group"><h3>${esc(group)}</h3>${data.rows.filter(r=>r.group===group).map(r=>`<article class="sys-row"><div><b>${esc(r.label)}</b><p>${esc(r.detail)}</p></div><span class="sys-badge is-${r.status}">${esc(this.labels[r.status])}</span></article>`).join('')}</section>`).join('');copy.disabled=false;
   }catch{if(panel.isConnected)$('#sys-summary').textContent='Checks could not finish. Try again.';}finally{if(panel.isConnected){button.disabled=false;button.textContent='Run again';}}};
  button.onclick=run;copy.onclick=()=>navigator.clipboard.writeText(this.report(this.last)).then(()=>toast('System report copied')).catch(()=>toast('Could not copy the report','bad'));return run();
 }
};
{const original=App.act;App.act=function(name,d,el){return name==='systemChecks'?SystemChecks.open():original.call(this,name,d,el);};}
