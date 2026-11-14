/** Rebuild preserved CutOut companions and shared drawing engine from OAuthLab. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {translateSource,nativeVariants} from './creative-language.mjs';
import {createHash} from 'node:crypto';
const provenance=JSON.parse(await readFile('migration/creative/provenance.json','utf8'));
async function original(name){const raw=gunzipSync(Buffer.from((await readFile(`migration/creative/${name}.b64`,'utf8')).trim(),'base64'));if(createHash('sha256').update(raw).digest('hex')!==provenance.bundles[name].sha256)throw Error('Original source hash changed: '+name);const data=JSON.parse(raw);return Array.isArray(data)?data[0]:data;}
async function emit(file,data){const text=typeof data==='string'?data:JSON.stringify(data,null,2)+'\n';if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==text)throw Error('Stale '+file);}else{await mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});await writeFile(file,text);}}
const engine=await original('excalidraw'),locale=await original('tegne-da');
const ed=JSON.parse(engine.text).tiddlers,ld=JSON.parse(locale.text).tiddlers;
// Preserve the exact HUWiki 0.3.4 ABI required by the CutOut bridge.
const widget=ed['$:/plugins/itw/tw-excalidraw/widget.js'];
const old='function huLocale(){var code=($tw.wiki.getTiddlerText("$:/config/itw/tw-excalidraw/Language","da-DK")||"da-DK").trim();return code==="da"?"da-DK":code;}';
if(!widget.text.includes(old)||!widget.text.includes('r9=async({elements:e,appState:A=mt()'))throw Error('Unexpected Excalidraw ABI');
widget.text=widget.text.replace(old,'function huLocale(){return /(?:^|\\/)da(?:-DK)?$/.test($tw.wiki.getTiddlerText("$:/language",""))?"da-DK":"en";}');
widget.text+='\n// Forge: expose the original bundled SVG renderer to the existing SitePublisher.\nexports.excalidraw.huwikiExportSvg=async function(scene,options){if(!scene||!Array.isArray(scene.elements))throw Error("Invalid drawing data");return r9({elements:scene.elements.filter(e=>!e.isDeleted),appState:Object.assign(mt(),scene.appState||{},options||{},{exportEmbedScene:false,renderEmbeddables:false}),files:scene.files||{},exportPadding:10,skipInliningFonts:false});};\n';
// Move the original companion's shadow overrides into the canonical engine.
// This preserves their result without order-dependent duplicates in composed wikis.
for(const [title,t] of Object.entries(ld)){if(title.startsWith('$:/plugins/itw/tw-excalidraw/')||title.startsWith('$:/language/Docs/')){ed[title]=t;delete ld[title];}}
const lingo=ed['$:/plugins/itw/tw-excalidraw/lingo'];lingo.text=lingo.text.replace('~[[en-GB]]','~[{$:/language}suffix[da-DK]then[da-DK]] ~[[en-GB]]');
engine.dependents='$:/plugins/linonetwo/tw-react $:/plugins/huwiki/tegne-da';
engine.text=JSON.stringify({tiddlers:ed});engine['huwiki-site-svg']='1';engine['huwiki-native-language']='1';engine.description='HUWiki Excalidraw · native Dansk / English · original 0.3.4 drawing and library APIs';
delete locale.list;locale.text=JSON.stringify({tiddlers:ld});locale.version='1.0.1-test.1';locale.description='Danske tegnetekster / Danish drawing strings · native $:/language';
await emit('plugins/tegne-excalidraw/dist/plugin.json',engine);await emit('plugins/tegne-da/dist/plugin.json',locale);
// Existing React includes the recovered original license; retain that exact package.
const currentReact=JSON.parse(await readFile('plugins/tegne-react/dist/plugin.json','utf8'));
const recoveredReact=await original('react');if(currentReact.title!==recoveredReact.title||currentReact.version!==recoveredReact.version)throw Error('React dependency mismatch');
for(const name of ['pasteup','theatre','cutout-excalidraw']){
 const p=await original(name);
 if(name==='theatre'){const rows=JSON.parse(p.text).tiddlers;nativeVariants(rows,'$:/plugins/huwiki/theatre/readme',await readFile('plugins/theatre/src/readme-en.txt','utf8'),'$:/plugins/huwiki/theatre/Native');p.text=JSON.stringify({tiddlers:rows});p.version='0.6.1-test.1';p.dependents+=' $:/plugins/huwiki/pasteup';p.name='HUWiki Teater / Theatre';p.description='Forestillinger med PasteUp og CutOut / Performances with PasteUp and CutOut';}
 if(name==='cutout-excalidraw'){p.name='CutOut ↔ Excalidraw';p.description='Redigerbare tegninger til CutOut / Editable drawings for CutOut';p.version='0.1.0-test.1';}
 if(name==='pasteup'){const rows=JSON.parse(p.text).tiddlers,dict=JSON.parse(await readFile('plugins/pasteup/src/strings.json','utf8'));
 const originalRows={...rows},prefix='$:/plugins/huwiki/pasteup/',enginePrefix=prefix+'Engine';
 for(const lang of ['da','en'])for(const [title,t]of Object.entries(originalRows))if(title.startsWith(enginePrefix)){
  const local=prefix+'Native/'+lang+title.slice(prefix.length-1),text=lang==='en'?translateSource(t.text||'',dict,Object.keys(originalRows)):t.text||'';
  rows[local]={title:local,type:t.type||'text/vnd.tiddlywiki',text:text.replace('[all[tiddlers+shadows]prefix['+enginePrefix+']]', '[all[tiddlers+shadows]prefix['+prefix+'Native/'+lang+'/Engine]]')};
 }
 // Preserve public macro entry points. View/Print import the actual selected definitions.
 for(const suffix of ['/View','/Print']){const title=enginePrefix+suffix,da=prefix+'Native/da/Engine'+suffix,en=prefix+'Native/en/Engine'+suffix,filter='[{$:/language}prefix[$:/languages/da]then['+da+']else['+en+']]';rows[title]={...originalRows[title],text:'\\import '+filter+'\n<$transclude $tiddler={{{ '+filter+' }}} $mode="block"/>'};}

 rows[prefix+'OriginalHUWikiGuide']={...originalRows[prefix+'Info'],title:prefix+'OriginalHUWikiGuide'};
 rows[prefix+'Info']={...originalRows[prefix+'Info'],text:await readFile('plugins/pasteup/src/guide-da.txt','utf8')};
 nativeVariants(rows,prefix+'Info',await readFile('plugins/pasteup/src/guide-en.txt','utf8'),prefix+'Native');
 nativeVariants(rows,'PasteUp',translateSource(originalRows.PasteUp.text,dict,Object.keys(originalRows)),prefix+'Native');
 const create=rows[prefix+'Create.js'];create.text=create.text.replace('exports.startup=function(){',`exports.startup=function(){
 function label(da,en){return /^\\$:\\/languages\\/da/.test($tw.wiki.getTiddlerText('$:/language',''))?da:en;}`)
 .replace('"Min retroplakat"','label("Min retroplakat","My retro poster")').replace('"Min TWingo-plade"','label("Min TWingo-plade","My TWingo board")')
 .replace('"TWingo-eksemplet mangler: "','label("TWingo-eksemplet mangler: ","Missing TWingo example: ")').replace('"Retroplakat-skabelonen mangler "','label("Retroplakat-skabelonen mangler ","Missing retro poster template: ")').replace('"TWingo-skabelonen mangler "','label("TWingo-skabelonen mangler ","Missing TWingo template: ")');
 p.description='Plakater og interaktive plader / Posters and interactive boards · native Dansk / English';
 p.text=JSON.stringify({tiddlers:rows});p.version='0.1.8-test.1';}
 await emit(`plugins/${name}/dist/plugin.json`,p);
}
const pages=await original('cutout-pages');delete pages['$:/config/itw/tw-excalidraw/Language'];
// The core owns the same Studio entry point; keep one canonical implementation.
delete pages['HUWiki CutOut – Studio'];
const examples={title:'$:/plugins/huwiki/cutout-examples',name:'CutOut · Demoer og eksempler / Examples',description:'Original CutOut examples, guide and exercises · original dansk/engelsk',author:'HUWiki',version:'0.6.2-test.1',type:'application/json','plugin-type':'plugin',dependents:'$:/plugins/huwiki/cutout $:/plugins/huwiki/theatre $:/plugins/huwiki/pasteup $:/plugins/huwiki/slideshow $:/plugins/huwiki/cutout-excalidraw',text:JSON.stringify({tiddlers:pages})};
await emit('plugins/cutout-examples/dist/plugin.json',examples);
console.log('Rebuilt original CutOut companions, examples and Excalidraw 0.3.4');
