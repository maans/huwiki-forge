/** Presentation names only. Canonical titles, links, code, authors and licenses stay stable. */
export function publicName(value){
 if(String(value)==='PasteUp')return 'PasteUp Forge';
 return String(value).replace(/\bHUWiki PasteUp\b/g,'PasteUp Forge').replace(/\bHUWiki Forge\b/gi,'TiddlyWiki Forge').replace(/\bHUWiki Community(?: Editions)?\b/gi,'TiddlyWiki Community').replace(/\bHUWiki(?:\s*·)?\s+(?=(?:Plugin Library|Musiklaboratorium|Musikmodul|Musik|Music|MuseScore|ABC|Tegne|Draw|Dansk|HUPedia|HUPin|CutOut|Slideshow|PasteUp|Teater|Theatre|Trim|Publisher|PDF Publisher|SitePublisher|Site Publish|Excalidraw|Modern|Retro|Balkan|Basic exercises|Folk music|India|Indien|Jazz|Rhythm|Rytmik|Editions)\b)/gi,'');
}
const retained=/(?:^|\/)(?:Original[^/]*|Provenance|License[^/]*|Legal|Changelog|History)(?:\/|$)|\/vendor\//i;
export function publicWikiText(text){
 const kept=[];const hold=s=>'\uE100'+(kept.push(s)-1)+'\uE101';
 let s=String(text).replace(/```[\s\S]*?```|`[^`\n]*`|<!--[\s\S]*?-->/g,hold);
 // Keep attribution lines exact, including historical product names.
 s=s.split('\n').map(line=>/copyright|©|\bauthor\b|ophavs|licens|\bcredits?\b|recovered from|kilde:|source:/i.test(line)?hold(line):line).join('\n');
 s=s.replace(/\[\[([^\]]+)\]\]/g,(_,inner)=>{const i=inner.indexOf('|'),label=i<0?inner:inner.slice(0,i),target=i<0?inner:inner.slice(i+1);const renamed=publicName(label);return hold(renamed===label?'[['+inner+']]':'[['+renamed+'|'+target+']]');});
 // Macro arguments, transclusions, filters and widget attributes are references/code.
 s=s.replace(/<<[\s\S]*?>>|\{\{[\s\S]*?\}\}|<\$[^>]*>|\[[^\]\n]*\]|https?:\/\/[^\s<>"']+/g,hold);
 s=publicName(s).replace(/(^|\n)(!+[ \t]+)PasteUp(?! Forge)(?=[ \t–—])/g,'$1$2PasteUp Forge').replace(/(<h[1-4][^>]*>)PasteUp(?! Forge)(?=[ \t<–—])/g,'$1PasteUp Forge');
 for(let i=0;i<8&&s.includes('\uE100');i++)s=s.replace(/\uE100(\d+)\uE101/g,(_,n)=>kept[Number(n)]);
 return s;
}
export function renameTiddler(t){
 if(retained.test(t.title||''))return t;
 for(const field of ['name','caption','description','huwiki-title-da','huwiki-title-en','cutout-ui-title-en'])if(typeof t[field]==='string')t[field]=publicName(t[field]);
 if(t.title==='PasteUp'){t['forge-display-name']='PasteUp Forge';t.caption='PasteUp Forge';}
 if(t.title?.startsWith('HUWiki ')&&publicName(t.title)!==t.title){t['forge-display-name']=publicName(t.title);if(!t.caption)t.caption=t['forge-display-name'];}
 for(const field of ['huwiki-text-da','huwiki-text-en'])if(typeof t[field]==='string')t[field]=publicWikiText(t[field]);
 if(!t.title?.startsWith('$:/config/')&&t.title!=='$:/DefaultTiddlers'&&(!t.type||t.type==='text/vnd.tiddlywiki')&&typeof t.text==='string')t.text=publicWikiText(t.text);
 // Translation dictionaries hold display strings; their lookup keys stay unchanged.
 if(t.type==='application/json'&&/\/strings\.json$/.test(t.title||'')){
  const visit=o=>typeof o==='string'?publicName(o):Array.isArray(o)?o.map(visit):Object.fromEntries(Object.entries(o).map(([k,v])=>[k,visit(v)]));
  t.text=JSON.stringify(visit(JSON.parse(t.text)),null,2)+'\n';
 }
 return t;
}
export function renamePackage(p){
 if(p.title==='$:/plugins/huwiki/pasteup')p.name='PasteUp Forge';
 if(p.title==='$:/plugins/itw/tw-excalidraw'){p.name='Excalidraw Forge';p.description=p.description.replace(/^(?:HUWiki )?Excalidraw(?: Forge)?/, 'Excalidraw Forge');}
 for(const field of ['name','description','caption'])if(typeof p[field]==='string')p[field]=publicName(p[field]);
 const data=JSON.parse(p.text);for(const t of Object.values(data.tiddlers))renameTiddler(t);p.text=JSON.stringify(data);return p;
}
