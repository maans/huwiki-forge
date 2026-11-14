var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
'use strict';
exports.name='huwiki-slideshow-examples';exports.platforms=['browser'];exports.after=['huwiki-slideshow-startup'];exports.synchronous=true;
exports.startup=function(){
 const W=$tw.wiki;
 // Upgrade only the exact stock landing page; keep user-authored variations.
 const home='HUWiki Slideshow – Start',stock=W.getTiddlerText('$:/plugins/huwiki/slideshow/examples/PreviousHome','');
 if(W.tiddlerExists(home)&&W.getTiddlerText(home)===stock){const info=W.getPluginInfo('$:/plugins/huwiki/slideshow'),fresh=info&&info.tiddlers[home];if(fresh)W.addTiddler(new $tw.Tiddler(W.getTiddler(home),{text:fresh.text}));}
 $tw.rootWidget.addEventListener('hu-copy-slideshow-example',function(event){
  try{
   const P=window.HUWikiSlideshowPackage,source=event.param,original=W.getTiddler(source);
   if(!original||(original.fields.tags||[]).indexOf('Slideshow/Eksempler')<0)return false;
   const pack=P.collect(P.readDeck(source),source,{followDesignFields:true});const start=W.getTiddler(source+'/Start her');if(start)pack.data.tiddlers.push(start.getFieldStrings());const name=W.generateNewTitle('Min '+(original.fields.caption||ui.t('fortælling'))),map=new Map(),stamp=$tw.utils.stringifyDate(new Date());
   map.set(source,name);
   pack.data.tiddlers.forEach(row=>{if(row.title===source)return;map.set(row.title,row.title.startsWith(source+'/')?name+row.title.slice(source.length):name+'/Materialer/'+row.title);});
   // Longest first, in one pass, so a renamed title cannot be remapped twice.
   const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp(Array.from(map.keys()).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
   const rewrite=value=>typeof value==='string'?value.replace(pattern,m=>map.get(m)):Array.isArray(value)?value.map(rewrite):value;
   const rows=pack.data.tiddlers.map(row=>{
    const f={};Object.keys(row).forEach(k=>f[k]=rewrite(row[k]));f.created=stamp;f.modified=stamp;
    f.tags=$tw.utils.parseStringArray(f.tags||'').filter(t=>!t.startsWith('Slideshow/Eksempler')&&!t.startsWith('Slideshow/Tema/')&&!t.startsWith('Slideshow/Lær/')&&t!=='Slideshow/Eksempelindhold');
    if(row.title===source){const deck=JSON.parse(f.text);deck.name=name;deck.packageId=crypto.randomUUID();deck.author='';deck.version='1.0.0';deck.source={mode:'manual',value:''};f.text=JSON.stringify(deck);f.caption=name;f['example-origin']=source;delete f['example-order'];delete f['example-cover'];delete f['example-guide'];}
    return new $tw.Tiddler(f);
   });
   if(rows.some(t=>W.getTiddler(t.fields.title)))throw Error(ui.t('Navnet er allerede i brug. Prøv igen.'));
   W.addTiddlers(rows);new $tw.Story().navigateTiddler(name+'/Start her');
   $tw.rootWidget.dispatchEvent({type:'tm-huwiki-slideshow-open',param:name});
  }catch(e){$tw.utils.alert('Slidebibliotek',e.message||String(e));}
  return false;
 });
};
