// Standalone Windows/Linux ZIPs can be built before macOS signing completes.
// Keep their content/order aligned with scripts/build-forgeshare.mjs.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {zip} from './build-forgeshare.mjs';
const root=fileURLToPath(new URL('../plugins/forgeshare/',import.meta.url));
const read=(p)=>readFile(path.join(root,p));
const native=process.argv.includes('--windows-native');
const name='0.1.19-test';
const share=(p,bytes,executable=false)=>({name:p,text:bytes,executable});
const sources={
  'windows-node':[
    share('Start-ForgeShare.cmd',await read('helper/Start-ForgeShare.cmd')),
    share('ForgeShare.mjs',await read('helper/ForgeShare.mjs'))],
  linux:[
    share('Start-ForgeShare.sh',await read('helper/Start-ForgeShare.sh'),true),
    share('ForgeShare.mjs',await read('helper/ForgeShare.mjs'),true)]
};
if(native)sources.windows=[
  share('ForgeShare.exe',await read('native/compiled/ForgeShare.exe')),
  share('ForgeShare.mjs',await read('helper/ForgeShare.mjs'))];
await mkdir(path.join(root,'dist'),{recursive:true});
const publicDir=fileURLToPath(new URL('../downloads/forgeshare/',import.meta.url));
await mkdir(publicDir,{recursive:true});
for(const [platform,files] of Object.entries(sources)){
  for(const mod of ['Vault.mjs','Bridge.mjs','Startup.mjs','Site.mjs'])
    files.push(share(mod,await read('helper/'+mod)));
  if(platform.startsWith('windows'))
    files.push(share('VaultWindows.ps1',await read('helper/VaultWindows.ps1')));
  for(const lang of ['da','en'])files.push(share('help-'+lang+'.html',await read('helper/help-'+lang+'.html')));
  files.push(share('README.txt',await read('helper/README.txt')));
  const dest=path.join(root,'dist','ForgeShare-'+platform+'.zip');
  await writeFile(dest,zip(files));
  await copyFile(dest,path.join(publicDir,'ForgeShare-'+platform+'-'+name+'.zip'));
  const expected=platform==='linux'?9:10;
  if(files.length!==expected)throw Error(platform+': unexpected package members');
  console.log('Built',platform,files.length,'files');
}
