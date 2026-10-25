const projectRoot = require('node:path').resolve(__dirname, '..');
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const stages = [], urls = []; let cleaned = false;
class BrowserWindow {
 constructor() { this.webContents = { session: { webRequest: { onBeforeSendHeaders: (...args) => { if(args[0] === null) cleaned = true; } } }, once(){}, removeListener(){}, setUserAgent(){}, setAudioMuted(){}, setWindowOpenHandler(){}, getURL:()=>urls.at(-1), executeJavaScript: async script => { if(script.includes("function discoverSubtitleTracks"))return [];
   assert(script.includes('"episodeNum":2')); assert(script.includes('"audio":"sub"'));
   const stage = script.match(/, "(search|episode|audio|player)"\)$/)[1]; stages.push(stage);
   if(stage === 'search') return {navigate:'https://anikototv.to/watch/black-clover-g7tjy/ep-1',stage:'episode'};
   if(stage === 'episode' && urls.at(-1).endsWith('ep-1')) return {navigate:'https://anikototv.to/watch/black-clover-g7tjy/ep-2',stage:'episode'};
   if(stage === 'episode') return {stage:'audio'};
   if(stage === 'audio') return {stage:'player',selected:true};
   return {stage:'player',streamUrl:'https://example.test/episode-2.m3u8'};
 } }; }
 async loadURL(url){urls.push(url)} isDestroyed(){return false} destroy(){}
}
const ctx={require:name=>name==='./providerSubtitles'?require('../src/providerSubtitles'):({BrowserWindow}),module:{exports:{}},process,console,URL,Map,AbortController,AbortSignal,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(require('node:path').join(projectRoot, 'src/streamResolver.js'),'utf8'),ctx);
(async()=>{const resolver=new ctx.module.exports();const result=await resolver.resolveAnikoto('Black Clover',2,'sub');assert(result.isHLS);assert(urls[0].includes('/filter?keyword=Black%20Clover'));assert(urls.at(-1).endsWith('ep-2'));assert.deepStrictEqual(stages,['search','episode','episode','audio','player']);assert(cleaned); const priorCount=urls.length; stages.length=0; await resolver.resolveAnikoto('Black Clover',2,'sub'); assert(urls[priorCount].includes('/watch/')); assert(!stages.includes('search')); await assert.rejects(()=>resolver.resolveAnikoto('Black Clover',2,'invalid'),/Unsupported/);console.log('PASS: navigation stages, requested parameters, result, cleanup, audio validation');})().catch(e=>{console.error(e);process.exitCode=1});
