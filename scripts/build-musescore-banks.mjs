/** Build the two small source-catalogue plugins; original binaries stay separate. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
for(const id of ['akustisk-elektrisk','silba-atno']){
 const index=JSON.parse(await readFile(new URL('catalog/musescore/'+id+'.json',root),'utf8'));
 const info=JSON.parse(await readFile(new URL('plugins/musescore-bank-'+id+'/plugin-info.json',root),'utf8'));
 if(index.id!==id||index.schemaVersion!==1)throw Error('Invalid catalogue '+id);
 const families=new Map(),ids=new Set();
 for(const entry of index.entries){
  if(ids.has(entry.id))throw Error('Duplicate entry '+entry.id);ids.add(entry.id);
  if('abc-source' in entry||'abc' in entry)throw Error('The source bank must not contain preconverted ABC');
  const counts=families.get(entry.family)||[0,0];counts[0]++;if(entry.preferred)counts[1]++;families.set(entry.family,counts);
  if(entry.format==='pending'){if(entry.sourcePath)throw Error('Pending entry has an invented source');continue;}
  if(!/^catalog\/musescore\/sources\/[a-f0-9]{64}\.(mscz|mscx|musicxml|mxl)$/.test(entry.sourcePath))throw Error('Invalid source path');
  const bytes=await readFile(new URL(entry.sourcePath,root));
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256||bytes.length!==entry.bytes)throw Error('Source integrity failure: '+entry.sourceFile);
 }
 for(const [family,counts] of families)if(counts[1]!==1)throw Error('One preferred source required: '+family);
 const title=info.title+'/index',browse=info.title+'/browse',titleFilter=info.title+'/title-filter',titleTemplate=info.title+'/title',payload={tiddlers:{
  [title]:{title,tags:'$:/tags/MuseScoreCatalogue',type:'application/json',text:JSON.stringify(index)},
  [browse]:{title:browse,caption:'Nodearkiv',type:'text/vnd.tiddlywiki',text:'<$huwiki-abc-search source="bank:'+id+'"/>'},
  [titleFilter]:{title:titleFilter,tags:'$:/tags/ViewTemplateTitleFilter','list-before':'$:/config/ViewTemplateTitleFilters/system',text:'[match['+browse+']then['+titleTemplate+']]'},
  [titleTemplate]:{title:titleTemplate,type:'text/vnd.tiddlywiki',text:'\\whitespace trim\n<h2 class="tc-title"><$view field="caption" format="text"/></h2>\n'}
 }};
 const text=JSON.stringify({...info,text:JSON.stringify(payload)},null,2)+'\n',target=new URL('plugins/musescore-bank-'+id+'/dist/plugin.json',root);
 if(check){if(await readFile(target,'utf8')!==text)throw Error('Stale bank plugin '+id);}else await writeFile(target,text);
 console.log(info.name+': '+families.size+' titles, '+index.entries.length+' source/version records; originals verified');
}
