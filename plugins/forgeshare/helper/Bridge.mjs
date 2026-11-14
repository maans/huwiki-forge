// Same-origin HTTP facade. Approval cookies never enter tiddlers or JS storage.
import {randomUUID} from 'node:crypto';
export const bridgePath='/_forgeshare/bridge/';
export function installBridge(server,invoke,{origins=()=>[]}={}) {
  const previous=server.listeners('request');server.removeAllListeners('request');
  const attempts=[];
  server.on('request',async(req,res)=>{
    if(!req.url.startsWith(bridgePath)){for(const handler of previous)handler.call(server,req,res);return;}
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
    const origin=req.headers.origin,cookieName='ForgeShareAccess-'+server.address().port+'=';
    if(req.method!=='POST'||req.headers['x-forgeshare']!=='1'||req.headers['content-type']!=='application/json'||!origins().includes(origin)||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Same-origin request required'});
    try {
      let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>524288)return send(413,{error:'Request too large'});}
      const operation=req.url.slice(bridgePath.length),input=JSON.parse(text||'{}');
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName))?.slice(cookieName.length);
      if(operation==='pair'){
        const now=Date.now();while(attempts.length&&attempts[0]<now-60000)attempts.shift();if(attempts.length>=10)return send(429,{error:'Please wait'});attempts.push(now);
        const result=await invoke('pair',token,input);
        return send(200,{code:result.code},{'Set-Cookie':`${cookieName}${result.token}; Path=/_forgeshare/bridge/; HttpOnly; SameSite=Strict; Max-Age=2592000${origin.startsWith('https:')?'; Secure':''}`});
      }
      const result=await invoke(operation,token,input);send(200,result);
    }catch {send(403,{error:'Open ForgeShare to approve access or check the connection. / Åbn ForgeShare for at godkende adgang eller kontrollere forbindelsen.'});}
  });
}
export function childBridge(server) {
  let allowed=[];const calls=new Map();
  process.on('message',data=>{
    if(data?.type==='bridge-origins')allowed=data.origins;
    if(data?.type==='bridge-result'){const call=calls.get(data.id);if(call){calls.delete(data.id);clearTimeout(call.timer);data.error?call.reject(Error('Denied')):call.resolve(data.result);}}
  });
  installBridge(server,(operation,token,input)=>new Promise((resolve,reject)=>{
    if(calls.size>=16)return reject(Error('Busy'));
    const id=randomUUID(),timer=setTimeout(()=>{calls.delete(id);reject(Error('Timeout'));},125000);timer.unref();calls.set(id,{resolve,reject,timer});
    process.send?.({type:'bridge',id,operation,token,input});
  }),{origins:()=>allowed});
}
