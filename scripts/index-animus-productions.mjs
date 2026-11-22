/** Index reusable roots from the published shows; never bundle a film or sound file. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),out=new URL('../assets/animus/',import.meta.url),host='https://forge.xn--mns-ula.dk/assets/animus/';
const hash=v=>createHash('sha256').update(v).digest('hex'),slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
await mkdir(new URL('models/',out),{recursive:true});await mkdir(new URL('files/productions/',out),{recursive:true});
const catalogue=await read('assets/animus/catalog.json');catalogue.entries=catalogue.entries.filter(e=>!e.collection.startsWith('production-'));
const sources=[['orchestra','animus-orchestra','plugins/animus-example-orchestra/dist/plugin.json'],['tinderbox','animus-tinderbox','plugins/animus-example-fyrtoejet/dist/plugin.json'],['turn-around','turn-around','editions/turn-around/tiddlers/'],['theseus','theseus-ship','editions/theseus-ship/tiddlers/']];
for(const [key,edition,path] of sources){
 const rows={};if(path.endsWith('plugin.json'))Object.assign(rows,JSON.parse((await read(path)).text).tiddlers);
 else for(const name of (await readdir(new URL(path,root))).sort()){if(!name.endsWith('.json'))continue;const data=await read(path+name);if(Array.isArray(data))for(const t of data)rows[t.title]=t;}
 const seen=new Set();let count=0;
 for(const t of Object.values(rows)){
  if(t.type!=='application/json'||!t.text)continue;let scene;try{scene=JSON.parse(t.text);}catch{continue;}if(!Array.isArray(scene.parts)||!scene.parts.length)continue;
  for(const original of scene.parts){
   if(original.parent||/^(spoken-|song-line-|sing-label$|direction-|caption|curtain-)/.test(original.id)||original.lipSync||original.type==='text')continue;
   const ids=new Set([original.id]);for(let n=0;n<16;n++)for(const p of scene.parts)if(ids.has(p.parent))ids.add(p.id);
   const parts=structuredClone(scene.parts.filter(p=>ids.has(p.id)));if(parts.some(p=>p.source||p.type==='clip'||p.type==='animation'))continue;
   const assets=[],media=new Map();let unsupported=false;
   for(const p of parts){
    if(p.keys?.length)p.keys=[{...p.keys[0],t:0}];delete p.lipSync;
    for(const v of [p,...p.variants||[]]){
     let data;if(v.asset){const row=rows[v.asset];if(!row||row.type!=='image/png'||!row.text||row._canonical_uri){unsupported=true;break;}data=Buffer.from(row.text,'base64');}
     else if(/^data:image\/png;base64,/.test(v.imageData||''))data=Buffer.from(v.imageData.split(',')[1],'base64');
     if(!data)continue;
     const sha=hash(data),id='production/'+sha.slice(0,24),file='files/productions/'+sha+'.png';if(!media.has(id)){const asset={id,url:host+file,mime:'image/png',sha256:sha};assets.push(asset);media.set(id,asset);await writeFile(new URL(file,out),data);}
     v.asset=id;delete v.imageData;delete v.assetId;
    }
   }
   if(unsupported)continue;
   const own=parts.find(p=>p.id===original.id);own.parent=null;own.keys=[{t:0,x:0,y:0,r:0,sx:1,sy:1,opacity:1}];
   const signature=hash(JSON.stringify(parts.map(p=>{const clean={...p};delete clean.keys;delete clean.name;return clean;})));
   if(seen.has(signature))continue;seen.add(signature);
   const figure=parts.some(p=>/head|hoved|mouth|mund/.test(p.id))&&parts.length>3;
   const geo=original.geo||{},background=original.type==='image'&&((geo.w||0)>=scene.width*.75&&(geo.h||0)>=scene.height*.75)&&!/foreground/.test(original.id);
   const category=figure?'figure':background?'background':/foreground|floor|stage|wall|tree|house|scenery|shelf/.test(original.id)?'scenery':'prop';
   const id='production-'+key+'-'+slug(original.id)+'-'+signature.slice(0,10),model=JSON.stringify({parts}),modelPath='models/'+id+'.json';await writeFile(new URL(modelPath,out),model+'\n');
   const name=original.name&&original.name!==original.id?original.name:original.id.replace(/-/g,' ');
   catalogue.entries.push({id,name,category,collection:'production-'+key,author:'Måns Mårtensson / AniMus Forge',source:'https://forge.xn--mns-ula.dk/demo/?edition='+edition,license:'Forge project artwork',licenseUrl:'',assets,preview:assets[0]?.url||'',modelUrl:host+modelPath,modelSha256:hash(model+'\n'),sourceWidth:scene.width||960,sourceHeight:scene.height||540,height:300,keywords:[key,edition,t.title,name,category].join(' ')});count++;
  }
 }
 if(!count)throw Error('No reusable materials indexed for '+key);console.log(key+': '+count+' individual materials');
}
await writeFile(new URL('catalog.json',out),JSON.stringify(catalogue,null,2)+'\n');console.log('Catalogue: '+catalogue.entries.length+' materials');
