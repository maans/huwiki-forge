/** Reproduce official TW5-Graph and Vis-Network release bundles without modifying upstream code. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=[
 {name:'TW5-Graph',url:'https://github.com/flibbles/tw5-graph/releases/download/v1.7.1/graph.json',path:'plugins/flibbles-graph/dist/plugin.json',digest:'259b7f6b70214347a6ce031cfda61c3ee7df16dc00d4a4dd26cbd7c7ff2e55b5',title:'$:/plugins/flibbles/graph',version:'1.7.1'},
 {name:'Vis-Network',url:'https://github.com/flibbles/tw5-vis-network/releases/download/v10.6.3/__plugins_flibbles_vis-network.json',path:'plugins/flibbles-vis-network/dist/plugin.json',digest:'e2922b21a88d7934b05cf58774fff1da4f8efe89cf41b4effcb4f3a268b65bd5',title:'$:/plugins/flibbles/vis-network',version:'10.6.3'}
];
function verify(buffer,asset){
 const actual=createHash('sha256').update(buffer).digest('hex');
 if(actual!==asset.digest)throw Error('SHA-256 mismatch for '+asset.name+': '+actual);
 const data=JSON.parse(buffer.toString('utf8'));
 if(data.title!==asset.title||data.version!==asset.version||data['plugin-type']!=='plugin')throw Error('Unexpected plugin identity: '+asset.name);
 const shadows=JSON.parse(data.text||'{}').tiddlers;
 if(!shadows||typeof shadows!=='object'||Object.keys(shadows).length<5)throw Error('Missing shadow tiddlers: '+asset.name);
 return Object.keys(shadows).length;
}
async function source(asset){
 const target=path.join(root,asset.path);
 try{const bytes=await readFile(target);const count=verify(bytes,asset);console.log('Verified',asset.name,count,'shadow tiddlers');return;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const reply=await fetch(asset.url,{redirect:'follow',headers:{'User-Agent':'HUWiki-Forge-Graph-Edition'}});
 if(!reply.ok)throw Error('Could not download '+asset.name+': HTTP '+reply.status);
 const bytes=Buffer.from(await reply.arrayBuffer());
 const count=verify(bytes,asset);
 await mkdir(path.dirname(target),{recursive:true});
 await writeFile(target,bytes);
 console.log('Downloaded',asset.name,bytes.length,'bytes;',count,'shadow tiddlers');
}
for(const asset of assets)await source(asset);
if(!process.argv.includes('--only-assets')){
 execFileSync(process.execPath,['scripts/build-forge-plugin-library.mjs'],{cwd:root,stdio:'inherit'});
 execFileSync(process.execPath,['scripts/build-forge-home.mjs'],{cwd:root,stdio:'inherit'});
}
