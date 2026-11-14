/**
 * HUWiki Forge public landing wiki.
 * Build a deterministic, editable TiddlyWiki5 from the same Edition Assembler
 * used for personal/local copies. No custom saver or Google integration.
 *
 * node scripts/build-forge-home.mjs
 */
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {assembleHtml,loadEdition} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
export async function editionIndex(){
 const catalog=JSON.parse(await readFile(path.join(root,"catalog/editions.json"),"utf8"));
 return catalog.editions.map(e=>({
  title:"$:/huwiki/forge/edition/"+e.id,tags:"$:/huwiki/forge/edition",text:"",
  "edition-id":e.id,name:e.name,status:e.status,version:e.version||"",order:e.home?.order||e.id,
  "build-url":"https://forge.måns.dk/assembler/?edition="+encodeURIComponent(e.id),
  "build-url-da":"https://forge.måns.dk/assembler/?edition="+encodeURIComponent(e.id)+"&lang=da",
  "build-url-en":"https://forge.måns.dk/assembler/?edition="+encodeURIComponent(e.id)+"&lang=en",
  "heading-da":e.home?.headingDa||e.name,"heading-en":e.home?.headingEn||e.name,
  "description-da":e.home?.descriptionDa||e.description,"description-en":e.home?.descriptionEn||e.description,
  "note-da":e.home?.noteDa||"Testudgave; browseraccept udestår.","note-en":e.home?.noteEn||"Test release; browser acceptance pending."
 }));
}
async function localFetch(url){
 const parsed=new URL(url);
 const expectedOrigin="https://forge.example";
 const prefix="/huwiki-forge/";
 if(parsed.origin!==expectedOrigin||!parsed.pathname.startsWith(prefix))
  return {ok:false,status:403};
 try {
  if(parsed.pathname===prefix+"editions/forge/tiddlers/edition-index.json")return {ok:true,status:200,json:editionIndex};
  const data=await readFile(path.join(root,parsed.pathname.slice(prefix.length)),"utf8");
  return {ok:true,status:200,json:async()=>JSON.parse(data)};
 }catch(error){
  return {ok:false,status:error.code==="ENOENT"?404:500};
 }
}
export async function buildForgeHome(){
 const {manifest,tiddlers}=await loadEdition(
  "https://forge.example/huwiki-forge/editions/forge/manifest.json",localFetch);
 if(manifest.id!=="forge"||manifest.coreVersion!=="5.4.1")
  throw Error("Forge landing wiki must use the approved Forge Edition and pinned core");
 const core=await readFile(path.join(root,"core/empty.html"),"utf8");
 return assembleHtml(core,tiddlers);
}
async function main(){
 const html=await buildForgeHome();
 const index=JSON.stringify(await editionIndex(),null,2)+"\n";
 const indexPath=path.join(root,"editions/forge/tiddlers/edition-index.json");
 if(process.argv.includes("--check")){
  if(await readFile(path.join(root,"index.html"),"utf8")!==html)throw Error("Stale index.html: run node scripts/build-forge-home.mjs");
  if(await readFile(indexPath,"utf8")!==index)throw Error("Stale Edition cards: run node scripts/build-forge-home.mjs");
  console.log("Public Forge wiki matches its sources");
  return;
 }
 await writeFile(indexPath,index);
 await writeFile(path.join(root,"index.html"),html);
 console.log("Built public Forge TiddlyWiki:",Buffer.byteLength(html),"bytes");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 await main();
}
