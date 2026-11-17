import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('plugins/site-publisher/src/animus-presentation.js', root), 'utf8');
function adapter(rows) {
  const context = {$tw: {wiki: {
    getTiddler: title => rows[title] ? {fields: rows[title]} : null,
    each(fn) { Object.entries(rows).forEach(([title, fields]) => fn({fields}, title)); }
  }}};
  vm.runInNewContext(source, context);
  return {info: context.animusPresentation, html: context.animusProgramHtml};
}
const json = (title, data, fields = {}) => ({title, type: 'application/json', text: JSON.stringify(data), ...fields});
const leaf = (name, duration = 10) => ({version: 1, name, duration, parts: [{id: 'shape', type: 'circle', geo: {r: 10}}]});
const film = (scenes, musical = {}) => ({version: 1, name: 'A musical', duration: 999, parts: [], scenes, musical});
const plain = value => JSON.parse(JSON.stringify(value));
function examples() {
  const rows = {};
  for (const file of ['plugins/animus-example-fyrtoejet/dist/plugin.json', 'plugins/animus-example-orchestra/dist/plugin.json']) Object.assign(rows, JSON.parse(JSON.parse(fs.readFileSync(new URL(file, root), 'utf8')).text).tiddlers);
  return rows;
}

test('real Fyrtøjet film and Start page present nine scenes in three acts with actual runtime', () => {
  const {info, html} = adapter(examples());
  const start = info('Fyrtøjet · Start', 'da'), direct = info('Fyrtøjet · Hele forestillingen (film)', 'da');
  assert.deepEqual(plain(start), plain(direct));
  assert.equal(start.duration, 324); assert.equal(start.sceneCount, 9); assert.equal(start.actCount, 3);
  assert.deepEqual(plain(start.scenes.map(s => s.start)), [0, 36, 72, 108, 144, 180, 216, 252, 288]);
  assert.deepEqual(plain([...new Set(start.scenes.map(s => s.group))]), ['Akt 1', 'Akt 2', 'Akt 3']);
  assert.equal(start.scenes[0].label, 'Skovens sti');
  assert.equal(start.scenes[8].label, 'Lys over byen');
  const program = html(start, 'da');
  assert.match(program, /5:24/); assert.match(program, /9 scener · 3 akter/);
  assert.doesNotMatch(program, /sceneNotes|animationClips|directorNotes|<h2>Program<\/h2>/);
});

test('bilingual Start widgets resolve to one orchestra production without duplicate scenes', () => {
  const {info} = adapter(examples());
  const result = info('Musical – Start', 'en');
  assert.equal(result.sourceTitle, 'Musical – Tændstikorkestret (film)');
  assert.equal(result.duration, 30); assert.equal(result.sceneCount, 2); assert.equal(result.actCount, 0);
  assert.deepEqual(plain(result.scenes.map(s => [s.start, s.duration, s.group])), [[0, 16, ''], [16, 14, '']]);
});

test('recognition supports direct films, owner fields and literal/current-field widgets', () => {
  const rows = {Film: json('Film', film([{source: 'Scene', duration: 8}])), Scene: json('Scene', leaf('Scene', 8)),
    Owner: {title: 'Owner', 'animus-scene': 'Film'},
    Literal: {title: 'Literal', text: '<$musical-stage scene="Film" score="Score"/>'},
    Field: {title: 'Field', 'production-source': 'Film', text: '<$musical-stage scene={{!!production-source}}/>'},
    Single: {title: 'Single', text: "<$musical-stage scene='Film'/ >"},
    Article: {title: 'Article', type: 'text/vnd.tiddlywiki', text: 'A normal article'},
    PlainJson: json('PlainJson', {version: 1, parts: [], name: 'Ordinary CutOut'}),
    Broken: {title: 'Broken', text: '{bad JSON'},
    Example: {title: 'Example', text: '```html\n<$musical-stage scene="Film"/>\n```'},
    Comment: {title: 'Comment', text: '<!-- <$musical-stage scene="Film"/> -->'},
    Dynamic: {title: 'Dynamic', text: '<$musical-stage scene={{SomeTiddler}}/>'}};
  const {info} = adapter(rows);
  for (const title of ['Film', 'Owner', 'Literal', 'Field', 'Single']) assert.equal(info(title, 'en').sourceTitle, 'Film', title);
  for (const title of ['Article', 'PlainJson', 'Broken', 'Example', 'Comment', 'Dynamic', 'Absent']) assert.equal(info(title, 'en'), null, title);
  rows.Other = json('Other', film([{source: 'Scene', duration: 8}]));
  rows.Mixed = {title: 'Mixed', text: '<$musical-stage scene="Film"/>\n<$musical-stage scene="Other"/>'};
  assert.equal(info('Mixed'), null);
});

test('scene IDs resolve renamed sources and summaries never include private editing text', () => {
  const rows = {Film: json('Film', film([{source: 'Old name', sourceId: 'scene-id', name: 'A public scene', duration: 8}])),
    'New name': json('New name', {...leaf('Renamed scene', 8), sceneNotes: 'SECRET NOTES', parts: [{type: 'text', text: 'PRIVATE DIALOGUE'}]}, {'cutout-id': 'scene-id'})};
  const {info, html} = adapter(rows), result = info('Film', 'en');
  assert.equal(result.scenes[0].title, 'New name');
  assert.equal(result.scenes[0].label, 'A public scene');
  assert.doesNotMatch(JSON.stringify(result) + html(result, 'en'), /SECRET NOTES|PRIVATE DIALOGUE|sceneNotes|"parts"/);
});

