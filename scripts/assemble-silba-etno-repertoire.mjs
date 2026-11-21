/** Build SilbaÄtno Repertoire using the native Forge Edition Assembler. */
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
const config=JSON.parse(await readFile(path.join(folder,"tiddlers/config.json"),"utf8"));
const overview=config.find(t=>t.title==="SilbaÄtno Repertoire – Oversigt");
if(!overview||!overview.text.includes("/editions/silva-ethno-repertoire/site/index.html"))throw Error("Site link absent from homepage");
if(process.argv.includes("--with-site")){
 const {stat}=await import("node:fs/promises");
 const result=await stat(path.join(folder,"site/index.html"));
 if(result.size<30000)throw Error("SitePublisher audience HTML is missing");
}
const assembled=await loadEdition(
 "https://local.invalid/forge/editions/silva-ethno-repertoire/manifest.json",localFetch);
const scores=assembled.tiddlers.filter(t=>String(t.tags||"").split(/\s+/).includes("SilbaÄtnoTrack")&&t["abc-source"]&&!t["repertoire-sheet-format"]);
const charts=assembled.tiddlers.filter(t=>String(t.tags||"").split(/\s+/).includes("SilbaÄtnoTrack")&&t["abc-source"]&&t["repertoire-sheet-format"]==="chords");
if(scores.length!==17||charts.length!==1)throw Error("Cannot publish: expected 17 original ABC scores and one editable chord sheet, got "+scores.length+" + "+charts.length);
const core=await readFile(path.join(root,"core/empty.html"),"utf8");
const html=assembleHtml(core,assembled.tiddlers);
await writeFile(path.join(folder,"index.html"),html);
console.log("Editable SilbaÄtno Repertoire wiki:",Buffer.byteLength(html),"bytes",scores.length,"scores plus",charts.length,"chord chart");
