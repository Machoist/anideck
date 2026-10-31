/* Recover only the account controls; artwork, episode lists and navigation stay mounted. */
'use strict';
const TrackingRecovery={job:null,timer:null,clock:null,lastKey:'',automaticAttempts:0,
 scope(service){return service?.entryScope?.()||String(service?.userId||'');},
 clear(){clearTimeout(this.timer);clearInterval(this.clock);this.timer=this.clock=null;this.job=null;},
 valid(job=this.job){return !!job&&!App.stale(job.rid)&&Tracker.svc===job.service&&this.scope(job.service)===job.scope&&String(App.showCtx?.match?.id)===String(job.id);},
 buttons(){return [...document.querySelectorAll('[data-list-retry]')];},
 paint(){const job=this.job;if(!this.valid(job)){this.clear();return;}const seconds=Math.max(0,Math.ceil(((job.error.retryAt||0)-Date.now())/1000));for(const b of this.buttons()){b.disabled=!!job.busy||seconds>0;b.textContent=job.busy?'Checking your list…':seconds>0?(this.automaticAttempts<1?'Checking again in ':'Try again in ')+seconds+'s':'Retry list lookup';}},
 bind(rid,id){
  const error=App.remoteEpisodeSnapshot?.values?.[2]?.error;
  if(!error){this.clear();return;}
  const service=Tracker.svc,scope=this.scope(service),key=rid+':'+id+':'+scope;
  if(this.job?.key===key&&this.job.error===error){this.paint();return;}
  this.clear();if(this.lastKey!==key){this.lastKey=key;this.automaticAttempts=0;}
  this.job={key,rid,id,service,scope,error,busy:false};this.paint();
  if(Number(error.status)!==429)return;
  this.clock=setInterval(()=>this.paint(),1000);
  this.timer=setTimeout(()=>{if(!this.valid()){this.clear();return;}if(this.automaticAttempts<1){this.automaticAttempts++;this.retry(false);}else{clearInterval(this.clock);this.paint();}},Math.max(0,(error.retryAt||Date.now()+60000)-Date.now())+100);
 },
 async retry(manual=true){
  const job=this.job;if(!this.valid(job)||job.busy||Date.now()<(job.error.retryAt||0))return;
  clearTimeout(this.timer);clearInterval(this.clock);if(manual)this.automaticAttempts=0;job.busy=true;this.paint();
  try{
  const state=await trackingEntryState(job.id,{fresh:true});if(!this.valid(job))return;
  const snapshot=App.remoteEpisodeSnapshot,values=[...snapshot.values];values[2]=state;
  const html=await Views.anime({id:job.id,tab:App.params?.tab||'episodes',range:snapshot.range,snapshot:values},job.rid);if(!this.valid(job))return;
  const template=document.createElement('template');template.innerHTML=html;
  for(const selector of ['.detail-side .prog-card','.hero-actions [data-list-retry],.hero-actions .status-wrap,.hero-actions [data-act="goAccount"]']){const before=document.querySelector(selector),after=template.content.querySelector(selector);if(before&&after)before.replaceWith(after);}
  this.clear();this.bind(job.rid,job.id);
  }catch(error){if(this.valid(job)){job.busy=false;job.error=error;this.paint();const message=document.querySelector('.detail-side .prog-card p');if(message)message.textContent=error.message||'Could not check your saved progress.';}}
 }
};
