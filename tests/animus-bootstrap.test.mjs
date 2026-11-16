import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const pluginPath=new URL("../plugins/musical/dist/plugin.json",import.meta.url);
const missingSvgModule="$:/plugins/huwiki/cutout/svg-layers.js";

test("AniMus initialises editor and puppet without the optional SVG layer workshop",async()=>{
 const pkg=JSON.parse(await readFile(pluginPath,"utf8"));
 const entries=JSON.parse(pkg.text).tiddlers;
 const checks=[
  ["editor.js","attach"],
  ["puppet.js","mount"],
  ["workspace.js","mount"]
 ];
 for(const [file,exported] of checks){
  const title="$:/plugins/huwiki/musical/"+file;
  const source=entries[title]?.text;
  assert.ok(source,"missing "+title);
  const exports={};
  const requested=[];
  runInNewContext(source,{
   exports,
   require(id){
    requested.push(id);
    if(id===missingSvgModule)throw Error("SVG workshop has not been installed");
    return {};
   }
  },{filename:title,timeout:2000});
  assert.equal(typeof exports[exported],"function",title+" must export "+exported);
  assert.ok(!requested.includes(missingSvgModule),title+" may not load SVG layers on startup");
 }
 assert.match(entries["$:/plugins/huwiki/musical/editor.js"].text,/var SvgLayers=optionalSvgLayers\(\)/);
 assert.match(entries["$:/plugins/huwiki/musical/puppet.js"].text,/var SvgLayers=optionalSvgLayers\(\)/);
});
