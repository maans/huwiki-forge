import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, mkdir, rm, chmod} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {build, base} from '../scripts/build-forgeshare.mjs';
import {assembleHtml} from '../assembler/assemble.mjs';
import {validateServe, protectedConfig, validateCredentials, validateFiles, serverArgs, startWiki, stopChild, startSession, dialogCommand, checkPort, serveArgs, guiMain, privateSessionDirectory, readRegistry, registerWiki, startNamedSession, acquireLock, usedServePorts, validateRegistry, checkAddressPort} from '../plugins/forgeshare/helper/ForgeShare.mjs';
const require = createRequire(import.meta.url);
const {TiddlyWiki} = require('tiddlywiki/boot/boot.js');
const boot = require.resolve('tiddlywiki/boot/boot.js');
const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const plugin = JSON.parse(await read('plugins/forgeshare/dist/plugin.json'));
const shadows = JSON.parse(plugin.text).tiddlers;
const ai = {TCP: {'443': {HTTPS: true}, '8443': {HTTPS: true}}, Web: {
  'host.example.ts.net:443': {Handlers: {'/': {Proxy: 'http://127.0.0.1:11434'}}},
  'host.example.ts.net:8443': {Handlers: {'/': {Proxy: 'http://127.0.0.1:1234'}}}
}};
const withWiki = () => ({...structuredClone(ai), Foreground: {owned: {
  TCP: {'10000': {HTTPS: true}}, Web: {'host.example.ts.net:10000': {Handlers: {'/': {Proxy: 'http://127.0.0.1:8080'}}}}
}}});
let tw, temp;
test.before(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), 'forgeshare-test-'));
  tw = TiddlyWiki(); tw.boot.argv = [temp];
  await new Promise(resolve => tw.boot.boot(resolve));
  tw.wiki.addTiddler(plugin); tw.wiki.readPluginInfo(); tw.wiki.registerPluginTiddlers('plugin', [base]); tw.wiki.unpackPluginTiddlers();
});
test.after(async () => { await rm(temp, {recursive: true, force: true}); });
test('bundle is reproducible, standalone and opt-in in the catalog', async () => {
  assert.deepEqual((await build()).plugin, plugin);
  assert.equal(plugin.title, base);
  // TW 5.4.1 compares only major/minor/patch when deciding whether to import.
  for (const previous of ['0.1.0-test.1','0.1.0-test.2','0.1.0-test.3','0.1.1'])
    assert.ok(tw.utils.compareVersions(plugin.version,previous)>0,'The actual TW importer must accept this upgrade');
  assert.equal(plugin.dependents, undefined);
  assert.ok(Object.keys(shadows).every(title => title.startsWith(base + '/')));
  assert.ok(!shadows['$:/language']); assert.ok(!shadows['$:/config/SyncPollingInterval']);
  const catalog = JSON.parse(await read('catalog/editions.json'));
  assert.equal(catalog.plugins.find(p => p.id === 'forgeshare').version, plugin.version);
  for (const item of catalog.editions) {
    const manifest = JSON.parse(await read('catalog/' + item.manifest));
    assert.ok(!manifest.plugins.some(p => p.includes('forgeshare')));
  }
});
test('actual TW renderer selects Danish and English, preserves block headings and download links offline', () => {
  for (const [language, expected, excluded] of [
    ['$:/languages/da-DK', 'Tailscale-samarbejde', 'Tailscale collaboration'],
    ['$:/languages/huwiki-da-DK', 'Tailscale-samarbejde', 'Tailscale collaboration'],
    ['da', 'Tailscale-samarbejde', 'Tailscale collaboration'],
    ['$:/languages/en-GB', 'Tailscale collaboration', 'Tailscale-samarbejde'],
    ['$:/languages/de-DE', 'Tailscale collaboration', 'Tailscale-samarbejde']
  ]) {
    tw.wiki.addTiddler({title: '$:/language', text: language});
    const html = tw.wiki.renderTiddler('text/html', base + '/home');
    assert.ok(html.includes(expected), language); assert.ok(!html.includes(excluded), language);
    assert.match(html, /<h[12][^>]*>/); assert.doesNotMatch(html, /Filter error|Missing closing/);
    for (const name of ['mac', 'windows', 'linux']) {
      assert.ok(html.includes(`download="ForgeShare-${name}.zip"`));
      assert.ok(html.includes('data:application/zip;base64,'));
    }
    assert.ok(html.includes('https://nodejs.org/en/download'));
    assert.ok(html.includes('https://tailscale.com/download'));
  }
  tw.wiki.deleteTiddler('$:/language');
  assert.match(tw.wiki.renderTiddler('text/html', base + '/home'), /Tailscale collaboration/);
});
test('native language dropdown switches the already rendered guide for standard and HUWiki Danish', async () => {
  const standard = tw.loadPluginFolder(path.join(path.dirname(require.resolve('tiddlywiki/package.json')), 'languages/da-DK'));
  const custom = {...standard, title:'$:/languages/huwiki-da-DK', name:'HUWiki Dansk'};
  const renamed = {...standard, title:'$:/languages/custom-danish', name:'da-DK'};
  for (const data of [standard,custom,renamed]) tw.wiki.addTiddler(data);
  tw.wiki.readPluginInfo();
  const document = tw.fakeDocument;
  const container = document.createElement('div');
  const guide = tw.wiki.makeWidget(tw.wiki.parseTiddler(base + '/home'), {document});
  guide.render(container, null);
  const dropdown = tw.wiki.makeWidget(tw.wiki.parseTiddler('$:/snippets/minilanguageswitcher'), {document});
  const menu = document.createElement('div'); dropdown.render(menu, null);
  function findSelect(widget) {
    if (widget.selectTitle === '$:/language') return widget;
    for (const child of widget.children || []) { const found = findSelect(child); if (found) return found; }
  }
  const select = findSelect(dropdown); assert.ok(select, 'Use the actual core selector');
  assert.ok(menu.innerHTML.includes(custom.title));
  try {
    for (const [title,expected,excluded] of [
      [custom.title,'Tailscale-samarbejde','Tailscale collaboration'],
      ['$:/languages/en-GB','Tailscale collaboration','Tailscale-samarbejde'],
      [standard.title,'Tailscale-samarbejde','Tailscale collaboration'],
      [renamed.title,'Tailscale-samarbejde','Tailscale collaboration'],
      ['$:/languages/en-GB','Tailscale collaboration','Tailscale-samarbejde']
    ]) {
      select.getSelectDomNode().value = title; select.handleChangeEvent({});
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(tw.wiki.getTiddlerText('$:/language'),title);
      guide.refresh({'$:/language': {modified:true}});
      assert.ok(container.innerHTML.includes(expected)); assert.ok(!container.innerHTML.includes(excluded));
      assert.equal((container.innerHTML.match(/class="hu-share-downloads"/g) || []).length,1, 'Only one guide is rendered');
    }
  } finally {
    tw.wiki.addTiddler({title:'$:/language',text:'$:/languages/en-GB'});
    await new Promise(resolve => setImmediate(resolve));
    for (const data of [standard,custom,renamed]) tw.wiki.deleteTiddler(data.title);
  }
});

