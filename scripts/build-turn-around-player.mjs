/** Keep the editable Turn Around player in its existing production bundle. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=new URL('../',import.meta.url);
export async function buildTurnAroundPlayer({check=false}={}){
  const source=await readFile(new URL('editions/turn-around/src/player.js',root),'utf8');
  const target=new URL('editions/turn-around/tiddlers/production.json',root);
  const original=await readFile(target,'utf8'),rows=JSON.parse(original);
  const row=rows.find(item=>item.title==='$:/plugins/maans/plato/player.js');
  if(!row)throw Error('Turn Around player is missing from production.json');
  if(row.text===source)return false;
  if(check)throw Error('Turn Around player bundle is stale. Run node scripts/build-turn-around-player.mjs');
  // Replace only this JSON string. Do not reformat or re-encode the artwork,
  // manuscript, scenes or any other tiddlers in the large production bundle.
  const before=JSON.stringify(row.text),at=original.indexOf(before);
  if(at<0||original.indexOf(before,at+before.length)!==-1)throw Error('Player source cannot be replaced unambiguously');
  const output=original.slice(0,at)+JSON.stringify(source)+original.slice(at+before.length);
  await writeFile(target,output);
  return true;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const changed=await buildTurnAroundPlayer({check:process.argv.includes('--check')});
  console.log(changed?'Updated Turn Around player':'Turn Around player is current');
}
