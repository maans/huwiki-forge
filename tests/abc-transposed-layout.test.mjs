import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url);
const load=path=>readFile(new URL(path,root),'utf8');
const source=await load('plugins/abc/src/transposed-layout.js');
const {options}=(()=>{const exports={};runInNewContext(source,{exports});return exports;})();
function host(){
 const parent={children:[],ownerDocument:{createElement(){return {style:{},parentNode:null};}},appendChild(child){this.children.push(child);child.parentNode=this;},removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parentNode=null;}};
 return parent;
}
test('written B-flat and E-flat scores use original concert system breaks without mutating audio or source',()=>{
 for(const transpose of [2,-3]){
  const container=host(),rendered=[];
  const abc={renderAbc(node,source,settings){
   rendered.push({node,source,settings});
   return [{lineBreaks:[[3],[2,5]]}];
  }};
  const base={visualTranspose:transpose,wrap:{minSpacing:1.5,preferredMeasuresPerLine:3},staffwidth:720,
   clickListener(){},afterParsing(){},responsive:'resize',expandToWidest:true};
  const fixed=options(abc,container,'X:1\nK:C\nCDEF|GABc|',base);
  assert.equal(rendered.length,1);
  assert.equal(rendered[0].source,'X:1\nK:C\nCDEF|GABc|');
  assert.equal(rendered[0].settings.visualTranspose,0);
  assert.equal(rendered[0].settings.wrap,base.wrap);
  assert.equal(rendered[0].settings.clickListener,undefined);
  assert.equal(fixed.visualTranspose,transpose);
  assert.equal(fixed.staffwidth,720);
  assert.equal(fixed.expandToWidest,true);
  assert.deepEqual(JSON.parse(JSON.stringify(fixed.lineBreaks)),[[3],[2,5]]);
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
test('reference render failure retains the existing transposed engraving as a safe fallback',()=>{
 const container=host(),base={visualTranspose:-3,wrap:{minSpacing:1.5}};
 assert.equal(options({renderAbc(){throw Error('test failure');}},container,'X:1',base),base);
 assert.equal(container.children.length,0);
});
test('published ABC plugin uses the new notation-only layout helper',async()=>{
 const pkg=JSON.parse(await load('plugins/abc/dist/plugin.json'));
 const built=JSON.parse(pkg.text).tiddlers;
 const title='$:/plugins/huwiki/abc/transposed-layout.js';
 assert.equal(built[title]?.text,source);
 const widgetSource=await load('plugins/abc/src/score-widget.js');
 assert.equal(built['$:/plugins/huwiki/abc/score-widget.js']?.text,widgetSource);
 assert.match(widgetSource,/TransposedLayout\.options\(ABC,host,displayed/);
 assert.match(widgetSource,/visualTranspose:InstrumentView\.current\(\)\.semitones/);
});