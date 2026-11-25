// Keep the converter readable while preserving the importer's bundled ABCJS and JSZip.
import {readFile,writeFile} from "node:fs/promises";
const base=new URL("../plugins/musescore-import/",import.meta.url);
const path=new URL("dist/plugin.json",base);
const original=await readFile(path,"utf8"),pkg=JSON.parse(original),payload=JSON.parse(pkg.text);
for(const file of ['converter.js','widget.js'])payload.tiddlers[pkg.title+'/'+file].text=await readFile(new URL('src/'+file,base),'utf8');
const info=JSON.parse(await readFile(new URL('plugin-info.json',base),'utf8'));
const next=JSON.stringify({...pkg,...info,text:JSON.stringify(payload)},null,2)+"\n";
if(process.argv.includes("--check")){
 if(original!==next)throw Error("Rebuild the MuseScore importer from its converter source.");
}else await writeFile(path,next);