test('native plugin information localizes standalone readmes even when ForgeShare shadows are unavailable', () => {
  assert.equal(plugin.list,'readme');
  for (const code of ['da-DK','en-GB','HUWiki Dansk']) {
    assert.ok(shadows[base+'/'+code+'/readme']);
    assert.ok(!shadows[base+'/'+code+'/readme'].text.includes('$transclude'));
  }
  tw.wiki.unregisterPluginTiddlers('plugin',[base]); tw.wiki.unpackPluginTiddlers();
  try {
    assert.equal(tw.wiki.getTiddler(base+'/home'),undefined);
    for (const [language,name,expected] of [
      ['$:/languages/da-DK','da-DK','privat samarbejde'],
      ['$:/languages/huwiki-da-DK','HUWiki Dansk','privat samarbejde'],
      ['$:/languages/en-GB','en-GB','private collaboration'],
      ['$:/languages/de-DE','de-DE','private collaboration']
    ]) {
      tw.wiki.addTiddler({title:'$:/language',text:language});
      const html=tw.wiki.renderText('text/html','text/vnd.tiddlywiki',`<$vars currentTiddler="${base}" languageTitle="${name}" currentTab="readme">{{||$:/core/ui/PluginInfo}}</$vars>`);
      assert.ok(html.includes(expected),html.slice(0,300));
      assert.match(html,/<h1[^>]*>/);
    }
  } finally {
    tw.wiki.registerPluginTiddlers('plugin',[base]); tw.wiki.unpackPluginTiddlers(); tw.wiki.deleteTiddler('$:/language');
  }
});
test('native 3000 action changes only the requested config; read-only view hides it', () => {
  tw.wiki.addTiddler({title: '$:/status/IsReadOnly', text: 'yes'});
  assert.doesNotMatch(tw.wiki.renderTiddler('text/html', base + '/home'), /Use 3000 ms/);
  tw.wiki.deleteTiddler('$:/status/IsReadOnly');
  assert.match(tw.wiki.renderTiddler('text/html', base + '/home'), /Use 3000 ms/);
  const text = shadows[base + '/advanced-en'].text;
  const action = text.match(/<\$action-setfield[^>]+\/>/)[0];
  tw.rootWidget.invokeActionString(action, tw.rootWidget, {});
  assert.equal(tw.wiki.getTiddlerText('$:/config/SyncPollingInterval'), '3000');
  tw.wiki.deleteTiddler('$:/config/SyncPollingInterval');
});
test('all downloadable ZIP files embed the exact standalone reviewed script', async () => {
  const source = await read('plugins/forgeshare/helper/ForgeShare.mjs');
  for (const platform of ['mac', 'windows', 'linux']) {
    const bytes = Buffer.from(shadows[base + '/download/' + platform].text.split(',')[1], 'base64');
    assert.equal(bytes.readUInt32LE(), 0x04034b50);
    const count = bytes.readUInt16LE(bytes.length - 22 + 10); assert.equal(count, platform==='mac'?6:3);
    let offset = 0; const files = {};
    while (bytes.readUInt32LE(offset) === 0x04034b50) {
      const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26);
      const name = bytes.subarray(offset + 30, offset + 30 + length).toString();
      files[name] = bytes.subarray(offset + 30 + length, offset + 30 + length + size);
      offset += 30 + length + size;
    }
    assert.equal(files[platform==='mac'?'ForgeShare.app/Contents/Resources/ForgeShare.mjs':'ForgeShare.mjs'].toString(), source);
    assert.ok(files['README.txt']);
    assert.doesNotMatch(files['README.txt'].toString(), /chmod|node ForgeShare|TECHNICAL \/ TEKNISK/);
    // Mac/Linux users should receive an executable launcher from the ZIP,
    // rather than having to repair its permissions in a terminal.
    const directory = bytes.readUInt32LE(bytes.length - 22 + 16);
    let entry = directory;
    for (let i = 0; i < count; i++) {
      assert.equal(bytes.readUInt32LE(entry), 0x02014b50);
      const length = bytes.readUInt16LE(entry + 28);
      const name = bytes.subarray(entry + 46, entry + 46 + length).toString();
      if (name.startsWith('Start-') || name.endsWith('/MacOS/ForgeShare'))
        assert.equal((bytes.readUInt32LE(entry + 38) >>> 16) & 0o777, 0o755);
      entry += 46 + length + bytes.readUInt16LE(entry + 30) + bytes.readUInt16LE(entry + 32);
    }
    if(platform==='linux')assert.match(files['Start-ForgeShare.sh'].toString(),/--gui/);
    else assert.ok(!Object.keys(files).some(name=>/\.(cmd|command)$/.test(name)));
    if(platform==='mac') {
      assert.equal(files['ForgeShare.app/Contents/MacOS/ForgeShare'].readUInt32BE(),0xcafebabe,'Universal Mac executable');
      assert.equal(files['ForgeShare.app/Contents/Resources/ForgeShare.icns'].subarray(0,4).toString(),'icns');
    }
    if(platform==='windows') {
      const exe=files['ForgeShare.exe']; assert.equal(exe.subarray(0,2).toString(),'MZ');
      const pe=exe.readUInt32LE(0x3c); assert.equal(exe.readUInt32LE(pe),0x4550);
      assert.equal(exe.readUInt16LE(pe+24+68),2,'GUI subsystem: no console window');
    }
  }
  assert.equal(Buffer.from(shadows[base + '/download/script'].text.split(',')[1], 'base64').toString(), source);
});
test('plugin assembles into pinned standalone HTML without remote dependency', async () => {
  const html = assembleHtml(await read('core/empty.html'), [plugin]);
  assert.ok(html.includes('"title":"' + base + '"'));
  assert.ok(html.includes('data:application/zip;base64,'));
  assert.ok(!Object.values(shadows).some(t => t['module-type'] === 'startup'));
});
test('Serve guard preserves AI mappings and refuses occupied ports, foreground and public conflicts', () => {
  assert.deepEqual(validateServe(ai), ai); assert.deepEqual(validateServe({}), {});
  for (const value of [null, [], {Unknown: {}}, {TCP: []}, {TCP: {'10000': {HTTPS: true}}},
    {Web: {'x:10000': {Handlers: {}}}}, {AllowFunnel: {'x:10000': true}}, withWiki(), {Foreground: {x: {TCP: {'10000': {TCPForward: 'elsewhere'}}}}}])
    assert.throws(() => validateServe(value));
  assert.deepEqual(protectedConfig(withWiki()), protectedConfig(ai));
  const changed = withWiki(); changed.Web['host.example.ts.net:443'].Handlers['/'].Proxy = 'http://127.0.0.1:9999';
  assert.notDeepEqual(protectedConfig(changed), protectedConfig(ai));
  assert.throws(() => validateServe({AllowFunnel: {'x:10000': true}}, false));
});
test('credentials require actual accounts, safe CSV and unique names', () => {
  assert.equal(validateCredentials('username,password\nalice,a-long-password\nbob,another-long-password\n'), 2);
  for (const text of ['', 'username,password', 'username,password\na,short', 'username,password\na,password,with,commas',
    'username,password\na,password"quotes', 'username,password\na,longpassword12\na,longpassword34', 'username,password\n(anon),passwordlong'])
    assert.throws(() => validateCredentials(text));
});
test('server paths are literal argv and loopback/auth/CSRF are enforced', () => {
  const maliciousLookingPath = '/tmp/wiki name; $(do-not-run)';
  const args = serverArgs(maliciousLookingPath, '/tmp/login file.csv');
  assert.equal(args[0], maliciousLookingPath);
  for (const entry of ['host=127.0.0.1', 'port=8080', 'credentials=/tmp/login file.csv', 'readers=(authenticated)', 'writers=(authenticated)', 'csrf-disable=no']) assert.ok(args.includes(entry));
  assert.deepEqual(serveArgs, ['serve', '--https=10000', 'http://127.0.0.1:8080']);
});
test('dialog commands treat user-facing text as data on all platforms', () => {
  const unsafe = 'A "quote"; $(not-code) & <text>\nline';
  const [mac, args] = dialogCommand('darwin', 'text', unsafe);
  assert.equal(mac, '/usr/bin/osascript'); assert.equal(args[args.length - 2], unsafe); assert.ok(!args[1].includes(unsafe));
  const [win, windows] = dialogCommand('win32', 'text', unsafe);
  assert.equal(win, 'powershell.exe');
  const source = Buffer.from(windows.at(-1), 'base64').toString('utf16le');
  assert.ok(!source.includes(unsafe)); assert.ok(source.includes(Buffer.from(JSON.stringify({kind: 'text', message: unsafe, initial: ''})).toString('base64')));
  assert.deepEqual(dialogCommand('linux', 'text', unsafe)[1].find(x => x.startsWith('--text=')), '--text=' + unsafe);
});
class Child extends EventEmitter {
  exitCode = null; signalCode = null; kills = [];
  kill(signal) { this.kills.push(signal); queueMicrotask(() => { this.signalCode = signal; this.emit('exit', null, signal); }); return true; }
}
function mockSession({configs = [ai, ai, withWiki()], probe = 401, earlyExit = false} = {}) {
  const server = new Child(), serve = new Child(), calls = []; let index = 0;
  if (earlyExit) serve.exitCode = 1;
  return {server, serve, calls, deps: {
    readJSON: async (exe, args) => { calls.push(args); return args[0] === 'status' ? {BackendState: 'Running', Self: {DNSName: 'host.example.ts.net.'}} : structuredClone(configs[Math.min(index++, configs.length - 1)]); },
    checkPort: async () => {}, checkAddressPort: async () => {}, probe: async () => probe,
    startWiki: () => ({child: server, ready: Promise.resolve({address: '127.0.0.1', port: 8080})}),
    spawn: (exe, args) => { calls.push(args); return serve; }
  }};
}
test('safe session adds only foreground 10000, preserves AI and stops only owned processes', async () => {
  const mock = mockSession();
  const session = await startSession({tailscale: '/test/tailscale'}, mock.deps);
  assert.equal(session.url, 'https://host.example.ts.net:10000');
  assert.ok(mock.calls.some(args => JSON.stringify(args) === JSON.stringify(serveArgs)));
  assert.ok(!mock.calls.flat().some(x => ['reset', 'off', '--bg', '--yes', 'funnel'].includes(x)));
  await session.stop(); await session.finished;
  assert.deepEqual(mock.serve.kills, ['SIGTERM']); assert.deepEqual(mock.server.kills, ['SIGTERM']);
});
test('no sharing when anonymous access succeeds, configuration changes, or Serve fails', async () => {
  const modified = structuredClone(ai); modified.TCP['443'] = {TCPForward: 'elsewhere'};
  for (const scenario of [{probe: 200}, {configs: [ai, modified]}, {earlyExit: true}, {configs: [ai, ai, modified]}]) {
    const mock = mockSession(scenario);
    await assert.rejects(startSession({tailscale: '/test/tailscale'}, mock.deps));
    assert.deepEqual(mock.server.kills, ['SIGTERM']);
    if (scenario.probe === 200) assert.ok(!mock.calls.some(args => args.includes('--https=10000')));
  }
});
test('existing Serve port prevents even starting the wiki', async () => {
  const mock = mockSession({configs: [withWiki()]}); let started = false;
  mock.deps.startWiki = () => { started = true; throw Error('should not start'); };
  await assert.rejects(startSession({tailscale: '/test/tailscale'}, mock.deps)); assert.equal(started, false);
});
test('occupied local port is refused without terminating its owner', async () => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(checkPort(listener.address().port), /in use/); assert.ok(listener.listening); }
  finally { await new Promise(resolve => listener.close(resolve)); }
});
test('real TW server denies anonymous users and exchanges saved changes between independent HTTP clients', async () => {
  const wiki = path.join(temp, 'server wiki'); await mkdir(wiki);
  await writeFile(path.join(wiki, 'tiddlywiki.info'), JSON.stringify({plugins: ['tiddlywiki/tiddlyweb', 'tiddlywiki/filesystem']}));
  const credentials = path.join(temp, 'credentials.csv'); await writeFile(credentials, 'username,password\nalice,first-password-long\nbob,second-password-long\n', {mode: 0o600});
  const files = await validateFiles(wiki, credentials);
  await assert.rejects(validateFiles(wiki, path.join(wiki, 'tiddlywiki.info')), /outside/);
  if (process.platform !== 'win32') {
    await chmod(credentials, 0o644); await assert.rejects(validateFiles(wiki, credentials), /permissions/); await chmod(credentials, 0o600);
  }
  let started = startWiki({...files, boot, port: 0});
  try {
    const address = await started.ready, url = 'http://127.0.0.1:' + address.port;
    assert.equal(address.address, '127.0.0.1');
    assert.equal((await fetch(url + '/status')).status, 401);
    const client = (name, password) => ({Authorization: 'Basic ' + Buffer.from(name + ':' + password).toString('base64'), 'X-Requested-With': 'TiddlyWiki', 'Content-Type': 'application/json'});
    const alice = client('alice', 'first-password-long'), bob = client('bob', 'second-password-long');
    const resource = url + '/recipes/default/tiddlers/Shared%20test';
    assert.equal((await fetch(resource, {method: 'PUT', headers: alice, body: JSON.stringify({title: 'Shared test', text: 'From Mac'})})).status, 204);
    assert.equal((await (await fetch(resource, {headers: bob})).json()).text, 'From Mac');
    assert.equal((await fetch(resource, {method: 'PUT', headers: bob, body: JSON.stringify({title: 'Shared test', text: 'From iPad'})})).status, 204);
    assert.equal((await (await fetch(resource, {headers: alice})).json()).text, 'From iPad');
    await stopChild(started.child);
    started = startWiki({...files, boot, port: 0});
    const restarted = await started.ready;
    assert.equal((await (await fetch(`http://127.0.0.1:${restarted.port}/recipes/default/tiddlers/Shared%20test`, {headers: alice})).json()).text, 'From iPad');
  } finally { await stopChild(started.child); }
});