test('nested speed and offsets produce real program starts and durations', () => {
  const rows = {A: json('A', leaf('A', 10)), B: json('B', leaf('B', 10)),
    Act: json('Act', {version: 1, name: 'Act', parts: [], scenes: [{source: 'A', duration: 10}, {source: 'B', duration: 10}]}),
    Film: json('Film', film([{source: 'Act', name: 'Act I', duration: 5, speed: 2, offset: 6}]))};
  const result = adapter(rows).info('Film', 'en');
  assert.equal(result.duration, 5); assert.equal(result.actCount, 1);
  assert.deepEqual(plain(result.scenes.map(s => [s.label, s.start, s.duration, s.group])), [['A', 0, 2, 'Act I'], ['B', 2, 3, 'Act I']]);
});

test('nested loop/reverse/start-delay timing follows the actual CutOut clock', () => {
  const base = {A: json('A', leaf('A', 10)), B: json('B', leaf('B', 10)), Act: json('Act', {version: 1, parts: [], scenes: [{source: 'A', duration: 10}, {source: 'B', duration: 10}]})};
  const show = settings => adapter({...base, Film: json('Film', film([{source: 'Act', name: 'Act I', ...settings}]))}).info('Film');
  assert.deepEqual(plain(show({duration: 25, loop: true}).scenes.map(s => [s.label, s.start, s.duration])), [['A', 0, 10], ['B', 10, 10], ['A', 20, 5]]);
  assert.deepEqual(plain(show({duration: 20, speed: -1, offset: 20}).scenes.map(s => [s.label, s.start, s.duration])), [['B', 0, 10], ['A', 10, 10]]);
  assert.deepEqual(plain(show({duration: 10, speed: 2, offset: 4, start: 3}).scenes.map(s => [s.label, s.start, s.duration])), [['A', 0, 6], ['B', 6, 4]]);
});

test('soundtrack tails extend the last held scene and missing song starts follow playlist order', () => {
  const rows = {Scene: json('Scene', leaf('Scene', 8)), Film: json('Film', film([{source: 'Scene', duration: 8}], {
    songs: [{score: 'First', start: 0, duration: 4}, {score: 'Second', duration: 6}],
    audioClips: [{start: 9, duration: 4}], sfx: [{t: 14, duration: 2}]
  }))};
  const result = adapter(rows).info('Film');
  assert.equal(result.duration, 16); assert.equal(result.sceneCount, 1);
  assert.equal(result.scenes[0].duration, 16);
});

test('adjacent separate clip instances remain separate scenes even when titles match', () => {
  const rows = {Scene: json('Scene', leaf('Same scene', 8)), Film: json('Film', film([{source: 'Scene', duration: 8}, {source: 'Scene', duration: 8}]))};
  const result = adapter(rows).info('Film');
  assert.equal(result.sceneCount, 2);
  assert.deepEqual(plain(result.scenes.map(s => [s.start, s.duration])), [[0, 8], [8, 8]]);
});

test('missing sources, cycles and excessive depth stop safely without leaking JSON or mutating sources', () => {
  const rows = {Film: json('Film', film([{source: 'Cycle', duration: 8}, {source: 'Missing', duration: 8}])), Cycle: json('Cycle', {version: 1, parts: [], scenes: [{source: 'Film', duration: 8}]})};
  const before = JSON.stringify(rows), result = adapter(rows).info('Film');
  assert.equal(result.duration, 16); assert.equal(result.incomplete, true); assert.equal(result.sceneCount, 0);
  assert.equal(JSON.stringify(rows), before);
  for (let i = 0; i < 24; i++) rows['Deep' + i] = json('Deep' + i, {version: 1, parts: [], scenes: [{source: 'Deep' + (i + 1), duration: 8}]});
  rows.Film = json('Film', film([{source: 'Deep0', duration: 8}]));
  assert.equal(adapter(rows).info('Film').incomplete, true);
});

test('Program HTML is localized, escaped and contains only audience metadata', () => {
  const {html} = adapter({});
  const info = {title: '<script>alert("x")</script>', sourceTitle: 'Private source title', duration: 16, actCount: 1,
    scenes: [{title: 'Secret JSON', label: '<img src=x onerror=alert(1)>', start: 0, duration: 16, group: 'Act "<one>"'}], sceneNotes: 'DO NOT RENDER', parts: [{id: 'SECRET'}]};
  const da = html(info, 'da-DK'), en = html(info, 'en');
  assert.match(da, /aria-label="Program"/); assert.match(en, /aria-label="Programme"/);
  assert.match(da, /Varighed/); assert.match(en, /Duration/); assert.match(da, /0:16/);
  assert.match(da, /1 scene · 1 akt/); assert.match(en, /1 scene · 1 act/);
  assert.match(da, /&lt;script&gt;/); assert.match(da, /&lt;img/);
  assert.doesNotMatch(da, /<script|<img|Private source title|Secret JSON|DO NOT RENDER|SECRET|<h2>Program/);
  assert.match(da, /data-scene-start="0"/);
  assert.equal(html(null, 'da'), '');
});

test('large repeated scene programs have a bounded traversal budget', () => {
  const rows = {Film: json('Film', film([{source: 'Cycle', duration: 100000, loop: true}])),
    A: json('A', leaf('A', 1)), B: json('B', leaf('B', 1)),
    Cycle: json('Cycle', {version: 1, parts: [], scenes: [{source: 'A', duration: 1}, {source: 'B', duration: 1}]})};
  const result = adapter(rows).info('Film');
  assert.equal(result.incomplete, true);
  assert.ok(result.scenes.length <= 2048);
  assert.equal(result.duration, 100000);
});
