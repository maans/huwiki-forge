import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,Script} from 'node:vm';

const publisher=await readFile(new URL('../plugins/site-publisher/src/publisher.js',import.meta.url),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#39|#34);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#34;':'"'}[c]));

// A small DOM with real change/click handlers. These tests execute the complete
// Publisher startup and makeSite functions, then execute the exported site
// runtime. They do not infer behaviour by matching implementation strings.
class Node {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this.className='';this.style={};this._text='';this._value=undefined;this.hidden=false;
  this.classList={contains:n=>this.className.split(/\s+/).includes(n),add:(...names)=>names.forEach(n=>this.classList.toggle(n,true)),remove:(...names)=>names.forEach(n=>this.classList.toggle(n,false)),toggle:(n,force)=>{let values=this.className.split(/\s+/).filter(Boolean);if(force===undefined)force=!values.includes(n);values=values.filter(v=>v!==n);if(force)values.push(n);this.className=values.join(' ');return force;}};
  if(this.tagName==='IFRAME')this.contentWindow={postMessage(){},document:{querySelectorAll:()=>[]}};
 }
 get parentElement(){return this.parentNode;}
 get isConnected(){return this===this.ownerDocument?.body||!!this.parentNode?.isConnected;}
 get value(){if(this._value!==undefined)return this._value;if(this.tagName==='SELECT')return this.querySelector('option')?.value||'';return '';}
 set value(value){this._value=String(value);}
 get options(){return this.querySelectorAll('option');}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){for(const n of this.children)n.parentNode=null;this.children=[];this._text=String(value);if(this.tagName==='SELECT')this._value=undefined;}
 get innerHTML(){return esc(this._text)+this.children.map(n=>n.outerHTML).join('');}
 set innerHTML(html){this.replaceChildren();const stack=[this],voids=new Set(['input','br','hr','img','meta','link','source']);
  for(const token of String(html).matchAll(/<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)([^>]*?)\/?\s*>|([^<]+)/gi)){
   if(token[1]){if(stack.length>1)stack.pop();continue;}
   if(token[2]){const child=new Node(token[2],this.ownerDocument);for(const a of token[3].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))child.setAttribute(a[1],decode(a[2]??a[3]??a[4]??''));stack.at(-1).appendChild(child);if(!voids.has(token[2].toLowerCase())&&!/\/\s*$/.test(token[3]))stack.push(child);}
   else if(token[4]){const child=new Node('#text',this.ownerDocument);child.textContent=decode(token[4]);stack.at(-1).appendChild(child);}
  }
 }
 get outerHTML(){if(this.tagName==='#TEXT')return esc(this.textContent);const attrs={...this.attributes};if(this.className)attrs.class=this.className;if(this.id)attrs.id=this.id;return '<'+this.tagName.toLowerCase()+Object.entries(attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>'+this.innerHTML+'</'+this.tagName.toLowerCase()+'>';}
 appendChild(child){this.children.push(child);child.parentNode=this;return child;}
 append(...children){for(const child of children)this.appendChild(typeof child==='string'?this.ownerDocument.createTextNode(child):child);}
 replaceChildren(...children){this.textContent='';this.append(...children);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 setAttribute(name,value){this.attributes[name]=String(value);if(['id','class','value'].includes(name))this[name==='class'?'className':name]=String(value);if(name==='hidden')this.hidden=true;}
 getAttribute(name){if(name==='class')return this.className||null;if(name==='id')return this.id||null;return this.attributes[name]??null;}
 removeAttribute(name){delete this.attributes[name];if(name==='hidden')this.hidden=false;if(name==='srcdoc')delete this.srcdoc;}
 addEventListener(type,listener,options){(this.listeners[type]??=[]).push({listener,once:options?.once});}
 removeEventListener(type,listener){this.listeners[type]=(this.listeners[type]||[]).filter(x=>x.listener!==listener);}
 dispatch(type,properties={}){if(this.disabled)return;const event={target:this,currentTarget:this,detail:1,preventDefault(){},stopPropagation(){},...properties};this['on'+type]?.(event);for(const record of (this.listeners[type]||[]).slice()){record.listener(event);if(record.once)this.removeEventListener(type,record.listener);}}
 click(){this.dispatch('click');}
 focus(){this.ownerDocument.activeElement=this;}
 contains(other){return this===other||this.children.some(n=>n.contains(other));}
 closest(selector){for(let n=this;n;n=n.parentNode)if(n.matches(selector))return n;return null;}
 matches(selector){return selector.split(',').some(part=>{
  const tokens=part.trim().replaceAll('>',' ').split(/\s+/);function simple(n,t){const tag=/^[\w-]+/.exec(t)?.[0];if(tag&&n.tagName!==tag.toUpperCase())return false;for(const [,id] of t.matchAll(/#([\w-]+)/g))if(n.id!==id)return false;for(const [,cls] of t.matchAll(/\.([\w-]+)/g))if(!n.classList.contains(cls))return false;for(const [,key,,value] of t.matchAll(/\[([^=\]]+)(=([^\]]+))?\]/g)){const actual=n.getAttribute(key)??n[key];if(value===undefined){if(actual===undefined||actual===null)return false;}else if(String(actual)!==value.replace(/^['"]|['"]$/g,''))return false;}return true;}
  if(!simple(this,tokens.at(-1)))return false;let ancestor=this.parentNode;for(let i=tokens.length-2;i>=0;i--){while(ancestor&&!simple(ancestor,tokens[i]))ancestor=ancestor.parentNode;if(!ancestor)return false;ancestor=ancestor.parentNode;}return true;
 });}
 querySelectorAll(selector){const found=[];function walk(node){for(const child of node.children){if(child.matches(selector))found.push(child);walk(child);}}walk(this);return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function document(lang='da'){
 const events={};const doc={documentElement:{lang},activeElement:null,createElement:tag=>new Node(tag,doc),createTextNode:text=>{const n=new Node('#text',doc);n.textContent=text;return n;},getElementById:id=>doc.body.querySelector('#'+id),querySelectorAll:selector=>doc.body.querySelectorAll(selector),querySelector:selector=>doc.body.querySelector(selector),addEventListener(type,fn){(events[type]??=[]).push(fn);},removeEventListener(type,fn){events[type]=(events[type]||[]).filter(x=>x!==fn);}};doc.body=new Node('body',doc);return doc;
}
function visibleText(node){if(node.hidden||node.tagName==='STYLE'||node.tagName==='SCRIPT')return '';return node._text+node.children.map(visibleText).join(' ');}
function payload(html){const match=/<script id="publisher-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);assert.ok(match,'A successfully built site must contain publisher-data');return JSON.parse(match[1]);}
function clicked(root,caption){const button=root.querySelectorAll('button').find(n=>n.textContent===caption);assert.ok(button,'Missing button: '+caption);button.click();return button;}
function field(root,caption){const label=root.querySelectorAll('.husp-field').find(n=>n.querySelector('span')?.textContent===caption);assert.ok(label,'Missing field: '+caption);return label.querySelector('select,input');}
function change(node,value){assert.ok(node,'Missing control');node.value=value;node.dispatch('change');}

function records(){
 const scene=(name,duration)=>({version:1,name,width:800,height:450,duration,sceneNotes:'PRIVATE MANUSCRIPT NOTE',parts:[]});
 const film={version:1,name:'Skovens stemmer',width:800,height:450,duration:62,parts:[],scenes:[{id:'first',name:'Ankomsten',source:'Scene A',duration:30},{id:'second',name:'Finalen',source:'Scene B',duration:32}],musical:{songs:[],audioClips:[]},sceneNotes:'PRIVATE RAW JSON'};
 const rows={Film:{title:'Film',type:'application/json','cutout-id':'film',text:JSON.stringify(film)},'Scene A':{title:'Scene A',type:'application/json','cutout-id':'a',text:JSON.stringify(scene('Ankomsten',30))},'Scene B':{title:'Scene B',type:'application/json','cutout-id':'b',text:JSON.stringify(scene('Finalen',32))},Score:{title:'Score',type:'text/vnd.abc',text:'X:1\nT:Melody\nK:C\nC D E F|'},'$:/language':{title:'$:/language',text:'$:/languages/da-DK'},'$:/SiteTitle':{title:'$:/SiteTitle',text:'Min udgivelse'},'$:/StoryList':{title:'$:/StoryList',list:['Film','Score']}};
 // Playback itself has separate acceptance coverage. The full publication
 // builder still resolves its runtime dependencies; lightweight bundles keep
 // these UI tests focused on navigation and exported configuration.
 for(const name of ['musical/playlist','musical/motion','musical/sync','musical/sfx','musical/face','musical/lipsync','musical/narration-player','abc/audio-controller','abc/accompaniment','abc/start-position','abc/vendor/abcjs'])rows['$:/plugins/huwiki/'+name+'.js']={text:'/* Runtime fixture: '+name+' */'};
 for(const name of ['animus','cutout'])for(const suffix of ['js','css'])rows['$:/plugins/huwiki/site-publisher/'+name+'/viewer.'+suffix]={text:'/* Reader fixture */'};
 return rows;
}
async function harness({title='Film',lang='da',rows=records(),preset=null}={}){
 rows['$:/language'].text='$:/languages/'+(lang==='da'?'da-DK':'en-GB');const doc=document(lang),exports={},events={},timers=new Map(),scoreCalls=[];let nextTimer=0;
 const wiki={getTiddler:title=>rows[title]?{fields:rows[title]}:null,getTiddlerText:(title,fallback='')=>rows[title]?.text??fallback,getTiddlers:()=>Object.keys(rows).filter(t=>!t.startsWith('$:/')),each(fn){for(const [title,fields] of Object.entries(rows))fn({fields},title);},getTagMap:()=>({Collection:['Film','Score']}),getTiddlersWithTag:tag=>tag==='Collection'?['Film','Score']:[],renderText:(_type,_source,text)=>String(text),addTiddler(){throw Error('These publication actions should not change the wiki');}};
 const score={hasScore:(_wiki,title)=>title==='Score',build(_wiki,_source,_fields,title,opts){scoreCalls.push({method:'build',title,opts});return '<html><head></head><body><script>const DATA={"title":"Score"};<\/script></body></html>';},data(_wiki,title,opts){scoreCalls.push({method:'data',title,opts});return {title,startDesk:opts.startDesk};}};
 const context=createContext({exports,$tw:{wiki,rootWidget:{addEventListener(type,fn){events[type]=fn;}},utils:{parseStringArray:value=>value.split(/\s+/)},modules:{execute(id){if(id==='$:/plugins/huwiki/abc/site-publisher.js')return score;if(id==='$:/plugins/huwiki/abc/loader.js')return {getSource:(_wiki,title)=>rows[title].text};throw Error('No module '+id);}}},document:doc,navigator:{language:lang},window:{},console,URL,Blob,Promise,confirm:()=>true,alert:message=>{throw Error(message);},setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout(id){timers.delete(id);}});
 new Script(publisher,{filename:'publisher.js'}).runInContext(context);exports.startup();events['tm-huwiki-sitepublisher']({param:title,paramObject:preset||{}});
 async function flush(){for(let i=0;i<100&&timers.size;i++){const pending=[...timers];timers.clear();for(const [,fn] of pending)fn();await Promise.resolve();}assert.equal(timers.size,0,'Publisher should reach a settled preview');}
 await flush();const root=doc.body.querySelector('.husp-overlay');assert.ok(root,'Publisher dialog should open');
 return {root,doc,rows,scoreCalls,flush,get frame(){return root.querySelector('.husp-preview');},get html(){return this.frame.srcdoc||'';},get data(){assert.ok(this.html,root.querySelector('.husp-status')?.textContent);return payload(this.html);}};
}

function audience(html,{hash=''}={}){
 const data=payload(html),doc=document(data.lang),body=/<body[^>]*>([\s\S]*?)<script id="publisher-data"/.exec(html);assert.ok(body);doc.body.innerHTML=body[1];
 const json=doc.createElement('script');json.id='publisher-data';json.textContent=JSON.stringify(data);doc.body.appendChild(json);
 const calls={hydrate:0,dispose:0},events={},location={hash},win={addEventListener(type,fn){(events[type]??=[]).push(fn);},getSelection:()=>'',HUWikiAniMusSite:{hydrate(){calls.hydrate++;},dispose(){calls.dispose++;}},HUWikiCutOutSite:{hydrate(){}}};
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length);const runtime=scripts.at(-1)[1];
 new Script(runtime,{filename:'exported-site-runtime.js'}).runInContext(createContext({document:doc,window:win,location,history:{replaceState(_state,_unused,url){location.hash=url;}},console,decodeURIComponent,encodeURIComponent,requestAnimationFrame:fn=>fn()}));
 return {doc,win,data,calls,location,sendFrameMessage(type,direction){
  const source=doc.getElementById('score-frame').contentWindow;
  for(const fn of events.message||[])fn({source,data:{type,direction}});
 }};
}

test('a single AniMus publication has a useful programme and defaults to the performance',async()=>{
 const h=await harness(),settings=h.root.querySelector('.husp-settings-button');assert.equal(settings.textContent,'⚙ Publikumsvisning');
 assert.ok(h.root.querySelector('.husp-program-card'));const programme=visibleText(h.root.querySelector('.husp-program-card'));
 assert.match(programme,/Skovens stemmer/);assert.match(programme,/Ankomsten/);assert.match(programme,/Finalen/);assert.match(programme,/1:02/);
 assert.doesNotMatch(programme,/Artikel|"version"|"parts"|"musical"|PRIVATE/);
 settings.click();assert.equal(h.root.querySelector('.husp-config').hidden,false);assert.equal(settings.textContent,'✕ Skjul publikumsvisning');
 const start=h.root.querySelector('.husp-program-start');assert.equal(start.parentElement.hidden,false);assert.equal(start.value,'performance');assert.deepEqual(start.options.map(o=>[o.value,o.textContent]),[['performance','Forestillingen'],['program','Programmet']]);
 assert.equal(h.root.querySelector('.husp-score-start').parentElement.hidden,true);assert.doesNotMatch(visibleText(h.root.querySelector('.husp-config')),/Nodepult|Normal nodevisning|Artikel/);
 assert.equal(h.data.presentation,'animus');assert.equal(h.data.startView,'performance');assert.equal(h.data.entries[0].kind,'animus');assert.equal(h.data.entries[0].label,'Skovens stemmer');
 clicked(h.root,'Program');assert.equal(h.root.querySelector('.husp-overview').hidden,false);assert.equal(h.data.startView,'performance','Looking at the programme must not change the exported starting view');
 const page=audience(h.html);assert.equal(page.doc.getElementById('animus-program').hidden,true);assert.equal(page.doc.getElementById('article-view').hidden,false);assert.equal(page.calls.hydrate,1);
});

test('choosing Programmet changes the exported start screen and its open action reaches the performance',async()=>{
 const h=await harness();h.root.querySelector('.husp-settings-button').click();change(h.root.querySelector('.husp-program-start'),'program');await h.flush();
 assert.equal(h.data.startView,'program');const page=audience(h.html),programme=page.doc.getElementById('animus-program');assert.equal(programme.hidden,false);assert.equal(page.doc.getElementById('article-view').hidden,true);assert.equal(page.calls.hydrate,0);
 assert.match(visibleText(programme),/Skovens stemmer/);assert.doesNotMatch(visibleText(programme),/"parts"|PRIVATE|Artikel/);
 const open=programme.querySelector('.husp-program-open[data-entry-index]');assert.ok(open);open.click();assert.equal(programme.hidden,true);assert.equal(page.doc.getElementById('article-view').hidden,false);assert.equal(page.calls.hydrate,1);
 page.doc.getElementById('program-toggle').click();assert.equal(programme.hidden,false);assert.equal(page.doc.getElementById('article-view').hidden,true);assert.ok(page.calls.dispose>=1,'Returning to the programme must release a running performance');
 const linked=audience(h.html,{hash:'#Film'});assert.equal(linked.doc.getElementById('animus-program').hidden,true);assert.equal(linked.calls.hydrate,1,'An explicit performance link remains usable with a programme-first publication');
});

test('changing performance settings preserves an explicitly selected programme start',async()=>{
 const h=await harness();h.root.querySelector('.husp-settings-button').click();change(h.root.querySelector('.husp-program-start'),'program');await h.flush();
 const title=field(h.root,'Publikumstitel');title.value='Aftenens musical';title.dispatch('input');await h.flush();
 assert.equal(h.data.startView,'program');assert.equal(h.data.siteTitle,'Aftenens musical');assert.equal(h.root.querySelector('.husp-program-start').value,'program');
 change(h.root.querySelector('.husp-program-start'),'performance');await h.flush();assert.equal(h.data.startView,'performance');assert.equal(audience(h.html).calls.hydrate,1);
});

test('ordinary ABC publication keeps Overview, Settings and the music-stand option',async()=>{
 const h=await harness({title:'Score'});assert.equal(h.root.querySelector('.husp-settings-button').textContent,'⚙ Indstillinger');clicked(h.root,'Overblik');h.root.querySelector('.husp-settings-button').click();
 const desk=h.root.querySelector('.husp-score-start');assert.equal(desk.parentElement.hidden,false);assert.equal(desk.value,'desk');assert.deepEqual(desk.options.map(o=>[o.value,o.textContent]),[['desk','Nodepult · start her'],['normal','Normal nodevisning']]);assert.equal(h.root.querySelector('.husp-program-start').parentElement.hidden,true);
 assert.equal(h.data.startDesk,true);assert.notEqual(h.data.presentation,'animus');assert.equal(h.data.entries[0].kind,'score');assert.equal(h.scoreCalls.at(-1).opts.startDesk,true);
 change(desk,'normal');await h.flush();assert.equal(h.data.startDesk,false);assert.equal(h.data.entries[0].data.startDesk,false);assert.equal(h.scoreCalls.at(-1).opts.startDesk,false);assert.equal(h.scoreCalls.filter(c=>c.method==='build').at(-1).opts.startDesk,false);
 const page=audience(h.html);assert.equal(page.doc.getElementById('score-frame').hidden,false);assert.match(page.doc.getElementById('score-frame').srcdoc,/"startDesk":false/);
});

test('a mixed publication retains the generic controls and the ABC-specific starting view',async()=>{
 const h=await harness({title:''});h.root.querySelector('.husp-settings-button').click();
 assert.equal(h.root.querySelector('.husp-settings-button').textContent,'✕ Skjul indstillinger');assert.equal(h.root.querySelector('.husp-program-start').parentElement.hidden,true);assert.equal(h.root.querySelector('.husp-score-start').parentElement.hidden,false);
 assert.notEqual(h.data.presentation,'animus');assert.deepEqual(h.data.entries.map(e=>e.kind),['animus','score']);
});

test('multiple productions default to the programme and a wrapper never duplicates its underlying film',async()=>{
 const rows=records(),second=JSON.parse(rows.Film.text);second.name='Skovens ekko';rows.Film2={...rows.Film,title:'Film2','cutout-id':'film2',text:JSON.stringify(second)};
 rows.Show={title:'Show',type:'text/vnd.tiddlywiki','animus-scene':'Film',text:'<$musical-stage scene={{!!animus-scene}}/>'};
 const h=await harness({rows});h.root.querySelector('.husp-settings-button').click();const content=field(h.root,'Indhold');
 assert.deepEqual(content.options.map(o=>[o.value,o.textContent]),[['single','Denne forestilling'],['productions','Forestillinger i wikien']]);change(content,'productions');await h.flush();
 assert.equal(h.data.entries.length,2);assert.equal(new Set(h.data.entries.map(e=>e.presentation.sourceTitle)).size,2);assert.equal(h.data.startView,'program');assert.equal(h.root.querySelector('.husp-program-start').value,'program');
 const page=audience(h.html);assert.equal(page.doc.getElementById('animus-program').hidden,false);assert.equal(page.doc.getElementById('animus-program').querySelectorAll('.husp-program-open').length,2);
 const open=page.doc.getElementById('animus-program').querySelectorAll('.husp-program-open')[1];open.click();assert.equal(page.doc.getElementById('current-title').textContent,h.data.entries[1].label);assert.equal(page.calls.hydrate,1);
});

test('the contextual AniMus controls follow the wiki language',async()=>{
 const h=await harness({lang:'en'});assert.equal(h.root.querySelector('.husp-settings-button').textContent,'⚙ Audience view');h.root.querySelector('.husp-settings-button').click();
 assert.deepEqual(h.root.querySelector('.husp-program-start').options.map(o=>o.textContent),['Performance','Programme']);assert.equal(h.root.querySelector('.husp-program-card .huw-animus-program').getAttribute('aria-label'),'Programme');assert.equal(h.data.lang,'en');
});

test('Repertoire overview cards show readable headings, not internal publication paths',async()=>{
 const rows=records(),root='$:/temp/huwiki/repertoire/publication/encoded-id/site/c/',summary=root+'summary',list=root+'order';
 rows[summary]={title:summary,type:'text/vnd.tiddlywiki',caption:'SilbaÄtno · Øverepertoire',
  text:'! SilbaÄtno · Øverepertoire\n\n!! 1. Brudmarch\nForm: AABB'};
 rows[list]={title:list,type:'text/vnd.tiddlywiki',list:[summary,'Score'],text:''};
 const h=await harness({title:summary,rows,preset:{listTitle:list,siteTitle:'SilbaÄtno · Øverepertoire'}});
 const cards=h.root.querySelectorAll('.husp-overview-card');
 assert.equal(cards.length,2);
 const first=visibleText(cards[0]);
 assert.match(first,/Repertoireoversigt/);
 assert.match(first,/SilbaÄtno · Øverepertoire/);
 assert.match(first,/1 nummer/);
 assert.doesNotMatch(first,/\$:\//,'No internal temporary path in the preview');
 h.root.querySelector('.husp-settings-button').click();
 assert.doesNotMatch(visibleText(h.root.querySelector('.husp-arrange')),/\$:\//,'No internal temporary path in the arrangement selector');
 assert.equal(h.data.entries[0].label,'SilbaÄtno · Øverepertoire');
 const site=audience(h.html);
 assert.equal(site.doc.getElementById('current-title').textContent,'SilbaÄtno · Øverepertoire');
});

test('repertoire export uses short source labels and shows arrangement below the notation',async()=>{
 const rows=records(),prefix='$:/temp/huwiki/repertoire/publication/encoded/site/c/',summary=prefix+'summary',list=prefix+'order';
 rows[summary]={title:summary,caption:'SilbaÄtno · Øverepertoire',
   'repertoire-publication-orchestra':'SilbaÄtno',
   'repertoire-publication-agreements':JSON.stringify({Score:{form:'AABB',instrumentation:'Fløjte',cues:'Afslut på tegn'}}),
   text:'<h1>SilbaÄtno · Øverepertoire</h1>'};
 rows[list]={title:list,list:[summary,'Score'],text:''};
 const h=await harness({title:summary,rows,preset:{listTitle:list,siteTitle:'SilbaÄtno · Øverepertoire · C'}});
 assert.equal(h.data.repertoire.index,0);
 assert.equal(h.data.entries[1].agreement.form,'AABB');
 const site=audience(h.html);
 assert.equal(site.doc.getElementById('husp-repertoire-agreements').hidden,true);
 site.doc.getElementById('chapters').querySelectorAll('.chapter')[1].click();
 assert.equal(site.doc.getElementById('husp-repertoire-agreements').hidden,false);
 assert.match(visibleText(site.doc.getElementById('husp-repertoire-agreements')),/AABB/);
 assert.match(visibleText(site.doc.getElementById('husp-repertoire-agreements')),/Fløjte/);
});

test('site repertoire index is clickable and every tune has a way back',async()=>{
 const rows=records(),root='$:/temp/huwiki/repertoire/publication/nav/site/c/',summary=root+'summary',list=root+'order';
 rows[summary]={title:summary,caption:'SilbaÄtno · Øverepertoire',
   'repertoire-publication-orchestra':'SilbaÄtno',
   text:'<a data-tiddler-title="Score">1. Score</a>'};
 rows[list]={title:list,list:[summary,'Score'],text:''};
 const h=await harness({title:summary,rows,preset:{listTitle:list,siteTitle:'SilbaÄtno · Øverepertoire · C'}});
 const published=audience(h.html),back=published.doc.getElementById('husp-back-to-index');
 assert.equal(back.hidden,true,'Back control stays out of the index');
 const link=published.doc.getElementById('article-view').querySelector('[data-site-tiddler]');
 assert.ok(link,'Index must export a usable linked song');
 link.click();
 assert.equal(published.doc.getElementById('score-frame').hidden,false);
 assert.equal(back.hidden,false,'Back to index is visible from a song');
 assert.equal(published.doc.getElementById('husp-next-tune').disabled,true);
 published.sendFrameMessage('husp-reader-boundary',-1);
 assert.equal(published.doc.getElementById('article-view').hidden,false,'PageUp at first song returns to index');
 assert.equal(back.hidden,true);
 published.doc.getElementById('chapters').querySelectorAll('.chapter')[1].click();
 back.click();
 assert.equal(published.doc.getElementById('article-view').hidden,false);
});
