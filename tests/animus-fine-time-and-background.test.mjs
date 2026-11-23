import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function load(name){const exports={};vm.runInNewContext(readFileSync(new URL('../plugins/musical/src/'+name+'.js',import.meta.url),'utf8'),{exports});return exports;}
test('vertical jog is continuous across sensitivity changes and releases the clock',()=>{
 const fine=load('fine-time');let t=1,id=0;
 const surface=()=>({ownerDocument:{defaultView:{requestAnimationFrame:()=>++id,cancelAnimationFrame(){}}},focus(){},setPointerCapture(){}});
 const dial=surface(),clock=surface(),dispose=fine.mount(dial,clock,{pause(){},position:()=>t,duration:()=>10,seek:v=>{t=v;}});
 const event=(x,y)=>({clientX:x,clientY:y,button:0,pointerId:1,preventDefault(){},stopPropagation(){}});
 clock.onpointerdown(event(0,50));clock.onpointermove(event(0,30));clock.onpointermove(event(228,30));clock.onpointerup({...event(228,20),type:'pointerup'});
 assert.equal(t,1.41);clock.onpointermove(event(0,0));assert.equal(t,1.41);
 dial.onkeydown({...event(),key:'ArrowLeft',shiftKey:true});assert.equal(t,1.4);
 dial.onkeydown({...event(),key:'ArrowRight'});assert.equal(t,1.5);dispose();assert.equal(clock.onpointermove,null);
});
test('an imported picture covers the stage and reuses the existing backdrop slot',async()=>{
 const bg=load('background-import'),draw=[];let revoked=false;
 class Image{set src(value){this.naturalWidth=4000;this.naturalHeight=3000;this.onload();}}
 const canvas={getContext:()=>({drawImage(...args){draw.push(args.slice(1));}}),toDataURL:()=> 'data:image/jpeg;base64,aGVsbG8='};
 const doc={defaultView:{Image,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){revoked=true;}}},createElement:()=>canvas};
 const scene={width:960,height:540,parts:[{id:'kenney-background-backgroundcolorgrass-image',type:'image',keys:[{t:0}]},{id:'house'},{id:'doll'}]};
 const media=await bg.prepare(doc,{type:'image/jpeg'},scene);assert.equal(media.type,'image/jpeg');assert.equal(revoked,true);
 assert.deepEqual(draw,[[0,-180,1920,1440]]);
 bg.insert(scene,'Photos/first','My photo','first');bg.insert(scene,'Photos/second','Second','second');
 assert.deepEqual(scene.parts.map(p=>p.id),['kenney-background-backgroundcolorgrass-image','house','doll']);
 assert.equal(scene.parts[0].asset,'Photos/second');assert.equal(scene.parts[0].geo.w,960);
});
