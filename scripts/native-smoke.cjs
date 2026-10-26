/* Launch a packaged test app with its isolated, signed-out smoke-test profile. */
const path=require('node:path'),{spawn}=require('node:child_process');
const target=process.argv[2];if(!target)throw Error('Usage: node scripts/native-smoke.cjs path/to/AniDeck.exe-or-app');
const absolute=path.resolve(target),binary=absolute.endsWith('.app')?path.join(absolute,'Contents','MacOS','AniDeck'):absolute;
const child=spawn(binary,['--anideck-smoke-test'],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';
for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});
const timer=setTimeout(()=>{console.error('Native fresh-profile check timed out');child.kill();process.exitCode=1;},30000);
child.on('error',error=>{clearTimeout(timer);console.error(error.message);process.exitCode=1;});
child.on('close',code=>{clearTimeout(timer);if(code!==0||!output.includes('AniDeck native smoke check passed')||!output.includes('"signedOut":true')){console.error('Native check failed: exit='+code+'; signed-out completion='+output.includes('\"signedOut\":true'));process.exitCode=1;}});
