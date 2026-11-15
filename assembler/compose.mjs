/* Extend the existing Assembler using its existing plugin registry and materials.
   No new package service. Conflicting titles fail instead of silently overwriting. */
import {loadEdition} from './assemble.mjs';
export const listTitles=text=>Array.from(String(text||'').matchAll(/\[\[([^\]]+)\]\]|([^\s]+)/g),m=>m[1]||m[2]);
export function sameOriginUrl(reference,base,prefixes){
 const url=new URL(reference,base),origin=new URL(base).origin;
 if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||!prefixes.some(p=>url.pathname.startsWith(p)))throw Error('Package outside Forge: '+reference);
 return url.href;
}
export async function readJson(url,fetcher=fetch){const r=await fetcher(url);if(!r.ok)throw Error('HTTP '+r.status+': '+url);return r.json();}
export async function loadChoices(base,fetcher=fetch){
 const root=new URL('../',base);const registryUrl=new URL('library/plugins/registry.json',root).href;
 const materialsUrl=new URL('catalog/materials.json',root).href;
 const localeUrl=new URL('catalog/assembler-i18n.json',root).href;
 const [catalog,registry,materials,locales]=await Promise.all([
  readJson(new URL('catalog/editions.json',root),fetcher),readJson(registryUrl,fetcher),
  readJson(materialsUrl,fetcher),readJson(localeUrl,fetcher)
 ]);
 if(catalog.schemaVersion!==1||registry.schemaVersion!==1||materials.schemaVersion!==1||
    locales.schemaVersion!==1||!locales.editions||!locales.packages)throw Error('Unknown Forge catalog');
 const path=p=>new URL(p,root).pathname;
 // Localized display strings are separate from canonical package metadata and IDs.
 // The native TiddlyWiki plugin library still receives the original metadata.
 const editions=catalog.editions.map(e=>({...e,
  display:locales.editions[e.id]||null,
  manifestUrl:sameOriginUrl(e.manifest,new URL('catalog/editions.json',root),[path('editions/')])
 }));
 const packages=registry.items.map(e=>({...e.fields,
  display:locales.packages[e.fields.title]||null,
  url:sameOriginUrl(e.path,registryUrl,[path('plugins/'),path('themes/')])
 }));
 const seen=new Set();for(const p of packages){if(seen.has(p.title))throw Error('Duplicate registry title: '+p.title);seen.add(p.title);}
 const content=materials.items.filter(m=>m.kind==='tiddler-collection').map(m=>({...m,url:sameOriginUrl(m.source,materialsUrl,[path('editions/')])}));
 return {root:root.href,editions,packages,content};
}
/**
 * Keep the selection dependency-safe in the direction of the dependency.
 * Removing a dependent never removes its requirements: removing MuseScore
 * importer must not remove ABC. Removing a requirement removes only selected
 * packages/content that depend on it (directly or transitively).
 * Enabling a dependent selects its known requirements.
 */
