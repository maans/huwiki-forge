import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, mkdir, rm, chmod} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import net from 'node:net';
import {build, base} from '../scripts/build-forgeshare.mjs';
import {assembleHtml} from '../assembler/assemble.mjs';
import {validateServe, protectedConfig, validateCredentials, validateFiles, serverArgs, startWiki, stopChild, startSession, dialogCommand, checkPort, serveArgs, guiMain, privateSessionDirectory} from '../plugins/forgeshare/helper/ForgeShare.mjs';
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
    ['da', 'Tailscale-samarbejde', 'Tailscale collaboration'],
    ['$:/languages/en-GB', 'Tailscale collaboration', 'Tailscale-samarbejde'],
    ['$:/languages/de-DE', 'Tailscale collaboration', 'Tailscale-samarbejde']
  ]) {
    tw.wiki.addTiddler({title: '$:/language', text: language});
    const html = tw.wiki.renderTiddler('text/html', base + '/home');
    assert.match(html, new RegExp(expected)); assert.ok(!html.includes(excluded));
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
    const count = bytes.readUInt16LE(bytes.length - 22 + 10); assert.equal(count, 3);
    let offset = 0; const files = {};
    while (bytes.readUInt32LE(offset) === 0x04034b50) {
      const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26);
      const name = bytes.subarray(offset + 30, offset + 30 + length).toString();
      files[name] = bytes.subarray(offset + 30 + length, offset + 30 + length + size).toString();
      offset += 30 + length + size;
    }
    assert.equal(files['ForgeShare.mjs'], source);
    assert.ok(files['README.txt']);
    assert.match(Object.entries(files).find(([name]) => name.startsWith('Start-'))[1], /--gui/);
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
    checkPort: async () => {}, probe: async () => probe,
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
