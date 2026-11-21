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
 assert.ok(score.includes("this._manualMode||'minimal'"),"existing advanced scores open minimal");
 assert.ok(score.includes("Avanceret visning"),"Danish advanced label");
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
