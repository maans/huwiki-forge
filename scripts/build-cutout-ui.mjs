/** Apply readable editing UI modules to the existing CutOut distribution.
 * The animation engine, model, players and publishing modules are preserved.
 */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory=fileURLToPath(new URL('../plugins/cutout/',import.meta.url));
const target=path.join(directory,'dist/plugin.json');
const original=await readFile(target,'utf8'),base=JSON.parse(original);
const info=JSON.parse(await readFile(path.join(directory,'plugin-info.json'),'utf8'));
const payload=JSON.parse(base.text);
for(const name of (await readdir(path.join(directory,'src'))).sort()){
 if(!/\.(?:js|css)$/.test(name))continue;
 const source=await readFile(path.join(directory,'src',name),'utf8');
 const title=/^title:\s*(.+)$/m.exec(source)?.[1]?.trim();
 if(!title)throw Error(name+' requires a title header');
 const fields={title,type:name.endsWith('.css')?'text/css':'application/javascript',text:source};
 if(name.endsWith('.css'))fields.tags='$:/tags/Stylesheet';
 else{
  fields['module-type']=/^module-type:\s*(.+)$/m.exec(source)?.[1]?.trim();
  if(!fields['module-type'])throw Error(name+' requires a module-type header');
 }
 payload.tiddlers[title]={...payload.tiddlers[title],...fields};
}
const result=JSON.stringify({...base,...info,text:JSON.stringify(payload)},null,2)+'\n';
if(process.argv.includes('--check')){
 if(result!==original)throw Error('CutOut editing UI distribution is stale. Run node scripts/build-cutout-ui.mjs');
}else await writeFile(target,result);
console.log(info.name,info.version,'editing UI; animation engine preserved');
