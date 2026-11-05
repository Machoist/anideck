/* Delayed Home reads update their own slots; they are not a new navigation. */
const HomeRefresh={
  parts(root){const parts=new Map();for(const el of root.querySelectorAll('[data-home-slot]')){const key='slot:'+el.dataset.homeSlot;if(parts.has(key))throw Error('Duplicate Home slot');parts.set(key,el);}return parts;},
  signature(el){const queue=el.dataset.homeSlot==='hero'&&el.querySelector('#yn');if(queue){try{return JSON.stringify(JSON.parse(queue.dataset.queue).map(({thumb,resolvedBackdrop,...item})=>item));}catch{}}const carousel=el.querySelector('#carousel');if(carousel?.querySelectorAll)return 'spotlight:'+JSON.stringify([...carousel.querySelectorAll('.slide')].map(slide=>[slide.dataset.kid||'',slide.dataset.lib||'']));return el.outerHTML;},
  rect(el){if(el.firstElementChild&&el.lastElementChild){const first=el.firstElementChild.getBoundingClientRect(),last=el.lastElementChild.getBoundingClientRect();return {top:first.top,bottom:last.bottom};}return el.getBoundingClientRect();},
  snapshot(html){const template=document.createElement('template');template.innerHTML=html;return this.parts(template.content);},
  record(batch,html){batch.homeMarkup=new Map([...this.snapshot(html)].map(([key,el])=>[key,this.signature(el)]));},
  current(batch){return HomeReads.active===batch&&App.view==='home'&&!App.stale(batch.rid)&&batch.scope===HomeReads.scope();},
  async refresh(batch){
    if(!this.current(batch)||batch.updating)return;batch.updating=true;let quiet=false;
    try{
      batch.nextRid=batch.rid;const html=await Views.home(App.params,batch.rid);if(!this.current(batch))return;
      if(!batch.homeMarkup)throw Error('Home snapshot missing');
      const root=document.getElementById('main'),live=this.parts(root),next=this.snapshot(html),changed=new Set();
      // One visual anchor, read once before and once after changes, never during input.
      const viewport=root.getBoundingClientRect(),anchor=[...live.entries()].find(([,el])=>{const r=this.rect(el);return r.bottom>viewport.top&&r.top<viewport.bottom;});
      const anchorTop=anchor&&this.rect(anchor[1]).top;
      App.renderQuiet=true;quiet=true;
      for(const [key,el] of next){
        const previous=live.get(key),markup=this.signature(el);
        if(!previous||batch.homeMarkup.get(key)===markup)continue;
        // Dashboard widgets fill themselves; rebuilding them would discard live state.
        if(previous.querySelector('#ad-dashboard'))continue;
        if(previous.contains(document.activeElement)){
          if(!previous._homeRetry){previous._homeRetry=true;previous.addEventListener('focusout',()=>queueMicrotask(()=>{previous._homeRetry=false;if(this.current(batch))HomeReads.schedule(batch);}),{once:true});}
          continue;
        }
        previous.replaceWith(el);batch.homeMarkup.set(key,markup);changed.add(key);
      }
      if(anchor&&changed.size){const after=this.parts(root).get(anchor[0]);if(after){const delta=this.rect(after).top-anchorTop;if(Math.abs(delta)>1)root.scrollTop+=delta;}}
      if(changed.has('slot:hero')||changed.has('slot:featured')){
        const carousel=[...changed].some(key=>live.get(key)?.querySelector('#carousel')||next.get(key)?.querySelector('#carousel'));
        if(carousel)clearInterval(App.carouselTimer);
        if(changed.has('slot:hero')){clearInterval(App.ynRotationTimer);clearInterval(App.ynTimer);}
        Promise.resolve(Views.homeAfter?.(App.params,batch.rid,{hero:changed.has('slot:hero'),carousel,week:changed.has('slot:week'),mosaic:changed.has('slot:mosaic')})).catch(()=>{});
      }else{
        if(changed.has('slot:week'))bindWeek();
        if(changed.has('slot:mosaic'))Promise.resolve(enhanceMosaic(batch.rid)).catch(()=>{});
      }
      if(changed.size)requestAnimationFrame(()=>updateRailArrows(root));
    }catch(error){console.warn('Home update:',error.message);}
    finally{if(quiet)queueMicrotask(()=>{App.renderQuiet=false;});batch.updating=false;if(batch.dirty&&this.current(batch))HomeReads.schedule(batch);}
  }
};
