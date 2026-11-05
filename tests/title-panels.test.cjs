const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/title-panels.js'),'utf8');
function fixture(){
 const button=(tab,active=false)=>({dataset:{tab},attrs:{'aria-current':active?'page':'false'},classList:{contains:()=>active,toggle:(_,value)=>active=value},getAttribute(name){return this.attrs[name];},setAttribute(name,value){this.attrs[name]=value;}});
 const buttons=['episodes','discussion','friends'].map((tab,i)=>button(tab,i===0)),freshButtons=['episodes','discussion','friends'].map((tab,i)=>button(tab,i===1));
 const nav={querySelectorAll:()=>buttons},nextNav={querySelectorAll:()=>freshButtons};let removed=false,appended=[];
 const content={remove(){removed=true;}},freshContent={classList:{add(value){this.animation=value;}}},panel={isConnected:true,children:[nav,content],querySelector:()=>nav,append(value){appended.push(value);}},next={children:[nextNav,freshContent],querySelector:()=>nextNav};
 const root={querySelector:selector=>selector==='.detail-main'?panel:{}},helper=vm.runInNewContext(source+';TitlePanels',{document:{createElement:()=>({content:{querySelector:()=>next}})}});
 return {helper,panel,root,nav,buttons,freshButtons,freshContent,get removed(){return removed},appended};
}
test('only same-title quiet tab changes may retain mounted title content',()=>{
 const f=fixture(),old={id:'al:1',season:2},next={...old,tab:'discussion'};assert.ok(f.helper.prepare('anime',old,'anime',next,true,f.root));
 for(const [view,params,quiet] of [['anime',next,false],['show',next,true],['anime',{...next,id:'al:2'},true],['anime',{...next,season:3},true],['anime',{...next,tab:'unknown'},true],['anime',old,true]])assert.equal(f.helper.prepare('anime',old,view,params,quiet,f.root),null);
 assert.ok(f.helper.prepare('show',{season:2,id:'x'},'show',{tab:'friends',id:'x',season:2},true,f.root));
});
test('tab commit retains original navigation and replaces only panel content with current semantics',()=>{
 const f=fixture(),state=f.helper.prepare('anime',{id:1},'anime',{id:1,tab:'discussion'},true,f.root);assert.ok(f.helper.commit(state,'next'));assert.ok(f.removed);assert.equal(f.appended[0],f.freshContent);assert.equal(f.freshContent.classList.animation,'title-panel-enter');assert.equal(f.buttons[1].attrs['aria-current'],'page');assert.equal(f.buttons[0].attrs['aria-current'],'false');assert.equal(state.nav,f.nav);
});
test('disconnected/replaced panels and incompatible tabs fail closed before any mutation',()=>{
 const f=fixture(),state=f.helper.prepare('anime',{id:1},'anime',{id:1,tab:'discussion'},true,f.root);f.panel.isConnected=false;assert.equal(f.helper.commit(state,'next'),false);f.panel.isConnected=true;f.freshButtons.pop();assert.equal(f.helper.commit(state,'next'),false);assert.equal(f.removed,false);assert.equal(f.appended.length,0);
});
test('retained show/anime panels bind new social content without reloading resolved artwork or collapsing the introduction',async()=>{
 const appSource=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 for(const [name,end] of [['showAfter','  async movie('],['animeAfter','    const rows =']]){
  const calls={art:0,logo:0,story:0,related:0,social:0},story={dataset:{storyReady:'true'},expanded:true},related={dataset:{relatedReady:'true'}},nodes={'.detail-hero .hero-bg-img.on':{},'.detail-hero .hero-logo':{},'#title-story':story,'#related-box':related,'#show-social':{}};
  const a=appSource.indexOf(name==='animeAfter'?'  async animeAfter(':'  showAfter('),b=appSource.indexOf(end,a);let code=appSource.slice(a,b).trim();if(name==='animeAfter')code+='},';
  const method=vm.runInNewContext('({'+code+'}).'+name,{App:{paintSelection(){},params:{}},$:selector=>nodes[selector],TrackingRecovery:{bind(){}},checkRemoteEpisodes(){},upgradeBackdrop:()=>calls.art++,showLogo:()=>calls.logo++,enrichTitleStory:()=>{calls.story++;return Promise.resolve();},fillRelated:()=>calls.related++,fillSocial:()=>calls.social++,fillMissingThumbs(){}});
  await method({id:'al:1',tab:'discussion'},1,{retainedTitle:true});assert.deepEqual(calls,{art:0,logo:0,story:0,related:0,social:1});assert.equal(story.expanded,true);
 }
});
test('late episode availability keeps its navigation mounted and reuses existing title artwork',async()=>{
 const text=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),a=text.indexOf('async function paintRemoteEpisodes('),b=text.indexOf('function checkRemoteEpisodes(',a);
 for(const retained of [true,false]){
  const replaced=[],panel={querySelector:()=>({})},root={querySelector:()=>panel};let options,commits=0;
  const document={querySelector:selector=>selector==='#main'?root:{replaceWith:()=>replaced.push(selector)},createElement:()=>({content:{querySelector:()=>({})}})};
  const paint=vm.runInNewContext(text.slice(a,b)+';paintRemoteEpisodes',{document,App:{renderId:1,stale:()=>false,remoteEpisodeSnapshot:{id:'al:1',values:[]}},remotePlaybackProvider:()=> 'anikoto',TitlePanels:{commit:state=>{assert.equal(state.panel,panel);commits++;return retained;}},Views:{anime:async()=>'',animeAfter:(_p,_id,value)=>{options=value;}},console});
  await paint();assert.equal(commits,1);assert.equal(replaced.includes('.detail-main'),!retained);assert.ok(replaced.includes('.hero-actions'));assert.equal(options.retainedTitle,true);
 }
});
