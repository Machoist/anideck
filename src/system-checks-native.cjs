'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
// A separate temporary file and generated value; never read or rewrite account files.
function storageCheck(safeStorage,directory=os.tmpdir()){
 let folder,file;const result={storage:false,secureStorage:false};
 try{folder=fs.mkdtempSync(path.join(directory,'anideck-check-'));file=path.join(folder,'roundtrip');const sample=crypto.randomBytes(32).toString('hex');fs.writeFileSync(file,sample);result.storage=fs.readFileSync(file,'utf8')===sample;
  if(safeStorage.isEncryptionAvailable())result.secureStorage=safeStorage.decryptString(safeStorage.encryptString(sample))===sample;
 }catch{}finally{try{if(file&&fs.existsSync(file))fs.unlinkSync(file);}catch{result.storage=false;}try{if(folder)fs.rmdirSync(folder);}catch{result.storage=false;}}
 return result;
}
module.exports={storageCheck};
