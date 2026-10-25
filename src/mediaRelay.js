'use strict';
const http=require('node:http'),crypto=require('node:crypto');
const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {rewritePlaylist}=require('./casting/server');
function createMediaRelay({fetchUpstream}){
 let server,starting,token='',assets=new Map(),counter=0;
 const register=(url,headers)=>{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Invalid media address');const id=String(++counter);assets.set(id,{url:parsed.href,headers});return '/media/'+id+'?token='+token;};
 async function handle(req,res){
  const url=new URL(req.url,'http://127.0.0.1');
  if(!['GET','HEAD'].includes(req.method)||url.searchParams.get('token')!==token||!token||(req.headers.origin&&req.headers.origin!=='null')){res.writeHead(403);return res.end();}
  const asset=assets.get(url.pathname.slice(7));if(!asset){res.writeHead(404);return res.end();}
  res.setHeader('Access-Control-Allow-Origin','null');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);res.on('close',()=>controller.abort());
  try{const headers={...asset.headers};if(req.headers.range)headers.Range=req.headers.range;
   const upstream=await fetchUpstream(asset.url,{headers,method:req.method,signal:controller.signal});
   if(!upstream.ok){res.writeHead(upstream.status);return res.end();}
   const type=upstream.headers.get('content-type')||'application/octet-stream';
   if(req.method!=='HEAD'&&(/mpegurl/i.test(type)||/\.m3u8(?:$|\?)/i.test(asset.url))){
    let size=0,chunks=[];for await(const chunk of upstream.body){size+=chunk.length;if(size>2097152)throw Error('Playlist too large');chunks.push(Buffer.from(chunk));}
    const text=rewritePlaylist(Buffer.concat(chunks).toString(),upstream.url||asset.url,next=>{if(assets.size>=10000)throw Error('Too many media resources');return register(next,asset.headers);});
    res.setHeader('Content-Type','application/vnd.apple.mpegurl');res.writeHead(200);res.end(text);
   }else{res.setHeader('Content-Type',type);for(const key of ['content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)res.setHeader(key,value);}res.writeHead(upstream.status);if(req.method==='HEAD')res.end();else await pipeline(Readable.fromWeb(upstream.body),res);}
  }catch{if(!res.headersSent){res.writeHead(502);res.end('Could not load this media resource');}else res.destroy();}finally{clearTimeout(timer);}
 }
 async function start(){if(server?.listening)return;if(starting)return starting;starting=new Promise((resolve,reject)=>{server=http.createServer((req,res)=>handle(req,res));server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}).finally(()=>starting=null);return starting;}
 async function load({url,headers={}}){if(new URL(url).protocol!=='https:')throw Error('Expected secure provider media');await start();token=crypto.randomBytes(24).toString('hex');assets=new Map();counter=0;const safe={};for(const [key,value]of Object.entries(headers))if(/^(referer|origin|user-agent|cookie|authorization)$/i.test(key))safe[key]=String(value);const route=register(url,safe);return 'http://127.0.0.1:'+server.address().port+route;}
 async function stop(){token='';assets.clear();const active=server;server=null;if(active){active.closeAllConnections?.();await new Promise(resolve=>active.close(resolve));}}
 return {load,stop};
}
module.exports={createMediaRelay};
