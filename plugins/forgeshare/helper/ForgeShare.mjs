#!/usr/bin/env node
// ForgeShare 0.1.8 — optional local helper. Explicit local actions; no unsolicited browser launch or shell evaluation.
import {validateSite,siteWorker} from './Site.mjs';
import {configureLogin} from './Startup.mjs';
import {Vault,vaultDialog,invitation,privateCommand} from './Vault.mjs';
import {childBridge,bridgePath} from './Bridge.mjs';
import {readFile, realpath, stat, lstat, opendir, access, mkdir, mkdtemp, writeFile, rm, rename, open} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {execFile, fork, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const self = fileURLToPath(import.meta.url);
const quiet = process.argv.includes('--gui');
export const serveArgs = ['serve', '--https=10000', 'http://127.0.0.1:8080'];
export const makeServeArgs = (port, httpsPort) => ['serve', `--https=${httpsPort}`, `http://127.0.0.1:${port}`];
let uiLanguage = process.env.FORGESHARE_LANGUAGE === 'da' ? 'da' : 'en';
export const ui = (en, da) => uiLanguage === 'da' ? da : en;
export async function detectLanguage({platform=process.platform,env=process.env,run=execute}={}) {
  if (['da','en'].includes(env.FORGESHARE_LANGUAGE)) return env.FORGESHARE_LANGUAGE;
  let language='';
  try {
    if(platform==='darwin')language=(await run('/usr/bin/defaults',['read','-g','AppleLanguages'])).stdout.replace(/[()"\s]/g,'').split(',')[0];
    else if(platform==='win32')language=(await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Globalization.CultureInfo]::CurrentUICulture.Name'],{windowsHide:true})).stdout.trim();
    else language=(env.LANGUAGE || env.LC_ALL || env.LC_MESSAGES || env.LANG || '').split(':')[0];
  } catch {}
  return /^da(?:[-_]|$)/i.test(language)?'da':'en';
}
const fail = (en, da) => { throw Error(ui(en,da)); };
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateServe(config, requireFree = true, httpsPort = 10000) {
  if (!object(config)) fail('Unrecognised Serve status; nothing started.', 'Ukendt Serve-status; intet startet.');
  const allowed = ['TCP', 'Web', 'AllowFunnel', 'Foreground', 'Services', 'ETag'];
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.includes(key)) fail('Unknown Serve configuration field: ' + key, 'Ukendt felt i Serve-konfigurationen.');
    if (key === 'ETag') continue;
    if (value === null) continue;
    if (!object(value)) fail('Invalid Serve configuration.', 'Ugyldig Serve-konfiguration.');
    if (key === 'Foreground' || key === 'Services') {
      for (const nested of Object.values(value)) validateServe(nested, requireFree, httpsPort);
    } else {
      for (const [entry, setting] of Object.entries(value)) {
        if (key === 'AllowFunnel' && typeof setting !== 'boolean') fail('Invalid Funnel status.', 'Ugyldig Funnel-status.');
        if (key !== 'AllowFunnel' && !object(setting)) fail('Invalid Serve handler.', 'Ugyldig Serve-handler.');
        if ((entry === String(httpsPort) || entry.endsWith(':' + httpsPort)) && (requireFree || (key === 'AllowFunnel' && setting)))
          fail(`This wiki's address is already in use or publicly exposed (${httpsPort}). Nothing replaced.`, `Wikiens adresse er allerede i brug eller offentligt eksponeret (${httpsPort}). Intet overskrevet.`);
      }
    }
  }
  return config;
}

// Ignore only our selected port and empty maps; compare all unrelated configuration.
export function protectedConfig(value, httpsPort = 10000) {
  if (!object(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'ETag' || key === String(httpsPort) || key.endsWith(':' + httpsPort)) continue;
    const nested = protectedConfig(value[key], httpsPort);
    if (nested !== null && (!object(nested) || Object.keys(nested).length)) result[key] = nested;
  }
  return result;
}
export function hasWikiRoute(config, hostname, port = 8080, httpsPort = 10000) {
  return Object.values(config.Foreground || {}).some(item =>
    item.TCP?.[httpsPort]?.HTTPS === true &&
    item.Web?.[hostname + ':' + httpsPort]?.Handlers?.['/']?.Proxy === 'http://127.0.0.1:' + port);
}
// The public listener never proxies unauthenticated requests. The wiki itself
// independently enforces reader/editor permissions using ephemeral credentials.
export async function startCodeGateway({port,origin,readerCode,editorCode,readerSecret,editorSecret,language='en',now=Date.now,bridge=false,site=false}) {
  if(typeof readerCode!=='string'||typeof editorCode!=='string'||!readerCode.trim()||!editorCode.trim()||readerCode===editorCode||Math.max(readerCode.length,editorCode.length)>256)throw Error(ui('Choose two different, nonempty codes (up to 256 characters).','Vælg to forskellige koder, som ikke er tomme (højst 256 tegn).'));
  const publicOrigin=new URL(origin).origin;
  if(!/^https:\/\/[a-z0-9.-]+\.ts\.net(?::(?:443|8443|10000))?$/.test(publicOrigin))throw Error('Invalid public origin');
  const digest=value=>createHash('sha256').update(value).digest();
  const readerHash=digest(readerCode),editorHash=digest(editorCode);
  const sessions=new Map(),ownerToken=randomBytes(32).toString('hex');
  let attempts=[],ownerOrigin;
  const text=(en,da)=>language==='da'?da:en;
  const cookieName=owner=>(owner?'ForgeShareOwner-':'__Host-ForgeShare-')+port;
  const cookie=(owner,value,age=28800)=>`${cookieName(owner)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${owner?'':'; Secure'}`;
  const page=(error='')=>`<!doctype html><html lang="${language==='da'?'da':'en'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ForgeShare</title><style>body{margin:0;background:#f2f5f7;color:#183545;font:18px system-ui;display:grid;min-height:100vh;place-items:center}main{box-sizing:border-box;width:min(92vw,420px);padding:36px;background:white;border-radius:24px;box-shadow:0 12px 48px #18354518}h1{font-size:28px}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;border-radius:10px;margin-top:12px}input{border:1px solid #8a9ea9}button{border:0;background:#146bc4;color:white;cursor:pointer}p{line-height:1.5}.error{color:#a32424}</style><main><h1>${text('Open the wiki','Åbn wikien')}</h1><p>${text('Enter the code you received.','Indtast den kode, du har fået.')}</p>${error?'<p class="error">'+error+'</p>':''}<form method="post" action="/_forgeshare/login"><label for="code">${text('Access code','Adgangskode')}</label><input id="code" name="code" type="password" autocomplete="current-password" maxlength="256" required autofocus><button>${text('Open wiki','Åbn wiki')}</button></form></main></html>`;
  const handler=owner=>async(req,res)=>{
    const expected=owner?ownerOrigin:publicOrigin;
    const send=(status,body='',headers={})=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':owner?'no-referrer':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",...headers});res.end(body);};
    try {
      if(req.headers.host!==new URL(expected).host)return send(421);
      if(!req.url.startsWith('/')||req.url.startsWith('//'))return send(400);
      const url=new URL(req.url,expected),unsafe=!['GET','HEAD'].includes(req.method);
      if(unsafe && req.headers.origin!==expected)return send(403);
      if(req.headers['sec-fetch-site']==='cross-site' && (unsafe || owner))return send(403);
      for(const [key,value] of sessions)if(value.expires<=now())sessions.delete(key);
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(owner)+'='))?.slice(cookieName(owner).length+1);
      const session=sessions.get(token);
      let role=session?.owner===owner?session.role:null;
      const issue=role=>{if(sessions.size>=1024)sessions.delete(sessions.keys().next().value);const token=randomBytes(32).toString('hex');sessions.set(token,{role,owner,expires:now()+28800000});send(303,'',{'Location':'/','Set-Cookie':cookie(owner,token)});};
      if(owner && url.pathname==='/_forgeshare/owner' && req.method==='GET') {
        if(url.searchParams.get('token')!==ownerToken)return send(403);
        issue('editor');return;
      }
      if(url.pathname==='/_forgeshare/logout' && req.method==='POST') {sessions.delete(token);return send(303,'',{'Location':'/','Set-Cookie':cookie(owner,'',0)});}
      if(!owner && url.pathname==='/_forgeshare/login' && req.method==='POST') {
        // One global budget cannot be bypassed with forged forwarded-IP headers.
        attempts=attempts.filter(t=>t>now()-60000);
        if(attempts.length>=20)return send(429,page(text('Too many attempts. Wait a minute.','For mange forsøg. Vent et minut.')),{'Retry-After':'60'});
        attempts.push(now());
        if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))return send(415);
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048){send(413);req.destroy();return;}}
        const code=new URLSearchParams(body).get('code')||'';
        const hash=digest(code),reader=timingSafeEqual(hash,readerHash),editor=timingSafeEqual(hash,editorHash);
        if(!reader&&!editor)return send(401,page(text('The code did not match. Try again.','Koden passer ikke. Prøv igen.')));
        issue(editor?'editor':'reader');return;
      }
      if(!owner && url.pathname==='/_forgeshare/login' && req.method==='GET')return send(200,page());
      if(!role)return send(401,owner?text('Open this wiki from ForgeShare.','Åbn denne wiki fra ForgeShare.'):page());
      const isBridge=bridge && url.pathname.startsWith(bridgePath);
      if(role==='reader' && unsafe && !isBridge)return send(403);
      // Expose the core wiki API only, never custom server/admin/plugin routes.
      if(!site && !isBridge && !['/','/status','/favicon.ico','/recipes/default/tiddlers.json'].includes(url.pathname) && !/^\/(?:recipes|bags)\/default\/tiddlers\/[^/]+$/.test(url.pathname))return send(404);
      if(site && !['GET','HEAD'].includes(req.method))return send(405);
      if(!['GET','HEAD','PUT','DELETE',...(isBridge?['POST']:[])].includes(req.method))return send(405);
      const headers={authorization:'Basic '+Buffer.from((role==='editor'?'editor:':'reader:')+(role==='editor'?editorSecret:readerSecret)).toString('base64')};
      for(const key of ['content-type','content-length','if-match','if-none-match','x-requested-with','accept'])if(req.headers[key])headers[key]=req.headers[key];
      if(isBridge){headers.origin=req.headers.origin;headers['x-forgeshare']=req.headers['x-forgeshare']||'';headers.cookie=req.headers.cookie||'';}
      const upstream=httpRequest({host:'127.0.0.1',port,path:req.url,method:req.method,headers},response=>{
        const output={...response.headers,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"frame-ancestors 'none'"};
        for(const key of ['set-cookie','www-authenticate','access-control-allow-origin','access-control-allow-credentials','connection','transfer-encoding'])delete output[key];
        if(isBridge && response.headers['set-cookie'])output['set-cookie']=response.headers['set-cookie'].filter(c=>/^ForgeShareAccess-[0-9]+=/.test(c));
        res.writeHead(response.statusCode,output);response.pipe(res);
      });
      upstream.on('error',()=>{if(!res.headersSent)send(502);else res.destroy();});
      upstream.setTimeout(30000,()=>upstream.destroy());req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
    } catch {if(!res.headersSent)send(400);else res.destroy();}
  };
  const publicServer=createServer(handler(false)),ownerServer=createServer(handler(true));
  for(const server of [publicServer,ownerServer]){server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=200;server.maxRequestsPerSocket=1000;}
  const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port);});});
  const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  const stop=async()=>{sessions.clear();await Promise.all([close(publicServer),close(ownerServer)]);};
  try {
    const publicPort=await listen(publicServer),ownerPort=await listen(ownerServer);ownerOrigin='http://127.0.0.1:'+ownerPort;
    return {port:publicPort,ownerUrl:ownerOrigin+'/_forgeshare/owner?token='+ownerToken,stop};
  }catch(error){await stop();throw error;}
}

export const funnelPorts=Object.freeze([10000,8443,443]);
export async function planFunnel(config,localPort,checkAddress) {
  if(!Number.isInteger(localPort)||localPort<1||localPort>65535)throw Error('Invalid local port');
  const used=usedServePorts(config);
  for(const port of funnelPorts) {
    if(used.has(port))continue;
    try {await checkAddress(port);}catch{continue;}
    return {port,args:['funnel',`--https=${port}`,`http://127.0.0.1:${localPort}`]};
  }
  throw Error(ui('Funnel needs a free address on 443, 8443 or 10000. Existing services were not changed.','Funnel kræver en ledig adresse på 443, 8443 eller 10000. Eksisterende tjenester er ikke ændret.'));
}
export function verifyFunnelRoute(before,after,hostname,localPort,port) {
  if(!funnelPorts.includes(port))throw Error('Invalid Funnel port');
  validateServe(before,true,port);validateServe(after,false,-1);
  if(JSON.stringify(protectedConfig(before,port))!==JSON.stringify(protectedConfig(after,port)))throw Error('Unrelated Tailscale configuration changed');
  const hostPort=hostname+':'+port;
  // The public permission must belong to the same foreground configuration as
  // our sole root proxy. A background/public route is not owned by this process.
  const owners=Object.values(after.Foreground||{}).filter(c=>c.TCP?.[port]||Object.keys(c.Web||{}).some(k=>k.endsWith(':'+port)));
  if(owners.length!==1 || after.TCP?.[port] || Object.keys(after.Web||{}).some(k=>k.endsWith(':'+port)) || Object.values(after.Services||{}).some(c=>usedServePorts(c).has(port)))return false;
  return owners.some(config=>
    config.AllowFunnel?.[hostPort]===true && config.TCP?.[port]?.HTTPS===true &&
    Object.keys(config.Web?.[hostPort]?.Handlers||{}).length===1 &&
    config.Web[hostPort].Handlers['/']?.Proxy==='http://127.0.0.1:'+localPort);
}

