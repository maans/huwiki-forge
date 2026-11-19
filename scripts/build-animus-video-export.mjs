/** Package AniMus Video Export as an independent installable TiddlyWiki plugin. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildAniMusVideoExport(){
 const dir=path.join(root,'plugins/animus-video-export');
 const info=JSON.parse(await readFile(path.join(dir,'plugin-info.json'),'utf8'));
 const metadata=JSON.parse(await readFile(path.join(dir,'src/tiddlers.json'),'utf8'));
 const tiddlers={};
 for(const [title,fields] of Object.entries(metadata)){
  const {source,...other}=fields;
  tiddlers[title]={...other,...(source?{text:await readFile(path.join(dir,'src',source),'utf8')}:{})};
 }
 for(const filename of (await readdir(path.join(dir,'src'))).sort()){
  if(!/\.(js|css)$/.test(filename))continue;
  const text=await readFile(path.join(dir,'src',filename),'utf8');
  const title=/^title:\s*(.+)$/m.exec(text)?.[1]?.trim()||'$:/plugins/huwiki/animus-video-export/'+filename;
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
  if(await readFile(target,'utf8')!==output)throw Error('AniMus video export dist stale; run node scripts/build-animus-video-export.mjs');
 }else await writeFile(target,output);
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 buildAniMusVideoExport().then(x=>console.log(x.name,x.version)).catch(x=>{console.error(x);process.exitCode=1;});
}
