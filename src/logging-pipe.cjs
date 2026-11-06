/* Detached launchers can close stdout/stderr while Electron is still running. */
'use strict';
const guarded=new WeakSet();
function guardLoggingPipes(...streams){
 for(const stream of streams){
  if(!stream||typeof stream.on!=='function'||guarded.has(stream))continue;
  guarded.add(stream);
  stream.on('error',error=>{if(error?.code!=='EPIPE')throw error;});
 }
}
const consoles=new WeakSet();
function guardConsole(target){
 if(!target||consoles.has(target))return;consoles.add(target);
 for(const name of ['log','info','warn','error','debug']){
  if(typeof target[name]!=='function')continue;const original=target[name].bind(target);
  target[name]=(...args)=>{try{return original(...args);}catch(error){if(error?.code!=='EPIPE')throw error;}};
 }
}
module.exports={guardLoggingPipes,guardConsole};
