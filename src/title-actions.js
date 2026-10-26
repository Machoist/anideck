/* Shared quick actions for poster cards and compact ranked titles. */
'use strict';
const TitleActions={
 menu:null,sequence:0,
 selector:'#main .card[data-act="anime"],#main .card[data-act="series"],#main .card[data-act="movie"],#main .mz-tile[data-act="anime"],#main .rel-card[data-act="anime"],#main .sch-card[data-act="anime"],#main .wk2-card[data-act="anime"]',
 valid(data,rid){return !App.stale(rid)&&Tracker.svc===data.service&&data.service?.userId===data.userId;},
 title(data,card){return data.al?.title||data.k?.title||data.lib?.Name||card.querySelector('.card-title,.mz-tile-text b')?.textContent||'Anime';},
 target(data,entry){const status=String(data.al?.status||data.k?.status||'').replaceAll('_',' ').toLowerCase(),next=data.al?.next,total=Number(data.al?.episodes||data.k?.episodes)||0,progress=Number(entry?.progress)||0;
  if(['not yet released','unreleased','tba','upcoming'].includes(status)||(next?.episode===1&&next.at>Date.now()))return {error:'This title hasn’t started airing yet.'};
  if(total&&progress>=total)return {error:'All episodes are logged. Open details to choose an episode to rewatch.'};
  const episode=progress+1;if(next?.at>Date.now()&&episode>=next.episode)return {error:'You’re caught up. The next episode hasn’t aired yet.'};return {episode,total,movie:String(data.al?.format||data.k?.subtype||'').toLowerCase()==='movie'};
 },
 async watch(data,card,rid=App.renderId){if(!this.valid(data,rid)||this.playing)return;this.playing=true;try{
  const entry=Tracker.loggedIn()&&data.trackerId?await Tracker.entry(data.trackerId):null;if(!this.valid(data,rid))return;
  const target=this.target(data,entry);if(target.error)return toast(target.error);let titles=[];try{titles=JSON.parse(data.d.titles||'[]');}catch{}
  const lib=data.lib||App.libIndex?.find({id:data.id,titles});this.close();HoverPreview.hide();
  if(lib){if(lib.Type==='Movie')return await App.playMovie(lib.Id);const season=data.d.season??App.librarySeason?.(lib,{id:data.id,titles});if(season!=null){const result=await Jellyfin.call('/Shows/'+lib.Id+'/Episodes'+qs({userId:Jellyfin.userId,season,EnableUserData:true}));if(!this.valid(data,rid))return;const ep=result.Items?.find(e=>!e.UserData?.Played);if(!ep)return toast('This season is watched. Open details to choose an episode.');return await App.playEpisode(ep.Id,lib.Id);}return await App.playShow(lib.Id);}
  if(!data.id)throw Error('Open this title’s details to match it before watching.');return await App.playRemoteEpisode({title:this.title(data,card),episodeNum:target.episode,kitsuId:data.id,poster:data.k?.poster||data.al?.cover||'',movie:target.movie,total:target.total});
 }catch(error){toast(error.message||'Couldn’t load the next episode. Try again.','bad');}finally{this.playing=false;}},
 close(focus=false){this.sequence++;const menu=this.menu;this.menu=null;menu?.element.remove();if(focus&&menu?.card.isConnected)menu.card.focus();},
 position(menu,x,y){const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';},
 saved:new Map(),
 seed(card){const d={...card.dataset},service=Tracker.svc,userId=service?.userId,lib=['series','movie'].includes(d.act)?App.itemById(d.id):null;let id=d.act==='anime'?String(d.id):null;
  if(lib){const match=App.matches?.[Matcher.key(d.id,d.act==='movie'?1:d.season??1)];if(match&&!match.none)id=String(match.id);}
  let trackerId=id;if(id&&service===AniList&&!id.startsWith('al:')&&AniList.idCache?.[id])trackerId='al:'+AniList.idCache[id];
  const cached=(service?.coll||[]).find(e=>String(e.anime?.id)===trackerId),saved=this.saved.get((service===AniList?'al:':'k:')+userId+':'+id),entry=d.listStatus?{status:d.listStatus,progress:Number(d.listProgress)||0}:cached||((saved&&Date.now()-saved.at<30000)?saved.entry:null);
  const title=card.querySelector('.card-title,.mz-tile-text b')?.textContent||lib?.Name||'Anime',poster=card.querySelector('img')?.getAttribute('src')||'',episodes=Number(d.total)||0;
  return {d,service,userId,lib,id,trackerId,entry:entry||null,entryKnown:!!entry,k:{title,poster,episodes},al:null};
 },
 async trackerId(data){let id=data.trackerId;if(!id)throw Error('Match this library title from its details before updating your list.');if(data.service!==AniList&&Tracker.name!=='AniDeck'&&String(id).startsWith('al:'))id=await AniList.kitsuIdFor(String(id).slice(3),null);if(!id)throw Error('Couldn’t match this title to your tracker.');return id;},
 menuStart(listOnly=false,data={},options={}){return `${listOnly?'':`<button role="menuitem" data-option="open">${icon('info')}Open details</button><button role="menuitem" data-option="watch">${icon('play','fill')}Play next episode</button>`}<div class="ta-menu-extra">${this.menuItems(data,{...options,listOnly})}</div><p class="ta-menu-error" role="status" hidden></p>`;},
 menuItems(data,{listOnly=false,selectable=false}={}){const labels={current:'Watching',planned:'Planning',completed:'Completed',on_hold:'Paused',dropped:'Dropped'};return `${!listOnly&&data.id?`<button role="menuitem" data-option="deck">${icon('deck')}Add to a deck</button>`:''}${!listOnly&&selectable?`<button role="menuitem" data-option="select">${icon('check')}Select title</button>`:''}${Tracker.loggedIn()?`<div class="ta-menu-label">YOUR ${esc(Tracker.name.toUpperCase())} LIST</div>${Object.entries(labels).map(([status,label])=>`<button role="menuitemradio" aria-checked="${data.entry?.status===status}" data-option="status" data-status="${status}"><span>${data.entry?.status===status?icon('check'):''}</span>${label}</button>`).join('')}<button role="menuitem" data-option="edit">${icon('pencil')}Edit progress & rating</button>`:'<span class="ta-menu-loading">Connect a tracker to manage your list.</span>'}`;},
 async open(card,x,y,{listOnly=false}={}){this.close();HoverPreview.hide();const rid=App.renderId,data=this.seed(card),element=document.createElement('section');element.className='ta-menu'+(listOnly?' ta-menu-list':'');element.tabIndex=-1;element.setAttribute('role','menu');element.setAttribute('aria-label',listOnly?'List status and progress':'Title actions');element.innerHTML=this.menuStart(listOnly,data,{selectable:!!card.closest('[data-aid]')?.querySelector('[data-sel]')});document.body.append(element);this.menu={card,element};this.position(element,x,y);(element.querySelector('button')||element).focus();
  const open=()=>{this.close();App.act(card.dataset.act,{...card.dataset},card);};let busy=false;
  element.onclick=async event=>{const button=event.target.closest('button[data-option]');if(!button||button.disabled||busy)return;const option=button.dataset.option;if(option==='open')return open();const error=element.querySelector('.ta-menu-error');error.hidden=true;
   if(!this.valid(data,rid)){this.close();return;}

   if(option==='select'){this.close();card.closest('[data-aid]')?.querySelector('[data-sel]')?.click();return;}
   busy=true;element.querySelectorAll('button').forEach(b=>b.disabled=true);try{
    if(option==='watch'){const full=await HoverPreview.load(card);if(!this.valid(data,rid))return;return await this.watch(full,card,rid);}
    if(option==='deck'){await DeckStore.load();if(!this.valid(data,rid))return;this.close();return DeckUI.picker({id:data.id,title:this.title(data,card),poster:data.k?.poster||data.al?.cover||'',episodes:data.al?.episodes||data.k?.episodes||0,genres:data.al?.genres||data.k?.genres||[]});}
    if(option==='edit'){const id=await this.trackerId(data);if(!this.valid(data,rid))return;this.close();return App.editEntry(id,data.al?.episodes||data.k?.episodes||0,this.title(data,card),card);}
    if(option==='status'){const id=await this.trackerId(data);if(!this.valid(data,rid))return;await Tracker.setStatus(id,button.dataset.status);if(!this.valid(data,rid))return;this.saved.set((data.service===AniList?'al:':'k:')+data.userId+':'+data.id,{at:Date.now(),entry:{...data.entry,status:button.dataset.status}});this.close();toast('Moved to '+button.textContent.trim(),'good');App.refresh();}
   }catch(e){if(element.isConnected){error.hidden=false;error.textContent=e.message||'Couldn’t save. Please try again.';}}finally{busy=false;if(element.isConnected)element.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  element.onkeydown=event=>{const buttons=[...element.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();this.close(true);}else if(['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowUp'||event.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}};

 },
 bind(){
  const nav=App.nav;App.nav=function(...args){TitleActions.close();HoverPreview.hide();return nav.apply(this,args);};
  document.addEventListener('contextmenu',event=>{if(event.defaultPrevented)return;const card=event.target.closest?.(this.selector);if(!card)return;event.preventDefault();this.open(card,event.clientX,event.clientY);});
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-ta]');if(!button)return;const card=button.closest('[data-act][data-id]');if(!card)return;event.preventDefault();event.stopPropagation();const r=button.getBoundingClientRect();if(button.dataset.ta==='menu')this.open(card,r.right,r.bottom+6,{listOnly:true});else{const rid=App.renderId;button.disabled=true;button.setAttribute('aria-busy','true');HoverPreview.load(card).then(data=>this.watch(data,card,rid)).catch(error=>toast(error.message,'bad')).finally(()=>{if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');}});}},true);
  document.addEventListener('keydown',event=>{const card=event.target.closest?.(this.selector);if(event.key==='Escape')return this.close(true);if(!card)return;if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const r=card.getBoundingClientRect();this.open(card,r.left+16,r.top+20);}else if(event.target===card&&event.key==='Enter'){event.preventDefault();App.act(card.dataset.act,{...card.dataset},card);}});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('.ta-menu'))this.close();});document.addEventListener('scroll',()=>this.close(),true);window.addEventListener('blur',()=>this.close());window.addEventListener('resize',()=>this.close());
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>TitleActions.bind());else TitleActions.bind();
