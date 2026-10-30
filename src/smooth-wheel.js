/* Short, interruptible easing for discrete mouse wheels; trackpads retain native motion. */
'use strict';
const SmoothWheel={
 active:null,duration:120,
 cancel(){if(this.active)cancelAnimationFrame(this.active.frame);this.active=null;},
 target(event,root,axis,delta){
  const prop=axis==='x'?'scrollLeft':'scrollTop',size=axis==='x'?'clientWidth':'clientHeight',extent=axis==='x'?'scrollWidth':'scrollHeight';
  for(let el=event.target?.nodeType===1?event.target:event.target?.parentElement;el&&root.contains(el);el=el.parentElement){
   const style=getComputedStyle(el),overflow=axis==='x'?style.overflowX:style.overflowY,max=el[extent]-el[size];
   if(/auto|scroll/.test(overflow)&&max>1&&((delta>0&&el[prop]<max-1)||(delta<0&&el[prop]>1)))return {el,prop,max};
   if(el===root)break;
  }
  return null;
 },
 handle(event,root){
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.target?.closest?.('input,textarea,select,[contenteditable="true"],.menu,.ta-menu')){this.cancel();return;}
  let x=event.deltaX||0,y=event.deltaY||0;
  if(event.shiftKey&&!x){x=y;y=0;}
  const axis=Math.abs(x)>Math.abs(y)?'x':'y',raw=axis==='x'?x:y;
  // Small/fractional or diagonal pixel deltas are precision input, including momentum.
  if(!raw||App.settings.reduceMotion||(event.deltaMode===0&&(!Number.isInteger(raw)||Math.abs(raw)<40||(x&&y)))){this.cancel();return;}
  const delta=raw*(event.deltaMode===1?20:event.deltaMode===2?(axis==='x'?root.clientWidth:root.clientHeight):1),hit=this.target(event,root,axis,delta);
  if(!hit){this.cancel();return;}event.preventDefault();
  const current=hit.el[hit.prop],old=this.active,same=old?.el===hit.el&&old.prop===hit.prop,sameDirection=same&&Math.sign(old.end-current)===Math.sign(delta);
  const end=Math.max(0,Math.min(hit.max,(sameDirection?old.end:current)+delta));this.cancel();
  const state=this.active={...hit,start:current,end,began:performance.now(),page:root.firstElementChild,frame:null};
  const tick=now=>{if(this.active!==state)return;if(!state.el.isConnected||root.firstElementChild!==state.page||App.settings.reduceMotion){this.cancel();return;}
   const t=Math.min(1,Math.max(0,(now-state.began)/this.duration));state.el[state.prop]=state.start+(state.end-state.start)*(1-(1-t)**3);
   if(t<1)state.frame=requestAnimationFrame(tick);else this.active=null;
  };state.frame=requestAnimationFrame(tick);
 },
 bind(){const root=document.getElementById('main');if(!root)return;
  root.addEventListener('wheel',event=>this.handle(event,root),{passive:false});
  for(const name of ['pointerdown','touchstart'])root.addEventListener(name,()=>this.cancel(),{passive:true});
  document.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' '].includes(event.key))this.cancel();});
  window.addEventListener('blur',()=>this.cancel());window.addEventListener('resize',()=>this.cancel());
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>SmoothWheel.bind());else SmoothWheel.bind();