export function isPrivateIPv4(address) {
  if(net.isIP(address)!==4)return false;
  const [a,b]=address.split('.').map(Number);
  return a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168);
}
export function homeNetworkAddresses(interfaces=os.networkInterfaces()) {
  const result=[],seen=new Set();
  for(const [name,addresses] of Object.entries(interfaces)) {
    if(/^(utun|tun|tap|tailscale|wg|docker|veth|virbr|vmnet|vbox)/i.test(name))continue;
    for(const entry of addresses||[])if(!entry.internal && isPrivateIPv4(entry.address) && !seen.has(entry.address)) {
      result.push({name,address:entry.address});seen.add(entry.address);
    }
  }
  return result;
}
export function serverArgs(wiki, credentials, port = 8080, {allowAnonymous=false,lanHost,codeRoles=false}={}) {
  if(lanHost && !isPrivateIPv4(lanHost))fail('Choose a private home-network address.', 'Vælg en privat hjemmenetværksadresse.');
  if(allowAnonymous!==true && !credentials)fail('Choose wiki login or explicitly choose no login.', 'Vælg wiki-login, eller vælg udtrykkeligt uden login.');
  return [wiki, '--listen', `host=${lanHost||'127.0.0.1'}`, `port=${port}`,
    ...(allowAnonymous===true?['readers=(anon)']:[`credentials=${credentials}`,'readers=(authenticated)']),
    `writers=${codeRoles?'editor':allowAnonymous===true?'(anon)':'(authenticated)'}`, 'csrf-disable=no'];
}
export function validateCredentials(text) {
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== 'username,password' || !lines.length)
    fail('Credentials need username,password and at least one account.', 'Loginfilen skal have username,password og mindst én konto.');
  const names = new Set();
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length !== 2 || !/^[A-Za-z0-9_.@-]+$/.test(parts[0]) || !parts[1].length || /["\r\n\x00-\x1f]/.test(parts[1]) || names.has(parts[0]))
      fail('Use a simple unique username and a nonempty password without commas, quotes or line breaks.', 'Brug et enkelt unikt brugernavn og en adgangskode uden komma, anførselstegn eller linjeskift. Adgangskoden må ikke være tom.');
    names.add(parts[0]);
  }
  return names.size;
}
export async function validateFiles(wikiInput, credentialsInput, platform = process.platform) {
  const {wiki} = await validateWikiFolder(wikiInput), credentials = await realpath(credentialsInput);
  const relative = path.relative(wiki, credentials);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
    fail('Keep credentials outside the wiki folder.', 'Opbevar loginfilen uden for wikimappen.');
  const attrs = await stat(credentials);
  if (!attrs.isFile() || attrs.size > 1024 * 1024) fail('Invalid credentials file.', 'Ugyldig loginfil.');
  if (platform !== 'win32' && ((attrs.mode & 0o077) || attrs.uid !== process.getuid()))
    fail('Credentials must be owned by you with permissions 600. Run chmod 600 on that file.', 'Loginfilen skal ejes af dig med rettighed 600. Kør chmod 600 på filen.');
  validateCredentials(await readFile(credentials, 'utf8'));
  return {wiki, credentials};
}
export async function validateWikiFolder(wikiInput) {
  const wiki=await realpath(wikiInput),info=JSON.parse(await readFile(path.join(wiki,'tiddlywiki.info'),'utf8'));
  for(const plugin of ['tiddlywiki/tiddlyweb','tiddlywiki/filesystem'])
    if(!info.plugins?.includes(plugin))fail('Server wiki is missing '+plugin, 'Serverwikien mangler '+plugin);
  return {wiki};
}
export function checkPort(port = 8080, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => reject(Object.assign(Error(ui(`Address ${port} is in use or unavailable. No existing process was stopped.`,`Adressen ${port} er optaget eller utilgængelig. Ingen eksisterende proces blev stoppet.`)), {code: error.code})));
    server.listen({host, port, exclusive: true}, () => server.close(resolve));
  });
}
async function jsonCommand(executable, args) {
  const {stdout} = await execute(executable, args, {timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true});
  return JSON.parse(stdout);
}

