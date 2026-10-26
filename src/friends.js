/* AniDeck friends: opt-in profiles and private conversations between accepted friends. */
'use strict';
const Friends={
 timer:null,generation:0,rosterVersion:0,rows:[],messages:[],cursor:null,handle:'',sending:false,pendingSend:null,health:null,me:null,meWho:null,social:{friends:[],incoming:[],outgoing:[]},listMode:'all',requestsAt:0,
 stop(){clearTimeout(this.timer);this.timer=null;this.generation++;this.handle='';this.pendingSend=null;},
 valid(rid,who){return !App.stale(rid)&&Tracker.loggedIn()&&Cloud.ident()===who;},
 async capability(){
  const base=Cloud.base();if(this.health?.base===base&&Date.now()-this.health.at<60000)return this.health.features;
  const r=await httpUncached(base+'/v1/health',{timeout:10000});
  const features=Array.isArray(r.features)?r.features:[];this.health={base,at:Date.now(),features};return features;
 },
 request(path,options){return Cloud.withSession(()=>Cloud.call(path,options));},
 avatar(u){return `<span class="af-avatar">${esc((u.name||u.handle||'?').slice(0,1))}${u.avatar?`<img src="${esc(u.avatar)}" alt="" loading="lazy">`:''}</span>`;},
 person(u,actions=''){return `<article class="af-person"><button class="af-identity" data-act="wfOpen" data-handle="${esc(u.handle)}">${this.avatar(u)}<span><b>${esc(u.name||u.handle)}</b><small>@${esc(u.handle)}</small></span></button><div class="af-person-actions">${actions}</div></article>`;},
 snapshot:null,
 remember(){if(this.me&&this.meWho===Cloud.ident())this.snapshot={who:this.meWho,base:Cloud.base(),at:Date.now(),me:this.me,social:this.social,rows:this.rows};},
 async initialData(){
  const [profile,health,social,inbox]=await Promise.allSettled([Cloud.loadMe(),this.capability(),Cloud.friends(),this.request('/v1/conversations')]);
  if(profile.status==='rejected')throw profile.reason;const me=profile.value;if(!me)return {me};
  if(health.status==='rejected')throw health.reason;const features=health.value;if(!features.includes('messages'))return {me,features};
  if(social.status==='rejected')throw social.reason;if(inbox.status==='rejected')throw inbox.reason;
  return {me,features,friends:social.value,inbox:inbox.value};
 },
 async after(params,rid){
  this.stop();this.me=null;this.meWho=null;const actions=document.querySelector('.af-page-actions');if(actions)actions.hidden=true;const who=Cloud.ident(),box=$('#af-content');if(!box)return;
  const fail=error=>{if(this.valid(rid,who)){this.snapshot=null;this.me=null;this.meWho=null;this.generation++;if(actions)actions.hidden=true;const reauth=error.data?.code==='provider_reauth',unavailable=error.data?.code==='provider_unavailable';box.innerHTML=`<div class="af-empty"><h2>${reauth?'Reconnect to AniDeck Friends':unavailable?'Sign-in verification is temporarily unavailable':'Friends couldn’t load'}</h2><p>${esc(error.data?.error||error.message)}</p><p>${Tracker.name==='AniDeck'?'Your recovery key secures this AniDeck profile.':'AniList or Kitsu confirms your identity.'} Your friends, profile, and messages belong to AniDeck.</p>${reauth?`<button class="btn primary" data-act="friendsReconnect">Reconnect ${esc(Tracker.name)}</button>`:''}<button class="btn" data-act="friendsOpen">Try again</button></div>`;}};
  if(!Cloud.enabled()){box.innerHTML='<div class="af-empty"><h2>Bring your anime friends along</h2><p>Sign in to AniList or Kitsu in Settings → Account to use AniDeck profiles.</p><button class="btn primary" data-act="goAccount">Account settings</button></div>';return;}
  const cached=this.snapshot,warm=cached&&cached.who===who&&cached.base===Cloud.base()&&Cloud.me!==null&&Date.now()-cached.at<30000;
  if(warm){this.me=cached.me;this.meWho=who;this.social=cached.social;this.rows=cached.rows;this.listMode='all';if(actions)actions.hidden=false;this.renderRoster(box,cached.me,cached.social);}
  try{
   const version=this.rosterVersion,{me,features,friends,inbox}=await this.initialData();if(!this.valid(rid,who)||version!==this.rosterVersion)return;
   if(!me){this.snapshot=null;this.me=null;this.meWho=null;if(actions)actions.hidden=true;box.innerHTML='<div class="af-empty"><h2>Your people, on deck.</h2><p>Choose a handle, share your friend code, and compare what you’re watching. Sharing is optional and friends-only by default.</p><button class="btn primary" data-act="wfJoin">Create my AniDeck profile</button></div>';return;}
   if(!features.includes('messages')){this.snapshot=null;this.me=null;this.meWho=null;if(actions)actions.hidden=true;box.innerHTML='<div class="af-empty"><h2>Friends are getting an upgrade</h2><p>The AniDeck cloud needs its messaging update before this screen is available. Your existing friends and profile are still available.</p><button class="btn primary" data-act="profileNav">Open my profile</button></div>';return;}
   if(actions)actions.hidden=false;this.rows=inbox.conversations||[];this.me=me;this.meWho=who;this.social=friends;if(!warm)this.listMode='all';this.requestsAt=Date.now();
   this.remember();if(!warm)this.renderRoster(box,me,friends);else{this.reconcileThread();this.paintList();this.paintRequestBadge();}
   if(params.handle)await this.openThread(params.handle,rid,who);
   this.schedule(rid,who);
  }catch(error){fail(error);}
 },
 renderRoster(box,me,friends){
   box.innerHTML=`<div class="af-layout af-messenger"><aside class="af-sidebar af-roster"><header class="af-roster-head"><div><span class="ad-eyebrow">YOUR CIRCLE</span><h2>Friends <span id="af-friend-count">${friends.friends.length}</span></h2></div></header>
    <label class="af-filter-wrap" id="af-filter-wrap"><span class="sr-only">Search friends</span>${icon('search')}<input id="af-filter" type="search" placeholder="Search your friends" autocomplete="off"></label>
    <div class="af-list-tabs" role="group" aria-label="Filter friends"><button data-act="friendsFilter" data-mode="all" aria-pressed="true">All friends</button><button data-act="friendsFilter" data-mode="unread" aria-pressed="false">Unread <span id="af-unread-count" hidden></span></button></div><div id="af-conversations" aria-label="Friend list"></div>
    <footer class="af-self"><button class="af-self-profile" data-act="profileNav">${this.avatar(me)}<span><b>@${esc(me.handle)}</b><small>Your profile</small></span></button><button class="af-icon-action" data-act="wfSettings" aria-label="Profile privacy" title="Profile privacy">${icon('settings')}</button></footer></aside>
    <section class="af-chat" id="af-chat"><header class="af-welcome-head"><span>${icon('chat')}Direct messages</span><small>Your conversations, on deck</small></header><div class="af-dm-welcome"><span class="af-dm-art" aria-hidden="true">${icon('deck')}<i>${icon('chat')}</i></span><span class="ad-eyebrow">A SPACE FOR YOUR PEOPLE</span><h2>${this.rows.length?'Pick a friend.<br>Start something good.':'Your next great conversation<br>starts with a friend.'}</h2><p>${this.rows.length?'Choose someone from your list to talk about the latest episode, trade recommendations, or plan your next watch.':'Add someone by handle or share your friend code. Once you both accept, your conversation starts here.'}</p></div><footer class="af-welcome-privacy">Only accepted friends can message you.<br><span>AniDeck cloud · Not end-to-end encrypted</span></footer></section></div>`;
   $('#af-filter').oninput=()=>this.paintList();this.paintList();this.paintRequestBadge();
 },
 paintRequestBadge(){if(typeof FriendSignals!=='undefined')FriendSignals.consumeRequests(this.social);const badge=$('#af-request-count');if(badge){badge.textContent=this.social.incoming?.length||'';badge.hidden=!this.social.incoming?.length;}},
 paintList(){
  const box=$('#af-conversations');if(!box)return;const query=($('#af-filter')?.value||'').trim().toLowerCase();
  const count=$('#af-friend-count');if(count)count.textContent=this.rows.length;
  const unread=this.rows.filter(u=>Number(u.unread)>0).length,badge=$('#af-unread-count');if(badge){badge.textContent=unread;badge.hidden=!unread;}
  document.querySelectorAll('.af-list-tabs button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===this.listMode)));
  const rows=this.rows.filter(u=>(String(u.name||'')+' '+u.handle).toLowerCase().includes(query)&&(this.listMode!=='unread'||Number(u.unread)>0));
  box.innerHTML=rows.map(u=>{const at=Number(u.last?.at),stamp=Number.isFinite(at)&&at>0?new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';return `<button class="af-conversation ${u.handle===this.handle?'selected':''}" data-act="friendsMessage" data-handle="${esc(u.handle)}" ${u.handle===this.handle?'aria-current="true"':''}>${this.avatar(u)}<span class="af-conversation-copy"><span><b>${esc(u.name||u.handle)}</b>${stamp?`<time datetime="${new Date(at).toISOString()}">${esc(stamp)}</time>`:''}</span><small>${esc(u.last?.text||'Say hello to @'+u.handle)}</small></span>${u.unread?`<em aria-label="${Number(u.unread)} unread messages">${Number(u.unread)>99?'99+':Number(u.unread)}</em>`:''}</button>`;}).join('')||`<div class="af-roster-empty">${icon(this.listMode==='unread'?'checkCircle':'user')}<b>${query?'No friends found':this.listMode==='unread'?'You’re all caught up':'Your circle starts here'}</b><p>${query?'Try another name or handle.':this.listMode==='unread'?'New messages will appear here.':'Choose Add friends above to invite someone.'}</p></div>`;
 },
 reconcileThread(){
  if(!this.handle||this.rows.some(row=>row.handle===this.handle))return false;
  if(typeof FriendExtras!=='undefined'&&FriendExtras.prefs){FriendExtras.draft();FriendExtras.save().catch(()=>{});FriendExtras.attachment=null;FriendExtras.editing=null;FriendExtras.unreadAnchor=null;}
  this.generation++;this.handle='';this.messages=[];this.cursor=null;this.pendingSend=null;this.threadLoading=false;
  const chat=$('#af-chat');if(chat){chat.inert=false;chat.removeAttribute?.('aria-busy');chat.innerHTML=`<div class="af-dm-welcome"><span class="af-dm-art" aria-hidden="true">${icon('chat')}</span><h2>This conversation is unavailable.</h2><p>Choose another friend to keep the conversation going. Your unsent draft is saved on this PC.</p></div>`;}
  document.querySelector('.af-messenger')?.classList.remove('af-thread-open');if($('#afx-preferences'))App.closeModal();return true;
 },
 async refreshRoster(rid=App.renderId,who=Cloud.ident()){
  const version=this.rosterVersion;const [social,inbox]=await Promise.all([Cloud.friends(),this.request('/v1/conversations')]);if(!this.valid(rid,who)||version!==this.rosterVersion)return;
  this.social=social;this.rows=inbox.conversations||[];this.reconcileThread();this.requestsAt=Date.now();this.paintList();this.paintRequestBadge();this.remember();
 },
 async addDialog(){
  const who=Cloud.ident(),rid=App.renderId,me=this.meWho===who?this.me:await Cloud.loadMe();if(!me||!this.valid(rid,who))return;this.me=me;this.meWho=who;
  App.modal(`<section class="af-tool-panel" id="af-add-panel"><header class="dk-head"><div><span class="ad-eyebrow">MAKE ROOM IN YOUR CIRCLE</span><h2>Add friends</h2></div><button class="icon-btn" data-act="friendsModalClose" aria-label="Close add friends">${icon('close')}</button></header><p class="af-tool-intro">Know someone on AniDeck? Send them a request.</p><form id="af-add"><label for="af-query">Handle or friend code</label><div class="af-tool-input"><span aria-hidden="true">${icon('search')}</span><input id="af-query" placeholder="@handle or friend code" maxlength="40" autocomplete="off" spellcheck="false" required><button class="btn primary" type="submit" id="af-add-send">Send request</button></div><p id="af-add-result" role="status" hidden></p></form><div class="af-tool-divider"><span>or invite someone</span></div><div class="af-invite-code"><div><span class="ad-eyebrow">YOUR FRIEND CODE</span><strong>${esc(me.friendCode)}</strong><small>Find you as @${esc(me.handle)}</small></div><button class="btn ghost" data-act="friendsCopyInvite" data-kind="code">Copy code</button></div><button class="af-copy-invite" data-act="friendsCopyInvite" data-kind="invite">${icon('chat')}Copy an invitation to share ${icon('chev')}</button><p class="af-tool-feedback" id="af-invite-feedback" role="status" hidden></p></section>`,'dk-modal af-tool-modal');
  const panel=$('#af-add-panel'),form=$('#af-add'),input=$('#af-query'),button=$('#af-add-send'),result=$('#af-add-result');let sent='';
  input.oninput=()=>{button.disabled=!input.value.trim()||input.value.trim()===sent;button.textContent='Send request';result.hidden=true;};button.disabled=true;
  form.onsubmit=async event=>{
   event.preventDefault();const query=input.value.trim();if(!query||button.disabled)return;button.disabled=true;input.disabled=true;button.textContent='Sending…';result.hidden=true;
   try{const response=await Cloud.add(query);if(!panel.isConnected||!this.valid(rid,who))return;sent=query;result.textContent=response.status==='accepted'?'You’re now friends. They’re in your friend list.':'Request sent. You can manage it in Requests.';result.hidden=false;button.textContent=response.status==='accepted'?'Added':'Request sent';await this.refreshRoster(rid,who).catch(()=>{});}
   catch(error){if(panel.isConnected&&this.valid(rid,who)){result.textContent=error.data?.error||error.message;result.hidden=false;button.textContent='Try again';button.disabled=false;}}
   finally{if(input.isConnected){input.disabled=false;if(input.value.trim()!==sent)button.disabled=false;}}
  };
  requestAnimationFrame(()=>{if(input.isConnected)input.focus();});
 },
 async copyInvite(kind,button){
  const me=this.meWho===Cloud.ident()?this.me:null;if(!me)return;const text=kind==='code'?me.friendCode:`Add me on AniDeck! My handle is @${me.handle} and my friend code is ${me.friendCode}. Open Friends → Add friends to send me a request.`;
  const panel=button.closest('.af-tool-panel'),feedback=panel?.querySelector('#af-invite-feedback');
  try{await navigator.clipboard.writeText(text);if(feedback?.isConnected){feedback.textContent=kind==='code'?'Friend code copied.':'Invitation copied. Share it wherever your friends are.';feedback.hidden=false;}}
  catch{if(feedback?.isConnected){feedback.textContent='Couldn’t copy. You can select your friend code above and copy it manually.';feedback.hidden=false;}}
 },
 renderRequests(panel){
  const list=panel.querySelector('#af-request-list');if(!list)return;
  const incoming=this.social.incoming||[],outgoing=this.social.outgoing||[];
  const section=(users,type)=>`<section class="af-request-section"><h3>${type==='incoming'?'Received':'Sent'} <span>${users.length}</span></h3>${users.map(u=>`<article class="af-request-row">${this.avatar(u)}<button class="af-request-person" data-act="wfOpen" data-handle="${esc(u.handle)}"><b>${esc(u.name||u.handle)}</b><small>@${esc(u.handle)}</small></button><div>${type==='incoming'?`<button class="btn primary" data-act="friendsRequestAccept" data-handle="${esc(u.handle)}">Accept</button><button class="af-icon-action" data-act="friendsRequestDecline" data-handle="${esc(u.handle)}" aria-label="Decline @${esc(u.handle)}">${icon('close')}</button>`:`<button class="btn ghost" data-act="friendsRequestCancel" data-handle="${esc(u.handle)}">Cancel request</button>`}</div></article>`).join('')}</section>`;
  list.innerHTML=incoming.length||outgoing.length?(incoming.length?section(incoming,'incoming'):'')+(outgoing.length?section(outgoing,'outgoing'):''):`<div class="af-requests-empty">${icon('checkCircle')}<h3>All caught up</h3><p>New requests and invitations you’ve sent will appear here.</p><button class="btn ghost" data-act="friendsFind">Add friends</button></div>`;
 },
 async requestsDialog(){
  const rid=App.renderId,who=Cloud.ident();App.modal(`<section class="af-tool-panel" id="af-requests-panel"><header class="dk-head"><div><span class="ad-eyebrow">INVITATIONS TO YOUR CIRCLE</span><h2>Friend requests</h2></div><button class="icon-btn" data-act="friendsModalClose" aria-label="Close requests">${icon('close')}</button></header><div id="af-request-list"><p class="af-tool-intro" role="status">Loading requests…</p></div><p class="af-tool-feedback" id="af-requests-feedback" role="status" hidden></p></section>`,'dk-modal af-tool-modal');const panel=$('#af-requests-panel');
  try{const social=await Cloud.friends();if(!panel.isConnected||!this.valid(rid,who))return;this.social=social;this.paintRequestBadge();this.renderRequests(panel);}
  catch(error){if(panel.isConnected){const feedback=panel.querySelector('#af-requests-feedback');feedback.textContent=error.data?.error||error.message;feedback.hidden=false;panel.querySelector('#af-request-list').innerHTML='<button class="btn ghost" data-act="friendsRequests">Try again</button>';}}
 },
 async requestAction(action,handle,button){
  const panel=button.closest('#af-requests-panel');if(!panel||panel.dataset.busy==='true')return;const who=Cloud.ident(),rid=App.renderId,feedback=panel.querySelector('#af-requests-feedback');panel.dataset.busy='true';panel.querySelectorAll('[data-act^="friendsRequest"]').forEach(b=>b.disabled=true);button.textContent=action==='accept'?'Accepting…':'Updating…';feedback.hidden=true;
  try{if(action==='accept')await Cloud.accept(handle);else await Cloud.remove(handle);await this.refreshRoster(rid,who);if(!panel.isConnected||!this.valid(rid,who))return;this.renderRequests(panel);feedback.textContent=action==='accept'?'@'+handle+' is now in your friend list.':action==='cancel'?'Request cancelled.':'Request declined.';feedback.hidden=false;}
  catch(error){if(panel.isConnected&&this.valid(rid,who)){this.renderRequests(panel);feedback.textContent=error.data?.error||error.message;feedback.hidden=false;}}
  finally{panel.dataset.busy='false';if(panel.isConnected)panel.querySelectorAll('[data-act^="friendsRequest"]').forEach(b=>b.disabled=false);}
 },
 async openThread(handle,rid=App.renderId,who=Cloud.ident()){
  const generation=++this.generation;
  const box=$('#af-chat');if(!box)return;this.threadLoading=true;box.inert=true;box.setAttribute('aria-busy','true');document.querySelector('.af-messenger')?.classList.add('af-thread-open');
  try{
   const data=await this.request('/v1/messages/'+encodeURIComponent(handle));if(!this.valid(rid,who)||generation!==this.generation)return;
   this.handle=handle;this.messages=data.messages||[];this.cursor=data.nextCursor;this.pendingSend=null;this.paintList();const peer=data.peer;
   box.innerHTML=`<header class="af-chat-head"><button class="af-icon-action af-thread-back" data-act="friendsList" aria-label="Back to friend list">${icon('back')}</button><button class="af-identity" data-act="wfOpen" data-handle="${esc(handle)}">${this.avatar(peer)}<span><b>${esc(peer.name||handle)}</b><small>@${esc(handle)}</small></span></button><div class="af-thread-actions"><button class="btn ghost" data-act="wfOpen" data-handle="${esc(handle)}">View profile ${icon('external')}</button><button class="af-icon-action" data-act="friendsBlock" data-handle="${esc(handle)}" aria-label="Block @${esc(handle)}" title="Block profile">${icon('eyeOff')}</button></div></header><button id="af-older" class="link-btn af-older">Earlier messages</button><div class="af-messages" id="af-messages" role="log" aria-label="Conversation with @${esc(handle)}" aria-live="polite" aria-relevant="additions"></div><p id="af-message-error" role="status"></p><form class="af-compose" id="af-compose"><label class="sr-only" for="af-draft">Message ${esc(handle)}</label><textarea id="af-draft" maxlength="2000" rows="2" placeholder="Message @${esc(handle)}…"></textarea><footer><small><span id="af-char-count">0</span>/2000 <span class="af-compose-shortcut">· Enter to send · Shift + Enter for a new line</span></small><button class="btn primary" id="af-send" disabled>Send ${icon('send')}</button></footer></form><p class="af-dm-security">${icon('info')}Messages are stored on AniDeck cloud · Not end-to-end encrypted</p>`;
   $('#af-compose').onsubmit=e=>{e.preventDefault();this.send(rid,who,generation);};
   $('#af-draft').oninput=()=>{this.pendingSend=null;$('#af-char-count').textContent=$('#af-draft').value.length;$('#af-send').disabled=this.sending||!$('#af-draft').value.trim();};
   $('#af-draft').onkeydown=e=>this.composeKey(e,$('#af-compose'));
   $('#af-older').onclick=()=>this.older(rid,who,generation);
   this.paintMessages(true);this.markRead().catch(()=>{});
  }catch(error){if(this.valid(rid,who)&&generation===this.generation)toast(error.data?.error||error.message,'bad');}
  finally{if(generation===this.generation){this.threadLoading=false;box.inert=false;box.removeAttribute('aria-busy');}}
 },
 composeKey(event,form){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&!event.repeat){event.preventDefault();if(!this.sending)form.requestSubmit();}},
 paintMessages(bottom=false){
  const box=$('#af-messages');if(!box)return;const stick=bottom||box.scrollHeight-box.scrollTop-box.clientHeight<70;
  let previousDay='';
  box.innerHTML=this.messages.map(m=>{const date=new Date(m.at),day=date.toLocaleDateString(),today=new Date().toLocaleDateString(),separator=day!==previousDay?`<div class="af-day-divider"><span>${esc(day===today?'Today':date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}))}</span></div>`:'';previousDay=day;return separator+(m.system?`<div class="af-system-event" data-message-id="${esc(m.id)}" role="note"><span>${icon('clock')}${m.mine?'You':esc(this.rows.find(r=>r.handle===this.handle)?.name||this.handle)} ${esc(m.text.charAt(0).toLowerCase()+m.text.slice(1))}</span><time datetime="${date.toISOString()}">${esc(date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</time></div>`:`<article data-message-id="${esc(m.id)}" class="af-message ${m.mine?'mine':''}" aria-label="${m.mine?'You':'Friend'}"><p>${esc(m.text)}</p><time datetime="${date.toISOString()}">${esc(date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</time></article>`);}).join('')||'<div class="af-message-start">'+icon('chat')+'<b>A new conversation, on deck.</b><p>Say hello. A recommendation is a good place to start.</p></div>';
  $('#af-older').hidden=!this.cursor;if(stick)box.scrollTop=box.scrollHeight;
 },
 async markRead(){const last=[...this.messages].reverse().find(m=>!m.mine),handle=this.handle,who=Cloud.ident();if(last&&handle){await this.request('/v1/messages/'+encodeURIComponent(handle)+'/read',{method:'POST',json:{through:last.id}});if(this.handle===handle&&Cloud.ident()===who){const row=this.rows.find(u=>u.handle===handle);if(row)row.unread=0;this.paintList();}}},
 async older(rid,who,generation){
  if(!this.cursor)return;const button=$('#af-older'),box=$('#af-messages'),height=box.scrollHeight;button.disabled=true;
  try{const data=await this.request('/v1/messages/'+encodeURIComponent(this.handle)+'?before='+encodeURIComponent(this.cursor));if(!this.valid(rid,who)||generation!==this.generation)return;this.messages=[...data.messages,...this.messages];this.cursor=data.nextCursor;this.paintMessages();box.scrollTop=box.scrollHeight-height;}catch(error){if(this.valid(rid,who)&&generation===this.generation)$('#af-message-error').textContent=error.data?.error||error.message;}finally{if(button.isConnected)button.disabled=false;}
 },
 async send(rid,who,generation){
  const input=$('#af-draft'),text=input?.value.trim(),handle=this.handle;if(!text||this.sending)return;
  const button=$('#af-send');this.sending=true;button.disabled=true;input.disabled=true;$('#af-message-error').textContent='';
  const pending=this.pendingSend?.text===text&&this.pendingSend.handle===handle?this.pendingSend:{handle,text,clientId:crypto.randomUUID()};this.pendingSend=pending;
  try{
   const data=await this.request('/v1/messages/'+encodeURIComponent(handle),{method:'POST',json:pending});if(!this.valid(rid,who)||generation!==this.generation)return;
   if(!this.messages.some(m=>m.id===data.message.id))this.messages.push(data.message);this.pendingSend=null;input.value='';$('#af-char-count').textContent='0';this.paintMessages(true);const row=this.rows.find(u=>u.handle===handle);if(row){row.last=data.message;row.unread=0;}this.paintList();
  }catch(error){if(this.valid(rid,who)&&generation===this.generation)$('#af-message-error').textContent=(error.data?.error||error.message)+' Your draft is kept; you can retry.';}
  finally{this.sending=false;if(input.isConnected){input.disabled=false;button.disabled=!input.value.trim();input.focus();}}
 },
 schedule(rid,who){clearTimeout(this.timer);this.timer=setTimeout(async()=>{
  if(!this.valid(rid,who)||App.view!=='friends')return;
  try{if(!document.hidden){const generation=this.generation,handle=this.handle,version=this.rosterVersion,thread=handle&&!this.sending&&!this.threadLoading,refresh=Date.now()-this.requestsAt>4000;
   const [inbox,data,social]=await Promise.all([this.request('/v1/conversations'),thread?this.request('/v1/messages/'+encodeURIComponent(handle)):null,refresh?Cloud.friends():null]);
   if(!this.valid(rid,who)||version!==this.rosterVersion)return;this.pollFailed=false;this.rows=inbox.conversations||[];this.reconcileThread();this.paintList();
   if(social){this.social=social;this.requestsAt=Date.now();this.paintRequestBadge();}this.remember();
   if(data&&generation===this.generation&&handle===this.handle&&!this.sending){const known=new Map(this.messages.map(m=>[m.id,m]));let changed=false;for(const m of data.messages){if(!known.has(m.id)||JSON.stringify(known.get(m.id))!==JSON.stringify(m))changed=true;known.set(m.id,m);}if(changed){this.messages=[...known.values()].sort((a,b)=>a.at-b.at);this.paintMessages();await this.markRead();}}
  }}catch(error){this.pollFailed=true;const box=$('#af-message-error');if(this.valid(rid,who)&&box)box.textContent='Connection interrupted. Retrying…';}
  finally{if(this.valid(rid,who)&&App.view==='friends')this.schedule(rid,who);}
 },this.pollFailed?5000:(this.handle?1000:2000));},
 blockedEmpty(){return `<div class="af-blocked-empty"><span class="af-blocked-emblem" aria-hidden="true">${icon('user')}<i>${icon('check')}</i></span><h3>No blocked profiles</h3><p>People you block will appear here.<br>You’re in control of who’s in your circle.</p></div>`;},
 async blocked(){
  const who=Cloud.ident(),rid=App.renderId;
  App.modal(`<section class="af-blocked"><header class="dk-head"><div class="af-blocked-heading"><span class="af-blocked-mark" aria-hidden="true">${icon('eyeOff')}</span><div><span class="ad-eyebrow">YOUR CIRCLE · YOUR CHOICE</span><h2>Blocked profiles <span id="af-blocked-count" hidden></span></h2></div></div><button type="button" class="icon-btn" data-act="friendsModalClose" aria-label="Close blocked profiles">${icon('close')}</button></header><p class="af-blocked-intro">Manage who can reach you. Blocked people can’t message you or view your profile.</p><div id="af-blocked-list" aria-busy="true"><div class="af-blocked-loading" role="status">${icon('refresh')}Loading blocked profiles…</div></div><p class="af-blocked-feedback" id="af-blocked-feedback" role="status" hidden></p><footer class="af-blocked-footer"><p>${icon('info')}Unblocking won’t restore a friendship.</p><button type="button" class="btn primary" data-act="friendsModalClose">Done</button></footer></section>`,'dk-modal af-blocked-modal');
  const box=$('#af-blocked-list'),count=$('#af-blocked-count');
  try{
   const data=await this.request('/v1/blocks');if(!box.isConnected||!this.valid(rid,who))return;
   const users=data.users||[];count.textContent=users.length;count.hidden=!users.length;
   box.innerHTML=users.length?users.map(u=>`<article class="af-blocked-row">${this.avatar(u)}<div class="af-blocked-person"><b>${esc(u.name||u.handle)}</b><small>@${esc(u.handle)}</small></div><button type="button" class="btn ghost" data-act="friendsUnblock" data-handle="${esc(u.handle)}" aria-label="Unblock @${esc(u.handle)}">Unblock</button></article>`).join(''):this.blockedEmpty();
  }catch(error){if(box.isConnected&&this.valid(rid,who))box.innerHTML=`<div class="af-blocked-empty"><span class="af-blocked-emblem" aria-hidden="true">${icon('info')}</span><h3>Couldn’t load blocked profiles</h3><p>${esc(error.data?.error||error.message)}</p><button type="button" class="btn ghost" data-act="friendsBlocked">Try again</button></div>`;}
  finally{if(box.isConnected)box.removeAttribute('aria-busy');}
 },
 async unblock(handle,button){
  if(!button||button.disabled)return;const box=$('#af-blocked-list'),feedback=$('#af-blocked-feedback'),who=Cloud.ident(),rid=App.renderId;
  button.disabled=true;button.textContent='Unblocking…';if(feedback)feedback.hidden=true;
  try{
   await this.request('/v1/blocks/'+encodeURIComponent(handle),{method:'DELETE'});
   if(!box?.isConnected||!button.isConnected||!this.valid(rid,who))return;
   button.closest('.af-blocked-row')?.remove();const remaining=box.querySelectorAll('.af-blocked-row').length,count=$('#af-blocked-count');
   if(count){count.textContent=remaining;count.hidden=!remaining;}if(!remaining)box.innerHTML=this.blockedEmpty();
   feedback.textContent='@'+handle+' is unblocked. You can send a new friend request when you’re ready.';feedback.hidden=false;
   const next=box.querySelector('[data-act="friendsUnblock"]')||document.querySelector('.af-blocked-footer button');next?.focus();
  }catch(error){if(feedback?.isConnected&&this.valid(rid,who)){feedback.textContent=error.data?.error||error.message;feedback.hidden=false;}}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Unblock';}}
 },
 async titleActivity(rid){
  const who=Cloud.ident(),box=$('#show-social');if(!box)return;
  if(!Cloud.enabled()){box.innerHTML='<div class="empty">Sign in to AniList or Kitsu to connect with AniDeck friends.</div>';return;}
  try{
   const [me,features]=await Promise.all([Cloud.loadMe(),this.capability()]);if(!this.valid(rid,who))return;
   if(!me){box.innerHTML='<div class="empty">See what your AniDeck friends think of this title.<br><br><button class="btn primary" data-act="friendsOpen">Set up AniDeck friends</button></div>';return;}
   if(!features.includes('media-friends')){box.innerHTML='<div class="empty">Title activity needs the AniDeck cloud update. Your friends are available on your profile.</div>';return;}
   const ctx=App.showCtx||{},al=App.showAl||{},match=ctx.match||{};
   const ids=[al.id&&'al:'+al.id,match.id&&String(match.id),ctx.id].filter(Boolean),keys=[typeof al.title==='string'?al.title:al.title?.english,al.title?.romaji,match.title,ctx.series?.Name].filter(Boolean);
   if(!ids.length){box.innerHTML='<div class="empty">Open this title’s details to find friends’ activity.</div>';return;}
   const data=await this.request('/v1/media/'+encodeURIComponent(ids[0])+'/friends?ids='+encodeURIComponent(ids.join(','))+'&keys='+encodeURIComponent(keys.join(',')));if(!this.valid(rid,who))return;
   box.innerHTML=`<div class="social-head"><span class="muted small">Your accepted AniDeck friends</span><span class="spacer"></span><button class="btn ghost sm" data-act="friendsOpen">Friends & messages</button></div><div class="af-title-friends">${data.friends.map(u=>this.person(u,`<span class="af-note">${esc(STATUS_LABELS[u.status]||u.status)} · ${u.progress}${u.episodes?'/'+u.episodes:''} episodes${u.score?' · ★ '+u.score:''}</span><button class="btn sm" data-act="friendsMessage" data-handle="${esc(u.handle)}">Message</button>`)).join('')||'<div class="empty">None of your AniDeck friends have shared this title yet.</div>'}</div>`;
  }catch(error){if(this.valid(rid,who))box.innerHTML=`<div class="empty">${esc(error.data?.error||error.message)}</div>`;}
 }
};
Views.friends=async()=>`<div class="page af-page af-messenger-page"><header class="af-page-head"><div class="af-page-title"><span class="af-title-mark" aria-hidden="true">${icon('deck')}</span><div><span class="ad-eyebrow">YOUR PEOPLE, ON DECK</span><h1>Friends</h1></div></div><div class="af-page-actions" hidden><button class="btn ghost" data-act="friendsRequests">${icon('user')}Requests <span id="af-request-count" hidden></span></button><button class="btn primary" data-act="friendsFind">${icon('plus')}Add friends</button><button class="af-icon-action" data-act="friendsBlocked" aria-label="Blocked profiles" title="Blocked profiles">${icon('eyeOff')}</button></div></header><div id="af-content"><div class="af-empty" role="status">Loading friends…</div></div></div>`;
Views.friendsAfter=(params,rid)=>Friends.after(params,rid);
{
 const nav=App.nav,act=App.act;
 App.nav=function(...args){Friends.stop();return nav.apply(this,args);};
 App.act=async function(name,d,el){
  if(!name.startsWith('friends'))return act.call(this,name,d,el);
  try{
   if(name==='friendsOpen')return this.nav('friends');
   if(name==='friendsFind')return Friends.addDialog();
   if(name==='friendsList'){document.querySelector('.af-messenger')?.classList.remove('af-thread-open');return;}
   if(name==='friendsRequests')return Friends.requestsDialog();
   if(name==='friendsFilter'){Friends.listMode=d.mode==='unread'?'unread':'all';Friends.paintList();return;}
   if(name==='friendsCopyInvite')return Friends.copyInvite(d.kind,el);
   if(name==='friendsRequestAccept')return Friends.requestAction('accept',d.handle,el);
   if(name==='friendsRequestDecline')return Friends.requestAction('decline',d.handle,el);
   if(name==='friendsRequestCancel')return Friends.requestAction('cancel',d.handle,el);
   if(name==='friendsReconnect'){const anilist=Cloud.provider()==='anilist';if(Cloud.provider()==='anideck')return this.localRecovery();Cloud.session=null;Cloud.me=undefined;Cloud.authPending=null;await window.native.setSecret('anideckCloud',null);return anilist?this.anilistLogin():this.kitsuLogin();}
   if(name==='friendsMessage'){if(this.view==='friends')return Friends.openThread(d.handle);return this.nav('friends',{handle:d.handle});}
   if(name==='friendsBlocked')return Friends.blocked();
   if(name==='friendsModalClose')return this.closeModal();
   if(name==='friendsBlock'){
    if(el?.disabled||!confirm(`Block @${d.handle}? This removes the friendship and prevents messages and profile access.`))return;
    const who=Cloud.ident(),rid=this.renderId,panel=el?.closest('.af-tool-panel');if(el)el.disabled=true;
    try{await Friends.request('/v1/blocks',{method:'POST',json:{to:d.handle}});if(!Friends.valid(rid,who))return;
     Friends.snapshot=null;Friends.rosterVersion++;Friends.rows=Friends.rows.filter(user=>user.handle!==d.handle);
     for(const key of ['friends','incoming','outgoing'])Friends.social[key]=(Friends.social[key]||[]).filter(user=>user.handle!==d.handle);
     Friends.paintList();Friends.paintRequestBadge();
     if(Friends.handle===d.handle){Friends.stop();Friends.messages=[];Friends.cursor=null;const chat=$('#af-chat');if(chat)chat.innerHTML='<div class="af-empty"><h2>Profile blocked</h2><p>Choose another friend to continue chatting.</p></div>';document.querySelector('.af-messenger')?.classList.remove('af-thread-open');}
     if(panel?.isConnected)this.closeModal();
     if(this.view==='friends')return Friends.after({},rid);return this.nav('friends');
    }finally{if(el?.isConnected)el.disabled=false;}
   }
   if(name==='friendsUnblock')return Friends.unblock(d.handle,el);
  }catch(error){toast(error.data?.error||error.message,'bad');}
 };
 const watcherAfter=Views.watcherAfter;
 Views.watcherAfter=async function(params,rid){await watcherAfter.call(this,params,rid);if(App.stale(rid))return;const friend=$('#wf-friend-btn');if(friend?.dataset.act==='wfRemoveAsk')friend.insertAdjacentHTML('afterend',`<button class="btn primary ad2-btn" data-act="friendsMessage" data-handle="${esc(params.handle)}">${icon('chat')}Message</button>`);};
}
