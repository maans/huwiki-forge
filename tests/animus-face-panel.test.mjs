import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {svgDocument} from './helpers/svg-test-dom.mjs';

const root = new URL('../', import.meta.url);
const face = {};
runInNewContext(readFileSync(new URL('plugins/musical/src/face.js', root), 'utf8'), {exports: face, require: () => ({})});
const panel = {};
runInNewContext(readFileSync(new URL('plugins/musical/src/face-panel.js', root), 'utf8'), {exports: panel, require: () => face});
const plain = value => JSON.parse(JSON.stringify(value));

test('a flat custom actor exposes facial parts without treating its arms as a head', () => {
  const scene = {parts: [
    {id: 'alma', name: 'Alma', type: 'group'},
    {id: 'alma-arm', name: 'Arm', parent: 'alma'},
    {id: 'alma-leg', name: 'Leg', parent: 'alma'},
    {id: 'alma-mouth', name: 'Mouth', parent: 'alma'},
    {id: 'alma-pupils', name: 'Eyes', parent: 'alma'}
  ]};
  const context = {scene, actorId: 'alma', actorPartId: 'alma', headId: 'alma', parts: {open: 'alma-mouth', pupils: ['alma-pupils']}};
  assert.equal(panel.isFace(context, 'alma-arm'), false);
  assert.equal(panel.isFace(context, 'alma-leg'), false);
  assert.equal(panel.isFace(context, 'alma'), false, 'selecting the whole body does not open facial choices');
  assert.equal(panel.isFace(context, 'alma-mouth'), true);
  assert.equal(panel.isFace(context, 'alma-pupils'), true);
});

test('the actual Turn Around head and its descendants open the face strip', () => {
  const production = JSON.parse(readFileSync(new URL('editions/turn-around/tiddlers/production.json', root), 'utf8'));
  const scene = JSON.parse(production.find(t => t.title === 'Turn Around · 01 · The Whole World').text);
  const context = {scene, actorId: 'prisoner', actorPartId: 'prisoner', headId: 'prisoner-head', parts: {}};
  for (const id of ['prisoner-head', 'prisoner-head-drawing', 'prisoner-jaw', 'prisoner-mouth-open', 'prisoner-pupils']) {
    assert.ok(scene.parts.some(part => part.id === id));
    assert.equal(panel.isFace(context, id), true, id);
  }
  assert.equal(panel.isFace(context, 'prisoner-arm-left'), false);
  assert.equal(panel.isFace(context, 'prisoner'), false);
});

function workshop({inline = true} = {}) {
  const doc = svgDocument();
  doc.createComment = text => doc.createTextNode(text);
  const create = (tag, parent) => {const node = doc.createElement(tag);parent.appendChild(node);return node;};
  const host = create('section', doc.body), stage = create('div', host), opener = create('button', stage), existing = create('aside', host), dock = create('section', host);
  stage.inert = false;existing.inert = true;dock.inert = false;opener.focus();
  const film = {parts:[{id:'prisoner'},{id:'prisoner-head',parent:'prisoner'},{id:'prisoner-mouth-open',parent:'prisoner-head'}],musical:{faceKeys:[]}};
  const original = JSON.stringify(film), time = 28.25, commands = [], back = [], script = [];
  let pauses = 0, undos = 0;
  const view = {scene:film,nodes:{}};
  const context = () => {
    const state = face.state(film.musical.faceKeys,time,'prisoner');
    return {actorId:'prisoner',actorPartId:'prisoner',headId:'prisoner-head',label:'Fangen',scene:film,view,state,time,localTime:2.25,parts:{open:'prisoner-mouth-open'},
      variants:[{id:'mouth-o',name:'Rund mund'},{id:'mouth-e',name:'Smil'}],viseme:'O',effectiveVariant:state.mouthMap.O||'mouth-o',variantMap:{O:'mouth-o',E:state.mouthMap.E||'mouth-o'},defaultVariantMap:{O:'mouth-o',E:'mouth-o'},
      cue:{partId:'cue-1',text:'Hvor er verden?',time:27,active:true}};
  };
  const api = panel.mount({doc,host,stage,parent:host,dock:inline?dock:null,film,wiki:{getTiddlerText:()=>'$:/languages/da-DK'},
    context,position:()=>time,pause(){pauses++;},seek(){throw Error('Opening or switching must not seek');},history:()=>film.musical.faceKeys,
    choose(id,command){commands.push({id,...plain(command)});const patch=command.channel==='mouth'?{mouth:{mode:command.mode},mouthMap:{[command.viseme]:command.value==='auto'?null:command.value}}:face.preset(command.value);film.musical.faceKeys=face.withKey(film.musical.faceKeys,'prisoner',time,patch);},
    undo(){undos++;film.musical.faceKeys=[];},canUndo:()=>film.musical.faceKeys.length>0,onScript:cue=>script.push(plain(cue)),onBack:details=>back.push(plain(details))});
  return {doc,host,stage,opener,existing,dock,film,original,time,commands,back,script,api,get pauses(){return pauses;},get undos(){return undos;}};
}

