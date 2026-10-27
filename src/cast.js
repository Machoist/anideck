/* AniDeck - browser casting controller. The TV plays media; this PC owns accounts and tracking. */
'use strict';
const Cast = {
 ready:false, active:false, mediaId:null, polling:false, timer:null, busy:false,
 async call(method,...args){const r=await window.native.cast[method](...args);if(!r.ok)throw new Error(r.error);return r.value;},
 async connectReceiver(code){
  await this.call('connect',code);this.ready=true;this.ensurePoll();await this.poll();
  if(Player.ctx&&!Player.el?.hidden&&(Player.castSource?.url||Player.item))await this.sendCurrent();
 },
 // Two steps (open the address on the TV, type its code), then a remote: what's on, a progress bar and the controls.
 // The panel's data-state (starting / waiting / connected / casting / lost) decides which parts show.
 async open(){
  const pauseIc='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>';
  App.modal(`<div class="cast-panel" data-state="starting">
   <header class="cast-head"><span class="cast-logo">${icon('cast')}</span><div class="cast-head-text"><h2>Cast to TV</h2><span class="cast-pill"><i></i><span id="cast-state" role="status">Starting the receiver…</span></span></div><span class="spacer"></span><button class="icon-btn" id="cast-close" aria-label="Close">${icon('close')}</button></header>
   <ol class="cast-steps">
    <li class="cast-step"><span class="cast-num">1</span><div class="cast-step-body"><b>Open this address on your TV</b><p>Use your TV’s web browser. Keep the TV and this PC on the same home network.</p><div id="cast-address" class="cast-address"><div class="skel" style="height:58px;border-radius:14px"></div></div></div></li>
    <li class="cast-step"><span class="cast-num">2</span><div class="cast-step-body"><b>Type the code your TV shows</b><form id="cast-connect" class="cast-code-form"><div class="cast-code" id="cast-code" role="group" aria-label="Six-digit TV code">${Array.from({length:6},(_,i)=>`<input inputmode="numeric" maxlength="1" autocomplete="${i?'off':'one-time-code'}" aria-label="Digit ${i+1}">`).join('')}</div><button class="btn primary" type="submit" id="cast-connect-btn" disabled>Connect</button></form><p class="desc">After connecting, the next episode you start on this PC plays on the TV. If Windows asks, allow AniDeck on private networks.</p></div></li>
   </ol>
   <section class="cast-remote">
    <div class="cast-device"><span class="cast-tv">${icon('cast')}</span><div><b id="cast-device">Your TV</b><small id="cast-device-sub">Connected</small></div></div>
    <div class="cast-now"><small>Now on your TV</small><b id="cast-title"></b><div class="cast-bar"><div id="cast-bar-fill"></div></div><div class="cast-times"><span id="cast-time">0:00</span><span id="cast-dur">0:00</span></div>
     <div class="cast-controls"><button class="cast-round" id="cast-back" title="Back 10 seconds">${icon('rewind')}<span>10</span></button><button class="cast-round big" id="cast-pause" title="Play / pause"><span class="cp-play">${icon('play','fill')}</span><span class="cp-pause">${pauseIc}</span></button><button class="cast-round" id="cast-forward" title="Forward 10 seconds">${icon('forward')}<span>10</span></button></div></div>
    <div class="cast-next" id="cast-next"><b>Your TV is ready. Pick an episode.</b><p>Choose a show on this PC and press Play. AniDeck will send it to your TV automatically.</p><button class="btn primary" id="cast-choose">Choose an episode</button><button class="link-btn" id="cast-pc-only">Keep playback on this PC instead</button></div><div class="cast-acts"><button class="btn primary" id="cast-send">${icon('cast')} Play this episode on TV</button><button class="btn ghost" id="cast-return">Continue on this PC</button></div>
    <p class="desc" id="cast-hint"></p>
   </section>
   <p id="cast-result" role="status" class="cast-result" hidden></p>
   <footer class="cast-foot"><button class="link-btn" id="cast-disconnect">Disconnect TV</button><button class="link-btn" id="cast-off">Turn off receiver</button><span class="spacer"></span><small>Keep AniDeck open and this PC awake while casting.</small></footer>
  </div>`,'cast-card');
  document.getElementById('cast-close').onclick=()=>App.closeModal();
  // Code boxes: digits only, typing moves on, Backspace moves back, pasting fills them all; a full code connects.
  const boxes=[...document.querySelectorAll('#cast-code input')],code=()=>boxes.map(b=>b.value).join(''),go=document.getElementById('cast-connect-btn');
  const sync=()=>{go.disabled=code().length!==6;if(code().length===6)document.getElementById('cast-connect').requestSubmit();};
  boxes.forEach((b,i)=>{
   b.oninput=()=>{const d=b.value.replace(/\D/g,'');if(d.length>1){d.slice(0,6-i).split('').forEach((c,j)=>{boxes[i+j].value=c;});boxes[Math.min(5,i+d.length)].focus();}else{b.value=d;if(d&&i<5)boxes[i+1].focus();}sync();};
   b.onkeydown=e=>{if(e.key==='Backspace'&&!b.value&&i){boxes[i-1].value='';boxes[i-1].focus();e.preventDefault();sync();}else if(e.key==='ArrowLeft'&&i)boxes[i-1].focus();else if(e.key==='ArrowRight'&&i<5)boxes[i+1].focus();};
   b.onpaste=e=>{const d=(e.clipboardData?.getData('text')||'').replace(/\D/g,'').slice(0,6);if(!d)return;e.preventDefault();boxes.forEach((x,j)=>{x.value=d[j]||'';});boxes[Math.min(5,d.length)].focus();sync();};
  });
  setTimeout(()=>boxes[0]?.focus(),60);
  document.getElementById('cast-connect').onsubmit=async event=>{event.preventDefault();if(code().length!==6)return;go.disabled=true;go.textContent='Connecting…';
   try{await this.connectReceiver(code());boxes.forEach(x=>{x.value='';});}catch(error){this.showError(error);boxes.forEach(x=>{x.value='';});boxes[0].focus();document.querySelector('.cast-code')?.classList.add('shake');setTimeout(()=>document.querySelector('.cast-code')?.classList.remove('shake'),450);}
   finally{go.textContent='Connect';go.disabled=code().length!==6;}};
  document.getElementById('cast-choose').onclick=()=>{this.ready=true;App.closeModal();if(Player.el&&!Player.el.hidden)Player.close();App.nav('home');toast('TV ready — start an episode to play it there.','good');};
  document.getElementById('cast-pc-only').onclick=()=>this.returnToPc();
  document.getElementById('cast-send').onclick=()=>this.sendCurrent().catch(error=>this.showError(error));
  document.getElementById('cast-pause').onclick=()=>this.command(Player.casting?.paused?'play':'pause');
  document.getElementById('cast-back').onclick=()=>this.command('seek',(Player.casting?.time||0)-10);
  document.getElementById('cast-forward').onclick=()=>this.command('seek',(Player.casting?.time||0)+10);
  document.getElementById('cast-return').onclick=()=>this.returnToPc();
  document.getElementById('cast-disconnect').onclick=()=>this.disconnectReceiver();
  document.getElementById('cast-off').onclick=()=>this.disconnectReceiver(true);
  try{const s=await this.call('start');if(!document.querySelector('.cast-panel'))return;await this.call('pairing',true);this.showAddresses(s.urls||[]);await this.poll();this.ensurePoll();}catch(error){this.showError(error);}
 },
 // The likeliest address big with a copy button; virtual adapters (VirtualBox, Hyper-V/WSL, Docker) go under "Other addresses".
 showAddresses(urls){
  const el=document.getElementById('cast-address');if(!el)return;
  if(!urls.length){el.innerHTML='<div class="cast-noaddr">No home network found. Connect this PC to Wi-Fi or Ethernet, then reopen this window.</div>';return;}
  const virtual=u=>/\/\/(192\.168\.(56|99)\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(u);
  const sorted=[...urls].sort((a,b)=>virtual(a)-virtual(b)),[main,...rest]=sorted,copyIc='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/></svg>';
  el.innerHTML=`<div class="cast-url"><code>${esc(main.replace(/^http:\/\//,''))}</code><button type="button" class="cast-copy" data-url="${esc(main)}" title="Copy address">${copyIc}<span>Copy</span></button></div>${rest.length?`<details class="cast-more"><summary>Not working? Try ${rest.length===1?'the other address':`another of ${rest.length} addresses`}</summary>${rest.map(u=>`<code>${esc(u.replace(/^http:\/\//,''))}</code>`).join('')}</details>`:''}`;
  el.querySelector('.cast-copy').onclick=async e=>{const b=e.currentTarget;try{await navigator.clipboard.writeText(b.dataset.url);b.querySelector('span').textContent='Copied';setTimeout(()=>{if(b.isConnected)b.querySelector('span').textContent='Copy';},1600);}catch{toast('Couldn’t copy the address','bad');}};
 },
 showError(error){const el=document.getElementById('cast-state');if(el){el.textContent=error.message;el.closest('.cast-pill')?.classList.add('bad');}else toast(error.message,'bad');},
 ensurePoll(){if(!this.timer)this.timer=setInterval(()=>{if(this.ready||this.active||document.getElementById('cast-state'))this.poll();else{clearInterval(this.timer);this.timer=null;}},250);},
 async poll(){
  if(this.polling)return;this.polling=true;const session=this.session||0;
  try{
   if(document.querySelector('.cast-panel'))await this.call('pairing',true);
   const s=await this.call('status');if(session!==(this.session||0))return;const screen=s.screen,p=screen?.playback,el=document.getElementById('cast-state');
   if(el)el.textContent=screen?(screen.online?`${screen.name} · ${p?.error||(p?.needsInteraction?'Press Play on your TV remote':this.active?(p?.loading?'Loading on TV…':p?.paused?'Paused on TV':'Playing on TV'):this.ready?'Ready · choose an episode':'Connected')}`:'TV connection lost · reopen the receiver page'):'Waiting for a TV';
   const loaded=!!Player.ctx&&!Player.el?.hidden&&!!(Player.castSource||Player.item);
   const send=document.getElementById('cast-send');if(send)send.disabled=!screen?.online||!loaded||this.busy;
   for(const id of ['cast-pause','cast-back','cast-forward','cast-return']){const b=document.getElementById(id);if(b)b.disabled=!this.active;}
   this.paint(screen,p,loaded);
   if((this.active||this.ready)&&(!screen||!screen.online)){this.ready=false;this.active=false;this.mediaId=null;Player.casting=null;if(Player.video&&Player.ctx)Player.tick();toast('TV disconnected. Press Play to continue on this PC.','bad');}
   if(this.active&&p?.mediaId===this.mediaId){Player.casting=p;Player.tick();if(this.active&&p.mediaId===this.mediaId&&p.ended&&!this.handledEnd){this.handledEnd=true;Player.ended();}}
  }catch(error){this.showError(error);}finally{this.polling=false;}
 },
 // Panel state, the device line, and (while casting) the title, progress and play/pause button.
 paint(screen,p,loaded){
  const panel=document.querySelector('.cast-panel');if(!panel)return;
  const state=!screen?'waiting':!screen.online?'lost':this.active?'casting':'connected';
  panel.dataset.state=state;panel.classList.toggle('paused',!!p?.paused);panel.classList.toggle('cast-failed',!!p?.error);
  panel.querySelector('.cast-pill')?.classList.toggle('bad',state==='lost'||!!p?.error);
  const set=(id,v)=>{const x=document.getElementById(id);if(x&&x.textContent!==v)x.textContent=v;};
  const t=n=>{n=Math.max(0,Math.floor(n||0));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=String(n%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${sec}`:`${m}:${sec}`;};
  if(screen){set('cast-device',screen.name||'Your TV');set('cast-device-sub',!screen.online?'Lost the connection: reopen the address on the TV':p?.error||(p?.needsInteraction?'Press Play on the TV to begin':this.active?(p?.loading?'Loading episode…':p?.paused?'Paused':'Playing'):this.ready?'Ready for your next episode':'Connected · PC playback selected'));}
  set('cast-title',[Player.ctx?.series?.Name,Player.ctx?.episode?epLabel(Player.ctx.episode):''].filter(Boolean).join(' · ')||'This episode');
  const dur=p?.duration||Player.casting?.duration||0,at=p?.time||0;
  set('cast-time',t(at));set('cast-dur',t(dur));
  const fill=document.getElementById('cast-bar-fill');if(fill)fill.style.width=`${dur?Math.min(100,at/dur*100):0}%`;
  const next=document.getElementById('cast-next');if(next)next.hidden=state!=='connected'||loaded||!this.ready;
  const send=document.getElementById('cast-send');if(send){send.hidden=state==='connected'&&!loaded;send.textContent=p?.error?'Retry on TV':'Play this episode on TV';}
  set('cast-hint',state==='connected'?(loaded?'Sends what’s playing here; it picks up from the same spot.':(this.ready?'Start an episode on this PC. It will play on your TV automatically.':'PC playback is selected. Use the player’s Cast button when you want to send an episode.')):'');
 },
 async sendCurrent({at:requestedAt}={}){
  if(this.ending)return;if(this.busy){this.resend=true;return;}if(!Player.ctx||Player.el.hidden)throw new Error('Start an episode before casting it.');
  this.busy=true;
  try{
   const session=this.session||0,seq=Player.loadSeq,at=requestedAt??Player.casting?.time??Player.video.currentTime;
   let source=Player.castSource;
   const selected=Player.remoteSubtitles?.[Player.remoteSubIndex];
   const subtitles=Player.remote&&Player.subMode==='text'&&selected?[{...selected,headers:selected.headers||Player.castHeaders||{}}]:[];
   if(Player.item&&Player.source){source={url:Jellyfin.streamUrl(Player.item,Player.source,{audioIndex:Player.audioIndex,burnSubIndex:Player.subMode==='burn'?Player.subIndex:null,maxBitrate:Math.min(App.settings.maxBitrate||10000000,10000000),playSessionId:Player.playSessionId,copyVideo:false,hevc:false,av1:false}),isHLS:true};if(Player.subMode==='text'&&Player.subIndex!=null)subtitles.push({url:Jellyfin.subtitleVttUrl(Player.item,Player.source,Player.subIndex),language:App.settings.subLang==='off'?'en':App.settings.subLang});}
   if(!source?.url)throw new Error('The episode is still loading. Try again when playback starts.');
   const result=await this.call('load',{...source,headers:Player.castHeaders||{},title:[Player.ctx.series?.Name,epLabel(Player.ctx.episode)].filter(Boolean).join(' · '),at,subtitles});
   if(session!==(this.session||0)||seq!==Player.loadSeq||Player.el.hidden){await this.call('command','stop');return;}
   this.mediaId=result.id;this.handledEnd=false;this.ready=true;this.active=true;Player.casting={time:at,duration:Player.dur(),paused:false};Player.video.pause();this.ensurePoll();await this.poll();
  }finally{this.busy=false;if(this.resend){this.resend=false;if(this.active&&!Player.el.hidden)this.sendCurrent().catch(error=>this.showError(error));}}
 },
 async command(action,value){try{await this.call('command',action,value);await this.poll();}catch(error){this.showError(error);}},
 onTeardown(){if(this.mediaId){this.call('command','stop').catch(()=>{});this.mediaId=null;}},
 async disconnectReceiver(turnOff=false){
  if(this.ending)return;this.ending=true;this.session=(this.session||0)+1;
  const result=document.getElementById('cast-result');if(result){result.hidden=false;result.textContent=turnOff?'Turning off receiver…':'Disconnecting TV…';}
  const at=Player.casting?.time,seq=Player.loadSeq;
  const buttons=['cast-disconnect','cast-off'].map(id=>document.getElementById(id)).filter(Boolean);buttons.forEach(b=>b.disabled=true);
  try{
   // Unpair first. Restoring PC playback can take time or fail, and must never block disconnection.
   await this.call(turnOff?'stop':'disconnect');
   const status=await this.call('status');if(status.screen||(turnOff&&status.running))throw new Error('The receiver did not confirm disconnection. Please try again.');
   if(result)result.textContent='TV disconnected. Your TV will show a new code.';
   document.querySelectorAll('#cast-code input').forEach(box=>{box.value='';});const connect=document.getElementById('cast-connect-btn');if(connect)connect.disabled=true;
   this.ready=false;this.active=false;this.mediaId=null;this.resend=false;Player.casting=null;
   if(turnOff){clearInterval(this.timer);this.timer=null;App.closeModal();}
   else {this.paint(null,null,!!Player.ctx&&!Player.el?.hidden);const state=document.getElementById('cast-state');if(state)state.textContent='TV disconnected · connect using a new code';}
   if(Player.ctx&&!Player.el?.hidden){Player.tick();if(at!=null&&seq===Player.loadSeq)Player.resumeFromCast(at).catch(error=>this.showError(error));}
  }catch(error){if(result){result.hidden=false;result.textContent='Couldn’t disconnect: '+error.message;}this.showError(error);}finally{this.ending=false;buttons.forEach(b=>b.disabled=false);}
 },
 async returnToPc(){const at=Player.casting?.time;this.ready=false;this.active=false;this.mediaId=null;Player.casting=null;await this.call('command','stop').catch(()=>{});if(at!=null&&!Player.el.hidden){try{await Player.resumeFromCast(at);}catch(error){this.showError(error);}}await this.poll();if(Player.ctx&&!Player.el?.hidden)Player.tick();},
};

// All close paths (button, Escape, backdrop and replacement modal) end unused pairing.
{const close=App.closeModal,modal=App.modal,nav=App.nav;const end=()=>{if(document.querySelector('.cast-panel'))Cast.call('pairing',false).catch(()=>{});};App.closeModal=function(...args){end();return close.apply(this,args);};App.modal=function(...args){end();return modal.apply(this,args);};App.nav=function(...args){if(document.querySelector('.cast-panel'))this.closeModal();return nav.apply(this,args);};}
