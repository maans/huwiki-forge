import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url),read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const plugin=JSON.parse(await read('plugins/abc/dist/plugin.json'));
const pluginInfo=JSON.parse(await read('plugins/abc/plugin-info.json'));
const tiddlers=JSON.parse(plugin.text).tiddlers;
const moduleTitle='$:/plugins/huwiki/abc/reader-fallback.js',templateTitle='$:/plugins/huwiki/abc/ViewAddon';
const source=await read('plugins/abc/src/reader-fallback.js'),exports={};
runInNewContext(source,{exports});

// Use TiddlyWiki's actual wikitext parser, filters and rendering contexts.
// The small reader records each mounted instance; the browser smoke test
// separately verifies the real ABC readers and their visible sidebar mixers.
const tw=require('tiddlywiki').TiddlyWiki();tw.boot.argv=['--output','.'];
await new Promise(resolve=>tw.boot.boot(resolve));
Object.assign(tw.wiki.getFilterOperators(),exports);
const Widget=tw.modules.execute('$:/core/modules/widgets/widget.js').widget;
function Reader(tree,options){this.initialise(tree,options);}
Reader.prototype=new Widget();
Reader.prototype.render=function(parent,next){
 this.computeAttributes();const title=this.getAttribute('tiddler',this.getVariable('currentTiddler'));
 this.wiki.readerMounts.push(title);
 const node=this.document.createElement('section');node.setAttribute('data-abc-reader',title);
 parent.insertBefore(node,next);this.domNodes.push(node);
};
Widget.prototype.widgetClasses['huwiki-abc']=Reader;
const fixtureTitle='Fyrtøjet · 02 · Træets tre rum (ABC)';
function createWiki(text,extra={}){
 const wiki=new tw.Wiki();wiki.readerMounts=[];
 wiki.addTiddler(new tw.Tiddler(tiddlers[templateTitle]));
 wiki.addTiddler(new tw.Tiddler({title:fixtureTitle,type:'text/vnd.tiddlywiki','abc-source':'X:1\nT:Reader test\nK:C\nC D E F|',text,...extra}));
 wiki.addTiddler(new tw.Tiddler({title:'Other score','abc-source':'X:2\nK:C\nG2|',text:''}));
 return wiki;
}
function render(wiki){
 wiki.readerMounts=[];
 wiki.renderText('text/html','text/vnd.tiddlywiki','<$transclude $tiddler="'+templateTitle+'"/><$transclude $tiddler=<<currentTiddler>>/>',{variables:{currentTiddler:fixtureTitle,storyTiddler:fixtureTitle}});
 return wiki.readerMounts;
}

test('readable ABC reader fallback is the code shipped in the plugin',()=>{
 assert.equal(tiddlers[moduleTitle].text,source);
 assert.match(tiddlers[templateTitle].text,/huwiki-abc-needs-reader/);
 assert.equal(plugin.version,pluginInfo.version);
});
test('ordinary ABC fields with prose still receive exactly one fallback reader',()=>{
 assert.deepEqual(render(createWiki('These are the rehearsal notes.')),[fixtureTitle]);
});
test('an explicit reader for the current score replaces the fallback instead of duplicating it',()=>{
 for(const text of ['<$huwiki-abc tiddler="'+fixtureTitle+'"/>','<$huwiki-abc tiddler=<<currentTiddler>>/>','<$huwiki-abc/>','<section><$huwiki-abc tiddler={{!!title}}/></section>'])assert.deepEqual(render(createWiki(text)),[fixtureTitle],text);
});
test('a reader for another score does not suppress the current score fallback',()=>{
 for(const text of ['<$huwiki-abc tiddler="Other score"/>','<$tiddler tiddler="Other score"><$huwiki-abc/></$tiddler>','<$let currentTiddler="Other score"><$huwiki-abc tiddler=<<currentTiddler>>/></$let>'])assert.deepEqual(render(createWiki(text)),[fixtureTitle,'Other score'],text);
});
test('quoted widget examples and comments do not suppress a usable reader',()=>{
 for(const text of ['`<$huwiki-abc/>`','```\n<$huwiki-abc/>\n```','<!-- <$huwiki-abc/> -->','<$list filter="[[]is[tiddler]]" variable="example"><$huwiki-abc/></$list>'])assert.deepEqual(render(createWiki(text)),[fixtureTitle],text);
});
test('the music plugin keeps its existing priority and drafts gain no fallback',()=>{
 const wiki=createWiki('Notes');wiki.addTiddler(new tw.Tiddler({title:'$:/plugins/huwiki/music',text:''}));
 assert.deepEqual(render(wiki),[]);
 wiki.addTiddler(new tw.Tiddler(wiki.getTiddler(fixtureTitle),{text:'<$huwiki-abc/>'}));assert.deepEqual(render(wiki),[fixtureTitle]);
 assert.deepEqual(render(createWiki('Draft',{'draft.of':'Original score'})),[]);
});
test('two deliberately authored readers remain two independent readers',()=>{
 assert.deepEqual(render(createWiki('<$huwiki-abc/>\n<$huwiki-abc/>')),[fixtureTitle,fixtureTitle]);
});
test('changing a score body refreshes the fallback decision without a stale reader registration',()=>{
 const wiki=createWiki('Notes');assert.deepEqual(render(wiki),[fixtureTitle]);
 wiki.addTiddler(new tw.Tiddler(wiki.getTiddler(fixtureTitle),{text:'<$huwiki-abc/>'}));assert.deepEqual(render(wiki),[fixtureTitle]);
 wiki.addTiddler(new tw.Tiddler(wiki.getTiddler(fixtureTitle),{text:'Notes again'}));assert.deepEqual(render(wiki),[fixtureTitle]);
});
test('the shipped Fyrtøjet score that produced two mixers now mounts one reader',async()=>{
 const example=JSON.parse(JSON.parse(await read('plugins/animus-example-fyrtoejet/dist/plugin.json')).text).tiddlers;
 const wiki=createWiki('');wiki.addTiddler(new tw.Tiddler(example[fixtureTitle]));
 assert.deepEqual(render(wiki),[fixtureTitle]);
});
