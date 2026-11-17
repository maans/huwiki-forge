/** Build AniMus from editable source tiddlers. No network access is needed. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildAniMus(){
 const dir=path.join(root,'plugins/musical');
 const info=JSON.parse(await readFile(path.join(dir,'plugin-info.json'),'utf8'));
 const metadata=JSON.parse(await readFile(path.join(dir,'src/tiddlers.json'),'utf8'));
 const tiddlers={};
 for(const [title,fields] of Object.entries(metadata)){
  const {source,...record}=fields;
  tiddlers[title]={...record,...(source?{text:await readFile(path.join(dir,'src',source),'utf8')}:{})};
 }
 for(const filename of (await readdir(path.join(dir,'src'))).sort()){
  if(!/\.(js|css)$/.test(filename))continue;
  const text=await readFile(path.join(dir,'src',filename),'utf8');
  const title=/^title:\s*(.+)$/m.exec(text)?.[1]?.trim()||'$:/plugins/huwiki/musical/'+filename;
  if(tiddlers[title])continue;
  const type=filename.endsWith('.css')?'text/css':'application/javascript';
  const fields={title,type,text};
  if(type==='text/css')fields.tags='$:/tags/Stylesheet';
  else fields['module-type']=/^module-type:\s*(.+)$/m.exec(text)?.[1]?.trim()||'library';
  tiddlers[title]=fields;
 }
 const result={...info,text:JSON.stringify({tiddlers})};
 const output=JSON.stringify(result,null,2)+'\n';
 const target=path.join(dir,'dist/plugin.json');
 if(process.argv.includes('--check')){
  if(await readFile(target,'utf8')!==output)throw Error('AniMus dist is stale. Run node scripts/build-animus.mjs');
 }else await writeFile(target,output);
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const plugin=await buildAniMus();console.log(plugin.name,plugin.version,Object.keys(JSON.parse(plugin.text).tiddlers).length+' tiddlers');
}
