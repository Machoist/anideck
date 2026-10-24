'use strict';
const video=document.getElementById('video'),welcome=document.getElementById('welcome'),message=document.getElementById('message'),activate=document.getElementById('activate'),nowPlaying=document.getElementById('now');
let token=null,revision=-1,media=null,hls=null,expires=0,playbackError='',starting=false,needsInteraction=false,lastSeek=0,pendingSeek=null;
async function api(path,data){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const r=await fetch(path,{method:data===undefined?'GET':'POST',signal:controller.signal,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
  const out=await r.json();if(!r.ok){const error=new Error(out.error||'Connection lost');error.status=r.status;throw error;}return out;
 }finally{clearTimeout(timer);}
}
function notice(text){nowPlaying.textContent=text;nowPlaying.hidden=!text;}
function stop(){media=null;needsInteraction=false;if(hls){hls.destroy();hls=null;}video.pause();video.removeAttribute('src');video.load();video.hidden=true;welcome.hidden=false;activate.hidden=true;notice('');}
async function play(){try{await video.play();needsInteraction=false;activate.hidden=true;notice('');}catch{needsInteraction=true;notice('Press Select on your TV remote to start the episode.');activate.textContent='▶ Play on TV';activate.hidden=false;activate.focus();}}
activate.onclick=()=>{video.requestFullscreen?.().catch(()=>{});return play();};
function load(next){stop();lastSeek=0;pendingSeek=null;media=next;playbackError='';video.hidden=false;welcome.hidden=true;notice(next.title);video.onloadedmetadata=()=>{const at=pendingSeek??next.at;if(at>0)video.currentTime=at;pendingSeek=null;};
 for(const track of [...video.querySelectorAll('track')])track.remove();
 for(const sub of next.subtitles||[]){const track=document.createElement('track');track.kind='subtitles';track.src=sub.url;track.label=sub.label;track.srclang=sub.language;track.default=true;video.appendChild(track);}
 if(next.isHLS&&window.Hls&&Hls.isSupported()){
  hls=new Hls({maxBufferLength:60,backBufferLength:30});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){playbackError='This stream could not play on the TV. Try another server or quality.';notice(playbackError);}});hls.loadSource(next.url);hls.attachMedia(video);
 }else if(!next.isHLS||video.canPlayType('application/vnd.apple.mpegurl'))video.src=next.url;
 else{playbackError='This TV browser does not support this video format.';notice(playbackError);return;}
 play();
}
video.addEventListener('error',()=>{if(media){playbackError='The TV could not play this video format. Try a different quality or server.';notice(playbackError);}});
video.addEventListener('playing',()=>{if(!playbackError)notice('');});
async function hello(){token=null;const r=await api('/hello',{name:/Silk/i.test(navigator.userAgent)?'Fire TV · Silk':'TV browser'});token=r.token;expires=Date.now()+r.expiresIn*1000;revision=-1;document.getElementById('code').textContent=r.code.slice(0,3)+' '+r.code.slice(3);message.textContent='The code expires in two minutes.';}
async function tick(){
 if(starting)return;starting=true;
 try{
  if(!token)await hello();
  const s=await api('/state');
  if(!s.connected&&Date.now()>expires){await hello();return;}
  document.getElementById('code').hidden=s.connected;
  document.getElementById('instructions').textContent=s.connected?'On your PC, choose a show in AniDeck and press Play. Your episode will appear here automatically. To watch on the PC instead, choose Continue on this PC in Cast to TV.':'In AniDeck on your PC, open Cast to TV and enter this code.';
  message.textContent=s.connected?'Connected · waiting for your episode':'The code expires in two minutes.';
  const heading=document.getElementById('receiver-heading');if(heading)heading.textContent=s.connected?'Your next episode goes here.':'Make yourself comfortable.';
  if(s.revision!==revision){revision=s.revision;
   if(s.media&&s.media.id!==media?.id)load(s.media);
   else if(s.action==='stop')stop();
   if(media&&s.seekRevision&&s.seekRevision!==lastSeek){lastSeek=s.seekRevision;pendingSeek=Math.min(s.seekTime,Number.isFinite(video.duration)?Math.max(0,video.duration-.25):s.seekTime);try{video.currentTime=pendingSeek;}catch{}}
   if(media&&s.paused===true)video.pause();
   else if(media&&s.action==='play')play();
  }
  if(media&&s.connected)await api('/playback',{mediaId:media.id,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:0,paused:video.paused,ended:video.ended,error:playbackError,needsInteraction,loading:video.readyState<3&&!video.ended});
 }catch(error){message.textContent='Connection lost. Keep AniDeck open on your PC. Retrying…';if(media)notice(error.message);if(error.status===401){stop();token=null;}}
 finally{starting=false;}
}
tick();setInterval(tick,1000);
