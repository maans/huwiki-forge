/**
 * HUWiki Forge — reproducible, one-time vendor import for Tegne Edition.
 *
 * Fetches two PINNED upstream plugins as source material and generates standard
 * TiddlyWiki plugin.json bundles in the Forge repository. This is a build-time
 * operation, not a runtime dependency of generated single-file wikis.
 *
 * Upstream:
 *   ItsTheWhale/tiddlywiki-excalidraw v0.3.0, MIT (includes Excalidraw)
 *   LinOnetwo/tw-react v1.0.0, MIT
 * Both retain their original credits and license tiddlers.
 *
 * The optional HUWiki SVG bridge is an addition to an upstream widget, not a
 * replacement for the upstream implementation.
 */
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";

const expectedExcalidrawSha256="798a4dd0c1019795e616830aac86e627981fa2e9de1985795c281d2872f0d6af";
const excalidrawUrl="https://github.com/ItsTheWhale/tiddlywiki-excalidraw/releases/download/v0.3.0/__plugins_itw_tw-excalidraw.json";
const pinnedReactCommit="06276b7c5b2cc464ad4cdf94f8c3ebaaf854de55";
const expectedReactGitSha="023f92ef58a6072835846fd621513346df59d680";
const reactUrl="https://raw.githubusercontent.com/ItsTheWhale/tiddlywiki-excalidraw/"+pinnedReactCommit+"/wiki/tiddlers/system/%24__plugins_linonetwo_tw-react.json";
const reactLicenseUrl="https://raw.githubusercontent.com/tiddly-gittly/tw-react/e85df316d26d4d1e719ae7a800e849736d8cfece/LICENSE";
const expectedReactLicenseGitSha="eb02ebc56be865a0bb4009c849b16cebbc7d4dec";

