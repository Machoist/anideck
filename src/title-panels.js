// A title tab changes the panel, not the already mounted artwork/sidebar/navigation.
const TitlePanels={
 route(params){return JSON.stringify(Object.keys(params||{}).filter(key=>key!=='tab').sort().map(key=>[key,params[key]]));},
 prepare(oldView,oldParams,view,params,quiet,root){
  const tabs=['episodes','discussion','friends'],before=oldParams?.tab||'episodes',after=params?.tab||'episodes';
  if(!quiet||!['anime','show'].includes(view)||oldView!==view||!params.id||before===after||!tabs.includes(before)||!tabs.includes(after)||this.route(oldParams)!==this.route(params))return null;
  const panel=root.querySelector('.detail-main'),nav=panel?.querySelector('.title-sections');
  if(!panel||!nav||!root.querySelector('.detail-hero'))return null;
  return {root,panel,nav};
 },
 commit(state,html){
  if(!state||!state.panel.isConnected||state.root.querySelector('.detail-main')!==state.panel)return false;
  const template=document.createElement('template');template.innerHTML=html;
  const next=template.content.querySelector('.detail-main'),nav=next?.querySelector('.title-sections');if(!next||!nav)return false;
  const oldButtons=[...state.nav.querySelectorAll('[data-tab]')],newButtons=[...nav.querySelectorAll('[data-tab]')];
  if(oldButtons.length!==newButtons.length||oldButtons.some((button,i)=>button.dataset.tab!==newButtons[i].dataset.tab))return false;
  oldButtons.forEach((button,i)=>{button.classList.toggle('active',newButtons[i].classList.contains('active'));button.setAttribute('aria-current',newButtons[i].getAttribute('aria-current')||'false');});
  // Keep the tab buttons connected so keyboard focus and the reader's scroll position survive.
  for(const child of [...state.panel.children])if(child!==state.nav)child.remove();
  for(const child of [...next.children])if(child!==nav){child.classList.add('title-panel-enter');state.panel.append(child);}
  return true;
 }
};
