#!/usr/bin/env node
// ForgeShare 0.1.0-test.1 — optional local helper. No install, browser launch or shell evaluation.
import {readFile, realpath, stat, access, mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
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
const fail = (en, da) => { throw Error(`${en}\n${da}`); };
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateServe(config, requireFree = true) {
  if (!object(config)) fail('Unrecognised Serve status; nothing started.', 'Ukendt Serve-status; intet startet.');
  const allowed = ['TCP', 'Web', 'AllowFunnel', 'Foreground', 'Services', 'ETag'];
  for (const [key, value] of Object.entries(config)) {
    if (!allowed.includes(key)) fail('Unknown Serve configuration field: ' + key, 'Ukendt felt i Serve-konfigurationen.');
    if (key === 'ETag') continue;
    if (value === null) continue;
    if (!object(value)) fail('Invalid Serve configuration.', 'Ugyldig Serve-konfiguration.');
    if (key === 'Foreground' || key === 'Services') {
      for (const nested of Object.values(value)) validateServe(nested, requireFree);
    } else {
      for (const [entry, setting] of Object.entries(value)) {
        if (key === 'AllowFunnel' && typeof setting !== 'boolean') fail('Invalid Funnel status.', 'Ugyldig Funnel-status.');
        if (key !== 'AllowFunnel' && !object(setting)) fail('Invalid Serve handler.', 'Ugyldig Serve-handler.');
        if ((entry === '10000' || entry.endsWith(':10000')) && (requireFree || (key === 'AllowFunnel' && setting)))
          fail('Port 10000 is already configured or publicly exposed. Inspect tailscale serve status.', 'Port 10000 er allerede konfigureret eller offentligt eksponeret. Se tailscale serve status.');
      }
    }
  }
  return config;
}

// Ignore only our reserved port and empty maps; compare all unrelated configuration.
export function protectedConfig(value) {
  if (!object(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'ETag' || key === '10000' || key.endsWith(':10000')) continue;
    const nested = protectedConfig(value[key]);
    if (nested !== null && (!object(nested) || Object.keys(nested).length)) result[key] = nested;
  }
  return result;
}
export function hasWikiRoute(config, hostname) {
  return Object.values(config.Foreground || {}).some(item =>
    item.TCP?.['10000']?.HTTPS === true &&
    item.Web?.[hostname + ':10000']?.Handlers?.['/']?.Proxy === 'http://127.0.0.1:8080');
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
export function checkPort(port = 8080) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(Error(`Port ${port} is in use / er optaget. No existing process was stopped / Ingen eksisterende proces blev stoppet.`)));
    server.listen({host: '127.0.0.1', port, exclusive: true}, () => server.close(resolve));
  });
}
async function jsonCommand(executable, args) {
  const {stdout} = await execute(executable, args, {timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true});
  return JSON.parse(stdout);
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
export async function startSession(options, deps = {}) {
  const readJSON = deps.readJSON || jsonCommand;
  const startServer = deps.startWiki || startWiki;
  const startServe = deps.spawn || spawn;
  const portCheck = deps.checkPort || checkPort;
  const probe = deps.probe || (async () => (await fetch('http://127.0.0.1:8080/status', {signal: AbortSignal.timeout(5000)})).status);
  const before = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']));
  const status = await readJSON(options.tailscale, ['status', '--json']);
  const hostname = status.Self?.DNSName?.replace(/\.$/, '');
  if (status.BackendState !== 'Running' || !hostname || !/^[a-z0-9.-]+\.ts\.net$/i.test(hostname))
    fail('Sign in to Tailscale and configure MagicDNS/HTTPS first.', 'Log ind i Tailscale og konfigurer MagicDNS/HTTPS først.');
  await portCheck();
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
    if (closed || address.address !== '127.0.0.1' || address.port !== 8080) throw Error('Unexpected server address / Uventet serveradresse.');
    if (await probe() !== 401) fail('Anonymous access is not blocked. Sharing refused.', 'Anonym adgang er ikke blokeret. Deling afvist.');
    // Recheck immediately before Serve. No --yes: concurrent changes cannot be silently approved.
    const current = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']));
    if (JSON.stringify(protectedConfig(before)) !== JSON.stringify(protectedConfig(current))) throw Error('Serve changed during startup / Serve blev ændret under start.');
    serve = startServe(options.tailscale, serveArgs, {stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'], windowsHide: true});
    let serveError;
    serve.once('error', error => { serveError = error; });
    for (let attempt = 0; attempt < 40; attempt++) {
      if (serveError) throw serveError;
      if (serve.exitCode !== null || serve.signalCode !== null || server.exitCode !== null || server.signalCode !== null)
        fail('A process stopped. Check prerequisites and HTTPS setup.', 'En proces stoppede. Kontroller programmer og HTTPS-opsætning.');
      const after = validateServe(await readJSON(options.tailscale, ['serve', 'status', '--json']), false);
      if (JSON.stringify(protectedConfig(before)) !== JSON.stringify(protectedConfig(after)))
        fail('Unrelated Serve settings changed; stopping our processes without restoring someone else’s settings.', 'Andre Serve-indstillinger blev ændret; stopper egne processer uden at overskrive andres opsætning.');
      if (hasWikiRoute(after, hostname)) {
        const finished = new Promise(resolve => {
          const exit = () => { stop().then(resolve); };
          server.once('exit', exit); serve.once('exit', exit);
        });
        return {url: `https://${hostname}:10000`, stop, finished};
      }
      await sleep(250);
    }
    fail('Serve did not become ready. Enable HTTPS using the official Tailscale setup.', 'Serve blev ikke klar. Aktiver HTTPS via Tailscales officielle opsætning.');
  } catch (error) { await stop(); throw error; }
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
    const wikiInput = inputPath(await readline.question('Server wiki folder / Serverwikimappe: '));
    const credentialsInput = inputPath(await readline.question('Private credentials CSV outside wiki / Privat login-CSV uden for wikien: '));
    const files = await validateFiles(wikiInput, credentialsInput);
    console.log(`\nWiki: ${files.wiki}\nTiddlyWiki: ${version} (tested / testet: 5.4.1)\n127.0.0.1:8080 → private HTTPS :10000\n443 and 8443 remain unchanged / 443 og 8443 bevares.\nAll accounts in the CSV can read and write / Alle konti i CSV-filen kan læse og skrive.\nRestrict Tailscale access to intended people and :10000 first.\nBegræns først Tailscale-adgang til de tiltænkte personer og :10000.\nWindows: restrict CSV permissions to your account; ACLs are not checked.\nWindows: begræns CSV-rettigheder til din konto; ACL kontrolleres ikke.\n`);
    if (await readline.question('Type START to share / Skriv START for at dele: ') !== 'START') return;
    readline.close();
    if (interrupted) return;
    // Track children from creation, including startup, so Ctrl+C never strands a process.
    session = await startSession({...files, boot, tailscale}, {
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
  else (quiet ? guiMain() : main()).catch(error => { console.error('\nForgeShare stopped / stoppet:\n' + error.message); process.exitCode = 1; });
}

// Native dialogs keep the ordinary flow out of the terminal. Arguments are data,
// never interpolated into shell commands. No browser or website is opened.
export function dialogCommand(platform, kind, message, initial = '') {
  if (platform === 'darwin') {
    const actions = {
      folder: 'return POSIX path of (choose folder with prompt (item 1 of argv))',
      file: 'return POSIX path of (choose file with prompt (item 1 of argv) of type {"html"})',
      text: 'return text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) with title "ForgeShare")',
      password: 'return text returned of (display dialog (item 1 of argv) default answer "" with hidden answer with title "ForgeShare")',
      confirm: 'display dialog (item 1 of argv) buttons {"Cancel / Annuller", "Continue / Fortsæt"} default button 2 cancel button 1 with title "ForgeShare"',
      info: 'display dialog (item 1 of argv) buttons {"OK"} default button 1 with title "ForgeShare"'
    };
    return ['/usr/bin/osascript', ['-e', `on run argv\n${actions[kind]}\nend run`, '--', message, initial]];
  }
  if (platform === 'win32') {
    // Base64 JSON carries arbitrary paths/text without PowerShell quoting/injection.
    const data = Buffer.from(JSON.stringify({kind, message, initial})).toString('base64');
    const script = `$env:PSModulePath=$PSHOME+'\\Modules'; $ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName Microsoft.VisualBasic
$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json
[Console]::OutputEncoding = [Text.Encoding]::UTF8
switch ($d.kind) {
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
  const ask = deps.dialog || dialog;
  const start = deps.startSession || startSession;
  let session, privateDir;
  const children = new Set();
  let interrupted = false;
  const interrupt = () => { interrupted = true; if (session) void session.stop(); else for (const child of children) void stopChild(child); };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, interrupt);
  try {
    await ask('confirm', 'Share one wiki privately. Your computer must stay on. Nothing will be shared until you confirm the final step.\n\nDel én wiki privat. Din computer skal forblive tændt. Intet deles, før du bekræfter det sidste trin.');
    if (Number(process.versions.node.split('.')[0]) < 20) fail('Install Node.js 20 or later.', 'Installer Node.js 20 eller nyere.');
    const tailscale = await (deps.findTailscale || findTailscale)();
    const installed = await (deps.findTiddlyWiki || findTiddlyWiki)();
    const runtime = installed ? await validateRuntime(installed) : await (deps.installRuntime || installRuntime)(ask);
    const wiki = await realpath(await ask('folder', 'Choose the prepared wiki folder / Vælg den forberedte wikimappe'));
    try { await access(path.join(wiki, 'tiddlywiki.info')); }
    catch { fail('This is not a prepared wiki folder. Follow “First setup” in ForgeShare; an HTML file must first be copied into a server wiki.', 'Dette er ikke en forberedt wikimappe. Følg “Første opsætning” i ForgeShare; en HTML-fil skal først kopieres til en serverwiki.'); }
    const username = await ask('text', 'Choose the login name for this session.\nVælg brugernavn til denne deling.', 'wiki');
    const password = await ask('password', 'Choose a password of 12+ characters. Share it privately with your collaborator.\nVælg en adgangskode på mindst 12 tegn. Giv den privat til din samarbejdspartner.');
    const confirm = await ask('password', 'Repeat the password / Gentag adgangskoden');
    if (password !== confirm) fail('Passwords did not match. Please start again.', 'Adgangskoderne var forskellige. Start igen.');
    validateCredentials(`username,password\n${username},${password}\n`);
    privateDir = await privateSessionDirectory();
    const credentials = path.join(privateDir, 'login.csv');
    await writeFile(credentials, `username,password\n${username},${password}\n`, {mode: 0o600, flag: 'wx'});
    const files = await validateFiles(wiki, credentials);
    await ask('confirm', `Start sharing this wiki?\nStart deling af denne wiki?\n\n${wiki}\n\nPeople allowed by your Tailscale rules AND this login can read and edit. Limit Tailscale access to this wiki (:10000) first. Existing AI services stay unchanged.\n\nPersoner med Tailscale-adgang OG dette login kan læse og redigere. Begræns først Tailscale-adgang til denne wiki (:10000). Eksisterende AI-tjenester bevares.\n\nNo browser opens automatically. / Ingen browser åbnes automatisk.`);
    if (interrupted) return;
    session = await start({...files, boot: runtime.boot, tailscale}, {
      startWiki: options => { const value = startWiki(options); children.add(value.child); if (interrupted) void stopChild(value.child); return value; },
      spawn: (...args) => { const child = spawn(...args); children.add(child); if (interrupted) void stopChild(child); return child; }
    });
    if (interrupted) return;
    const statusDialog = new AbortController();
    session.finished.then(() => statusDialog.abort());
    await ask('text', 'Sharing is active. Copy this address, then leave this window open. OK/Cancel stops sharing.\n\nDeling er aktiv. Kopiér adressen, og lad dette vindue stå åbent. OK/Annuller stopper deling.\n\nThe other person needs Tailscale and the login.\nDen anden skal bruge Tailscale og login.', session.url, statusDialog.signal);
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
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupt);
  }
}
