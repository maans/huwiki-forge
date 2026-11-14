import {renamePackage} from './public-names.mjs';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {translateSource,nativeVariants} from './creative-language.mjs';
import {createHash} from 'node:crypto';
const raw=gunzipSync(Buffer.from((await readFile('migration/creative/slideshow.b64','utf8')).trim(),'base64'));
const record=JSON.parse(await readFile('migration/creative/provenance.json','utf8')).bundles.slideshow;
if(createHash('sha256').update(raw).digest('hex')!==record.sha256)throw Error('Slideshow source changed');
const p=JSON.parse(raw),rows=JSON.parse(p.text).tiddlers,base='$:/plugins/huwiki/slideshow/';
async function walk(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())await walk(dir+'/'+e.name,name+'/');else if(name.endsWith('.js')){const title=base+name;rows[title]={...(rows[title]||{title,type:'application/javascript','module-type':'startup'}),text:await readFile(dir+'/'+e.name,'utf8')};}}}
await walk('plugins/slideshow/src');
rows[base+'i18n.js']['module-type']='library';
rows[base+'strings.json']={title:base+'strings.json',type:'application/json',text:await readFile('plugins/slideshow/src/strings.json','utf8')};
rows[base+'readme']={title:base+'readme',type:'text/vnd.tiddlywiki',text:await readFile('plugins/slideshow/src/readme-da.txt','utf8')};
nativeVariants(rows,base+'readme',await readFile('plugins/slideshow/src/readme-en.txt','utf8'),base+'Guide');
p.list='readme';
const dictionary=JSON.parse(await readFile('plugins/slideshow/src/strings.json','utf8'));
for(const title of Object.keys(rows))if((['HUWiki Slideshow – Start','Slideshow – Bibliotek','Slideshow – Del'].includes(title)||title.startsWith(base)&&!title.includes('/vendor/')&&!title.startsWith(base+'Guide/')&&title!==base+'readme')&&(!rows[title].type||rows[title].type==='text/vnd.tiddlywiki')&&rows[title].text)nativeVariants(rows,title,translateSource(rows[title].text,dictionary,Object.keys(rows)),base+'Native');
p.text=JSON.stringify({tiddlers:rows});p.version='0.8.39-test.1';p.description='Slideshow, PasteUp, local documents, PDF and editable ZIP · Dansk / English';
renamePackage(p);
const text=JSON.stringify(p,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile('plugins/slideshow/dist/plugin.json','utf8')!==text)throw Error('Stale slideshow bundle');}else{await mkdir('plugins/slideshow/dist',{recursive:true});await writeFile('plugins/slideshow/dist/plugin.json',text);}
console.log('Slideshow',Buffer.byteLength(text),'bytes');