// Avoid well-known ports and the usual OS ephemeral ranges. These ranges are
// candidates, never reservations: inspect Serve AND the OS before assigning.
export const localRange = [20000, 20999], shareRange = [21000, 21999];
export async function checkAddressPort(port) {
  // BSD/macOS permits some wildcard/specific-address bind combinations. Check
  // each local interface as well, including the Tailscale interface if present.
  const addresses = new Set(['127.0.0.1', '::1']);
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    // libuv uses a numeric scope on Windows and if_nametoindex on POSIX.
    for (const entry of entries || []) {
      const scope = process.platform === 'win32' ? entry.scopeid : name;
      addresses.add(entry.scopeid && !entry.address.includes('%') ? entry.address + '%' + scope : entry.address);
    }
  }
  for (const address of addresses) {
    try { await checkPort(port, address); }
    catch (error) { if (!['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) throw error; }
  }
  await checkPort(port, '0.0.0.0');
  // IPv6-only listeners can coexist with IPv4. Fail closed if this check fails.
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => {
      if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) resolve();
      else reject(Error(ui(`An existing service uses address ${port}.`,`En eksisterende tjeneste bruger adressen ${port}.`)));
    });
    server.listen({host: '::', port, ipv6Only: true, exclusive: true}, () => server.close(resolve));
  });
}
export function usedServePorts(config) {
  validateServe(config, false, -1);
  const used = new Set();
  function collect(item) {
    for (const kind of ['TCP', 'Web', 'AllowFunnel']) {
      for (const key of Object.keys(item[kind] || {})) {
        const value = Number(key.split(':').at(-1));
        if (!Number.isInteger(value) || value < 1 || value > 65535) throw Error(ui('Unknown Serve port', 'Ukendt Serve-port.'));
        used.add(value);
      }
    }
    for (const kind of ['Foreground', 'Services']) for (const child of Object.values(item[kind] || {})) collect(child);
  }
  collect(config);
  return used;
}
const profileKey = value => value.normalize('NFC').toLocaleLowerCase('en-US');
const wikiKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
export function validateRegistry(data) {
  if (!object(data) || data.version !== 1 || !Array.isArray(data.wikis)) throw Error(ui('Unknown wiki list format', 'Ukendt format i wikilisten.'));
  const ids = new Set(), names = new Set(), folders = new Set(), ports = new Set();
  for (const entry of data.wikis) {
    if (!object(entry) || Object.keys(entry).some(key => !['id', 'name', 'wiki', 'port', 'httpsPort','kind'].includes(key)) ||
        (entry.kind!==undefined && entry.kind!=='site') || !/^[a-f0-9-]{36}$/.test(entry.id) || typeof entry.name !== 'string' ||
        !entry.name.trim() || entry.name.length > 80 || /[\x00-\x1f\x7f]/.test(entry.name) ||
        typeof entry.wiki !== 'string' || !path.isAbsolute(entry.wiki) ||
        !Number.isInteger(entry.port) || entry.port < localRange[0] || entry.port > localRange[1] ||
        !Number.isInteger(entry.httpsPort) || entry.httpsPort < shareRange[0] || entry.httpsPort > shareRange[1] ||
        ids.has(entry.id) || names.has(profileKey(entry.name)) || folders.has(wikiKey(entry.wiki)) || ports.has(entry.port) || ports.has(entry.httpsPort))
      throw Error(ui('Invalid or duplicate wiki entry. Wiki list was not changed.', 'Ugyldig eller gentaget wiki. Wikilisten blev ikke ændret.'));
    ids.add(entry.id); names.add(profileKey(entry.name)); folders.add(wikiKey(entry.wiki)); ports.add(entry.port); ports.add(entry.httpsPort);
  }
  return data;
}
export async function readRegistry(root = appFolder()) {
  try { return validateRegistry(JSON.parse(await readFile(path.join(root, 'wikis.json'), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return {version: 1, wikis: []}; throw error; }
}
async function writeRegistry(root, registry) {
  validateRegistry(registry);
  const filename = path.join(root, 'wikis.json'), temporary = filename + '.' + randomUUID();
  try { await writeFile(temporary, JSON.stringify(registry, null, 2) + '\n', {mode: 0o600, flag: 'wx'}); await rename(temporary, filename); }
  finally { await rm(temporary, {force: true}); }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
// Serialize catalogue changes/startup across separate helper windows. A second
// lock serializes stale-lock recovery so one recovery cannot delete a new owner.
export async function acquireLock(root, key, attempts = 80) {
  const directory = path.join(root, 'locks', key), owner = path.join(directory, 'owner.json');
  await mkdir(path.dirname(directory), {recursive: true, mode: 0o700});
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await mkdir(directory, {mode: 0o700});
      try { await writeFile(owner, JSON.stringify({pid: process.pid}), {mode: 0o600, flag: 'wx'}); }
      catch (error) { await rm(directory, {recursive: true, force: true}); throw error; }
      let released = false;
      return async () => { if (!released) { released = true; await rm(directory, {recursive: true, force: true}); } };
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const recovery = directory + '.recovery';
    let recovering = false;
    try {
      await mkdir(recovery); recovering = true;
      const previous = JSON.parse(await readFile(owner, 'utf8'));
      if (Number.isInteger(previous.pid) && previous.pid > 0 && !alive(previous.pid)) {
        await rm(directory, {recursive: true, force: true});
      }
    } catch (error) { if (!['EEXIST', 'ENOENT'].includes(error.code) && !(error instanceof SyntaxError)) throw error; }
    finally { if (recovering) await rm(recovery, {recursive: true, force: true}); }
    if (attempt + 1 < attempts) await sleep(100);
  }
  throw Error(ui('This wiki is already running, or another helper is setting up. Use its status window, or try again shortly.', 'Wikien kører allerede, eller en anden hjælper er ved at starte. Brug dens statusvindue, eller prøv igen om lidt.'));
}
export async function registerWiki({root = appFolder(), wiki: input, name, tailscale, localOnly=false,kind}, deps = {}) {
  const wiki = await realpath(input);
  const release = await acquireLock(root, 'catalog');
  try {
    const registry = await readRegistry(root);
    const existing = registry.wikis.find(entry => wikiKey(entry.wiki) === wikiKey(wiki));
    if (existing) return existing;
    if(kind==='site')await validateSite(wiki);
    else {const info = JSON.parse(await readFile(path.join(wiki, 'tiddlywiki.info'), 'utf8'));
    for (const plugin of ['tiddlywiki/tiddlyweb', 'tiddlywiki/filesystem']) if (!info.plugins?.includes(plugin)) throw Error(ui('Prepare this server wiki first', 'Forbered først denne serverwiki.'));
    }
    const entry = {...(kind==='site'?{kind}:{}),id: randomUUID(), name: name.trim().normalize('NFC'), wiki, port: localRange[0], httpsPort: shareRange[0]};
    // Validate the name before probing/allocating; real allocations follow below.
    validateRegistry({version: 1, wikis: [entry]});
    if (registry.wikis.some(item => profileKey(item.name) === profileKey(entry.name))) throw Error(ui('Choose a different wiki name', 'Vælg et andet wikinavn.'));
    const config = localOnly ? {} : await (deps.readJSON || jsonCommand)(tailscale, ['serve', 'status', '--json']);
    const used = usedServePorts(config);
    for (const item of registry.wikis) { used.add(item.port); used.add(item.httpsPort); }
    const check = deps.checkAddressPort || checkAddressPort;
    async function choose([first, last]) {
      for (let candidate = first; candidate <= last; candidate++) {
        if (used.has(candidate)) continue;
        try { await check(candidate); used.add(candidate); return candidate; } catch {}
      }
      throw Error(ui('No free address was found. No services changed.', 'Ingen ledig adresse fundet. Ingen tjenester ændret.'));
    }
    entry.port = await choose(localRange); entry.httpsPort = await choose(shareRange);
    registry.wikis.push(entry); await writeRegistry(root, registry);
    return entry;
  } finally { await release(); }
}
export async function startNamedSession(profile, options, deps = {}) {
  const root = options.root || appFolder();
  const releaseWiki = await acquireLock(root, 'wiki-' + profile.id, 2);
  let releaseCatalog;
  try {
    releaseCatalog = await acquireLock(root, 'catalog');
    const saved = (await readRegistry(root)).wikis.find(entry => entry.id === profile.id);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(profile) || wikiKey(await realpath(profile.wiki)) !== wikiKey(profile.wiki))
      throw Error(ui('Wiki selection changed. Choose it again.', 'Wikivalget er ændret. Vælg igen.'));
    const selected={...options,...profile};
    if(options.funnel)selected.httpsPort=(await planFunnel(await (deps.readJSON||jsonCommand)(options.tailscale,['serve','status','--json']),profile.port,deps.checkAddressPort||checkAddressPort)).port;
    const session = await (deps.startSession || startSession)(selected, deps);
    const finished = session.finished.finally(releaseWiki);
    return {...session, finished, stop: async () => { await session.stop(); await releaseWiki(); }};
  } catch (error) { await releaseWiki(); throw error; }
  finally { if (releaseCatalog) await releaseCatalog(); }
}
export async function findTailscale() {
  const executable = process.platform === 'win32' ? 'tailscale.exe' : 'tailscale';
  const candidates = (process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, executable));
  candidates.push('/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe'));
  for (const candidate of candidates) {
    try { await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return candidate; } catch {}
  }
  fail('Tailscale is missing. Install it from https://tailscale.com/download and sign in.', 'Tailscale mangler. Installer fra https://tailscale.com/download og log ind.');
}
export async function findTiddlyWiki() {
  const candidates = [path.join(appFolder(),'tiddlywiki-5.4.1/node_modules/tiddlywiki')];
  try { candidates.push(path.dirname(require.resolve('tiddlywiki/package.json'))); } catch {}
  candidates.push(path.resolve(path.dirname(process.execPath), '../lib/node_modules/tiddlywiki'),
    '/opt/homebrew/lib/node_modules/tiddlywiki', '/usr/local/lib/node_modules/tiddlywiki', '/usr/lib/node_modules/tiddlywiki',
    path.join(process.env.APPDATA || os.homedir(), 'npm/node_modules/tiddlywiki'));
  for (const candidate of candidates) {
    try { await access(path.join(candidate, 'boot/boot.js')); return candidate; } catch {}
  }
  return '';
}
export async function validateRuntime(folder) {
  const root = await realpath(folder);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'tiddlywiki' || !/^5\./.test(pkg.version)) fail('Select a TiddlyWiki 5 installation.', 'Vælg en TiddlyWiki 5-installation.');
  await access(path.join(root, 'boot/boot.js'));
  return {boot: path.join(root, 'boot/boot.js'), version: pkg.version};
}
export function startWiki({boot, wiki, credentials, port = 8080,allowAnonymous=false,lanHost,codeRoles=false,bridge,kind}) {
  const child = fork(self, kind==='site'?['--site-worker',JSON.stringify({wiki,credentials,port,allowAnonymous,lanHost})]:['--worker', boot, ...serverArgs(wiki, credentials, port,{allowAnonymous,lanHost,codeRoles})], {stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit', 'ipc']});
  if(bridge){
    const vault=bridge.vault||createVault(bridge.root);
    child.on('message',async message=>{
      if(message?.type!=='bridge')return;
      try{const result=message.operation==='pair'?await vault.pair(bridge.wikiId,message.input.label,message.token):await vault.call(bridge.wikiId,message.token,message.operation,message.input);if(child.connected)child.send({type:'bridge-result',id:message.id,result});}
      catch{if(child.connected)child.send({type:'bridge-result',id:message.id,error:true});}
    });
  }
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(Error(ui('Server start timed out','Serverstart tog for lang tid.'))), 30000);
    const done = (error, address) => { clearTimeout(timer); child.off('message', message); child.off('error', errorEvent); child.off('exit', exitEvent); error ? reject(error) : resolve(address); };
    const message = data => { if (data?.type === 'listening') done(null, data.address); };
    const errorEvent = error => done(error);
    const exitEvent = () => done(Error(ui('Wiki stopped before listening', 'Wikien stoppede før opstart.')));
    child.on('message', message); child.once('error', errorEvent); child.once('exit', exitEvent);
  });
  return {child,ready:ready.then(address=>{if(bridge)child.send({type:'bridge-origins',origins:bridge.origins||[`http://${lanHost||'127.0.0.1'}:${port}`]});return address;})};
}
export async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 35000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.connected && child.send) child.send({type: 'shutdown'}, error => { if (error) child.kill('SIGTERM'); });
    else child.kill('SIGTERM');
  });
}
export async function startLocalSession(options,deps={}) {
  const port=options.port??8080,host=options.lanHost||'127.0.0.1';
  if(options.lanHost && (options.localOnly || !isPrivateIPv4(host) || !homeNetworkAddresses((deps.networkInterfaces||os.networkInterfaces)()).some(e=>e.address===host)))
    fail('The selected home network is unavailable. Choose it again.', 'Det valgte hjemmenetværk er ikke tilgængeligt. Vælg igen.');
  await (deps.checkPort||checkAddressPort)(port);
  const started=(deps.startWiki||startWiki)(options),child=started.child;
  let stopping;const stop=()=>stopping ||= stopChild(child);
  try {
    const address=await started.ready;
    if(address.address!==host || address.port!==port)throw Error(ui('Unexpected local address', 'Uventet lokal adresse.'));
    const status=await (deps.probe||(()=>fetch(`http://${host}:${port}/status`,{signal:AbortSignal.timeout(5000)}).then(r=>r.status)))();
    if(status!==(options.allowAnonymous===true?200:401))fail('The wiki does not match the selected login setting.', 'Wikien følger ikke det valgte loginvalg.');
    if(child.exitCode!==null || child.signalCode!==null)throw Error(ui('Wiki stopped', 'Wikien stoppede.'));
    const finished=new Promise(resolve=>child.once('exit',resolve));
    return {url:`http://${host}:${port}`,stop,finished};
  }catch(error){await stop();throw error;}
}
export async function startSession(options, deps = {}) {
  if(options.localOnly || options.lanHost)return startLocalSession(options,deps);
  const port = options.port ?? 8080, httpsPort = options.httpsPort ?? 10000;
  const readJSON = deps.readJSON || jsonCommand;
  const startServer = deps.startWiki || startWiki;
  const startServe = deps.spawn || spawn;
  const portCheck = deps.checkPort || checkAddressPort;
  const probe = deps.probe || (async () => (await fetch(`http://127.0.0.1:${port}/status`, {signal: AbortSignal.timeout(5000)})).status);
  const before = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']), true, httpsPort);
  const status = await readJSON(options.tailscale, ['status', '--json']);
  const hostname = status.Self?.DNSName?.replace(/\.$/, '');
  if (status.BackendState !== 'Running' || !hostname || !/^[a-z0-9.-]+\.ts\.net$/i.test(hostname))
    fail('Sign in to Tailscale and configure MagicDNS/HTTPS first.', 'Log ind i Tailscale og konfigurer MagicDNS/HTTPS først.');
  await portCheck(port);
  await (deps.checkAddressPort || checkAddressPort)(httpsPort);
  let server, serve, gateway, closed = false, stopping;
  const stop = () => {
    if (stopping) return stopping;
    closed = true;
    stopping = (async () => {
    // End foreground Serve first so nothing can be exposed after stopping our wiki.
    await stopChild(serve);
    if(gateway)await gateway.stop();
    await stopChild(server);
    })();
    return stopping;
  };
  try {
    if(options.funnel && (!options.codeRoles || options.allowAnonymous || !options.credentials || !funnelPorts.includes(httpsPort)))throw Error('Funnel requires protected code access');
    if(options.bridge)options.bridge.origins=[`http://127.0.0.1:${port}`,new URL(`https://${hostname}:${httpsPort}`).origin];
    const started = startServer(options); server = started.child;
    const address = await started.ready;
    if (closed || address.address !== '127.0.0.1' || address.port !== port) throw Error(ui('Unexpected server address', 'Uventet serveradresse.'));
    if (await probe() !== (options.allowAnonymous===true?200:401)) fail('The wiki does not match the selected login setting. Sharing refused.', 'Wikien følger ikke det valgte loginvalg. Deling afvist.');
    if(options.funnel)gateway=await startCodeGateway({port,bridge:!!options.bridge,site:options.kind==='site',origin:`https://${hostname}:${httpsPort}`,...options.codeAccess,language:uiLanguage});
    if(gateway && options.bridge && server.connected)server.send({type:'bridge-origins',origins:[...options.bridge.origins,new URL(gateway.ownerUrl).origin]});
    const targetPort=gateway?.port||port;
    // Recheck immediately before Serve. No --yes: concurrent changes cannot be silently approved.
    const current = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']), true, httpsPort);
    if (JSON.stringify(protectedConfig(before, httpsPort)) !== JSON.stringify(protectedConfig(current, httpsPort))) throw Error(ui('Serve changed during startup', 'Serve blev ændret under start.'));
    serve = startServe(options.tailscale, (options.funnel?['funnel',`--https=${httpsPort}`,`http://127.0.0.1:${targetPort}`]:makeServeArgs(port, httpsPort)), {stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'], windowsHide: true});
    let serveError;
    serve.once('error', error => { serveError = error; });
    for (let attempt = 0; attempt < 40; attempt++) {
      if (serveError) throw serveError;
      if (serve.exitCode !== null || serve.signalCode !== null || server.exitCode !== null || server.signalCode !== null)
        fail('A process stopped. Check prerequisites and HTTPS setup.', 'En proces stoppede. Kontroller programmer og HTTPS-opsætning.');
      const after = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']), false, options.funnel?-1:httpsPort);
      if (JSON.stringify(protectedConfig(before, httpsPort)) !== JSON.stringify(protectedConfig(after, httpsPort)))
        fail('Unrelated Serve settings changed; stopping our processes without restoring someone else’s settings.', 'Andre Serve-indstillinger blev ændret; stopper egne processer uden at overskrive andres opsætning.');
      if (options.funnel?verifyFunnelRoute(before,after,hostname,targetPort,httpsPort):hasWikiRoute(after, hostname, port, httpsPort)) {
        const finished = new Promise(resolve => {
          const exit = () => { stop().then(resolve); };
          server.once('exit', exit); serve.once('exit', exit);
        });
        return {url: `https://${hostname}:${httpsPort}`, ...(gateway?{ownerUrl:gateway.ownerUrl}:{}), stop, finished};
      }
      await sleep(250);
    }
    fail('Serve did not become ready. Enable HTTPS using the official Tailscale setup.', 'Serve blev ikke klar. Aktiver HTTPS via Tailscales officielle opsætning.');
  } catch (error) { await stop(); throw error; }
}
// Local library metadata is separate from the private, backwards-compatible
// server/port registry. Merely adding a wiki never inspects or starts Tailscale.
const uuidPattern = /^[a-f0-9-]{36}$/;
function cleanLabel(value, maximum = 80, optional = false) {
  if (typeof value !== 'string' || value.length > maximum || /[\x00-\x1f\x7f]/.test(value) || (!optional && !value.trim()))
    fail('Use a short name or description on one line.', 'Brug et kort navn eller en beskrivelse på én linje.');
  return value.trim().normalize('NFC');
}
function validShareURL(value) {
  try { const u=new URL(value);return ((u.protocol==='https:' && /^[a-z0-9.-]+\.ts\.net$/i.test(u.hostname)) || (u.protocol==='http:' && isPrivateIPv4(u.hostname))) && !u.username && !u.password && !u.search && !u.hash && (u.pathname==='/' || !u.pathname); } catch {return false;}
}
export function validateStartup(value,library) {
  if(!object(value) || Object.keys(value).sort().join(',')!=='allowAnonymous,mode,wikiId' ||
     !['local','lan','tailscale'].includes(value.mode) || typeof value.allowAnonymous!=='boolean' ||
     !library.entries.some(e=>e.id===value.wikiId && e.kind==='folder'))
    fail('The startup choice is invalid. Choose it again in Startup.', 'Opstartsvalget er ugyldigt. Vælg det igen under Opstart.');
  return value;
}
export async function saveStartup(root,choice) {
  return libraryTransaction(root,data=>{data.startup=choice===null?null:validateStartup(choice,data);return data.startup;});
}
export async function readStartup(root=appFolder()) {
  return (await loadLibrary(root)).startup || null;
}
export function validateLibrary(data) {
  if(!object(data) || data.version!==1 || !uuidPattern.test(data.id) || !Array.isArray(data.entries) || data.entries.length>500)
    fail('Unknown wiki library format. Nothing changed.', 'Ukendt format i wikibiblioteket. Intet ændret.');
  if(data.sharing!==undefined)validateSharing(data.sharing);
  if(data.startup!==undefined && data.startup!==null)validateStartup(data.startup,data);
  if(data.exportTitle!==undefined)cleanLabel(data.exportTitle,100);
  const ids=new Set(),locations=new Set(),names=new Set();
  for(const e of data.entries) {
    if(!object(e) || Object.keys(e).some(k=>!['id','name','kind','location','description','shareUrl','exportTitle'].includes(k)) ||
       !uuidPattern.test(e.id) || !['html','folder','site'].includes(e.kind) || typeof e.location!=='string' || !path.isAbsolute(e.location) ||
       ids.has(e.id) || locations.has(wikiKey(e.location)) || names.has(profileKey(e.name || '')) ||
       (e.shareUrl && !validShareURL(e.shareUrl)))fail('Invalid wiki library entry. Nothing changed.', 'Ugyldig post i wikibiblioteket. Intet ændret.');
    cleanLabel(e.name);cleanLabel(e.description,500,true);
    if(e.exportTitle!==undefined)cleanLabel(e.exportTitle,240);
    ids.add(e.id);locations.add(wikiKey(e.location));names.add(profileKey(e.name));
  }
  return data;
}
async function loadLibrary(root) {
  let data;
  try {data=validateLibrary(JSON.parse(await readFile(path.join(root,'library.json'),'utf8')));}
  catch(error) {if(error.code!=='ENOENT')throw error;data={version:1,id:randomUUID(),entries:[]};}
  // Older shared wikis appear automatically, preserving their original IDs.
  const registry=await readRegistry(root);
  for(const p of registry.wikis)if(!data.entries.some(e=>wikiKey(e.location)===wikiKey(p.wiki))) {
    let name=p.name;
    if(data.entries.some(e=>profileKey(e.name)===profileKey(name)))name=name.slice(0,65)+' ('+p.id.slice(0,8)+')';
    data.entries.push({id:p.id,name,kind:p.kind==='site'?'site':'folder',location:p.wiki,description:''});
  }
  return validateLibrary(data);
}
async function libraryTransaction(root,change) {
  const release=await acquireLock(root,'library');
  try {
    const data=await loadLibrary(root), result=await change(data);
    validateLibrary(data);
    const destination=path.join(root,'library.json'),tmp=destination+'.'+randomUUID();
    try {await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,destination);}
    finally {await rm(tmp,{force:true});}
    return result;
  }finally {await release();}
}
export async function listLibrary(root=appFolder()) {
  // Persist the library ID once, so repeated exports update the same overview.
  return libraryTransaction(root,async data=>({id:data.id,sharing:validateSharing(data.sharing || {mode:"tailscale",allowAnonymous:true}),entries:await Promise.all(data.entries.map(async entry=>{
    let available=true;try {const info=await stat(entry.location);available=entry.kind==='html'?info.isFile():info.isDirectory();}catch {available=false;}
    return {...entry,available};
  }))}));
}
export async function addLibraryEntry({root=appFolder(),location,name,kind,description=''}) {
  const canonical=await realpath(location),info=await stat(canonical);
  if(kind==='html') {
    if(!info.isFile() || !/\.html?$/i.test(canonical))fail('Choose a TiddlyWiki HTML file.', 'Vælg en TiddlyWiki HTML-fil.');
    const handle=await open(canonical,'r');let header;
    try {const bytes=Buffer.alloc(65536);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);header=bytes.subarray(0,bytesRead).toString();}finally{await handle.close();}
    if(!/TiddlyWiki/i.test(header))fail('This does not look like a TiddlyWiki file.', 'Filen ligner ikke en TiddlyWiki.');
  } else if(kind==='site') {await validateSite(canonical);
  } else if(kind==='folder') {
    if(!info.isDirectory())fail('Choose a wiki folder.', 'Vælg en wikimappe.');
    const config=JSON.parse(await readFile(path.join(canonical,'tiddlywiki.info'),'utf8'));
    if(!object(config))fail('Invalid wiki folder.', 'Ugyldig wikimappe.');
  } else fail('Choose HTML or a wiki folder.', 'Vælg HTML eller en wikimappe.');
  return libraryTransaction(root,data=>{
    const existing=data.entries.find(e=>wikiKey(e.location)===wikiKey(canonical));if(existing)return existing;
    const entry={id:randomUUID(),name:cleanLabel(name),kind,location:canonical,description:cleanLabel(description,500,true)};
    data.entries.push(entry);validateLibrary(data);return entry;
  });
}
// Import in an isolated, trusted runtime. Incoming wiki plugins are data, never
// executed during conversion. Numeric filenames cannot escape the new folder.
export async function convertHTMLWorker(boot,source,destination) {
  const {TiddlyWiki}=require(boot),tw=TiddlyWiki();
  tw.boot.argv=[destination];
  await new Promise(resolve=>tw.boot.boot(resolve));
  const raw=tw.wiki.deserializeTiddlers('text/html',await readFile(source,'utf8'));
  const core=raw.find(t=>t.title==='$:/core');
  if(!core || core['plugin-type']!=='plugin' || !/^5\./.test(core.version||''))throw Error('Not a complete TiddlyWiki 5 HTML file.');
  if(tw.utils.compareVersions(core.version,tw.version)>0)throw Error('This wiki needs a newer TiddlyWiki runtime.');
  const omit=new Set(['$:/core','$:/core-server','$:/boot/boot.css','$:/boot/boot.js','$:/boot/bootprefix.js','$:/library/sjcl.js','$:/temp/info-plugin']);
  const seen=new Set(),records=[];
  for(const fields of raw) {
    if(!fields.title || seen.has(fields.title))throw Error('Missing or duplicate tiddler title.');
    seen.add(fields.title);
    if(omit.has(fields.title))continue;
    if(fields._canonical_uri && !/^(https?:|data:)/i.test(fields._canonical_uri))throw Error('Local external attachments need to be embedded before sharing.');
    if((/^\$:\/config\/FileSystem/.test(fields.title) || fields.title==='$:/config/tiddlyweb/host') && fields.text)throw Error('Custom server paths need review before conversion.');
    if(/^\$:\/config\/Plugins\/Disabled\/\$:\/plugins\/tiddlywiki\/(filesystem|tiddlyweb)$/.test(fields.title) && fields.text==='yes')throw Error('A required server plugin is disabled.');
    records.push(new tw.Tiddler(fields).getFieldStrings());
  }
  const directory=path.join(destination,'tiddlers');await mkdir(directory,{mode:0o700});
  for(let i=0;i<records.length;i++)await writeFile(path.join(directory,String(i).padStart(6,'0')+'.json'),JSON.stringify([records[i]]),{flag:'wx',mode:0o600});
  const loaded=tw.loadTiddlersFromPath(directory).flatMap(file=>file.tiddlers).map(t=>new tw.Tiddler(t).getFieldStrings());
  const normalize=items=>JSON.stringify(items.sort((a,b)=>a.title.localeCompare(b.title)).map(t=>Object.fromEntries(Object.entries(t).sort(([a],[b])=>a.localeCompare(b)))));
  if(normalize(loaded)!==normalize(records))throw Error('The saved wiki did not match the original.');
  await writeFile(path.join(destination,'tiddlywiki.info'),JSON.stringify({description:'Prepared by ForgeShare',plugins:['tiddlywiki/tiddlyweb','tiddlywiki/filesystem'],build:{index:['--render','$:/core/save/all','index.html','text/plain']}},null,2),{flag:'wx',mode:0o600});
  return records.length;
}
export async function trashHTML(file,{platform=process.platform,run=execute}={}) {
  if(platform==='darwin') {
    const script="ObjC.import('Foundation'); function run(argv) { var error=Ref(); if(!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError($.NSURL.fileURLWithPath(argv[0]),null,error)) throw Error('Could not move original to Trash'); }";
    await run('/usr/bin/osascript',['-l','JavaScript','-e',script,'--',file],{windowsHide:true});
  } else if(platform==='win32') {
    const script="Add-Type -AssemblyName Microsoft.VisualBasic; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(file).toString('base64')+"')); [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin,[Microsoft.VisualBasic.FileIO.UICancelOption]::ThrowException)";
    // Filename is encoded data, never executable PowerShell text.
    await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true});
  } else await run('gio',['trash','--',file],{windowsHide:true});
}
export async function prepareHTML({root=appFolder(),id,boot},deps={}) {
  if(!uuidPattern.test(id))throw Error('Invalid wiki ID');
  const release=await acquireLock(root,'convert-'+id);let destination,committed=false;
  try {
    const entry=(await listLibrary(root)).entries.find(e=>e.id===id);
    if(!entry || entry.kind!=='html')fail('Choose an HTML wiki.','Vælg en HTML-wiki.');
    const before=await lstat(entry.location);if(!before.isFile() || before.isSymbolicLink())fail('Choose a regular HTML file.','Vælg en almindelig HTML-fil.');
    const bytes=await readFile(entry.location);
    const unchanged=async()=>{const now=await lstat(entry.location);return now.dev===before.dev && now.ino===before.ino && now.mtimeMs===before.mtimeMs && (await readFile(entry.location)).equals(bytes);};
    const base=entry.location.replace(/\.html?$/i,'')+'-server';
    for(let n=0;n<100;n++) {const candidate=base+(n?'-'+(n+1):'');try {await mkdir(candidate,{mode:0o700});destination=candidate;break;}catch(e){if(e.code!=='EEXIST')throw e;}}
    if(!destination)fail('No free folder name.','Kunne ikke finde et ledigt mappenavn.');
    const snapshot=path.join(destination,'.source.html');await writeFile(snapshot,bytes,{flag:'wx',mode:0o600});
    try {
      await (deps.convert || (async(boot,source,target)=>{const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;await execute(process.execPath,[self,'--convert-worker',boot,source,target],{env,windowsHide:true,timeout:180000,maxBuffer:1048576});}))(boot,snapshot,destination);
      await validateWikiFolder(destination);
    }catch(error){if(error.cmd)fail('The HTML wiki could not be prepared. The original is unchanged. It may use a newer TiddlyWiki version or external files.','HTML-wikien kunne ikke klargøres. Originalen er urørt. Den kan bruge en nyere TiddlyWiki-version eller eksterne filer.');throw error;}
    await rm(snapshot);
    if(!await unchanged())fail('The HTML file changed. Save and close it, then try again.','HTML-filen blev ændret. Gem og luk den, og prøv igen.');
    const updated=await libraryTransaction(root,data=>{
      const current=data.entries.find(e=>e.id===id);
      if(!current || current.kind!=='html' || current.location!==entry.location)throw Error('Library entry changed during conversion.');
      current.kind='folder';current.location=destination;delete current.shareUrl;return {...current,available:true};
    });committed=true;
    let originalKept=false;
    try {if(!await unchanged())throw Error('Source changed');await (deps.trash||trashHTML)(entry.location);}catch {originalKept=true;}
    return {entry:updated,originalKept};
  } finally {if(destination && !committed)await rm(destination,{recursive:true,force:true});await release();}
}

