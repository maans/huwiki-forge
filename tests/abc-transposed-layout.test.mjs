import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url);
const load=path=>readFile(new URL(path,root),'utf8');
const source=await load('plugins/abc/src/transposed-layout.js');
const volta={};runInNewContext(await load('plugins/abc/src/volta-layout.js'),{exports:volta});
const {options,referenceBreaks}=(()=>{const exports={};runInNewContext(source,{exports,require:()=>volta});return exports;})();
function host(){
 const parent={children:[],ownerDocument:{createElement(){return {style:{},parentNode:null};}},appendChild(child){this.children.push(child);child.parentNode=this;},removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;}};
 return parent;
}
const bar=()=>({el_type:'bar'}),note=()=>({el_type:'note'});
const concertTune={
 lineBreaks:[
  {ogLine:0,line:0,staff:0,voice:0},{ogLine:0,line:1,staff:0,voice:0},
  {ogLine:1,line:2,staff:0,voice:0}
 ],
 lines:[
  {staff:[{voices:[[note(),bar(),note(),bar(),note(),bar()]]}]},
  {staff:[{voices:[[note(),bar(),note(),bar()]]}]},
  {staff:[{voices:[[note(),bar(),note(),bar()]]}]}
 ]
};
test('convert ABCJS mapping to zero-based original measure break positions',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(referenceBreaks(concertTune))),[[2],[]]);
 assert.equal(referenceBreaks({lineBreaks:[3,5],lines:concertTune.lines}),null);
 assert.equal(referenceBreaks({lineBreaks:[],lines:[]}),null);
});
test('written B-flat and E-flat scores use original concert system breaks without mutating audio or source',()=>{
 for(const transpose of [2,-3]){
  const container=host(),rendered=[];
  const abc={renderAbc(node,input,settings){
   rendered.push({node,input,settings});
   return [concertTune];
  }};
  const base={visualTranspose:transpose,wrap:{minSpacing:1.5,preferredMeasuresPerLine:3},staffwidth:720,
   clickListener(){},afterParsing(){},responsive:'resize',expandToWidest:true};
  const fixed=options(abc,container,'X:1\nK:C\nCDEF|GABc|',base);
  assert.equal(rendered.length,1);
  assert.equal(rendered[0].input,'X:1\nK:C\nCDEF|GABc|');
  assert.equal(rendered[0].settings.visualTranspose,0);
  assert.equal(rendered[0].settings.wrap,base.wrap);
  assert.equal(rendered[0].settings.clickListener,undefined);
  assert.equal(fixed.visualTranspose,transpose);
  assert.equal(fixed.staffwidth,720);
  assert.equal(fixed.afterParsing,base.afterParsing);
  assert.equal(fixed.expandToWidest,true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixed.lineBreaks)),[[2],[]]);
  assert.equal(fixed.wrap,undefined);
  assert.equal(base.lineBreaks,undefined);
  assert.equal(container.children.length,0,'temporary reference cannot remain in the score DOM');
 }
});
test('concert and manually fixed-score layouts require no hidden extra rendering',()=>{
 const container=host(),abc={renderAbc(){throw Error('unnecessary reference render');}};
 const concert={visualTranspose:0,wrap:{minSpacing:1.5}},explicit={visualTranspose:-3,lineBreaks:[[3]],wrap:null};
 assert.equal(options(abc,container,'X:1',concert),concert);
 assert.equal(options(abc,container,'X:1',explicit),explicit);
 assert.equal(container.children.length,0);
});
test('reference render failure or unexpected return retains original engraving as a fallback',()=>{
 const container=host(),base={visualTranspose:-3,wrap:{minSpacing:1.5}};
 assert.equal(options({renderAbc(){throw Error('test failure');}},container,'X:1',base),base);
 assert.equal(options({renderAbc(){return [{lineBreaks:[[2]],lines:[]}];}},container,'X:1',base),base);
 assert.equal(container.children.length,0);
});
test('published ABC plugin uses the source notation-only layout helper',async()=>{
 const pkg=JSON.parse(await load('plugins/abc/dist/plugin.json'));
 const built=JSON.parse(pkg.text).tiddlers;
 const title='$:/plugins/huwiki/abc/transposed-layout.js';
 assert.equal(built[title]?.text,source);
 const widgetSource=await load('plugins/abc/src/score-widget.js');
 assert.equal(built['$:/plugins/huwiki/abc/score-widget.js']?.text,widgetSource);
 assert.match(widgetSource,/TransposedLayout\.options\(ABC,host,displayed/);
 assert.match(widgetSource,/visualTranspose:InstrumentView\.current\(\)\.semitones/);
});

