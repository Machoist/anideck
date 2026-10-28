/* A public-release notice, deferred until it can be shown without interrupting work. */
'use strict';
const ReleaseNotice={
 latest:null,timer:null,busy:false,presented:new Set(),barDismissed:new Set(),
 valid(s){
  if(s?.state!=='available'||!/^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(s.version||''))return false;
  try{const u=new URL(s.url),tag=decodeURIComponent(u.pathname.slice('/Machoist/anideck/releases/tag/'.length));return u.protocol==='https:'&&u.hostname==='github.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith('/Machoist/anideck/releases/tag/')&&(tag===s.version||tag==='v'+s.version);}catch{return false;}
 },
 canShow(){return !document.hidden&&$('#shell')?.hidden===false&&$('#modal')?.hidden!==false&&$('#player')?.hidden!==false&&$('#splash')?.hidden!==false&&!document.getElementById('entry-pop');},
 receive(s){this.latest=s;this.refreshBar().catch(()=>{});clearTimeout(this.timer);this.timer=null;if(this.valid(s)&&s.autoCheck!==false&&!this.presented.has(s.version))this.schedule();},
 async refreshBar(){
  const bar=$('#release-bar'),s=this.latest;if(!bar)return;
  if(!this.valid(s)){bar.hidden=true;return;}
  const dismissed=await window.native.get('releaseBarDismissedVersion').catch(()=>null);
  if(this.latest!==s)return;
  if(dismissed===s.version){this.barDismissed.add(s.version);this.presented.add(s.version);}
  bar.hidden=this.barDismissed.has(s.version);
  if(bar.hidden)return;
  $('#release-bar-message').textContent=`AniDeck v${s.version} is available`;
  const symbol=bar.querySelector('.release-bar-icon');if(symbol)symbol.innerHTML=icon('download');
  $('#release-bar-view').onclick=()=>this.show(this.latest,{force:true});
  $('#release-bar-close').onclick=()=>this.dismissBar();
 },
 async dismissBar(){
  const s=this.latest;if(!this.valid(s))return;
  this.barDismissed.add(s.version);this.presented.add(s.version);clearTimeout(this.timer);
  const bar=$('#release-bar');if(bar)bar.hidden=true;
  await Promise.all([window.native.set('releaseBarDismissedVersion',s.version),window.native.set('releaseNoticeVersion',s.version)]).catch(()=>{});
 },
 schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.valid(this.latest)||this.presented.has(this.latest.version))return;if(!this.canShow()){this.schedule();return;}this.show(this.latest).catch(()=>{});},15000);},
 async show(s,{force=false}={}){
  if(this.busy||!this.valid(s)||!this.canShow()||(!force&&this.presented.has(s.version)))return false;
  this.latest=s;this.busy=true;
  try{
   const seen=await window.native.get('releaseNoticeVersion').catch(()=>null);
   if(this.latest!==s||!this.canShow()||(!force&&(seen===s.version||this.barDismissed.has(s.version)))){if(seen===s.version)this.presented.add(s.version);return false;}
   this.presented.add(s.version);
   await window.native.set('releaseNoticeVersion',s.version).catch(()=>{});
   if(this.latest!==s||!this.canShow()||(!force&&this.barDismissed.has(s.version)))return false;
   App.modal(`<section class="release-panel"><header><span class="release-symbol" aria-hidden="true">${icon('download')}</span><button class="icon-btn" id="release-close" aria-label="Remind me for the next release">${icon('close')}</button></header><span class="ad-eyebrow">A NEW CHAPTER</span><h2>AniDeck has an update</h2><p class="release-intro">A fresh release is ready whenever you are.</p><div class="release-versions"><span><small>You’re using</small><b>v${esc(s.currentVersion||APP_VERSION)}</b></span>${icon('arrowRight')}<span><small>Now available</small><b>v${esc(s.version)}</b></span></div><p class="release-detail">Read the release notes and choose the download for your device on GitHub. Your current session can stay open.</p><footer><button class="btn ghost" id="release-later">Later</button><button class="btn primary" id="release-view">View release ${icon('external')}</button></footer></section>`,'release-modal');
   $('#release-close').onclick=$('#release-later').onclick=()=>App.closeModal();
   $('#release-view').onclick=async()=>{if(await App.openRelease())App.closeModal();};
   return true;
  }finally{this.busy=false;}
 }
};
if(App.update?.state==='available')ReleaseNotice.receive(App.update);
