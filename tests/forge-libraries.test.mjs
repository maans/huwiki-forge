import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createContext,Script} from "node:vm";
import {collectForgePlugins} from "../scripts/build-forge-plugin-library.mjs";
import {loadEdition} from "../assembler/assemble.mjs";

const root=new URL("../",import.meta.url);
const read=async p=>readFile(new URL(p,root),"utf8");
const json=async p=>JSON.parse(await read(p));
const ids=["forge","hupedia","tegne","music","hupin","demo"];
const pluginUrl="https://forge.måns.dk/library/plugins/index.html";
const communityUrl="https://forge.måns.dk/community/";

test("Every Edition shares the native HUWiki Plugin Library and separate Community address",async()=>{
 const config=await json("editions/shared/libraries.json");
 assert.equal(config.length,4);
 const plugin=config.find(t=>t.title==="$:/config/HUWikiPluginLibrary");
 const community=config.find(t=>t.title==="$:/config/HUWikiCommunity");
 const card=config.find(t=>t.title==="HUWiki Community");
 const fButton=config.find(t=>t.title==="$:/huwiki/forge/page-control");
 assert.ok(fButton,"A shared F link must be present in all Editions");
 assert.ok(fButton.tags.includes("$:/tags/PageControls"));
 assert.match(fButton.text,/href="https:\/\/forge\.måns\.dk\/"/);
 assert.match(fButton.text,/aria-label="HUWiki Forge"/);
 assert.match(fButton.text,/>F<\/a>/);
 assert.doesNotMatch(fButton.text,/ForgeShare|Tailscale|Mine wikier|Delt med mig/,"F is only a home link");

 assert.equal(plugin.url,pluginUrl);
 assert.ok(plugin.tags.includes("$:/tags/PluginLibrary"));
 assert.equal(plugin.caption,"HUWiki Plugin Library");
 assert.equal(community.url,communityUrl);
 assert.ok(!String(community.tags||"").includes("$:/tags/PluginLibrary"),"Community Editions aren't TiddlyWiki plugins");
 assert.ok(card.tags.includes("$:/tags/SideBar"),"The community link must be discoverable");
 for(const t of config){
  assert.equal(t.type,"text/vnd.tiddlywiki");
  if(t.title!=="$:/huwiki/forge/page-control")assert.ok(t.text.includes("$:/language"),"Language follows TiddlyWiki setting");
  assert.doesNotMatch(t.text,/google\.script|DriveApp|<select|languageToggle/i);
 }
 const all=await json("catalog/editions.json");
 assert.deepEqual(ids.slice().sort(),all.editions.map(x=>x.id).sort());
 for(const id of ids){
  const manifest=await json("editions/"+id+"/manifest.json");
  assert.ok(manifest.tiddlers.includes("../shared/libraries.json"),id+" must ship both library addresses");
  assert.equal(manifest.tiddlers.filter(x=>x==="../shared/libraries.json").length,1,id+" should load the configuration exactly once");
 }
});

test("The plugin registry contains every actual Forge plugin and theme without stale versions",async()=>{
 const actual=await collectForgePlugins(new URL("../",import.meta.url).pathname);
 const published=await json("library/plugins/registry.json");
 assert.deepEqual(published,actual,"Run node scripts/build-forge-plugin-library.mjs when plugins or themes change");
 assert.ok(published.items.length>=20,"All released plugins, dependencies and themes should be listed");
 const titles=new Set(published.items.map(p=>p.fields.title));
 assert.equal(titles.size,published.items.length);
 for(const key of ["$:/plugins/huwiki/site-publisher","$:/plugins/huwiki/abc","$:/plugins/huwiki/tegne",
  "$:/plugins/itw/tw-excalidraw","$:/plugins/linonetwo/tw-react","$:/themes/huwiki/modern"]){
  assert.ok(titles.has(key),key+" must be installable from the library");
 }
 assert.ok(!published.items.some(x=>x.fields["plugin-type"]==="language"),"Only plugins and themes belong in this library");
});

