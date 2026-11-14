import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {composeWiki,loadChoices} from '../assembler/compose.mjs';
import {assembleHtml} from '../assembler/assemble.mjs';
const provenance=JSON.parse(await readFile('migration/instantwiki/provenance.json','utf8'));
if(createHash('sha256').update(await readFile('migration/instantwiki/original.js')).digest('hex')!==provenance.excerptSha256)throw Error('Changed original InstantWiki excerpts');
const base='$:/plugins/huwiki/instantwiki/',dir='plugins/instantwiki/',tiddlers={};
const add=(title,fields)=>tiddlers[title]={title,...fields};
for(const [name,type]of [['model.js','library'],['readers.js','library'],['widget.js','widget']])add(base+name,{type:'application/javascript','module-type':type,text:await readFile(dir+'src/'+name,'utf8')});
const sums=JSON.parse(await readFile(dir+'vendor/checksums.json','utf8'));
for(const [name,hash]of Object.entries(sums)){
 const bytes=await readFile(dir+'vendor/'+name);if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Changed vendor: '+name);
 add(base+'vendor/'+name,{type:name.endsWith('.js')?'application/javascript':'text/plain',...(name.endsWith('.js')?{'module-type':'library'}:{}),text:bytes.toString('utf8')});
}
add(base+'style',{type:'text/css',tags:'$:/tags/Stylesheet',text:await readFile(dir+'src/style.css','utf8')});
add('InstantWiki',{type:'text/vnd.tiddlywiki',tags:'InstantWiki',text:'<$forge-instantwiki/>'});
const originalView=JSON.parse(await readFile('migration/instantwiki/document-view-original.json','utf8'));
if(createHash('sha256').update(await readFile('migration/instantwiki/document-view-original.json')).digest('hex')!==provenance.documentView.extractedTiddlersSha256)throw Error('Changed original document view');
const styles=originalView.find(t=>t.title==='$:/Wiki/DocumentStyles');add(styles.title,styles);
for(const lang of ['da','en'])add(base+'document-view-'+lang,{type:'text/vnd.tiddlywiki',text:await readFile(dir+'src/document-view-'+lang+'.tidtext','utf8')});
add('$:/Wiki/DocumentView',{type:'text/vnd.tiddlywiki',text:'<$list filter="[{$:/language}prefix[$:/languages/da]]" variable="instantLanguage">\n\n{{||'+base+'document-view-da}}\n\n</$list>\n<$list filter="[{$:/language}!prefix[$:/languages/da]]" variable="instantLanguage">\n\n{{||'+base+'document-view-en}}\n\n</$list>'});

add(base+'readme',{type:'text/vnd.tiddlywiki',text:'[[InstantWiki]] · 0.1.0-test.2\n\n<$list filter="[{$:/language}prefix[$:/languages/da]]" variable="lang">\n\nLav en wiki af et lokalt dokument eller et offentligt dokumentlink. Gennemse afsnit og ret titler før import. Fjern et flueben for at samle med foregående afsnit; ingen tekst slettes. Brug TiddlyWikis normale Gem-knap efter import. Ny wiki med valgfri Edition kræver internet; import i din nuværende wiki virker offline.\n\nTestudgave. DOCX/ODT: tekst, overskrifter, lister og tabeller. PDF: tekst pr. side eller originalvisning; ingen OCR. Regneark: værdier fra ét valgt ark; ingen formler eller diagrammer. HTML: kun sikkert tekstindhold; billeder er markører. Gamle DOC-filer skal eksporteres først. Dokumentlinks kræver offentlig adgang og CORS.\n\n</$list><$list filter="[{$:/language}!prefix[$:/languages/da]]" variable="lang">\n\nCreate a wiki from a local document or a public document URL. Review sections and edit titles before import. Clear a checkmark to merge with the preceding section; no text is discarded. Use TiddlyWiki’s normal Save button after importing. Creating a new wiki with an optional Edition needs internet; importing here works offline.\n\nTest release. DOCX/ODT: text, headings, lists and tables. PDF: text per page or original view; no OCR. Spreadsheets: values from one selected sheet; no formulas or charts. HTML: safe text content; images become placeholders. Export legacy DOC files first. Document URLs need public access and CORS.\n\n</$list>\n\nOriginal InstantWiki: HUWiki, HUWiki-OAuthLab-backup.zip / Code.js. Original functions and checksum: migration/instantwiki in the repository. No license was declared by this source; no replacement license is inferred.\n\nBundled readers (offline): JSZip 3.10.2, Stuart Knightley and contributors (MIT); PDF.js 6.4.299, Mozilla Foundation and contributors (Apache 2.0), the same pinned build as Slideshow; SheetJS CE 0.20.3, SheetJS LLC (Apache 2.0). Full licenses are included under this plugin’s vendor tiddlers.'});
const plugin={title:'$:/plugins/huwiki/instantwiki',name:'InstantWiki',description:'Documents into editable wikis · Dansk / English · Test',author:'HUWiki',version:'0.1.0-test.2','plugin-type':'plugin',type:'application/json',list:'readme',text:JSON.stringify({tiddlers})};
const output=JSON.stringify(plugin,null,2)+'\n';await mkdir(dir+'dist',{recursive:true});
if(process.argv.includes('--check')){if(await readFile(dir+'dist/plugin.json','utf8')!==output)throw Error('Stale InstantWiki plugin');}else await writeFile(dir+'dist/plugin.json',output);
// The service is itself an editable TiddlyWiki, assembled with the existing pipeline.
if(!process.argv.includes('--plugin-only')){
 const fetcher=async url=>{try{const bytes=await readFile('.'+new URL(url).pathname,'utf8');return {ok:true,json:async()=>JSON.parse(bytes)};}catch{return {ok:false,status:404};}};
 const choices=await loadChoices('https://forge.test/assembler/',fetcher);
 // Registry may still be awaiting regeneration on the first package build.
 if(!choices.packages.some(p=>p.title===plugin.title))choices.packages.push({...plugin,url:'https://forge.test/'+dir+'dist/plugin.json'});
 const result=await composeWiki({choices,packageTitles:[plugin.title],name:'InstantWiki · TiddlyWiki Forge',language:'en-GB'},fetcher);
 result.tiddlers.find(t=>t.title==='$:/DefaultTiddlers').text='InstantWiki';
 result.tiddlers=result.tiddlers.filter(t=>t.title!=='$:/language');
 result.tiddlers.push(JSON.parse(await readFile('editions/forge/tiddlers/config.json','utf8')).find(t=>t.title==='$:/huwiki/forge/browser-language'));
 const html=assembleHtml(await readFile('core/empty.html','utf8'),result.tiddlers);
 await mkdir('instantwiki',{recursive:true});if(process.argv.includes('--check')){if(await readFile('instantwiki/index.html','utf8')!==html)throw Error('Stale InstantWiki service');}else await writeFile('instantwiki/index.html',html);
}
console.log('InstantWiki: plugin and native TiddlyWiki document service');
