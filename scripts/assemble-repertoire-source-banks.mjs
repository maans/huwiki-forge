import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {assembleHtml,loadEdition} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..');
async function localFetch(value){
 const url=new URL(value);if(url.origin!=='https://local.invalid'||!url.pathname.startsWith('/forge/'))return {ok:false,status:403};
 try{const data=JSON.parse(await readFile(path.join(root,url.pathname.slice(7)),'utf8'));return {ok:true,status:200,json:async()=>data};}catch(e){return {ok:false,status:e.code==='ENOENT'?404:500};}
}
for(const id of ['akustisk-elektrisk','silba-atno']){
 const folder='editions/'+id+'-repertoire',assembled=await loadEdition('https://local.invalid/forge/'+folder+'/manifest.json',localFetch);
 if(!assembled.tiddlers.some(t=>t.title==='$:/plugins/huwiki/musescore-bank-'+id))throw Error('Source bank missing from '+id);
 let html=assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),assembled.tiddlers);
 // Internal smoke-test builds may point source requests at the local static server.
 if(process.env.MUSESCORE_BANK_TEST_ROOT)html=html.replaceAll('https://forge.xn--mns-ula.dk/catalog/musescore/',process.env.MUSESCORE_BANK_TEST_ROOT+'catalog/musescore/').replaceAll("var ROOT='https://forge.xn--mns-ula.dk/';","var ROOT='"+process.env.MUSESCORE_BANK_TEST_ROOT+"';");
 await writeFile(path.join(root,folder,'index.html'),html);
 console.log(id,Buffer.byteLength(html),'bytes');
}
