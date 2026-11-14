import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const nativeRoot=fileURLToPath(new URL('../plugins/forgeshare/native/',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const sourceFiles={mac:['macos/ForgeShare.swift','macos/Icon.swift','macos/Info.plist','../helper/ForgeShare.mjs','../helper/help-da.html','../helper/help-en.html'],windows:['windows/ForgeShare.cs','windows/build.ps1']};
export const binaries={mac:['ForgeShare','ForgeShare.icns','CodeResources'],windows:['ForgeShare.exe']};
export async function manifest(platform) {
  const sources={},artifacts={};
  for(const file of sourceFiles[platform])sources[file]=sha(await readFile(path.join(nativeRoot,file)));
  for(const file of binaries[platform])artifacts[file]=sha(await readFile(path.join(nativeRoot,'compiled',file)));
  return {platform,sources,artifacts};
}
export async function checkNative(platform) {
  const expected=JSON.parse(await readFile(path.join(nativeRoot,'compiled',platform+'.json'),'utf8'));
  const actual=await manifest(platform);
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Native '+platform+' assets need rebuilding');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const platform=process.argv[2];
  if(!sourceFiles[platform])throw Error('Choose mac or windows');
  await writeFile(path.join(nativeRoot,'compiled',platform+'.json'),JSON.stringify(await manifest(platform),null,2)+'\n');
}
