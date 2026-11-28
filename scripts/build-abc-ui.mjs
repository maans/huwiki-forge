/** Apply readable reader UI fixes to the existing ABC distribution.
 * The notation and audio bundles are retained unchanged.
 */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {patchTabCollisions} from './abcjs-tab-collision-patch.mjs';

const directory=fileURLToPath(new URL('../plugins/abc/',import.meta.url));
const target=path.join(directory,'dist/plugin.json');
const original=await readFile(target,'utf8'),base=JSON.parse(original);
const info=JSON.parse(await readFile(path.join(directory,'plugin-info.json'),'utf8'));
const payload=JSON.parse(base.text);
const vendor=payload.tiddlers['$:/plugins/huwiki/abc/vendor/abcjs.js'];
vendor.text=patchTabCollisions(vendor.text);
for(const name of (await readdir(path.join(directory,'src'))).sort()){
 if(!/\.(?:js|tid)$/.test(name))continue;
 const source=await readFile(path.join(directory,'src',name),'utf8');
 let fields;
 if(name.endsWith('.js')){
  const title=/^title:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const type=/^module-type:\s*(.+)$/m.exec(source)?.[1]?.trim();
  if(!title||!type)throw Error(name+' requires title and module-type headers');
  fields={title,type:'application/javascript','module-type':type,text:source};
 }else{
  const split=source.indexOf('\n\n');if(split<0)throw Error(name+' requires a tiddler header');
  fields=Object.fromEntries(source.slice(0,split).split('\n').map(line=>{const at=line.indexOf(':');if(at<1)throw Error('Invalid field in '+name);return [line.slice(0,at),line.slice(at+1).trim()];}));
  fields.text=source.slice(split+2);
 }
 if(!fields.title)throw Error(name+' requires a title');
 payload.tiddlers[fields.title]={...payload.tiddlers[fields.title],...fields};
}
const result=JSON.stringify({...base,...info,text:JSON.stringify(payload)},null,2)+'\n';
if(process.argv.includes('--check')){
 if(result!==original)throw Error('ABC reader UI distribution is stale. Run node scripts/build-abc-ui.mjs');
}else await writeFile(target,result);
console.log(info.name,info.version,'reader UI; audio bundle preserved');
