import {assembleHtml,loadOfficialCore,loadEdition} from './assemble.mjs';
import {loadChoices,resolvePackages,reconcilePackageSelection,composeWiki} from './compose.mjs';
const query=new URL(location.href).searchParams;
const requestedLanguage=query.get('lang')?.toLowerCase();
// A link from the public TiddlyWiki carries its chosen language. Otherwise use
// the browser's supported language preferences (Danish or English fallback).
const preferredLanguages=Array.isArray(navigator.languages)&&navigator.languages.length?navigator.languages:[navigator.language];
const browserChoice=preferredLanguages.find(value=>/^(da|en)(-|$)/i.test(value))||preferredLanguages[0]||'en';
const da=requestedLanguage==='da'||(requestedLanguage!=='en'&&/^da(-|$)/i.test(browserChoice));
const words=da?{
 heading:'Form din egen wiki.',intro:'Vælg et udgangspunkt. Tilføj de værktøjer, det indhold og det tema, du vil have med.',
 note:'Du får én redigerbar HTML-fil. Pakkerne hentes fra de eksisterende Forge-biblioteker; nødvendige hjælpepakker følger automatisk med. Ingen konto er nødvendig.',baseHeading:'1. Dit udgangspunkt',base:'Edition',name:'Navn på din wiki (valgfrit)',tools:'2. Værktøjer',toolsHelp:'Vælg på tværs af Editions. Pakker, der allerede følger med dit udgangspunkt, markeres nedenfor.',content:'3. Indhold og eksempler',themeHeading:'4. Udseende',theme:'Tema',review:'Din sammensætning',testNotice:'Testudgaver: nogle pakker har uafsluttet engelsk brugerflade eller funktioner, der endnu ikke er afprøvet på alle enheder. Ikke alle kombinationer er browserafprøvet. Modstridende pakker bliver afvist før download.',download:'Byg og hent din wiki',save:'Åbn HTML-filen, og brug TiddlyWikis Gem-knap.',advanced:'Avanceret: afprøv en lokal kerne',core:'Vælg en officiel empty.html (valgfrit)',libraries:'F-linket og Plugin Library følger med alle sammensætninger. Hver pakke beholder sit ophav og sin licens.',blank:'Begynd med en tom wiki',keep:'Behold Editionens tema / TiddlyWiki-standard',included:'Følger med',test:'Testpakke',helper:'Nødvendig hjælpepakke',auto:'Tilføjes automatisk',removed:'Fravalgt fra Edition',alsoRemoved:'Også fravalgt, fordi de kræver det valgte plugin',alsoAdded:'Nødvendige plugins tilføjet automatisk',build:'Henter og kontrollerer dine pakker…',done:'Din wiki er hentet. Åbn HTML-filen for at begynde.',error:'Kunne ikke bygge wikien: ',none:'Ingen ekstra valg. F-link og Plugin Library følger altid med.'
}:{
 heading:'Forge your own wiki.',intro:'Choose a starting point. Add the tools, content and theme you want to take with you.',note:'You get one editable HTML file. Packages come from the existing Forge libraries; required dependencies are included automatically. No account is needed.',baseHeading:'1. Your starting point',base:'Edition',name:'Name your wiki (optional)',tools:'2. Tools',toolsHelp:'Choose across Editions. Packages already included in your starting point are marked below.',content:'3. Content and examples',themeHeading:'4. Appearance',theme:'Theme',review:'Your selection',testNotice:'Test releases: some packages have unfinished English interfaces or features that have not been tested on every device. Not every combination has been browser-tested. Conflicting packages are rejected before download.',download:'Build & download your wiki',save:'Open the HTML file and use TiddlyWiki’s Save button.',advanced:'Advanced: test a local core',core:'Choose an official empty.html (optional)',libraries:'The F link and Plugin Library are included in every combination. Each package retains its authorship and license.',blank:'Start with an empty wiki',keep:'Keep the Edition theme / TiddlyWiki default',included:'Included',test:'Test package',helper:'Required helper package',auto:'Added automatically',removed:'Removed from Edition',alsoRemoved:'Also deselected because they depend on the plugin',alsoAdded:'Required plugins selected automatically',build:'Fetching and checking your packages…',done:'Your wiki has downloaded. Open the HTML file to begin.',error:'Could not build the wiki: ',none:'No extra selections. F and Plugin Library are always included.'
};
document.documentElement.lang=da?'da':'en';document.title='TiddlyWiki Forge · '+words.heading;
for(const el of document.querySelectorAll('[data-i18n]'))el.textContent=words[el.dataset.i18n];
const $=id=>document.getElementById(id),select=$('edition'),status=$('status'),button=$('assemble');
const language=da?'da':'en';
const localName=item=>item.display?.[language]?.name||item.name;
const localDescription=item=>item.display?.[language]?.description||item.description||'';
let choices,editions=[],included=[],revision=0,loading=false,building=false;
const autoSelected=new Set();
const checked=selector=>Array.from(document.querySelectorAll(selector)).filter(el=>el.checked&&!el.disabled).map(el=>el.value);
function checkbox(parent,value,label,description,kind){
 const row=document.createElement('label');row.className='choice';
 const input=document.createElement('input');input.type='checkbox';input.value=value;input.className=kind;
 const title=document.createElement('strong');title.textContent=label;
 const desc=document.createElement('p');desc.textContent=description||'';
 const small=document.createElement('small');small.textContent=words.test;
 row.append(input,title,desc,small);$(parent).append(row);input.addEventListener('change',onChoiceChange);
}
function selection(){return [...checked('.optional-plugin'),...checked('.content-plugin'),...checked('.material').flatMap(id=>choices.content.find(c=>c.id===id).requires||[]),...($('theme').value?[$('theme').value]:[])];}
function onChoiceChange(event){
 if(!choices)return;
 const input=event.currentTarget;
 const selected=new Set(checked('.optional-plugin,.content-plugin,.material'));
 // 'change' fires after the browser toggles the input, reconstruct the
 // previous state for an accurate list of automatically changed choices.
 if(input.checked)selected.delete(input.value);else selected.add(input.value);
 try{
  const result=reconcilePackageSelection(selected,input.value,input.checked,choices.packages,choices.content);
  autoSelected.delete(input.value);
  if(input.checked)for(const id of result.added)if(id!==input.value)autoSelected.add(id);
  for(const id of result.removed)autoSelected.delete(id);
  for(const other of document.querySelectorAll('.optional-plugin,.content-plugin,.material')){
   other.checked=result.selected.has(other.value);
   const marker=other.parentElement.querySelector('small');
   marker.textContent=included.includes(other.value)
    ?(other.checked?words.included:words.removed)
    :(other.checked&&autoSelected.has(other.value)?words.auto:words.test);
  }
  const automatic=(input.checked?result.added:result.removed).filter(id=>id!==input.value);
  const label=id=>{
   const pkg=choices.packages.find(p=>p.title===id);
   const material=choices.content.find(m=>m.id===id);
   return pkg?localName(pkg):material?(da?material.label_da:material.label_en):id;
  };
  $('selection-notice').textContent=automatic.length?
   (input.checked?words.alsoAdded:words.alsoRemoved)+': '+automatic.map(label).join(', ')+'.':'';
 }catch(error){
  input.checked=!input.checked;
  $('selection-notice').textContent=error.message;
 }
 summary();
}
function summary(){
 if(!choices)return;
 try{
  const added=resolvePackages(selection(),choices.packages,included);
  const manual=new Set([...checked('.optional-plugin'),...checked('.content-plugin'),$('theme').value].filter(id=>!autoSelected.has(id)));
  const active=new Set([...checked('.optional-plugin'),...checked('.content-plugin')]);
  const removed=included.filter(title=>choices.packages.some(p=>p.title===title&&p['plugin-type']==='plugin')&&!active.has(title));
  const lines=added.map(p=>(manual.has(p.title)?'':'↳ '+words.auto+': ')+localName(p));
  lines.push(...checked('.material').map(id=>{const c=choices.content.find(c=>c.id===id);return da?c.label_da:c.label_en;}));
  if(removed.length)lines.push(words.removed+': '+removed.map(id=>localName(choices.packages.find(p=>p.title===id))).join(', '));
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
 autoSelected.clear();
 // Start from the selected Edition's actual bundles. Preinstalled plugins
 // are checked but editable; themes/languages stay Edition infrastructure.
 for(const input of document.querySelectorAll('.optional-plugin,.content-plugin')){
  input.disabled=false;
  input.checked=included.includes(input.value);
  input.parentElement.querySelector('small').textContent=input.checked?words.included:words.test;
 }
 for(const input of document.querySelectorAll('.material'))input.checked=false;
 $('selection-notice').textContent='';
 summary();
}
async function init(){
 choices=await loadChoices(location.href);editions=choices.editions;
 select.replaceChildren(new Option(words.blank,''));for(const e of editions)select.add(new Option(localName(e),e.id));
 const requested=new URL(location.href).searchParams.get("edition");
 if(requested&&editions.some(item=>item.id===requested))select.value=requested;
 $('theme').add(new Option(words.keep,''));
 for(const p of choices.packages){
  if(p['plugin-type']==='theme'){$('theme').add(new Option(localName(p),p.title));continue;}
  const lessons=p.title.includes('/lessons-');
  checkbox(lessons?'content-list':'plugin-list',p.title,localName(p),localDescription(p),lessons?'content-plugin':'optional-plugin');
 }
 for(const c of choices.content)checkbox('content-list',c.id,da?c.label_da:c.label_en,'', 'material');
 select.disabled=false;await updateDescription();
}
select.addEventListener('change',()=>updateDescription().catch(e=>{status.textContent=words.error+e.message;button.disabled=true;}));
$('theme').addEventListener('change',summary);
button.addEventListener('click',async()=>{
 building=true;button.disabled=true;select.disabled=true;status.textContent=words.build;
 // Capture the full selection before asynchronous reads.
 const selectedPlugins=[...checked('.optional-plugin'),...checked('.content-plugin')];
 const config={choices,editionId:select.value,
  packageTitles:selectedPlugins.filter(title=>!included.includes(title)),
  excludedPackageTitles:included.filter(title=>choices.packages.some(p=>p.title===title&&p['plugin-type']==='plugin')&&!selectedPlugins.includes(title)),
  contentIds:checked('.material'),theme:$('theme').value,
  name:$('wiki-name').value,language:da?'da-DK':'en-GB'};
 try{
  const file=$('core').files[0];
  const [core,result]=await Promise.all([file?file.text().then(html=>({html})):loadOfficialCore(location.href),composeWiki(config)]);
  const html=assembleHtml(core.html,result.tiddlers),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='HUWiki-'+(config.editionId||'custom')+'.html';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent=words.done;
 }catch(e){status.textContent=words.error+e.message;}finally{building=false;select.disabled=false;summary();}
});
init().catch(e=>{status.textContent=words.error+e.message;button.disabled=true;});