export function defaultDiscoveryRoots(home=os.homedir()) {
  return ['Wikis','Documents','Desktop','Downloads'].map(name=>path.join(home,name));
}
// Read-only, bounded folder discovery. Never follows directory symlinks or executes wiki code.
export async function discoverWikiFolders({includeHTML=false,roots=defaultDiscoveryRoots(),known=[],maxDepth=5,maxDirectories=1500,maxEntries=20000,maxResults=100,timeoutMs=5000}={}) {
  const skip=new Set(['node_modules','vendor','Library','AppData','$RECYCLE.BIN','System Volume Information','tiddlers','plugins','themes','editions']);
  const queue=roots.map(location=>({location:path.resolve(location),depth:0})),seen=new Set(),found=[];
  const deadline=Date.now()+timeoutMs;let visited=0,examined=0,limited=false,unreadable=0;
  const excluded=new Set(known.map(wikiKey));
  while(queue.length) {
    if(Date.now()>=deadline || visited>=maxDirectories || examined>=maxEntries || found.length>=maxResults){limited=true;break;}
    const {location,depth}=queue.shift();
    try {
      const info=await lstat(location);if(!info.isDirectory() || info.isSymbolicLink())continue;
      const canonical=await realpath(location),key=wikiKey(canonical);if(seen.has(key))continue;seen.add(key);visited++;
      let isWiki=false;
      try {
        const marker=path.join(canonical,'tiddlywiki.info'),meta=await lstat(marker);
        if(meta.isFile() && !meta.isSymbolicLink() && meta.size<=65536)isWiki=object(JSON.parse(await readFile(marker,'utf8')));
      } catch(error) {if(!['ENOENT','ENOTDIR'].includes(error.code) && !(error instanceof SyntaxError))unreadable++;}
      if(isWiki) {
        if(!excluded.has(key))found.push({kind:'folder',location:canonical,name:path.basename(canonical)});
        continue; // Do not search a wiki's contents/backups/plugins for nested candidates.
      }
      if(depth>=maxDepth){limited=true;continue;}
      const directory=await opendir(canonical);
      for await(const entry of directory) {
        examined++;
        if(examined>=maxEntries || Date.now()>=deadline){limited=true;break;}
        if(includeHTML && entry.isFile() && !entry.name.startsWith('.') && /\.html?$/i.test(entry.name)) {
          const file=path.join(canonical,entry.name);
          if(!excluded.has(wikiKey(file)) && found.length<maxResults) {
            let handle;try {handle=await open(file,'r');const bytes=Buffer.alloc(65536);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
              if(/<meta\s+name=["']application-name["']\s+content=["']TiddlyWiki["']/i.test(bytes.subarray(0,bytesRead).toString()))found.push({kind:'html',location:file,name:entry.name.replace(/\.html?$/i,'')});
            }catch {}finally {await handle?.close();}
          }
        }
        if(entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.') && !skip.has(entry.name) && !/\.(app|bundle|framework|photoslibrary)$/i.test(entry.name))
          queue.push({location:path.join(canonical,entry.name),depth:depth+1});
      }
    }catch(error){if(error.code!=='ENOENT')unreadable++;}
  }
  found.sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location));
  return {entries:found,limited,unreadable,visited};
}
function availableLibraryName(name,entries) {
  const base=String(name).replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,65)||'Wiki';
  let candidate=base,index=2;
  while(entries.some(e=>profileKey(e.name)===profileKey(candidate)))candidate=base+' ('+(index++)+')';
  return candidate;
}
export async function addDiscoveredFolders(candidates,root=appFolder()) {
  return libraryTransaction(root,async data=>{
    const added=[];
    for(const candidate of candidates) {
      const location=await realpath(candidate.location);
      if(data.entries.some(e=>wikiKey(e.location)===wikiKey(location)))continue;
      // Revalidate at acceptance time: search results are suggestions, not authority.
      const marker=path.join(location,'tiddlywiki.info'),info=await lstat(marker);
      if(!info.isFile() || info.isSymbolicLink() || info.size>65536 || !object(JSON.parse(await readFile(marker,'utf8'))))
        fail('The wiki folder has changed. Search again.', 'Wikimappen er ændret. Søg igen.');
      const entry={id:randomUUID(),name:availableLibraryName(candidate.name,data.entries),kind:'folder',location,description:''};
      data.entries.push(entry);added.push(entry);
    }
    return added;
  });
}
export async function discoverLibraryAutomatically(root=appFolder(),roots) {
  const library=await listLibrary(root);
  const found=await discoverWikiFolders({roots,includeHTML:true,known:library.entries.map(e=>e.location),maxDepth:3});
  for(const candidate of found.entries) {
    try {const current=await listLibrary(root);await addLibraryEntry({root,...candidate,name:availableLibraryName(candidate.name,current.entries)});}catch {}
  }
  return listLibrary(root);
}
export function validateSharing(value) {
  if(!object(value) || !['tailscale','lan','funnel'].includes(value.mode) || typeof value.allowAnonymous!=='boolean')throw Error('Invalid sharing settings');
  return {mode:value.mode,allowAnonymous:value.mode==='funnel'?false:value.allowAnonymous};
}
export async function readSharing(root=appFolder()) {return validateSharing((await loadLibrary(root)).sharing || {mode:'tailscale',allowAnonymous:true});}
export async function saveSharing(root,value) {return libraryTransaction(root,data=>{data.sharing=validateSharing(value);return data.sharing;});}
async function discoverLibrary(ask,root,deps) {
  let roots=deps.discoveryRoots;
  for(;;) {
    const library=await listLibrary(root);
    const result=await (deps.discover || discoverWikiFolders)({roots,known:library.entries.map(e=>e.location)});
    if(!result.entries.length) {
      await ask('choice',ui('No new wiki folders found here. Try another folder?', 'Ingen nye wikimapper fundet her. Prøv en anden mappe?'),[ui('Search another folder', 'Søg i en anden mappe')]);
      roots=[await ask('folder',ui('Choose where to look', 'Vælg, hvor der skal søges'))];continue;
    }
    const planned=[...library.entries];
    const choices=result.entries.map((entry,index)=>{
      const name=availableLibraryName(entry.name,planned);planned.push({name});
      const relative=path.relative(deps.home||os.homedir(),entry.location);
      const hint=relative.startsWith('..')?entry.location:relative;
      return {...entry,name,label:(index+1)+'. '+name+' — '+hint.replace(/[\r\n\t]/g,' ')};
    });
    const note=(result.limited || result.unreadable)?ui('\nSome folders were skipped or the search limit was reached.', '\nNogle mapper blev sprunget over, eller søgegrænsen blev nået.'):'';
    const selected=(await ask('choices',ui('Found wiki folders — select those to add. Nothing will be started or shared.', 'Fundne wikimapper — vælg dem, der skal tilføjes. Intet bliver startet eller delt.')+note,choices.map(e=>e.label))).split(/\r?\n/);
    const chosen=choices.filter(e=>selected.includes(e.label));
    if(!chosen.length)throw Object.assign(Error('Cancelled'),{cancelled:true});
    await addDiscoveredFolders(chosen,root);return;
  }
}
export async function editLibraryEntry(id,{name,description},root=appFolder()) {
  return libraryTransaction(root,async data=>{
    const entry=data.entries.find(e=>e.id===id);if(!entry)fail('Wiki not found.', 'Wikien blev ikke fundet.');
    entry.name=cleanLabel(name);entry.description=cleanLabel(description,500,true);validateLibrary(data);
    const release=await acquireLock(root,'catalog');
    try {const registry=await readRegistry(root);const profile=registry.wikis.find(p=>wikiKey(p.wiki)===wikiKey(entry.location));if(profile){profile.name=entry.name;await writeRegistry(root,registry);}}finally{await release();}
    return entry;
  });
}
async function rememberSharedAddress(location,url,root) {
  if(!validShareURL(url))return;
  await libraryTransaction(root,data=>{const entry=data.entries.find(e=>wikiKey(e.location)===wikiKey(location));if(entry)entry.shareUrl=url;});
}
// Human-readable titles are retained on subsequent exports, including after a rename.
// Stable UUIDs remain metadata rather than headings. Import still uses TW's review screen.
export async function nameLibraryExport(root,title) {
  return libraryTransaction(root,data=>{
    const name=cleanLabel(title,100);
    if(data.exportTitle!==name) {data.exportTitle=name;for(const entry of data.entries)delete entry.exportTitle;}
    const used=new Set(data.entries.map(e=>e.exportTitle).filter(Boolean));
    for(const entry of data.entries)if(!entry.exportTitle) {
      const base=name+' / '+entry.name;let candidate=base,n=2;
      while(used.has(candidate))candidate=base+' ('+(n++)+')';
      entry.exportTitle=candidate;used.add(candidate);
    }
    return data;
  });
}
export function libraryExport(library,selected,{includeAddresses=false,now=new Date()}={}) {
  if(!Array.isArray(selected) || !selected.length || new Set(selected).size!==selected.length || selected.some(id=>!library.entries.some(e=>e.id===id)))
    fail('Select at least one wiki from the list.', 'Vælg mindst én wiki fra listen.');
  const snapshot=now.toISOString(),modified=snapshot.replace(/[-:TZ.]/g,'');
  const indexTitle=library.exportTitle || ui('My wikis — ForgeShare','Mine wikier — ForgeShare');
  const entries=selected.map(id=>library.entries.find(e=>e.id===id));
  const da='[{$:/language}get[name]lowercase[]regexp[^da(-|$)]] [{$:/language}match[$:/languages/huwiki-da-DK]] [{$:/language}removeprefix[$:/languages/]lowercase[]regexp[^da(-|$)]] [{$:/language}match[da]] +[limit[1]count[]]';
  const label=(d,e)=>`<$text text={{{ [<danish>match[1]then[${d}]else[${e}]] }}}/>`;
  const date=`<$list filter="[<danish>match[1]]" variable="language"><$view field="modified" format="date" template="DD.0MM.YYYY kl. 0hh:0mm"/></$list><$list filter="[<danish>match[0]]" variable="language"><$view field="modified" format="date" template="YYYY-0MM-DD 0hh:0mm"/></$list>`;
  const address=`<$list filter="[<currentTiddler>has[forgeshare-address]]" variable="entry"><p><a href={{!!forgeshare-address}} target="_blank" rel="noopener noreferrer">${label('Åbn wikien','Open the wiki')}</a></p><p>${label('Adressen virker, når værtscomputeren er tændt og deler wikien. Brug den valgte adgang: samme hjemmenetværk, Tailscale-invitation eller en kode til Funnel.','The address works while the host computer is on and sharing. Use the selected access: the same home network, a Tailscale invitation, or a Funnel code.')}</p></$list>`;
  // No user text is interpolated into wikitext: names, titles, descriptions and links are fields.
  const tiddlers=entries.map(e=>({title:e.exportTitle || indexTitle+' / '+e.name,caption:e.name,type:'text/vnd.tiddlywiki',
    text:`<$let danish={{{ ${da} }}}>
<h2><$text text={{!!forgeshare-name}}/></h2>
<p><$text text={{!!forgeshare-description}}/></p>
<p>${label('Dette er oplysninger om en wiki i dit bibliotek. Selve wikiens indhold er ikke kopieret hertil.','This describes a wiki in your library. The wiki’s contents have not been copied here.')}</p>
${address}
<$list filter="[<currentTiddler>!has[forgeshare-address]]" variable="entry"><p>${label('Ingen delingsadresse er med i denne oversigt. Åbn wikien fra ForgeShare på den computer, hvor den ligger.','No shared address is included. Open the wiki in ForgeShare on the computer where it is stored.')}</p></$list>
<p>${label('Oversigt gemt','Snapshot saved')}: ${date}</p>
</$let>`,
    tags:'[[ForgeShare wikibibliotek]]',modified,'forgeshare-id':e.id,'forgeshare-library-id':library.id,'forgeshare-name':e.name,'forgeshare-description':e.description,
    'forgeshare-kind':e.kind,'forgeshare-snapshot':snapshot,
    'forgeshare-address':includeAddresses && validShareURL(e.shareUrl)?e.shareUrl:''}));
  const list=tiddlers.map(t=>t.title);
  tiddlers.unshift({title:indexTitle,caption:indexTitle,type:'text/vnd.tiddlywiki',modified,list,
    'forgeshare-library-id':library.id,'forgeshare-snapshot':snapshot,
    text:`<$let danish={{{ ${da} }}} exportIndex=<<currentTiddler>>>

<h2>${label('Mine wikier','My wikis')}</h2>
<p>${label('Oversigt gemt','Snapshot saved')}: ${date}</p>
<p>${label('Her er de wikier, du valgte i ForgeShare. Åbn en wikis oplysninger nedenfor. Oversigten opdateres, når du eksporterer og importerer igen.','These are the wikis you selected in ForgeShare. Open a wiki’s details below. Export and import again to update this overview.')}</p>

<$list filter="[list<exportIndex>]">
<div style="border-top:1px solid #ccc;padding:1em 0">
<strong><$link><$text text={{!!forgeshare-name}}/></$link></strong>
<p><$text text={{!!forgeshare-description}}/></p>
<$list filter="[<currentTiddler>has[forgeshare-address]]" variable="entry"><a href={{!!forgeshare-address}} target="_blank" rel="noopener noreferrer">${label('Åbn delingsadresse','Open shared address')}</a></$list>
</div>
</$list>

</$let>`});
  return tiddlers;
}
export async function writeLibraryExport(filename,library,ids,options={}) {
  if(!/\.json$/i.test(filename))fail('Save the overview as a .json file.', 'Gem oversigten som en .json-fil.');
  const content=JSON.stringify(libraryExport(library,ids,options),null,2)+'\n';
  // Exclusive creation avoids overwriting an existing wiki/export by surprise.
  await writeFile(filename,content,{flag:'wx',mode:0o600});
}
async function launchLibrary(action,encoded) {
  if(action==='menu')await discoverLibraryAutomatically();
  if(action==='menu') {const startup=await readStartup();if(startup)await guiMain({startup});}
  return libraryMain(action,encoded);
}
export async function libraryMain(action,encoded='',deps={}) {
  const root=deps.root||appFolder(),ask=deps.dialog||dialog;
  const report=deps.report||(value=>process.stdout.write(JSON.stringify(value)+'\n'));
  try {
    if(action==='discover-auto'){report(await discoverLibraryAutomatically(root,deps.discoveryRoots));return;}
    if(action==='list'){report(await listLibrary(root));return;}
    if(action==='startup-status'){report({startup:await readStartup(root)});return;}
    const input=encoded?JSON.parse(Buffer.from(encoded,'base64').toString('utf8')):{};
    if(action==='devices'){
      const executable=await findTailscale(),status=await jsonCommand(executable,['status','--json']);
      const entries=[status.Self,...Object.values(status.Peer||{})].filter(Boolean);
      await ask('info',ui('Tailscale devices — this is not a list of wiki visitors.','Tailscale-enheder — dette er ikke en liste over wikibesøgende.')+'\n\n'+entries.map(e=>(e.HostName||e.DNSName||'?')+' · '+(e.Online?ui('Online','Online'):ui('Offline','Offline'))).join('\n'));
    }else if(action==='vault'){await vaultDialog(createVault(root),ask,ui);}
    else if(action==='invite'){await inviteFromLibrary(root,input.id,ask);}
    else if(action==='help') {
      const file=path.join(path.dirname(self),'help-'+uiLanguage+'.html');
      await (deps.openHelp || (file=>execute(process.platform==='darwin'?'/usr/bin/open':process.platform==='win32'?'explorer.exe':'xdg-open',[file])))(file);
    } else if(action==='sharing') {
      const modes=[ui('Tailscale — private connection','Tailscale — privat forbindelse'),ui('Home network — without Tailscale','Hjemmenetværk — uden Tailscale'),ui('Funnel — internet link with access codes','Funnel — internetlink med adgangskoder')];
      const selected=modes.indexOf(await ask('choice',ui('Sharing settings — used when you press Share','Delingsindstillinger — bruges, når du trykker Del'),modes));
      if(selected<0)throw Object.assign(Error('Cancelled'),{cancelled:true});
      if(selected===2){await saveSharing(root,{mode:'funnel',allowAnonymous:false});report({ok:true});return;}
      const logins=[ui('Network access is enough','Netværksadgang er nok'),ui('Also require wiki login','Kræv også wiki-login')];
      const login=logins.indexOf(await ask('choice',ui('People with access can read and edit. Wiki passwords are requested when starting, never stored.','Personer med adgang kan læse og redigere. Wiki-adgangskoder spørges ved start og gemmes ikke.'),logins));
      if(login<0)throw Object.assign(Error('Cancelled'),{cancelled:true});
      await saveSharing(root,{mode:selected===0?'tailscale':'lan',allowAnonymous:login===0});
    } else if(action==='startup') {
      const options=[ui('Start when I log in','Start, når jeg logger ind'),ui('Do not start at login','Start ikke ved login'),ui('Choose a wiki to start','Vælg en wiki, der skal starte')];
      const choice=await ask('choice',ui('Startup','Opstart'),options);
      if(choice===options[0] || choice===options[1]){await configureLogin(choice===options[0],process.env.FORGESHARE_APP);report({ok:true});return;}

      const library=await listLibrary(root),folders=library.entries.filter(e=>e.kind==='folder' && e.available);
      const off=ui('Only open the library','Åbn kun biblioteket');
      const picked=await ask('choice',ui('When ForgeShare opens','Når ForgeShare åbner'),[off,...folders.map(e=>e.name)]);
      if(picked===off){await saveStartup(root,null);report({ok:true});return;}
      const entry=folders.find(e=>e.name===picked);if(!entry)throw Object.assign(Error('Cancelled'),{cancelled:true});
      const modes=[ui('Only this computer','Kun denne computer'),'Tailscale',ui('Home network','Hjemmenetværk')];
      const modeIndex=modes.indexOf(await ask('choice',ui('Where should this wiki be available at startup?','Hvor skal wikien være tilgængelig ved opstart?'),modes));
      if(modeIndex<0)throw Object.assign(Error('Cancelled'),{cancelled:true});
      const logins=[ui('Ask for wiki login at startup','Bed om wiki-login ved opstart'),ui('Without wiki login','Uden wiki-login')];
      const loginIndex=logins.indexOf(await ask('choice',ui('Passwords are not saved. Without login, people with network access can read and edit.','Adgangskoder gemmes ikke. Uden login kan personer med netværksadgang læse og redigere.'),logins));
      if(loginIndex<0)throw Object.assign(Error('Cancelled'),{cancelled:true});
      await ask('confirm',ui('Start this wiki each time ForgeShare opens?','Start denne wiki, hver gang ForgeShare åbner?')+'\n\n'+entry.name+'\n'+modes[modeIndex]+'\n'+logins[loginIndex]+'\n\n'+ui('To undo, choose Startup → Only open the library. Choose login startup under Settings → Start at login.','Fortryd under Opstart → Åbn kun biblioteket. Start ved login vælges under Indstillinger → Start ved login.'));
      await saveStartup(root,{wikiId:entry.id,mode:['local','tailscale','lan'][modeIndex],allowAnonymous:loginIndex===1});
    } else if(action==='add') {
      const choice=await ask('choice',ui('Add a wiki', 'Tilføj en wiki'),[ui('Find wiki folders', 'Find wikimapper'),ui('HTML file','HTML-fil'),ui('Choose a wiki folder', 'Vælg en wikimappe'),ui('Search another folder', 'Søg i en anden mappe'),ui('HTML site','HTML-site')]);
      if(choice===ui('Find wiki folders','Find wikimapper') || choice===ui('Search another folder','Søg i en anden mappe')) {
        if(choice===ui('Search another folder','Søg i en anden mappe'))deps={...deps,discoveryRoots:[await ask('folder',ui('Choose where to look', 'Vælg, hvor der skal søges'))]};
        await discoverLibrary(ask,root,deps);report({ok:true});return;
      }
      const kind=choice===ui('HTML site','HTML-site')?'site':choice.startsWith('HTML')?'html':'folder';
      const location=await ask(kind==='html'?'file':'folder',ui('Choose your wiki', 'Vælg din wiki'));
      const name=await ask('text',ui('Wiki name', 'Wikinavn'),path.basename(location).replace(/\.html?$/i,''));
      await addLibraryEntry({root,location,name,kind});
    } else if(action==='prepare') {
      const entries=[];
      if(!Array.isArray(input.ids) || !input.ids.length)fail('Select wikis to share.','Vælg wikier, der skal deles.');
      for(const id of [...new Set(input.ids)]) {
        let entry=(await listLibrary(root)).entries.find(e=>e.id===id);
        if(!entry?.available)fail('A selected wiki is missing.','En valgt wiki mangler.');
        if(entry.kind==='html') {
          const installed=await (deps.findTiddlyWiki||findTiddlyWiki)();
          const runtime=installed?await validateRuntime(installed):await (deps.installRuntime||installRuntime)(ask);
          const result=await prepareHTML({root,id,boot:runtime.boot},deps);entry=result.entry;
          if(result.originalKept)await ask('info',ui('The wiki is ready. The original could not be moved to Trash and is still in its old folder. Use the library entry from now on.','Wikien er klar. Originalen kunne ikke flyttes til papirkurven og ligger stadig i den gamle mappe. Brug bibliotekets wiki fremover.'));
        }
        entries.push(entry);
      }
      report({ok:true,entries});return;
    } else if(action==='edit') {
      const entry=(await listLibrary(root)).entries.find(e=>e.id===input.id);if(!entry)fail('Wiki not found.', 'Wikien blev ikke fundet.');
      const name=await ask('text',ui('Wiki name', 'Wikinavn'),entry.name);
      const description=await ask('optional',ui('Short description (optional)', 'Kort beskrivelse (valgfri)'),entry.description);
      await editLibraryEntry(entry.id,{name,description},root);
    } else if(action==='export') {
      let library=await listLibrary(root);libraryExport(library,input.ids);
      const choice=await ask('choice',ui('What should the overview include? File paths and passwords stay on this computer.','Hvad skal oversigten indeholde? Filstier og adgangskoder bliver på computeren.'),[ui('Names and descriptions', 'Navne og beskrivelser'),ui('Also last shared addresses', 'Også seneste delingsadresser')]);
      const includeAddresses=choice===ui('Also last shared addresses','Også seneste delingsadresser');
      await ask('confirm',ui('Export these wikis:\n\n','Eksportér disse wikier:\n\n')+input.ids.map(id=>library.entries.find(e=>e.id===id).name).join('\n'));
      const destination=await ask('save',ui('Save a NEW overview file', 'Gem en NY oversigtsfil'),'ForgeShare-wikier.json');
      const title=await ask('text',ui('Name this overview in your wiki. Use a different name for a separate library.','Navngiv oversigten i wikien. Brug et andet navn til et andet bibliotek.'),library.exportTitle || ui('My wikis — ForgeShare','Mine wikier — ForgeShare'));
      library=await nameLibraryExport(root,title);
      await writeLibraryExport(destination,library,input.ids,{includeAddresses});
      await ask('info',ui('Overview saved. Drag the file into your wiki and choose Import. Open the overview using the name you chose.','Oversigten er gemt. Træk filen ind i din wiki, og vælg Importér. Åbn oversigten under det navn, du valgte.'));
    } else if(action==='menu') {
      const library=await listLibrary(root),add=ui('＋ Add a wiki', 'Tilføj en wiki'),exp=ui('Export selected overview','Eksportér valgt oversigt');
      const vault=ui('Vault','Nøgleboks'),help=ui('Help','Hjælp'),startup=ui('Startup','Opstart'),sharing=ui('Sharing settings','Delingsindstillinger');
      const picked=await ask('choice',ui('Wiki library','Wikibibliotek'),[add,exp,vault,help,startup,sharing,...library.entries.map(e=>'Wiki: '+e.name)]);
      if(picked===vault)return libraryMain('vault','',deps);
      if(picked===sharing)return libraryMain('sharing','',deps);
      if(picked===help)return libraryMain('help','',deps);
      if(picked===startup)return libraryMain('startup','',deps);
      if(picked===add)return libraryMain('add','',deps);
      if(picked===exp){const names=(await ask('choices',ui('Select wikis to export', 'Vælg wikier til eksport'),library.entries.map(e=>e.name))).split('\n');const ids=library.entries.filter(e=>names.includes(e.name)).map(e=>e.id);return libraryMain('export',Buffer.from(JSON.stringify({ids})).toString('base64'),deps);}
      const entry=library.entries.find(e=>'Wiki: '+e.name===picked);if(!entry)return;
      const op=await ask('choice',entry.name,[ui('Open', 'Åbn'),ui('Edit name/description','Redigér navn/beskrivelse'),ui('Share','Del')]);
      if(op===ui('Edit name/description','Redigér navn/beskrivelse'))return libraryMain('edit',Buffer.from(JSON.stringify({id:entry.id})).toString('base64'),deps);
      if(entry.kind==='html' && op===ui('Share','Del')) {
        let prepared;await libraryMain('prepare',Buffer.from(JSON.stringify({ids:[entry.id]})).toString('base64'),{...deps,report:value=>{prepared=value;}});
        if(prepared?.ok)return guiMain({...deps,libraryId:entry.id,quick:true});return;
      }
      if(entry.kind==='html'){await (deps.openFile || (file=>execute('xdg-open',[file])))(entry.location);return;}
      return guiMain({...deps,libraryId:entry.id,quick:true,localOnly:op===ui('Open','Åbn')});
    } else fail('Unknown library action.', 'Ukendt biblioteksfunktion.');
    report({ok:true});
  } catch(error) {
    if(error.cancelled){report({cancelled:true});return;}
    if(action==='list')throw error;
    await ask('info',error.code==='EEXIST'?ui('Choose a new file name. The existing file was not replaced.', 'Vælg et nyt filnavn. Den eksisterende fil blev ikke overskrevet.'):error.message);
    report({error:true});
  }
}