test('graphical flow uses native choices and private temporary credentials, then removes them', async () => {
  const wiki = path.join(temp, 'gui wiki'); await mkdir(wiki);
  await writeFile(path.join(wiki, 'tiddlywiki.info'), JSON.stringify({plugins: ['tiddlywiki/tiddlyweb', 'tiddlywiki/filesystem']}));
  let credentials, stopped = 0, confirmations = 0; const shown = [];
  await guiMain({
    root: path.join(temp, 'gui profiles'),
    readJSON: async () => ai, checkAddressPort: async () => {},
    findTailscale: async () => '/test/tailscale',
    findTiddlyWiki: async () => path.dirname(require.resolve('tiddlywiki/package.json')),
    dialog: async (kind, message, initial) => {
      shown.push(message);
      if (kind === 'folder') return wiki;
      if (kind === 'password') return 'a-private-password';
      if (kind === 'confirm') { confirmations++; return ''; }
      if (kind === 'text') return initial.startsWith('https:') ? '' : 'alice';
      assert.fail('Unexpected error dialog: ' + message);
    },
    startSession: async options => {
      assert.equal(confirmations, 2, 'Final local confirmation must precede any sharing');
      credentials = options.credentials;
      assert.equal(await readFile(credentials, 'utf8'), 'username,password\nalice,a-private-password\n');
      return {url: 'https://host.example.ts.net:10000', finished: new Promise(() => {}), stop: async () => { stopped++; }};
    }
  });
  assert.equal(stopped, 1);
  await assert.rejects(readFile(credentials), {code: 'ENOENT'});
  assert.ok(shown.every(message => !message.includes('a-private-password')));
});
test('cancelling graphical welcome starts nothing and installs nothing', async () => {
  let inspected = false;
  await guiMain({dialog: async () => { throw Object.assign(Error('cancel'), {cancelled: true}); },
    findTailscale: async () => { inspected = true; }, startSession: async () => assert.fail('Unexpected start')});
  assert.equal(inspected, false);
});

