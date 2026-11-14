import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
const root=new URL('../plugins/ai/',import.meta.url),meta=JSON.parse(await readFile(new URL('plugin-info.json',root)));
const tiddlers={};for(const file of (await readdir(new URL('src/',root))).sort()){const t=JSON.parse(await readFile(new URL('src/'+file,root)));if(tiddlers[t.title])throw Error('Duplicate');if(t['module-type'])new Function('require','exports','module',t.text);tiddlers[t.title]=t;}
await mkdir(new URL('dist/',root),{recursive:true});await writeFile(new URL('dist/plugin.json',root),JSON.stringify({...meta,text:JSON.stringify({tiddlers})},null,2)+'\n');
