// Short-lived selections only; bitmap storage remains Chromium's responsibility.
const SpotlightArt={
 rows:new Map(),owner:null,ttl:5*60*1000,
 scope(){return JSON.stringify([typeof HomeReads==='undefined'?'':HomeReads.scope(),typeof Jellyfin==='undefined'?'':[Jellyfin.server,Jellyfin.userId,Jellyfin.token]]);},
 key(kid,lib){
  const scope=this.scope();
  if(scope!==this.owner){this.rows.clear();this.owner=scope;}
  return JSON.stringify([String(kid||''),String(lib||'')]);
 },
 get(kid,lib){const key=this.key(kid,lib),row=this.rows.get(key);if(!row)return null;if(Date.now()-row.at>this.ttl){this.rows.delete(key);return null;}return row;},
 remember(kid,lib,image){if(typeof image?.u!=='string'||image.u.length>8192||!Number.isFinite(image.w)||!Number.isFinite(image.h)||image.w<=0||image.h<=0)return;const key=this.key(kid,lib);this.rows.delete(key);this.rows.set(key,{image:{u:image.u,w:image.w,h:image.h},at:Date.now()});while(this.rows.size>32)this.rows.delete(this.rows.keys().next().value);},
 clear(){this.rows.clear();this.owner=null;},
 forget(kid,lib){this.rows.delete(this.key(kid,lib));},
};
