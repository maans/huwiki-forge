/*\
title: $:/plugins/huwiki/musical/projects.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Language=require("$:/plugins/huwiki/musical/language.js");
var isDanish=Language.isDanish;
var Widget=require('$:/core/modules/widgets/widget.js').widget;
var Scenes=require('$:/plugins/huwiki/musical/scenes.js');
function templates(wiki){return (wiki.filterTiddlers?wiki.filterTiddlers('[all[tiddlers+shadows]tag[$:/tags/AniMus/Template]]'):wiki.getTiddlersWithTag('$:/tags/AniMus/Template')).map(function(title){var t=wiki.getTiddler(title);return {title:title,name:t.fields['animus-template-name']||title};});}
function create(wiki,name,templateTitle){
 var template=null;if(templateTitle){template=JSON.parse(wiki.getTiddlerText(templateTitle,''));if(!template||!Array.isArray(template.parts))throw Error('Invalid animation template');}
 name=String(name||'AniMus').trim()||'AniMus';var title=wiki.generateNewTitle(name),stageTitle=wiki.generateNewTitle(title+' · Scene 1'),scoreTitle=wiki.generateNewTitle(title+' · ABC'),filmTitle=wiki.generateNewTitle(title+' · Film');
 var stage=template?JSON.parse(JSON.stringify(template)):Scenes.blankScene('Scene 1');if(template)stage.id='scene-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
 var film={version:1,id:stage.id+'-film',kind:'theatre',name:title,width:800,height:450,duration:16,background:'#edf3f5',parts:[],scenes:[{id:stage.id+'-clip',name:'Scene 1',source:stageTitle,sourceId:stage.id,duration:16,offset:0,speed:1,loop:false}],camera:{keys:[{t:0,x:400,y:225,zoom:1,easing:'smooth'}]},musical:{version:1,songs:[{id:stage.id+'-music',score:scoreTitle,start:0,duration:16,volume:1,lane:'A',kind:'complete-abc'}],audioClips:[],sfx:[],animationClips:[],cameraB:{keys:[{t:0,x:400,y:225,zoom:1}]},cuts:[{t:0,camera:'A'}],lighting:{keys:[{t:0,intensity:1}]}}};
 film.width=stage.width;film.height=stage.height;film.duration=stage.duration;film.scenes[0].duration=stage.duration;film.camera.keys[0].x=film.musical.cameraB.keys[0].x=stage.width/2;film.camera.keys[0].y=film.musical.cameraB.keys[0].y=stage.height/2;
 wiki.addTiddler(new $tw.Tiddler({title:stageTitle,type:'application/json','cutout-id':stage.id,'cutout-project':'yes',text:JSON.stringify(stage)}));
 wiki.addTiddler(new $tw.Tiddler({title:scoreTitle,type:'text/vnd.tiddlywiki',text:'<$huwiki-abc-score tiddler=<<currentTiddler>>/>','abc-source':'X:1\nT:'+name.replace(/[\r\n]/g,' ')+'\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nz4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |','abc-accompaniment':'{"enabled":false}'}));
 wiki.addTiddler(new $tw.Tiddler({title:filmTitle,type:'application/json','cutout-id':film.id,'cutout-project':'yes',text:JSON.stringify(film)}));
 wiki.addTiddler(new $tw.Tiddler({title:title,type:'text/vnd.tiddlywiki',tags:['AniMusProjects'],'animus-scene':filmTitle,'animus-score':scoreTitle,text:'<$musical-stage scene={{!!animus-scene}} score={{!!animus-score}}/>'}));return {title:title,filmTitle:filmTitle,scoreTitle:scoreTitle,stageTitle:stageTitle};
}
function Projects(tree,options){this.initialise(tree,options);}Projects.prototype=new Widget();
Projects.prototype.render=function(parent,next){this.parentDomNode=parent;this.computeAttributes();var self=this,doc=this.document,host=doc.createElement('div');host.className='huw-animus-new-project';parent.insertBefore(host,next);this.domNodes.push(host);
 var templateTitle=this.getAttribute('template',''),picker=doc.createElement('select');picker.setAttribute('aria-label',isDanish(this.wiki)?'Startscene':'Starting scene');var blank=doc.createElement('option');blank.value='';blank.textContent=isDanish(this.wiki)?'Tom scene':'Blank stage';picker.appendChild(blank);templates(this.wiki).forEach(function(item){var opt=doc.createElement('option');opt.value=item.title;opt.textContent=item.name;picker.appendChild(opt);});picker.value=templateTitle;host.appendChild(picker);
 var input=doc.createElement('input');input.type='text';host.appendChild(input);
 var button=doc.createElement('button');button.type='button';host.appendChild(button);
 var ui;
 this._localize=function(){
  ui=Language.translator(self.wiki);
  var da=isDanish(self.wiki);
  input.placeholder=da?'Navn på din forestilling':ui('Name of your show');
  input.setAttribute('aria-label',input.placeholder);
  button.textContent=templateTitle?(da?'Brug som ny animation':ui('Use as new animation')):(da?'+ Ny forestilling':ui('+ New show'));
 };
 this._localize();
 function submit(){var result=create(self.wiki,input.value|| (isDanish(self.wiki)?'Min musical':ui('My musical')),picker.value);input.value='';self.dispatchEvent({type:'tm-navigate',navigateTo:result.title,navigateFromTitle:self.getVariable('currentTiddler')});}
 button.onclick=submit;input.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();submit();}};
};
Projects.prototype.refresh=function(changed){
 if(!changed["$:/language"]&&!changed[Language.packTitle(this.wiki)])return false;
 this._localize();
 return true;
};exports['animus-new-project']=Projects;exports.create=create;exports.templates=templates;
})();
