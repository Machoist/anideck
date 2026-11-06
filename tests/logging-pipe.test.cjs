const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {guardLoggingPipes}=require('../src/logging-pipe.cjs');
test('closed stdout/stderr pipes do not crash the main process and registration is idempotent',()=>{const out=new EventEmitter(),err=new EventEmitter();guardLoggingPipes(out,err);guardLoggingPipes(out,err);for(const stream of [out,err]){assert.equal(stream.listenerCount('error'),1);assert.doesNotThrow(()=>stream.emit('error',Object.assign(Error('broken pipe'),{code:'EPIPE'})));}});
test('unrelated logging failures remain visible rather than being silently swallowed',()=>{const stream=new EventEmitter();guardLoggingPipes(stream,null);const error=Object.assign(Error('Other failure'),{code:'EIO'});assert.throws(()=>stream.emit('error',error),e=>e===error);});

test('synchronous Electron console EPIPE is contained without hiding other failures',()=>{
 const {guardConsole}=require('../src/logging-pipe.cjs');let calls=0;const target={log(){calls++;throw Object.assign(Error('closed launcher pipe'),{code:'EPIPE'});},error(){throw Object.assign(Error('disk'),{code:'EIO'});}};
 guardConsole(target);const once=target.log;guardConsole(target);assert.equal(target.log,once);assert.doesNotThrow(()=>target.log('message'));assert.equal(calls,1);assert.throws(()=>target.error('message'),{code:'EIO'});
});
