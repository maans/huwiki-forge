import {readFile,writeFile,readdir} from 'node:fs/promises';
const root=new URL('../plugins/print-article/',import.meta.url),target=new URL('dist/plugin.json',root);
const original=await readFile(target,'utf8'),plugin=JSON.parse(original),payload=JSON.parse(plugin.text);
for(const name of (await readdir(new URL('src/',root))).filter(name=>name.endsWith('.js')).sort()){
 const text=await readFile(new URL('src/'+name,root),'utf8'),title=/^title:\s*(.+)$/m.exec(text)?.[1]?.trim(),moduleType=/^module-type:\s*(.+)$/m.exec(text)?.[1]?.trim();
 if(!title?.startsWith(plugin.title+'/')||!moduleType)throw Error('Invalid module '+name);
 payload.tiddlers[title]={title,type:'application/javascript','module-type':moduleType,text};
}
plugin.version='0.2.10-test.1';plugin.text=JSON.stringify(payload);
const next=JSON.stringify(plugin,null,2)+'\n';
if(process.argv.includes('--check')){if(next!==original)throw Error('Publisher bundle is stale');}else await writeFile(target,next);
console.log('PDF Publisher',plugin.version);