test('embedded face workshop shares the dock without blocking the stage and survives export/fullscreen relocation', () => {
  const h = workshop();
  assert.equal(h.api.select('prisoner-mouth-open'),true);
  const choices = h.host.querySelector('[data-face-panel]');
  assert.equal(choices.parentNode,h.dock);
  h.api.openWorkshop();
  const expanded = h.dock.querySelector('.huw-face-workshop');
  assert.ok(expanded.classList.contains('huw-face-workshop--inline'));
  assert.equal(expanded.getAttribute('role'),'region');assert.equal(expanded.getAttribute('aria-modal'),null);
  assert.equal(h.stage.inert,false);assert.equal(h.existing.inert,true);assert.equal(h.dock.inert,false);
  assert.equal(h.host.querySelectorAll('[data-face-panel]').length,1);assert.ok(expanded.contains(choices));
  assert.equal(expanded.dispatch('keydown',{key:'Tab',shiftKey:true}).defaultPrevented,false,'keyboard focus can leave the inline workshop');
  assert.equal(h.pauses,1);assert.equal(JSON.stringify(h.film),h.original,'opening the workshop does not write a key');

  h.doc.fullscreenElement=h.stage;h.stage.appendChild(h.dock);h.api.relocate(true);
  assert.equal(expanded.parentNode,h.dock);assert.ok(expanded.contains(choices),'fullscreen moves the shared dock, not its face contents');
  const outer=h.api.suspend(),inner=h.api.suspend();
  assert.equal(expanded.hidden,true);assert.equal(choices.hidden,true);
  inner();assert.equal(expanded.hidden,true,'nested export restoration must not expose the workshop early');
  outer();assert.equal(expanded.hidden,false);assert.equal(choices.hidden,false);outer();
  assert.equal(h.host.querySelector('.huw-face-workshop'),expanded,'restoration keeps the same workshop');
  assert.equal(JSON.stringify(h.film),h.original);

  expanded.querySelector('[data-face-back="figure"]').click();
  assert.deepEqual(h.back,[{actorId:'prisoner',headId:'prisoner-head',partId:'prisoner-mouth-open'}]);
  assert.equal(h.api.isOpen(),false);assert.equal(h.api.isWorkshopOpen(),false);assert.equal(h.dock.querySelector('.huw-face-workshop'),null);
  assert.equal(JSON.stringify(h.film),h.original,'returning to the whole character does not seek or write');
  h.api.select('prisoner-head');h.api.openWorkshop();h.api.hide();
  assert.equal(h.back.length,1,'programmatic switching does not call Back recursively');
  h.api.dispose();assert.equal(h.dock.querySelector('[data-face-panel]'),null);
});

test('inline workshop retains sound teaching, undo and manuscript actions in the same panel', () => {
  const h=workshop();h.api.select('prisoner-mouth-open');h.api.openWorkshop();
  const expanded=h.dock.querySelector('.huw-face-workshop');
  expanded.querySelector('[data-face-sound="E"]').click();
  assert.equal(h.commands.length,0,'inspecting a letter group is read-only');
  expanded.querySelector('[data-face-value="mouth-e"]').click();
  assert.deepEqual(h.commands,[{id:'prisoner-mouth-open',channel:'mouth',value:'mouth-e',viseme:'E',mode:'auto'}]);
  assert.deepEqual(plain(h.film.musical.faceKeys),[{actor:'prisoner',t:h.time,mouth:{mode:'auto'},mouthMap:{E:'mouth-e'}}]);
  assert.equal(expanded.querySelector('.huw-musical-face-status').dataset.faceAuto,'custom');
  assert.ok(expanded.querySelectorAll('[data-face-key-time]').some(node=>node.dataset.faceKeyTime==='28.25'));
  expanded.querySelector('.huw-musical-face-undo').click();
  assert.equal(h.undos,1);assert.deepEqual(plain(h.film.musical.faceKeys),[]);
  expanded.querySelector('.huw-musical-face-script').click();
  assert.equal(h.api.isWorkshopOpen(),true,'the inline workshop remains ready behind Manuscript');assert.equal(h.script[0].partId,'cue-1');assert.equal(h.script[0].time,27);assert.equal(h.back.length,0);
  assert.equal(expanded.querySelector('.huw-musical-face-context').dataset.faceViseme,'E','opening Manuscript retains the inspected sound group');
  h.api.select('prisoner-mouth-open');h.api.openWorkshop();
  h.dock.querySelector('[data-face-panel]').dispatch('keydown',{key:'Escape'});
  assert.equal(h.back.length,1);assert.equal(h.api.isOpen(),false,'Escape returns to the figure in embedded mode');
  h.api.dispose();
});

test('legacy face workshop still restores its modal background and opener', () => {
  const h=workshop({inline:false});h.api.select('prisoner-mouth-open');h.api.openWorkshop();
  const expanded=h.host.querySelector('.huw-face-workshop');
  assert.equal(expanded.parentNode,h.host);assert.equal(expanded.getAttribute('role'),'dialog');assert.equal(expanded.getAttribute('aria-modal'),'true');
  assert.equal(h.stage.inert,true);assert.equal(h.existing.inert,true);
  expanded.querySelector('.huw-face-workshop-close').click();
  assert.equal(h.stage.inert,false);assert.equal(h.existing.inert,true);assert.equal(h.doc.activeElement,h.opener);
  assert.equal(h.api.isOpen(),true);assert.equal(h.back.length,0);assert.equal(JSON.stringify(h.film),h.original);
  h.api.dispose();
});
