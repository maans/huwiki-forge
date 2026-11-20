/**
 * Regenerate the independent TiddlyWiki Repertoire plugin from its source
 * modules without duplicating or altering the original score files.
 *
 * node scripts/build-repertoire-plugin.mjs
 * node scripts/build-repertoire-plugin.mjs --check
 */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory=fileURLToPath(new URL('../plugins/repertoire/',import.meta.url));
const dist=path.join(directory,'dist/plugin.json');
const original=await readFile(dist,'utf8');
const base=JSON.parse(original),payload=JSON.parse(base.text);
const info=JSON.parse(await readFile(path.join(directory,'plugin-info.json'),'utf8'));
for(const file of (await readdir(path.join(directory,'src'))).filter(name=>name.endsWith('.js')).sort()){
 const src=await readFile(path.join(directory,'src',file),'utf8');
 const title=/^title:\s*(.+)$/m.exec(src)?.[1]?.trim();
 const moduleType=/^module-type:\s*(.+)$/m.exec(src)?.[1]?.trim();
 if(!title||!moduleType||!title.startsWith('$:/plugins/huwiki/repertoire/'))
  throw Error('Invalid module header in '+file);
 payload.tiddlers[title]={...payload.tiddlers[title],title,type:'application/javascript','module-type':moduleType,text:src};
}
// Keep the Repertoire stylesheet in source control as well as the plugin package.
const stylesheetTitle="$:/plugins/huwiki/repertoire/styles.css";
if(!payload.tiddlers[stylesheetTitle])throw Error("Missing Repertoire stylesheet");
payload.tiddlers[stylesheetTitle]={...payload.tiddlers[stylesheetTitle],text:await readFile(path.join(directory,"src/styles.css"),"utf8")};
const next=JSON.stringify({...base,...info,text:JSON.stringify(payload)},null,2)+'\n';
if(process.argv.includes('--check')){
 if(next!==original)throw Error('Repertoire plugin is stale. Run node scripts/build-repertoire-plugin.mjs');
}else await writeFile(dist,next);
console.log('Repertoire plugin',info.version,'with',Object.keys(payload.tiddlers).length,'tiddlers');
