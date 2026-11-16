import {createServer} from 'node:http';
import {realpath,stat,readFile,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.pdf':'application/pdf','.mp3':'audio/mpeg','.mp4':'video/mp4','.txt':'text/plain; charset=utf-8'};
export async function validateSite(folder){const root=await realpath(folder);if(!(await stat(root)).isDirectory())throw Error('Choose a site folder / Vælg en sitesmappe');const index=await lstat(path.join(root,'index.html'));if(!index.isFile()||index.isSymbolicLink())throw Error('Choose a site folder containing index.html / Vælg en sitesmappe med index.html');return root;}
export async function startSite({wiki,port,lanHost,allowAnonymous=false,credentials}){
  const root=await validateSite(wiki),accounts=allowAnonymous?[]:(await readFile(credentials,'utf8')).trim().split(/\r?\n/).slice(1).map(line=>Buffer.from(line.replace(',',':')).toString('base64'));
  if(!allowAnonymous&&!accounts.length)throw Error('Login required');
  const digest=s=>createHash('sha256').update(s).digest();
  const server=createServer(async(req,res)=>{
    const send=(status,body='',headers={})=>{res.writeHead(status,{'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...headers});res.end(body);};
    if(!['GET','HEAD'].includes(req.method))return send(405);
    if(!allowAnonymous&&!accounts.some(a=>timingSafeEqual(digest('Basic '+a),digest(req.headers.authorization||''))))return send(401,'',{'WWW-Authenticate':'Basic realm="ForgeShare"'});
    if(req.url==='/status')return send(200,'{"site":true}',{'Content-Type':'application/json'});
    let handle;
    try {
      // Inspect raw segments before URL normalization; never follow symlinks, list folders,
      // expose dotfiles, credentials, or escape the selected directory.
      const pathname=decodeURIComponent(req.url.split('?')[0]);
      if(!pathname.startsWith('/')||pathname.includes('\\')||pathname.includes('\0'))return send(400);
      const segments=pathname.split('/').filter(Boolean);if(segments.some(s=>s.startsWith('.')||s.includes(':')))return send(404);
      if(!segments.length||pathname.endsWith('/'))segments.push('index.html');
      let candidate=root;
      for(const segment of segments){candidate=path.join(candidate,segment);if((await lstat(candidate)).isSymbolicLink())return send(404);}
      const canonical=await realpath(candidate);if(!canonical.startsWith(root+path.sep))return send(404);
      const ext=path.extname(candidate).toLowerCase();if(!types[ext])return send(404);
      handle=await open(candidate,constants.O_RDONLY|(constants.O_NOFOLLOW||0));const info=await handle.stat();if(!info.isFile())return send(404);
      res.writeHead(200,{'Content-Type':types[ext],'Content-Length':info.size,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
      if(req.method==='HEAD'){res.end();return;}
      const stream=handle.createReadStream({autoClose:false});await new Promise(resolve=>{stream.on('error',()=>{res.destroy();resolve();});res.once('close',()=>{stream.destroy();resolve();});stream.on('end',resolve);stream.pipe(res);});
    }catch{if(!res.headersSent)send(404);else res.destroy();}finally{await handle?.close();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=200;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,lanHost||'127.0.0.1',resolve);});return server;
}
export async function siteWorker(options){const server=await startSite(options);process.send?.({type:'listening',address:server.address()});const stop=()=>{server.close(()=>process.exit(0));server.closeAllConnections();};process.on('message',m=>{if(m?.type==='shutdown')stop();});process.on('disconnect',stop);for(const s of ['SIGTERM','SIGINT','SIGHUP'])process.on(s,stop);}
