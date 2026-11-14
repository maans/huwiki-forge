import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root='plugins/shop/',base='$:/plugins/huwiki/shop/';
const raw=gunzipSync(Buffer.from((await readFile('migration/shop/source.b64','utf8')).trim(),'base64'));
const provenance=JSON.parse(await readFile('migration/shop/provenance.json','utf8'));
if(createHash('sha256').update(raw).digest('hex')!==provenance.sha256)throw Error('Shop original source checksum differs');
const source=raw.toString('utf8');
// Retain the original offline templates, CSS and artwork. No server code is evaluated.
const templateSource=source.slice(0,source.indexOf('function shopValidate('));
const visuals=source.slice(source.indexOf('function shopCss('),source.indexOf('function shopSite('));
const original=vm.runInNewContext(templateSource+'\nshopTemplates()',{}, {timeout:1000});
const english=JSON.parse(await readFile(root+'src/templates-en.json','utf8'));
const templates=original.map((t,i)=>({id:t.id,layout:t.layout,color:t.color,da:{title:t.name,intro:t.intro,items:t.items},en:english[i]}));
const tiddlers={};
function add(title,fields){tiddlers[title]={title,...fields};}
for(const [name,type]of [['model.js','library'],['guide.js','library'],['widget.js','widget']])add(base+name,{type:'application/javascript','module-type':type,text:await readFile(root+'src/'+name,'utf8')});
for(const name of ['order-received.jpg','google-sites-shop.jpg','funnel-shop.jpg'])add(base+'examples/'+name,{type:'image/jpeg',text:(await readFile(root+'assets/'+name)).toString('base64')});
add(base+'original.js',{type:'application/javascript','module-type':'library',text:visuals+'\nexports.css=shopCss;exports.art=shopArt;'});
add(base+'templates.js',{type:'application/javascript','module-type':'library',text:'exports.items='+JSON.stringify(templates)+';'});
add(base+'shop-server.cjs',{type:'text/plain',text:await readFile(root+'src/shop-server.cjs','utf8')});
add(base+'style',{type:'text/css',tags:'$:/tags/Stylesheet',text:await readFile(root+'src/style.css','utf8')});
add('HUWiki Shop – Start',{type:'text/vnd.tiddlywiki',caption:'Shop – Start','forge-display-name':'Shop – Start',tags:'Shop',text:'<$forge-shop/>'});
add(base+'readme',{type:'text/vnd.tiddlywiki',text:'Shop Edition · 0.2.0-test.3\n\n[[Shop – Start|HUWiki Shop – Start]]\n\nOffline catalog and customer-page export. Manual Google Forms/Sheets setup, Google Sites embedding and static Tailscale Funnel guide. Native Dansk / English. Google Sites publication and a signed-out test order into a private Google Sheet verified in Chrome, 14 November 2026. Public Funnel HTTPS access through a public ingress relay, the order link and stop/restart were verified on desktop. Physical mobile-device acceptance remains pending.\n\nOriginal: HUWiki Shop 0.1.2, author HUWiki. Original nine templates, layouts, colours and artwork preserved. No license field was declared by the original package; no replacement license is inferred. The original source and SHA-256 are retained in migration/shop. Server-side Apps Script, order import and automatic publication are replaced by manual steps. No new third-party runtime dependencies.\n\nYour working wiki holds the setup checklist and sheet shortcut. Only the explicitly selected public catalog fields enter the customer-page export. Save the working wiki with TiddlyWiki’s native saver.'});
const readmeEn=tiddlers[base+'readme'].text;
add(base+'readme-en',{type:'text/vnd.tiddlywiki',text:readmeEn});
add(base+'readme-da',{type:'text/vnd.tiddlywiki',text:'Shop Edition · 0.2.0-test.3\n\n[[Shop – Start|HUWiki Shop – Start]]\n\nLav et lokalt katalog og eksportér din kundeside. Guiden hjælper med manuel opsætning af Forms/Sheets, indlejring i Google Sites og statisk udgivelse via Tailscale Funnel. Følger TiddlyWikis eget dansk/engelsk-valg. Google Sites-publicering og en prøveordre uden login til et privat Google-ark er afprøvet i Chrome 14. november 2026. Offentlig Funnel via offentlig indgang, bestillingslink og stop/genstart er afprøvet på computer. Fysiske mobilenheder afventer test.\n\nOriginal: HUWiki Shop 0.1.2, ophav HUWiki. De ni skabeloner, visninger, farver og illustrationer er bevaret. Originalpakken angiver ingen licens; der er ikke tilføjet en ny. Originalkilde og SHA-256 bevares i migration/shop. Apps Script-automatik, ordreimport og automatisk publicering er erstattet af manuelle trin. Ingen nye eksterne programafhængigheder.\n\nArbejdswikien indeholder afkrydsninger og privat arkgenvej. Kun udvalgte offentlige katalogfelter eksporteres til kundesiden. Gem arbejdswikien med TiddlyWikis egen Gem-funktion.'});
add(base+'readme',{type:'text/vnd.tiddlywiki',text:'<$list filter="[{$:/language}prefix[$:/languages/da]]" variable="shopLang">\n\n{{'+base+'readme-da}}\n\n</$list>\n<$list filter="[{$:/language}!prefix[$:/languages/da]]" variable="shopLang">\n\n{{'+base+'readme-en}}\n\n</$list>'});
const plugin={title:'$:/plugins/huwiki/shop',name:'Shop',description:'Shop Site · guided Forms/Sheets setup, Google Sites and Funnel · Dansk / English · Test',author:'HUWiki',version:'0.2.0-test.3','plugin-type':'plugin',type:'application/json',list:'readme',text:JSON.stringify({tiddlers})};
const out=JSON.stringify(plugin,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(root+'dist/plugin.json','utf8')!==out)throw Error('Stale Shop plugin');}else{await mkdir(root+'dist',{recursive:true});await writeFile(root+'dist/plugin.json',out);}
console.log('Shop: nine original templates, native language, manual guide and static export');
