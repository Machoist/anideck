// Optional public episode annotations. Never participates in playback or tracking.
const FillerEpisodes = {
  cache:new Map(), pending:new Map(), queue:Promise.resolve(), nextAt:0, retryAt:0,
  number(value){return Number.isInteger(value)&&value>0&&value<=3000;},
  parse(payload){
    if(!Array.isArray(payload?.data)||payload.data.length>100)throw Error('Invalid episode annotations');
    const result=new Map();
    for(const row of payload.data){
      const n=row?.mal_id;if(!this.number(n))continue;
      // False/null flags do not establish researched canon or mixed canon.
      const kind=row.filler===true&&row.recap!==true?'filler':row.recap===true&&row.filler!==true?'recap':'unknown';
      result.set(n,result.has(n)&&result.get(n)!==kind?'unknown':kind);
    }
    return result;
  },
  async page(mal,page){
    const key=mal+':'+page,hit=this.cache.get(key);if(hit?.until>Date.now())return hit.rows;
    if(this.pending.has(key))return this.pending.get(key);
    const job=this.queue.catch(()=>{}).then(async()=>{
      if(Date.now()<this.retryAt)return null;
      const delay=Math.max(0,this.nextAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      this.nextAt=Date.now()+1100;
      let rows;
      try{rows=this.parse(await http('https://api.jikan.moe/v4/anime/'+mal+'/episodes?page='+page,{timeout:6000,allowChallenge:false}));}
      catch{rows=null;this.retryAt=Date.now()+60000;}
      if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key,{rows,checkedAt:Date.now(),until:Date.now()+(rows?6*3600000:60000)});return rows;
    });
    this.queue=job;this.pending.set(key,job);
    try{return await job;}finally{this.pending.delete(key);}
  },
  async read({kitsuId,alId,malId,total,kitsuTotal},numbers){
    const result=new Map();
    // Combined/split catalogs need explicit segment mapping before annotations can transfer.
    if(total&&kitsuTotal&&Number(total)!==Number(kitsuTotal))return result;
    let mapped;
    if(alId&&!/^[1-9][0-9]{0,8}$/.test(String(alId)))return result;
    try{
      if(alId){
        const zip=await AniZip.get(alId);
        if(!zip||!zip.malId||(malId&&String(zip.malId)!==String(malId))||(kitsuId&&String(zip.kitsu)!==String(kitsuId)))return result;
        mapped=zip.malId;
      }else if(/^[1-9][0-9]*$/.test(String(kitsuId||''))){mapped=(await Kitsu.externalIds(kitsuId))?.mal;}
    }catch{return result;}
    if(!/^[1-9][0-9]{0,8}$/.test(String(mapped||'')))return result;
    const pages=[...new Set(numbers.filter(n=>this.number(n)).map(n=>Math.ceil(n/100)))].slice(0,2);
    for(const page of pages){const rows=await this.page(String(mapped),page);if(rows)for(const n of numbers)if(Math.ceil(n/100)===page&&rows.has(n))result.set(n,{identity:{malId:String(mapped)},number:n,classification:rows.get(n),source:'Jikan / MyAnimeList',sourceUrl:'https://myanimelist.net/anime/'+mapped+'/episode/'+n,checkedAt:this.cache.get(mapped+':'+page)?.checkedAt});}
    return result;
  },
  async mount({id,al,kitsuTotal,total},rid){
    const list=document.querySelector('.detail-main .ep-list');if(!list)return;
    if(list.dataset.fillerMounted)return;list.dataset.fillerMounted='true';
    const rows=[...list.querySelectorAll('.ep[data-num]')],panel=list.parentElement;
    if(!rows.length||(!App.settings.showFillerIndicators&&!App.settings.hideFiller))return;
    const controls=document.createElement('div');controls.className='filler-tools';
    controls.innerHTML='<span role="status">Checking episode annotations…</span><button type="button" class="btn ghost sm" hidden></button>';
    list.before(controls);
    const annotations=await this.read({kitsuId:/^\d+$/.test(String(id))?id:null,alId:al?.id,malId:al?.malId,total,kitsuTotal},rows.map(r=>Number(r.dataset.num)));
    if(App.stale(rid)||!list.isConnected||!controls.isConnected)return;
    let reveal=false;
    const apply=()=>{
      let hidden=0,marked=0,connected=0;
      for(const row of rows){
        if(!row.isConnected)continue;connected++;
        const info=annotations.get(Number(row.dataset.num)),kind=info?.classification;
        const hide=!!App.settings.hideFiller&&!reveal&&kind==='filler';row.hidden=hide;if(hide)hidden++;
        if(App.settings.showFillerIndicators&&['filler','recap','mixed','canon'].includes(kind)){
          marked++;let badge=row.querySelector('.episode-classification');
          if(!badge){badge=document.createElement('a');badge.className='episode-classification';badge.dataset.act='link';row.querySelector('.ep-num')?.append(badge);}
          badge.dataset.url=info.sourceUrl;badge.href=info.sourceUrl;badge.textContent=kind[0].toUpperCase()+kind.slice(1);badge.title=info.source+' annotation · Open source';badge.setAttribute('aria-label',badge.textContent+' episode · source: '+info.source);
        }
      }
      const status=controls.querySelector('span'),button=controls.querySelector('button');
      status.textContent=hidden?hidden+' filler episode'+(hidden===1?'':'s')+' hidden in this range':annotations.size?(marked?'Episode annotations · Jikan / MyAnimeList':'No marked filler in this range'):'Episode annotations unavailable · All episodes remain visible';
      button.hidden=!App.settings.hideFiller||![...annotations.values()].some(x=>x.classification==='filler');button.textContent=reveal?'Hide filler':'Show all episodes';
      button.onclick=()=>{reveal=!reveal;apply();};
      let empty=panel.querySelector('.filler-empty');
      if(connected&&hidden===connected){if(!empty){empty=document.createElement('p');empty.className='filler-empty';empty.textContent='All episodes in this range are marked filler. Choose “Show all episodes” to view them.';list.after(empty);}}
      else empty?.remove();
    };
    apply();
  }
};
