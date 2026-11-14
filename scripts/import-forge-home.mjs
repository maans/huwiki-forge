/** Import only existing editable landing-page text/design tiddlers from a native
 * TiddlyWiki Save download. No plugins, credentials, session state or new titles.
 * Review the diff, rebuild, test and submit through GitHub as usual.
 */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function readSavedTiddlers(html){
 const tiddlers=new Map();
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/class=["'][^"']*\btiddlywiki-tiddler-store\b/.test(match[1]))continue;
  const data=JSON.parse(match[2]);
  if(!Array.isArray(data))throw Error('Invalid TiddlyWiki store');
  for(const t of data){if(t&&typeof t.title==='string')tiddlers.set(t.title,t);}
 }
 if(!tiddlers.has('$:/core')||!tiddlers.has('HUWiki Forge'))throw Error('Not a saved Forge wiki');
 return tiddlers;
}
export function importTextFields(source,saved){
 return source.map(t=>{
  const incoming=saved.get(t.title);
  if(!incoming||typeof incoming.text!=='string')throw Error('Missing saved text: '+t.title);
  // Deliberately retain reviewed fields, tags, types and source ordering.
  return {...t,text:incoming.text};
 });
}
async function main(){
 if(!process.argv[2])throw Error('Usage: node scripts/import-forge-home.mjs /path/to/Forge.html');
 const saved=readSavedTiddlers(await readFile(path.resolve(process.argv[2]),'utf8'));
 const dir=path.resolve(import.meta.dirname,'../editions/forge/tiddlers');
 const changes=await Promise.all(['seed.json','design.json'].map(async name=>{
  const filename=path.join(dir,name);const old=JSON.parse(await readFile(filename,'utf8'));
  return {filename,text:JSON.stringify(importTextFields(old,saved),null,2)+'\n'};
 }));
 for(const change of changes)await writeFile(change.filename,change.text);
 console.log('Imported existing Forge texts and design only. Review diff, rebuild and test before publishing.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
