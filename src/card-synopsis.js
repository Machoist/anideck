/* Read a title's story directly on its poster, without a tracker lookup or navigation. */
'use strict';
const CardSynopsis={
 selector:'#main .card[data-act="anime"]',cache:new Map(),pending:new Map(),activeCard:null,timer:null,keyboard:false,scrollingUntil:0,
 text(value){return String(value||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\(Source:[^)]*\)/g,'').replace(/\s+/g,' ').trim();},
 async metadata(id,seed={}){
  id=String(id);const saved=this.cache.get(id);
  const useful=saved?.value?.text&&!TitleSynopsis.isStub(saved.value.text);
  if(saved&&Date.now()-saved.at<(useful?1800000:2500))return saved.value;
  if(this.pending.has(id))return this.pending.get(id);
  const task=(async()=>{
   const read=async loader=>{try{return await loader();}catch{return null;}};
   const kitsu=async kid=>(await read(()=>Kitsu.animeFull(kid)))||(await read(()=>Kitsu.anime(kid)));
   let media=id.startsWith('al:')?await read(()=>AniList.details(id)):await kitsu(id),alternate=null;
   let synopsis=TitleSynopsis.choose(seed.synopsis,media?.synopsis);
   if(TitleSynopsis.isStub(synopsis)){
    if(id.startsWith('al:')){
     const kid=await read(()=>AniList.kitsuIdFor(media?.id||Number(id.slice(3)),media?.malId||seed.mal||null));
     if(kid)alternate=await kitsu(kid);
    }else alternate=await read(()=>AniList.details(id));
    synopsis=TitleSynopsis.choose(synopsis,alternate?.synopsis);
    if(TitleSynopsis.isStub(synopsis)){
     const mapped=id.startsWith('al:')?media:alternate;
     const resolved=await read(()=>TitleSynopsis.resolve(id,synopsis,alternate?.synopsis,mapped));
     synopsis=resolved?.text||synopsis;
    }
   }
   const info=media||alternate,value=info||!TitleSynopsis.isStub(synopsis)?{text:this.text(synopsis),meta:info?[info.format||info.subtype,info.year,Number(info.episodes)>0?info.episodes+' eps':''].filter(Boolean).join(' · '):seed.storyMeta||''}:null;
   this.cache.set(id,{at:Date.now(),value});if(this.cache.size>160)this.cache.delete(this.cache.keys().next().value);return value;
  })().finally(()=>this.pending.delete(id));this.pending.set(id,task);return task;
 },
 collapse(card){card?.classList.remove('story-active');const story=card?.querySelector('.card-story');if(!story)return;story.classList.remove('is-expanded');const button=story.querySelector('.card-story-expand');if(button){button.setAttribute('aria-expanded','false');button.textContent=button.classList.contains('card-story-retry')?'Try again':'Read synopsis';}},
 async show(card){const poster=card.querySelector('.poster');if(!poster||!card.isConnected)return;const rid=App.renderId,id=card.dataset.id;let story=poster.querySelector('.card-story');if(!story){story=document.createElement('section');story.className='card-story';story.setAttribute('aria-label','Title synopsis');story.innerHTML='<p class="card-story-text">Loading story…</p>';poster.appendChild(story);}card.classList.add('has-card-story');if(this.activeCard===card)card.classList.add('story-active');
  let data=card.dataset.synopsis&&!TitleSynopsis.isStub(card.dataset.synopsis)?{text:this.text(card.dataset.synopsis),meta:card.dataset.storyMeta||''}:await this.metadata(id,card.dataset);
  if(!card.isConnected||card.dataset.id!==id||App.stale(rid)||this.activeCard!==card)return;
  const ready=!!data?.text&&!TitleSynopsis.isStub(data.text),text=ready?data.text:'Couldn’t load a full synopsis.';story.innerHTML=`${data?.meta?`<small class="card-story-meta">${esc(data.meta)}</small>`:''}<p class="card-story-text" tabindex="0">${esc(text)}</p>${ready?(text.length>140?'<button type="button" class="card-story-expand" aria-expanded="false">Read synopsis</button>':''):'<button type="button" class="card-story-expand card-story-retry">Try again</button>'}`;
 },
 warmVisible(){
  const main=document.getElementById('main');if(!main||typeof IntersectionObserver==='undefined'||typeof MutationObserver==='undefined')return;
  let rid=App.renderId,remaining=6,seen=new WeakSet(),queue=[],running=0,scheduled=false;
  const pump=()=>{while(running<2&&queue.length){const item=queue.shift();if(item.rid!==App.renderId||!item.card.isConnected||AniList.canPrefetch?.()===false)continue;running++;this.metadata(item.card.dataset.id,item.card.dataset).finally(()=>{running--;pump();});}};
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;observer.unobserve(entry.target);if(remaining<=0||(entry.target.dataset.synopsis&&!TitleSynopsis.isStub(entry.target.dataset.synopsis)))continue;remaining--;queue.push({card:entry.target,rid:App.renderId});}pump();},{root:main,threshold:.1});
  const scan=()=>{scheduled=false;if(rid!==App.renderId){rid=App.renderId;remaining=6;seen=new WeakSet();queue=[];observer.disconnect();}for(const card of main.querySelectorAll('.card[data-act="anime"]')){if(seen.has(card)||!card.querySelector('.poster'))continue;seen.add(card);if(TitleSynopsis.isStub(card.dataset.synopsis))observer.observe(card);}};
  new MutationObserver(()=>{if(!scheduled){scheduled=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(scan);else scan();}}).observe(main,{childList:true,subtree:true});scan();
 },
 bind(){
  this.warmVisible();
  const schedule=(card,touch=false)=>{if(touch||Date.now()<this.scrollingUntil||!card?.querySelector('.poster')||this.activeCard===card)return;clearTimeout(this.timer);this.collapse(this.activeCard);this.activeCard=card;this.show(card);};
  document.addEventListener('pointerover',event=>schedule(event.target.closest?.(this.selector),event.pointerType==='touch'));
  document.addEventListener('keydown',event=>{if(event.key==='Tab'||event.key.startsWith('Arrow'))this.keyboard=true;});
  document.addEventListener('pointerdown',event=>{this.keyboard=false;if(this.activeCard&&!this.activeCard.contains(event.target)){this.collapse(this.activeCard);this.activeCard=null;}},{passive:true});
  document.addEventListener('focusin',event=>{if(this.keyboard||event.target.matches?.(':focus-visible'))schedule(event.target.closest?.(this.selector));});
  document.addEventListener('pointerout',event=>{const card=event.target.closest?.(this.selector);if(!card||card.contains(event.relatedTarget)||(this.keyboard&&card.contains(document.activeElement)))return;if(this.activeCard===card){clearTimeout(this.timer);this.activeCard=null;}this.collapse(card);});
  document.addEventListener('focusout',event=>{const card=event.target.closest?.(this.selector);if(card&&!card.contains(event.relatedTarget)&&!card.matches(':hover')){this.collapse(card);if(this.activeCard===card){clearTimeout(this.timer);this.activeCard=null;}}});
  document.addEventListener('scroll',event=>{if(event.target.closest?.('.card-story'))return;this.scrollingUntil=Date.now()+140;if(this.activeCard){this.collapse(this.activeCard);this.activeCard=null;}},{capture:true,passive:true});
  document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')schedule(event.target.closest?.(this.selector));},{passive:true});
  window.addEventListener('blur',()=>{this.collapse(this.activeCard);this.activeCard=null;});
  document.addEventListener('click',event=>{const story=event.target.closest?.('.card-story');if(!story)return;event.stopPropagation();const button=event.target.closest('.card-story-expand');if(!button)return;event.preventDefault();if(button.classList.contains('card-story-retry')){const card=story.closest(this.selector);if(card){story.innerHTML='<p class="card-story-text">Loading story…</p>';this.cache.delete(String(card.dataset.id));this.show(card);}return;}const expanded=story.classList.toggle('is-expanded');button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Show less':'Read synopsis';},true);
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const card=event.target.closest?.(this.selector);if(card?.querySelector('.card-story.is-expanded')){event.preventDefault();this.collapse(card);}});
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>CardSynopsis.bind());else CardSynopsis.bind();
