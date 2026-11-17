/** Rebuild SitePublisher from its readable source tiddlers. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'plugins/site-publisher');
const info=JSON.parse(await readFile(path.join(directory,'plugin-info.json'),'utf8'));
const metadata=JSON.parse(await readFile(path.join(directory,'src/tiddlers.json'),'utf8'));
const tiddlers={};
for(const [title,fields] of Object.entries(metadata)){
 const {source,...data}=fields;
 tiddlers[title]={...data,...(source?{text:await readFile(path.join(directory,'src',source),'utf8')}:{})};
}
// Adapters are ordinary functions in the startup module. Keep the readable
// copies identical so changing an adapter cannot silently leave dist stale.
const startup=tiddlers['$:/plugins/huwiki/site-publisher/startup.js'].text;
for(const name of ['media-export.js','drawing-export.js','animus-export.js','animus-presentation.js']){
 const adapter=await readFile(path.join(directory,'src',name),'utf8');
 if(!startup.includes(adapter.trim()))throw Error(name+' must match its bundled section in publisher.js');
}
const output=JSON.stringify({...info,text:JSON.stringify({tiddlers})},null,2)+'\n';
const target=path.join(directory,'dist/plugin.json');
if(process.argv.includes('--check')){
 if(await readFile(target,'utf8')!==output)throw Error('SitePublisher dist is stale. Run node scripts/build-site-publisher.mjs');
}else await writeFile(target,output);
console.log(info.name,info.version,Object.keys(tiddlers).length+' tiddlers');