test('native app STOP and parent exit cancel setup without starting services', async () => {
  for (const eof of [false, true]) {
    const input = new PassThrough();
    await guiMain({appMode:true, input,
      findTailscale:async () => assert.fail('No services should be inspected after cancellation'),
      dialog:async (kind,message,initial,signal) => new Promise((resolve,reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(Error('cancel'),{cancelled:true})),{once:true});
        queueMicrotask(() => eof ? input.end() : input.write('STOP\n'));
      })
    });
    assert.equal(input.listenerCount('data'),0);
    assert.equal(input.listenerCount('end'),0);
  }
});

test('native app reports names and addresses only, drains owned session on STOP or parent exit and removes credentials', async () => {
  for (const eof of [false, true]) {
    const input=new PassThrough(), reports=[];
    let credentials, stopped=0, finish;
    const finished=new Promise(resolve=>{finish=resolve;});
    const wiki=await preparedWiki('native '+eof);
    await guiMain({appMode:true,input,root:path.join(temp,'native profiles '+eof),
      readJSON:async()=>ai,checkAddressPort:async()=>{},
      findTailscale:async()=>'/test/tailscale',findTiddlyWiki:async()=>path.dirname(require.resolve('tiddlywiki/package.json')),
      dialog:async(kind,message,initial)=>{
        if(kind==='folder')return wiki;
        if(kind==='password')return 'a-private-password';
        if(kind==='confirm')return '';
        if(kind==='text') { assert.ok(!String(initial).startsWith('https:'),'App must use its main window, not another status dialog'); return initial==='wiki'?'alice':'My wiki'; }
        assert.fail('Unexpected dialog: '+message);
      },
      startSession:async options=>{credentials=options.credentials;return {url:'https://host.example.ts.net:21000',finished,stop:async()=>{stopped++;finish();}};},
      report:item=>{ reports.push(item); if(item.event==='ready')queueMicrotask(()=>eof?input.end():input.write('STOP\n')); }
    });
    assert.deepEqual(reports,[{event:'selected',name:'My wiki'},{event:'ready',name:'My wiki',url:'https://host.example.ts.net:21000'}]);
    assert.ok(stopped>=1);
    await assert.rejects(readFile(credentials),{code:'ENOENT'});
    assert.equal(input.listenerCount('data'),0);
  }
});

