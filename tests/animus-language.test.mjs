import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {language} from './helpers/animus-language.mjs';

const rows=JSON.parse(readFileSync(new URL('../editions/turn-around/tiddlers/production.json',import.meta.url),'utf8'));
const records=new Map(rows.map(row=>[row.title,row]));
const film='Turn Around · Complete performance (film)';

test('AniMus selects Danish only for Danish and looks up display names within the current production',()=>{
 let selected;
 const wiki={
  getTiddlerText:()=>selected,
  getTiddler:title=>records.has(title)?{fields:records.get(title)}:null,
  getTiddlerData:title=>JSON.parse(records.get(title).text)
 };
 for(const [locale,danish] of [['da-DK',true],['da',true],['en-GB',false],['fr-FR',false],['',false],['da-DK',true]]){
  selected=locale?'$:/languages/'+locale:'';
  assert.equal(language.isDanish(wiki),danish);
  const label=language.projectLabels(wiki,film);
  assert.equal(label('The Whole World'),danish?'Hele verden':'The Whole World');
  assert.equal(label('My edited scene'),'My edited scene');
  assert.equal(language.projectLabels(wiki,'My own show')('The Whole World'),'The Whole World');
 }
});

test('each built-in Turn Around chapter and score has a Danish display name and one shared editor or player',()=>{
 const labels=JSON.parse(records.get(records.get(film)['animus-labels-da']).text);
 for(const [index,scene] of JSON.parse(records.get(film).text).scenes.entries()){
  assert.ok(labels[scene.name]);
  const score='Turn Around · Score · '+String(index+1).padStart(2,'0')+' · '+scene.name;
  assert.ok(labels[score].endsWith(labels[scene.name]));
 }
 for(const [title,widget] of [['Turn Around','plato-player'],['Turn Around · AniMus','plato-studio'],['Turn Around · Script','plato-studio']]){
  assert.equal(records.get(title).text.split('<$'+widget+' ').length,2);
 }
});
