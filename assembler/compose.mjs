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
 const [catalog,registry,materials]=await Promise.all([
  readJson(new URL('catalog/editions.json',root),fetcher),readJson(registryUrl,fetcher),readJson(materialsUrl,fetcher)
 ]);
 if(catalog.schemaVersion!==1||registry.schemaVersion!==1||materials.schemaVersion!==1)throw Error('Unknown Forge catalog');
 const path=p=>new URL(p,root).pathname;
 const editions=catalog.editions.map(e=>({...e,manifestUrl:sameOriginUrl(e.manifest,new URL('catalog/editions.json',root),[path('editions/')])}));
 const packages=registry.items.map(e=>({...e.fields,url:sameOriginUrl(e.path,registryUrl,[path('plugins/'),path('themes/')])}));
 const seen=new Set();for(const p of packages){if(seen.has(p.title))throw Error('Duplicate registry title: '+p.title);seen.add(p.title);}
 const content=materials.items.filter(m=>m.kind==='tiddler-collection').map(m=>({...m,url:sameOriginUrl(m.source,materialsUrl,[path('editions/')])}));
 return {root:root.href,editions,packages,content};
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
Plugins og deres vejledninger findes i [[Kontrolpanel|$:/ControlPanel]]. F-knappen fører tilbage til Forge; HUWiki Community og Plugin Library følger med.
</$list>
<$list filter="[{$:/language}else[$:/languages/en-GB]!prefix[$:/languages/da]]" variable="locale">
! Your wiki is ready

Use the plus button to add a tiddler. Use TiddlyWiki’s Save button to save your HTML file.

!! Your content
<$list filter="[all[tiddlers]!is[system]!is[draft]!match[Min wiki / My wiki]]"><$link/><br/></$list>

!! Your tools
Find plugins and their guides in the [[Control Panel|$:/ControlPanel]]. F takes you back to Forge; HUWiki Community and Plugin Library are included.
</$list>`};
export async function composeWiki({choices,editionId='',packageTitles=[],contentIds=[],theme='',name='',language='en-GB'},fetcher=fetch){
 if(!['en-GB','da-DK'].includes(language))throw Error('Unsupported language');
 const chosenContent=contentIds.map(id=>{const c=choices.content.find(m=>m.id===id);if(!c)throw Error('Unknown material: '+id);return c;});
 let manifest={id:'custom',plugins:[]},tiddlers=[];
 if(editionId){
  const e=choices.editions.find(e=>e.id===editionId);if(!e)throw Error('Unknown Edition');
  ({manifest,tiddlers}=await loadEdition(e.manifestUrl,fetcher));
  if(manifest.id!==e.id||manifest.coreVersion!=='5.4.1')throw Error('Edition identity/core mismatch');
 }
 const registry=new Map(choices.packages.map(p=>[p.title,p]));
 for(const bundled of tiddlers.filter(p=>p['plugin-type'])){
  const entry=registry.get(bundled.title);
  if(entry && bundled.version!==entry.version)throw Error('Bundled/registry version mismatch: '+bundled.title);
 }
 const selected=[...packageTitles,...chosenContent.flatMap(c=>c.requires||[]),...(theme?[theme]:[])];
 // Dependencies of bundled packages must also be satisfied.
 const required=[...selected,...tiddlers.filter(p=>p['plugin-type']).flatMap(p=>listTitles(p.dependents))];
 const added=resolvePackages(required,choices.packages,tiddlers.filter(t=>t['plugin-type']).map(t=>t.title));
 for(const entry of added){
  const p=await readJson(entry.url,fetcher);
  if(p.title!==entry.title||p.version!==entry.version||p['plugin-type']!==entry['plugin-type']||p.dependents!==entry.dependents && (p.dependents||entry.dependents))throw Error('Registry/package mismatch: '+entry.title);
  mergeTiddlers(tiddlers,[p]);
 }
 for(const c of chosenContent){const data=await readJson(c.url,fetcher);if(!Array.isArray(data))throw Error('Expected tiddler collection');mergeTiddlers(tiddlers,data);}
 const shared=await readJson(new URL('editions/shared/libraries.json',choices.root),fetcher);mergeTiddlers(tiddlers,shared);
 if(!tiddlers.some(t=>t.title==='$:/languages/da-DK'))mergeTiddlers(tiddlers,[await readJson(new URL('languages/da-DK/plugin.json',choices.root),fetcher)]);
 function set(title,text){const i=tiddlers.findIndex(t=>t.title===title);if(i<0)tiddlers.push({title,text});else tiddlers[i]={...tiddlers[i],text};}
 if(!editionId){mergeTiddlers(tiddlers,[starter]);set('$:/DefaultTiddlers','[[Min wiki / My wiki]]');set('$:/SiteSubtitle','TiddlyWiki · HUWiki Forge');}
 if(theme){const p=choices.packages.find(p=>p.title===theme);if(!p||p['plugin-type']!=='theme')throw Error('Invalid theme');set('$:/theme',theme);}
 if(name.trim())set('$:/SiteTitle',name.trim());else if(!editionId)set('$:/SiteTitle',language==='da-DK'?'Min wiki':'My wiki');
 set('$:/language','$:/languages/'+language);
 const active=tiddlers.find(t=>t.title==='$:/theme')?.text;
 checkShadowConflicts(tiddlers,active);
 return {manifest,tiddlers,added,materials:chosenContent};
}