test('private login directory can be protected before any credentials are written', async () => {
  let directory;
  try {
    directory = await privateSessionDirectory();
    const filename = path.join(directory, 'permission-check.txt');
    await writeFile(filename, 'not a secret', {mode: 0o600});
    assert.equal(await readFile(filename, 'utf8'), 'not a secret');
  } catch (error) {
    // This check runs before credentials exist. Preserve OS diagnostics in CI,
    // while the ordinary user-facing flow keeps its concise safe explanation.
    if (error.cause) console.error(error.cause.stderr || error.cause.message);
    throw error;
  } finally { if (directory) await rm(directory, {recursive: true, force: true}); }
});

test('image finder includes imported images without modified dates, unlike Recent', () => {
  tw.wiki.addTiddler({title: 'Undated import.png', type: 'image/png', text: 'aW1hZ2U='});
  try {
    assert.ok(tw.wiki.renderTiddler('text/html', base + '/home').includes('Undated import.png'));
    assert.ok(!tw.wiki.renderText('text/html', 'text/vnd.tiddlywiki', '<<timeline>>').includes('Undated import.png'));
  } finally { tw.wiki.deleteTiddler('Undated import.png'); }
});

async function preparedWiki(name) {
  const wiki = path.join(temp, name);
  await mkdir(wiki, {recursive: true});
  await writeFile(path.join(wiki, 'tiddlywiki.info'), JSON.stringify({plugins: ['tiddlywiki/tiddlyweb', 'tiddlywiki/filesystem']}));
  return wiki;
}
test('named wiki registration skips OS/Serve/Funnel/service conflicts, remembers addresses and serializes parallel additions', async () => {
  const root = path.join(temp, 'catalogue');
  const configuration = {...ai, Foreground: {other: {TCP: {'20000': {TCPForward: 'something'}}}},
    Services: {'svc:other': {Web: {'service.ts.net:21000': {Handlers: {}}}}}, AllowFunnel: {'host:21001': true}};
  assert.deepEqual([...usedServePorts(configuration)].sort((a,b) => a-b), [443,8443,20000,21000,21001]);
  const deps = {readJSON: async () => configuration, checkAddressPort: async port => {
    if ([20001,21002].includes(port)) throw Error('occupied by another application');
  }};
  const wiki = await preparedWiki('family named'), garden = await preparedWiki('garden named');
  const [a, b] = await Promise.all([
    registerWiki({root, wiki, name: 'Familie', tailscale: 'fake'}, deps),
    registerWiki({root, wiki: garden, name: 'Have', tailscale: 'fake'}, deps)
  ]);
  assert.equal(new Set([a.port,b.port,a.httpsPort,b.httpsPort]).size, 4);
  for (const item of [a,b]) { assert.ok(item.port >= 20002); assert.ok(item.httpsPort >= 21003); }
  assert.deepEqual(await registerWiki({root, wiki, name: 'Another label', tailscale: 'fake'}, deps), a);
  const saved = await readRegistry(root); assert.equal(saved.wikis.length, 2);
  assert.ok(!JSON.stringify(saved).includes('password'));
  await assert.rejects(registerWiki({root, wiki: await preparedWiki('duplicate name'), name: 'familie', tailscale: 'fake'}, deps), /different wiki name/);
  const corrupt = structuredClone(saved); corrupt.wikis[0].httpsPort = 443;
  assert.throws(() => validateRegistry(corrupt));
  await writeFile(path.join(root, 'wikis.json'), '{invalid');
  await assert.rejects(readRegistry(root));
  assert.equal(await readFile(path.join(root, 'wikis.json'), 'utf8'), '{invalid', 'Corruption must not reset saved addresses');
});