function inputPath(value) {
  let result = value.trim();
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) result = result.slice(1, -1);
  if (result.startsWith('~/')) result = path.join(os.homedir(), result.slice(2));
  return path.resolve(result);
}
export async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) fail('Node.js 20+ is required.', 'Node.js 20+ kræves.');
  if (!process.stdin.isTTY) fail('Run locally in an interactive terminal.', 'Kør lokalt i et interaktivt terminalvindue.');
  const readline = createInterface({input: process.stdin, output: process.stdout});
  let session;
  const children = new Set();
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    readline.close();
    if (session) void session.stop();
    else for (const child of children) void stopChild(child);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, interrupt);
  try {
    console.log('\nForgeShare — Private wiki sharing / Privat wikideling\nNo install or browser opening / Installerer intet og åbner ingen browser.\nCtrl+C cancels or stops / Ctrl+C annullerer eller stopper.\n');
    const tailscale = await findTailscale();
    let runtime = await findTiddlyWiki();
    if (!runtime) {
      console.log('TiddlyWiki not found / ikke fundet. See / Se https://tiddlywiki.com/static/Installing%2520TiddlyWiki%2520on%2520Node.js.html');
      runtime = inputPath(await readline.question('Installed tiddlywiki package folder (Ctrl+C to cancel) / Installationsmappe: '));
    }
    const {boot, version} = await validateRuntime(runtime);
    const root = appFolder();
    const choices = (await readRegistry(root)).wikis;
    choices.forEach((item, index) => console.log(`${index + 1}. ${item.name}`));
    const selection = await readline.question('Choose a wiki number, or Enter to add one / Vælg wikinummer, eller Enter for ny: ');
    let profile = selection ? choices[Number(selection) - 1] : undefined;
    if (selection && !profile) throw Error('Unknown wiki / Ukendt wiki.');
    if (!profile) {
      const wikiInput = inputPath(await readline.question('Server wiki folder / Serverwikimappe: '));
      const name = await readline.question('Wiki name / Wikinavn: ');
      profile = await registerWiki({root, wiki: wikiInput, name, tailscale});
    }
    const credentialsInput = inputPath(await readline.question('Private credentials CSV outside wiki / Privat login-CSV uden for wikien: '));
    const files = await validateFiles(profile.wiki, credentialsInput);
    console.log(`\nWiki: ${profile.name}\nFolder / Mappe: ${files.wiki}\nTiddlyWiki: ${version} (tested / testet: 5.4.1)\n127.0.0.1:${profile.port} → private HTTPS :${profile.httpsPort}\nExisting services remain unchanged / Eksisterende tjenester bevares.\nAll accounts in the CSV can read and write / Alle konti i CSV-filen kan læse og skrive.\nRestrict Tailscale access to intended people and TCP ${profile.httpsPort} first.\nBegræns først Tailscale-adgang til de tiltænkte personer og TCP ${profile.httpsPort}.\nWindows: restrict CSV permissions to your account; ACLs are not checked.\nWindows: begræns CSV-rettigheder til din konto; ACL kontrolleres ikke.\n`);
    if (await readline.question('Type START to share / Skriv START for at dele: ') !== 'START') return;
    readline.close();
    if (interrupted) return;
    // Track children from creation, including startup, so Ctrl+C never strands a process.
    session = await startNamedSession(profile, {...files, boot, tailscale, root}, {
      startWiki: options => { const result = startWiki(options); children.add(result.child); if (interrupted) void stopChild(result.child); return result; },
      spawn: (...args) => { const child = spawn(...args); children.add(child); if (interrupted) void stopChild(child); return child; }
    });
    if (interrupted) await session.stop();
    else console.log(`\nReady / Klar: ${session.url}\nOpen this address yourself / Åbn selv denne adresse.\nKeep this window open; Ctrl+C stops sharing / Hold vinduet åbent; Ctrl+C stopper deling.\n`);
    await session.finished;
  } finally {
    readline.close();
    if (session) await session.stop();
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupt);
  }
}
function worker() {
  const tw = require(process.argv[3]).TiddlyWiki();
  tw.boot.argv = process.argv.slice(4);
  let nodeServer, stopping = false;
  tw.hooks.addHook('th-server-command-post-start', (server, listener) => {
    nodeServer = listener;
    childBridge(listener);
    listener.once('listening', () => process.send?.({type: 'listening', address: listener.address()}));
  });
  const drain = () => {
    if (stopping) return;
    stopping = true;
    // Stop accepting edits, finish in-flight requests, then let the filesystem
    // syncer finish queued writes. A successful HTTP PUT precedes disk persistence.
    const flush = () => {
      const deadline = Date.now() + 30000;
      const timer = setInterval(() => {
        if (!tw.syncer?.isDirty()) { clearInterval(timer); process.exit(0); }
        if (Date.now() >= deadline) { clearInterval(timer); process.exit(1); }
      }, 100);
    };
    if (nodeServer?.listening) nodeServer.close(flush); else flush();
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'disconnect']) process.on(signal, drain);
  process.on('message', data => { if (data?.type === 'shutdown') drain(); });
  tw.boot.boot();
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--convert-worker') { await convertHTMLWorker(...process.argv.slice(3)); }
  else if(process.argv[2]==='--site-worker')await siteWorker(JSON.parse(process.argv[3]));
  else if (process.argv[2] === '--worker') worker();
  else { uiLanguage = await detectLanguage(); (process.argv.includes('--library') ? launchLibrary(process.argv[process.argv.indexOf('--library')+1],process.argv[process.argv.indexOf('--library')+2]) : quiet ? guiMain() : main()).catch(error => { console.error('\nForgeShare stopped / stoppet:\n' + error.message); process.exitCode = 1; }); }
}

