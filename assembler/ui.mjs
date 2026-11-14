import {assembleHtml,loadOfficialCore,loadEdition} from './assemble.mjs';
import {loadChoices,resolvePackages,composeWiki} from './compose.mjs';
const query=new URL(location.href).searchParams;
const da=query.get('lang')==='da'||(!query.has('lang')&&navigator.language.startsWith('da'));
const words=da?{
 heading:'Form din egen wiki.',intro:'Vælg et udgangspunkt. Tilføj de værktøjer, det indhold og det tema, du vil have med.',
 note:'Du får én redigerbar HTML-fil. Pakkerne hentes fra de eksisterende Forge-biblioteker; nødvendige hjælpepakker følger automatisk med. Ingen konto er nødvendig.',baseHeading:'1. Dit udgangspunkt',base:'Edition',name:'Navn på din wiki (valgfrit)',tools:'2. Værktøjer',toolsHelp:'Vælg på tværs af Editions. Pakker, der allerede følger med dit udgangspunkt, markeres nedenfor.',content:'3. Indhold og eksempler',themeHeading:'4. Udseende',theme:'Tema',review:'Din sammensætning',testNotice:'Testudgaver: nogle pakker har uafsluttet engelsk brugerflade eller funktioner, der endnu ikke er afprøvet på alle enheder. Ikke alle kombinationer er browserafprøvet. Modstridende pakker bliver afvist før download.',download:'Byg og hent din wiki',save:'Åbn HTML-filen, og brug TiddlyWikis Gem-knap.',advanced:'Avanceret: afprøv en lokal kerne',core:'Vælg en officiel empty.html (valgfrit)',libraries:'F-linket og HUWiki Plugin Library følger med alle sammensætninger. Hver pakke beholder sit ophav og sin licens.',blank:'Begynd med en tom wiki',keep:'Behold Editionens tema / TiddlyWiki-standard',included:'Følger med',test:'Testpakke',helper:'Nødvendig hjælpepakke',auto:'Tilføjes automatisk',build:'Henter og kontrollerer dine pakker…',done:'Din wiki er hentet. Åbn HTML-filen for at begynde.',error:'Kunne ikke bygge wikien: ',none:'Ingen ekstra valg. F-link og HUWiki Plugin Library følger altid med.'
}:{
 heading:'Forge your own wiki.',intro:'Choose a starting point. Add the tools, content and theme you want to take with you.',note:'You get one editable HTML file. Packages come from the existing Forge libraries; required dependencies are included automatically. No account is needed.',baseHeading:'1. Your starting point',base:'Edition',name:'Name your wiki (optional)',tools:'2. Tools',toolsHelp:'Choose across Editions. Packages already included in your starting point are marked below.',content:'3. Content and examples',themeHeading:'4. Appearance',theme:'Theme',review:'Your selection',testNotice:'Test releases: some packages have unfinished English interfaces or features that have not been tested on every device. Not every combination has been browser-tested. Conflicting packages are rejected before download.',download:'Build & download your wiki',save:'Open the HTML file and use TiddlyWiki’s Save button.',advanced:'Advanced: test a local core',core:'Choose an official empty.html (optional)',libraries:'The F link and HUWiki Plugin Library are included in every combination. Each package retains its authorship and license.',blank:'Start with an empty wiki',keep:'Keep the Edition theme / TiddlyWiki default',included:'Included',test:'Test package',helper:'Required helper package',auto:'Added automatically',build:'Fetching and checking your packages…',done:'Your wiki has downloaded. Open the HTML file to begin.',error:'Could not build the wiki: ',none:'No extra selections. F and HUWiki Plugin Library are always included.'
};
document.documentElement.lang=da?'da':'en';document.title='HUWiki Forge · '+words.heading;
for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=words[el.dataset.i18n];
const $=id=>document.getElementById(id),select=$('edition'),status=$('status'),button=$('assemble');
let choices,editions=[],included=[],revision=0,loading=false,building=false;
const checked=selector=>Array.from(document.querySelectorAll(selector+':checked')).filter(el=>!el.disabled).map(el=>el.value);
function checkbox(parent,value,label,description,kind){
 const row=document.createElement('label');row.className='choice';
 const input=document.createElement('input');input.type='checkbox';input.value=value;input.className=kind;
 const title=document.createElement('strong');title.textContent=label;
 const desc=document.createElement('p');desc.textContent=description||'';
 const small=document.createElement('small');small.textContent=words.test;
 row.append(input,title,desc,small);$(parent).append(row);input.addEventListener('change',summary);
}
function selection(){return [...checked('.optional-plugin'),...checked('.content-plugin'),...checked('.material').flatMap(id=>choices.content.find(c=>c.id===id).requires||[]),...($('theme').value?[$('theme').value]:[])];}
function summary(){
 if(!choices)return;
 try{
  const added=resolvePackages(selection(),choices.packages,included);
  const manual=new Set([...checked('.optional-plugin'),...checked('.content-plugin'),$('theme').value]);
  const lines=added.map(p=>(manual.has(p.title)?'':'↳ '+words.auto+': ')+p.name);
  lines.push(...checked('.material').map(id=>{const c=choices.content.find(c=>c.id===id);return da?c.label_da:c.label_en;}));
  $('summary').textContent=lines.join('\n')||words.none;button.disabled=loading||building;
 }catch(e){$('summary').textContent=e.message;button.disabled=true;}
}
async function updateDescription(){
 const token=++revision;loading=true;button.disabled=true;
 const edition=editions.find(item=>item.id===select.value);
 $('description').textContent=edition?((da?edition.home?.descriptionDa:edition.home?.descriptionEn)||edition.description)+' · '+((da?edition.home?.noteDa:edition.home?.noteEn)||''):words.blank;
 const loaded=edition?await loadEdition(edition.manifestUrl):{tiddlers:[]};if(token!==revision)return;
 loading=false;
 included=loaded.tiddlers.filter(t=>t['plugin-type']).map(t=>t.title);
 for(const input of document.querySelectorAll('.optional-plugin,.content-plugin')){
  input.disabled=included.includes(input.value);if(input.disabled)input.checked=false;
  input.parentElement.querySelector('small').textContent=input.disabled?words.included:words.test;
 }
 summary();
}
async function init(){
 choices=await loadChoices(location.href);editions=choices.editions;
 select.replaceChildren(new Option(words.blank,''));for(const e of editions)select.add(new Option(e.name,e.id));
 const requested=new URL(location.href).searchParams.get("edition");
 if(requested&&editions.some(item=>item.id===requested))select.value=requested;
 $('theme').add(new Option(words.keep,''));
 for(const p of choices.packages){
  if(p['plugin-type']==='theme'){$('theme').add(new Option(p.name,p.title));continue;}
  const lessons=p.title.includes('/lessons-');
  checkbox(lessons?'content-list':'plugin-list',p.title,p.name,p.description,lessons?'content-plugin':'optional-plugin');
 }
 for(const c of choices.content)checkbox('content-list',c.id,da?c.label_da:c.label_en,'', 'material');
 select.disabled=false;await updateDescription();
}
select.addEventListener('change',()=>updateDescription().catch(e=>{status.textContent=words.error+e.message;button.disabled=true;}));
$('theme').addEventListener('change',summary);
button.addEventListener('click',async()=>{
 building=true;button.disabled=true;select.disabled=true;status.textContent=words.build;
 // Capture the full selection before asynchronous reads.
 const config={choices,editionId:select.value,packageTitles:[...checked('.optional-plugin'),...checked('.content-plugin')],contentIds:checked('.material'),theme:$('theme').value,name:$('wiki-name').value,language:da?'da-DK':'en-GB'};
 try{
  const file=$('core').files[0];
  const [core,result]=await Promise.all([file?file.text().then(html=>({html})):loadOfficialCore(location.href),composeWiki(config)]);
  const html=assembleHtml(core.html,result.tiddlers),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='HUWiki-'+(config.editionId||'custom')+'.html';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent=words.done;
 }catch(e){status.textContent=words.error+e.message;}finally{building=false;select.disabled=false;summary();}
});
init().catch(e=>{status.textContent=words.error+e.message;button.disabled=true;});
