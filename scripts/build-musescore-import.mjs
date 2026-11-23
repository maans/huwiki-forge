// Keep the converter readable while preserving the importer's bundled ABCJS and JSZip.
import {readFile,writeFile} from "node:fs/promises";
const base=new URL("../plugins/musescore-import/",import.meta.url);
const path=new URL("dist/plugin.json",base);
const original=await readFile(path,"utf8"),pkg=JSON.parse(original),payload=JSON.parse(pkg.text);
payload.tiddlers[pkg.title+"/converter.js"].text=await readFile(new URL("src/converter.js",base),"utf8");
const next=JSON.stringify({...pkg,text:JSON.stringify(payload)},null,2)+"\n";
if(process.argv.includes("--check")){
 if(original!==next)throw Error("Rebuild the MuseScore importer from its converter source.");
}else await writeFile(path,next);
