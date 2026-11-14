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
 assert.ok(await tracks.count()>=14,"Whole-song and CutOut tracks must be shown");
 assert.equal(await player.locator(".huw-musical-song-clip").count(),2,"Two full ABC songs are on the one track");
 await player.locator(".huw-musical-song-clip").nth(1).click();
 assert.match(await player.getAttribute("data-active-song"),/Finale ABC/,"Selecting the second clip switches notation");
 assert.equal(await player.locator('.huw-musical-score-page[data-song-index="1"]').isVisible(),true);
 assert.equal(await player.locator('.huw-musical-score-page[data-song-index="0"]').isVisible(),false);
 assert.ok(Number(await slider.inputValue())>=15,"Scrubbing uses global song time");
 await player.locator(".huw-musical-song-clip").first().click();
 assert.ok((await player.getAttribute("data-active-song")).endsWith("(ABC)"));
 const play=player.locator(".huw-musical-play");
 await play.waitFor({state:"visible"});
 await page.waitForFunction(()=>!document.querySelector(".huw-musical-play").disabled,{timeout:25000});
 assert.equal(await player.locator(".huw-musical-error").count(),0);
 const simulated=await page.evaluate(function(){
  function locate(w){
   if(w&&w.host&&w.host.classList&&w.host.classList.contains("huw-musical"))return w;
   for(const child of (w&&w.children)||[]){var result=locate(child);if(result)return result;}
   return null;
  }
  var widget=locate($tw.rootWidget);
  if(!widget||!widget._songStates||widget._songStates.length!==2)throw Error("Musical song controllers not found");
  var first=widget._songStates[0].controller,second=widget._songStates[1].controller;
  if(!first||!second||!first.cursorControl||!second.cursorControl)throw Error("ABC callbacks missing");
  second.play=function(){second.cursorControl.onStart();return Promise.resolve({status:"simulated"});};
  first.cursorControl.onFinished();
  return {active:widget.host.dataset.activeSong,position:Number(widget.host.querySelector(".huw-musical-range").value)};
 });
 assert.match(simulated.active,/Finale ABC/,"Finishing song one activates song two");
 assert.ok(simulated.position>=15,"The second tune starts at its global position");
 await player.locator(".huw-musical-speed").selectOption("75");
 await player.locator(".huw-musical-stop").click();
 assert.equal(Number(await slider.inputValue()),0);
 assert.equal(await page.locator(".tc-error-form").count(),0);
 assert.deepEqual(errors,[]);
 console.log("PASS Musical standalone wiki, multi-voice ABC notation, six actors, nine camera shots, scrub, tempo and one transport");
}finally{await browser.close();}
