/* AniDeck feature data: independent collections, widgets, local decisions and honest activity summaries. */
(function(root){
'use strict';
const MAX_WIDGETS=6;
const DEFAULT_WIDGETS=new Set(['quicklog','airing','decks','roulette']);
const WIDGETS=[['quicklog','Quick log',6],['airing','Airing countdown',6],['decks','Pinned decks',6],['roulette','What’s next?',6],['activity','Your activity',6],['tonight','Tonight’s picks',6],['finishline','Almost finished',6]];
const clone=value=>JSON.parse(JSON.stringify(value));
const text=(value,max=240)=>String(value||'').trim().slice(0,max);
const tag=value=>text(value,50).toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^scifi$/,'sciencefiction');
function art(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';for(const key of [...u.searchParams.keys()])if(/token|api.?key|authorization/i.test(key))u.searchParams.delete(key);return u.href;}catch{return '';}}
function title(value){
 if(!value||!/^((al:)?\d+|jf:[a-z0-9_-]+)$/i.test(String(value.id)))throw new Error('This title has no supported catalog ID.');
 return {id:String(value.id),title:text(value.title||value.Name)||'Untitled',poster:art(value.poster),episodes:Math.max(0,Math.min(10000,Number(value.episodes)||0)),genres:[...new Set((Array.isArray(value.genres)?value.genres:[]).map(x=>text(x,50)).filter(Boolean))].slice(0,20),malId:Number(value.malId)||null,year:text(value.year,8)};
}
function initial(){return {version:1,decks:[{id:'tonight',name:'Tonight',description:'Ready for your next watch.',tags:[],items:[],pinned:true},{id:'priority',name:'Priority',description:'The ones you want to get to first.',tags:[],items:[],pinned:true}],layout:WIDGETS.map(([id,,span])=>({id,span,on:DEFAULT_WIDGETS.has(id)})),swipes:{},events:[],undo:null};}
function normalize(raw){
 const state=initial();if(!raw||raw.version!==1)return state;
 const decks=Array.isArray(raw.decks)?raw.decks:[];
 state.decks=decks.slice(0,100).filter(d=>d&&typeof d.id==='string').map(d=>({...d,id:text(d.id,80),name:text(d.name,80)||'Untitled deck',description:text(d.description,300),tags:(Array.isArray(d.tags)?d.tags:[]).map(x=>text(x,50)).filter(Boolean).slice(0,12),pinned:!!d.pinned,items:(Array.isArray(d.items)?d.items:[]).slice(0,500).flatMap(a=>{try{return [title(a)];}catch{return [];}})}));
 for(const d of initial().decks)if(!state.decks.some(x=>x.id===d.id))state.decks.unshift(d);
 const layout=Array.isArray(raw.layout)?raw.layout:[];state.layout=WIDGETS.map(([id,,span])=>{const v=layout.find(x=>x.id===id);return {id,span:[4,6,8,12].includes(v?.span)?v.span:span,on:v?v.on!==false:DEFAULT_WIDGETS.has(id)};}).sort((a,b)=>{const pos=id=>{const n=layout.findIndex(x=>x.id===id);return n<0?99:n;};return pos(a.id)-pos(b.id);});
 let visible=0;state.layout.forEach(w=>{if(w.on&&++visible>MAX_WIDGETS)w.on=false;});
 state.swipes=raw.swipes&&typeof raw.swipes==='object'&&!Array.isArray(raw.swipes)?Object.fromEntries(Object.entries(raw.swipes).filter(([id,d])=>/^(al:)?\d+$/.test(id)&&['tonight','priority','pass'].includes(d?.decision)).slice(-5000)):{};
 state.events=(Array.isArray(raw.events)?raw.events:[]).filter(e=>e&&Number.isFinite(e.at)&&e.at>0&&e.title&&e.id).slice(-10000).map(e=>({...e,count:Math.max(1,Math.min(10000,Number(e.count)||1)),seconds:Math.max(0,Number(e.seconds)||0),genres:Array.isArray(e.genres)?e.genres.slice(0,20):[]}));
 if(raw.undo&&/^(al:)?\d+$/.test(String(raw.undo.id))&&['tonight','priority','pass'].includes(raw.undo.decision))state.undo={id:String(raw.undo.id),decision:raw.undo.decision,already:!!raw.undo.already,prior:raw.undo.prior&&['tonight','priority','pass'].includes(raw.undo.prior.decision)?raw.undo.prior:null};
 return state;
}
function items(deck,pool=[]){const map=new Map((deck?.items||[]).map(a=>[a.id,a]));if(deck?.tags?.length)for(const a of pool){if((a.genres||[]).some(g=>deck.tags.some(t=>tag(t)===tag(g))))map.set(a.id,a);}return [...map.values()];}
function change(input,action){
 const s=clone(input),deck=s.decks.find(d=>d.id===action.deckId);
 switch(action.type){
 case 'create':if(s.decks.length>=100)throw new Error('You can keep up to 100 decks.');if(!text(action.name,80))throw new Error('Give your deck a name.');if(s.decks.some(d=>d.id===action.id))throw new Error('That deck already exists.');s.decks.push({id:action.id,name:text(action.name,80),description:text(action.description,300),tags:(action.tags||[]).map(x=>text(x,50)).filter(Boolean).slice(0,12),pinned:true,items:[]});break;
 case 'edit':if(!deck)throw new Error('Deck not found.');deck.name=text(action.name,80)||deck.name;deck.description=text(action.description,300);deck.tags=(action.tags||[]).map(x=>text(x,50)).filter(Boolean).slice(0,12);break;
 case 'import':{if(s.decks.length>=100)throw new Error('You can keep up to 100 decks.');const d=imported(action.value);s.decks.push({id:action.id,...d,pinned:true});break;}
 case 'delete':if(['tonight','priority'].includes(action.deckId))throw new Error('Tonight and Priority are built-in decks.');s.decks=s.decks.filter(d=>d.id!==action.deckId);break;
 case 'pin':if(deck)deck.pinned=!deck.pinned;break;
 case 'add':if(!deck)throw new Error('Deck not found.');{const a=title(action.item);if(!deck.items.some(x=>x.id===a.id)){if(deck.items.length>=500)throw new Error('A deck can hold up to 500 titles.');deck.items.push(a);}}break;
 case 'remove':if(deck)deck.items=deck.items.filter(a=>a.id!==action.id);break;
 case 'layout':{const a=s.layout.find(x=>x.id===action.id);if(!a)throw new Error('Unknown widget.');if(action.span!==undefined){if(![4,6,8,12].includes(action.span))throw new Error('Invalid widget width.');a.span=action.span;}if(action.on===true&&!a.on&&s.layout.filter(w=>w.on).length>=MAX_WIDGETS)throw new Error('Keep up to '+MAX_WIDGETS+' widgets on Home. Hide one before adding another.');if(action.on!==undefined)a.on=!!action.on;if(action.before){const index=s.layout.indexOf(a);s.layout.splice(index,1);const target=s.layout.findIndex(x=>x.id===action.before);s.layout.splice(target<0?s.layout.length:target,0,a);}}break;
 case 'swipe':{if(!['tonight','priority','pass'].includes(action.decision))throw new Error('Unknown decision.');const a=title(action.item);s.undo={id:a.id,prior:s.swipes[a.id]||null,decision:action.decision,already:s.decks.find(d=>d.id===action.decision)?.items.some(x=>x.id===a.id)||false};s.swipes[a.id]={decision:action.decision,at:action.at};if(action.decision!=='pass'){const d=s.decks.find(x=>x.id===action.decision);if(!d.items.some(x=>x.id===a.id)){if(d.items.length>=500)throw new Error('This deck is full. Remove a title first.');if(action.decision==='priority')d.items.unshift(a);else d.items.push(a);}}break;}
 case 'undo':{const u=s.undo;if(!u)break;if(u.prior)s.swipes[u.id]=u.prior;else delete s.swipes[u.id];if(!u.already){const d=s.decks.find(x=>x.id===u.decision);if(d)d.items=d.items.filter(a=>a.id!==u.id);}s.undo=null;break;}
 case 'reset-swipes':s.swipes=Object.fromEntries(Object.entries(s.swipes).filter(([,d])=>d.decision!=='pass'));s.undo=null;break;
 case 'event':
 case 'events':{const incoming=action.type==='events'?action.events:[action.event];if(!Array.isArray(incoming)||incoming.length>10000)throw new Error('Too many activity records.');for(const e of incoming){if(!e||!Number.isFinite(e.at)||!e.id||!e.title)throw new Error('Invalid activity record.');if(e.key&&s.events.some(x=>x.key===e.key))continue;s.events.push({...e,title:text(e.title),genres:(e.genres||[]).map(x=>text(x,50)).slice(0,20),studios:(e.studios||[]).map(x=>text(x,80)).slice(0,10),count:Math.max(1,Math.min(10000,Number(e.count)||1)),seconds:Math.max(0,Number(e.seconds)||0)});}s.events=s.events.slice(-10000);break;}
 default:throw new Error('Unknown deck action.');
 }
 return s;
}
function exported(deck){if(deck.items.length>500)throw new Error('Narrow this deck to 500 titles or fewer before sharing.');return {format:'anideck-deck',version:1,name:deck.name,description:deck.description,tags:deck.tags,items:deck.items.map(a=>({...title(a),poster:a.id.startsWith('jf:')?'':art(a.poster)}))};}
function imported(raw){
 if(!raw||raw.format!=='anideck-deck'||raw.version!==1||!Array.isArray(raw.items))throw new Error('This is not an AniDeck deck file.');
 if(raw.items.length>500)throw new Error('Deck files can contain up to 500 titles.');
 const name=text(raw.name,80);if(!name)throw new Error('The deck needs a name.');
 const titles=raw.items.map(title);return {name,description:text(raw.description,300),tags:(Array.isArray(raw.tags)?raw.tags:[]).map(x=>text(x,50)).slice(0,12),items:[...new Map(titles.map(a=>[a.id,a])).values()]};
}
function summary(events,from,to){
 const selected=events.filter(e=>e.at>=from&&e.at<to),titles=new Map(),genres=new Map(),studios=new Map(),days=new Set();
 let episodes=0,seconds=0;
 for(const e of selected){episodes+=Number(e.count)||1;seconds+=Number(e.seconds)||0;const d=new Date(e.at);days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);titles.set(e.id,(titles.get(e.id)||0)+(Number(e.count)||1));for(const g of new Set(e.genres||[]))genres.set(g,(genres.get(g)||0)+(Number(e.count)||1));for(const studio of new Set(e.studios||[]))studios.set(studio,(studios.get(studio)||0)+(Number(e.count)||1));}
 return {episodes,seconds,titles:titles.size,days:days.size,genres:[...genres].sort((a,b)=>b[1]-a[1]).slice(0,3),studios:[...studios].sort((a,b)=>b[1]-a[1]).slice(0,3),events:selected.length};
}
const api={WIDGETS,MAX_WIDGETS,initial,normalize,title,items,change,exported,imported,summary,tag};
if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckCore=api;
})(globalThis);
