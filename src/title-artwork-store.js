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
  function storage(key='validated-v1') {
    // Every operation is bounded; unavailable/blocked/quota-limited storage cannot hold up boot.
    const run=(write,value)=>new Promise(resolve=>{
      let db,tx,done=false;const finish=result=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve(result);};
      const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(null);},200);
      try{const open=indexedDB.open('anideck-public-title-artwork',1);
        open.onupgradeneeded=()=>{open.result.createObjectStore('logos');};
        open.onerror=()=>finish(null);open.onblocked=()=>finish(null);
        open.onsuccess=()=>{db=open.result;if(done){db.close();return;}tx=db.transaction('logos',write?'readwrite':'readonly');const store=tx.objectStore('logos'),request=write?store.put(value,key):store.get(key);let result;
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
  function publicImage(url){try{const u=new URL(url);return url.length<=1024&&u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&['artworks.thetvdb.com','image.tmdb.org','assets.fanart.tv','images.anizip.com','s4.anilist.co','media.kitsu.app','media.kitsu.io'].includes(u.hostname)&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname);}catch{return false;}}
  class ImageMeasurements {
    constructor(io=storage('dimensions-v1'),clock=()=>Date.now(),makeImage=()=>new Image()){this.io=io;this.clock=clock;this.makeImage=makeImage;this.rows=new Map();this.pending=new Map();this.loading=null;this.timer=null;this.queue=Promise.resolve();}
    valid(row){return row&&publicImage(row.u)&&Number.isInteger(row.w)&&Number.isInteger(row.h)&&row.w>0&&row.h>0&&row.w<=16000&&row.h<=16000&&Number.isFinite(row.at)&&row.at<=this.clock()&&this.clock()-row.at<TTL;}
    load(){return this.loading??=(async()=>{try{const rows=await this.io.read();for(const row of (Array.isArray(rows)?rows:[]).filter(r=>this.valid(r)).sort((a,b)=>b.at-a.at).slice(0,256))if(!this.rows.has(row.u))this.rows.set(row.u,row);}catch{}return this.rows.size;})();}
    measure(u,timeout=6000){
      if(!u)return Promise.resolve(null);const hit=this.rows.get(u);if(this.valid(hit))return Promise.resolve({u,w:hit.w,h:hit.h});if(hit)this.rows.delete(u);
      if(this.pending.has(u))return this.pending.get(u);
      const task=new Promise(resolve=>{const image=this.makeImage();let finished=false;const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=image.onerror=null;
        if(value&&publicImage(u)){const row={...value,at:this.clock()};if(this.valid(row)){this.rows.delete(u);this.rows.set(u,row);while(this.rows.size>256)this.rows.delete(this.rows.keys().next().value);clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),300);}}
        resolve(value);
      };const timer=setTimeout(()=>{finish(null);image.removeAttribute?.('src');},timeout);
      image.decoding='async';image.onload=()=>finish(image.naturalWidth>0&&image.naturalHeight>0?{u,w:image.naturalWidth,h:image.naturalHeight}:null);image.onerror=()=>finish(null);image.src=u;
      }).finally(()=>this.pending.delete(u));this.pending.set(u,task);return task;
    }
    flush(){clearTimeout(this.timer);const rows=[...this.rows.values()].filter(r=>this.valid(r)).slice(-256);this.queue=this.queue.catch(()=>{}).then(()=>this.io.write(rows)).catch(()=>false);return this.queue;}
    forget(u){if(this.rows.delete(u)){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),300);}}
    clear(){this.rows.clear();return this.flush();}
  }
  if(typeof module!=='undefined')module.exports={ArtworkStore,ImageMeasurements,publicImage,valid,retained,MAX_ENTRIES,MAX_BYTES,TTL};
  else{globalThis.TitleArtwork=new ArtworkStore();globalThis.ArtworkImages=new ImageMeasurements();}
})();
