import {assembleHtml,loadEdition,loadOfficialCore} from '../../assembler/assemble.mjs';

const params=new URL(location.href).searchParams;
const explicit=params.get('lang')?.toLowerCase();
const preferred=navigator.languages?.find(x=>/^(da|en)(-|$)/i.test(x))||navigator.language||'en';
const da=explicit==='da'||(explicit!=='en'&&/^da(-|$)/i.test(preferred));
const $=id=>document.getElementById(id);
const T=(danish,english)=>da?danish:english;
document.documentElement.lang=da?'da':'en';
document.title=T('Turn Around · Videoeksport','Turn Around · Video export');
$('name').textContent=document.title;
$('badge').textContent=T('Testversion','Test version');
$('status').textContent=T('Åbner filmen…','Opening the film…');
$('note').textContent=T('Vælg Eksportér video i afspilleren. Prøv først et klip på 5 sekunder i 720p.','Choose Export video in the player. Start with a 5-second clip at 720p.');

// Keep the public production and all original recordings. Only this preview
// receives the experimental exporter and its native-player adapter.
const fresh=async(resource,options)=>{
 const url=new URL(resource,location.href);
 if(/\/(manifest\.json|plugin\.json|turn-around-adapter\.json)$/.test(url.pathname)){
  url.searchParams.set('_preview','20261119-downloads');
  return fetch(url.href,{...options,cache:'no-store'});
 }
 return fetch(resource,options);
};
const readJson=async path=>{
 const response=await fresh(new URL(path,location.href));
 if(!response.ok)throw Error(T('Kunne ikke hente ','Could not load ')+path+' (HTTP '+response.status+')');
 return response.json();
};
let blobUrl;
async function start(){
 const [edition,core,plugin,adapter]=await Promise.all([
  loadEdition(new URL('../../editions/turn-around/manifest.json',location.href).href,fresh),
  loadOfficialCore(new URL('../../demo/',location.href).href,fresh),
  readJson('./plugin.json'),readJson('./turn-around-adapter.json')
 ]);
 if(edition.manifest.id!=='turn-around')throw Error('Unexpected edition');
 if(plugin.title!=='$:/plugins/huwiki/animus-video-export')throw Error('Unexpected export plugin');
 const tiddlers=new Map(edition.tiddlers.map(t=>[t.title,t]));
 for(const t of [plugin,...adapter,
  {title:'$:/language',text:da?'$:/languages/da-DK':'$:/languages/en-GB'},
  {title:'$:/DefaultTiddlers',text:'[[Turn Around]]'},
  {title:'$:/StoryList',list:'[[Turn Around]]',text:''},
  {title:'$:/config/huwiki/animus/caption-language',text:da?'da':'en'}
 ])tiddlers.set(t.title,t);
 const html=assembleHtml(core.html,[...tiddlers.values()]);
 blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
 const iframe=$('wiki');
 iframe.addEventListener('load',()=>{
  $('status').textContent=T('Klar · ','Ready · ')+plugin.version;
  iframe.style.display='block';
 },{once:true});
 iframe.src=blobUrl;
}
start().catch(error=>{
 $('status').textContent=T('Kunne ikke åbne testversionen','Could not open the test version');
 $('error').textContent=error.message||String(error);
 $('error').style.display='block';
});
window.addEventListener('pagehide',()=>{if(blobUrl)URL.revokeObjectURL(blobUrl);});
