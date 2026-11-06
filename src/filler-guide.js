// Researched classifications, verified against the exact catalog's numbered episodes.
// Catalog filler booleans alone are not permission to hide an episode.
const FillerGuide={
 cache:new Map(),pending:new Map(),retryAt:0,
 text(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_m,hex,dec)=>{const n=parseInt(hex||dec,hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();},
 norm(value){return this.text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');},
 parse(html){
  if(typeof html!=='string'||html.length>2000000)throw Error('Invalid filler guide');
  const title=this.text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]).replace(/\s+Filler List\s*$/i,'');
  if(!title)throw Error('Missing guide identity');
  const episodes=new Map(),kinds={'manga canon':'canon','anime canon':'anime-canon','mixed canon/filler':'mixed','filler':'filler'};
  for(const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const fields={};for(const cell of match[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)){const cls=cell[1].match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1]||'';for(const name of cls.split(/\s+/))if(['Number','Title','Type','Date'].includes(name))fields[name]=this.text(cell[2]);}
   const number=Number(fields.Number),kind=kinds[String(fields.Type||'').toLowerCase()];
   if(!Number.isInteger(number)||number<1||number>3000||!kind||!/^\d{4}-\d{2}-\d{2}$/.test(fields.Date||''))continue;
   const previous=episodes.get(number);episodes.set(number,{number,classification:previous&&previous.classification!==kind?'unknown':kind,title:fields.Title||'',date:fields.Date});
  }
  if(!episodes.size)throw Error('No researched episode classifications');return {title,episodes};
 },
 async load(url){
  const saved=this.cache.get(url);if(saved?.until>Date.now())return saved.value;
  if(this.pending.has(url))return this.pending.get(url);
  if(Date.now()<this.retryAt)return null;
  const job=(async()=>{let value=null;try{value=this.parse(await http(url,{timeout:6000,allowChallenge:false}));}catch(error){if(error?.status===429)this.retryAt=Date.now()+60000;}
   if(this.cache.size>=30)this.cache.delete(this.cache.keys().next().value);this.cache.set(url,{value,until:Date.now()+(value?21600000:60000)});return value;
  })();this.pending.set(url,job);try{return await job;}finally{this.pending.delete(url);}
 },
 async resolve(names,evidence){
  const titles=[...new Set((names||[]).filter(n=>typeof n==='string'&&n.length>=2&&n.length<=150))],allowed=new Set(titles.map(t=>this.norm(t)));
  const slugs=[...new Set(titles.map(t=>this.text(t).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).filter(s=>s.length>=2&&s.length<=100))].slice(0,2);
  for(const slug of slugs){
   const url='https://www.animefillerlist.com/shows/'+slug,guide=await this.load(url);if(!guide||!allowed.has(this.norm(guide.title)))continue;
   let anchors=0;for(const [n,sample] of evidence||[]){const row=guide.episodes.get(n);if(row&&sample.date===row.date&&this.norm(sample.title)&&this.norm(sample.title)===this.norm(row.title))anchors++;}
   // Multiple independently matching numbered titles AND air dates establish the
   // guide's numbering. Never strip a season, invent an offset, or trust a slug.
   if(anchors<3)continue;return {...guide,url,anchors};
  }
  return null;
 }
};
