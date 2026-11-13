/**
 * Build a version-accurate index for TiddlyWiki's native Get More Plugins modal.
 * Packages are the original plugin.json/theme.json in plugins/ and themes/.
 * Only short metadata is duplicated; the actual plugin is fetched on demand.
 * Run from the repository root: node scripts/build-forge-plugin-library.mjs
 */
import {readdir,readFile,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";

const root=process.cwd();
const library=path.join(root,"library/plugins");
const paths=[];
for(const [dir,file] of [["plugins","plugin.json"],["themes","theme.json"]]){
 for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const relative=dir+"/"+entry.name+"/dist/"+file;
  try{await readFile(path.join(root,relative));paths.push(relative);}
  catch(error){if(error.code!=="ENOENT")throw error;}
 }
}
if(!paths.length)throw Error("No plugin/theme packages found");
const titles=new Set(),entries=[];
for(const filename of paths){
 const source=JSON.parse(await readFile(path.join(root,filename),"utf8"));
 const expected=filename.startsWith("themes/")?"theme":"plugin";
 if(source["plugin-type"]!==expected||typeof source.text!=="string"||
    typeof source.title!=="string"||!source.title.startsWith(expected==="theme"?"$:/themes/":"$:/plugins/"))
  throw Error("Invalid TiddlyWiki "+expected+" package: "+filename);
 if(titles.has(source.title))throw Error("Duplicate package identity: "+source.title);
 titles.add(source.title);
 const fields={};
 for(const key of ["title","name","description","author","version","plugin-type","dependents","requires-reload","stability","license","core-version"]){
  const value=source[key];
  if(typeof value==="string"&&value.trim())fields[key]=value.trim();
 }
 if(!fields.name)fields.name=source.title.split("/").at(-1);
 if(!fields.version)throw Error("Version missing for "+source.title);
 entries.push({fields,path:"../../"+filename});
}
entries.sort((a,b)=>a.fields["plugin-type"].localeCompare(b.fields["plugin-type"])||
 (a.fields.name||"").localeCompare(b.fields.name||"","en"));
const registry={schemaVersion:1,source:"HUWiki Forge on GitHub",items:entries};
await mkdir(library,{recursive:true});
const target=path.join(library,"registry.json");
await writeFile(target,JSON.stringify(registry,null,2)+"\n");
console.log("HUWiki Plugin Library:",entries.length,"plugins and themes indexed");
for(const row of entries)console.log(row.fields.title,row.fields.version,row.path);