const blobSha=buffer=>createHash("sha1").update("blob "+buffer.length+"\0").update(buffer).digest("hex");
const sha256=buffer=>createHash("sha256").update(buffer).digest("hex");
async function download(url){
 const result=await fetch(url,{headers:{"User-Agent":"HUWiki-Forge-Tegne-migration/0.1","Accept":"application/octet-stream"}});
 if(!result.ok)throw Error("HTTP "+result.status+" while fetching pinned upstream asset: "+url);
 return Buffer.from(await result.arrayBuffer());
}
function pluginTiddlers(plugin){
 if(!plugin||typeof plugin.text!=="string"||plugin["plugin-type"]!=="plugin")throw Error("Expected TiddlyWiki plugin envelope");
 const store=JSON.parse(plugin.text);
 if(!store.tiddlers||typeof store.tiddlers!=="object")throw Error("Plugin has no tiddlers");
 return store;
}
const bridge=String.raw`
// HUWiki Forge SitePublisher compatibility. The original Excalidraw/React
// sources and editor code remain unchanged; only a view-only SVG API is exposed.
exports.excalidraw.huwikiExportSvg=async function(scene,options){
 if(!scene||!Array.isArray(scene.elements))throw Error("Invalid Excalidraw scene");
 var app=Object.assign({},scene.appState||{},options||{});
 var restored=Mp(scene.elements,undefined,{repairBindings:true}).filter(function(item){return !item.isDeleted;});
 if(!restored.length)throw Error("Drawing has no visible elements");
 return up(restored,{
  exportPadding:10,
  exportWithDarkMode:!!app.exportWithDarkMode,
  exportBackground:app.exportBackground!==false,
  viewBackgroundColor:app.viewBackgroundColor||"#fff",
  exportScale:1,
  exportEmbedScene:false
 },scene.files||{},{renderEmbeddables:false});
};
`;
function patchExcalidraw(plugin){
 if(Array.isArray(plugin)){if(plugin.length!==1)throw Error("Expected exactly one Excalidraw plugin");plugin=plugin[0];}
 if(plugin.title!=="$:/plugins/itw/tw-excalidraw")throw Error("Wrong Excalidraw plugin title");
 const store=pluginTiddlers(plugin),target="$:/plugins/itw/tw-excalidraw/widget.js";
 const widget=store.tiddlers[target];
 if(!widget||typeof widget.text!=="string")throw Error("Cannot find original Excalidraw widget");
 const code=widget.text;
 // Refuse to append minifier-dependent code when this exact upstream build
 // does not expose the functions. A failed build is preferable to broken SVG.
 if(!/\bexports\["excalidraw"\]\s*=|\bexports\.excalidraw\s*=/.test(code))
   throw Error("Excalidraw widget lacks the expected exported constructor");
 if(!/\bMp\s*\(/.test(code)||!/\bup\s*\(/.test(code))
   throw Error("Pinned upstream release has different SVG internals; do not append unsafe bridge");
 widget.text+=bridge;
 // Carry the HUWiki Danish translations in the editor package itself so
 // ordinary TiddlyWiki installations do not need an overriding shadow plugin.
 const lingoTitle="$:/plugins/itw/tw-excalidraw/lingo";
 const lingo=store.tiddlers[lingoTitle];
 if(!lingo||typeof lingo.text!=="string"||!lingo.text.includes("~[[en-GB]]"))
  throw Error("Cannot safely extend the upstream Excalidraw language lingo");
 lingo.text=lingo.text.replace("~[[en-GB]]",
  "~[<raw-language-code>match[da-DK]] ~[{$:/language}suffix[da-DK]then[da-DK]] ~[[en-GB]]");
 const da={
   Name:"HUWiki Tegne · Excalidraw",
   Description:"Et tegneplugin med redigerbare vektorer og genbrugelige figurer.",
   ParserWarning:"Dette indhold er en Excalidraw-tegning. Vis tegningen med Excalidraw-widgetten.",
   NewButtonCaption:"ny Excalidraw-tegning",
   NewButtonHint:"Opret en redigerbar tegning",
   OpenInLayoutButtonCaption:"redigér tegning",
   OpenInLayoutButtonHint:"Åbn tegningen til redigering i fuld skærm",
   EnterLayoutButtonCaption:"Åbn i fuld skærm",
   ExitLayoutButtonCaption:"Tilbage til wikien",
   EmbedTiddlerButtonCaption:"Indlejr en tiddler",
   "Settings/Description":"Tilpas Excalidraws udseende og funktioner.",
   "Settings/DefaultTheme/Caption":"Standardtema",
   "Settings/DefaultTheme/Hint":"Vælg tegnefladens standardtema",
   "Settings/Theme/auto":"Automatisk",
   "Settings/Theme/light":"Lyst",
   "Settings/Theme/dark":"Mørkt"
 };
 for(const [key,text] of Object.entries(da)){
  const title="$:/plugins/itw/tw-excalidraw/language/da-DK/"+key;
  if(store.tiddlers[title])throw Error("Unexpected existing Danish localization: "+title);
  store.tiddlers[title]={title,text};
 }
 plugin.text=JSON.stringify(store);
 plugin["huwiki-site-svg"]="1";
 // Do not relicense upstream package or remove its original license tiddler.
 if(!store.tiddlers["$:/plugins/itw/tw-excalidraw/license"])
   throw Error("Upstream Excalidraw/React copyright notice missing");
 return plugin;
}
function reactEnvelope(store,license){
 const title="$:/plugins/linonetwo/tw-react/license";
 if(!store||typeof store!=="object"||!store.tiddlers)throw Error("Invalid React package");
 if(!store.tiddlers[title])store.tiddlers[title]={title,type:"text/plain",text:license};
 return {
  title:"$:/plugins/linonetwo/tw-react",type:"application/json",
  "plugin-type":"plugin",name:"ReactJS",author:"LinOnetwo",
  version:"1.0.0","core-version":">=5.3.0",dependents:"",
  description:"Allow using ReactJS Components in TW widget.",
  list:"readme tree",stability:"STABILITY_2_STABLE",
  text:JSON.stringify(store)
 };
}
async function main(){
 const [engineRaw,reactRaw,reactLicenseRaw]=await Promise.all([download(excalidrawUrl),download(reactUrl),download(reactLicenseUrl)]);
 if(sha256(engineRaw)!==expectedExcalidrawSha256)
  throw Error("Excalidraw release checksum changed. Aborting vendor import.");
 if(blobSha(reactRaw)!==expectedReactGitSha)
  throw Error("Pinned React plugin Git blob changed. Aborting vendor import.");
 if(blobSha(reactLicenseRaw)!==expectedReactLicenseGitSha)
  throw Error("React upstream MIT license changed. Aborting vendor import.");
 const engine=patchExcalidraw(JSON.parse(engineRaw.toString("utf8")));
 const react=reactEnvelope(JSON.parse(reactRaw.toString("utf8")),reactLicenseRaw.toString("utf8"));
 if(!pluginTiddlers(react).tiddlers["$:/plugins/linonetwo/tw-react/widget.js"])
  throw Error("React widget missing");
 for(const [file,content] of [
  ["plugins/tegne-excalidraw/dist/plugin.json",engine],
  ["plugins/tegne-react/dist/plugin.json",react]
 ]){
  await mkdir(file.split("/").slice(0,-1).join("/"),{recursive:true});
  await writeFile(file,JSON.stringify(content,null,2)+"\n");
  console.log("Generated",file,"version",content.version,"chars",content.text.length);
 }
 console.log("Source SHA256",sha256(engineRaw),"React Git blob",blobSha(reactRaw));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
