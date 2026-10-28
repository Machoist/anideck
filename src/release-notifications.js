/* A public-release notice, deferred until it can be shown without interrupting work. */
'use strict';
const ReleaseNotice={
 latest:null,timer:null,busy:false,presented:new Set(),barDismissed:new Set(),noticeVersion:null,compactTimer:null,placementFrame:null,
 valid(s){
  if(s?.state!=='available'||!/^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(s.version||''))return false;
  try{const u=new URL(s.url),tag=decodeURIComponent(u.pathname.slice('/Machoist/anideck/releases/tag/'.length));return u.protocol==='https:'&&u.hostname==='github.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.startsWith('/Machoist/anideck/releases/tag/')&&(tag===s.version||tag==='v'+s.version);}catch{return false;}
 },
 canShow(){return !document.hidden&&$('#shell')?.hidden===false&&$('#modal')?.hidden!==false&&$('#player')?.hidden!==false&&$('#splash')?.hidden!==false&&!document.getElementById('entry-pop');},
 receive(s){this.latest=s;this.refreshBar().catch(()=>{});clearTimeout(this.timer);this.timer=null;if(this.valid(s)&&s.autoCheck!==false&&!this.presented.has(s.version))this.schedule();},
 queuePlacement(){if(typeof requestAnimationFrame!=='function'||this.placementFrame)return;this.placementFrame=requestAnimationFrame(()=>{this.placementFrame=null;this.place();});},
 place(){
  const bar=$('#release-bar');if(!bar||bar.hidden||!this.canShow())return;
  bar.style.visibility='';
  const size=bar.getBoundingClientRect(),edge=innerWidth<480?12:20,top=innerWidth<480?12:18;
  const controls=[...document.querySelectorAll('#main button,#main a[href],#main input,#main select,#main textarea,#main [data-act]')].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height&&r.top<220&&r.bottom>0);
  const ys=[top,...controls.map(r=>r.bottom+10).filter(y=>y>top&&y<180)].sort((a,b)=>a-b);
  const xs=[innerWidth-edge-size.width,innerWidth-edge-size.width-80,innerWidth-edge-size.width-160].filter(x=>x>=12);
  for(const y of ys)for(const x of xs){
   if(controls.every(r=>x+size.width+6<=r.left||x-6>=r.right||y+size.height+6<=r.top||y-6>=r.bottom)){
    bar.style.top=y+'px';bar.style.right=(innerWidth-x-size.width)+'px';return;
   }
  }
  // A busy page keeps its controls usable; About still offers the release.
  bar.style.visibility='hidden';
 },
 async refreshBar(){
  const bar=$('#release-bar'),s=this.latest;if(!bar)return;
  if(!this.valid(s)){bar.hidden=true;clearTimeout(this.compactTimer);this.noticeVersion=null;return;}
  const dismissed=await window.native.get('releaseBarDismissedVersion').catch(()=>null);
  if(this.latest!==s)return;
  if(dismissed===s.version){this.barDismissed.add(s.version);this.presented.add(s.version);}
  bar.hidden=this.barDismissed.has(s.version);
  if(bar.hidden)return;
  $('#release-bar-message').textContent=`v${s.version} is available`;
  if(this.noticeVersion!==s.version){this.noticeVersion=s.version;bar.classList?.remove('is-compact');clearTimeout(this.compactTimer);this.compactTimer=setTimeout(()=>{if(this.latest?.version===s.version){bar.classList?.add('is-compact');this.queuePlacement();}},8000);}
  const symbol=bar.querySelector('.release-bar-icon');if(symbol)symbol.innerHTML='<img src="brand/mark.svg" alt="">';
  $('#release-bar-view').onclick=()=>this.show(this.latest,{force:true});
  $('#release-bar-close').onclick=()=>this.dismissBar();this.queuePlacement();
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

if(typeof MutationObserver!=='undefined'){
 const observer=new MutationObserver(()=>ReleaseNotice.queuePlacement());
 const main=document.getElementById('main');if(main){observer.observe(main,{childList:true,subtree:true});main.addEventListener('scroll',()=>ReleaseNotice.queuePlacement(),{passive:true});}
 for(const id of ['modal','player','splash']){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['hidden']});}
 window.addEventListener('resize',()=>ReleaseNotice.queuePlacement());
}
