/** Build the shared AniMus caption plugin from its editable source files. */
import {readFile,writeFile,readdir} from 'node:fs/promises';

const directory=new URL('../plugins/animus-caption-i18n/',import.meta.url);
const info=JSON.parse(await readFile(new URL('plugin-info.json',directory),'utf8'));
const tiddlers={};
for(const name of (await readdir(new URL('src/',directory))).sort()){
 if(!/\.(?:js|css)$/.test(name))continue;
 const text=await readFile(new URL('src/'+name,directory),'utf8');
 const title=/^title:\s*(.+)$/m.exec(text)?.[1]?.trim()||(name.endsWith('.css')?info.title+'/'+name:null);
 if(!title)throw Error(name+' requires a title header');
 const fields={title,type:name.endsWith('.css')?'text/css':'application/javascript',text};
 if(name.endsWith('.css'))fields.tags='$:/tags/Stylesheet';
 else{
  fields['module-type']=/^module-type:\s*(.+)$/m.exec(text)?.[1]?.trim();
  if(!fields['module-type'])throw Error(name+' requires a module-type header');
 }
 tiddlers[title]=fields;
}
const output=JSON.stringify({...info,text:JSON.stringify({tiddlers})},null,2)+'\n';
const target=new URL('dist/plugin.json',directory);
if(process.argv.includes('--check')){
 if(await readFile(target,'utf8')!==output)throw Error('AniMus caption dist is stale. Run node scripts/build-animus-caption-i18n.mjs');
}else await writeFile(target,output);
console.log(info.name,info.version);
