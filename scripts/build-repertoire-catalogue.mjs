/** Index published repertoire originals; ABC is stored once and loaded on demand. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const source=resolve(value('--source','.')),output=resolve(value('--output','catalog/repertoire'));
const catalog={};runInNewContext(await readFile(join(root,'plugins/abc/src/repertoire-catalog.js'),'utf8'),{exports:catalog,URL});
const collections=[['birdland','Birdland'],['birdland/guitar','Birdland · Guitar'],['bjarke','Bjarkes nodepult'],['helles','Helles'],['silba','Silba Ätno'],['akustisk','Akustisk Elektrisk']];
const indexes=[],sources=[];
for(const [path,name] of collections){
 const file=join(source,'wiki',path,'index.html');let html;
 try{html=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
 const rows=[];for(const match of html.matchAll(/<script\b[^>]*class=["'][^"']*\btiddlywiki-tiddler-store\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/g)){const data=JSON.parse(match[1]);if(Array.isArray(data))rows.push(...data);}
 if(!rows.length)throw Error('No tiddlers in '+file);
 indexes.push(catalog.fromRows(rows,{name,url:'https://xn--mns-ula.dk/wiki/'+path+'/'}));
 sources.push({name,path:'wiki/'+path+'/index.html',sha256:createHash('sha256').update(html).digest('hex')});
}
if(!indexes.length)throw Error('No published repertoire wikis found');
const index=catalog.merge(indexes);await mkdir(join(output,'abc'),{recursive:true});
for(const entry of index.entries)for(const variant of entry.variants){
 if(!variant.fields)continue;
 const data=JSON.stringify(variant.fields,null,2)+'\n',hash=createHash('sha256').update(data).digest('hex');
 variant.abcPath='abc/'+hash+'.json';delete variant.fields;
 await writeFile(join(output,variant.abcPath),data);
}
index.sources=sources;
await writeFile(join(output,'index.json'),JSON.stringify(index,null,2)+'\n');
const used=new Set(index.entries.flatMap(e=>e.variants.map(v=>v.abcPath).filter(Boolean)).map(p=>p.slice(4)));
const {unlink}=await import('node:fs/promises');for(const name of await readdir(join(output,'abc')))if(/^[a-f0-9]{64}\.json$/.test(name)&&!used.has(name))await unlink(join(output,'abc',name));
console.log('Shared repertoire library:',index.entries.length,'tunes;',index.entries.filter(e=>e.variants.some(v=>v.role==='leadsheet')).length,'leadsheets;',used.size,'ABC versions;',sources.length,'published wikis');
