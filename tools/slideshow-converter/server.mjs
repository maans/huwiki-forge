/** Optional local-only LibreOffice adapter. No account, cloud or wiki storage. */
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const MAX=20*1024*1024;
const allowed=new Set(['doc','docx','ppt','pptx','odt','odp','rtf','html','htm']);
function run(binary,args){return new Promise((resolve,reject)=>{const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b.toString().slice(0,2000));child.stderr.on('data',b=>output+=b.toString().slice(0,2000));const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Conversion exceeded 90 seconds'));},90000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('LibreOffice failed. Check that it is installed and the document can be opened.'));});});}
export async function convert(input,{binary='soffice'}={}){
 const name=String(input.name||''),ext=name.split('.').at(-1).toLowerCase();
 if(!allowed.has(ext))throw Error('Unsupported document format');
 if(typeof input.base64!=='string'||input.base64.length>Math.ceil(MAX*4/3)+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw Error('Invalid or oversized document');
 const data=Buffer.from(input.base64,'base64');if(!data.length||data.length>MAX)throw Error('Document must be between 1 byte and 20 MB');
 const dir=await mkdtemp(path.join(tmpdir(),'forge-convert-'));
 try{
  const profile=path.join(dir,'profile'),out=path.join(dir,'out');await mkdir(path.join(profile,'user'),{recursive:true});await mkdir(out);
  // Dedicated profile: never reuse personal Office settings, extensions or accounts.
  await writeFile(path.join(profile,'user','registrymodifications.xcu'),'<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
  const file=path.join(dir,'source.'+ext);await writeFile(file,data);
  await run(binary,['-env:UserInstallation='+pathToFileURL(profile).href,'--headless','--nologo','--nodefault','--norestore','--convert-to','pdf','--outdir',out,file]);
  const pdf=await readFile(path.join(out,'source.pdf'));if(pdf.length>MAX||pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Conversion did not produce a supported PDF');
  return {kind:'pdf',name:path.basename(name),base64:pdf.toString('base64'),warning:'Converted locally with LibreOffice. Check fonts, layout and page breaks in the preview. Animations and speaker notes are not imported from office files.'};
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function start({port=4977,binary=process.env.SOFFICE_BIN||'soffice',token=randomBytes(32).toString('hex')}={}){
 let busy=false;
 const server=createServer(async(req,res)=>{
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(req.headers.host||''))return json(403,{error:'Local host required'});
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return json(401,{error:'Session code required'});
  if(req.method==='GET'&&req.url==='/health')return json(200,{service:'huwiki-local-office',version:1});
  if(req.method!=='POST'||req.url!=='/convert')return json(404,{error:'Not found'});
  if(busy)return json(429,{error:'Another conversion is running'});
  busy=true;let size=0;const chunks=[];
  try{for await(const chunk of req){size+=chunk.length;if(size>29*1024*1024){json(413,{error:'Document is too large'});req.destroy();return;}chunks.push(chunk);}const input=JSON.parse(Buffer.concat(chunks).toString());busy=true;json(200,await convert(input,{binary}));}
  catch(e){json(400,{error:e.code==='ENOENT'?'LibreOffice was not found. Set SOFFICE_BIN to its executable.':e.message});}
  finally{busy=false;}
 });
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,token,url:'http://127.0.0.1:'+server.address().port};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const {url,token}=await start();console.log('HUWiki Slideshow local converter\n'+url+'\nTemporary session code: '+token+'\nPaste this into Slideshow. Keep it private; it expires when this process stops.');}