test('a running named wiki cannot be started twice; its saved address is never silently replaced', async () => {
  const root = path.join(temp, 'locked catalogue');
  const profile = await registerWiki({root, wiki: await preparedWiki('locked wiki'), name: 'Same wiki', tailscale: 'fake'},
    {readJSON: async () => ai, checkAddressPort: async () => {}});
  let starts = 0, resolve;
  const deps = {startSession: async () => { starts++; return {finished: new Promise(r => { resolve = r; }), stop: async () => resolve()}; }};
  const session = await startNamedSession(profile, {root}, deps);
  await assert.rejects(startNamedSession(profile, {root}, deps), /already running/);
  assert.equal(starts, 1);
  await session.stop(); await session.finished;
  const mock = mockSession({configs: [{TCP: {[profile.httpsPort]: {HTTPS: true}}}]});
  await assert.rejects(startNamedSession(profile, {root, tailscale: 'fake'}, mock.deps), /already in use/);
  assert.deepEqual((await readRegistry(root)).wikis[0], profile);
  assert.equal(mock.server.kills.length, 0);
  const release = await acquireLock(root, 'wiki-' + profile.id, 1); await release();
});

test('OS port inspection preserves an existing IPv4 service', async () => {
  const other = net.createServer(); await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(checkAddressPort(other.address().port)); assert.ok(other.listening); }
  finally { await new Promise(resolve => other.close(resolve)); }
});

