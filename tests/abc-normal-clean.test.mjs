import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const pkg=JSON.parse(await readFile(path.join(root,"plugins/abc/dist/plugin.json"),"utf8"));
const t=JSON.parse(pkg.text).tiddlers,prefix="$:/plugins/huwiki/abc/";
const compact=await readFile(path.join(root,"plugins/abc/src/minimal-player.js"),"utf8");
const instrument=await readFile(path.join(root,"plugins/abc/src/instrument-view.js"),"utf8");
const style=await readFile(path.join(root,"plugins/abc/src/NormalStyles.tid"),"utf8");
const full=await readFile(path.join(root,"plugins/abc/src/score-widget.js"),"utf8");
test("Normal view is a real compact player, not hidden but mounted advanced controls",()=>{
 assert.equal(t[prefix+"minimal-player.js"].text,compact);
 assert.ok(!compact.includes("instrumentBar"),"No C/B-flat/E-flat instrument row");
 assert.ok(!compact.includes("PDF / Udskriv"),"No PDF button in Normal");
 assert.match(compact,/PageView\.mount\(paper/,"The normal page turner is intact");
 assert.match(compact,/controller\.load\(controls/,"Play button is intact");
 assert.match(compact,/installMixerButton\(\)/,"Mixer can still be opened on demand");
 assert.match(compact,/InstrumentView\.observe/,"Other instrument views can update Normal scores");
 assert.match(compact,/stopInstrumentObserver\(\)/,"Destroy must unsubscribe from instrument updates");
});
test("No redundant upper rows, but the music stand remains navigable",()=>{
 const css=style.slice(style.indexOf("\n\n")+2);
 assert.equal(t[prefix+"minimal-player.css"].text,css);
 assert.match(css,/\.huwabc-score\.huwabc-minimal \.huwabc-page-shell:not\(\.huwabc-page-is-desk\)>\.huwabc-page-toolbar\{display:none!important\}/);
 assert.match(css,/\.huw-music-media-abc:has\(>\.huwabc-score\.huwabc-standalone\.huwabc-minimal\)>\.huw-music-section-label\{display:none!important\}/);
 assert.ok(!css.includes(".huwabc-page-nav{display:none"),"Page navigation remains visible");
 assert.match(full,/InstrumentView\.mount\(instrumentBar/,"Advanced has instrument controls");
 assert.match(full,/button\("PDF \/ Udskriv"/,"Advanced retains printing");
 assert.match(full,/Avanceret visning/);
 assert.match(full,/Normal visning/);
 assert.doesNotMatch(full,/minimal\?\(danish\?'Avanceret visning':'Advanced view'\):\(danish\?'Minimal visning'/);
});
test("Normal instrument listener updates without creating any UI",()=>{
 assert.equal(t[prefix+"instrument-view.js"].text,instrument);
 const exports={};
 runInNewContext(instrument,{exports,require(name){assert.match(name,/i18n\.js$/);return {language(){return "da";}};}});
 let count=0;
 const unsubscribe=exports.observe(()=>count++);
 exports.change("bb");
 assert.equal(count,1);
 unsubscribe();
 exports.change("c");
 assert.equal(count,1);
});
