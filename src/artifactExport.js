'use strict';
function prepareArtifact({type,data,name}){
 const base=String(name||'AniDeck').replace(/[^a-z0-9 _-]/gi,'').trim().slice(0,100)||'AniDeck';
 if(type==='json'){
  if(typeof data!=='string'||Buffer.byteLength(data)>2*1024*1024)throw new Error('Deck file is too large.');
  JSON.parse(data);return {name:base+'.json',bytes:Buffer.from(data),filters:[{name:'AniDeck deck',extensions:['json']}]};
 }
 if(type==='png'){
  if(typeof data!=='string'||!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(data)||data.length>12*1024*1024)throw new Error('Invalid review image.');
  const bytes=Buffer.from(data.split(',')[1],'base64');
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG image.');
  return {name:base+'.png',bytes,filters:[{name:'PNG image',extensions:['png']}]};
 }
 throw new Error('Unsupported export format.');
}
module.exports={prepareArtifact};
