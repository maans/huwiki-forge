/*\
title: $:/plugins/huwiki/musical/projects.js
type: application/javascript
module-type: widget
\*/
(function(){
"use strict";
var Widget=require('$:/core/modules/widgets/widget.js').widget;
var Scenes=require('$:/plugins/huwiki/musical/scenes.js');
function create(wiki,name){
 name=String(name||'AniMus').trim()||'AniMus';var title=wiki.generateNewTitle(name),stageTitle=wiki.generateNewTitle(title+' · Scene 1'),scoreTitle=wiki.generateNewTitle(title+' · ABC'),filmTitle=wiki.generateNewTitle(title+' · Film');
 var stage=Scenes.blankScene('Scene 1'),film={version:1,id:stage.id+'-film',kind:'theatre',name:title,width:800,height:450,duration:16,background:'#edf3f5',parts:[],scenes:[{id:stage.id+'-clip',name:'Scene 1',source:stageTitle,sourceId:stage.id,duration:16,offset:0,speed:1,loop:false}],camera:{keys:[{t:0,x:400,y:225,zoom:1,easing:'smooth'}]},musical:{version:1,songs:[{id:stage.id+'-music',score:scoreTitle,start:0,duration:16,volume:1,lane:'A',kind:'complete-abc'}],audioClips:[],sfx:[],animationClips:[],cameraB:{keys:[{t:0,x:400,y:225,zoom:1}]},cuts:[{t:0,camera:'A'}],lighting:{keys:[{t:0,intensity:1}]}}};
 wiki.addTiddler(new $tw.Tiddler({title:stageTitle,type:'application/json','cutout-id':stage.id,'cutout-project':'yes',text:JSON.stringify(stage)}));
 wiki.addTiddler(new $tw.Tiddler({title:scoreTitle,type:'text/vnd.tiddlywiki',text:'<$huwiki-abc-score tiddler=<<currentTiddler>>/>','abc-source':'X:1\nT:'+name.replace(/[\r\n]/g,' ')+'\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\nz4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |','abc-accompaniment':'{"enabled":false}'}));
 wiki.addTiddler(new $tw.Tiddler({title:filmTitle,type:'application/json','cutout-id':film.id,'cutout-project':'yes',text:JSON.stringify(film)}));
 wiki.addTiddler(new $tw.Tiddler({title:title,type:'text/vnd.tiddlywiki',tags:['AniMusProjects'],'animus-scene':filmTitle,'animus-score':scoreTitle,text:'<$musical-stage scene={{!!animus-scene}} score={{!!animus-score}}/>'}));return {title:title,filmTitle:filmTitle,scoreTitle:scoreTitle,stageTitle:stageTitle};
}
function Projects(tree,options){this.initialise(tree,options);}Projects.prototype=new Widget();
Projects.prototype.render=function(parent,next){this.parentDomNode=parent;this.computeAttributes();var self=this,doc=this.document,da=!/\/en(?:-|$)/i.test(this.wiki.getTiddlerText('$:/language','')),host=doc.createElement('div');host.className='huw-animus-new-project';parent.insertBefore(host,next);this.domNodes.push(host);
 var input=doc.createElement('input');input.type='text';input.placeholder=da?'Navn på din forestilling':'Name of your show';input.setAttribute('aria-label',input.placeholder);host.appendChild(input);
 var button=doc.createElement('button');button.type='button';button.textContent=da?'+ Ny forestilling':'+ New show';host.appendChild(button);
 function submit(){var result=create(self.wiki,input.value|| (da?'Min musical':'My musical'));input.value='';self.dispatchEvent({type:'tm-navigate',navigateTo:result.title,navigateFromTitle:self.getVariable('currentTiddler')});}
 button.onclick=submit;input.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();submit();}};
};
Projects.prototype.refresh=function(){return false;};exports['animus-new-project']=Projects;exports.create=create;
})();
