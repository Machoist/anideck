/* Native wheel and middle-mouse motion must remain on Chromium's scrolling path. */
'use strict';
const SmoothWheel={
 activity(root){
  App.scrollUntil=Date.now()+200;
  if(this.entrancePage===root.firstElementChild)return;
  this.entrancePage=root.firstElementChild;
  root.classList.remove('view-in');
  root.classList.add('manual-scroll');
 },
 bind(){const root=document.getElementById('main');if(!root)return;
  // Never cancel input, inspect layout, or drive scroll offsets from the renderer thread.
  root.addEventListener('wheel',()=>this.activity(root),{passive:true});
  root.addEventListener('scroll',()=>this.activity(root),{capture:true,passive:true});
  root.addEventListener('pointerdown',event=>{if(event.button===1)this.activity(root);},{passive:true});
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>SmoothWheel.bind());else SmoothWheel.bind();