test('OS port inspection also preserves an IPv6-only service', async t => {
  const other = net.createServer();
  try {
    await new Promise((resolve, reject) => { other.once('error', reject); other.listen({host:'::1', port:0, ipv6Only:true}, resolve); });
  } catch (error) {
    if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) { t.skip('IPv6 is unavailable on this host'); return; }
    throw error;
  }
  try { await assert.rejects(checkAddressPort(other.address().port)); assert.ok(other.listening); }
  finally { await new Promise(resolve => other.close(resolve)); }
});

test('locks recover a confirmed dead process, preserve live owners and fail closed on incomplete ownership', async () => {
  const root = path.join(temp, 'lock recovery'), key = 'catalog';
  const directory = path.join(root, 'locks', key); await mkdir(directory, {recursive:true});
  const pid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {encoding:'utf8', windowsHide:true}));
  await writeFile(path.join(directory, 'owner.json'), JSON.stringify({pid}));
  const release = await acquireLock(root, key, 3);
  await assert.rejects(acquireLock(root, key, 1), /already running/);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8')).pid, process.pid);
  await release(); await release();
  await mkdir(directory);
  await assert.rejects(acquireLock(root, key, 1), /already running/);
  await writeFile(path.join(directory, 'owner.json'), 'incomplete');
  await assert.rejects(acquireLock(root, key, 1), /already running/);
  assert.equal(await readFile(path.join(directory, 'owner.json'), 'utf8'), 'incomplete');
});

test('dynamic session refuses public exposure and never hides changes to a different wiki route', async () => {
  const other = withWiki();
  const port = 20042, httpsPort = 21042;
  const changed = structuredClone(other); changed.Foreground.owned.Web['host.example.ts.net:10000'].Handlers['/'].Proxy = 'http://127.0.0.1:9999';
  assert.notDeepEqual(protectedConfig(other, httpsPort), protectedConfig(changed, httpsPort));
  assert.throws(() => validateServe({AllowFunnel: {['host:' + httpsPort]: true}}, false, httpsPort));
  const mock = mockSession({configs: [other, changed]});
  mock.deps.startWiki = () => ({child:mock.server, ready:Promise.resolve({address:'127.0.0.1',port})});
  await assert.rejects(startSession({tailscale:'fake',port,httpsPort},mock.deps), /changed during startup/);
  assert.deepEqual(mock.server.kills, ['SIGTERM']);
  assert.equal(mock.serve.kills.length,0);
});

