import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {checkNative} from './native-manifest.mjs';
const root = fileURLToPath(new URL('../plugins/forgeshare/', import.meta.url));
export const base = '$:/plugins/huwiki/forgeshare';
const read = file => readFile(path.join(root, file), 'utf8');
export function parseTid(source) {
  const split = source.indexOf('\n\n'), fields = {};
  if (split < 0) throw Error('Missing tiddler header');
  for (const line of source.slice(0, split).split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) throw Error('Invalid field');
    fields[line.slice(0, colon)] = line.slice(colon + 1).trim();
  }
  return {...fields, text: source.slice(split + 2)};
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Deterministic ZIP, store-only. No archiver dependency, executable mode retained.
export function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const {name, text, executable = false} of files) {
    const filename = Buffer.from(name), data = Buffer.from(text), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    chunks.push(header, filename, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(0x0314, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(((executable ? 0o100755 : 0o100644) * 65536) >>> 0, 38);
    entry.writeUInt32LE(offset, 42); central.push(entry, filename);
    offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}
export async function build() {
  const tiddlers = {};
  for (const file of (await readdir(path.join(root, 'src'))).filter(x => x.endsWith('.tid')).sort()) {
    const tiddler = parseTid(await read('src/' + file));
    if (!tiddler.title.startsWith(base + '/') || tiddlers[tiddler.title]) throw Error('Invalid/duplicate title');
    tiddlers[tiddler.title] = tiddler;
  }
  // TW's native PluginInfo uses the selected language plugin's name field.
  // HUWiki's installed Danish pack uses a display name instead of "da-DK".
  const da = tiddlers[base + '/da-DK/readme'], en = tiddlers[base + '/en-GB/readme'];
  const alias = base + '/HUWiki Dansk/readme';
  tiddlers[alias] = {...da, title: alias};
  // Keep info readable even when the plugin is disabled/not unpacked: native
  // PluginInfo can read these subtiddlers directly from the plugin JSON.
  const filter = tiddlers[base + '/home'].text.match(/<\$list filter="([^"]+)"/)[1];
  const readme = base + '/readme';
  tiddlers[readme] = {title: readme, type: 'text/vnd.tiddlywiki',
    text: `<$let isDanish={{{ ${filter} +[count[]] }}}>\n\n<$list filter="[<isDanish>match[1]]" variable="language">\n\n${da.text}\n</$list>\n<$list filter="[<isDanish>match[0]]" variable="language">\n\n${en.text}\n</$list>\n</$let>\n`};
  const script = await read('helper/ForgeShare.mjs'), instructions = await read('helper/README.txt');
  const downloads = {};
  await checkNative('mac'); await checkNative('windows');
  const binary = file => readFile(path.join(root,'native/compiled',file));
  const app = 'ForgeShare.app/Contents/';
  const packages = {
    mac: [
      {name:app+'MacOS/ForgeShare',text:await binary('ForgeShare'),executable:true},
      {name:app+'Info.plist',text:await read('native/macos/Info.plist')},
      {name:app+'Resources/ForgeShare.icns',text:await binary('ForgeShare.icns')},
      {name:app+'_CodeSignature/CodeResources',text:await binary('CodeResources')},
      {name:app+'Resources/ForgeShare.mjs',text:script}
    ],
    windows: [
      {name:'ForgeShare.exe',text:await binary('ForgeShare.exe')},
      {name:'ForgeShare.mjs',text:script}
    ],
    linux: [
      {name:'Start-ForgeShare.sh',text:await read('helper/Start-ForgeShare.sh'),executable:true},
      {name:'ForgeShare.mjs',text:script,executable:true}
    ]
  };
  for (const [platform, files] of Object.entries(packages)) {
    downloads[platform] = zip([...files,{name:'README.txt',text:instructions}]);
    const title = base + '/download/' + platform;
    tiddlers[title] = {title, type: 'text/plain', text: 'data:application/zip;base64,' + downloads[platform].toString('base64')};
  }
  const title = base + '/download/script';
  tiddlers[title] = {title, type: 'text/plain', text: 'data:application/octet-stream;base64,' + Buffer.from(script).toString('base64')};
  return {plugin: {title: base, name: 'ForgeShare', description: 'Tailscale collaboration / Tailscale-samarbejde',
    author: 'HUWiki', version: '0.1.4', list: 'readme', 'plugin-type': 'plugin', type: 'application/json',
    'core-version': '>=5.4.1', 'studio-category': 'Collaboration', 'studio-tags': 'Tailscale Node.js offline',
    'studio-source-titles': Object.keys(tiddlers).map(x => '[[' + x + ']]').join(' '),
    text: JSON.stringify({tiddlers})}, downloads};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {plugin, downloads} = await build();
  if (process.argv.includes('--check')) {
    if (await read('dist/plugin.json') !== JSON.stringify(plugin, null, 2) + '\n') throw Error('ForgeShare bundle is stale');
    for (const [platform, bytes] of Object.entries(downloads))
      if (!bytes.equals(await readFile(path.join(root, 'dist/ForgeShare-' + platform + '.zip')))) throw Error('Stale helper ZIP');
  } else {
    await mkdir(path.join(root, 'dist'), {recursive: true});
    await writeFile(path.join(root, 'dist/plugin.json'), JSON.stringify(plugin, null, 2) + '\n');
    for (const [platform, bytes] of Object.entries(downloads)) await writeFile(path.join(root, 'dist/ForgeShare-' + platform + '.zip'), bytes);
  }
}
