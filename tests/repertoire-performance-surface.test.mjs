import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';
const surface={};runInNewContext(await readFile(new URL('../plugins/repertoire/src/performance-surface.js',import.meta.url),'utf8'),{exports:surface});
test('sound tools reuse the actual transport without starting another player or hiding playback',()=>{
 const doc=svgDocument(),book={document:doc,soundOpen:false},scoreHost=doc.createElement('section'),audio=doc.createElement('section');audio.className='huwabc-audio';scoreHost.appendChild(audio);
 const transport=doc.createElement('button');transport.textContent='Afspil';let starts=0;transport.addEventListener('click',()=>starts++);audio.appendChild(transport);
 const accompaniment=doc.createElement('section');accompaniment.className='huwabc-accompaniment';audio.appendChild(accompaniment);
 const view={abc:true,label:'Leadsheet (ABC)'},ui=surface.create(book,view,view);doc.body.append(scoreHost,ui.element);ui.attach({_accompControls:{element:accompaniment}},scoreHost);
 assert.equal(ui.element.querySelector('.huwabc-audio'),audio);assert.equal(transport.parentNode,audio);assert.equal(accompaniment.hidden,true);
 transport.click();assert.equal(starts,1);
 const sound=ui.element.querySelector('.huwrep-sound-toggle');sound.click();assert.equal(accompaniment.hidden,false);assert.equal(sound.getAttribute('aria-expanded'),'true');sound.click();assert.equal(accompaniment.hidden,true);assert.equal(transport.hidden,false);assert.equal(starts,1);
 assert.equal(ui.attach({},scoreHost),null,'a refresh with no new transport cannot clone or remove the current one');
});
test('a PDF names its separate ABC sound source and a PDF without ABC explains unavailable playback',()=>{
 const doc=svgDocument(),book={document:doc};
 const pdf=surface.create(book,{pdf:'chart.pdf'},{abc:true,label:'Leadsheet (ABC)'});
 assert.match(pdf.element.textContent,/PDF-siderne følger ikke afspilningen/);
 const silent=surface.create(book,{pdf:'chart.pdf'},null);assert.equal(silent.element.querySelector('button').disabled,true);assert.match(silent.element.textContent,/ingen afspillelig ABC/);
});
