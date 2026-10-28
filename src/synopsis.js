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
    return !text || /^(?:no synopsis|no description|synopsis (?:not|to be)|to be announced|tba)[.! ]*$/i.test(text) || (text.length < 240 && /^(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|next)\s+(?:season|part|cour)\s+of\b|sequel\s+to\b|continuation\s+of\b|season\s+\d+\s+of\b)/i.test(text)
      && text.split(/(?<=[.!?])\s+/).filter(Boolean).length <= 1);
  },
  cache:new Map(),pending:new Map(),queue:Promise.resolve(),nextAt:0,
  async resolve(id,primary,alternate,media){
    const text=this.choose(primary,alternate);if(!this.isStub(text))return {text,source:'',url:''};
    let mal=media?.malId;try{if(!mal){if(String(id).startsWith('al:'))mal=(await AniZip.get(String(id).slice(3)))?.malId;else mal=(await Kitsu.externalIds(id))?.mal;}}catch{}
    if(!/^[1-9][0-9]*$/.test(String(mal||'')))return {text,source:'',url:''};
    const hit=this.cache.get(String(mal));if(hit&&hit.until>Date.now())return hit.value;
    if(this.pending.has(String(mal)))return this.pending.get(String(mal));
    const task=this.queue.catch(()=>{}).then(async()=>{const wait=this.nextAt-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));this.nextAt=Date.now()+1100;
      try{const result=await http('https://api.jikan.moe/v4/anime/'+mal,{timeout:7000});if(Number(result?.data?.mal_id)!==Number(mal))throw Error('Mismatched synopsis');const story=this.clean(result.data.synopsis);if(this.isStub(story))return {text,source:'',url:''};const value={text:story,source:'MyAnimeList via Jikan',url:'https://myanimelist.net/anime/'+mal};this.cache.set(String(mal),{until:Date.now()+86400000,value});if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);return value;}catch(error){if(Number(error.status)===429)this.nextAt=Date.now()+60000;return {text,source:'',url:''};}
    }).finally(()=>this.pending.delete(String(mal)));this.queue=task;this.pending.set(String(mal),task);return task;
  },
  choose(primary, alternate) {
    const first = this.clean(primary), second = this.clean(alternate);
    return (!first || (this.isStub(first) && !this.isStub(second))) ? second || first : first;
  }
};
