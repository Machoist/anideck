const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('src/filler-guide.js','utf8');
const row=(n,kind='Filler',date=`2000-01-0${n}`,title=`Episode ${n}`)=>`<tr><td class="Number">${n}</td><td class="Title"><a>${title}</a></td><td class="Type"><span>${kind}</span></td><td class="Date">${date}</td></tr>`;
const html=(heading='Example',rows=[row(1,'Anime Canon'),row(2,'Mixed Canon/Filler'),row(3,'Filler'),row(4,'Manga Canon')])=>`<h1>${heading} Filler List</h1><table>${rows.join('')}</table>`;
const evidence=()=>new Map([1,2,3,4].map(n=>[n,{title:`Episode ${n}`,date:`2000-01-0${n}`} ]));
function fixture(http=async()=>html()){return vm.runInNewContext(source+';FillerGuide',{Map,Set,Date,http});}
test('guide preserves four researched types and exact original numbering',()=>{const guide=fixture().parse(html());assert.deepEqual([...guide.episodes].map(([n,r])=>[n,r.classification]),[[1,'anime-canon'],[2,'mixed'],[3,'filler'],[4,'canon']]);});
test('guide requires exact full identity plus three independent numbered title AND date anchors',async()=>{
 const helper=fixture();assert.equal((await helper.resolve(['Example'],evidence())).anchors,4);
 assert.equal(await helper.resolve(['Example Season 2'],evidence()),null);
 assert.equal(await helper.resolve(['Example'],new Map([...evidence()].slice(0,2))),null);
 const shifted=new Map([...evidence()].map(([n,v])=>[n+10,v]));assert.equal(await helper.resolve(['Example'],shifted),null);
 const wrongDates=new Map([...evidence()].map(([n,v])=>[n,{...v,date:'1999-01-01'}]));assert.equal(await helper.resolve(['Example'],wrongDates),null);
});
test('404 for one full alias does not suppress a valid alternate title; concurrent guide reads deduplicate',async()=>{
 let calls=0;const helper=fixture(async url=>{calls++;if(url.endsWith('/other-name'))throw Object.assign(Error('404'),{status:404});return html();});
 const results=await Promise.all([helper.resolve(['Other Name','Example'],evidence()),helper.resolve(['Other Name','Example'],evidence())]);assert.equal(results[0].title,'Example');assert.equal(results[1].title,'Example');assert.equal(calls,2);
});
test('malformed or conflicting guide data never becomes skippable filler',()=>{
 const helper=fixture();assert.throws(()=>helper.parse('<html>blocked</html>'));assert.throws(()=>helper.parse('x'.repeat(2000001)));
 const guide=helper.parse(html('Example',[row(1,'Filler'),row(1,'Anime Canon'),row(1,'Filler'),row(2,'Unknown'),row(-1),row(3,'Filler','bad-date')]));assert.equal(guide.episodes.size,1);assert.equal(guide.episodes.get(1).classification,'unknown');
});
test('encoded episode titles normalize consistently without executing source markup',()=>{const helper=fixture();assert.equal(helper.norm('Chef&#039;s &amp; <b>Battle</b>!'),helper.norm("Chef's & Battle!"));});
