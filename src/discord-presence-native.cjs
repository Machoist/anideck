'use strict';
// Local Discord IPC only. No account tokens, webhooks, streaming URLs or SDK downloads.
const net=require('node:net'),path=require('node:path'),os=require('node:os');
function ipcPaths(platform=process.platform,env=process.env){return Array.from({length:10},(_,n)=>platform==='win32'?'\\\\?\\pipe\\discord-ipc-'+n:path.posix.join(env.XDG_RUNTIME_DIR||env.TMPDIR||env.TMP||env.TEMP||os.tmpdir(),'discord-ipc-'+n));}
function frame(op,data){const body=Buffer.from(JSON.stringify(data)),header=Buffer.alloc(8);header.writeUInt32LE(op);header.writeUInt32LE(body.length,4);return Buffer.concat([header,body]);}
function text(value){return typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,120):'';}
function activityFor(payload,mode='episode',now=Date.now()){
 if(payload?.remoteOnly!==true||payload?.active!==true||payload?.ended===true||payload?.casting===true)return null;
 const state=payload.paused?'Paused':'Playing',activity={type:3,details:mode==='activity'?'Watching anime':text(payload.title)||'Watching anime',state};
 if(mode==='episode'&&Number.isInteger(payload.episode)&&payload.episode>0&&payload.episode<10000)activity.state=state+' · Episode '+payload.episode;
 const time=Number(payload.position),duration=Number(payload.duration);
 if(!payload.paused&&Number.isFinite(time)&&time>=0&&Number.isFinite(duration)&&duration>time&&duration<86400)activity.timestamps={start:Math.floor(now/1000-time),end:Math.floor(now/1000+duration-time)};
 if(mode!=='activity'&&typeof payload.poster==='string')try{const u=new URL(payload.poster);if(u.protocol==='https:'&&['s4.anilist.co','media.kitsu.app','media.kitsu.io'].includes(u.hostname)&&!u.username&&!u.password){u.search='';u.hash='';activity.assets={large_image:u.href.slice(0,256),large_text:activity.details};}}catch{}
 return activity;
}
class DiscordPresenceClient{
 constructor({connect=p=>net.createConnection(p),paths=ipcPaths(),now=()=>Date.now(),delay=setTimeout,cancel=clearTimeout,pid=process.pid}={}){Object.assign(this,{connect,paths,now,delay,cancel,pid,enabled:false,clientId:'',mode:'episode',state:'off',socket:null,revision:0,desired:null,last:null,lastAt:0,connecting:false});}
 status(){return {configured:/^[0-9]{17,20}$/.test(this.clientId),enabled:this.enabled,state:this.state};}
 configure(settings={},clientId=''){
  const enabled=settings.discordPresence===true,id=/^[0-9]{17,20}$/.test(String(clientId))?String(clientId):'',mode=['episode','title','activity'].includes(settings.discordVisibility)?settings.discordVisibility:'episode';
  if(mode!==this.mode)this.clear();
  if(id!==this.clientId||!enabled){this.disconnect();this.last=null;this.desired=null;this.session=null;}this.enabled=enabled;this.clientId=id;this.mode=mode;
  if(!enabled)this.state='off';else if(!id)this.state='setup';else if(!this.socket)this.state='idle';return this.status();
 }
 update(payload){
  if(!this.enabled||!this.clientId)return this.status();
  if(this.blockedSession&&payload?.session===this.blockedSession)return this.status();
  const activity=activityFor(payload,this.mode,this.now());if(!activity){this.clear();return this.status();}
  this.session=text(payload.session);this.desired=activity;this.ensure();return this.status();
 }
 revoke(){this.blockedSession=this.session;this.clear();}
 clear(){this.desired=null;this.cancel(this.timer);this.timer=null;this.cancel(this.retry);this.retry=null;if(this.socket&&this.state==='connected')this.write(1,{cmd:'SET_ACTIVITY',args:{pid:this.pid,activity:null},nonce:String(++this.nonce)});this.last=null;if(this.connecting){this.revision++;const socket=this.socket;this.socket=null;this.connecting=false;this.state='idle';socket?.destroy();}}
 write(op,data){try{this.socket?.write(frame(op,data));return true;}catch{this.lost();return false;}}
 flush(){if(!this.desired||this.state!=='connected')return;const key=JSON.stringify(this.desired);if(key===this.last)return;const wait=Math.max(0,5000-(this.now()-this.lastAt));if(wait){if(!this.timer)this.timer=this.delay(()=>{this.timer=null;this.flush();},wait);this.timer?.unref?.();return;}if(this.write(1,{cmd:'SET_ACTIVITY',args:{pid:this.pid,activity:this.desired},nonce:String(++this.nonce)})){this.last=key;this.lastAt=this.now();}}
 ensure(){if(this.socket){this.flush();return;}if(this.connecting||!this.desired||!this.enabled)return;this.connecting=true;this.state='connecting';this.nonce=0;this.attempt(0,++this.revision);}
 attempt(index,revision){
  if(revision!==this.revision||!this.enabled||!this.desired){this.connecting=false;return;}
  if(index>=this.paths.length){this.connecting=false;this.state='unavailable';this.scheduleRetry();return;}
  let socket;try{socket=this.connect(this.paths[index]);}catch{return this.attempt(index+1,revision);}
  this.socket=socket;let buffer=Buffer.alloc(0),ready=false,finished=false;
  const fail=()=>{if(finished)return;finished=true;this.cancel(timeout);socket.destroy();if(this.socket===socket)this.socket=null;if(revision!==this.revision)return;if(ready){this.connecting=false;this.state='unavailable';this.last=null;this.scheduleRetry();}else this.attempt(index+1,revision);};
  const timeout=this.delay(fail,2000);timeout?.unref?.();socket.once('connect',()=>{if(revision===this.revision)this.write(0,{v:1,client_id:this.clientId});});socket.on('error',fail);socket.on('close',fail);
  socket.on('data',chunk=>{if(revision!==this.revision)return;buffer=Buffer.concat([buffer,chunk]);if(buffer.length>65544)return fail();
   while(buffer.length>=8){const op=buffer.readUInt32LE(0),length=buffer.readUInt32LE(4);if(length>65536)return fail();if(buffer.length<length+8)return;let data;try{data=JSON.parse(buffer.subarray(8,length+8).toString());}catch{return fail();}buffer=buffer.subarray(length+8);
    if(op===3){this.write(4,data);continue;}if(!data||typeof data!=='object')return fail();if(op===2||data.evt==='ERROR'){this.state='unavailable';return fail();}
    if(op===1&&data.evt==='READY'){ready=true;this.cancel(timeout);this.connecting=false;this.state='connected';this.last=null;this.lastAt=0;this.flush();}
   }
  });
 }
 scheduleRetry(){if(this.retry||!this.enabled||!this.desired)return;this.retry=this.delay(()=>{this.retry=null;this.ensure();},15000);this.retry?.unref?.();}
 lost(){const socket=this.socket;this.socket=null;socket?.destroy();this.state='unavailable';this.last=null;this.scheduleRetry();}
 disconnect(){this.clear();this.revision++;this.connecting=false;const socket=this.socket;this.socket=null;if(socket){socket.end();const timer=this.delay(()=>socket.destroy(),200);timer?.unref?.();}this.state='off';}
}
module.exports={DiscordPresenceClient,activityFor,frame,ipcPaths};
