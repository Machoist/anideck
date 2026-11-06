// Core catalog content renders independently of optional metadata and account reads.
const TitleReads={active:null,budgetMs:160,
 scope(){return JSON.stringify([Tracker.name,Tracker.loggedIn(),Tracker.svc?.userId||'',Tracker.svc?.entryScope?.()||'',App.settings.titleLang]);},
 valid(batch){return this.active===batch&&!App.stale(batch.rid)&&this.scope()===batch.scope&&App.view==='anime'&&String(App.params.id)===String(batch.id);},
 defer(batch){if(!this.valid(batch)||batch.retry)return;batch.retry=setTimeout(()=>{batch.retry=null;this.paint(batch).catch(()=>{});},Math.max(16,Math.min(120,(App.scrollUntil||0)-Date.now())));},
 async read(id,rid){
  if(this.active?.retry)clearTimeout(this.active.retry);
  const batch={id,rid,scope:this.scope(),values:[null,false,{entry:null,error:{pending:true,message:'Checking your saved list…'}},null],painted:false,dirty:false};this.active=batch;
  let timer;const deadline=new Promise(resolve=>timer=setTimeout(resolve,this.budgetMs));
  const settle=(index,loader,fallback)=>Promise.resolve().then(loader).catch(()=>fallback).then(value=>{batch.values[index]=value;batch.dirty=true;return value;});
  const core=settle(0,()=>Kitsu.animeFull(id).catch(()=>Kitsu.anime(id)),null);
  const optional=Promise.all([settle(1,()=>Requests.has(id),false),settle(2,()=>trackingEntryState(id),{entry:null,error:Error('Could not check your saved list.')}),settle(3,()=>AniList.details(id),null)]);
  optional.then(()=>{if(batch.painted)this.paint(batch).catch(()=>{});});
  await core;if(!batch.values[0]){clearTimeout(timer);throw Error('Could not load this title. Try again.');}
  await Promise.race([optional,deadline]);clearTimeout(timer);if(this.scope()!==batch.scope)throw Error('Your tracking account changed. Reopen this title.');batch.dirty=false;return [...batch.values];
 },
 mounted(rid){const batch=this.active;if(!batch||batch.rid!==rid||!this.valid(batch))return;batch.painted=true;if(batch.dirty)this.paint(batch).catch(()=>{});},
 async paint(batch){
  if(!this.valid(batch)||!batch.painted||batch.painting||!batch.dirty)return;
  if(Date.now()<(App.scrollUntil||0)){this.defer(batch);return;}
  batch.painting=true;batch.dirty=false;let quiet=false;
  try{
   const root=document.getElementById('main'),active=document.activeElement;
   if(root.contains(active)&&active.matches('input,textarea,select')){batch.dirty=true;active.addEventListener('blur',()=>this.paint(batch).catch(()=>{}),{once:true});return;}
   const values=[...batch.values],html=await Views.anime({...App.params,snapshot:values},batch.rid);if(!this.valid(batch))return;
   // Input can resume while markup is being prepared. Keep the mounted list until it settles.
   if(Date.now()<(App.scrollUntil||0)){batch.dirty=true;this.defer(batch);return;}
   const template=document.createElement('template');template.innerHTML=html;
   const text=root.querySelector('.detail-hero .hero-text'),fresh=template.content.querySelector('.detail-hero .hero-text'),oldHeading=text?.querySelector('h1'),newHeading=fresh?.querySelector('h1');
   if(!text||!fresh||!oldHeading||!newHeading)return;
   App.renderQuiet=true;quiet=true;
   if(!oldHeading.dataset.logoId&&newHeading.dataset.logoId)oldHeading.dataset.logoId=newHeading.dataset.logoId;
   for(const child of [...text.children])if(child!==oldHeading&&!child.classList.contains('hero-eyebrow'))child.remove();
   for(const child of [...fresh.children])if(child!==newHeading&&!child.classList.contains('hero-eyebrow'))text.append(child);
   const side=root.querySelector('.detail-side'),nextSide=template.content.querySelector('.detail-side');if(side&&nextSide)side.replaceWith(nextSide);
   if((App.params.tab||'episodes')==='episodes'){const panel=root.querySelector('.detail-main'),nav=panel?.querySelector('.title-sections');if(nav)TitlePanels.commit({root,panel,nav},html);}
   showTint(root,App.showAl?.color||null);
   Promise.resolve(Views.animeAfter(App.params,batch.rid,{retainedTitle:true,metadataOnly:(App.params.tab||'episodes')!=='episodes'})).catch(()=>{});
  }finally{batch.painting=false;if(quiet)queueMicrotask(()=>{App.renderQuiet=false;});}
 }
};
