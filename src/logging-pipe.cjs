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
module.exports={guardLoggingPipes};
