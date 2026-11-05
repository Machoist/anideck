/* Public, exact-ID title logos only. Keep image work out of the settings JSON. */
(() => {
  const MAX_ENTRIES=64, MAX_BYTES=4*1024*1024, MAX_IMAGE=512*1024, TTL=7*86400000;
  function valid(row,now=Date.now()) {
    if(!row||! /^[1-9][0-9]{0,9}$/.test(String(row.id))||!Number.isFinite(row.at)||row.at>now||now-row.at>=TTL)return false;
    const logo=row.logo;if(!logo||!Number.isFinite(logo.ratio)||logo.ratio<1.1||logo.ratio>20||typeof logo.url!=='string'||logo.url.length>MAX_IMAGE)return false;
    if(/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(logo.url))return true;
    try{const u=new URL(logo.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&['artworks.thetvdb.com','image.tmdb.org','assets.fanart.tv','images.anizip.com','images.metahub.space'].includes(u.hostname);}catch{return false;}
  }
  function retained(rows,now=Date.now()) {
    const result=[],ids=new Set();let bytes=0;
    for(const row of (Array.isArray(rows)?rows:[]).filter(r=>valid(r,now)).sort((a,b)=>b.at-a.at)){
      if(ids.has(String(row.id)))continue;
      const size=row.logo.url.length*2+128;if(result.length>=MAX_ENTRIES||bytes+size>MAX_BYTES)continue;
      ids.add(String(row.id));bytes+=size;result.push({id:String(row.id),at:row.at,logo:{url:row.logo.url,ratio:row.logo.ratio}});
    }
    return result;
  }
  function storage() {
    // Every operation is bounded; unavailable/blocked/quota-limited storage cannot hold up boot.
    const run=(write,value)=>new Promise(resolve=>{
      let db,tx,done=false;const finish=result=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve(result);};
      const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(null);},200);
      try{const open=indexedDB.open('anideck-public-title-artwork',1);
        open.onupgradeneeded=()=>{open.result.createObjectStore('logos');};
        open.onerror=()=>finish(null);open.onblocked=()=>finish(null);
        open.onsuccess=()=>{db=open.result;if(done){db.close();return;}tx=db.transaction('logos',write?'readwrite':'readonly');const store=tx.objectStore('logos'),request=write?store.put(value,'validated-v1'):store.get('validated-v1');let result;
          request.onsuccess=()=>{result=write?true:request.result;};tx.oncomplete=()=>finish(result);tx.onabort=tx.onerror=()=>finish(null);
        };
      }catch{finish(null);}
    });
    return {read:()=>run(false),write:rows=>run(true,rows)};
  }
  class ArtworkStore {
    constructor(io=storage(),clock=()=>Date.now()){this.io=io;this.clock=clock;this.rows=new Map();this.timer=null;this.pending=null;this.queue=Promise.resolve();}
    load(target){return this.pending??=(async()=>{try{for(const row of retained(await this.io.read(),this.clock())){if(!this.rows.has(row.id))this.rows.set(row.id,row);if(!target.has(row.id))target.set(row.id,row.logo);}}catch{}return this.rows.size;})();}
    remember(id,logo){const row={id:String(id),logo,at:this.clock()};if(!valid(row,this.clock()))return;this.rows.delete(row.id);this.rows.set(row.id,row);this.rows=new Map(retained([...this.rows.values()],this.clock()).map(r=>[r.id,r]));this.schedule();}
    forget(id){this.rows.delete(String(id));this.schedule();}
    schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),300);}
    flush(){clearTimeout(this.timer);const rows=retained([...this.rows.values()],this.clock());this.queue=this.queue.catch(()=>{}).then(()=>this.io.write(rows)).catch(()=>false);return this.queue;}
    async clear(){this.rows.clear();return this.flush();}
  }
  if(typeof module!=='undefined')module.exports={ArtworkStore,valid,retained,MAX_ENTRIES,MAX_BYTES,TTL};
  else globalThis.TitleArtwork=new ArtworkStore();
})();
