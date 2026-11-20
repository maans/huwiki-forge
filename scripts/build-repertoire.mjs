/** Synchronize Repertoire's authored modules and stylesheet with its plugin package. */
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dir=path.join(root,"plugins/repertoire");
const target=path.join(dir,"dist/plugin.json");
const prefix="$:/plugins/huwiki/repertoire/";
const modules=["model.js","widget.js","book-widget.js","book-layout.js","practice.js"];

export async function buildRepertoire({check=false}={}){
 const previous=await readFile(target,"utf8");
 // Keep plugin metadata, help tiddlers and any extra package fields intact.
 const plugin=JSON.parse(previous),payload=JSON.parse(plugin.text);
 if(!payload.tiddlers||typeof payload.tiddlers!=="object")throw Error("Repertoire package has no tiddlers.");
 for(const file of modules){
  const text=await readFile(path.join(dir,"src",file),"utf8");
  const header=/^\/\*\\\r?\n([\s\S]*?)\r?\n\\\*\//.exec(text)?.[1];
  const title=/^title:\s*(.+)$/m.exec(header||"")?.[1]?.trim();
  const moduleType=/^module-type:\s*(.+)$/m.exec(header||"")?.[1]?.trim();
  if(title!==prefix+file||!moduleType)throw Error("Invalid Repertoire module header: "+file);
  // The source already includes its TW header: use it verbatim, exactly once.
  payload.tiddlers[title]={...payload.tiddlers[title],title,type:"application/javascript",
   "module-type":moduleType,text};
 }
 const styleTitle=prefix+"styles.css";
 payload.tiddlers[styleTitle]={...payload.tiddlers[styleTitle],title:styleTitle,type:"text/css",
  tags:payload.tiddlers[styleTitle]?.tags||"$:/tags/Stylesheet",
  text:await readFile(path.join(dir,"src/styles.css"),"utf8")};
 const result={...plugin,text:JSON.stringify(payload)};
 const output=JSON.stringify(result,null,2)+"\n";
 if(check){
  if(previous!==output)throw Error("Repertoire package is stale; run node scripts/build-repertoire.mjs");
 }else await writeFile(target,output);
 return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 buildRepertoire({check:process.argv.includes("--check")})
  .then(plugin=>console.log("Repertoire",plugin.version,process.argv.includes("--check")?"package verified":"package updated"))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
}
