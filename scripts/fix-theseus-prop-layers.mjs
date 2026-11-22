import {readFile,writeFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function correctScene(scene,english=false){
 const parts=scene.parts||[],by=Object.fromEntries(parts.map(p=>[p.id,p])),props=[];
 for(const [id,da,en] of [['kept-plank','Planken med tre hak','Notched plank'],['saved-plank','Den gemte planke','Saved plank'],['saved-parts-shelf','Bord til de gemte dele','Table for the saved parts'],['bench','Bord','Table'],['nameplate','Navneplanken','Name board']])if(by[id]){by[id].name=english?en:da;props.push(id);}
 if(!props.length)return scene;
 for(const [a,b,id,da,en] of [['saved-parts-shelf','saved-plank','saved-timber','Bord og planke','Table and plank'],['bench','nameplate','bench-and-board','Bord og navneplanke','Table and name board']])if(by[a]&&by[b]){
  if(!by[id]){by[id]={id,name:english?en:da,type:'group',keys:[{t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1}]};parts.splice(Math.min(parts.indexOf(by[a]),parts.indexOf(by[b])),0,by[id]);}
  by[a].parent=id;by[b].parent=id;props.push(id);
 }
 function owner(p){const seen=new Set();while(by[p.parent]&&!seen.has(p.id)){seen.add(p.id);p=by[p.parent];}return p.id;}
 const moved=parts.filter(p=>props.includes(owner(p))),rest=parts.filter(p=>!props.includes(owner(p)));
 let at=rest.findIndex(p=>['mara','pip','ione'].includes(p.id));if(at<0)at=rest.length;
 scene.parts=[...rest.slice(0,at),...moved,...rest.slice(at)];return scene;
}
async function main(){const dir=new URL('../editions/theseus-ship/tiddlers/',import.meta.url);let count=0;
 for(const name of await readdir(dir)){if(!/^production-pages-\d+\.json$/.test(name))continue;const file=new URL(name,dir),data=JSON.parse(await readFile(file,'utf8'));let changed=false;
  for(const t of data){let scene;try{scene=JSON.parse(t.text);}catch{continue;}if(!scene?.parts?.length)continue;const before=JSON.stringify(scene),after=JSON.stringify(correctScene(scene,t.title.endsWith(' · English')));if(before!==after){t.text=after;changed=true;count++;}}
  if(changed)await writeFile(file,JSON.stringify(data,null,2)+'\n');
 }console.log('Corrected '+count+' Theseus scenes');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