test("Native TiddlyWiki GET/GET-RESPONSE plugin library protocol works without any backend",async()=>{
 const html=await read("library/plugins/index.html"),reg=await json("library/plugins/registry.json");
 const snippet=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(snippet,"Native plugin library must install an iframe message listener");
 new Script(snippet[1],"Forge plugin library script");
 const postMessages=[],listeners={},location=new URL(pluginUrl);
 const parent={postMessage(value,target){postMessages.push({value,target});}};
 const window={parent,addEventListener(event,cb){listeners[event]=cb;}};
 const document={getElementById(){return {textContent:""};}};
 const fetch=async url=>{
  const u=new URL(url);
  if(u.origin!==location.origin)throw Error("External requests forbidden: "+url);
  let payload;
  if(u.pathname==="/library/plugins/registry.json")payload=reg;
  else if(u.pathname==="/plugins/forge-demo/dist/plugin.json")payload=await json("plugins/forge-demo/dist/plugin.json");
  else throw Error("Unexpected plugin download: "+u.pathname);
  return {ok:true,status:200,json:async()=>payload};
 };
 new Script(snippet[1],{filename:"library/plugins/index.html"}).runInContext(createContext({window,document,location,URL,fetch,console,JSON,decodeURIComponent,encodeURIComponent}));
 assert.equal(typeof listeners.message,"function");
 const cookies={type:"save-info",infoTitlePrefix:"$:/temp/RemoteAssetInfo/"};
 const message=async (url,cookie=cookies)=>{
  const count=postMessages.length;
  await listeners.message({source:parent,origin:"null",data:{verb:"GET",url,cookies:cookie}});
  assert.equal(postMessages.length,count+1,"Each GET must produce one response");
  return postMessages.at(-1).value;
 };
 const overview=await message("recipes/library/tiddlers.json");
 assert.equal(overview.verb,"GET-RESPONSE");
 assert.equal(overview.status,"200");
 assert.equal(overview.type,"application/json");
 assert.deepEqual(overview.cookies,cookies);
 const visible=JSON.parse(overview.body);
 assert.equal(visible.length,reg.items.length);
 assert.ok(visible.some(x=>x.title==="$:/plugins/huwiki/site-publisher"));
 assert.ok(!visible.some(x=>"path" in x),"Never expose local filesystem paths in library metadata");
 const title="$:/plugins/huwiki/forge-demo";
 const download=await message("recipes/library/tiddlers/"+encodeURIComponent(title)+".json",{type:"save-tiddler"});
 assert.equal(download.status,"200");
 assert.equal(JSON.parse(download.body).title,title);
 assert.equal(JSON.parse(download.body)["plugin-type"],"plugin");
 const missing=await message("recipes/library/tiddlers/"+encodeURIComponent("$:/plugins/unknown")+".json");
 assert.equal(missing.status,"404");
 const malformed=await message("recipes/library/tiddlers/%ZZ.json");
 assert.equal(malformed.status,"400");
 const n=postMessages.length;
 await listeners.message({source:{postMessage(){}},origin:"https://other.example",data:{verb:"GET",url:"recipes/library/tiddlers.json"}});
 assert.equal(postMessages.length,n,"Requests not from the embedding parent must be ignored");
});

test("Community only lists published Forge Editions and opt-in public wiki links",async()=>{
 const html=await read("community/index.html"),editions=await json("catalog/editions.json"),community=await json("catalog/community.json");
 assert.ok(html.includes("catalog/editions.json"),"Community must derive Editions from live Forge catalog");
 assert.ok(html.includes("catalog/community.json"),"User wikis must be separate from Editions");
 assert.ok(html.includes("assembler/"),"Edition cards link to native assembler");
 assert.ok(html.includes('build.searchParams.set("edition",item.id)'));
 assert.ok(html.includes("manifest.pathname.startsWith(editionPrefix)"),"Only same-origin Edition manifests");
 assert.ok(html.includes("href.protocol!==\"https:\""),"Only public HTTPS user wikis");
 assert.equal(community.schemaVersion,1);
 assert.deepEqual(community.publicWikis,[],"No public user wikis may be invented without owner consent");
 assert.ok(editions.editions.length>=6);
 const assembler=await read("assembler/ui.mjs");
 assert.ok(assembler.includes('new URL(location.href).searchParams.get("edition")'),"Community deep links should preselect the Edition");
 assert.ok(assembler.includes("editions.some(item=>item.id===requested)"),"Unknown Edition IDs must be ignored");
 assert.doesNotMatch(html,/google\.script\.run|DriveApp|\/api\/community\/upload/i,"Community is static, not a hidden upload service");
});
