import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
export async function serveDemo(t){
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html');
   const file=new URL('.'+decodeURIComponent(path),root);
   if(!file.href.startsWith(root.href))throw Error('Outside repository');
   const contents=await readFile(file);
   const type=path.endsWith('.html')?'text/html':/\.m?js$/.test(path)?'text/javascript':path.endsWith('.css')?'text/css':'application/json';
   res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(contents);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>server.close());
 return 'http://127.0.0.1:'+server.address().port;
}
