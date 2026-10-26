/* Read a title's story directly on its poster, without a tracker lookup or navigation. */
'use strict';
const CardSynopsis={
 selector:'#main .card[data-act="anime"]',cache:new Map(),pending:new Map(),activeCard:null,timer:null,
 text(value){return String(value||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\(Source:[^)]*\)/g,'').replace(/\s+/g,' ').trim();},
 async metadata(id){id=String(id);const saved=this.cache.get(id);if(saved&&Date.now()-saved.at<(saved.value?1800000:2500))return saved.value;if(this.pending.has(id))return this.pending.get(id);const task=(async()=>{let value=null;try{const media=id.startsWith('al:')?await AniList.details(id):await Kitsu.animeFull(id);if(media)value={text:this.text(media.synopsis),meta:[media.format||media.subtype,media.year,Number(media.episodes)>0?media.episodes+' eps':''].filter(Boolean).join(' · ')};}catch{}this.cache.set(id,{at:Date.now(),value});if(this.cache.size>160)this.cache.delete(this.cache.keys().next().value);return value;})().finally(()=>this.pending.delete(id));this.pending.set(id,task);return task;},
 collapse(card){const story=card?.querySelector('.card-story');if(!story)return;story.classList.remove('is-expanded');const button=story.querySelector('.card-story-expand');if(button){button.setAttribute('aria-expanded','false');button.textContent='Read synopsis';}},
 async show(card){const poster=card.querySelector('.poster');if(!poster||!card.isConnected)return;const rid=App.renderId,id=card.dataset.id;let story=poster.querySelector('.card-story');if(!story){story=document.createElement('section');story.className='card-story';story.setAttribute('aria-label','Title synopsis');story.innerHTML='<p class="card-story-text">Loading story…</p>';poster.appendChild(story);}card.classList.add('has-card-story');
  let data=card.dataset.synopsis?{text:this.text(card.dataset.synopsis),meta:card.dataset.storyMeta||''}:await this.metadata(id);
  if(!card.isConnected||card.dataset.id!==id||App.stale(rid)||this.activeCard!==card)return;
  const text=data?.text||'A synopsis isn’t available for this title yet.';story.innerHTML=`${data?.meta?`<small class="card-story-meta">${esc(data.meta)}</small>`:''}<p class="card-story-text" tabindex="0">${esc(text)}</p>${text.length>140?'<button type="button" class="card-story-expand" aria-expanded="false">Read synopsis</button>':''}`;
 },
 bind(){
  const schedule=(card,touch=false)=>{if(touch||!card?.querySelector('.poster')||this.activeCard===card)return;clearTimeout(this.timer);this.collapse(this.activeCard);this.activeCard=card;this.timer=setTimeout(()=>this.show(card),300);};
  document.addEventListener('pointerover',event=>schedule(event.target.closest?.(this.selector),event.pointerType==='touch'));
  document.addEventListener('focusin',event=>schedule(event.target.closest?.(this.selector)));
  document.addEventListener('pointerout',event=>{const card=event.target.closest?.(this.selector);if(!card||card.contains(event.relatedTarget)||card.contains(document.activeElement))return;if(this.activeCard===card){clearTimeout(this.timer);this.activeCard=null;}this.collapse(card);});
  document.addEventListener('focusout',event=>{const card=event.target.closest?.(this.selector);if(card&&!card.contains(event.relatedTarget)&&!card.matches(':hover')){this.collapse(card);if(this.activeCard===card){clearTimeout(this.timer);this.activeCard=null;}}});
  document.addEventListener('click',event=>{const story=event.target.closest?.('.card-story');if(!story)return;event.stopPropagation();const button=event.target.closest('.card-story-expand');if(!button)return;event.preventDefault();const expanded=story.classList.toggle('is-expanded');button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Show less':'Read synopsis';},true);
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const card=event.target.closest?.(this.selector);if(card?.querySelector('.card-story.is-expanded')){event.preventDefault();this.collapse(card);}});
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>CardSynopsis.bind());else CardSynopsis.bind();