export function reconcilePackageSelection(current,changed,enabled,packages,materials=[]){
 const registry=new Map(packages.map(p=>[p.title,p]));
 const content=new Map(materials.map(p=>[p.id,p]));
 const known=new Set([...registry.keys(),...content.keys()]);
 if(!known.has(changed))throw Error('Unknown selection: '+changed);
 const selected=new Set([...current].filter(id=>known.has(id)));
 const before=new Set(selected);
 const requirements=id=>{
  const item=registry.get(id)||content.get(id);
  return item?(registry.has(id)?listTitles(item.dependents):item.requires||[]):[];
 };
 if(enabled){
  const visiting=new Set(),done=new Set();
  const visit=id=>{
   if(done.has(id))return;
   if(visiting.has(id))throw Error('Circular dependency: '+id);
   visiting.add(id);
   for(const dep of requirements(id)){
    if(!registry.has(dep)&&!['$:/themes/tiddlywiki/vanilla','$:/themes/tiddlywiki/snowwhite'].includes(dep))
     throw Error('Missing dependency: '+dep);
    if(registry.has(dep))visit(dep);
   }
   visiting.delete(id);done.add(id);selected.add(id);
  };
  visit(changed);
 }else{
  selected.delete(changed);
  // Iteratively remove only dependents of missing requirements.
  let changedAgain=true;
  while(changedAgain){
   changedAgain=false;
   for(const id of [...selected]){
    if(requirements(id).some(dep=>registry.has(dep)&&!selected.has(dep))){
     selected.delete(id);changedAgain=true;
    }
   }
  }
 }
 return {selected,added:[...selected].filter(id=>!before.has(id)),removed:[...before].filter(id=>!selected.has(id))};
}
export function resolvePackages(selected,packages,present=[]){
 const registry=new Map(packages.map(p=>[p.title,p]));const done=new Set(present),visiting=new Set(),ordered=[];
 const core=new Set(['$:/themes/tiddlywiki/vanilla','$:/themes/tiddlywiki/snowwhite']);
 function visit(title){
  if(done.has(title)||core.has(title))return;
  if(visiting.has(title))throw Error('Circular dependency: '+title);
  const p=registry.get(title);if(!p)throw Error('Missing dependency: '+title);
  visiting.add(title);for(const dependency of listTitles(p.dependents))visit(dependency);
  visiting.delete(title);done.add(title);ordered.push(p);
 }
 for(const title of selected)visit(title);return ordered;
}
export function mergeTiddlers(target,incoming){
 const byTitle=new Map(target.map(t=>[t.title,t]));
 for(const t of incoming){
  if(!t||typeof t.title!=='string'||typeof t.text!=='string')throw Error('Invalid tiddler');
  const old=byTitle.get(t.title);
  if(old){
   // Compare content/type/version, not incidental creation timestamps or field order.
   if(old.text!==t.text||old.type!==t.type||old.version!==t.version)throw Error('Conflicting tiddler: '+t.title);
  }else{target.push(t);byTitle.set(t.title,t);}
 }
 return target;
}
export function checkShadowConflicts(tiddlers,activeTheme){
 const owners=new Map();
 for(const p of tiddlers){
  if(!p['plugin-type']||p['plugin-type']==='language'||(p['plugin-type']==='theme'&&p.title!==activeTheme))continue;
  const children=JSON.parse(p.text).tiddlers;if(!children||Array.isArray(children))throw Error('Invalid plugin store: '+p.title);
  for(const [title,t] of Object.entries(children)){
   const previous=owners.get(title);
   if(previous && (previous.t.text!==t.text||previous.t.type!==t.type))throw Error('Conflicting plugin content: '+title+' ('+previous.owner+' / '+p.title+')');
   owners.set(title,{owner:p.title,t});
  }
 }
}
const starter={title:'Min wiki / My wiki',type:'text/vnd.tiddlywiki',text:`<$list filter="[{$:/language}prefix[$:/languages/da]]" variable="locale">
! Din wiki er klar

Tilføj en ny tiddler med plusknappen. Brug TiddlyWikis Gem-knap til at gemme din HTML-fil.

!! Dit indhold
<$list filter="[all[tiddlers]!is[system]!is[draft]!match[Min wiki / My wiki]]"><$link/><br/></$list>

!! Dine værktøjer
Plugins og deres vejledninger findes i [[Kontrolpanel|$:/ControlPanel]]. F-knappen fører tilbage til Forge. Plugin Library findes i kontrolpanelet.
</$list>
<$list filter="[{$:/language}else[$:/languages/en-GB]!prefix[$:/languages/da]]" variable="locale">
! Your wiki is ready

Use the plus button to add a tiddler. Use TiddlyWiki’s Save button to save your HTML file.

!! Your content
<$list filter="[all[tiddlers]!is[system]!is[draft]!match[Min wiki / My wiki]]"><$link/><br/></$list>

!! Your tools
Find plugins and their guides in the [[Control Panel|$:/ControlPanel]]. F takes you back to Forge. Plugin Library is available in the Control Panel.
</$list>`};
export async function composeWiki({choices,editionId='',packageTitles=[],excludedPackageTitles=[],contentIds=[],theme='',name='',language='en-GB'},fetcher=fetch){
 if(!['en-GB','da-DK'].includes(language))throw Error('Unsupported language');
 const chosenContent=contentIds.map(id=>{const c=choices.content.find(m=>m.id===id);if(!c)throw Error('Unknown material: '+id);return c;});
 let manifest={id:'custom',plugins:[]},tiddlers=[];
 if(editionId){
  const e=choices.editions.find(e=>e.id===editionId);if(!e)throw Error('Unknown Edition');
  ({manifest,tiddlers}=await loadEdition(e.manifestUrl,fetcher));
  if(manifest.id!==e.id||manifest.coreVersion!=='5.4.1')throw Error('Edition identity/core mismatch');
 }
 const registry=new Map(choices.packages.map(p=>[p.title,p]));
 const originalBundled=new Set(tiddlers.filter(t=>t['plugin-type']).map(t=>t.title));
 const excluded=new Set(excludedPackageTitles);
 for(const title of excluded){
  const entry=registry.get(title);
  // Only optional, visibly listed plugin packages can be removed; language,
  // theme and infrastructure tiddlers are managed by the Edition itself.
  if(!originalBundled.has(title)||entry?.['plugin-type']!=='plugin')
   throw Error('Cannot remove non-optional Edition package: '+title);
  if(packageTitles.includes(title))
   throw Error('Package both selected and excluded: '+title);
 }
 if(excluded.size)tiddlers=tiddlers.filter(t=>!excluded.has(t.title));
 for(const bundled of tiddlers.filter(p=>p['plugin-type'])){
  const entry=registry.get(bundled.title);
  if(entry && bundled.version!==entry.version)throw Error('Bundled/registry version mismatch: '+bundled.title);
 }
 const selected=[...packageTitles,...chosenContent.flatMap(c=>c.requires||[]),...(theme?[theme]:[])];
 // Dependencies of bundled packages must also be satisfied.
 const required=[...selected,...tiddlers.filter(p=>p['plugin-type']).flatMap(p=>listTitles(p.dependents))];
 const added=resolvePackages(required,choices.packages,tiddlers.filter(t=>t['plugin-type']).map(t=>t.title));
 // Never silently reintroduce a package the user unchecked. An unchecked
 // required dependency is an invalid selection, not an implicit re-install.
 const conflicting=added.find(entry=>excluded.has(entry.title));
 if(conflicting)throw Error('Cannot remove required Edition package: '+conflicting.title);
 for(const entry of added){
  const p=await readJson(entry.url,fetcher);
  if(p.title!==entry.title||p.version!==entry.version||p['plugin-type']!==entry['plugin-type']||p.dependents!==entry.dependents && (p.dependents||entry.dependents))throw Error('Registry/package mismatch: '+entry.title);
  mergeTiddlers(tiddlers,[p]);
 }
 for(const c of chosenContent){const data=await readJson(c.url,fetcher);if(!Array.isArray(data))throw Error('Expected tiddler collection');mergeTiddlers(tiddlers,data);}
 const shared=await readJson(new URL('editions/shared/libraries.json',choices.root),fetcher);mergeTiddlers(tiddlers,shared);
 if(!tiddlers.some(t=>t.title==='$:/languages/da-DK'))mergeTiddlers(tiddlers,[await readJson(new URL('languages/da-DK/plugin.json',choices.root),fetcher)]);
 function set(title,text){const i=tiddlers.findIndex(t=>t.title===title);if(i<0)tiddlers.push({title,text});else tiddlers[i]={...tiddlers[i],text};}
 if(!editionId){mergeTiddlers(tiddlers,[starter]);set('$:/DefaultTiddlers','[[Min wiki / My wiki]]');set('$:/SiteSubtitle','TiddlyWiki · TiddlyWiki Forge');}
 if(theme){const p=choices.packages.find(p=>p.title===theme);if(!p||p['plugin-type']!=='theme')throw Error('Invalid theme');set('$:/theme',theme);}
 if(name.trim())set('$:/SiteTitle',name.trim());else if(!editionId)set('$:/SiteTitle',language==='da-DK'?'Min wiki':'My wiki');
 set('$:/language','$:/languages/'+language);
 const active=tiddlers.find(t=>t.title==='$:/theme')?.text;
 checkShadowConflicts(tiddlers,active);
 return {manifest,tiddlers,added,materials:chosenContent};
}
