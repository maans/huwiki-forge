import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {runInNewContext} from "node:vm";

const root=path.resolve(import.meta.dirname,"..");
const plugin=JSON.parse(await readFile(path.join(root,"plugins/abc/dist/plugin.json"),"utf8"));
const bundled=JSON.parse(plugin.text).tiddlers;
const prefix="$:/plugins/huwiki/abc/";
const code=await readFile(path.join(root,"plugins/abc/src/reader-mode.js"),"utf8");
const widget=await readFile(path.join(root,"plugins/abc/src/score-widget.js"),"utf8");
const css=await readFile(path.join(root,"plugins/abc/src/ReaderMode.tid"),"utf8");

test("ABC starts in Minimal view; the mixer stays closed until needed",async()=>{
 const src=await readFile(path.join(root,"plugins/abc/src/score-view.js"),"utf8");
 const resolved={};runInNewContext(src,{exports:resolved});
 assert.equal(resolved.resolve({},{}).view,"minimal","new score without a setting uses minimal");
 assert.equal(resolved.resolve({view:"full"},{}).view,"full","explicit full macro in nodebook stays full");
 const player=await readFile(path.join(root,"plugins/abc/src/minimal-player.js"),"utf8");
 assert.ok(player.includes("initiallyVisible:false"),"lazily opened mixer starts hidden");
 assert.ok(!player.includes("if(visual&&controls&&options.sidebarMixer)ensureMiniMixer();"),
  "a score should not open a sidebar mixer just because it is visible");
 assert.match(player,/ensureMiniMixer\(\)\.toggle/,"mixer is still available from the player control");
 const score=await readFile(path.join(root,"plugins/abc/src/score-widget.js"),"utf8");
 assert.ok(score.includes("this._manualMode||(t.fields['abc-view']==='chords'?'chords':'minimal')"),"ordinary advanced scores open minimal; saved chord charts open in chord-only view");
 assert.ok(score.includes("Avanceret visning"),"Danish advanced label");
 assert.ok(score.includes("Normal visning"),"quiet default is named Normal");
 assert.ok(score.includes("Normal view"),"English quiet view label");
 assert.ok(score.includes("Advanced view"),"English advanced label");
 assert.ok(!score.includes("new $tw.Tiddler(current,{'abc-view':next})"),
  "mode changes never rewrite a source tiddler");
});

test("ABC ships one shared musician reader instead of forking the notation engine",()=>{
 assert.equal(bundled[prefix+"reader-mode.js"]?.text,code);
 assert.equal(bundled[prefix+"score-widget.js"]?.text,widget);
 assert.equal(bundled[prefix+"ReaderMode"]?.type,"text/css");
 assert.ok(bundled[prefix+"ReaderMode"].text.includes("huwabc-reader-active"));
 assert.match(widget,/ReaderMode\.mount\(\{host:host,paper:score,actions:actions/);
 assert.match(widget,/if\(this\._reader\)\{this\._readerState=this\._reader\.snapshot\(\)/);
 assert.match(widget,/if\(self\._reader\)self\._reader\.update\(\)/);
 assert.ok(css.includes("min-height:0!important"));
 assert.ok(css.includes(".huwabc-reader-active > .huwabc-page-shell{"),"show PageView\'s actual paginated shell");
 assert.ok(!css.includes(".huwabc-reader-active > .huwabc-paper{"),"the raw score is nested inside the page shell");
 assert.ok(css.includes("z-index:30100"));
});
test("Reader supports page and tune boundaries, preserving playing score",()=>{
 const exports={};runInNewContext(code,{exports});
 assert.equal(exports.pageAction({count:0,page:1,shown:1},1),"unready");
 assert.equal(exports.pageAction({count:4,page:1,shown:1},1),"page");
 assert.equal(exports.pageAction({count:4,page:3,shown:2},1),"boundary");
 assert.equal(exports.pageAction({count:4,page:1,shown:1},-1),"boundary");
 assert.equal(exports.pageAction({count:4,page:2,shown:2},-1),"page");
 assert.ok(!/wiki\.addTiddler/.test(code),"reading mode must not write the original ABC");
 assert.ok(!/\.destroy\(\)\s*;\s*.*_audioController/.test(code),"reader should not destroy an audio controller");
 assert.ok(code.includes("this.host.classList.toggle"),"mode switches use CSS rather than rerendering the score");
 assert.ok(code.includes("huwabc-reader-boundary"),"Repertoire can listen for cross-song turns");
 assert.ok(code.includes("outerChoice.dispatchEvent"),"manual ABC page modes must not conflict with a parent Repertoire book");
});

test("Normal score pages grow with the available reading height, without altering music or edit view",async()=>{
 const pageCode=await readFile(path.join(root,"plugins/abc/src/page-view.js"),"utf8");
 assert.equal(bundled[prefix+"page-view.js"]?.text,pageCode,
  "the published ABC plugin must use the responsive pagination module");
 const exports={};
 runInNewContext(pageCode,{exports,require(){return {};}});
 const height=exports.availablePageHeight;
 assert.equal(height(1000,220,56,false),708,"visible area beneath controls replaces the old 640px cap");
 assert.equal(height(1000,70,56,false),858,"hiding panels lets the page grow vertically");
 assert.equal(height(1000,690,56,false),640,"scores below the fold retain a usable minimum");
 assert.equal(height(1000,70,56,true),480,"editor preview retains its original limit");
 assert.equal(height(1400,110,56,false),1218,"tall displays are no longer limited to 800px");
 assert.match(pageCode,/observer\.observe\(outer\)/,"watch changes to the enclosing frame");
 assert.match(pageCode,/viewport\.getBoundingClientRect\(\)\.top/,"measure the page's position, not just the window");
 assert.match(pageCode,/Move the original system SVGs, not copies/,"keep ABC playback and note selection untouched");
});

test("Reader sizing uses measured viewport with default fit and no fixed zoom",()=>{
 assert.match(code,/this\.fitMode="fit"/);
 assert.match(code,/\["fit","Tilpas skærm"\]/);
 assert.match(code,/\["width","Fyld bredden"\]/);
 assert.match(code,/\["original","Original størrelse"\]/);
 assert.match(code,/shell\.clientWidth/);
 assert.match(code,/shell\.clientHeight/);
 assert.match(code,/viewport\.style\.zoom/);
 assert.doesNotMatch(css,/zoom:1\.22/);
});
