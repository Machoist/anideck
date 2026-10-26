// Ad-hoc signing is only for private test artifacts, never a public release.
const path=require('node:path'),{createRequire}=require('node:module'),asar=require('@electron/asar');
async function sign(options){
 const metadata=JSON.parse(asar.extractFile(path.join(options.app,'Contents','Resources','app.asar'),'package.json'));
 if(!metadata.testBuild)throw Error('Ad-hoc signing requires an explicitly marked test build');
 const builderRequire=createRequire(require.resolve('app-builder-lib/package.json'));
 const {signAsync}=builderRequire('@electron/osx-sign');
 return signAsync({...options,identity:'-',identityValidation:false,preAutoEntitlements:false,preEmbedProvisioningProfile:false,
  optionsForFile:file=>({...options.optionsForFile?.(file),hardenedRuntime:false,timestamp:'none'})});
}
module.exports=sign;
