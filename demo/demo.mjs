/* On-demand Edition demo: exactly the same default composition as Assembler,
 * without requiring a download or maintaining duplicate generated HTML files.
 * The generated TiddlyWiki remains editable and can be saved with its native saver.
 */
import {assembleHtml,loadOfficialCore} from '../assembler/assemble.mjs';
import {loadChoices,composeWiki} from '../assembler/compose.mjs';

const params=new URL(location.href).searchParams;
const explicit=params.get('lang')?.toLowerCase();
const preferred=navigator.languages?.find(x=>/^(da|en)(-|$)/i.test(x))||navigator.language||'en';
const da=explicit==='da'||(explicit!=='en'&&/^da(-|$)/i.test(preferred));
const lang=da?'da':'en';
document.documentElement.lang=lang;
const $=id=>document.getElementById(id);
$('status').textContent=da?'Bygger demo…':'Building demo…';
$('note').textContent=da?'Prøv wikien her. Brug TiddlyWikis Gem-knap for at beholde dine ændringer.':'Try this wiki here. Use TiddlyWiki’s Save button to keep your changes.';
$('customize').textContent=da?'Tilpas og hent':'Customize & download';

// Always obtain a fresh Edition recipe when opening a public demo. A previously
// cached manifest can otherwise reintroduce plugins removed from Forge main.
// Keep large, unchanged plugin assets eligible for normal browser caching.
const fetchFreshEditionManifest=(resource,options)=>{
 const url=new URL(resource,location.href);
 const isEditionManifest=/\/editions\/[^/]+\/manifest\.json$/.test(url.pathname);
 const isAniMusAudioPlugin=/\/plugins\/musical\/dist\/plugin\.json$/.test(url.pathname);
 if(url.origin===location.origin&&(isEditionManifest||isAniMusAudioPlugin)){
  url.searchParams.set('_forge_demo',String(Date.now()));
  return fetch(url.href,{...options,cache:'no-store'});
 }
 return fetch(resource,options);
};

let blobUrl;
async function start(){
 const editionId=params.get('edition')||'';
 // Fetch the same catalog and compose with the same defaults as Assembler:
 // no extra packages, materials, theme override or user-provided title.
 const choices=await loadChoices(new URL('../assembler/',location.href).href);
 const edition=choices.editions.find(e=>e.id===editionId);
 if(!edition)throw Error(da?'Ukendt Edition. Vælg en Edition på Forge-forsiden.':'Unknown Edition. Choose an Edition on the Forge homepage.');
 $('name').textContent=edition.display?.[lang]?.name||edition.name;
 $('customize').href='../assembler/?edition='+encodeURIComponent(editionId)+'&lang='+lang;
 document.title='TiddlyWiki Forge · '+$('name').textContent;
 const [core,assembled]=await Promise.all([
  loadOfficialCore(location.href),
  composeWiki({choices,editionId,language:da?'da-DK':'en-GB'},fetchFreshEditionManifest)
 ]);
 if(assembled.manifest.id!==editionId)throw Error('Unexpected Edition build');
 const html=assembleHtml(core.html,assembled.tiddlers);
 blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
 const iframe=$('wiki');
 iframe.addEventListener('load',()=>{
  $('status').textContent=da?'Demo klar':'Demo ready';
  iframe.style.display='block';
 },{once:true});
 iframe.src=blobUrl;
}
start().catch(error=>{
 $('status').textContent=da?'Kunne ikke åbne demo':'Could not open demo';
 $('error').textContent=error.message||String(error);
 $('error').style.display='block';
});
window.addEventListener('pagehide',()=>{if(blobUrl)URL.revokeObjectURL(blobUrl);});
