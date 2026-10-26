const path=require('node:path'),{spawn}=require('node:child_process');
const bundle=process.argv[2];if(process.platform!=='darwin'||!bundle)throw Error('Usage on macOS: node scripts/mac-smoke.cjs path/to/AniDeck.app');
const child=spawn(path.join(path.resolve(bundle),'Contents','MacOS','AniDeck'),['--anideck-smoke-test'],{stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});
const timer=setTimeout(()=>{console.error('Native smoke check timed out');child.kill('SIGKILL');process.exitCode=1;},45000);
child.on('error',error=>{clearTimeout(timer);console.error(error.message);process.exitCode=1;});
child.on('close',code=>{clearTimeout(timer);if(code!==0||!output.includes('AniDeck native smoke check passed'))process.exitCode=1;});
