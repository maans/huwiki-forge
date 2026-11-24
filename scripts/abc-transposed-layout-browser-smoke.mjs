import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const pkg=JSON.parse(await readFile(new URL('../plugins/abc/dist/plugin.json',import.meta.url),'utf8'));
const entries=JSON.parse(pkg.text).tiddlers;
const vendor=entries['$:/plugins/huwiki/abc/vendor/abcjs.js']?.text;
const helper=entries['$:/plugins/huwiki/abc/transposed-layout.js']?.text;
const voltaId='$:/plugins/huwiki/abc/volta-layout.js';
const voltaSource=entries[voltaId]?.text;
assert.ok(vendor && helper && voltaSource,'The released ABCJS and both layout modules must be present');
const bars=[
  'C D E F G A B c|','c B A G F E D C|','E2 G2 c2 e2|',
  'g f e d c B A G|','^F G =F E D C B A|','_B c d e f g a b|',
  'z2 E2 F2 G2|','[CEG]2 [DFA]2 [EGB]2 [Fac]2|'
];
const source=['X:1','T:Written transposition layout regression','M:4/4','L:1/8','K:C',
  ...bars.concat(bars,bars)].join('\n');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1240,height:900}});
 await page.setContent('<div id="host"><div id="concert"></div><div id="bb"></div><div id="eb"></div></div>');
 await page.addScriptTag({content:vendor});
 const result=await page.evaluate(({source,helper,voltaId,voltaSource})=>{
  const volta={};new Function('exports',voltaSource)(volta);
  const api={};new Function('exports','require',helper)(api,id=>{
   if(id===voltaId)return volta;
   throw new Error('Missing test dependency: '+id);
  });
  const ABC=window.ABCJS,host=document.querySelector('#host');
  const opts={staffwidth:720,responsive:'resize',oneSvgPerLine:true,expandToWidest:true,
    wrap:{minSpacing:1.5,maxSpacing:2.8,preferredMeasuresPerLine:3},format:{stretchlast:true}};
  const concert=ABC.renderAbc(document.querySelector('#concert'),source,{...opts,visualTranspose:0})[0];
  const render=(selector,visualTranspose)=>{
   const output=document.querySelector(selector);
   const chosen=api.options(ABC,host,source,{...opts,visualTranspose});
   const tune=ABC.renderAbc(output,source,chosen)[0];
   return {breaks:tune.lineBreaks||null,lines:output.querySelectorAll('svg').length,
    fixed:!!chosen.lineBreaks,wrapped:!!chosen.wrap,warning:(tune.warnings||[]).slice(0,2)};
  };
  const bb=render('#bb',2),eb=render('#eb',-3);
  return {concert:{breaks:concert.lineBreaks||null,lines:document.querySelectorAll('#concert svg').length,
     warning:(concert.warnings||[]).slice(0,2)},bb,eb,
     hiddenReferenceLeftBehind:!!host.querySelector('.huwabc-concert-layout-reference')};
 },{source,helper,voltaId,voltaSource});
 assert.ok(result.concert.lines>2,JSON.stringify(result));
 assert.ok(Array.isArray(result.concert.breaks),JSON.stringify(result));
 for(const key of ['bb','eb']){
  assert.equal(result[key].fixed,true,key+' must lock the C system breaks');
  assert.equal(result[key].wrapped,false,key+' must not re-wrap by accidental widths');
  assert.deepEqual(result[key].breaks,result.concert.breaks,key+' changed the original measure distribution');
  assert.equal(result[key].lines,result.concert.lines,key+' moved measures onto another system');
  assert.deepEqual(result[key].warning,[],key+' introduced ABCJS warnings');
 }
 assert.equal(result.hiddenReferenceLeftBehind,false);
 console.log('Written-view ABCJS browser engraving:',JSON.stringify(result));
}finally{await browser.close();}
