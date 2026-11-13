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
async function localFetch(url){
 const parsed=new URL(url);
 const expectedOrigin="https://forge.example";
 const prefix="/huwiki-forge/";
 if(parsed.origin!==expectedOrigin||!parsed.pathname.startsWith(prefix))
  return {ok:false,status:403};
 try {
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
 await writeFile(path.join(root,"index.html"),html);
 console.log("Built public Forge TiddlyWiki:",Buffer.byteLength(html),"bytes");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 await main();
}
