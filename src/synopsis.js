/* Choose between metadata for the same, externally mapped title. Never borrow a prequel's story. */
'use strict';
const TitleSynopsis = {
  clean(value) {
    return String(value || '').replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  },
  isStub(value) {
    const text = this.clean(value).replace(/\(?Source:[\s\S]*$/i, '').trim();
    // Catalog placeholders describe a sequel's relationship, without a plot of its own.
    return !text || /^(?:no synopsis|no description|synopsis (?:not|to be)|to be announced|tba)[.! ]*$/i.test(text) || /^no (?:synopsis|description)(?: information)? (?:(?:has been|is) (?:added|available|provided)|available)\b/i.test(text) || (text.length < 240 && /^(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|next)\s+(?:season|part|cour)\s+of\b|sequel\s+to\b|continuation\s+of\b|season\s+\d+\s+of\b)/i.test(text)
      && text.split(/(?<=[.!?])\s+/).filter(Boolean).length <= 1);
  },
  cache:new Map(),pending:new Map(),retry:new Map(),slots:new Map(),
  sources:[
    {base:'https://api.tenrai.org/v1/anime/',name:'MyAnimeList via Tenrai'},
    {base:'https://api.jikan.moe/v4/anime/',name:'MyAnimeList via Jikan'}
  ],
  bounded(task,ms){
    let timer;return Promise.race([Promise.resolve(task),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synopsis deadline')),ms);})]).finally(()=>clearTimeout(timer));
  },
  async fetchStory(mal){
    for(const source of this.sources){
      const wait=(this.slots.get(source.base)||0)-Date.now();
      // Skip a cooled-down or backed-up service; never queue behind its network timeout.
      if(wait>1500)continue;
      this.slots.set(source.base,Math.max(Date.now(),this.slots.get(source.base)||0)+1100);
      if(wait>0)await new Promise(r=>setTimeout(r,wait));
      if((this.slots.get(source.base)||0)-Date.now()>5000)continue;
      try{
        const result=await this.bounded(http(source.base+mal,{timeout:3000,allowChallenge:false}),3100);
        if(Number(result?.data?.mal_id)!==Number(mal)||typeof result.data.synopsis!=='string')continue;
        const story=this.clean(result.data.synopsis).slice(0,20000);if(this.isStub(story))continue;
        return {text:story,source:source.name,url:'https://myanimelist.net/anime/'+mal};
      }catch(error){if(Number(error?.status)===429)this.slots.set(source.base,Date.now()+60000);}
    }
    return null;
  },
  async resolve(id,primary,alternate,media){
    const text=this.choose(primary,alternate);if(!this.isStub(text))return {text,source:'',url:''};
    const fallback={text,source:'',url:''};
    // A supplied season mapping is trusted only for that exact AniList title.
    const alId=String(id).startsWith('al:')?String(id).slice(3):null;
    let mal=!alId||String(media?.id)===alId?media?.malId:null;
    try{if(!mal){if(alId)mal=(await this.bounded(AniZip.get(alId),2000))?.malId;else mal=(await this.bounded(Kitsu.externalIds(id),2000))?.mal;}}catch{}
    if(!/^[1-9][0-9]*$/.test(String(mal||'')))return {text,source:'',url:''};
    const key=String(mal),hit=this.cache.get(key);if(hit&&hit.until>Date.now())return hit.value;
    if((this.retry.get(key)||0)>Date.now())return fallback;
    let task=this.pending.get(key);
    if(!task){task=this.fetchStory(mal).then(value=>{
      if(value){this.cache.set(key,{until:Date.now()+86400000,value});if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);this.retry.delete(key);}
      else{this.retry.set(key,Date.now()+30000);if(this.retry.size>200)this.retry.delete(this.retry.keys().next().value);}
      return value;
    }).finally(()=>this.pending.delete(key));this.pending.set(key,task);}
    return (await task)||fallback;
  },
  choose(primary, alternate) {
    const first = this.clean(primary), second = this.clean(alternate);
    return (!first || (this.isStub(first) && !this.isStub(second))) ? second || first : first;
  }
};