// Native dialogs keep the ordinary flow out of the terminal. Arguments are data,
// never interpolated into shell commands. No browser or website is opened.
export function dialogCommand(platform, kind, message, initial = '') {
  if (platform === 'darwin') {
    if(kind==='choice' && initial.length<=6) {
      // AppKit's NSAlert buttons are visible before focus, support keyboard activation,
      // and return an index. All labels travel as argv data, never executable source.
      const script=`ObjC.import('AppKit');
function run(argv) {
  var app=$.NSApplication.sharedApplication; app.setActivationPolicy(1);
  var alert=$.NSAlert.alloc.init; alert.messageText='ForgeShare'; alert.informativeText=argv[0];
  for(var i=2;i<argv.length;i++)alert.addButtonWithTitle(argv[i]);
  var cancel=alert.addButtonWithTitle(argv[1]); cancel.keyEquivalent='\\u001b';
  app.activateIgnoringOtherApps(true);
  var selected=Number(alert.runModal)-1000;
  if(selected<0 || selected>=argv.length-2)throw new Error('Cancelled (-128)');
  return argv[selected+2];
}`;
      return ['/usr/bin/osascript',['-l','JavaScript','-e',script,'--',message,ui('Cancel','Annuller'),...initial]];
    }
    const actions = {
      choices: 'set picked to choose from list (items 2 thru -1 of argv) with prompt (item 1 of argv) with title "ForgeShare" with multiple selections allowed\nif picked is false then error number -128\nset AppleScript\'s text item delimiters to linefeed\nreturn picked as text',
      save: 'return POSIX path of (choose file name with prompt (item 1 of argv) default name (item 2 of argv))',
      optional: 'return text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) with title "ForgeShare")',
      folder: 'return POSIX path of (choose folder with prompt (item 1 of argv))',
      file: 'return POSIX path of (choose file with prompt (item 1 of argv) )',
      text: 'return text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) with title "ForgeShare")',
      password: 'return text returned of (display dialog (item 1 of argv) default answer "" with hidden answer with title "ForgeShare")',
      confirm: 'display dialog (item 1 of argv) buttons {"CANCEL_LABEL", "CONTINUE_LABEL"} default button 2 cancel button 1 with title "ForgeShare"',
      info: 'display dialog (item 1 of argv) buttons {"OK"} default button 1 with title "ForgeShare"',
      choice: 'set picked to choose from list (items 2 thru -1 of argv) with prompt (item 1 of argv) with title "ForgeShare"\nif picked is false then error number -128\nreturn item 1 of picked'
    };
    return ['/usr/bin/osascript', ['-e', `on run argv\n${actions[kind].replace('CANCEL_LABEL',ui('Cancel','Annuller')).replace('CONTINUE_LABEL',ui('Continue','Fortsæt'))}\nend run`, '--', message, ...(['choice','choices'].includes(kind) ? initial : [initial])]];
  }
  if (platform === 'win32') {
    // Data travels on stdin, keeping paths/text out of code and avoiding Windows' command-line size limit.
    const data = Buffer.from(JSON.stringify({kind, message, initial,cancel:ui('Cancel','Annuller')})).toString('base64');
    const script = `$env:PSModulePath=$PSHOME+'\\Modules'; $ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName Microsoft.VisualBasic
$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
[Console]::OutputEncoding = [Text.Encoding]::UTF8
switch ($d.kind) {
 'choices' { $f=New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.Width=760; $f.Height=470; $f.StartPosition='CenterScreen'; $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(15,15,710,100); $list=New-Object Windows.Forms.CheckedListBox; $list.CheckOnClick=$true; $list.HorizontalScrollbar=$true; $list.SetBounds(15,120,710,250); foreach($item in $d.initial){[void]$list.Items.Add([string]$item)}; $b=New-Object Windows.Forms.Button; $b.Text='OK'; $b.SetBounds(620,385,100,30); $b.DialogResult='OK'; $f.Controls.AddRange(@($l,$list,$b)); $f.AcceptButton=$b; if($f.ShowDialog() -ne 'OK' -or $list.CheckedItems.Count -eq 0){exit 2}; foreach($item in $list.CheckedItems){Write-Output $item} }
 'choice' { $f=New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.ClientSize=New-Object Drawing.Size(560,420); $f.StartPosition='CenterScreen'; $f.Font=New-Object Drawing.Font('Segoe UI',10); $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(20,15,520,75); $panel=New-Object Windows.Forms.FlowLayoutPanel; $panel.SetBounds(20,95,520,265); $panel.FlowDirection='TopDown'; $panel.WrapContents=$false; $panel.AutoScroll=$true; foreach($item in $d.initial){$b=New-Object Windows.Forms.Button; $b.Text=[string]$item; $b.Tag=[string]$item; $b.Size=New-Object Drawing.Size(490,48); $b.Margin=New-Object Windows.Forms.Padding(0,0,0,10); $b.Add_Click({param($sender,$event) $f.Tag=$sender.Tag; $f.DialogResult='OK'; $f.Close()}); $panel.Controls.Add($b)}; $cancel=New-Object Windows.Forms.Button; $cancel.Text=$d.cancel; $cancel.SetBounds(425,375,115,30); $cancel.DialogResult='Cancel'; $f.CancelButton=$cancel; $f.Controls.AddRange(@($l,$panel,$cancel)); if($f.ShowDialog() -ne 'OK'){exit 2}; Write-Output $f.Tag }
 'save' { $p=New-Object Windows.Forms.SaveFileDialog; $p.Title=$d.message; $p.Filter='Wiki overview|*.json'; $p.FileName=$d.initial; $p.DefaultExt='json'; if($p.ShowDialog() -ne 'OK') {exit 2}; Write-Output $p.FileName }
 'optional' { $f=New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.Width=540; $f.Height=200; $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(15,15,490,40); $t=New-Object Windows.Forms.TextBox; $t.Text=$d.initial; $t.SetBounds(15,60,490,25); $b=New-Object Windows.Forms.Button; $b.Text='OK'; $b.SetBounds(400,100,100,30); $b.DialogResult='OK'; $f.Controls.AddRange(@($l,$t,$b)); $f.AcceptButton=$b; if($f.ShowDialog() -ne 'OK') {exit 2}; Write-Output $t.Text }
 'folder' { $p = New-Object Windows.Forms.FolderBrowserDialog; $p.Description = $d.message; if ($p.ShowDialog() -ne 'OK') { exit 2 }; Write-Output $p.SelectedPath }
 'file' { $p = New-Object Windows.Forms.OpenFileDialog; $p.Title = $d.message; $p.Filter = 'TiddlyWiki HTML|*.html;*.htm'; if ($p.ShowDialog() -ne 'OK') { exit 2 }; Write-Output $p.FileName }
 'text' { $v = [Microsoft.VisualBasic.Interaction]::InputBox($d.message, 'ForgeShare', $d.initial); if (!$v) { exit 2 }; Write-Output $v }
 'password' { $f = New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.Width=540; $f.Height=240; $f.StartPosition='CenterScreen'; $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(15,15,490,80); $t=New-Object Windows.Forms.TextBox; $t.UseSystemPasswordChar=$true; $t.SetBounds(15,100,490,25); $b=New-Object Windows.Forms.Button; $b.Text='OK'; $b.SetBounds(400,140,100,30); $b.DialogResult='OK'; $f.Controls.AddRange(@($l,$t,$b)); $f.AcceptButton=$b; if ($f.ShowDialog() -ne 'OK') { exit 2 }; Write-Output $t.Text }
 'confirm' { if ([Windows.Forms.MessageBox]::Show($d.message,'ForgeShare','OKCancel') -ne 'OK') { exit 2 } }
 'info' { [void][Windows.Forms.MessageBox]::Show($d.message,'ForgeShare') }
}`;
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],data];
  }
  if (platform === 'linux') {
    const common = ['--title=ForgeShare'];
    const flags = {
      choices: ['--list','--checklist','--separator=\n','--text='+message,'--column=','--column=Wiki','--height=400',...(Array.isArray(initial)?initial:[]).flatMap(name=>['FALSE',name])],
      choice: ['--list','--radiolist','--text='+message,'--column=','--column='+ui('Choose','Vælg'),'--height=400',...(Array.isArray(initial)?initial:[]).flatMap((name,index)=>[index===0?'TRUE':'FALSE',name])],
      save: ['--file-selection','--save','--filename='+initial,'--title='+message],
      optional: ['--entry','--text='+message,'--entry-text='+initial],
      folder: ['--file-selection', '--directory', '--title=' + message],
      file: ['--file-selection', '--file-filter=Wiki | *.html *.htm', '--title=' + message],
      text: ['--entry', '--text=' + message, '--entry-text=' + initial],
      password: ['--entry', '--hide-text', '--text=' + message],
      confirm: ['--question', '--text=' + message, '--ok-label='+ui('Continue','Fortsæt'), '--cancel-label='+ui('Cancel','Annuller')],
      info: ['--info', '--text=' + message]
    };
    return ['zenity', [...common, ...flags[kind]]];
  }
  throw Error(ui('Supported systems: Mac, Windows, Linux','Understøttede systemer: Mac, Windows, Linux.'));
}
export async function dialog(kind, message, initial = '', signal) {
  const [command, args, input] = dialogCommand(process.platform, kind, message, initial);
  try {
    const stdout = await new Promise((resolve,reject)=>{
      const child=execFile(command,args,{maxBuffer:262144,windowsHide:true,signal},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve(stdout));
      // Early cancellation can close the pipe before the payload is written; the exit callback reports it.
      child.stdin.on('error',()=>{});child.stdin.end(input || '');
    });
    return stdout.trimEnd();
  } catch (error) {
    if (error.code === 'ENOENT') throw Error(ui('Graphical dialogs are unavailable. On Linux, install Zenity using your software manager.', 'Grafiske dialoger mangler. På Linux installeres Zenity via programbutikken.'));
    const cancelled = error.name === 'AbortError' ||
      (process.platform === 'win32' && error.code === 2) ||
      (process.platform === 'darwin' && String(error.stderr).includes('(-128)')) ||
      (process.platform === 'linux' && error.code === 1);
    if (cancelled) throw Object.assign(Error(ui('Cancelled', 'Annulleret')), {cancelled: true});
    throw new Error(ui('Could not display the dialog.', 'Kunne ikke vise dialogboksen.'), {cause: error});
  }
}
function appFolder() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'ForgeShare');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/ForgeShare');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'ForgeShare');
}
export async function installRuntime(ask = dialog) {
  const destination = path.join(appFolder(), 'tiddlywiki-5.4.1');
  try { return await validateRuntime(path.join(destination, 'node_modules/tiddlywiki')); } catch {}
  await ask('confirm', ui('TiddlyWiki is needed to run your wiki. Download and install tested version 5.4.1 here?', 'TiddlyWiki skal bruges til at køre din wiki. Hent og installer den testede version 5.4.1 her?') + '\n\n' + destination + ui('\n\nRequires internet. No global installation; no install scripts.', '\nKræver internet. Ingen global installation eller installationsscripts.'));
  const candidates = [path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')];
  let npm;
  for (const candidate of candidates) { try { await access(candidate); npm = candidate; break; } catch {} }
  if (!npm) fail('The Node.js installer must include npm. Reinstall Node.js using its official installer.', 'Node.js-installationen skal inkludere npm. Geninstaller Node.js via det officielle installationsprogram.');
  await mkdir(destination, {recursive: true, mode: 0o700});
  await execute(process.execPath, [npm, 'install', '--prefix', destination, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', 'tiddlywiki@5.4.1'], {timeout: 180000, maxBuffer: 1024 * 1024, windowsHide: true});
  return validateRuntime(path.join(destination, 'node_modules/tiddlywiki'));
}
export async function privateSessionDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ForgeShare-'));
  if (process.platform === 'win32') {
    // Restrict the directory BEFORE putting credentials inside it.
    const data = Buffer.from(directory).toString('base64');
    try {
      // Use .NET directly: a PowerShell 7 parent may supply a module path that
      // Windows PowerShell 5.1 cannot load. Replace the DACL, not merely inherited
      // entries, because temporary folders can also contain explicit grants.
      const protect = `$ErrorActionPreference='Stop'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')); $s=[Security.Principal.WindowsIdentity]::GetCurrent().User; $a=[Security.AccessControl.DirectorySecurity]::new(); $a.SetAccessRuleProtection($true,$false); $r=[Security.AccessControl.FileSystemAccessRule]::new($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $a.AddAccessRule($r); [IO.Directory]::SetAccessControl($p,$a); $a=[IO.Directory]::GetAccessControl($p); $rules=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]); if (!$a.AreAccessRulesProtected -or $rules.Count -eq 0) { exit 1 }; foreach ($r in $rules) { if ($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -ne $s.Value) { exit 2 } }`;
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(protect, 'utf16le').toString('base64')], {windowsHide: true});
    } catch (cause) {
      await rm(directory, {recursive: true, force: true});
      throw new Error(ui('Could not protect your login file. Nothing shared.', 'Kunne ikke beskytte din loginfil. Intet delt.'), {cause});
    }
  }
  return directory;
}
export async function guiMain(deps = {}) {
  const shutdown = new AbortController();
  const ask = (kind, message, initial = '', signal = shutdown.signal) => (deps.dialog || dialog)(kind, message, initial, signal);
  const root = deps.root || appFolder();
  let localOnly=deps.localOnly ?? process.argv.includes('--local');
  let libraryId=deps.libraryId || (process.argv.includes('--profile')?process.argv[process.argv.indexOf('--profile')+1]:null);
  let session, privateDir;
  const children = new Set();
  let interrupted = false;
  const interrupt = () => { interrupted = true; shutdown.abort(); if (session) void session.stop(); else for (const child of children) void stopChild(child); };
  const appMode = deps.appMode ?? process.argv.includes('--app');
  const inputStream = deps.input || process.stdin;
  const report = data => { if (appMode) (deps.report || (item => process.stdout.write(JSON.stringify(item) + '\n')))(data); };
  let input = '';
  const inputData = chunk => { input += chunk.toString(); if (input.includes('STOP\n') || input.length > 1024) interrupt(); };
  if (appMode) { inputStream.on('data', inputData); inputStream.once('end', interrupt); }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, interrupt);
  try {
    const startup=deps.startup || (process.argv.includes('--startup')?await readStartup(root):null);
    if(startup){validateStartup(startup,await loadLibrary(root));libraryId=startup.wikiId;localOnly=startup.mode==='local';}
    const quick=deps.quick || process.argv.includes('--quick');
    const sharing=quick?await readSharing(root):null;
    if(!startup && !quick)await ask('confirm', localOnly ? ui('Open this wiki only on your computer. You choose whether to use wiki login.', 'Åbn kun wikien på denne computer. Du vælger selv, om der skal være wiki-login.') : ui('Share a wiki. Choose the network and whether to use wiki login. Nothing starts before the final confirmation.', 'Del en wiki. Vælg netværk og eventuelt wiki-login. Intet starter før den sidste bekræftelse.'));
    if (Number(process.versions.node.split('.')[0]) < 20) fail('Install Node.js 20 or later.', 'Installer Node.js 20 eller nyere.');
    let mode=startup?.mode || (quick && !localOnly?sharing.mode:'local'),lanHost;
    if(!localOnly && !startup && !quick) {
      const methods=[ui('Tailscale — invited people', 'Tailscale — inviterede personer'),ui('Home network — same Wi-Fi or network', 'Hjemmenetværk — samme Wi-Fi eller netværk'),ui('Funnel — internet link with access codes','Funnel — internetlink med adgangskoder')];
      const method=await ask('choice',ui('Where should the wiki be shared?','Hvor skal wikien deles?'),methods);
      if(!methods.includes(method))throw Object.assign(Error('Cancelled'),{cancelled:true});
      mode=['tailscale','lan','funnel'][methods.indexOf(method)];
    }
    if(mode==='lan') {
      const addresses=homeNetworkAddresses((deps.networkInterfaces||os.networkInterfaces)());
      if(!addresses.length)fail('No home network found. Connect to your Wi-Fi or wired network and try again.', 'Intet hjemmenetværk fundet. Forbind til dit Wi-Fi eller kabelnetværk, og prøv igen.');
      if(addresses.length===1)lanHost=addresses[0].address;
      else {
        const choices=addresses.map(e=>e.name+' — '+e.address);
        const picked=await ask('choice',ui('Choose the network your guests use', 'Vælg det netværk, gæsterne bruger'),choices);
        lanHost=addresses[choices.indexOf(picked)]?.address;
        if(!lanHost)throw Object.assign(Error('Cancelled'),{cancelled:true});
      }
    }
    const tailscale = ['tailscale','funnel'].includes(mode) ? await (deps.findTailscale || findTailscale)() : undefined;
    const libraryEntry=libraryId?(await listLibrary(root)).entries.find(e=>e.id===libraryId):null;
    const installed = libraryEntry?.kind==='site'?null:await (deps.findTiddlyWiki || findTiddlyWiki)();
    if(startup && !installed && libraryEntry?.kind!=='site')fail('Set up TiddlyWiki using Open or Share first. Automatic startup did not install anything.','Klargør først TiddlyWiki med Åbn eller Del. Automatisk opstart har ikke installeret noget.');
    const runtime = libraryEntry?.kind==='site'?{}:installed ? await validateRuntime(installed) : await (deps.installRuntime || installRuntime)(ask);
    if(libraryId && (!libraryEntry || !['folder','site'].includes(libraryEntry.kind)))fail('Choose a server wiki folder.', 'Vælg en serverwikimappe.');
    const choices = (await readRegistry(root)).wikis;
    const add = ui('＋ Add another wiki', 'Tilføj en wiki');
    const picked = libraryEntry ? '' : choices.length ? await ask('choice', ui('Choose your wiki', 'Vælg din wiki'), [...choices.map(item => 'Wiki: ' + item.name), add]) : add;
    let profile = libraryEntry ? await registerWiki({root,wiki:libraryEntry.location,name:libraryEntry.name,kind:libraryEntry.kind,tailscale,localOnly:!['tailscale','funnel'].includes(mode)},deps) : choices.find(item => 'Wiki: ' + item.name === picked);
    if (!profile && picked !== add) throw Error(ui('Unknown wiki selection', 'Ukendt wikivalg.'));
    if (!profile) {
      const wiki = await realpath(await ask('folder', ui('Choose the prepared wiki folder', 'Vælg den forberedte wikimappe')));
      try { await access(path.join(wiki, 'tiddlywiki.info')); }
      catch { fail('This is not a prepared wiki folder. Follow “First setup” in ForgeShare; an HTML file must first be copied into a server wiki.', 'Dette er ikke en forberedt wikimappe. Følg “Første opsætning” i ForgeShare; en HTML-fil skal først kopieres til en serverwiki.'); }
      const name = await ask('text', ui('Give this wiki a name, for example Family or Garden.', 'Giv wikien et navn, for eksempel Familie eller Have.'), path.basename(wiki));
      profile = await registerWiki({root, wiki, name, tailscale, localOnly:!['tailscale','funnel'].includes(mode)}, deps);
    }
    const displayName=libraryEntry?.name||profile.name;
    report({event:'selected',name:displayName,...(libraryId?{id:libraryId}:{})});
    const withLogin=ui('With wiki login', 'Med wiki-login'),withoutLogin=ui('Without wiki login', 'Uden wiki-login');
    const login=mode==='funnel'?withLogin:startup ? (startup.allowAnonymous?withoutLogin:withLogin) : quick ? (sharing.allowAnonymous?withoutLogin:withLogin) : await ask('choice',ui('Wiki login? Without it, everyone with network access can read and edit.', 'Wiki-login? Uden login kan alle med netværksadgang læse og redigere.'),mode==='tailscale'?[withLogin,withoutLogin]:[withoutLogin,withLogin]);
    if(![withLogin,withoutLogin].includes(login))throw Object.assign(Error('Cancelled'),{cancelled:true});
    const allowAnonymous=login===withoutLogin;
    let files,codeAccess,savedLogin,loginToSave;
    if(libraryId){try {const ids=JSON.parse(await readFile(path.join(root,'saved-logins.json'),'utf8'));if(ids.includes(libraryId))savedLogin=(await createVault(root).read()).wikiLogins[libraryId];}catch(error){if(error.code!=='ENOENT')throw error;}}
    if(savedLogin && (mode==='funnel'?!savedLogin.readerCode:!savedLogin.password))savedLogin=undefined;
    if(allowAnonymous)files=libraryEntry?.kind==='site'?{wiki:await validateSite(profile.wiki)}:await validateWikiFolder(profile.wiki);
    else if(mode==='funnel') {
      const readerCode=savedLogin?.readerCode||await ask('password',libraryEntry?.kind==='site'?ui('Code for visitors','Kode til besøgende'):ui('Code for readers — they can read the wiki','Kode til læsere — de kan læse wikien'));
      const editorCode=savedLogin?.editorCode||(libraryEntry?.kind==='site'?randomBytes(32).toString('hex'):await ask('password',ui('Code for editors — they can change the wiki. Use a different code.','Kode til redaktører — de kan ændre wikien. Brug en anden kode.')));
      if(!readerCode.trim()||!editorCode.trim()||readerCode===editorCode||Math.max(readerCode.length,editorCode.length)>256)fail('Choose two different, nonempty codes.','Vælg to forskellige koder, som ikke er tomme.');
      loginToSave={readerCode,editorCode};
      codeAccess={readerCode,editorCode,readerSecret:randomBytes(32).toString('hex'),editorSecret:randomBytes(32).toString('hex')};
      privateDir=await privateSessionDirectory();const credentials=path.join(privateDir,'login.csv');
      await writeFile(credentials,`username,password\nreader,${codeAccess.readerSecret}\neditor,${codeAccess.editorSecret}\n`,{mode:0o600,flag:'wx'});
      files=libraryEntry?.kind==='site'?{wiki:await validateSite(profile.wiki),credentials}:await validateFiles(profile.wiki,credentials);
    }
    else {
      const username=savedLogin?.username||await ask('text',ui('Choose a wiki username', 'Vælg wikiens brugernavn'),'wiki');
      const password=savedLogin?.password||await ask('password',ui('Choose a password. You decide its length.', 'Vælg en adgangskode. Du bestemmer længden.'));
      const confirm=savedLogin?.password||await ask('password',ui('Repeat the password', 'Gentag adgangskoden'));
      if(password!==confirm)fail('Passwords did not match. Please start again.', 'Adgangskoderne var forskellige. Start igen.');
      validateCredentials(`username,password\n${username},${password}\n`);
      loginToSave={username,password};
      privateDir=await privateSessionDirectory();
      const credentials=path.join(privateDir,'login.csv');
      await writeFile(credentials,`username,password\n${username},${password}\n`,{mode:0o600,flag:'wx'});
      files=libraryEntry?.kind==='site'?{wiki:await validateSite(profile.wiki),credentials}:await validateFiles(profile.wiki,credentials);
    }
    if(loginToSave && !savedLogin)await saveSessionCodes(root,libraryId,loginToSave,ask);
    const network=mode==='local'?ui('Only this computer', 'Kun denne computer'):mode==='lan'?ui('Home network', 'Hjemmenetværk'):mode==='funnel'?'Funnel':'Tailscale';
    const accessText=libraryEntry?.kind==='site'?ui('Visitors can read the site. Files cannot be edited through sharing.','Besøgende kan læse hjemmesiden. Filer kan ikke redigeres gennem delingen.'):mode==='funnel'?ui('Reader and editor codes. Open in ForgeShare gives you editing access.','Læser- og redaktørkode. Åbn i ForgeShare giver dig redigeringsadgang.'):allowAnonymous?ui('No wiki login — anyone with network access can read and edit.', 'Uden wiki-login — alle med netværksadgang kan læse og redigere.'):ui('Wiki login is required.', 'Wiki-login er påkrævet.');
    const note=mode==='lan'?'\n\n'+ui('For your trusted home network. This connection uses HTTP, without encryption.', 'Til dit eget betroede hjemmenetværk. Forbindelsen bruger HTTP uden kryptering.'):mode==='tailscale'?ui(`\n\nAccess is controlled in Tailscale. Limit guests to this wiki (TCP ${profile.httpsPort}).`,`\n\nAdgangen styres i Tailscale. Begræns gæster til denne wiki (TCP ${profile.httpsPort}).`):'';
    if(!startup && !quick)await ask('confirm',`Start “${displayName}”?\n${network}\n\n${accessText}${note}`);
    if (interrupted) return;
    session = await startNamedSession(profile, {...files, boot: runtime.boot, tailscale, root, localOnly,lanHost,allowAnonymous,funnel:mode==='funnel',codeRoles:mode==='funnel',codeAccess,bridge:libraryId && libraryEntry?.kind!=='site'?{root,wikiId:libraryId}:undefined}, {
      ...deps,
      startWiki: options => { const value = startWiki(options); children.add(value.child); if (interrupted) void stopChild(value.child); return value; },
      spawn: (...args) => { const child = spawn(...args); children.add(child); if (interrupted) void stopChild(child); return child; }
    });
    if (interrupted) return;
    if(!localOnly)await rememberSharedAddress(profile.wiki,session.url,root);
    report({event:'ready',name:displayName,url:session.url,...(session.ownerUrl?{ownerUrl:session.ownerUrl}:{}),mode,access:allowAnonymous?'open':'login',...(libraryId?{id:libraryId}:{})});
    if (appMode) { await session.finished; return; }
    const statusDialog = new AbortController();
    session.finished.then(() => statusDialog.abort());
    await ask('text',`“${displayName}” — ${network}\n${accessText}\n\n${ui('Copy the address. Keep this window open; OK/Cancel stops this wiki.','Kopiér adressen. Lad vinduet stå åbent; OK/Annuller stopper denne wiki.')}`,session.url,statusDialog.signal);
  } catch (error) {
    if (session) await session.stop();
    if (!error.cancelled && !interrupted) {
      // Avoid displaying subprocess output that might contain sensitive content.
      await ask('info', ui('ForgeShare stopped. Nothing new is being shared.', 'ForgeShare stoppede. Ingen ny deling er aktiv.') + '\n\n' + (error.cmd ? ui('A required program failed. Check installation and Tailscale HTTPS setup.', 'Et nødvendigt program fejlede. Kontroller installation og Tailscale HTTPS.') : error.message));
    }
  } finally {
    if (session) await session.stop();
    for (const child of children) await stopChild(child);
    if (privateDir) await rm(privateDir, {recursive: true, force: true});
    if (appMode) { inputStream.off('data', inputData); inputStream.off('end', interrupt); inputStream.pause(); }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupt);
  }
}

