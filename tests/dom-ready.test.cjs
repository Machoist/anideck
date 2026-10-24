const projectRoot = require('node:path').resolve(__dirname, '..');
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{EventEmitter}=require('events');
const src=fs.readFileSync(require('node:path').join(projectRoot, 'src/streamResolver.js'),'utf8');
const begin=src.indexOf('async function loadAnikotoPage'),end=src.indexOf('const dynamicStreamHeaders',begin);
const load=vm.runInNewContext('('+src.slice(begin,end).trim()+')',{setTimeout,clearTimeout,Error});
(async()=>{const contents=new EventEmitter();const win={webContents:contents,loadURL:()=>{queueMicrotask(()=>contents.emit('dom-ready'));return new Promise(()=>{})}};await load(win,'https://example.test');assert.equal(contents.listenerCount('dom-ready'),0);const failing={webContents:new EventEmitter(),loadURL:()=>Promise.reject(new Error('navigation failed'))};await assert.rejects(()=>load(failing,'https://example.test'),/navigation failed/);assert.equal(failing.webContents.listenerCount('dom-ready'),0);console.log('PASS: navigation proceeds at DOM readiness without full load, failures clean up listeners');})().catch(e=>{console.error(e);process.exitCode=1});
