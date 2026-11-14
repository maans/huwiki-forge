/** Reproducible standalone CutOut from the exact OAuthLab 0.6.2 source. */
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const source=JSON.parse(gunzipSync(Buffer.from((await readFile('migration/cutout/original-plugin.b64','utf8')).trim(),'base64')));
const rows=JSON.parse(source.text).tiddlers;
const prefix='$:/plugins/huwiki/cutout/';
function replace(file,from,to){const t=rows[prefix+file];if(!t.text.includes(from))throw Error('Source changed: '+file+' / '+from.slice(0,50));t.text=t.text.replace(from,to);}
// Native $:/language is the only language selection. Preserve the original dictionary.
replace('i18n.js',/function select\(parent,w\)\{[\s\S]*?return label;\}/.exec(rows[prefix+'i18n.js'].text)[0],'function select(){ /* Language is selected in the native TiddlyWiki control panel. */ }');
// Exact local ZIP validation from the original adapter, with no server endpoint.
const hosting=rows[prefix+'hosting.js'].text;
const readPackage=hosting.slice(hosting.indexOf('async function readPackage(file){'),hosting.indexOf('\nexports.context='));
rows[prefix+'hosting.js'].text=`'use strict';
var coUi=require('${prefix}i18n.js'),P=require('${prefix}publish.js');
exports.context=function(){return {connected:false};};
exports.exportHtml=async function(wiki,output,name,doc){P.downloadBlob(P.archiveHtml(output,name),name,doc);return {downloaded:true};};
exports.result=function(parent){parent.textContent=coUi.t('ZIP hentet · Pak ud og åbn index.html.');};
${readPackage}
exports.readPackage=readPackage;
`;
// Only offer drawing when the actual optional CutOut bridge is installed.
replace('widgets/studio.js',"this.button(right,coUi.t('Tegn del / variant i Excalidraw')","if(this.wiki.getTiddler('$:/plugins/huwiki/cutout-excalidraw'))this.button(right,coUi.t('Tegn del / variant i Excalidraw')");
replace('widgets/studio.js',"if(this.mode==='scene'||this.mode==='theatre')this.button(right,coUi.t('Redigér rekvisit i Excalidraw')","if(this.wiki.getTiddler('$:/plugins/huwiki/cutout-excalidraw')&&(this.mode==='scene'||this.mode==='theatre'))this.button(right,coUi.t('Redigér rekvisit i Excalidraw')");
// Server publishing is omitted; real local preview/download remains.
const pub=rows[prefix+'widgets/publisher.js'];
replace('widgets/publisher.js'," this.button(parent,coUi.t('Udgiv som site'),function(){try{self.siteDialog=H.siteDialog(self.wiki,self.outputHtml(),self.outputName(),self.document);}catch(e){self.message(e.message);}});",'');
replace('widgets/publisher.js',"{id:'slideshow',name:coUi.t('Slideshow · Forrige og Næste')},",'');
const texts={
 'Lokal visningspakke klar. Gem den på Drev, eller udgiv den som site. Kilderne i denne wiki ændres ikke.':['Lokal visningspakke klar. Hent ZIP og åbn index.html. Gem den redigerbare wiki separat.','Local viewing package ready. Download the ZIP and open index.html. Save the editable wiki separately.'],
 'Afprøv først visningen. I HUWiki gemmer Gem ZIP på Drev pakken i wikiens Dokumenter-mappe. Udgiv som site åbner HUWikis valg af nyt eller eksisterende site og læsere. Arbejder du lokalt, henter du ZIP og åbner den via Åbn lokal udgivelsespakke i CutOut på HUWiki. Du kan også pakke ZIP ud og lægge index.html på din egen webserver. Gem den redigerbare wiki separat.':['Afprøv visningen, hent ZIP og pak den ud. Åbn index.html lokalt, eller læg filen på din egen webserver. Gem den redigerbare wiki separat.','Preview, download and unpack the ZIP. Open index.html locally or put it on your own web server. Save the editable wiki separately.'],
 'Har du lavet animationen lokalt? Vælg dens ZIP her, og brug derefter Udgiv som site på HUWiki.':['Vælg en tidligere eksporteret CutOut ZIP for at afprøve visningen.','Choose a previously exported CutOut ZIP to preview it.'],
 'Pakken er åbnet. Afprøv den, eller vælg Udgiv som site.':['Pakken er åbnet. Afprøv den eller hent en kopi.','Package opened. Preview it or download a copy.']
};
for(const [old,[da,en]] of Object.entries(texts)){
 if(!pub.text.includes(old))throw Error('Publisher text changed');
 pub.text=pub.text.replaceAll(old,da);
 rows[prefix+'i18n.js'].text+='\nexports.data.en['+JSON.stringify(da)+']='+JSON.stringify(en)+';';
}
const readme={title:prefix+'README',type:'text/vnd.tiddlywiki',text:`<$list filter="[{$:/language}prefix[$:/languages/da]]" variable="locale">

! HUWiki CutOut — offline testudgave

Dukker, nøglebilleder, scener og forestillinger fra den oprindelige CutOut 0.6.2. Brug <$text text="<$cutout-studio/>"/> i en tiddler. Gem projekterne i værkstedet og derefter hele wikien med TiddlyWikis Gem-knap.

[[Åbn værksted|HUWiki CutOut – Studio]] · [[Prøv tændstikmanden|CutOut – Prøv tændstikmanden]] · [[Eksportér en visningskopi|HUWiki CutOut – Del]]

ZIP-eksport er lokal. Den fulde eksempelsamling, Excalidraw-broen og Slideshow er endnu ikke migreret. Mobil/touch er endnu ikke accepteret. Denne udgave har ingen Google-forbindelse.
</$list>
<$list filter="[{$:/language}else[$:/languages/en-GB]!prefix[$:/languages/da]]" variable="locale">

! HUWiki CutOut — offline test release

Puppets, keyframes, scenes and performances from the original CutOut 0.6.2. Use <$text text="<$cutout-studio/>"/> in a tiddler. Save projects in the workshop, then save the whole wiki with TiddlyWiki’s Save button.

[[Open workshop|HUWiki CutOut – Studio]] · [[Try the stick figure|CutOut – Prøv tændstikmanden]] · [[Export a viewing copy|HUWiki CutOut – Del]]

ZIP export is local. The full example collection, Excalidraw bridge and Slideshow have not been migrated yet. Mobile/touch acceptance is pending. This edition has no Google connection.
</$list>

[[Original source and authorship|${prefix}Provenance]]`};
rows[prefix+'OriginalREADME']={...rows[prefix+'README'],title:prefix+'OriginalREADME'};rows[prefix+'README']=readme;
rows[prefix+'Provenance']={title:prefix+'Provenance',text:'HUWiki CutOut 0.6.2, author HUWiki, recovered from HUWiki-OAuthLab-backup.zip / HU_CUTOUT_ASSET_01_000_. Original bundle declares no top-level license. No new license is inferred. Original source and hashes: migration/cutout/. JSZip retains its original dual MIT/GPL license in '+prefix+'vendor/jszip-license. Forge adaptation: native language only, local ZIP adapter, unavailable optional UI omitted.'};
const result={...source,version:'0.6.2-test.1',description:'Offline animation workshop · Dukker, animationer og lokal ZIP · Test',stability:'experimental',text:JSON.stringify({tiddlers:rows})};
const content=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile('plugins/cutout/dist/plugin.json','utf8')!==content)throw Error('Stale CutOut bundle');}
else{await writeFile('plugins/cutout/dist/plugin.json',content);await writeFile('plugins/cutout/licenses/JSZip.txt',rows[prefix+'vendor/jszip-license'].text);}
console.log('CutOut standalone bundle',Buffer.byteLength(content),'bytes');
