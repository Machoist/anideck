// One user-chosen local font, kept outside settings/account data. No arbitrary path IPC.
const fs=require('node:fs/promises'),path=require('node:path');
const MAX_BYTES=4*1024*1024,MAX_JSON=Math.ceil(MAX_BYTES/3)*4+1024;
const formats={ttf:'00010000',otf:'4f54544f',woff:'774f4646',woff2:'774f4632'};
function validateFont(value){
 if(!value||typeof value.name!=='string'||value.name.length>512||typeof value.data!=='string'||value.data.length>Math.ceil(MAX_BYTES/3)*4||!value.data.length||value.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))throw Error('Choose a valid font file, up to 4 MB.');
 const name=path.basename(value.name).replace(/[\x00-\x1f\x7f]/g,'').slice(0,180),ext=path.extname(name).slice(1).toLowerCase(),bytes=Buffer.from(value.data,'base64');
 if(!formats[ext]||bytes.length<12||bytes.length>MAX_BYTES||bytes.subarray(0,4).toString('hex')!==formats[ext])throw Error('Use a TTF, OTF, WOFF or WOFF2 font, up to 4 MB.');
 return {name,data:bytes.toString('base64')};
}
function createFontStore(directory){
 const file=path.join(directory,'subtitle-font.json');
 return {
  async read(){try{if((await fs.stat(file)).size>MAX_JSON)throw Error('Saved font is too large.');return validateFont(JSON.parse(await fs.readFile(file,'utf8')));}catch(error){if(error.code==='ENOENT')return null;throw Error('The saved subtitle font could not be loaded. Import it again or restore the default.');}},
  async save(value){const font=validateFont(value);await fs.mkdir(directory,{recursive:true});const temp=file+'.tmp';try{await fs.writeFile(temp,JSON.stringify(font));await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}return font;},
  async remove(){await fs.rm(file,{force:true});},
 };
}
async function pickFont(dialog,parent){
 const result=await dialog.showOpenDialog(parent,{title:'Import subtitle font — AniDeck',buttonLabel:'Choose font',properties:['openFile'],filters:[{name:'Subtitle fonts (up to 4 MB)',extensions:Object.keys(formats)}]});
 if(result.canceled||!result.filePaths?.[0])return null;
 const file=result.filePaths[0],handle=await fs.open(file,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Choose a font file up to 4 MB.');const bytes=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead!==stat.size)throw Error('The font changed while reading. Choose it again.');return validateFont({name:path.basename(file),data:bytes.subarray(0,bytesRead).toString('base64')});}finally{await handle.close();}
}
module.exports={MAX_BYTES,validateFont,createFontStore,pickFont};
