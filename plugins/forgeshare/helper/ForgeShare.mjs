#!/usr/bin/env node
// ForgeShare 0.1.2 — optional local helper. Explicit local actions; no unsolicited browser launch or shell evaluation.
import {readFile, realpath, stat, access, mkdir, mkdtemp, writeFile, rm, rename, open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
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
const fail = (en, da) => { throw Error(`${en}\n${da}`); };
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
export function serverArgs(wiki, credentials, port = 8080) {
  return [wiki, '--listen', 'host=127.0.0.1', `port=${port}`, `credentials=${credentials}`,
    'readers=(authenticated)', 'writers=(authenticated)', 'csrf-disable=no'];
}
export function validateCredentials(text) {
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (lines.shift() !== 'username,password' || !lines.length)
    fail('Credentials need username,password and at least one account.', 'Loginfilen skal have username,password og mindst én konto.');
  const names = new Set();
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length !== 2 || !/^[A-Za-z0-9_.@-]+$/.test(parts[0]) || parts[1].length < 12 || /["\r\n\x00-\x1f]/.test(parts[1]) || names.has(parts[0]))
      fail('Invalid credentials row. Use unique simple usernames and passwords of 12+ characters without commas/quotes.', 'Ugyldig loginlinje. Brug unikke enkle brugernavne og adgangskoder på mindst 12 tegn uden komma/anførselstegn.');
    names.add(parts[0]);
  }
  return names.size;
}
export async function validateFiles(wikiInput, credentialsInput, platform = process.platform) {
  const wiki = await realpath(wikiInput), credentials = await realpath(credentialsInput);
  const relative = path.relative(wiki, credentials);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
    fail('Keep credentials outside the wiki folder.', 'Opbevar loginfilen uden for wikimappen.');
  const info = JSON.parse(await readFile(path.join(wiki, 'tiddlywiki.info'), 'utf8'));
  for (const plugin of ['tiddlywiki/tiddlyweb', 'tiddlywiki/filesystem'])
    if (!info.plugins?.includes(plugin)) fail('Server wiki is missing ' + plugin, 'Serverwikien mangler ' + plugin);
  const attrs = await stat(credentials);
  if (!attrs.isFile() || attrs.size > 1024 * 1024) fail('Invalid credentials file.', 'Ugyldig loginfil.');
  if (platform !== 'win32' && ((attrs.mode & 0o077) || attrs.uid !== process.getuid()))
    fail('Credentials must be owned by you with permissions 600. Run chmod 600 on that file.', 'Loginfilen skal ejes af dig med rettighed 600. Kør chmod 600 på filen.');
  validateCredentials(await readFile(credentials, 'utf8'));
  return {wiki, credentials};
}
export function checkPort(port = 8080, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => reject(Object.assign(Error(`Port ${port} is in use or unavailable / er optaget eller utilgængelig. No existing process was stopped / Ingen eksisterende proces blev stoppet.`), {code: error.code})));
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
      else reject(Error(`An existing service uses address ${port}. / En eksisterende tjeneste bruger adressen ${port}.`));
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
        if (!Number.isInteger(value) || value < 1 || value > 65535) throw Error('Unknown Serve port / Ukendt Serve-port.');
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
  if (!object(data) || data.version !== 1 || !Array.isArray(data.wikis)) throw Error('Unknown wiki list format / Ukendt format i wikilisten.');
  const ids = new Set(), names = new Set(), folders = new Set(), ports = new Set();
  for (const entry of data.wikis) {
    if (!object(entry) || Object.keys(entry).some(key => !['id', 'name', 'wiki', 'port', 'httpsPort'].includes(key)) ||
        !/^[a-f0-9-]{36}$/.test(entry.id) || typeof entry.name !== 'string' ||
        !entry.name.trim() || entry.name.length > 80 || /[\x00-\x1f\x7f]/.test(entry.name) ||
        typeof entry.wiki !== 'string' || !path.isAbsolute(entry.wiki) ||
        !Number.isInteger(entry.port) || entry.port < localRange[0] || entry.port > localRange[1] ||
        !Number.isInteger(entry.httpsPort) || entry.httpsPort < shareRange[0] || entry.httpsPort > shareRange[1] ||
        ids.has(entry.id) || names.has(profileKey(entry.name)) || folders.has(wikiKey(entry.wiki)) || ports.has(entry.port) || ports.has(entry.httpsPort))
      throw Error('Invalid or duplicate wiki entry. Wiki list was not changed. / Ugyldig eller gentaget wiki. Wikilisten blev ikke ændret.');
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
  throw Error('This wiki is already running, or another helper is setting up. Use its status window, or try again shortly. / Wikien kører allerede, eller en anden hjælper er ved at starte. Brug dens statusvindue, eller prøv igen om lidt.');
}
export async function registerWiki({root = appFolder(), wiki: input, name, tailscale, localOnly=false}, deps = {}) {
  const wiki = await realpath(input);
  const release = await acquireLock(root, 'catalog');
  try {
    const registry = await readRegistry(root);
    const existing = registry.wikis.find(entry => wikiKey(entry.wiki) === wikiKey(wiki));
    if (existing) return existing;
    const info = JSON.parse(await readFile(path.join(wiki, 'tiddlywiki.info'), 'utf8'));
    for (const plugin of ['tiddlywiki/tiddlyweb', 'tiddlywiki/filesystem']) if (!info.plugins?.includes(plugin)) throw Error('Prepare this server wiki first / Forbered først denne serverwiki.');
    const entry = {id: randomUUID(), name: name.trim().normalize('NFC'), wiki, port: localRange[0], httpsPort: shareRange[0]};
    // Validate the name before probing/allocating; real allocations follow below.
    validateRegistry({version: 1, wikis: [entry]});
    if (registry.wikis.some(item => profileKey(item.name) === profileKey(entry.name))) throw Error('Choose a different wiki name / Vælg et andet wikinavn.');
    const config = localOnly ? {} : await (deps.readJSON || jsonCommand)(tailscale, ['serve', 'status', '--json']);
    const used = usedServePorts(config);
    for (const item of registry.wikis) { used.add(item.port); used.add(item.httpsPort); }
    const check = deps.checkAddressPort || checkAddressPort;
    async function choose([first, last]) {
      for (let candidate = first; candidate <= last; candidate++) {
        if (used.has(candidate)) continue;
        try { await check(candidate); used.add(candidate); return candidate; } catch {}
      }
      throw Error('No free address was found. No services changed. / Ingen ledig adresse fundet. Ingen tjenester ændret.');
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
      throw Error('Wiki selection changed. Choose it again. / Wikivalget er ændret. Vælg igen.');
    const session = await (deps.startSession || startSession)({...options, ...profile}, deps);
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
  const candidates = [];
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
export function startWiki({boot, wiki, credentials, port = 8080}) {
  const child = fork(self, ['--worker', boot, ...serverArgs(wiki, credentials, port)], {stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit', 'ipc']});
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(Error('Server start timed out / Serverstart tog for lang tid.')), 30000);
    const done = (error, address) => { clearTimeout(timer); child.off('message', message); child.off('error', errorEvent); child.off('exit', exitEvent); error ? reject(error) : resolve(address); };
    const message = data => { if (data?.type === 'listening') done(null, data.address); };
    const errorEvent = error => done(error);
    const exitEvent = () => done(Error('Wiki stopped before listening / Wikien stoppede før opstart.'));
    child.on('message', message); child.once('error', errorEvent); child.once('exit', exitEvent);
  });
  return {child, ready};
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
  const port=options.port;
  await (deps.checkPort||checkAddressPort)(port);
  const started=(deps.startWiki||startWiki)(options),child=started.child;
  let stopping;const stop=()=>stopping ||= stopChild(child);
  try {
    const address=await started.ready;
    if(address.address!=='127.0.0.1' || address.port!==port)throw Error('Unexpected local address / Uventet lokal adresse.');
    const status=await (deps.probe||(()=>fetch(`http://127.0.0.1:${port}/status`,{signal:AbortSignal.timeout(5000)}).then(r=>r.status)))();
    if(status!==401)fail('Local wiki login check failed.', 'Kontrol af lokalt wiki-login fejlede.');
    if(child.exitCode!==null || child.signalCode!==null)throw Error('Wiki stopped / Wikien stoppede.');
    const finished=new Promise(resolve=>child.once('exit',resolve));
    return {url:`http://127.0.0.1:${port}`,stop,finished};
  }catch(error){await stop();throw error;}
}
export async function startSession(options, deps = {}) {
  if(options.localOnly)return startLocalSession(options,deps);
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
  let server, serve, closed = false, stopping;
  const stop = () => {
    if (stopping) return stopping;
    closed = true;
    stopping = (async () => {
    // End foreground Serve first so nothing can be exposed after stopping our wiki.
    await stopChild(serve);
    await stopChild(server);
    })();
    return stopping;
  };
  try {
    const started = startServer(options); server = started.child;
    const address = await started.ready;
    if (closed || address.address !== '127.0.0.1' || address.port !== port) throw Error('Unexpected server address / Uventet serveradresse.');
    if (await probe() !== 401) fail('Anonymous access is not blocked. Sharing refused.', 'Anonym adgang er ikke blokeret. Deling afvist.');
    // Recheck immediately before Serve. No --yes: concurrent changes cannot be silently approved.
    const current = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']), true, httpsPort);
    if (JSON.stringify(protectedConfig(before, httpsPort)) !== JSON.stringify(protectedConfig(current, httpsPort))) throw Error('Serve changed during startup / Serve blev ændret under start.');
    serve = startServe(options.tailscale, makeServeArgs(port, httpsPort), {stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'], windowsHide: true});
    let serveError;
    serve.once('error', error => { serveError = error; });
    for (let attempt = 0; attempt < 40; attempt++) {
      if (serveError) throw serveError;
      if (serve.exitCode !== null || serve.signalCode !== null || server.exitCode !== null || server.signalCode !== null)
        fail('A process stopped. Check prerequisites and HTTPS setup.', 'En proces stoppede. Kontroller programmer og HTTPS-opsætning.');
      const after = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']), false, httpsPort);
      if (JSON.stringify(protectedConfig(before, httpsPort)) !== JSON.stringify(protectedConfig(after, httpsPort)))
        fail('Unrelated Serve settings changed; stopping our processes without restoring someone else’s settings.', 'Andre Serve-indstillinger blev ændret; stopper egne processer uden at overskrive andres opsætning.');
      if (hasWikiRoute(after, hostname, port, httpsPort)) {
        const finished = new Promise(resolve => {
          const exit = () => { stop().then(resolve); };
          server.once('exit', exit); serve.once('exit', exit);
        });
        return {url: `https://${hostname}:${httpsPort}`, stop, finished};
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
  try { const u=new URL(value);return u.protocol==='https:' && /^[a-z0-9.-]+\.ts\.net$/i.test(u.hostname) && !u.username && !u.password && !u.search && !u.hash && (u.pathname==='/' || !u.pathname); } catch {return false;}
}
export function validateLibrary(data) {
  if(!object(data) || data.version!==1 || !uuidPattern.test(data.id) || !Array.isArray(data.entries) || data.entries.length>500)
    fail('Unknown wiki library format. Nothing changed.', 'Ukendt format i wikibiblioteket. Intet ændret.');
  const ids=new Set(),locations=new Set(),names=new Set();
  for(const e of data.entries) {
    if(!object(e) || Object.keys(e).some(k=>!['id','name','kind','location','description','shareUrl'].includes(k)) ||
       !uuidPattern.test(e.id) || !['html','folder'].includes(e.kind) || typeof e.location!=='string' || !path.isAbsolute(e.location) ||
       ids.has(e.id) || locations.has(wikiKey(e.location)) || names.has(profileKey(e.name || '')) ||
       (e.shareUrl && !validShareURL(e.shareUrl)))fail('Invalid wiki library entry. Nothing changed.', 'Ugyldig post i wikibiblioteket. Intet ændret.');
    cleanLabel(e.name);cleanLabel(e.description,500,true);
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
    data.entries.push({id:p.id,name,kind:'folder',location:p.wiki,description:''});
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
  return libraryTransaction(root,async data=>({id:data.id,entries:await Promise.all(data.entries.map(async entry=>{
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
export function libraryExport(library,selected,{includeAddresses=false,now=new Date()}={}) {
  if(!Array.isArray(selected) || !selected.length || new Set(selected).size!==selected.length || selected.some(id=>!library.entries.some(e=>e.id===id)))
    fail('Select at least one wiki from the list.', 'Vælg mindst én wiki fra listen.');
  const snapshot=now.toISOString(),modified=snapshot.replace(/[-:TZ.]/g,''), prefix='ForgeShare/Wiki/';
  const entries=selected.map(id=>library.entries.find(e=>e.id===id));
  const tiddlers=entries.map(e=>({title:prefix+e.id,caption:e.name,type:'text/plain',text:e.description,
    tags:'[[ForgeShare wikibibliotek]]',modified,'forgeshare-name':e.name,'forgeshare-description':e.description,
    'forgeshare-kind':e.kind,'forgeshare-snapshot':snapshot,
    'forgeshare-address':includeAddresses && validShareURL(e.shareUrl)?e.shareUrl:''}));
  // All user text remains in inert fields, never interpolated as wikitext/code.
  const da='[{$:/language}get[name]lowercase[]regexp[^da(-|$)]] [{$:/language}match[$:/languages/huwiki-da-DK]] [{$:/language}removeprefix[$:/languages/]lowercase[]regexp[^da(-|$)]] [{$:/language}match[da]] +[limit[1]count[]]';
  const label=(d,e)=>`<$text text={{{ [<danish>match[1]then[${d}]else[${e}]] }}}/>`;
  tiddlers.unshift({title:'ForgeShare/Library/'+library.id,caption:'Mine wikier / My wikis',type:'text/vnd.tiddlywiki',modified,
    list:entries.map(e=>'[['+prefix+e.id+']]').join(' '),'forgeshare-snapshot':snapshot,
    text:`<$let danish={{{ ${da} }}} exportIndex="ForgeShare/Library/${library.id}">\n\n<h2>${label('Mine wikier','My wikis')}</h2>\n<p>${label('Eksporteret','Exported')}: <$text text={{{ [<exportIndex>get[forgeshare-snapshot]] }}}/></p>\n<p>${label('Dette er en valgt oversigt. Adresser er sidst kendte adresser; driftsstatus opdateres ikke automatisk.','This is a selected snapshot. Addresses are last known addresses; running status is not updated automatically.')}</p>\n\n<$list filter="[list<exportIndex>]">\n\n<div style="border-top:1px solid #ccc;padding:1em 0">\n<strong><$link><$text text={{!!forgeshare-name}}/></$link></strong>\n<p><$text text={{!!forgeshare-description}}/></p>\n<$list filter="[<currentTiddler>has[forgeshare-address]]" variable="entry"><a href={{!!forgeshare-address}} target="_blank" rel="noopener noreferrer">${label('Åbn delingsadresse','Open shared address')}</a></$list>\n</div>\n</$list>\n\n</$let>`});
  return tiddlers;
}
export async function writeLibraryExport(filename,library,ids,options={}) {
  if(!/\.json$/i.test(filename))fail('Save the overview as a .json file.', 'Gem oversigten som en .json-fil.');
  const content=JSON.stringify(libraryExport(library,ids,options),null,2)+'\n';
  // Exclusive creation avoids overwriting an existing wiki/export by surprise.
  await writeFile(filename,content,{flag:'wx',mode:0o600});
}
export async function libraryMain(action,encoded='',deps={}) {
  const root=deps.root||appFolder(),ask=deps.dialog||dialog;
  const report=deps.report||(value=>process.stdout.write(JSON.stringify(value)+'\n'));
  try {
    if(action==='list'){report(await listLibrary(root));return;}
    const input=encoded?JSON.parse(Buffer.from(encoded,'base64').toString('utf8')):{};
    if(action==='add') {
      const choice=await ask('choice','Add a wiki / Tilføj en wiki',['HTML file / HTML-fil','Wiki folder / Wikimappe']);
      const kind=choice.startsWith('HTML')?'html':'folder';
      const location=await ask(kind==='html'?'file':'folder','Choose your wiki / Vælg din wiki');
      const name=await ask('text','Wiki name / Wikinavn',path.basename(location).replace(/\.html?$/i,''));
      await addLibraryEntry({root,location,name,kind});
    } else if(action==='edit') {
      const entry=(await listLibrary(root)).entries.find(e=>e.id===input.id);if(!entry)fail('Wiki not found.', 'Wikien blev ikke fundet.');
      const name=await ask('text','Wiki name / Wikinavn',entry.name);
      const description=await ask('optional','Short description (optional) / Kort beskrivelse (valgfri)',entry.description);
      await editLibraryEntry(entry.id,{name,description},root);
    } else if(action==='export') {
      const library=await listLibrary(root);libraryExport(library,input.ids);
      const choice=await ask('choice','What should the overview include? No file paths or passwords are exported.\nHvad skal oversigten indeholde? Filstier og adgangskoder kommer aldrig med.',['Names and descriptions / Navne og beskrivelser','Also last shared addresses / Også seneste delingsadresser']);
      const includeAddresses=choice.startsWith('Also');
      await ask('confirm','Export only these wikis / Eksportér kun disse wikier:\n\n'+input.ids.map(id=>library.entries.find(e=>e.id===id).name).join('\n'));
      const destination=await ask('save','Save a NEW overview file / Gem en NY oversigtsfil','ForgeShare-wikier.json');
      await writeLibraryExport(destination,library,input.ids,{includeAddresses});
      await ask('info','Overview saved. Drag the JSON file into your wiki, review the import and choose Import. Open “Mine wikier / My wikis”.\n\nOversigten er gemt. Træk JSON-filen ind i din wiki, gennemse importen, og vælg Importér. Åbn “Mine wikier / My wikis”.');
    } else if(action==='menu') {
      const library=await listLibrary(root),add='＋ Add a wiki / Tilføj en wiki',exp='Export selected overview / Eksportér valgt oversigt';
      const picked=await ask('choice','Wiki library / Wikibibliotek',[add,exp,...library.entries.map(e=>'Wiki: '+e.name)]);
      if(picked===add)return libraryMain('add','',deps);
      if(picked===exp){const names=(await ask('choices','Select wikis to export / Vælg wikier til eksport',library.entries.map(e=>e.name))).split('\n');const ids=library.entries.filter(e=>names.includes(e.name)).map(e=>e.id);return libraryMain('export',Buffer.from(JSON.stringify({ids})).toString('base64'),deps);}
      const entry=library.entries.find(e=>'Wiki: '+e.name===picked);if(!entry)return;
      const op=await ask('choice',entry.name,['Open / Åbn','Edit name/description / Redigér navn/beskrivelse',...(entry.kind==='folder'?['Share with Tailscale / Del med Tailscale']:[])]);
      if(op.startsWith('Edit'))return libraryMain('edit',Buffer.from(JSON.stringify({id:entry.id})).toString('base64'),deps);
      if(entry.kind==='html'){await (deps.openFile || (file=>execute('xdg-open',[file])))(entry.location);return;}
      return guiMain({...deps,libraryId:entry.id,localOnly:op.startsWith('Open')});
    } else fail('Unknown library action.', 'Ukendt biblioteksfunktion.');
    report({ok:true});
  } catch(error) {
    if(error.cancelled){report({cancelled:true});return;}
    if(action==='list')throw error;
    await ask('info',error.code==='EEXIST'?'Choose a new file name. The existing file was not replaced.\nVælg et nyt filnavn. Den eksisterende fil blev ikke overskrevet.':error.message);
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
  if (process.argv[2] === '--worker') worker();
  else (process.argv.includes('--library') ? libraryMain(process.argv[process.argv.indexOf('--library')+1],process.argv[process.argv.indexOf('--library')+2]) : quiet ? guiMain() : main()).catch(error => { console.error('\nForgeShare stopped / stoppet:\n' + error.message); process.exitCode = 1; });
}

// Native dialogs keep the ordinary flow out of the terminal. Arguments are data,
// never interpolated into shell commands. No browser or website is opened.
export function dialogCommand(platform, kind, message, initial = '') {
  if (platform === 'darwin') {
    const actions = {
      save: 'return POSIX path of (choose file name with prompt (item 1 of argv) default name (item 2 of argv))',
      optional: 'return text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) with title "ForgeShare")',
      folder: 'return POSIX path of (choose folder with prompt (item 1 of argv))',
      file: 'return POSIX path of (choose file with prompt (item 1 of argv) of type {"html"})',
      text: 'return text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) with title "ForgeShare")',
      password: 'return text returned of (display dialog (item 1 of argv) default answer "" with hidden answer with title "ForgeShare")',
      confirm: 'display dialog (item 1 of argv) buttons {"Cancel / Annuller", "Continue / Fortsæt"} default button 2 cancel button 1 with title "ForgeShare"',
      info: 'display dialog (item 1 of argv) buttons {"OK"} default button 1 with title "ForgeShare"',
      choice: 'set picked to choose from list (items 2 thru -1 of argv) with prompt (item 1 of argv) with title "ForgeShare"\nif picked is false then error number -128\nreturn item 1 of picked'
    };
    return ['/usr/bin/osascript', ['-e', `on run argv\n${actions[kind]}\nend run`, '--', message, ...(kind === 'choice' ? initial : [initial])]];
  }
  if (platform === 'win32') {
    // Base64 JSON carries arbitrary paths/text without PowerShell quoting/injection.
    const data = Buffer.from(JSON.stringify({kind, message, initial})).toString('base64');
    const script = `$env:PSModulePath=$PSHOME+'\\Modules'; $ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName Microsoft.VisualBasic
$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
[Console]::OutputEncoding = [Text.Encoding]::UTF8
switch ($d.kind) {
 'choice' { $f=New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.Width=570; $f.Height=400; $f.StartPosition='CenterScreen'; $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(15,15,520,60); $list=New-Object Windows.Forms.ListBox; $list.SetBounds(15,80,520,220); foreach ($item in $d.initial) { [void]$list.Items.Add([string]$item) }; $list.SelectedIndex=0; $b=New-Object Windows.Forms.Button; $b.Text='OK'; $b.SetBounds(430,315,100,30); $b.DialogResult='OK'; $f.Controls.AddRange(@($l,$list,$b)); $f.AcceptButton=$b; if ($f.ShowDialog() -ne 'OK' -or $null -eq $list.SelectedItem) { exit 2 }; Write-Output $list.SelectedItem }
 'save' { $p=New-Object Windows.Forms.SaveFileDialog; $p.Title=$d.message; $p.Filter='Wiki overview|*.json'; $p.FileName=$d.initial; $p.DefaultExt='json'; if($p.ShowDialog() -ne 'OK') {exit 2}; Write-Output $p.FileName }
 'optional' { $f=New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.Width=540; $f.Height=200; $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(15,15,490,40); $t=New-Object Windows.Forms.TextBox; $t.Text=$d.initial; $t.SetBounds(15,60,490,25); $b=New-Object Windows.Forms.Button; $b.Text='OK'; $b.SetBounds(400,100,100,30); $b.DialogResult='OK'; $f.Controls.AddRange(@($l,$t,$b)); $f.AcceptButton=$b; if($f.ShowDialog() -ne 'OK') {exit 2}; Write-Output $t.Text }
 'folder' { $p = New-Object Windows.Forms.FolderBrowserDialog; $p.Description = $d.message; if ($p.ShowDialog() -ne 'OK') { exit 2 }; Write-Output $p.SelectedPath }
 'file' { $p = New-Object Windows.Forms.OpenFileDialog; $p.Title = $d.message; $p.Filter = 'TiddlyWiki HTML|*.html;*.htm'; if ($p.ShowDialog() -ne 'OK') { exit 2 }; Write-Output $p.FileName }
 'text' { $v = [Microsoft.VisualBasic.Interaction]::InputBox($d.message, 'ForgeShare', $d.initial); if (!$v) { exit 2 }; Write-Output $v }
 'password' { $f = New-Object Windows.Forms.Form; $f.Text='ForgeShare'; $f.Width=540; $f.Height=240; $f.StartPosition='CenterScreen'; $l=New-Object Windows.Forms.Label; $l.Text=$d.message; $l.SetBounds(15,15,490,80); $t=New-Object Windows.Forms.TextBox; $t.UseSystemPasswordChar=$true; $t.SetBounds(15,100,490,25); $b=New-Object Windows.Forms.Button; $b.Text='OK'; $b.SetBounds(400,140,100,30); $b.DialogResult='OK'; $f.Controls.AddRange(@($l,$t,$b)); $f.AcceptButton=$b; if ($f.ShowDialog() -ne 'OK') { exit 2 }; Write-Output $t.Text }
 'confirm' { if ([Windows.Forms.MessageBox]::Show($d.message,'ForgeShare','OKCancel') -ne 'OK') { exit 2 } }
 'info' { [void][Windows.Forms.MessageBox]::Show($d.message,'ForgeShare') }
}`;
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]];
  }
  if (platform === 'linux') {
    const common = ['--title=ForgeShare'];
    const flags = {
      choices: ['--list','--checklist','--separator=\n','--text='+message,'--column=','--column=Wiki','--height=400',...(Array.isArray(initial)?initial:[]).flatMap(name=>['FALSE',name])],
      choice: ['--list', '--text=' + message, '--column=Wiki', '--height=400', ...(Array.isArray(initial) ? initial : [])],
      save: ['--file-selection','--save','--filename='+initial,'--title='+message],
      optional: ['--entry','--text='+message,'--entry-text='+initial],
      folder: ['--file-selection', '--directory', '--title=' + message],
      file: ['--file-selection', '--file-filter=Wiki | *.html *.htm', '--title=' + message],
      text: ['--entry', '--text=' + message, '--entry-text=' + initial],
      password: ['--entry', '--hide-text', '--text=' + message],
      confirm: ['--question', '--text=' + message, '--ok-label=Continue / Fortsæt', '--cancel-label=Cancel / Annuller'],
      info: ['--info', '--text=' + message]
    };
    return ['zenity', [...common, ...flags[kind]]];
  }
  throw Error('Supported systems: Mac, Windows, Linux / Understøttede systemer: Mac, Windows, Linux.');
}
export async function dialog(kind, message, initial = '', signal) {
  const [command, args] = dialogCommand(process.platform, kind, message, initial);
  try {
    const {stdout} = await execute(command, args, {maxBuffer: 65536, windowsHide: true, signal});
    return stdout.trimEnd();
  } catch (error) {
    if (error.code === 'ENOENT') throw Error('Graphical dialogs are unavailable. On Linux, install Zenity using your software manager. / Grafiske dialoger mangler. På Linux installeres Zenity via programbutikken.');
    const cancelled = error.name === 'AbortError' ||
      (process.platform === 'win32' && error.code === 2) ||
      (process.platform === 'darwin' && String(error.stderr).includes('(-128)')) ||
      (process.platform === 'linux' && error.code === 1);
    if (cancelled) throw Object.assign(Error('Cancelled / Annulleret'), {cancelled: true});
    throw new Error('Could not display the dialog. / Kunne ikke vise dialogboksen.', {cause: error});
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
  await ask('confirm', 'TiddlyWiki is needed to run your wiki. Download and install tested version 5.4.1 here?\n\nTiddlyWiki skal bruges til at køre din wiki. Hent og installer den testede version 5.4.1 her?\n\n' + destination + '\n\nRequires internet. No global installation; no install scripts. / Kræver internet. Ingen global installation eller installationsscripts.');
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
      throw new Error('Could not protect your login file. Nothing shared.\nKunne ikke beskytte din loginfil. Intet delt.', {cause});
    }
  }
  return directory;
}
export async function guiMain(deps = {}) {
  const shutdown = new AbortController();
  const ask = (kind, message, initial = '', signal = shutdown.signal) => (deps.dialog || dialog)(kind, message, initial, signal);
  const root = deps.root || appFolder();
  const localOnly=deps.localOnly ?? process.argv.includes('--local');
  const libraryId=deps.libraryId || (process.argv.includes('--profile')?process.argv[process.argv.indexOf('--profile')+1]:null);
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
    await ask('confirm', localOnly ? 'Open this wiki only on your computer. A temporary login protects it from other local users.\nÅbn kun wikien på denne computer. Et midlertidigt login beskytter den mod andre lokale brugere.' : 'Choose a wiki to share privately. Open this helper again to run another wiki alongside it. Your computer must stay on. Nothing is shared until the final confirmation.\n\nVælg en wiki til privat deling. Åbn hjælperen igen for at køre endnu en wiki samtidig. Computeren skal forblive tændt. Intet deles før sidste bekræftelse.');
    if (Number(process.versions.node.split('.')[0]) < 20) fail('Install Node.js 20 or later.', 'Installer Node.js 20 eller nyere.');
    const tailscale = localOnly ? undefined : await (deps.findTailscale || findTailscale)();
    const installed = await (deps.findTiddlyWiki || findTiddlyWiki)();
    const runtime = installed ? await validateRuntime(installed) : await (deps.installRuntime || installRuntime)(ask);
    const libraryEntry=libraryId?(await listLibrary(root)).entries.find(e=>e.id===libraryId):null;
    if(libraryId && (!libraryEntry || libraryEntry.kind!=='folder'))fail('Choose a server wiki folder.', 'Vælg en serverwikimappe.');
    const choices = (await readRegistry(root)).wikis;
    const add = '＋ Add another wiki / Tilføj en wiki';
    const picked = libraryEntry ? '' : choices.length ? await ask('choice', 'Choose your wiki / Vælg din wiki', [...choices.map(item => 'Wiki: ' + item.name), add]) : add;
    let profile = libraryEntry ? await registerWiki({root,wiki:libraryEntry.location,name:libraryEntry.name,tailscale,localOnly},deps) : choices.find(item => 'Wiki: ' + item.name === picked);
    if (!profile && picked !== add) throw Error('Unknown wiki selection / Ukendt wikivalg.');
    if (!profile) {
      const wiki = await realpath(await ask('folder', 'Choose the prepared wiki folder / Vælg den forberedte wikimappe'));
      try { await access(path.join(wiki, 'tiddlywiki.info')); }
      catch { fail('This is not a prepared wiki folder. Follow “First setup” in ForgeShare; an HTML file must first be copied into a server wiki.', 'Dette er ikke en forberedt wikimappe. Følg “Første opsætning” i ForgeShare; en HTML-fil skal først kopieres til en serverwiki.'); }
      const name = await ask('text', 'Give this wiki a name, for example Family or Garden.\nGiv wikien et navn, for eksempel Familie eller Have.', path.basename(wiki));
      profile = await registerWiki({root, wiki, name, tailscale, localOnly}, deps);
    }
    const displayName=libraryEntry?.name||profile.name;
    report({event:'selected',name:displayName,...(libraryId?{id:libraryId}:{})});
    const username = await ask('text', localOnly ? 'Choose a local wiki login / Vælg et lokalt wiki-login' : 'Choose the login name for this session.\nVælg brugernavn til denne deling.', 'wiki');
    const password = await ask('password', localOnly ? 'Choose a password of 12+ characters for the local wiki.\nVælg en adgangskode på mindst 12 tegn til den lokale wiki.' : 'Choose a password of 12+ characters. Share it privately with your collaborator.\nVælg en adgangskode på mindst 12 tegn. Giv den privat til din samarbejdspartner.');
    const confirm = await ask('password', 'Repeat the password / Gentag adgangskoden');
    if (password !== confirm) fail('Passwords did not match. Please start again.', 'Adgangskoderne var forskellige. Start igen.');
    validateCredentials(`username,password\n${username},${password}\n`);
    privateDir = await privateSessionDirectory();
    const credentials = path.join(privateDir, 'login.csv');
    await writeFile(credentials, `username,password\n${username},${password}\n`, {mode: 0o600, flag: 'wx'});
    const files = await validateFiles(profile.wiki, credentials);
    await ask('confirm', localOnly ? `Open “${displayName}” only on this computer? No Tailscale sharing will start.\nÅbn “${displayName}” kun på denne computer? Der startes ingen Tailscale-deling.` : `Start sharing “${profile.name}”?\nStart deling af “${profile.name}”?\n\n${profile.wiki}\n\nPeople allowed by your Tailscale rules AND this login can read and edit. Limit guest access to this wiki first (access-rule reference: TCP ${profile.httpsPort}). Existing services stay unchanged.\n\nPersoner med Tailscale-adgang OG dette login kan læse og redigere. Begræns først gæsters adgang til denne wiki (til adgangsreglen: TCP ${profile.httpsPort}). Eksisterende tjenester bevares.\n\nNo browser opens automatically. / Ingen browser åbnes automatisk.`);
    if (interrupted) return;
    session = await startNamedSession(profile, {...files, boot: runtime.boot, tailscale, root, localOnly}, {
      ...deps,
      startWiki: options => { const value = startWiki(options); children.add(value.child); if (interrupted) void stopChild(value.child); return value; },
      spawn: (...args) => { const child = spawn(...args); children.add(child); if (interrupted) void stopChild(child); return child; }
    });
    if (interrupted) return;
    if(!localOnly)await rememberSharedAddress(profile.wiki,session.url,root);
    report({event:'ready',name:displayName,url:session.url,...(libraryId?{id:libraryId}:{})});
    if (appMode) { await session.finished; return; }
    const statusDialog = new AbortController();
    session.finished.then(() => statusDialog.abort());
    await ask('text', localOnly ? `“${displayName}” — local wiki. Copy the address. OK/Cancel stops this wiki.\nLokal wiki. Kopiér adressen. OK/Annuller stopper wikien.` : `“${profile.name}” — sharing is active. Copy this address and leave this window open. OK/Cancel stops ONLY this wiki. Open the helper again to start another.\n\n“${profile.name}” — deling er aktiv. Kopiér adressen, og lad vinduet stå åbent. OK/Annuller stopper KUN denne wiki. Åbn hjælperen igen for at starte endnu en.\n\nThe other person needs Tailscale and the login.\nDen anden skal bruge Tailscale og login.`, session.url, statusDialog.signal);
  } catch (error) {
    if (session) await session.stop();
    if (!error.cancelled && !interrupted) {
      // Avoid displaying subprocess output that might contain sensitive content.
      await ask('info', 'ForgeShare stopped. Nothing new is being shared.\nForgeShare stoppede. Ingen ny deling er aktiv.\n\n' + (error.cmd ? 'A required program failed. Check installation and Tailscale HTTPS setup. / Et nødvendigt program fejlede. Kontroller installation og Tailscale HTTPS.' : error.message));
    }
  } finally {
    if (session) await session.stop();
    for (const child of children) await stopChild(child);
    if (privateDir) await rm(privateDir, {recursive: true, force: true});
    if (appMode) { inputStream.off('data', inputData); inputStream.off('end', interrupt); inputStream.pause(); }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupt);
  }
}
