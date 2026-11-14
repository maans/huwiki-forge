/** Build a stand-alone Musical Edition HTML from pinned TiddlyWiki core and the manifest. */
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {loadEdition,assembleHtml} from "../assembler/assemble.mjs";
const root=path.resolve(import.meta.dirname,"..");
const fetchLocal=async url=>{
 const u=new URL(url);
 if(u.origin!=="https://forge.test" || !["/editions/","/plugins/","/themes/","/languages/"].some(prefix=>u.pathname.startsWith(prefix)))
  return {ok:false,status:403};
 try{
  const file=path.join(root,u.pathname.slice(1));
  const content=await readFile(file,"utf8");
  return {ok:true,status:200,json:async()=>JSON.parse(content)};
 }catch(e){return {ok:false,status:e.code==="ENOENT"?404:500};}
};
const {tiddlers}=await loadEdition("https://forge.test/editions/musical/manifest.json",fetchLocal);
const core=await readFile(path.join(root,"core/empty.html"),"utf8");
const output=path.join(root,"dist-musical");
await mkdir(output,{recursive:true});
await writeFile(path.join(output,"Musical-Edition-Prototyp.html"),assembleHtml(core,tiddlers));
console.log("Musical Edition HTML built with",tiddlers.length,"tiddlers / packages");
