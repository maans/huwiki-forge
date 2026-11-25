import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const pkg=JSON.parse(await read('plugins/abc/dist/plugin.json'));
const tiddlers=JSON.parse(pkg.text).tiddlers,prefix='$:/plugins/huwiki/abc/',cache={};
function load(name){
 if(cache[name])return cache[name];
 const module={exports:{}};cache[name]=module.exports;
 runInNewContext(tiddlers[prefix+name].text,{module,exports:module.exports,window:{},require:id=>load(id.slice(prefix.length))});
 return cache[name]=module.exports;
}
const ABC=load('vendor/abcjs.js'),sheet=load('sheet-layout.js'),engraving=load('engraving-rules.js');
const exports={};
runInNewContext(await read('plugins/musescore-import/src/widget.js'),{
 exports,$tw:{wiki:{getTiddlerText:()=>'$:/languages/da-DK'}},
 require:name=>name==='$:/core/modules/widgets/widget.js'?{widget:class {}}:{}
});
const createFields=exports['huwiki-ms-import'].prototype.createAbcFields;

// The real Veseo source has labels at bars 1, 2, 9 and 16. These annotations
// must survive while an explicit four-bar layout remains the same as preview.
const source='X:1\nT:Veseo Čoček\nM:9/8\nL:1/8\nK:Am\n'+
 '[P:A]A9 | [P:Intro Bar 15-16]B9 | c9 | d9 |\n'+
 'A9 | B9 | c9 | d9 |\n'+
 '[P:B]A9 | B9 | c9 | d9 |\n'+
 'A9 | B9 | c9 | [P:Intro]d9 |\n';
function fields(){
 return createFields.call({},
  {title:'Veseo Čoček',name:'veseo-cocek-capo5.mscz',format:'mscx',staves:[{name:'C trompet',voices:[{id:'1:0'}]}]},
  {selected:['1:0'],title:'Veseo Čoček',start:1,end:16,barsPerLine:4},source);
}
function renderModel(settings){
 const tune=ABC.parseOnly(settings['abc-source'],sheet.options(ABC,settings['abc-source'],settings))[0];
 engraving.prepare(tune,settings,settings['abc-source']);
 return tune;
}
function systemBars(tune){
 return Array.from(tune.lines).filter(line=>line.staff).map(line=>line.staff[0].voices[0].filter(e=>e.el_type==='bar').length);
}
function labels(tune){
 return Array.from(tune.lines).flatMap(line=>Array.from(line.staff||[]).flatMap(staff=>Array.from(staff.voices).flatMap(voice=>Array.from(voice).filter(e=>e.el_type==='part').map(e=>e.title))));
}

test('import keeps four 9/8 bars per system without dropping Veseo section labels',()=>{
 const imported=fields();
 assert.equal(imported['abc-bars-per-line'],'4');
 assert.equal(imported['abc-parts-new-line'],'no');
 assert.equal(imported['abc-source'],source,'layout fields do not rewrite the music or annotations');
 const tune=renderModel(imported);
 assert.deepEqual(systemBars(tune),[4,4,4,4]);
 assert.deepEqual(labels(tune),['A','Intro Bar 15-16','B','Intro']);
 assert.equal(tune.getBarLength(),9/8);
});

test('an imported score can explicitly restore section-driven breaks without changing global defaults',()=>{
 const imported=fields(),overridden={...imported,'abc-parts-new-line':'yes'};
 assert.equal(engraving.partLines({'abc-bars-per-line':'4'}),true,'other scores retain the existing default');
 assert.deepEqual(systemBars(renderModel(overridden)),[1,3,4,4,3,1]);
 assert.deepEqual(labels(renderModel(overridden)),['A','Intro Bar 15-16','B','Intro']);
});
