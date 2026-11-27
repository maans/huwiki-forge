import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const exports={};
runInNewContext(read('plugins/musescore-import/src/widget.js'),{exports,$tw:{wiki:{getTiddlerText:()=>'$:/languages/da-DK'}},require:id=>id==='$:/core/modules/widgets/widget.js'?{widget:class{}}:{}});
const initial=exports['huwiki-ms-import'].prototype.initialState;
test('a transposed second half remains selected in single and batch imports',()=>{
 const model={title:'Those Who Were',totalMeasures:38,staves:[{voices:[{id:'1:0',count:176}]}],duplicate:{start:20,length:19,shift:3,confidence:100}};
 const state=initial(model);assert.equal(state.start,1);assert.equal(state.end,38);assert.deepEqual(Array.from(state.selected),['1:0']);
 assert.equal(model.duplicate.start,20,'a warning remains available for review');
});
test('ordinary imports retain their complete range and original voice selection',()=>{
 assert.equal(initial({title:'Short tune',totalMeasures:8,staves:[{voices:[{id:'1:0',count:8}]}]}).end,8);
});
