/** Keep Turn Around's normal runtime tiddlers aligned with editable sources. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=new URL('../',import.meta.url);
export async function buildTurnAroundPlayer({check=false}={}){
  const target=new URL('editions/turn-around/tiddlers/production.json',root);
  const original=await readFile(target,'utf8'),rows=JSON.parse(original);
  const modules=[
    ['$:/plugins/maans/plato/player.js','editions/turn-around/src/player.js'],
    // Normal tiddlers override plugin shadows. Leaving this copy stale would
    // silently disable shared editor features in the ordinary demo.
    ['$:/plugins/huwiki/musical/lipsync.js','plugins/musical/src/lipsync.js']
  ];
  let output=original;
  for(const [title,filename] of modules){
    const row=rows.find(item=>item.title===title),source=await readFile(new URL(filename,root),'utf8');
    if(!row)throw Error(title+' is missing from production.json');
    if(row.text===source)continue;
    if(check)throw Error(title+' is stale. Run node scripts/build-turn-around-player.mjs');
    // Replace only the module's JSON string, retaining artwork and authored cues.
    const before=JSON.stringify(row.text),at=output.indexOf(before);
    if(at<0||output.indexOf(before,at+before.length)!==-1)throw Error(title+' cannot be replaced unambiguously');
    output=output.slice(0,at)+JSON.stringify(source)+output.slice(at+before.length);
  }
  if(output===original)return false;
  await writeFile(target,output);
  return true;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const changed=await buildTurnAroundPlayer({check:process.argv.includes('--check')});
  console.log(changed?'Updated Turn Around runtime':'Turn Around runtime is current');
}