function createVault(root){return new Vault({root,lock:acquireLock,library:()=>listLibrary(root)});}
async function saveSessionCodes(root,id,codes,ask){
  if(!id)return;
  const yes=ui('Save codes in vault','Gem koder i nøgleboksen'),no=ui('Only this time','Kun denne gang');
  if(await ask('choice',ui('Remember these sharing codes for invitations?','Husk delingskoderne til invitationer?'),[no,yes])===yes){await createVault(root).change(d=>{d.wikiLogins[id]=codes;});const release=await acquireLock(root,'saved-logins');try{let ids=[];const file=path.join(root,'saved-logins.json');try{ids=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(!ids.includes(id))ids.push(id);await writeFile(file,JSON.stringify(ids),{mode:0o600});}finally{await release();}}
}
async function inviteFromLibrary(root,id,ask){
  const e=(await listLibrary(root)).entries.find(e=>e.id===id);if(!e?.shareUrl)throw Error(ui('Share this wiki first.','Del først denne wiki.'));
  const comment=await ask('optional',ui('Add a comment to the invitation','Skriv en kommentar til invitationen'));
  const no=ui('Link only','Kun link'),yes=ui('Include sharing code','Medtag delingskode');let code,role,username;
  if(await ask('choice',ui('What should the email include?','Hvad skal mailen indeholde?'),[no,yes])===yes){
    const login=(await createVault(root).read()).wikiLogins[id];
    if(!login)throw Error(ui('No sharing code is saved for this wiki.','Der er ikke gemt en delingskode til denne wiki.'));
    if(e.kind==='site' && login.readerCode){code=login.readerCode;}
    else if(login.readerCode){const reader=ui('Reader','Læser'),editor=ui('Editor','Redaktør');role=await ask('choice',ui('Choose access','Vælg adgang'),[reader,editor]);code=role===reader?login.readerCode:login.editorCode;}
    else {code=login.password;username=login.username;}
  }
  const uri=invitation({name:e.name,url:e.shareUrl,comment,code,role,username,language:uiLanguage});
  await privateCommand(process.platform==='darwin'?'/usr/bin/open':process.platform==='win32'?process.env.FORGESHARE_NATIVE:'xdg-open',process.platform==='win32'?['--mail']: [uri],process.platform==='win32'?uri:'');
}
