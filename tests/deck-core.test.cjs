const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/deck-core'),{prepareArtifact}=require('../src/artifactExport');
const a={id:'al:1',title:'Example',genres:['Sci-Fi'],poster:'https://art.example/cover.jpg',episodes:12};
const create=(s,id,name,tags=[])=>C.change(s,{type:'create',id,name,tags});
test('one title belongs to several decks independently; smart rules deduplicate manual titles',()=>{
 let s=create(C.initial(),'scifi','Science fiction',['Science Fiction']);s=C.change(s,{type:'add',deckId:'scifi',item:a});s=C.change(s,{type:'add',deckId:'tonight',item:a});assert.equal(s.decks.find(d=>d.id==='scifi').items.length,1);assert.equal(C.items(s.decks.find(d=>d.id==='scifi'),[a,{id:'al:2',genres:['Sci-Fi']}]).length,2);
 s=C.change(s,{type:'remove',deckId:'scifi',id:a.id});assert.equal(s.decks.find(d=>d.id==='tonight').items.length,1);assert.equal(C.initial().decks[0].items.length,0);
});
test('passing is local; undo restores decisions and preserves pre-existing deck membership',()=>{
 let s=C.change(C.initial(),{type:'add',deckId:'tonight',item:a});s=C.change(s,{type:'swipe',item:a,decision:'tonight',at:10});s=C.change(s,{type:'undo'});assert.equal(s.decks.find(d=>d.id==='tonight').items.length,1);assert.equal(s.swipes[a.id],undefined);
 s=C.change(s,{type:'swipe',item:a,decision:'priority',at:20});s=C.change(s,{type:'undo'});assert.equal(s.decks.find(d=>d.id==='priority').items.length,0);
 s=C.change(s,{type:'swipe',item:a,decision:'pass',at:30});assert.equal(s.swipes[a.id].decision,'pass');assert.equal(s.decks.find(d=>d.id==='tonight').items.length,1);
});
test('widget drag order, widths and visibility survive a storage round trip',()=>{
 let s=C.change(C.initial(),{type:'layout',id:'roulette',before:'quicklog',span:8,on:false});s=C.normalize(JSON.parse(JSON.stringify(s)));assert.equal(s.layout[0].id,'roulette');assert.equal(s.layout[0].span,8);assert.equal(s.layout[0].on,false);assert.throws(()=>C.change(s,{type:'layout',id:'quicklog',span:99}),/Invalid/);
});
test('portable decks round-trip atomically and reject oversized or executable imports',()=>{
 let s=C.change(C.initial(),{type:'add',deckId:'tonight',item:a});const file=C.exported(s.decks[0]);s=C.change(s,{type:'import',id:'copy',value:JSON.parse(JSON.stringify(file))});assert.equal(s.decks.find(d=>d.id==='copy').items[0].title,'Example');assert.equal(C.imported({...file,items:[{...a,poster:'javascript:alert(1)'}]}).items[0].poster,'');assert.throws(()=>C.imported({...file,items:Array(501).fill(a)}),/500/);assert.throws(()=>C.imported({...file,items:[{id:'../../secret',title:'Invalid'}]}),/supported/);assert.throws(()=>C.change(s,{type:'delete',deckId:'tonight'}),/built-in/);
});
test('activity deduplicates quick-log and playback records for the same episode and honors periods',()=>{
 let s=C.initial();const at=new Date(2026,9,23,12).getTime(),event={id:'1',title:'Example',key:'1:2:today',at,count:1,seconds:1440,genres:['Drama'],studios:['Studio']};s=C.change(s,{type:'events',events:[event,event,{...event,key:'1:3:today'}]});assert.equal(s.events.length,2);const stats=C.summary(s.events,at-1,at+1);assert.equal(stats.episodes,2);assert.equal(stats.seconds,2880);assert.equal(stats.titles,1);assert.equal(stats.days,1);assert.deepEqual(stats.studios,[['Studio',2]]);assert.equal(C.summary(s.events,at+1,at+1000).episodes,0);
});
test('export accepts only bounded JSON or PNG files with safe default names',()=>{
 assert.equal(prepareArtifact({type:'json',data:'{"a":1}',name:'../../My deck'}).name,'My deck.json');assert.throws(()=>prepareArtifact({type:'html',data:'<script>'}),/Unsupported/);assert.throws(()=>prepareArtifact({type:'png',data:'data:image/png;base64,YWJj'}),/Invalid/);assert.throws(()=>prepareArtifact({type:'json',data:'not json'}));const header=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');assert.equal(prepareArtifact({type:'png',data:'data:image/png;base64,'+header,name:'Review'}).name,'Review.png');
});

test('widget migration preserves preferences, defaults new modules off, and enforces the six-card limit',()=>{
 const state=C.initial();assert.equal(state.layout.filter(w=>w.on).length,4);assert(state.layout.every(w=>w.span===6));
 const old={...state,layout:state.layout.filter(w=>!['tonight','finishline'].includes(w.id)).map(w=>({...w,span:4,on:true}))};const restored=C.normalize(old);assert.equal(restored.layout.find(w=>w.id==='quicklog').span,4);assert.equal(restored.layout.find(w=>w.id==='tonight').on,false);
 let six=C.change(restored,{type:'layout',id:'tonight',on:true});assert.equal(six.layout.filter(w=>w.on).length,6);assert.throws(()=>C.change(six,{type:'layout',id:'finishline',on:true}),/Hide one/);six=C.change(six,{type:'layout',id:'airing',on:false});six=C.change(six,{type:'layout',id:'finishline',on:true});assert.equal(six.layout.filter(w=>w.on).length,6);
 const malformed=C.normalize({...state,layout:state.layout.map(w=>({...w,on:true}))});assert.equal(malformed.layout.filter(w=>w.on).length,6);
});
