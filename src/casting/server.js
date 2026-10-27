'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const secret = () => crypto.randomBytes(24).toString('hex');
const addresses = () => [...new Set(Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x.address))];
const json = (res, code, value) => { res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); };
async function body(req) {
 let size=0, chunks=[];
 for await (const chunk of req) { size+=chunk.length; if(size>16384) throw new Error('Request too large'); chunks.push(chunk); }
 return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function rewritePlaylist(text, base, register) {
 const local = value => register(new URL(value, base).href);
 return text.split(/\r?\n/).map(line => {
  if (!line.trim()) return line;
  if (line[0] !== '#') return local(line.trim());
  return line.replace(/URI="([^"]+)"/g, (_, url) => `URI="${local(url)}"`);
 }).join('\n');
}
function createCasting({ port=47632, host='0.0.0.0', fetchUpstream=global.fetch, now=Date.now }={}) {
 let server, starting, current=null, revision=0;
 const screens=new Map(), assets=new Map(),assetIndex=new Map(),listeners=new Map(),transfers=new Set();
 const notify=token=>{for(const response of listeners.get(token)||[]){if(!response.destroyed)response.write('data: '+revision+'\n\n');}};
 let addressCache=[],addressAt=-Infinity;
 const localAddresses=()=>{if(now()-addressAt>=5000){addressCache=addresses();addressAt=now();}return addressCache;};
 const clearAssets=()=>{for(const controller of transfers)controller.abort();transfers.clear();assets.clear();assetIndex.clear();};
 const publicScreen=s=>({name:s.name, connected:current===s.token, online:now()-s.seen<15000, playback:s.playback});
 const status=()=>({running:!!server?.listening, port:server?.address()?.port||port, urls:server?.listening?localAddresses().map(a=>`http://${a}:${server.address().port}`):[], screen:current&&screens.has(current)?publicScreen(screens.get(current)):null});
 const cleanup=()=>{const active=screens.get(current);if(active&&now()-active.seen>=15000)disconnect();for(const [t,s] of screens)if(now()-s.seen>120000){screens.delete(t);if(t===current){current=null;clearAssets();}}};
 const register=(url,token,headers={})=>{
  if(!/^https?:$/.test(new URL(url).protocol))throw new Error('Unsupported media address');
  const indexKey=token+'\0'+url;let id=assetIndex.get(indexKey);
  if(!id){if(assets.size>=10000)throw new Error('Too many media resources');id=secret();assets.set(id,{url,token,headers});assetIndex.set(indexKey,id);}
  return `/media/${id}?token=${token}`;
 };
 async function media(req,res,url){
  const a=assets.get(url.pathname.slice(7)),token=url.searchParams.get('token');
  if(!a||token!==a.token||token!==current)return json(res,403,{error:'Cast session ended'});
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
  transfers.add(controller);
  res.on('close',()=>controller.abort());
  try {
   const headers={...a.headers};if(req.headers.range)headers.Range=req.headers.range;
   const upstream=await fetchUpstream(a.url,{headers,signal:controller.signal,method:req.method==='HEAD'?'HEAD':'GET'});
   if(!upstream.ok){res.writeHead(upstream.status);res.end();return;}
   clearTimeout(timeout);
   const type=/\.vtt(?:$|\?)/i.test(a.url)?'text/vtt':upstream.headers.get('content-type')||'application/octet-stream';
   const playlist=/mpegurl/i.test(type)||/\.m3u8(?:$|\?)/i.test(a.url);
   if(playlist&&req.method!=='HEAD'){
    let chunks=[],size=0;
    for await(const chunk of upstream.body){size+=chunk.length;if(size>2*1024*1024)throw new Error('Playlist too large');chunks.push(Buffer.from(chunk));}
    const rewritten=rewritePlaylist(Buffer.concat(chunks).toString(),upstream.url||a.url,u=>register(u,a.token,a.headers));
    res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});res.end(rewritten);
   }else{
    const out={'Content-Type':type,'Cache-Control':'no-store'};
    for(const key of ['content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)out[key]=value;}
    res.writeHead(upstream.status,out);
    if(req.method==='HEAD')res.end();else await pipeline(Readable.fromWeb(upstream.body),res,{signal:controller.signal});
   }
  }catch(error){if(!res.headersSent)json(res,502,{error:'Could not fetch this video. Try resolving the episode again.'});else res.destroy();}
  finally{clearTimeout(timeout);transfers.delete(controller);}
 }
 async function handle(req,res){
  cleanup();
  const allowed=new Set(['127.0.0.1','localhost',...localAddresses()]);
  const authority=new URL(`http://${req.headers.host}`);
  if(!allowed.has(authority.hostname))return json(res,403,{error:'Invalid host'});
  if(req.headers.origin&&req.headers.origin!==authority.origin)return json(res,403,{error:'Invalid origin'});
  const url=new URL(req.url,authority);
  if(url.pathname.startsWith('/media/')&&['GET','HEAD'].includes(req.method))return media(req,res,url);
  if(req.method==='GET'&&['/','/receiver.js','/receiver.css','/hls.min.js'].includes(url.pathname)){
   const name=url.pathname==='/'?'receiver.html':url.pathname.slice(1);
   const file=name==='hls.min.js'?path.join(__dirname,'../vendor/hls.min.js'):path.join(__dirname,name);
   res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src blob:; frame-ancestors 'none'"});
   fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);return;
  }
  if(req.method==='POST'&&url.pathname==='/hello'){
   if(screens.size>=16)return json(res,429,{error:'Too many screens. Wait two minutes and retry.'});
   const data=await body(req),token=secret();let code;
   do{code=String(crypto.randomInt(100000,1000000));}while([...screens.values()].some(s=>s.code===code));
   screens.set(token,{token,code,name:String(data.name||'TV browser').slice(0,60),seen:now(),expires:now()+120000,playback:{},state:{revision:0,media:null}});
   return json(res,200,{token,code,expiresIn:120});
  }
  const token=req.headers.authorization?.replace(/^Bearer /,'')||(url.pathname==='/events'?url.searchParams.get('token'):null), screen=screens.get(token);
  if(!screen)return json(res,401,{error:'Open the receiver page again to reconnect.'});
  screen.seen=now();
  if(req.method==='GET'&&url.pathname==='/events'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});res.flushHeaders();
   if(!listeners.has(token))listeners.set(token,new Set());listeners.get(token).add(res);
   res.write('data: '+revision+'\n\n');const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': connected\n\n');},5000);
   res.on('close',()=>{clearInterval(heartbeat);const group=listeners.get(token);group?.delete(res);if(!group?.size)listeners.delete(token);});return;
  }

  if(req.method==='POST'&&url.pathname==='/leave'){if(current===token)disconnect();screens.delete(token);return json(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname==='/state'){
   const reported=screen.playback,matching=reported.mediaId===screen.state.media?.id;
   return json(res,200,{...screen.state,connected:current===token,resumeAt:matching?reported.time:screen.state.media?.at,completed:!!(matching&&reported.ended&&reported.revision===screen.state.revision)});
  }
  if(req.method==='POST'&&url.pathname==='/playback'){
   const data=await body(req);
   if(current!==token||data.mediaId!==screen.state.media?.id)return json(res,409,{error:'Old playback session'});
   if(Number.isInteger(data.revision)&&data.revision!==screen.state.revision)return json(res,200,{ok:true,ignored:true});
   const established=screen.playback.revision===data.revision;
   const seconds=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
   screen.playback={time:seconds(data.time),duration:seconds(data.duration),paused:!!data.paused,ended:!!data.ended,error:String(data.error||'').slice(0,200),mediaId:data.mediaId,revision:Number.isInteger(data.revision)?data.revision:null,needsInteraction:!!data.needsInteraction,loading:!!data.loading};
   if(established&&screen.playback.revision===screen.state.revision&&!screen.playback.needsInteraction&&!screen.playback.loading)screen.state.paused=screen.playback.paused;
   return json(res,200,{ok:true});
  }
  return json(res,404,{error:'Not found'});
 }
 function start(){
  if(starting)return starting;if(server?.listening)return Promise.resolve(status());
  starting=new Promise((resolve,reject)=>{
   const s=http.createServer((req,res)=>handle(req,res).catch(()=>{if(!res.headersSent)json(res,400,{error:'Invalid request'});else res.destroy();}));server=s;
   s.on('error',error=>{if(server===s)server=null;reject(new Error(error.code==='EADDRINUSE'?'The casting port is busy. Close the other AniDeck instance and try again.':error.message));});
   s.listen(port,host,()=>resolve(status()));
  }).finally(()=>{starting=null;});return starting;
 }
 function connect(code){
  cleanup();const screen=[...screens.values()].find(s=>s.code===String(code).replace(/\D/g,'')&&s.expires>now()&&now()-s.seen<15000);
  if(!screen)throw new Error('That code is incorrect or expired. Refresh the TV page and try again.');
  disconnect();current=screen.token;screen.code=null;notify(current);return status();
 }
 function load({url,title='',at=0,isHLS=true,headers={},subtitles=[]}){
  const screen=screens.get(current);if(!screen||now()-screen.seen>15000)throw new Error('Connect your TV receiver before casting.');
  clearAssets();
  const safeHeaders={};for(const [key,value]of Object.entries(headers))if(/^(referer|origin|user-agent|authorization|cookie)$/i.test(key))safeHeaders[key]=String(value);
  const id=secret();screen.playback={};
  screen.state={revision:++revision,action:'load',paused:false,seekRevision:0,media:{id,url:register(url,current,safeHeaders),title:String(title).slice(0,300),at:Math.max(0,Number(at)||0),isHLS:!!isHLS,subtitles:subtitles.slice(0,1).map(s=>({url:register(s.url,current,Object.fromEntries(Object.entries(s.headers||safeHeaders).filter(([key])=>/^(referer|origin|user-agent|authorization|cookie)$/i.test(key)))),label:String(s.label||'Subtitles').slice(0,80),language:s.language||'und'}))}};
  notify(current);return {id};
 }
 function command(action,value){
  const screen=screens.get(current);if(!screen)throw new Error('No TV connected.');
  if(!['play','pause','seek','stop'].includes(action))throw new Error('Unknown cast command');
  screen.state={...screen.state,revision:++revision,action,value:Number.isFinite(Number(value))?Math.max(0,Number(value)):0};
  if(action==='play'||action==='pause')screen.state.paused=action==='pause';
  if(action==='play'&&screen.playback.ended&&screen.playback.mediaId===screen.state.media?.id){screen.state.seekTime=0;screen.state.seekRevision=revision;}
  if(action==='play'||action==='seek')screen.playback={...screen.playback,ended:false};
  if(action==='seek'){screen.state.seekTime=screen.state.value;screen.state.seekRevision=revision;}
  if(action==='stop'){screen.state.media=null;screen.playback={};clearAssets();}
  notify(current);return status();
 }
 function disconnect(){const screen=screens.get(current);if(screen){screen.state={revision:++revision,action:'stop',media:null};screen.playback={};}const previous=current;current=null;clearAssets();if(previous)notify(previous);return status();}
 async function stop(){disconnect();screens.clear();const s=server;server=null;if(s){s.closeAllConnections?.();await new Promise(resolve=>s.close(resolve));}return status();}
 return {start,status:()=>{cleanup();return status();},connect,load,command,disconnect,stop};
}
module.exports={createCasting,rewritePlaylist};
