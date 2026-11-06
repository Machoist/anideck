// Optional public episode annotations. Never participates in playback or tracking.
const FillerEpisodes = {
  cache:new Map(), pending:new Map(), queue:Promise.resolve(), nextAt:0, cooldown:new Map(),
  sources:[{base:'https://api.tenrai.org/v1/anime/',name:'MyAnimeList via Tenrai'},{base:'https://api.jikan.moe/v4/anime/',name:'MyAnimeList via Jikan'}],
  number(value){return Number.isInteger(value)&&value>0&&value<=3000;},
  preference(id){const saved=App.settings.episodeFiller?.[String(id)];return {indicators:saved?.indicators!==false,hide:saved?.hide===true};},
  async savePreference(id,value){
    const key=String(id),previous=App.settings.episodeFiller?.[key],next={indicators:!!value.indicators,hide:!!value.hide};
    App.settings.episodeFiller={...(App.settings.episodeFiller||{}),[key]:next};
    try{await App.saveSettings();}catch(error){if(App.settings.episodeFiller[key]===next){if(previous)App.settings.episodeFiller[key]=previous;else delete App.settings.episodeFiller[key];}throw error;}
  },
  parse(payload,mal){
    if(!Array.isArray(payload?.data)||payload.data.length>100)throw Error('Invalid episode annotations');
    const result=new Map();result.evidence=new Map();
    for(const row of payload.data){
      const n=row?.mal_id;if(!this.number(n))continue;
      if(mal&&row.url){const match=String(row.url).match(/^https:\/\/myanimelist\.net\/anime\/([1-9][0-9]*)\/.*?episode\/([1-9][0-9]*)(?:[/?#]|$)/);if(!match||String(match[1])!==String(mal)||Number(match[2])!==n)throw Error('Episode annotation identity mismatch');}
      // False/null flags do not establish researched canon or mixed canon.
      const kind=row.filler===true&&row.recap!==true?'filler':row.recap===true&&row.filler!==true?'recap':'unknown';
      result.set(n,result.has(n)&&result.get(n)!==kind?'unknown':kind);
      if(typeof row.title==='string'&&/^\d{4}-\d{2}-\d{2}/.test(row.aired||''))result.evidence.set(n,{title:row.title,date:row.aired.slice(0,10)});
    }
    return result;
  },
  async page(mal,page){
    const key=mal+':'+page,hit=this.cache.get(key);if(hit?.until>Date.now())return hit.rows;
    if(this.pending.has(key))return this.pending.get(key);
    const job=this.queue.catch(()=>{}).then(async()=>{
      const delay=Math.max(0,this.nextAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      this.nextAt=Date.now()+1100;
      let rows=null;
      for(const source of this.sources){
        if(Date.now()<(this.cooldown.get(source.base)||0))continue;
        try{rows=this.parse(await http(source.base+mal+'/episodes?page='+page,{timeout:5000,allowChallenge:false}),mal);rows.source=source.name;break;}
        catch{this.cooldown.set(source.base,Date.now()+60000);}
      }
      if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key,{rows,checkedAt:Date.now(),until:Date.now()+(rows?6*3600000:60000)});return rows;
    });
    this.queue=job;this.pending.set(key,job);
    try{return await job;}finally{this.pending.delete(key);}
  },
  async read({kitsuId,alId,malId,total,kitsuTotal,status,title,aliases},numbers){
    const result=new Map();
    // Combined/split catalogs need explicit segment mapping before annotations can transfer.
    const ongoing=['current','releasing','airing','currently airing'].includes(String(status||'').toLowerCase().replaceAll('_',' '));
    if(!ongoing&&total&&kitsuTotal&&Number(total)!==Number(kitsuTotal))return result;
    let mapped,external=null;
    if(alId&&!/^[1-9][0-9]{0,8}$/.test(String(alId)))return result;
    try{
      if(/^[1-9][0-9]*$/.test(String(kitsuId||'')))try{
        // Canonical AniList details already establish MAL identity. Inspect cached
        // cross-checks, but do not stall behind optional mapping/artwork services.
        if(alId&&malId){if(typeof window!=='undefined'&&window.native?.get)external=(await window.native.get('kitsuExtIds'))?.[String(kitsuId)]||null;}
        else external=await Kitsu.externalIds(kitsuId);
      }catch{}
      if(alId){
        if(external?.anilist&&String(external.anilist)!==String(alId))return result;
        if(malId){if(external?.mal&&String(external.mal)!==String(malId))return result;mapped=malId;}
        else if(external?.mal&&String(external.anilist)===String(alId))mapped=external.mal;
        else{
          const zip=await AniZip.get(alId);
          if(!zip||!zip.malId||(external?.mal&&String(zip.malId)!==String(external.mal))||(kitsuId&&String(zip.kitsu)!==String(kitsuId)))return result;
          mapped=zip.malId;
        }
      }else mapped=external?.mal;
    }catch{return result;}
    if(!/^[1-9][0-9]{0,8}$/.test(String(mapped||'')))return result;
    const pages=[...new Set(numbers.filter(n=>this.number(n)).map(n=>Math.ceil(n/100)))].slice(0,2);
    for(const page of pages){
      const rows=await this.page(String(mapped),page);if(!rows)continue;
      const guide=typeof FillerGuide!=='undefined'?await FillerGuide.resolve([title,...(aliases||[])],rows.evidence):null;
      if(guide)result.guideReady=true;
      for(const n of numbers)if(Math.ceil(n/100)===page&&rows.has(n)){
        const researched=guide?.episodes.get(n),sample=rows.evidence?.get(n),verified=researched&&sample?.date===researched.date;
        // MAL's binary filler=true includes anime-canon episodes. It is only a
        // candidate flag; hiding requires the independently verified guide.
        const classification=verified?researched.classification:rows.get(n)==='recap'?'recap':'unknown';
        result.set(n,{identity:{malId:String(mapped)},number:n,classification,source:verified?'AnimeFillerList':rows.source||'MyAnimeList',sourceUrl:verified?guide.url+'#eps-'+n:'https://myanimelist.net/anime/'+mapped+'/episode/'+n,checkedAt:this.cache.get(mapped+':'+page)?.checkedAt});
      }
    }
    return result;
  },
  async mount({id,al,kitsuTotal,total,status,title,aliases},rid){
    const list=document.querySelector('.detail-main .ep-list');if(!list)return;
    if(list.dataset.fillerMounted)return;list.dataset.fillerMounted='true';
    const rows=[...list.querySelectorAll('.ep[data-num]')],panel=list.parentElement;
    if(!rows.length)return;
    let preference=this.preference(id),annotations=new Map(),loading=false,loaded=false,saving=false;
    const controls=document.createElement('div');controls.className='filler-tools';
    controls.innerHTML='<div class="filler-options" role="group" aria-label="Filler options for this title"><button type="button" data-filler="indicators" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h8l8 8-8 8-8-8V4Z"/><circle cx="8" cy="8" r="1"/></svg><span>Filler labels</span><b class="filler-value"></b></button><button type="button" data-filler="hide" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></svg><span>Hide filler</span><b class="filler-value"></b></button></div><span class="filler-status" role="status"></span><button class="filler-retry" type="button" hidden>Retry lookup</button>';
    const sort=panel.querySelector('.ep-sort');
    if(sort)sort.after(controls);else list.before(controls);
    const current=()=>!App.stale(rid)&&list.isConnected&&controls.isConnected;
    const apply=()=>{
      if(!current())return;
      let hidden=0,marked=0,connected=0,filler=0;
      for(const row of rows){
        if(!row.isConnected)continue;connected++;
        const info=annotations.get(Number(row.dataset.num)),kind=info?.classification;
        if(kind==='filler')filler++;
        const hide=preference.hide&&kind==='filler';row.hidden=hide;if(hide)hidden++;
        row.classList.toggle('filler-marked',preference.indicators&&kind==='filler');
        row.querySelector('.filler-poster-tag')?.remove();
        if(preference.indicators&&kind==='filler'){
          marked++;let badge=row.querySelector('.episode-classification');
          if(!badge){badge=document.createElement('a');badge.className='episode-classification';badge.dataset.act='link';row.append(badge);}
          badge.dataset.kind=kind;badge.dataset.url=info.sourceUrl;badge.href=info.sourceUrl;badge.textContent='Filler';badge.title=info.source+' classification · Open source';badge.setAttribute('aria-label',badge.textContent+' episode · source: '+info.source);
        }else row.querySelector('.episode-classification')?.remove();
      }
      const status=controls.querySelector('[role="status"]');
      const enabled=preference.indicators||preference.hide;
      const verified=annotations.guideReady===true;
      status.textContent=!loading&&enabled&&verified&&filler?(hidden?hidden+' filler episodes hidden':filler+' confirmed filler episode'+(filler===1?'':'s')+' in this range'):'';
      status.hidden=!status.textContent;
      controls.classList.toggle('data-loading',loading);
      controls.querySelector('.filler-retry').hidden=true;
      controls.querySelectorAll('[data-filler]').forEach(button=>{const on=preference[button.dataset.filler];button.setAttribute('aria-pressed',String(on));button.querySelector('.filler-value').textContent=!on?'Off':loading?'Loading':button.dataset.filler==='hide'&&hidden?hidden+' hidden':'On';});
      let empty=panel.querySelector('.filler-empty');
      if(connected&&hidden===connected){if(!empty){empty=document.createElement('p');empty.className='filler-empty';empty.textContent='All episodes in this range are marked filler. Turn off “Hide filler” above to show all episodes.';list.after(empty);}}
      else empty?.remove();
    };
    const load=async()=>{
      if(loading||loaded||(!preference.indicators&&!preference.hide))return;
      loading=true;apply();
      try{annotations=await this.read({kitsuId:/^\d+$/.test(String(id))?id:null,alId:al?.id,malId:al?.malId,total,kitsuTotal,status:al?.status||status,title:title||al?.title,aliases:[...(aliases||[]),...(al?.titles||[])]},rows.map(r=>Number(r.dataset.num)));}
      catch{annotations=new Map();}
      finally{loading=false;loaded=true;apply();}
    };
    controls.querySelector('.filler-retry').onclick=async()=>{if(!current()||loading)return;loaded=false;for(const [key,hit] of this.cache)if(!hit.rows)this.cache.delete(key);await load();};
    controls.querySelectorAll('[data-filler]').forEach(button=>button.onclick=async()=>{
      if(!current()||saving)return;
      const previous={...preference};preference={...preference,[button.dataset.filler]:!preference[button.dataset.filler]};button.classList.remove('just-changed');void button.offsetWidth;button.classList.add('just-changed');apply();
      saving=true;controls.querySelectorAll('[data-filler]').forEach(b=>b.disabled=true);
      try{await this.savePreference(id,preference);controls.classList.remove('save-error');}catch{if(current()){preference=previous;apply();controls.classList.add('save-error');const status=controls.querySelector('[role="status"]');status.hidden=false;status.textContent='Could not save this title’s options. Try again.';}return;}
      finally{saving=false;if(current())controls.querySelectorAll('[data-filler]').forEach(b=>b.disabled=false);}
      if(current())await load();
    });
    apply();await load();
  }
};
