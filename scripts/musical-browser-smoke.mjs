/** Musical Edition: first-boot, score, real CutOut camera and single transport. */
import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
import {loadEdition,assembleHtml} from "../assembler/assemble.mjs";

const root=path.resolve(import.meta.dirname,"..");
const dir=await mkdtemp(path.join(tmpdir(),"musical-"));
const localFetch=async url=>{
 try{
  const body=await readFile(path.join(root,new URL(url).pathname),"utf8");
  return {ok:true,json:async()=>JSON.parse(body)};
 }catch{return {ok:false,status:404};}
};
const {tiddlers}=await loadEdition("https://forge.test/editions/musical/manifest.json",localFetch);
const file=path.join(dir,"Musical.html");
await writeFile(file,assembleHtml(await readFile(path.join(root,"core/empty.html"),"utf8"),tiddlers));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await ctx.newPage(),errors=[];
 page.setDefaultTimeout(25000);
 page.on("pageerror",e=>errors.push(e.message));
 await ctx.route("**/*",route=>route.request().url().startsWith("file:")?route.continue():route.abort());
 await page.goto(pathToFileURL(file).href);
 const player=page.locator(".huw-musical");
 try{await player.waitFor();}catch(error){
 console.log("DEBUG page title:",await page.title());
 console.log("DEBUG errors:",errors);
 console.log("DEBUG body:",(await page.locator("body").innerText()).slice(0,7000));
 console.log("DEBUG TiddlyWiki:",await page.evaluate(()=>typeof $tw==="undefined"?"not booted":{
  language:$tw.wiki.getTiddlerText("$:/language"),
  defaultTiddlers:$tw.wiki.getTiddlerText("$:/DefaultTiddlers"),
  plugin:!!$tw.wiki.getTiddler("$:/plugins/huwiki/musical"),
  start:!!$tw.wiki.getTiddler("Musical – Start"),
  widget:typeof $tw.modules.types.widget?.["musical-stage"]
 }));
 throw error;
}
 try{await player.locator(".huw-musical-canvas svg").first().waitFor();}catch(e){
 console.log("DEBUG Musical stage:",(await player.innerText()).slice(0,3500));
 console.log("DEBUG HTML:",(await player.innerHTML()).slice(0,5500));
 console.log("DEBUG element counts:",await page.evaluate(()=>{
 const p=document.querySelector(".huw-musical");
 const svg=p?.querySelector(".huw-musical-canvas svg"),stage=p?.querySelector(".huw-musical-stage");
 return {stage:!!stage,svgs:p?.querySelectorAll("svg").length,canvas:p?.querySelectorAll(".huw-musical-canvas").length,svgRect:svg?.getBoundingClientRect().toJSON(),stageRect:stage?.getBoundingClientRect().toJSON(),css:svg?getComputedStyle(svg).cssText:"",children:p?.children.length};
 }));
 console.log("DEBUG startup errors:",errors);
 console.log("DEBUG source fields:",await page.evaluate(()=>{
  const score=$tw.wiki.getTiddler("Musical – Tændstikorkestret (ABC)"),
    film=$tw.wiki.getTiddler("Musical – Tændstikorkestret (film)");
  return {scoreFields:score?Object.keys(score.fields):[],filmFields:film?Object.keys(film.fields):[],scoreSourceLength:score?.fields["abc-source"]?.length||0,filmTextStart:film?.fields.text?.slice(0,120)};
 }));
 throw e;
}
 await player.locator(".huw-musical-paper svg").first().waitFor();
 assert.equal(await player.locator(".huw-musical-shot").count(),15);
 assert.equal(await player.locator(".huw-musical-play").count(),1);
 assert.equal(await player.locator(".huw-cutout-player").count(),0,"No second CutOut transport");
 const stage=player.locator(".huw-musical-canvas > svg");
 const wide=await stage.getAttribute("viewBox");
 const dancer=player.locator('[data-cutout-id="drummer-root"]').first();
 const startingPose=await dancer.getAttribute("transform");
 await player.getByRole("button",{name:"Trommesolo"}).click();
 const close=await stage.getAttribute("viewBox");
 assert.notEqual(close,wide,"Camera should cut to the drummer");
 assert.ok(/^\d/.test(await player.getAttribute("data-camera-time")));
 const slider=player.locator(".huw-musical-range");
 await slider.fill("11");await slider.dispatchEvent("input");
 assert.notEqual(await dancer.getAttribute("transform"),startingPose,"The figures should dance when scrubbing");
 assert.notEqual(await stage.getAttribute("viewBox"),close,"Camera should follow the film timeline");
 const tracks=player.locator(".huw-musical-track");
 assert.ok(await tracks.count()>=15,"Each complete ABC tune needs its own track");
 assert.equal(await player.locator(".huw-musical-song-clip").count(),2,"Two complete ABC tracks are visible");
 assert.equal(await player.locator(".huw-musical-track:has(.huw-musical-song-clip)").count(),2);
 assert.equal(await player.locator(".huw-musical-fade-left").count(),2);
 assert.equal(await player.locator(".huw-musical-fade-right").count(),2);
 await slider.fill("15");await slider.dispatchEvent("input");
 assert.equal(await player.getAttribute("data-active-song-count"),"2","Both score sheets show during the crossfade");
 assert.equal(await player.locator('.huw-musical-score-page[data-song-index="0"]').isVisible(),true);
 assert.equal(await player.locator('.huw-musical-score-page[data-song-index="1"]').isVisible(),true);
 const volumes=await page.evaluate(function(){
  function locate(w){
   if(w&&w.host&&w.host.classList&&w.host.classList.contains("huw-musical"))return w;
   for(const child of (w&&w.children)||[]){var found=locate(child);if(found)return found;}
   return null;
  }
  var widget=locate($tw.rootWidget);
  if(!widget||!widget._songStates||widget._songStates.length!==2)throw Error("Missing independent ABC controllers");
  return widget._songStates.map(function(s){return {id:s.clip.id,gain:s.gain};});
 });
 assert.ok(volumes.every(x=>x.gain>.68&&x.gain<.74),"Both tracks have equal-power crossfade gain at midpoint");
 await slider.fill("19");await slider.dispatchEvent("input");
 assert.match(await player.getAttribute("data-active-song"),/Finale ABC/,"The second whole song takes over the notation");
 assert.equal(await player.locator('.huw-musical-score-page[data-song-index="1"]').isVisible(),true);
 assert.equal(await player.locator('.huw-musical-score-page[data-song-index="0"]').isVisible(),false);
 const mixer=await page.evaluate(function(){
  function locate(w){if(w&&w._songStates&&w.host&&w.host.classList.contains("huw-musical"))return w;
   for(const child of w.children||[]){var found=locate(child);if(found)return found;}return null;}
  var widget=locate($tw.rootWidget),songs=widget._songStates,old=songs.map(function(s){return {buffer:s.controller.midiBuffer,loaded:s.controller.isLoaded,applied:s.appliedGain};});
  var recorded=[];
  try{
   songs.forEach(function(s,i){
    s.controller.isLoaded=true;s.appliedGain=-1;
    s.controller.midiBuffer={setVolumes:function(){recorded.push({i:i,gain:s.gain});}};
   });
   var slider=widget.host.querySelector(".huw-musical-range");
   slider.value="15";slider.dispatchEvent(new Event("input",{bubbles:true}));
   return recorded;
  }finally{
   songs.forEach(function(s,i){s.controller.midiBuffer=old[i].buffer;s.controller.isLoaded=old[i].loaded;s.appliedGain=old[i].applied;});
  }
 });
 assert.deepEqual(mixer.map(x=>x.i).sort(),[0,1],"Both ABC mixer gain channels receive updates");
 const play=player.locator(".huw-musical-play");
 await play.waitFor({state:"visible"});
 await page.waitForFunction(()=>!document.querySelector(".huw-musical-play").disabled,{timeout:25000});
 assert.equal(await player.locator(".huw-musical-error").count(),0);
 await player.locator(".huw-musical-speed").selectOption("75");
 await player.locator(".huw-musical-stop").click();
 assert.equal(Number(await slider.inputValue()),0);
 assert.equal(await page.locator(".tc-error-form").count(),0);
 assert.deepEqual(errors,[]);
 console.log("PASS Musical: two independently placed ABC tracks, equal-power crossfade, dual notation, mixer gain updates, CutOut camera and one transport");
}finally{await browser.close();}
