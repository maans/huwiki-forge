/** Build Silba Etno Repertoire using the native Forge Edition Assembler. */
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {assembleHtml,loadEdition} from "../assembler/assemble.mjs";
const root=path.resolve(import.meta.dirname,"..");
const prefix="/forge/";
async function localFetch(value){
 const url=new URL(value);
 if(url.origin!=="https://local.invalid"||!url.pathname.startsWith(prefix))
  return {ok:false,status:403};
 const file=path.join(root,url.pathname.slice(prefix.length));
 try {
  const json=JSON.parse(await readFile(file,"utf8"));
  return {ok:true,status:200,json:async()=>json};
 }catch(error){
  return {ok:false,status:error.code==="ENOENT"?404:500};
 }
}
const folder=path.join(root,"editions/silva-ethno-repertoire");
const configFile=path.join(folder,"tiddlers/config.json");
const hasSite=process.argv.includes("--with-site");
if(hasSite){
 const config=JSON.parse(await readFile(configFile,"utf8"));
 const overview=config.find(t=>t.title==="Silba Etno Repertoire – Oversigt");
 if(!overview)throw Error("Repertoire overview missing");
 const link='<p><a href="./site/index.html" target="_blank" rel="noopener">Åbn publikumsvisningen (én HTML-fil)</a></p>';
 if(!overview.text.includes("href=\"./site/index.html\""))overview.text+="\n\n"+link;
 await writeFile(configFile,JSON.stringify(config,null,2)+"\n");
}
const assembled=await loadEdition(
 "https://local.invalid/forge/editions/silva-ethno-repertoire/manifest.json",localFetch);
const scores=assembled.tiddlers.filter(t=>String(t.tags||"").split(/\s+/).includes("SilvaEthnoTrack")&&t["abc-source"]);
if(scores.length!==17)throw Error("Cannot publish: expected 17 playable ABC scores, got "+scores.length);
const core=await readFile(path.join(root,"core/empty.html"),"utf8");
const html=assembleHtml(core,assembled.tiddlers);
await writeFile(path.join(folder,"index.html"),html);
console.log("Editable Silba Etno Repertoire wiki:",Buffer.byteLength(html),"bytes",scores.length,"scores");
