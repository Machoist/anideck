// Renderer validates font decoding before committing bytes to the managed local store.
const SubtitleFont={
 face:null,name:'',busy:false,error:'',revision:0,ready:null,
 async decode(value){
  if(!value||typeof value.data!=='string'||value.data.length>5592408||typeof value.name!=='string')throw Error('The selected font could not be loaded.');
  const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));
  return new FontFace('AniDeckSubtitles',bytes).load();
 },
 apply(face,name=''){
  if(this.face)document.fonts.delete(this.face);
  this.face=face;this.name=name;
  if(face){document.fonts.add(face);document.documentElement.style.setProperty('--subtitle-font','"AniDeckSubtitles", var(--font)');}
  else document.documentElement.style.removeProperty('--subtitle-font');
  this.update();
 },
 init(){
  if(this.ready)return this.ready;
  const revision=this.revision;
  this.ready=(async()=>{try{const response=await window.native.subtitleFont('get');if(!response.ok)throw Error(response.error);if(!response.font)return;const face=await this.decode(response.font);if(revision===this.revision)this.apply(face,response.font.name);}catch(error){if(revision===this.revision){this.error=error.message;this.update();}}})();return this.ready;
 },
 async change(remove=false){
  if(this.busy)return;this.busy=true;this.error='';this.update();
  try{
   await this.init();++this.revision;this.error='';
   if(remove){const result=await window.native.subtitleFont('remove');if(!result.ok)throw Error(result.error);this.apply(null);return;}
   const picked=await window.native.subtitleFont('pick');if(!picked.ok)throw Error(picked.error);if(!picked.font)return;
   const face=await this.decode(picked.font);
   const saved=await window.native.subtitleFont('save',picked.font);if(!saved.ok)throw Error(saved.error);
   this.apply(face,picked.font.name);
  }catch(error){this.error=error.message||'That font could not be imported. Try another file.';}
  finally{this.busy=false;this.update();}
 },
 markup(){return `<div class="subtitle-font-card"><div class="subtitle-font-heading"><span class="subtitle-font-symbol" aria-hidden="true">Aa</span><div><h4>Your subtitle font</h4><p id="subtitle-font-name">Default · AniDeck</p></div></div><div class="subtitle-font-actions"><button class="btn ghost" id="subtitle-font-import">Import font</button><button class="subtitle-font-reset" id="subtitle-font-reset">Use default</button></div><p class="subtitle-font-help">TTF, OTF, WOFF or WOFF2 · up to 4 MB. Saved on this device.</p><p class="subtitle-font-error" id="subtitle-font-error" role="status" hidden></p></div>`;},
 update(){
  const name=document.querySelector('#subtitle-font-name'),button=document.querySelector('#subtitle-font-import'),reset=document.querySelector('#subtitle-font-reset'),error=document.querySelector('#subtitle-font-error');
  if(name)name.textContent=this.name||'Default · AniDeck';
  if(button){button.disabled=this.busy;button.textContent=this.busy?'Working…':this.name?'Replace font':'Import font';}
  if(reset){reset.hidden=!this.name&&!this.error;reset.disabled=this.busy;}
  if(error){error.textContent=this.error;error.hidden=!this.error;}
 },
 bind(){const add=document.querySelector('#subtitle-font-import'),reset=document.querySelector('#subtitle-font-reset');if(add)add.onclick=()=>this.change();if(reset)reset.onclick=()=>this.change(true);this.update();this.init();},
};