test('two named real servers keep data separate; stopping one preserves the other and existing Tailscale services', async () => {
  const root = path.join(temp, 'multi-server catalogue');
  const config = {...structuredClone(ai), TCP: {...ai.TCP, '22': {TCPForward: 'localhost:22'}}, Foreground: {
    unrelated: {TCP: {'10000': {HTTPS: true}}, Web: {'host.example.ts.net:10000': {Handlers: {'/': {Proxy: 'http://127.0.0.1:8080'}}}}}}
  };
  const original = structuredClone(config);
  const deps = {
    readJSON: async (exe, args) => args[0] === 'status' ? {BackendState: 'Running', Self: {DNSName: 'host.example.ts.net.'}} : structuredClone(config),
    spawn: (exe, args) => {
      const port = Number(args[1].split('=')[1]), child = new Child();
      assert.deepEqual(args, ['serve', `--https=${port}`, args[2]]);
      config.Foreground[port] = {TCP: {[port]: {HTTPS: true}}, Web: {['host.example.ts.net:' + port]: {Handlers: {'/': {Proxy: args[2]}}}}};
      child.once('exit', () => { delete config.Foreground[port]; }); return child;
    }
  };
  const a = await registerWiki({root, wiki: await preparedWiki('multi a'), name: 'Family', tailscale: 'fake'}, deps);
  const b = await registerWiki({root, wiki: await preparedWiki('multi b'), name: 'Garden', tailscale: 'fake'}, deps);
  const credentials = path.join(temp, 'multi-login.csv');
  await writeFile(credentials, 'username,password\nalice,multi-wiki-password\n', {mode: 0o600});
  const options = {root, boot, credentials, tailscale: 'fake'};
  let first, second;
  try {
    first = await startNamedSession(a, options, deps);
    second = await startNamedSession(b, options, deps);
    assert.equal(first.url, `https://host.example.ts.net:${a.httpsPort}`);
    assert.notEqual(first.url, second.url);
    const headers = {Authorization: 'Basic ' + Buffer.from('alice:multi-wiki-password').toString('base64'),
      'X-Requested-With': 'TiddlyWiki', 'Content-Type': 'application/json'};
    const resource = entry => `http://127.0.0.1:${entry.port}/recipes/default/tiddlers/Shared`;
    for (const entry of [a,b]) assert.equal((await fetch(resource(entry), {method:'PUT', headers, body: JSON.stringify({title:'Shared', text:entry.name})})).status, 204);
    assert.equal((await (await fetch(resource(a), {headers})).json()).text, 'Family');
    assert.equal((await (await fetch(resource(b), {headers})).json()).text, 'Garden');
    await first.stop(); await first.finished;
    assert.equal((await (await fetch(resource(b), {headers})).json()).text, 'Garden');
    assert.ok(config.Foreground[b.httpsPort]); assert.ok(!config.Foreground[a.httpsPort]);
    await second.stop(); await second.finished;
    assert.deepEqual(config, original);
  } finally { if (first) await first.stop(); if (second) await second.stop(); }
});

test('returning GUI users choose the saved name without choosing a folder or port', async () => {
  const root = path.join(temp, 'returning gui');
  const profile = await registerWiki({root, wiki: await preparedWiki('saved gui wiki'), name: 'Familie & børn', tailscale: 'fake'},
    {readJSON: async () => ai, checkAddressPort: async () => {}});
  let chosen = false, started = false;
  await guiMain({root,
    findTailscale: async () => 'fake', findTiddlyWiki: async () => path.dirname(require.resolve('tiddlywiki/package.json')),
    dialog: async (kind, message, initial) => {
      if (kind === 'confirm') return '';
      if (kind === 'choice') { assert.ok(initial.includes('Wiki: Familie & børn')); chosen = true; return 'Wiki: Familie & børn'; }
      if (kind === 'password') return 'a-private-password';
      if (kind === 'text') return initial.startsWith('https:') ? '' : 'alice';
      assert.fail('Unexpected folder/error dialog: ' + message);
    },
    startSession: async options => {
      assert.ok(chosen); assert.equal(options.wiki, profile.wiki); assert.equal(options.httpsPort, profile.httpsPort); started = true;
      return {url: `https://host.example.ts.net:${profile.httpsPort}`, finished: new Promise(() => {}), stop: async () => {}};
    }
  });
  assert.ok(started);
  const choices = ['Wiki: Familie & børn', '＋ Add another wiki / Tilføj en wiki'];
  assert.deepEqual(dialogCommand('darwin', 'choice', 'Choose', choices)[1].slice(-2), choices);
  assert.deepEqual(dialogCommand('linux', 'choice', 'Choose', choices)[1].slice(-2), choices);
  const source = Buffer.from(dialogCommand('win32', 'choice', 'Choose', choices)[1].at(-1), 'base64').toString('utf16le');
  assert.ok(source.includes('Windows.Forms.ListBox')); assert.ok(!source.includes('Familie & børn'));
});
