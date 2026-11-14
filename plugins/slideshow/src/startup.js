var ui=require("$:/plugins/huwiki/slideshow/i18n.js");
/* HUWiki Slideshow Edition – independent, reusable TiddlyWiki plugin */
(function(){
"use strict";
exports.name="huwiki-slideshow-startup";
exports.platforms=["browser"];
exports.after=["startup"];
exports.synchronous=true;
exports.startup=function(){
  var W=$tw.wiki, root=$tw.rootWidget;
  var uiEvents=null;
  var TAG="HUWiki-Præsentation", layer=null,stage=null,working=null,selected="",dirty=false,selectedSlide=-1;
  var liveHandle=null,readHandle=null,activeBoard="";
  var readTitle="",presentationHistory=[],presentingTitle="",presenting=null,position=0,dragIndex=-1, nativeFullscreenEntered=false, finishingPresentation=false,saveTimer=null,returnToWorkshop=false,tagContextMenu=null;
  function byId(id){return document.getElementById("huws-"+id);}
  // PasteUp may emit many /Layout changes while an element is being moved.
  // TiddlyWiki's syncer can start a save for an intermediate position; then
  // an old server update becomes visible and looks like the object jumps back.
  // Defer only PasteUp layout saves until 1100ms after the last local edit.
  // All callbacks still go through the original adaptor and retain revision
  // checking. Other wiki content and the central PasteUp plugin are untouched.
  function htmlEscape(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
  function listDecks(){return (W.getTiddlersWithTag(TAG)||[]).slice().sort(function(a,b){return a.localeCompare(b,"da");});}
  function text(t,content){if(t)t.textContent=content;}
  // Tiddlers seeded by early Slideshow Editions lacked modification timestamps,
  // so they were missing from TiddlyWiki's Recent list. Repair only those demos.
  function repairDemoMetadata(){
    var demoNames=["Demo – HUWiki på storskærm","Demo – Genbrug dit indhold","Demo – Næste skridt"];
    demoNames.forEach(function(title){var old=W.getTiddler(title);if(!old||!old.fields)return;
      var f=old.fields, tags=Array.isArray(f.tags)?f.tags.slice():(typeof f.tags==="string"&&$tw.utils&&$tw.utils.parseStringArray?$tw.utils.parseStringArray(f.tags):[]), missingTag=tags.indexOf("Slideshow-Demo")<0||tags.indexOf("Slideshow")<0;
      var missingDate=!f.modified||!f.created;
      if(!missingTag&&!missingDate)return;
      ["Slideshow","Slideshow-Demo"].forEach(function(tag){if(tags.indexOf(tag)<0)tags.push(tag);});
      var now=new Date();var timestamp=$tw.utils&&$tw.utils.stringifyDate?$tw.utils.stringifyDate(now):now.toISOString().replace(/[-:TZ.]/g,"");
      var extra={tags:tags};if(!f.created)extra.created=timestamp;if(!f.modified)extra.modified=timestamp;
      W.addTiddler(new $tw.Tiddler(old,extra));
    });
  }

  // Older Slideshow Edition wikis can still have a stale DefaultTiddlers config.
  // The three real demonstration tiddlers distinguish this Edition from a
  // normal wiki that merely installed the optional slideshow plugin.
  function upgradeSlideshowActions(){
    var visibilityTitle="$:/config/PageControlButtons/Visibility/$:/plugins/huwiki/slideshow/present-open";
    function mountOpenAction(){document.querySelectorAll(".tc-sidebar-tab-open").forEach(function(host){
      var row=host.querySelector(".huws-open-present");
      if(W.getTiddlerText(visibilityTitle,"show")!=="show"){if(row)row.remove();host.classList.remove("huws-has-open-present");return;}
      host.classList.add("huws-has-open-present");
      if(!row){
        row=document.createElement("div");var button=document.createElement("button");row.className="huws-open-present";
        button.type="button";button.className="tc-btn-invisible huws-open-present-button";
        button.title=ui.t("Præsenter åbne tiddlere");button.setAttribute("aria-label",button.title);
        button.innerHTML='<span class="huws-shortcut-label" aria-hidden="true"></span><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
        button.onclick=function(){presentSource("story","");};row.appendChild(button);
      }
      var shortcut=W.getTiddlerText("$:/config/shortcuts/huwiki-present-open","shift-P").trim();
      var label=row.querySelector(".huws-shortcut-label"),caption=shortcut.replace(/shift[-+]/gi,"Shift+").replace(/ /g,"");if(label.textContent!==caption)label.textContent=caption;
      row.querySelector("button").title=ui.t("Præsenter åbne tiddlere")+(shortcut?" ("+shortcut.replace(/shift-/gi,"Shift + ")+")":"");
      if(!row.parentNode)host.appendChild(row);
    });}
    mountOpenAction();new window.MutationObserver(mountOpenAction).observe(document.body,{childList:true,subtree:true});
    W.addEventListener("change",function(changes){if(changes["$:/language"]||changes[visibilityTitle]||changes["$:/config/shortcuts/huwiki-present-open"])mountOpenAction();});
  }
  function installPresentationShortcut(){
    var config="$:/config/shortcuts/huwiki-present-open";
    document.addEventListener("keydown",function(e){
      if(e.defaultPrevented||e.repeat||e.isComposing)return;
      var target=e.target;
      if(target&&target.closest&&target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.tc-edit-texteditor'))return;
      if(stage&&stage.style.display!=="none"){
        var nested=byId("read-present");if(nested&&!nested.hidden&&!byId("read-panel").hidden){
          var nestedKeys=W.getTiddlerText(config,"shift-P").trim();
          if(nestedKeys&&$tw.keyboardManager.checkKeyDescriptors(e,$tw.keyboardManager.parseKeyDescriptors(nestedKeys))){e.preventDefault();presentReadList();}
        }return;
      }
      if(layer&&layer.style.display!=="none")return;
      var blocked=Array.prototype.some.call(document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],.tc-modal-wrapper'),function(el){return el.getClientRects().length>0&&window.getComputedStyle(el).visibility!=="hidden";});
      if(blocked)return;
      var keys=W.getTiddlerText(config,"shift-P").trim();if(!keys)return;
      if(!$tw.keyboardManager.checkKeyDescriptors(e,$tw.keyboardManager.parseKeyDescriptors(keys)))return;
      e.preventDefault();presentSource("story","");
    });
  }
  function repairSlideshowHome(){
    var start="HUWiki Slideshow – Start";
    if(!W.tiddlerExists(start)||
      !["Demo – HUWiki på storskærm","Demo – Genbrug dit indhold","Demo – Næste skridt"].every(function(t){return W.tiddlerExists(t);}))return;
    var t=W.getTiddler("$:/DefaultTiddlers"), desired="[["+start+"]]";
    if(W.getTiddlerText("$:/DefaultTiddlers","")!==desired)
      W.addTiddler(new $tw.Tiddler(t||{title:"$:/DefaultTiddlers"},{title:"$:/DefaultTiddlers",text:desired}));
  }

  function message(s,bad){var box=byId("message");if(!box)return;box.textContent=s;box.setAttribute("data-error",bad?"yes":"no");}
  function copy(o){return JSON.parse(JSON.stringify(o));}
  function normalizeBindings(b){b=b||{};var out={};["titleField","bodyField","imageTitle","imageField","secondaryTitle","footer"].forEach(function(k){out[k]=String(b[k]||"").slice(0,k==="footer"?500:230);});return out;}
  function normalize(obj){
    obj=obj&&typeof obj==="object"?obj:{};
    var source=obj.source&&typeof obj.source==="object"?obj.source:{};
    var kind=["manual","tag","story","list"].indexOf(String(source.mode||"manual"))>=0?String(source.mode||"manual"):"manual";
    return {schema:3,packageId:String(obj.packageId||""),author:String(obj.author||"" ).slice(0,150),version:String(obj.version||"1.0.0").slice(0,50),description:String(obj.description||"" ).slice(0,2000),name:String(obj.name||ui.t("Præsentation")).slice(0,130),theme:obj.theme==="paper"?"paper":"night",defaultBackgroundPasteUp:String(obj.defaultBackgroundPasteUp||"").slice(0,230),defaultLayoutPasteUp:String(obj.defaultLayoutPasteUp||"").slice(0,230),
      source:{mode:kind,value:kind==="story"||kind==="manual"?"":String(source.value||"").slice(0,230)},
      slides:(Array.isArray(obj.slides)?obj.slides:[]).slice(0,150).map(function(s){
        if(typeof s==="string")s={title:s};
        return {title:String(s&&s.title||"").slice(0,230),notes:String(s&&s.notes||"").slice(0,8000),
          backgroundPasteUp:String(s&&s.backgroundPasteUp||"").slice(0,230),
          // Older presentations only stored backgroundPasteUp; infer its mode at render time.
          displayMode:["auto","standard","background","pasteup","element","layout"].indexOf(String(s&&s.displayMode||""))>=0?String(s.displayMode):(s&&s.backgroundPasteUp?"background":"auto"),
          layoutPasteUp:String(s&&s.layoutPasteUp||"").slice(0,230),bindings:normalizeBindings(s&&s.bindings),
          pasteUpTitle:String(s&&s.pasteUpTitle||"").slice(0,230),
          panelColor:/^#[0-9a-fA-F]{6}$/.test(String(s&&s.panelColor||""))?String(s.panelColor):"#ffffff",
          panelOpacity:Math.max(0,Math.min(100,Number(s&&s.panelOpacity!=null?s.panelOpacity:92)||0))};
      }).filter(function(s){return !!s.title;})};
  }
  function load(t){var raw=W.getTiddlerText(t,"");try{
      var data=normalize(JSON.parse(raw)), fields=(W.getTiddler(t)||{}).fields||{};
      // The native TiddlyWiki list field is authoritative when a list was edited
      // by core draggable macros or another TiddlyWiki list editor.
      if(Array.isArray(fields.list)){
        var remaining=data.slides.slice(), ordered=[];
        fields.list.forEach(function(title){var at=remaining.findIndex(function(s){return s.title===title;});
          ordered.push(at>=0?remaining.splice(at,1)[0]:{title:String(title),notes:""});
        });
        data.slides=ordered.slice(0,150);
      }
      return data;
    }catch(err){throw new Error(ui.t("Præsentationen har ugyldige data. Ingen ændringer er gemt."));}}
  // A deck's unique native title is also its membership tag. The list remains
  // authoritative; no second deck or duplicate content is stored.
  var deckMembers=new Map(),memberTitles=new Set(),membershipTimer=null;
  function isSavedDeck(t){return t&&hasTag(t,TAG)&&!t.fields['draft.of']&&!t.fields['draft.title'];}
  function reconcileDeckTags(){
    membershipTimer=null;
    var next=new Map(),targets=new Set(),known=new Set(deckMembers.keys());
    listDecks().forEach(function(title){var t=W.getTiddler(title);if(!isSavedDeck(t))return;
      try{next.set(title,load(title).slides.map(function(s){return s.title;}));}
      catch(e){if(deckMembers.has(title))next.set(title,deckMembers.get(title));}
    });
    next.forEach(function(slides,title){known.add(title);slides.forEach(function(s){targets.add(s);});});
    deckMembers.forEach(function(slides){slides.forEach(function(s){targets.add(s);});});
    known.forEach(function(tag){(W.getTiddlersWithTag(tag)||[]).forEach(function(t){targets.add(t);});});
    var wanted=new Map();next.forEach(function(slides,tag){slides.forEach(function(title){if(!wanted.has(title))wanted.set(title,[]);wanted.get(title).push(tag);});});
    deckMembers=next;memberTitles=new Set(wanted.keys());
    targets.forEach(function(title){var t=W.getTiddler(title);if(!t||t.fields['draft.of']||t.fields['draft.title'])return;
      var before=t.fields.tags||[],required=wanted.get(title)||[],after=before.filter(function(tag){return !known.has(tag)||required.indexOf(tag)>=0;});
      required.forEach(function(tag){if(after.indexOf(tag)<0)after.push(tag);});
      if(JSON.stringify(before)!==JSON.stringify(after))W.addTiddler(new $tw.Tiddler(t,W.getModificationFields(),{tags:after}));
    });
  }
  function installDeckTags(){
    reconcileDeckTags();
    W.addEventListener('change',function(changes){
      var relevant=Object.keys(changes).some(function(title){return deckMembers.has(title)||memberTitles.has(title)||isSavedDeck(W.getTiddler(title));});
      if(relevant&&!membershipTimer)membershipTimer=setTimeout(reconcileDeckTags,0);
    });
  }
  function markChanged(){dirty=true;var n=byId("dirty");if(n)n.textContent=ui.t("Gemmer automatisk…");
    if(saveTimer)clearTimeout(saveTimer);
    if(working&&working.name.trim())saveTimer=setTimeout(function(){saveTimer=null;if(dirty)save();},900);
    message(ui.t("Ændringerne gemmes automatisk."));
  }
  function ensureSaved(){if(dirty){if(working&&working.name.trim())save();
      if(dirty){message(ui.t("Tilføj et slide, og gem præsentationen først."),true);return false;}}
    return true;}
  // PasteUp v0.1.6 uses a JSON root with the tag "pasteup" and companion
  // /Layout, /Styles and /Actions tiddlers. We do not copy or fork its engine.
  var PASTEUP_PLUGIN="$:/plugins/huwiki/pasteup", PASTEUP_EXAMPLE=PASTEUP_PLUGIN+"/Examples/RetroPlakat";
  function pasteUpAvailable(){return !!W.getTiddler(PASTEUP_PLUGIN+"/Engine/Embed");}
  function hasTag(t,tag){var a=t&&t.fields&&t.fields.tags||[];return (Array.isArray(a)?a:typeof a==="string"&&$tw.utils&&$tw.utils.parseStringArray?$tw.utils.parseStringArray(a):[]).indexOf(tag)>=0;}
  function isPasteUp(title){var t=title&&W.getTiddler(title);return !!(t&&hasTag(t,"pasteup")&&W.getTiddler(title+"/Layout")&&W.getTiddler(title+"/Styles"));}
  function pasteUpBoards(){var a=[];
    W.eachTiddlerPlusShadows(function(t,title){if(title.indexOf("$:/")===0||!t||!t.fields)return;
      if(isPasteUp(title))a.push(title);
    });return a.sort(function(x,y){return x.localeCompare(y,"da");});}
  function slideMode(s,deck){
    if(!s)return "standard";
    if(s.displayMode&&s.displayMode!=="auto")return s.displayMode;
    if(isPasteUp(s.title))return "pasteup";
    if(s.backgroundPasteUp)return "background"; // v0.8.4 compatibility
    if(deck&&deck.defaultLayoutPasteUp)return "layout";
    if(deck&&deck.defaultBackgroundPasteUp)return "background";
    return "standard";
  }
  function slideBoard(s,deck){
    var mode=slideMode(s,deck);
    if(mode==="layout")return s.layoutPasteUp||deck&&deck.defaultLayoutPasteUp||"";
    if(mode==="background")return s.backgroundPasteUp||deck&&deck.defaultBackgroundPasteUp||"";
    if(mode==="pasteup"||mode==="element")return s.pasteUpTitle||(isPasteUp(s.title)?s.title:"");
    return "";
  }
  function slideLabel(s,deck){var mode=slideMode(s,deck),board=slideBoard(s,deck);
    if(mode==="layout")return board?ui.t("Levende layout: ")+board:ui.t("Vælg et layout under Design");
    if(mode==="element")return board?ui.t("Tiddler i PasteUp: ")+board:ui.t("Tiddler i PasteUp · ikke oprettet");
    if(mode==="pasteup")return board?ui.t("PasteUp-slide: ")+board:ui.t("Vælg PasteUp-slide");
    if(mode==="layout")return s.layoutPasteUp||deck&&deck.defaultLayoutPasteUp||"";
    if(mode==="background")return board?"PasteUp-baggrund: "+board:ui.t("Vælg en PasteUp-baggrund");
    return "Standarddesign";
  }
  function boardPicker(value,includeNone){
    var html=includeNone?'<option value="">Ingen PasteUp-baggrund</option>':ui.t('<option value="">Vælg en PasteUp-plade…</option>');
    pasteUpBoards().forEach(function(title){html+='<option value="'+htmlEscape(title)+'"'+(value===title?' selected':'')+'>'+htmlEscape(title)+'</option>';});
    return html;
  }
  function navigateToEdit(title){
    if(!title||!W.getTiddler(title)){message(ui.t("Tiddleren findes ikke."),true);return;}
    if(!ensureSaved())return;
    // tm-navigate without TiddlyWiki's proper navigation payload may silently
    // do nothing. Use its official Story API, as our PasteUp plugin itself does.
    try{
      new $tw.Story().navigateTiddler(title);
      layer.style.display="none";
      setTimeout(function(){
        try{var frames=Array.prototype.slice.call(document.querySelectorAll(".tc-tiddler-frame[data-tiddler-title]"));
          var frame=frames.find(function(el){return el.getAttribute("data-tiddler-title")===title;});
          if(frame)frame.scrollIntoView({block:"start",behavior:"smooth"});}catch(_ignored){}
      },130);
    }catch(err){message(ui.t("Kunne ikke åbne PasteUp: ")+String(err.message||err),true);}
  }
  // Create a personal board before inserting linked tiddler content. Never
  // mutate a shared design selected as a template/background.
  function newPersonalBoard(sourceTitle,templateTitle){
    if(!pasteUpAvailable())throw new Error(ui.t("HUWiki PasteUp skal installeres fra pluginbiblioteket først."));
    var title=W.generateNewTitle("Slide – "+String(sourceTitle).slice(0,65)+" – PasteUp");
    var now=$tw.utils&&$tw.utils.stringifyDate?$tw.utils.stringifyDate(new Date()):new Date().toISOString().replace(/[-:TZ.]/g,"");
    if(templateTitle){
      if(!isPasteUp(templateTitle))throw new Error(ui.t("Det valgte design er ikke en tilgængelig PasteUp-plade."));
      ["","/Layout","/Styles","/Actions"].forEach(function(suffix){var seed=W.getTiddler(templateTitle+suffix);
        if(!seed)throw new Error("PasteUp-designet mangler "+suffix);
        var extra={title:title+suffix,created:now,modified:now};
        if(!suffix){var tags=Array.isArray(seed.fields.tags)?seed.fields.tags.slice():["pasteup"];
          if(tags.indexOf("pasteup")<0)tags.push("pasteup");if(tags.indexOf("Slideshow")<0)tags.push("Slideshow");extra.tags=tags;}
        W.addTiddler(new $tw.Tiddler(seed,extra));
      });
    }else{
      var basic={title:title,type:"application/json",tags:["pasteup","Slideshow"],created:now,modified:now,
        farvefelt:"",text:JSON.stringify({cols:32,rows:18,pages:1,background:"#163451",border:"0"})};
      W.addTiddler(new $tw.Tiddler(basic));
      W.addTiddler(new $tw.Tiddler({title:title+"/Layout",created:now,modified:now,farvefelt:"1,21,18,32,1",text:""}));
      W.addTiddler(new $tw.Tiddler({title:title+"/Styles",created:now,modified:now,farvefelt:"background:linear-gradient(145deg,#1b7d92,#54b9c2); .huws-pu-accent",text:""}));
      W.addTiddler(new $tw.Tiddler({title:title+"/Actions",created:now,modified:now,text:""}));
    }
    return title;
  }
  function linkedBoardItems(name){
    var t=W.getTiddler(name),fields=t&&t.fields||{},items=[];
    Object.keys(fields).forEach(function(field){
      if(!/^tiddlerindhold\d*$/.test(field))return;
      var markup=String(fields[field]||"");
      var m=markup.match(/<\$transclude\s+tiddler="([^"]+)"/);
      if(m)items.push({field:field,title:m[1].replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&amp;/g,'&')});
    });
    return items;
  }
  function linkedSummary(name){
    var items=linkedBoardItems(name),seen=Object.create(null);
    return {items:items,duplicates:items.filter(function(x){var k=x.title;seen[k]=(seen[k]||0)+1;return seen[k]>1;})};
  }
  function thisSafeColor(v){return /^#[0-9a-fA-F]{6}$/.test(String(v))?String(v):"#ffffff";}
  function colorWithOpacity(hex,opacity){
    var h=/^#[0-9a-fA-F]{6}$/.test(String(hex))?hex:"#ffffff";
    var alpha=Math.max(0,Math.min(100,Number(opacity)||0))/100;
    return "rgba("+parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16)+","+alpha.toFixed(2)+")";
  }
  function insertTiddlerInBoard(name,title){
    if(!isPasteUp(name)||!title||!W.tiddlerExists(title)||isPasteUp(title))throw new Error(ui.t("Vælg en eksisterende almindelig tiddler."));
    var t=W.getTiddler(name),layout=W.getTiddler(name+"/Layout"),styles=W.getTiddler(name+"/Styles");
    if(!t||!layout||!styles)throw new Error("PasteUp-pladen mangler layout eller styling.");
    var existing=linkedBoardItems(name).filter(function(item){return item.title===title;});
    if(existing.length)return {field:existing[0].field,created:false,count:existing.length};
    var field="tiddlerindhold",index=2;while(Object.prototype.hasOwnProperty.call(t.fields,field)){field="tiddlerindhold"+index++;}
    var markup='<$transclude tiddler="'+String(title).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;")+'" mode="block"/>';
    var value={};value[field]=markup;
    var loc={};loc[field]="5,3,15,29,12";
    var stylesValue={};stylesValue[field]="color:#183653;background:rgba(255,255,255,.91);padding:0.45em;border-radius:.32em; .huws-pu-linked";
    W.addTiddler(new $tw.Tiddler(t,value));W.addTiddler(new $tw.Tiddler(layout,loc));W.addTiddler(new $tw.Tiddler(styles,stylesValue));
    return {field:field,created:true,count:1};
  }
  // View-only policy: no tags, title changes or sync/save filters are modified.
  var showTechnical=false;
  function isInternalSupportTiddler(title){
    var match=String(title||"").match(/^(.*)\/(Layout|Styles|Actions)$/);
    return !!(match&&isPasteUp(match[1])&&W.getTiddler(match[1]).fields.type==="application/json");
  }
  function visibleTitle(title){return showTechnical||!isInternalSupportTiddler(title);}
  function installTechnicalViews(){
    var original=W.filterTiddlers;
    var views=["$:/core/ui/SideBar/Recent","$:/core/ui/MoreSideBar/Recent",
      "$:/core/ui/MoreSideBar/All","$:/core/ui/MoreSideBar/Tags",
      "$:/core/ui/MoreSideBar/Types","$:/core/ui/MoreSideBar/Orphans",
      "$:/core/ui/TagTemplate","$:/core/ui/UntaggedTemplate","$:/core/ui/DefaultSearchResultList"];
    W.filterTiddlers=function(filter,widget,source){
      var scoped=false;
      // Only stock browsing surfaces. Headless calls, custom filters, PasteUp,
      // editor, Advanced Search, export and sync keep the original semantics.
      for(var w=widget;w;w=w.parentWidget){
        var current=w.getVariable&&w.getVariable("currentTiddler");
        var transcluded=w.getAttribute&&(w.getAttribute("$tiddler")||w.getAttribute("tiddler"));
        if(current==="$:/AdvancedSearch"||String(transcluded||"").indexOf("$:/core/ui/AdvancedSearch")===0)return original.call(this,filter,widget,source);
        if(views.indexOf(current)>=0||views.indexOf(transcluded)>=0)scoped=true;
      }
      if(!scoped||showTechnical)return original.call(this,filter,widget,source);
      var input=source||function(callback){W.each(callback);};
      var filtered=function(callback){input(function(t,title){if(visibleTitle(title))callback(t,title);});};
      return original.call(this,filter,widget,filtered).filter(visibleTitle);
    };
  }
  function toggleTechnical(value){
    showTechnical=!!value;titleCache=null;
    if(layer){renderSources();renderSlides();}
    // An explicit UI refresh is enough; the preference never enters shared data.
    if(root&&root.refreshChildren)root.refreshChildren({},true);
  }
  installTechnicalViews();
  W.addEventListener("change",function(){titleCache=null;});
  function allSlideTitles(){var out=[];W.eachTiddlerPlusShadows(function(t,title){if(title.indexOf("$:/")===0||!t||!t.fields)return;
      if(hasTag(t,TAG)||!visibleTitle(title))return;
      if(["text/vnd.tiddlywiki","text/plain","text/html"].indexOf(String(t.fields.type||"text/vnd.tiddlywiki"))<0&&!isPasteUp(title))return;
      out.push(title);
    });return out.sort(function(a,b){return a.localeCompare(b,"da");});}
  function suitableTitle(title){return title&&title.indexOf("$:/")!==0&&W.getTiddler(title)&&allSlideTitleCache().indexOf(title)>=0;}
  var titleCache=null;
  function allSlideTitleCache(){return titleCache||(titleCache=allSlideTitles());}
  function distinctTitles(titles){var seen=Object.create(null);return (Array.isArray(titles)?titles:[]).filter(function(t){
      return typeof t==="string"&&!seen[t]&&suitableTitle(t)&&(seen[t]=true);
    }).slice(0,150);
  }
  function getListField(title){var t=W.getTiddler(title);return t&&Array.isArray(t.fields.list)?t.fields.list.slice():[];}
  function getSourceTitles(source){if(!source||source.mode==="manual")return [];
    if(source.mode==="story")return distinctTitles(getListField("$:/StoryList"));
    if(source.mode==="tag")return distinctTitles(W.getTiddlersWithTag(source.value)||[]);
    if(source.mode==="list")return distinctTitles(getListField(source.value));
    return [];
  }
  function sourceLabel(src){if(!src||src.mode==="manual")return ui.t("Manuelt udvalg");
    if(src.mode==="story")return ui.t("StoryList (øjebliksbillede)");
    return (src.mode==="tag"?"Tag: ":"Titelliste: ")+src.value;
  }
  function availableTags(){var seen=Object.create(null),out=[];
    W.each(function(t,title){if(!t||!t.fields||!visibleTitle(title))return;var tags=t.fields.tags||[];
      (Array.isArray(tags)?tags:[]).forEach(function(tag){
        if(typeof tag==="string"&&tag.indexOf("$:/")!==0&&tag!==TAG&&!seen[tag]){seen[tag]=true;out.push(tag);}
      });
    });
    return out.sort(function(a,b){return a.localeCompare(b,"da");});
  }
  function removeTagMenu(){if(tagContextMenu){tagContextMenu.remove();tagContextMenu=null;}}
  function tagFromPill(pill){
    var owner=pill.closest("[data-tag-title]");
    var candidates=[owner&&owner.getAttribute("data-tag-title"),pill.getAttribute("data-tag-title"),pill.getAttribute("data-tag"),pill.textContent&&pill.textContent.trim()];
    var tags=availableTags();
    for(var i=0;i<candidates.length;i++){if(candidates[i]&&tags.indexOf(candidates[i])>=0)return candidates[i];}
    return "";
  }
  function setupTagPillMenu(){
    document.addEventListener("contextmenu",function(ev){
      var pill=ev.target&&ev.target.closest&&ev.target.closest(".tc-tag-label");
      if(!pill)return;
      var tag=tagFromPill(pill);if(!tag)return;
      titleCache=null;var saved=isSavedDeck(W.getTiddler(tag)),count;
      try{count=saved?load(tag).slides.length:getSourceTitles({mode:"tag",value:tag}).length;}catch(e){return;}
      if(!count)return; // Keep the normal browser menu for empty/unknown tags.
      ev.preventDefault();removeTagMenu();
      var menu=document.createElement("div");menu.className="huws-tag-menu";menu.setAttribute("role","menu");
      var label=document.createElement("div");label.className="huws-tag-menu-title";label.textContent=tag+" · "+count+" slides";menu.appendChild(label);
      var presentBtn=document.createElement("button");presentBtn.type="button";presentBtn.setAttribute("role","menuitem");presentBtn.textContent=saved?ui.t("▶ Præsenter slideshow"):ui.t("▶ Præsenter dette tag");
      presentBtn.onclick=function(){removeTagMenu();if(saved)startPresent(load(tag),tag);else presentSource("tag",tag);};menu.appendChild(presentBtn);
      var saveBtn=document.createElement("button");saveBtn.type="button";saveBtn.setAttribute("role","menuitem");saveBtn.textContent=ui.t("+ Opret præsentation fra tag");
      saveBtn.onclick=function(){removeTagMenu();if(!layer)build();renderDecks();layer.style.display="flex";openCreate("tag");byId("create-value").value=tag;};menu.appendChild(saveBtn);
      document.body.appendChild(menu);tagContextMenu=menu;
      var width=menu.getBoundingClientRect().width,height=menu.getBoundingClientRect().height;
      menu.style.left=Math.max(8,Math.min(ev.clientX,window.innerWidth-width-8))+"px";
      menu.style.top=Math.max(8,Math.min(ev.clientY,window.innerHeight-height-8))+"px";
      presentBtn.focus();
    });
    document.addEventListener("pointerdown",function(ev){if(tagContextMenu&&!tagContextMenu.contains(ev.target))removeTagMenu();},true);
    document.addEventListener("keydown",function(ev){if(ev.key==="Escape"&&tagContextMenu){ev.preventDefault();ev.stopPropagation();removeTagMenu();}},true);
    window.addEventListener("blur",removeTagMenu);
  }
  function availableLists(){var out=[];
    W.each(function(t,title){if(!t||!t.fields||title.indexOf("$:/")===0||!Array.isArray(t.fields.list)||(t.fields.tags||[]).indexOf(TAG)>=0)return;
      if(t.fields.list.some(function(x){return suitableTitle(x);}))out.push(title);
    });return out.sort(function(a,b){return a.localeCompare(b,"da");});
  }
  function sourceChoices(){var mode=byId("create-mode").value, chooser=byId("create-value-wrap"), pick=byId("create-value");
    chooser.hidden=mode!=="tag"&&mode!=="list";pick.textContent="";
    var values=mode==="tag"?availableTags():mode==="list"?availableLists():[];
    values.forEach(function(value){var opt=document.createElement("option");opt.value=value;opt.textContent=value;pick.appendChild(opt);});
    byId("create-hint").textContent=mode==="story"?ui.t("De åbne tiddlers kopieres i den aktuelle rækkefølge. Wikiens StoryList ændres ikke."):
      mode==="tag"?ui.t("Vælg et tag. Slidene får deres egen rækkefølge i præsentationen."):
      mode==="list"?ui.t("Vælg en tiddler med et list-felt. Kildens liste forbliver uændret."):
      ui.t("Tilføj selv tiddlers og flyt dem med træk-og-slip.");
    if(chooser.hidden||values.length)return;
    var empty=document.createElement("option");empty.textContent=ui.t("Ingen egnede kilder fundet");empty.value="";pick.appendChild(empty);
  }
  function importFromSource(){if(!working||working.source.mode==="manual")return;
    titleCache=null;
    var titles=getSourceTitles(working.source), present=Object.create(null),added=0;
    working.slides.forEach(function(s){present[s.title]=true;});
    titles.forEach(function(title){if(!present[title]&&working.slides.length<150){working.slides.push({title:title,notes:""});present[title]=true;added++;}});
    if(added){markChanged();renderSlides();}
    message(added?added+ui.t(" nye slides tilføjet fra kilden. Den gemte rækkefølge er bevaret. Klik Gem."):
      ui.t("Ingen nye tiddlers i kilden. Den gemte rækkefølge er uændret."));
  }
  var activeTab="slides",exportBusy=false;
  function refreshPublishedSites(){var el=byId("published-sites");if(el&&window.HUWikiSlideshowSite)window.HUWikiSlideshowSite.renderManagement(el,selected,function(options){byId("publish-site").huwOptions=options;byId("publish-site").click();});}
  function switchTab(name){if(name==="export")refreshPublishedSites();
    activeTab=name;if(name==="import")message("");
    ["slides","design","import","export","advanced"].forEach(function(key){
      var button=byId("tab-"+key),panel=byId("pane-"+key);
      if(!button||!panel)return;
      button.setAttribute("aria-selected",String(key===name));button.tabIndex=key===name?0:-1;panel.hidden=key!==name;
    });
  }
  function buildTabs(){
    var body=layer.querySelector(".huws-body"),main=byId("main"),nav=document.createElement("div");
    nav.className="huws-tabs";nav.setAttribute("role","tablist");nav.setAttribute("aria-label",ui.t("Slideshowværksted"));
    var names={slides:"Slides",design:"Design",import:"Import",export:ui.t("Eksport"),advanced:ui.t("Avanceret")};
    Object.keys(names).forEach(function(key){
      var b=document.createElement("button"),panel=document.createElement("section");
      b.type="button";b.id="huws-tab-"+key;b.textContent=names[key];b.setAttribute("role","tab");b.setAttribute("aria-controls","huws-pane-"+key);
      b.onclick=function(){switchTab(key);};nav.appendChild(b);
      panel.id="huws-pane-"+key;panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby",b.id);body.appendChild(panel);
    });
    body.parentNode.insertBefore(nav,body);
    nav.onkeydown=function(e){var keys=Object.keys(names),i=keys.indexOf(activeTab);
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();
      i=e.key==="Home"?0:e.key==="End"?keys.length-1:(i+(e.key==="ArrowRight"?1:-1)+keys.length)%keys.length;
      switchTab(keys[i]);byId("tab-"+keys[i]).focus();};
    var settings=main.querySelector(".huws-settings");byId("pane-design").appendChild(settings);
    var designNote=document.createElement("p");designNote.className="huws-hint";designNote.textContent=ui.t("Fælles design gælder præsentationen. Det enkelte slide kan overstyre designet under Slides.");byId("pane-design").appendChild(designNote);
    // Move the original controls intact, preserving all slide handlers and IDs.
    [body.querySelector(".huws-row"),byId("create"),main].forEach(function(el){byId("pane-slides").appendChild(el);});
    var advanced=body.querySelector(".huws-advanced");advanced.open=true;advanced.querySelector("summary").remove();byId("pane-advanced").appendChild(advanced);
    byId("pane-export").innerHTML=ui.t('<h3>PDF</h3><p>Gem den valgte præsentation som en PDF med ét slide pr. side. Noter medtages ikke.</p><button type="button" id="huws-export-pdf">Hent PDF</button><h3>Komplet HUWiki-backup</h3><p>Hent hele wikien som ZIP med redigerbar offline-wiki, originale tiddlers, plugins og indlejrede filer. Pak ZIP-filen ud før brug.</p><button type="button" id="huws-export-zip">Hent HUWiki-backup som ZIP</button><p id="huws-export-status" role="status" aria-live="polite"></p>');
    byId("export-pdf").onclick=function(){runExport("pdf");};byId("export-zip").onclick=function(){runExport("zip");};
    if(window.HUWikiSlideshowImport)window.HUWikiSlideshowImport.mount(byId("pane-import"));
    else byId("pane-import").textContent=ui.t("Importmodulet kunne ikke indlæses. Genindlæs wikien.");
    var meta=document.createElement("div");meta.className="huws-settings";meta.innerHTML=ui.t('<h3>Præsentationspakke</h3><label>Forfatter<input id="huws-package-author" maxlength="150"></label><label>Version<input id="huws-package-version" maxlength="50" placeholder="1.0.0"></label><label>Beskrivelse<textarea id="huws-package-description" maxlength="2000"></textarea></label><p>Slides, billeder, PasteUps og linkmål følger med som én samlet pakke.</p>');byId("pane-export").prepend(meta);
    ["author","version","description"].forEach(function(k){byId("package-"+k).oninput=function(){if(!working)return;working[k]=this.value;markChanged();};});
    var preparedNative="";var nativeButton=document.createElement("button");nativeButton.type="button";nativeButton.textContent=ui.t("Hent præsentationspakke");nativeButton.id="huws-export-native";
    nativeButton.onclick=async function(){var status=byId("export-status");try{if(!working||!working.slides.length)throw Error(ui.t("Vælg en præsentation med slides."));if(!ensureSaved())return;
      var pack=await window.HUWikiSlideshowExports.portablePackage(await window.HUWikiSlideshowPackage.review(copy(working),selected),function(t){status.textContent=t;}),fingerprint=JSON.stringify([pack.data.deck,pack.data.tiddlers]);window.HUWikiSlideshowImport.exportNative(copy(working),selected,pack);preparedNative="";nativeButton.textContent=ui.t("Hent præsentationspakke");status.textContent=ui.t("Pakken er hentet. ")+window.HUWikiSlideshowPackage.describe(pack);
    }catch(error){status.textContent=error.message;}};
    byId("pane-export").insertBefore(nativeButton,byId("pane-export").firstChild);
    if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.mountGallery(byId("pane-design"),{deck:function(){return working;},edit:navigateToEdit,changed:function(){markChanged();renderDetails();}});
    var publishedSites=document.createElement("section");publishedSites.id="huws-published-sites";byId("pane-export").insertBefore(publishedSites,byId("pane-export").firstChild);window.addEventListener("huwiki-slideshow-sites-changed",function(){if(activeTab==="export")refreshPublishedSites();},{signal:uiEvents.signal});
    var publishSiteButton=document.createElement("button");publishSiteButton.id="huws-publish-site";publishSiteButton.textContent=ui.t("Gem eller opdater site");publishSiteButton.onclick=async function(){try{if(!working||!ensureSaved())return;publishSiteButton.disabled=true;var pack=await window.HUWikiSlideshowExports.portablePackage(await window.HUWikiSlideshowPackage.review(copy(working),selected),function(t){byId("export-status").textContent=t;});await window.HUWikiSlideshowSite.publishDialog(pack,publishSiteButton.huwOptions||{});}catch(e){byId("export-status").textContent=e.message;}finally{publishSiteButton.huwOptions=null;publishSiteButton.disabled=false;}};byId("pane-export").insertBefore(publishSiteButton,byId("export-status"));
    var siteButton=document.createElement("button");siteButton.id="huws-export-site";siteButton.textContent=ui.t("Klargør interaktivt Site");var readySite=null,siteFingerprint="";siteButton.onclick=async function(){var status=byId("export-status");try{if(!working||!ensureSaved())return;var pack=await window.HUWikiSlideshowExports.portablePackage(await window.HUWikiSlideshowPackage.review(copy(working),selected),function(t){status.textContent=t;}),fingerprint=JSON.stringify([pack.data.deck,pack.data.tiddlers]);siteButton.disabled=true;await window.HUWikiSlideshowSite.download(pack);status.textContent=ui.t("Sitet er hentet som ZIP. Pak filen ud og åbn index.html.");siteFingerprint="";siteButton.textContent=ui.t("Klargør interaktivt Site");}catch(e){status.textContent=e.message;}finally{siteButton.disabled=false;}};byId("pane-export").insertBefore(siteButton,byId("export-status"));
    switchTab("slides");
  }
  async function runExport(kind){
    if(exportBusy)return;
    var status=byId("export-status");status.textContent="";
    if(kind==="pdf"&&(!working||!working.slides.length)){status.textContent=ui.t("Vælg en præsentation med mindst ét slide under Slides.");return;}
    if(dirty)save();if(dirty){status.textContent=ui.t("Gem præsentationen før eksport.");return;}
    exportBusy=true;byId("export-pdf").disabled=byId("export-zip").disabled=true;
    try{
      if(!window.HUWikiSlideshowExports)throw Error(ui.t("Eksportmodulet er ikke indlæst. Genindlæs wikien."));
      var report=function(value){status.textContent=value;};
      var result=kind==="pdf"?await window.HUWikiSlideshowExports.pdf(copy(working),renderSlideContent,report):await window.HUWikiSlideshowExports.backup(report);
      status.textContent=kind==="pdf"?ui.t("PDF er hentet. "):"ZIP-backup er klar og hentet.";
      if(result&&result.url){var link=document.createElement("a");link.href=result.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=ui.t("Åbn PDF");status.appendChild(link);}
    }catch(err){status.textContent=ui.t("Eksporten blev ikke fuldført: ")+err.message;}
    finally{exportBusy=false;byId("export-pdf").disabled=byId("export-zip").disabled=false;}
  }
  function renderSlideContent(slide,deck){
    if(!W.getTiddler(slide.title))throw Error(ui.t("Tiddleren mangler: ")+slide.title);
    var mode=slideMode(slide,deck),board=slideBoard(slide,deck),composed=mode==="background"&&board&&pasteUpAvailable()&&isPasteUp(board);
    if((mode==="pasteup"||mode==="element")&&(!board||!isPasteUp(board)||!pasteUpAvailable()))throw Error("PasteUp-pladen eller pluginet mangler.");
    if(mode==="background"&&board&&!composed)throw Error("PasteUp-baggrunden mangler.");
    if(mode==="layout"){
      if(!board||!isPasteUp(board)||!pasteUpAvailable())throw Error(ui.t("Vælg et PasteUp-layout under Design."));
      return {html:window.HUWikiSlideshowLayouts.staticHtml(board,slide,deck),visual:true,composed:false};
    }
    var html=composed?'<div class="huws-composed-slide"><div class="huws-composed-background" aria-hidden="true">'+renderPasteUpSlide(board)+'</div><div class="huws-composed-foreground" style="background:'+colorWithOpacity(slide.panelColor,slide.panelOpacity==null?92:slide.panelOpacity)+'">'+W.renderTiddler("text/html",slide.title)+'</div></div>':
      (mode==="pasteup"||mode==="element")?renderPasteUpSlide(board):W.renderTiddler("text/html",slide.title);
    return {html:html,visual:mode==="pasteup"||mode==="element"||!!composed,composed:!!composed};
  }
  function build(){
    if(layer)return;
    uiEvents=new AbortController();
    layer=document.createElement("div");layer.id="huws-layer";layer.className="huws-layer";layer.style.display="none";
    layer.innerHTML='<div class="huws-panel" role="dialog" aria-modal="true" aria-label="HUWiki Slideshow">'
      +ui.t('<header class="huws-head"><div><h2>HUWiki Slideshow</h2><p>Genbrug tiddlers som slides – uden at kopiere indholdet.</p></div><div class="huws-head-buttons"><button type="button" id="huws-present" class="huws-present-btn" hidden>▶ Præsenter</button><button type="button" id="huws-close" aria-label="Luk">×</button></div></header>')
      +ui.t('<div class="huws-body"><div class="huws-row"><label for="huws-deck">Præsentation</label><select id="huws-deck"></select><button id="huws-new" type="button">+ Ny</button></div>')
      +ui.t('<div id="huws-create" class="huws-create huws-create-deck" hidden><label>Navn på præsentationen<input maxlength="100" id="huws-create-name" placeholder="F.eks. Fællessamling"/></label><label>Start med<select id="huws-create-mode"><option value="manual">Tom / manuelt udvalg</option><option value="tag">Tiddlers med et tag</option><option value="story">Åbne tiddlers (StoryList)</option><option value="list">Gemt titelliste</option></select></label><label id="huws-create-value-wrap" hidden>Vælg kilde<select id="huws-create-value"></select></label><p id="huws-create-hint" class="huws-hint"></p><div class="huws-create-actions"><button type="button" id="huws-create-ok" class="huws-primary">Opret præsentation</button><button type="button" id="huws-create-no">Annuller</button></div></div>')
      +ui.t('<div id="huws-main" hidden><div class="huws-settings"><label>Titel<input id="huws-name" maxlength="130"></label><label>Design<select id="huws-theme"><option value="night">Mørk</option><option value="paper">Lys</option></select></label><label id="huws-global-background-row" hidden>Fælles PasteUp-layout<select id="huws-default-pasteup"></select></label></div>')
      +ui.t('<div class="huws-source-info"><span><strong>Kilde:</strong> <span id="huws-source-description"></span></span><button type="button" id="huws-refresh-source" hidden>Hent nye slides fra kilden</button></div>')
      +ui.t('<h3>Slides <small id="huws-count"></small></h3><p class="huws-hint">Træk for at ændre rækkefølge – ændringer gemmes automatisk. Indholdet bliver i den oprindelige tiddler.</p><div id="huws-slides" class="huws-slides"></div>')
      +ui.t('<div class="huws-row"><select id="huws-source"><option value="">Vælg eksisterende tiddler…</option></select><button type="button" id="huws-add">Tilføj</button></div>')
      +ui.t('<div class="huws-create"><label>Nyt slide som tiddler<input id="huws-slide-name" maxlength="140" placeholder="Titel på slide"></label><button type="button" id="huws-create-slide">Opret slide</button></div>')
      +ui.t('<div class="huws-pasteup-tools"><div><strong>Visuelt slide med PasteUp</strong><p class="huws-hint" id="huws-pasteup-hint">Brug HUWiki PasteUp-pluginet til frit placerede elementer. Det installeres via pluginbiblioteket.</p></div><button type="button" id="huws-new-pasteup">+ Opret PasteUp-slide</button></div>')
      +ui.t('<div class="huws-actions"><button type="button" id="huws-save" class="huws-primary">Gem præsentation</button><small id="huws-dirty"></small></div></div>')
      +ui.t('<details class="huws-advanced"><summary>Avanceret</summary><label><input type="checkbox" id="huws-technical"> Vis tekniske tiddlers</label><p class="huws-hint">Gælder denne åbne wiki indtil genindlæsning. Hjælpefiler følger med, når du gemmer hele wikien.</p></details>')
      +'<div id="huws-message" class="huws-message" aria-live="polite"></div></div></div>';
    document.body.appendChild(layer);
    buildTabs();
    stage=document.createElement("div");stage.id="huws-stage";stage.className="huws-stage";stage.style.display="none";
    stage.innerHTML=ui.t('<div class="huws-stage-top"><span id="huws-stage-title"></span><span id="huws-stage-counter"></span><button type="button" id="huws-back" hidden>↩ Tilbage</button><span id="huws-navigation-status" role="status"></span><button id="huws-stage-exit" type="button" aria-label="Afslut præsentation">Afslut ×</button></div><div id="huws-stage-content" class="huws-stage-content" aria-live="off"></div><div class="huws-stage-bottom"><button type="button" id="huws-prev">← Forrige</button><div id="huws-progress"><i></i></div><button type="button" id="huws-next">Næste →</button></div>');
    var readPanel=document.createElement("section");readPanel.id="huws-read-panel";readPanel.className="huwl-read-panel";readPanel.hidden=true;readPanel.setAttribute("role","dialog");readPanel.setAttribute("aria-label",ui.t("Læs tiddler"));readPanel.innerHTML=ui.t('<header><h2 id="huws-read-title"></h2><div class="huws-read-actions"><button type="button" id="huws-read-present" title="Præsenter listen i denne tiddler">Shift+P ▶</button><button type="button" id="huws-read-close">Tilbage til slide</button></div></header><div id="huws-read-body"></div>');stage.appendChild(readPanel);
    document.body.appendChild(stage);byId("read-close").onclick=closeRead;byId("read-present").onclick=presentReadList;
    function closeWorkshop(){if(dirty&&working&&working.name.trim())save();layer.style.display="none";}
    byId("close").onclick=closeWorkshop;
    byId("technical").onchange=function(){toggleTechnical(this.checked);};
    layer.addEventListener("pointerdown",function(e){
      // Only the shadow/backdrop closes the modal. Never close on a panel click.
      if(e.target===layer)closeWorkshop();
    });
    byId("deck").onchange=function(){if(!ensureSaved()){byId("deck").value=selected;return;}select(byId("deck").value);};
    byId("new").onclick=function(){openCreate("manual");};
    byId("create-mode").onchange=sourceChoices;
    byId("refresh-source").onclick=importFromSource;
    byId("create-no").onclick=function(){byId("create").hidden=true;};
    byId("create-ok").onclick=createDeck;
    byId("name").oninput=function(){if(!working)return;working.name=this.value;markChanged();};
    byId("theme").onchange=function(){if(!working)return;working.theme=this.value;markChanged();};
    byId("source").onchange=function(){message("");};
    byId("default-pasteup").onchange=function(){if(!working)return;
      if(this.value&&!isPasteUp(this.value)){message(ui.t("Vælg en eksisterende PasteUp-plade."),true);return;}
      var chosen=W.getTiddler(this.value),live=hasTag(chosen,"HUWiki-Slideshow-Design");working.defaultBackgroundPasteUp=live?"":this.value;working.defaultLayoutPasteUp=live?this.value:"";markChanged();renderSlides();if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.refreshGallery();};
    byId("add").onclick=function(){var s=byId("source").value;if(!s||!working)return;working.slides.push({title:s,notes:""});selectedSlide=working.slides.length-1;markChanged();renderSlides();};
    byId("create-slide").onclick=createSlide;
    byId("new-pasteup").onclick=createPasteUpSlide;
    byId("slides").addEventListener("change",function(e){if(!working||selectedSlide<0)return;
      var s=working.slides[selectedSlide];if(!s)return;
      if(e.target.id==="huws-slide-mode"){
        if(e.target.value!=="standard"&&e.target.value!=="auto"&&!pasteUpAvailable()){
          message(ui.t("Installér HUWiki PasteUp for at bruge de visuelle layouts."),true);renderSlides();return;}
        s.displayMode=e.target.value;
        if(s.displayMode==="pasteup"&&!s.pasteUpTitle&&isPasteUp(s.title))s.pasteUpTitle=s.title;
        // Do not destroy the v0.8.4 reference when changing modes.
        markChanged();renderSlides();
      }else if(e.target.id==="huws-slide-board"){
        if(e.target.value&&!isPasteUp(e.target.value)){message("PasteUp-pladen findes ikke.",true);return;}
        if(slideMode(s,working)==="layout")s.layoutPasteUp=e.target.value;
        else if(slideMode(s,working)==="background")s.backgroundPasteUp=e.target.value;
        else s.pasteUpTitle=e.target.value;
        markChanged();renderSlides();
      }else if(e.target.id==="huws-panel-color"||e.target.id==="huws-panel-opacity"){
        if(e.target.id==="huws-panel-color")s.panelColor=thisSafeColor(e.target.value);
        else s.panelOpacity=Math.max(0,Math.min(100,Number(e.target.value)||0));
        markChanged();renderSlides();
      }else if(e.target.id==="huws-slide-template"){
        // Template selection is transient until user explicitly creates a clone.
      }
    });
    byId("slides").addEventListener("input",function(e){
      if(!working||selectedSlide<0)return;
      var s=working.slides[selectedSlide];
      if(e.target.id==="huws-notes"){s.notes=e.target.value;markChanged();}
      else if(e.target.id==="huws-panel-opacity"){
        s.panelOpacity=Math.max(0,Math.min(100,Number(e.target.value)||0));
        var label=byId("panel-opacity-label");if(label)label.textContent=s.panelOpacity+" %";
        markChanged();
      }
    });
    byId("slides").addEventListener("click",function(e){var b=e.target.closest("button[data-action]");if(!b||!working)return;
      var idx=Number(b.getAttribute("data-index"));if(idx<0||idx>=working.slides.length)return;
      var action=b.getAttribute("data-action");if(action==="select"){selectedSlide=selectedSlide===idx?-1:idx;renderSlides();return;}
      if(action==="edit-source"){navigateToEdit(working.slides[idx].title);return;}
      if(action==="edit-pasteup"){
        var board=slideBoard(working.slides[idx],working);
        if(!board||!isPasteUp(board)){message(ui.t("Vælg først et PasteUp-design."),true);return;}
        navigateToEdit(board);return;
      }
      if(action==="create-element"){
        var current=working.slides[idx],source=current.title,template=byId("slide-template")?byId("slide-template").value:"";
        if(isPasteUp(source)){message(ui.t("Dette slide er allerede en PasteUp-plade. Vælg en almindelig tiddler først."),true);return;}
        try{var personal=newPersonalBoard(source,template);insertTiddlerInBoard(personal,source);
          current.pasteUpTitle=personal;current.displayMode="element";selectedSlide=idx;
          markChanged();renderSlides();message(ui.t("Oprettede en selvstændig PasteUp-plade med levende indhold fra »")+source+"«. Klik Redigér i PasteUp.");
        }catch(err){message(err.message,true);}
        return;
      }
      if(action==="add-linked"){
        var current2=working.slides[idx],existingBoard=slideBoard(current2,working),picker=byId("linked-tiddler-inline");
        try{var field=insertTiddlerInBoard(existingBoard,picker&&picker.value||"");
          renderSlides();
          message(field.created?"✓ »"+(picker&&picker.value||"")+"« er indsat som »"+field.field+ui.t("«. Vælg Redigér i PasteUp for at flytte og skalere."):
            ui.t("Allerede indsat som »")+field.field+"«"+(field.count>1?" ("+field.count+ui.t(" kopier fra tidligere forsøg)."):" – der blev ikke lavet en dublet."));
        }catch(err){message(err.message,true);}
        return;
      }
      if(action==="remove"){working.slides.splice(idx,1);selectedSlide=-1;}
      else if(action==="up"&&idx>0){var item=working.slides.splice(idx,1)[0];working.slides.splice(idx-1,0,item);selectedSlide=idx-1;}
      else if(action==="down"&&idx<working.slides.length-1){var item2=working.slides.splice(idx,1)[0];working.slides.splice(idx+1,0,item2);selectedSlide=idx+1;}
      else return;markChanged();renderSlides();
    });
    byId("slides").addEventListener("dragstart",function(e){
      var grip=e.target.closest(".huws-grip");if(!grip){e.preventDefault();return;}
      var li=grip.closest("[data-row]");dragIndex=li?Number(li.getAttribute("data-row")):-1;
      if(li)li.classList.add("dragging");if(e.dataTransfer){e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(dragIndex));}});
    byId("slides").addEventListener("dragend",function(){dragIndex=-1;byId("slides").querySelectorAll(".dragging,.drop-target").forEach(function(x){x.classList.remove("dragging","drop-target");});});
    byId("slides").addEventListener("dragover",function(e){if(dragIndex>=0){e.preventDefault();var li=e.target.closest("[data-row]");byId("slides").querySelectorAll(".drop-target").forEach(function(x){x.classList.remove("drop-target");});if(li)li.classList.add("drop-target");}});
    byId("slides").addEventListener("drop",function(e){e.preventDefault();var li=e.target.closest("[data-row]");var to=li?Number(li.getAttribute("data-row")):-1;
      if(!working||dragIndex<0||to<0||to>=working.slides.length||to===dragIndex){dragIndex=-1;return;}
      var moved=working.slides.splice(dragIndex,1)[0];working.slides.splice(to,0,moved);selectedSlide=to;dragIndex=-1;markChanged();renderSlides();
    });
    byId("save").onclick=save;
    byId("present").onclick=function(){if(!working||!working.slides.length){message(ui.t("Tilføj mindst ét slide."),true);return;}
      if(dirty)save();if(dirty)return;startPresent();};
    byId("back").onclick=function(){var previous=presentationHistory.pop();if(!previous)return;presenting=previous.deck;presentingTitle=previous.title;position=previous.position;renderStage();};byId("stage-exit").onclick=endPresent;byId("prev").onclick=function(){go(-1);};byId("next").onclick=function(){go(1);};
    var pinchStart=0,pinchZoom=1,slideZoom=1;
    var slideSurface=byId("stage-content");
    function touchDistance(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
    slideSurface.addEventListener("touchstart",function(e){if(e.touches.length===2){pinchStart=touchDistance(e.touches);pinchZoom=slideZoom;}},{passive:true});
    slideSurface.addEventListener("touchmove",function(e){if(e.touches.length!==2||!pinchStart)return;e.preventDefault();slideZoom=Math.max(1,Math.min(4,pinchZoom*touchDistance(e.touches)/pinchStart));slideSurface.style.zoom=String(slideZoom);},{passive:false});
    slideSurface.addEventListener("touchend",function(e){if(e.touches.length<2)pinchStart=0;},{passive:true});
    slideSurface.addEventListener("touchcancel",function(){pinchStart=0;},{passive:true});
    document.addEventListener("keydown",function(e){if(stage.style.display==="none")return;
      if(e.key==="Escape"){e.preventDefault();if(!byId("read-panel").hidden){closeRead();return;}endPresent();}
      else if(!byId("read-panel").hidden)return;
      else if(e.target&&e.target.closest&&e.target.closest("input,textarea,select,[contenteditable=true]"))return;
      else if(e.key===" "&&e.target&&e.target.closest&&e.target.closest("button,a"))return;
      else if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(e.metaKey||e.ctrlKey||e.altKey)return;e.preventDefault();var scroller=byId("stage-content"),node=e.target;while(node&&node!==scroller){if(scroller.contains(node)&&node.scrollHeight>node.clientHeight&&/auto|scroll/.test(getComputedStyle(node).overflowY)){scroller=node;break;}node=node.parentElement;}scroller.scrollBy({top:e.key==="ArrowDown"?80:-80,behavior:"auto"});}
      else if(["ArrowRight","PageDown"," "].indexOf(e.key)>=0){e.preventDefault();go(1);}
      else if(["ArrowLeft","PageUp"].indexOf(e.key)>=0){e.preventDefault();go(-1);}
      else if(e.key==="Home"){e.preventDefault();position=0;renderStage();}
      else if(e.key==="End"){e.preventDefault();position=presenting.slides.length-1;renderStage();}
    },{capture:true,signal:uiEvents.signal});
    document.addEventListener("fullscreenchange",function(){
      if(!stage||stage.style.display==="none"||!presenting)return;
      if(document.fullscreenElement===stage){nativeFullscreenEntered=true;return;}
      // Browsers often intercept Escape before keydown reaches our iframe.
      // Exiting native fullscreen must exit HUWiki's presentation as well.
      if(nativeFullscreenEntered&&!finishingPresentation)endPresent();
    },{signal:uiEvents.signal});
  }
  function openCreate(mode){
    if(byId("tab-slides"))switchTab("slides");if(!ensureSaved())return;
    byId("create").hidden=false;byId("create-mode").value=["tag","story","list"].indexOf(mode)>=0?mode:"manual";
    titleCache=null;sourceChoices();byId("create-name").focus();
  }
  function createDeck(){var label=byId("create-name").value.trim();if(!label){message(ui.t("Skriv et navn."),true);return;}
    var t="Præsentation – "+label;if(W.tiddlerExists(t)){message(ui.t("Der findes allerede en præsentation med det navn."),true);return;}
    var mode=byId("create-mode").value,value=mode==="tag"||mode==="list"?byId("create-value").value:"";
    if((mode==="tag"||mode==="list")&&!value){message(ui.t("Vælg et tag eller en titelliste."),true);return;}
    var source={mode:mode,value:value},slides=getSourceTitles(source).map(function(title){return {title:title,notes:""};});
    if(mode!=="manual"&&!slides.length){message(ui.t("Kilden indeholder ingen egnede tiddlers. Vælg en anden kilde."),true);return;}
    working=normalize({name:label,packageId:crypto.randomUUID(),source:source,slides:slides});selected=t;selectedSlide=-1;dirty=true;byId("create").hidden=true;renderDecks();byId("deck").value="";renderDetails();
    if(slides.length){markChanged();message(ui.t("Præsentationen er klar med ")+slides.length+ui.t(" slides. Rækkefølgen gemmes automatisk."));}
    else message(ui.t("Tom præsentation: Tilføj et slide, så gemmes den automatisk."));
  }
  function createSlide(){var name=byId("slide-name").value.trim();if(!working||!name){message(ui.t("Skriv en titel på slidet."),true);return;}
    if(W.tiddlerExists(name)){message(ui.t("Denne tiddler findes allerede. Vælg den fra listen ovenfor."),true);return;}
    W.addTiddler(new $tw.Tiddler({title:name,type:"text/vnd.tiddlywiki",tags:["Slideshow"],text:"! "+name+ui.t("\n\nSkriv slideindhold her i TiddlyWiki.")}));
    working.slides.push({title:name,notes:""});selectedSlide=working.slides.length-1;byId("slide-name").value="";markChanged();renderDetails();message("Slide-tiddleren er oprettet. Redigér dens indhold via knappen nedenfor.");
  }
  // A genuine landscape PasteUp canvas, created in user tiddlers from the
  // existing PasteUp data protocol. No fork or copied PasteUp plugin code.
  function createPasteUpSlide(){
    if(!working){message(ui.t("Vælg eller opret en præsentation først."),true);return;}
    if(!pasteUpAvailable()){message(ui.t("Installér HUWiki PasteUp fra pluginbiblioteket i denne wiki, og åbn Slideshowværksted igen."),true);return;}
    var name=W.generateNewTitle("Slide – PasteUp 16:9");
    var stamp=$tw.utils&&$tw.utils.stringifyDate?$tw.utils.stringifyDate(new Date()):new Date().toISOString().replace(/[-:TZ.]/g,"");
    var canvas={cols:32,rows:18,pages:1,background:"#163451",border:"0"};
    var rootFields={title:name,type:"application/json",tags:["pasteup","Slideshow"],caption:name,created:stamp,modified:stamp,
      farvefelt:"",overtekst:ui.t("HUWIKI · PRÆSENTATION"),overskrift:ui.t("Din overskrift"),indhold:ui.t("Dit budskab – redigér tekst og placering i PasteUp."),bundtekst:"SLIDESHOW EDITION",
      text:JSON.stringify(canvas)};
    var layout={title:name+"/Layout",created:stamp,modified:stamp,
      farvefelt:"1,21,18,32,1",overtekst:"2,3,3,24,5",overskrift:"5,3,10,30,6",indhold:"11,3,15,29,6",bundtekst:"16,3,17,27,6",text:""};
    var styles={title:name+"/Styles",created:stamp,modified:stamp,
      farvefelt:"background:linear-gradient(145deg,#1b7d92,#54b9c2); .huws-pu-accent",
      overtekst:"color:#b7e4f6; .huws-pu-eyebrow",overskrift:"color:#ffffff; .huws-pu-title",
      indhold:"color:#dbeaf6; .huws-pu-body",bundtekst:"color:#a1c8dc; .huws-pu-footer",text:""};
    W.addTiddler(new $tw.Tiddler(rootFields));
    W.addTiddler(new $tw.Tiddler(layout));
    W.addTiddler(new $tw.Tiddler(styles));
    W.addTiddler(new $tw.Tiddler({title:name+"/Actions",created:stamp,modified:stamp,text:""}));
    titleCache=null;
    working.slides.push({title:name,notes:""});selectedSlide=working.slides.length-1;markChanged();renderDetails();
    message(ui.t("Et originalt 16:9 PasteUp-slide er oprettet. Vælg »Redigér i PasteUp« for at ændre elementer og baggrund."));
  }
  function renderPasteUpSlide(title){
    if(!pasteUpAvailable())throw new Error("HUWiki PasteUp-pluginet er ikke installeret i denne wiki.");
    // The macro is supplied by the *installed* plugin, NOT reimplemented here.
    // Escape a TiddlyWiki macro attribute instead of injecting an HTML string.
    var safe=String(title).replace(/\\/g,"\\\\").replace(/"/g,"&quot;").replace(/</g,"&lt;");
    var markup="\\import "+PASTEUP_PLUGIN+"/Engine/Embed\n<$macrocall $name=pasteUpEmbed tiddler=\""+safe+"\" copy=\"no\" tooltip=\"no\" allowdrag=\"no\" />";
    return W.renderText("text/html","text/vnd.tiddlywiki",markup,{parseAsInline:false});
  }
  function save(){if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}
    if(!working||!selected){message(ui.t("Opret eller vælg en præsentation."),true);return;}
    if(!working.name.trim()){message(ui.t("Giv præsentationen en titel."),true);return;}
    var previous=W.getTiddler(selected);var preserved=previous?previous.fields:{};
    if(!working.packageId)working.packageId=crypto.randomUUID();
    var next=new $tw.Tiddler(preserved,{title:selected,type:"application/json",tags:Array.from(new Set((preserved.tags||[]).concat([TAG]))),list:working.slides.map(function(s){return s.title;}),text:JSON.stringify(normalize(working))});
    W.addTiddler(next);reconcileDeckTags();dirty=false;renderDecks();byId("deck").value=selected;byId("dirty").textContent=ui.t("Gemt automatisk");message(ui.t("Præsentationen er gemt i wikien. Slideindholdet er stadig de originale tiddlers."));
  }
  function renderDecks(){var decks=listDecks(),selectEl=byId("deck");selectEl.textContent="";var empty=document.createElement("option");empty.value="";empty.textContent=ui.t("Vælg en præsentation…");selectEl.appendChild(empty);
    decks.forEach(function(t){var option=document.createElement("option");option.value=t;option.textContent=t;selectEl.appendChild(option);});
    if(selected&&W.tiddlerExists(selected))selectEl.value=selected;
  }
  function select(title){selected=title||"";dirty=false;selectedSlide=-1;
    if(byId("deck"))byId("deck").value=selected;
    if(!selected){working=null;renderDetails();return;}
    try{working=load(selected);}catch(err){working=null;message(err.message,true);}
    renderDetails();
  }
  function renderDetails(){if(activeTab==="export")refreshPublishedSites();if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.refreshGallery();if(byId("pane-design"))byId("pane-design").querySelector(".huws-settings").hidden=!working;byId("main").hidden=!working;byId("present").hidden=!working||!working.slides.length;if(!working){message(ui.t("Vælg en præsentation eller klik + Ny."));return;}
    byId("pane-design").querySelector(".huws-settings").hidden=!working;
    ["author","version","description"].forEach(function(k){if(byId("package-"+k))byId("package-"+k).value=working[k]||"";});
    byId("name").value=working.name;byId("theme").value=working.theme;
    var globalRow=byId("global-background-row"),globalPicker=byId("default-pasteup");
    globalRow.hidden=!pasteUpAvailable();globalPicker.innerHTML=boardPicker(working.defaultLayoutPasteUp||working.defaultBackgroundPasteUp,true).replace("Ingen PasteUp-baggrund",ui.t("Intet fælles PasteUp-layout"));
    text(byId("source-description"),sourceLabel(working.source));byId("refresh-source").hidden=working.source.mode==="manual";
    renderSources();renderSlides();var installed=pasteUpAvailable();byId("new-pasteup").disabled=!installed;
    text(byId("pasteup-hint"),installed?ui.t("Brug vores eksisterende HUWiki PasteUp til frit placerede elementer. Et nyt slide starter med et redigerbart 16:9-design med tekst og farvefelter."):ui.t("Installér først HUWiki PasteUp fra pluginbiblioteket. Vi kopierer ikke pluginet ind i Slideshow."));
    byId("dirty").textContent=dirty?ui.t("Ikke gemt"):ui.t("Gemt i wikien");
  }
  function renderSources(){var list=allSlideTitles(),picker=byId("source");picker.textContent="";var option=document.createElement("option");option.value="";option.textContent=ui.t("Vælg eksisterende tiddler…");picker.appendChild(option);
    list.forEach(function(title){var row=document.createElement("option");row.value=title;row.textContent=title;picker.appendChild(row);});
  }
  function renderSlides(){
    if(!working)return;
    byId("present").hidden=!working.slides.length;
    var installed=pasteUpAvailable(),boards=pasteUpBoards(),html="";
    if(selectedSlide>=working.slides.length)selectedSlide=-1;
    working.slides.forEach(function(s,i){
      var expanded=i===selectedSlide,mode=slideMode(s,working),board=slideBoard(s,working);
      var active=expanded?' current':'',description=slideLabel(s,working);
      html+='<div class="huws-slide-row'+active+'" data-row="'+i+'"><div class="huws-slide-line">'
        +ui.t('<span draggable="true" class="huws-grip" aria-label="Træk slide" title="Træk for at ændre rækkefølge">⠿</span>')
        +'<button type="button" data-action="select" data-index="'+i+'" class="huws-row-title" aria-expanded="'+(expanded?'true':'false')+'"><strong>'+(i+1)+'. '+htmlEscape(s.title)+'</strong><small>'+htmlEscape(description)+'</small></button>'
        +'<button type="button" title="Slideindstillinger" aria-label="Slideindstillinger" data-action="select" data-index="'+i+'">'+(expanded?'▴':'⚙')+'</button>'
        +ui.t('<button type="button" title="Flyt op" aria-label="Flyt op" data-action="up" data-index="')+i+'">↑</button>'
        +ui.t('<button type="button" title="Flyt ned" aria-label="Flyt ned" data-action="down" data-index="')+i+'">↓</button>'
        +ui.t('<button type="button" title="Fjern fra præsentation" aria-label="Fjern fra præsentation" data-action="remove" data-index="')+i+'">×</button></div>';
      if(expanded){
        var choice=String(s.displayMode||"auto");
        // Old backgroundPasteUp fields still render as PasteUp backgrounds.
        if(choice==="auto"&&s.backgroundPasteUp)choice="background";
        if(choice==="auto"&&isPasteUp(s.title))choice="pasteup";
        html+=ui.t('<div class="huws-slide-detail"><div class="huws-slide-detail-head"><strong>Indstillinger for slide ')+(i+1)+ui.t('</strong><span>Designvalg gælder kun dette slide</span></div>')
          +ui.t('<label>Vis slidet som<select id="huws-slide-mode">')
          +'<option value="auto"'+(choice==='auto'?' selected':'')+ui.t('>Følg præsentationens standarddesign</option>')
          +'<option value="standard"'+(choice==='standard'?' selected':'')+ui.t('>Almindeligt slide (uden PasteUp)</option>')
          +'<option value="layout"'+(choice==='layout'?' selected':'')+(installed?'':' disabled')+'>Levende PasteUp-layout</option>'
          +'<option value="background"'+(choice==='background'?' selected':'')+(installed?'':' disabled')+ui.t('>PasteUp som baggrund</option>')
          +'<option value="pasteup"'+(choice==='pasteup'?' selected':'')+(installed?'':' disabled')+ui.t('>Hele slidet er en PasteUp-plade</option>')
          +'<option value="element"'+(choice==='element'?' selected':'')+(installed&&!isPasteUp(s.title)?'':' disabled')+ui.t('>Tiddlerindhold som PasteUp-element</option>')
          +'</select></label>';
        if(!installed)html+=ui.t('<p class="huws-hint">Installér HUWiki PasteUp fra pluginbiblioteket for at bruge visuelle layouts.</p>');
        if(installed&&(mode==='background'||mode==='pasteup'||mode==='layout')){
          html+=ui.t('<label>Vælg PasteUp-design<select id="huws-slide-board">')+boardPicker(board,false)+'</select></label>';
          if(mode==='layout'){html+='<div id="huws-layout-editor"></div>';}
          else if(mode==='background'){
            html+=ui.t('<p class="huws-hint">Tiddlerens indhold vises foran designet. Brug den fælles baggrund ovenfor, eller vælg en særlig baggrund til dette slide.</p>');
            html+=ui.t('<div class="huws-panel-appearance"><strong>Baggrund bag tiddlerteksten</strong><div class="huws-panel-controls">')
              +ui.t('<label>Farve <input id="huws-panel-color" type="color" value="')+htmlEscape(s.panelColor||'#ffffff')+'"></label>'
              +ui.t('<label>Baggrundens synlighed <input id="huws-panel-opacity" type="range" min="0" max="100" step="5" value="')+(s.panelOpacity==null?92:s.panelOpacity)+'"> <output id="huws-panel-opacity-label">'+(s.panelOpacity==null?92:s.panelOpacity)+' %</output></label>'
              +ui.t('</div><p class="huws-hint">0 % er helt gennemsigtigt. Teksten bevarer sin farve og læsbarhed.</p></div>');
          }
          else html+=ui.t('<p class="huws-hint">Hele slidet vises som den valgte PasteUp-plade. Andre tiddlers ændres ikke.</p>');
        }
        if(installed&&mode==='element'){
          if(board&&isPasteUp(board))html+='<p class="huws-hint">Tiddleren »'+htmlEscape(s.title)+'« vises allerede som et levende element i din personlige PasteUp-plade.</p>';
          else{
            html+=ui.t('<label>Design at begynde med (valgfrit)<select id="huws-slide-template">')+boardPicker('',true)+'</select></label>'
              +'<button type="button" data-action="create-element" data-index="'+i+ui.t('" class="huws-inline-primary">Opret redigerbart PasteUp-slide med tiddler</button>')
              +ui.t('<p class="huws-hint">HUWiki laver en selvstændig kopi af designet og indsætter tiddleren som flytbart element – uden at kopiere tiddlerteksten.</p>');
          }
        }
        if(installed&&(mode==='pasteup'||mode==='element')&&board&&isPasteUp(board)){
          var linked=linkedSummary(board),possible=allSlideTitles().filter(function(title){return !isPasteUp(title);});
          html+=ui.t('<div class="huws-linked-status" role="status"><strong>Indsat i PasteUp: ')+linked.items.length+' tiddler'+(linked.items.length===1?'':'e')+'</strong>';
          if(linked.items.length){html+='<ul>'+linked.items.map(function(item){return '<li>'+htmlEscape(item.title)+' <small>('+htmlEscape(item.field)+')</small></li>';}).join('')+'</ul>';}
          else html+=ui.t('<p>Ingen tiddlers er indsat som elementer endnu.</p>');
          if(linked.duplicates.length)html+=ui.t('<p class="huws-duplicate-warning">⚠ Samme tiddler er indsat flere gange. Fjern ekstra elementer i PasteUp.</p>');
          html+='</div>';
          html+=ui.t('<div class="huws-inline-add"><label>Indsæt en ekstra tiddler som element<select id="huws-linked-tiddler-inline"><option value="">Vælg tiddler…</option>');
          possible.forEach(function(t){html+='<option value="'+htmlEscape(t)+'">'+htmlEscape(t)+'</option>';});
          html+='</select></label><button type="button" data-action="add-linked" data-index="'+i+ui.t('">Indsæt</button></div>');
        }
        html+='<div class="huws-inline-actions"><button type="button" data-action="edit-source" data-index="'+i+'">Redigér tiddler ↗</button>';
        if(installed&&board&&isPasteUp(board))html+='<button type="button" data-action="edit-pasteup" data-index="'+i+'">Redigér i PasteUp ↗</button>';
        html+=ui.t('</div><label>Foredragsnoter (vises ikke på publikums skærm)<textarea id="huws-notes" rows="3" placeholder="Dine noter til dette slide">')+htmlEscape(s.notes||'')+'</textarea></label></div>';
      }
      html+='</div>';
    });
    byId("slides").innerHTML=html||ui.t('<p class="huws-hint">Ingen slides endnu. Vælg en eksisterende tiddler nedenfor.</p>');
    text(byId("count"),working.slides.length+" slides");
    if(byId("layout-editor")&&window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.slideEditor(byId("layout-editor"),working.slides[selectedSlide],working,{titles:allSlideTitles,changed:markChanged,edit:navigateToEdit});
  }
  function startPresent(deck,deckTitle){presentationHistory=[];presentingTitle=deckTitle||selected||"";if(!layer)build();if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.begin();presenting=copy(deck||working);if(!presenting||!presenting.slides.length)return;returnToWorkshop=layer.style.display==="flex";position=0;nativeFullscreenEntered=false;finishingPresentation=false;stage.setAttribute("data-theme",presenting.theme);stage.style.display="flex";layer.style.display="none";renderStage();
    if(!W.getTiddlerText("$:/HUWiki/Slideshow/Site")&&stage.requestFullscreen){try{var p=stage.requestFullscreen();if(p&&p.catch)p.catch(function(){/* Apps Script may forbid fullscreen; overlay remains usable. */});}catch(err){}}
  }
  function clearLive(){if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.dispose(liveHandle);liveHandle=null;}
  function closeRead(){readTitle="";if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.dispose(readHandle);readHandle=null;var panel=byId("read-panel");if(panel)panel.hidden=true;}
  function openRead(title){if(!W.getTiddler(title))return;closeRead();readTitle=title;var panel=byId("read-panel");panel.hidden=false;text(byId("read-title"),title);byId("read-body").textContent="";
    titleCache=null;var source=require("$:/plugins/huwiki/slideshow/list-source.js").resolve(W,title,root);
    byId("read-present").hidden=!source.hasList||!distinctTitles(source.titles).length;
    var shortcut=W.getTiddlerText("$:/config/shortcuts/huwiki-present-open","shift-P").trim();byId("read-present").textContent=(shortcut?shortcut.replace(/shift[-+]/gi,"Shift+").replace(/ /g,""):ui.t("Vis liste"))+" ▶";
    readHandle=window.HUWikiSlideshowLayouts.mount(byId("read-body"),'<$transclude tiddler="'+htmlEscape(title)+'" mode="block"/>',{"tm-navigate":function(ev){openRead(ev.navigateTo);return false;}});byId("read-close").focus();}
  function presentReadList(){
    if(!readTitle||!presenting)return;
    try{titleCache=null;var title=readTitle,source=require("$:/plugins/huwiki/slideshow/list-source.js").resolve(W,title,root),titles=source.hasList?distinctTitles(source.titles):[];
      if(!titles.length)return;
      presentationHistory.push({deck:presenting,title:presentingTitle,position:position});if(presentationHistory.length>100)presentationHistory.shift();
      presenting=normalize({name:title,theme:presenting.theme,slides:titles.map(function(t){return {title:t};})});presentingTitle=title;position=0;renderStage();
    }catch(error){text(byId("navigation-status"),error.message);}
  }
  function liveEvents(){return {"tm-navigate":function(ev){openRead(ev.navigateTo);return false;},
    "tm-huwiki-slide-action":function(ev){var p=ev.paramObject||{};
      if(p.kind==="jump"){try{var nextTitle=p.deck||presentingTitle,nextDeck=nextTitle===presentingTitle?presenting:load(nextTitle),at=nextDeck.slides.findIndex(function(s){return s.title===p.target;});if(at<0)throw Error(ui.t("Målet findes ikke længere i præsentationen."));presentationHistory.push({deck:presenting,title:presentingTitle,position:position});if(presentationHistory.length>100)presentationHistory.shift();presenting=copy(nextDeck);presentingTitle=nextTitle;position=at;renderStage();}catch(error){text(byId("navigation-status"),error.message);}}
      else if(p.kind==="open")openRead(p.target);
      else if(p.kind==="toggle"||p.kind==="mark")window.HUWikiSlideshowLayouts.action(activeBoard,p.kind,p.target,p.color);
      return false;}};}
  function renderStage(){if(!presenting||!presenting.slides.length)return;var slide=presenting.slides[position],el=byId("stage-content"),api=window.HUWikiSlideshowLayouts;
    clearLive();closeRead();stage.setAttribute("data-theme",presenting.theme);byId("back").hidden=!presentationHistory.length;text(byId("navigation-status"),"");el.textContent="";text(byId("stage-title"),presenting.name);text(byId("stage-counter"),(position+1)+" / "+presenting.slides.length);
    el.classList.remove("huws-stage-pasteup","huws-stage-composed");activeBoard="";
    try{var mode=slideMode(slide,presenting),board=slideBoard(slide,presenting),visual=["layout","pasteup","element","background"].indexOf(mode)>=0,markup;
      if(!W.getTiddler(slide.title))throw Error(ui.t("Kildetiddleren mangler."));
      if(visual){if(!pasteUpAvailable()||!isPasteUp(board))throw Error(ui.t("PasteUp-layoutet mangler. Vælg et layout i værkstedet."));activeBoard=api.sessionBoard(board,presentingTitle+"|"+position);markup=api.markup(activeBoard,slide,presenting);
        if(mode==="background")markup='\\import $:/plugins/huwiki/pasteup/Engine/Embed\n<div class="huws-composed-slide"><div class="huws-composed-background" aria-hidden="true"><$macrocall $name="pasteUpEmbed" tiddler="'+htmlEscape(activeBoard)+'" copy="no" tooltip="no" allowdrag="no"/></div><div class="huws-composed-foreground" style="background:'+colorWithOpacity(slide.panelColor,slide.panelOpacity==null?92:slide.panelOpacity)+'"><$transclude tiddler="'+htmlEscape(slide.title)+'" mode="block"/></div></div>';
      }else markup='<$transclude tiddler="'+htmlEscape(slide.title)+'" mode="block"/>';
      liveHandle=api.mount(el,markup,liveEvents());el.classList.toggle("huws-stage-pasteup",visual);el.classList.toggle("huws-stage-composed",mode==="background");
    }catch(err){el.textContent=ui.t("Slidet kunne ikke vises: ")+err.message;}
    byId("prev").disabled=position===0;byId("next").disabled=position===presenting.slides.length-1;
    var p=byId("progress").querySelector("i");if(p)p.style.width=(100*(position+1)/presenting.slides.length)+"%";
  }
  function go(d){if(!presenting)return;position=Math.min(Math.max(0,position+d),presenting.slides.length-1);renderStage();}
  function endPresent(){if(stage.style.display==="none")return;
    finishingPresentation=true;clearLive();closeRead();if(window.HUWikiSlideshowLayouts)window.HUWikiSlideshowLayouts.end();
    stage.style.display="none";presenting=null;nativeFullscreenEntered=false;layer.style.display=returnToWorkshop?"flex":"none";returnToWorkshop=false;
    if(document.fullscreenElement===stage && document.exitFullscreen){try{var p=document.exitFullscreen();if(p&&p.catch)p.catch(function(){});}catch(err){}}
    finishingPresentation=false;
  }
  function presentSource(mode,value){
    if(!layer)build();titleCache=null;
    var source={mode:mode,value:String(value||"")}, titles=getSourceTitles(source);
    if(!titles.length){
      layer.style.display="flex";renderDecks();
      message(mode==="story"?ui.t("StoryList indeholder ingen præsentérbare tiddlers."):ui.t("Dette tag indeholder ingen præsentérbare tiddlers."),true);
      return;
    }
    var title=mode==="story"?"StoryList":value;
    startPresent(normalize({name:title,theme:working&&working.theme||"night",source:source,
      slides:titles.map(function(t){return {title:t,notes:""};})}));
  }
  root.addEventListener("tm-huwiki-slideshow-present",function(ev){
    var mode=ev&&String(ev.param||"story");
    if(mode==="story")presentSource("story","");
    else if(mode.indexOf("tag:")===0)presentSource("tag",mode.slice(4));
    return false;
  });
  function editTiddlerPresentation(title,titles){
    if(!layer)build();if(!ensureSaved())return;
    selected=W.generateNewTitle("Præsentation – "+title);selectedSlide=-1;
    working=normalize({name:selected.replace(/^Præsentation – /,""),packageId:crypto.randomUUID(),source:{mode:"manual",value:""},slides:titles.map(function(t){return {title:t,notes:""};})});
    dirty=true;byId("create").hidden=true;layer.style.display="flex";switchTab("slides");renderDecks();renderDetails();markChanged();
    message(ui.t("Din egen præsentation er klar. Træk slides i den ønskede rækkefølge. Den oprindelige liste ændres ikke."));
  }
  function chooseTiddlerPresentation(title,listTitles){
    var old=document.getElementById("huws-source-choice");if(old)old.remove();
    var dialog=document.createElement("dialog");dialog.id="huws-source-choice";dialog.className="huws-source-choice";
    dialog.setAttribute("aria-labelledby","huws-source-choice-title");
    var heading=document.createElement("h2");heading.id="huws-source-choice-title";heading.textContent=ui.t("Hvad vil du præsentere?");dialog.appendChild(heading);
    var note=document.createElement("p");note.textContent=listTitles?ui.t("Brug listen fra »")+title+ui.t("« til en præsentation:"):ui.t("Der er ingen liste i »")+title+ui.t("«. Vælg indhold til slideshowet:");dialog.appendChild(note);
    var choices=document.createElement("div");choices.className="huws-source-choices";dialog.appendChild(choices);
    function add(label,titles){
      var row=document.createElement("div"),caption=document.createElement("p");row.className="huws-source-option";caption.textContent=label+" · "+titles.length+(titles.length===1?" slide":" slides");row.appendChild(caption);
      function action(label,run){var button=document.createElement("button");button.type="button";button.textContent=label;button.onclick=function(){dialog.close();dialog.remove();try{run();}catch(error){window.alert(error.message);}};row.appendChild(button);}
      action(ui.t("Vis nu"),function(){startPresent(normalize({name:title,slides:titles.map(function(t){return {title:t};})}),title);});
      action(ui.t("Åbn i editor"),function(){editTiddlerPresentation(title,titles);});choices.appendChild(row);
    }
    var seen=Object.create(null);
    function addTag(tag,own){if(!tag||seen[tag]||tag.indexOf("$:/")===0)return;seen[tag]=true;var titles=getSourceTitles({mode:"tag",value:tag});if(titles.length)add((own?ui.t("Tagget med tiddlerens titel: "):ui.t("Fra tag: "))+tag,titles);}
    if(listTitles)add(ui.t("Tiddlerens liste"),listTitles);
    else {addTag(title,true);(W.getTiddler(title).fields.tags||[]).forEach(function(tag){addTag(tag,false);});add(ui.t("Kun denne tiddler"),[title]);}
    var cancel=document.createElement("button");cancel.type="button";cancel.textContent=ui.t("Annuller");cancel.className="tc-btn-invisible";cancel.onclick=function(){dialog.close();};dialog.appendChild(cancel);
    dialog.addEventListener("close",function(){dialog.remove();});document.body.appendChild(dialog);dialog.showModal();
  }
  root.addEventListener("tm-huwiki-slideshow-view",function(ev){
    var title=String(ev.param||ev.tiddlerTitle||"");
    if(!W.getTiddler(title))return false;
    try{
      if((W.getTiddler(title).fields.tags||[]).indexOf(TAG)>=0){startPresent(load(title),title);return false;}
      titleCache=null;
      var source=require("$:/plugins/huwiki/slideshow/list-source.js").resolve(W,title,root);
      if(!source.hasList){chooseTiddlerPresentation(title);return false;}
      var titles=distinctTitles(source.titles);
      if(!titles.length){window.alert(ui.t("Listen indeholder ingen eksisterende tiddlere, der kan vises som slides."));return false;}
      chooseTiddlerPresentation(title,titles);
    }catch(error){window.alert(error.message);}return false;
  });
  root.addEventListener("tm-huwiki-slideshow-imported",function(ev){if(!layer)build();renderDecks();select(String(ev.param));switchTab("slides");message(ui.t("Præsentationen er importeret. Gem hele wikien med TiddlyWikis Gem-knap."));return false;});
  root.addEventListener("tm-huwiki-slideshow-open",function(ev){if(!layer)build();var param=ev&&String(ev.param||"");
    renderDecks();if(param&&W.tiddlerExists(param)){if(ensureSaved())select(param);}else if(!working){select(listDecks()[0]||"");}
    layer.style.display="flex";
    if(param==="drive"){switchTab("import");if(window.HUWikiSlideshowImport)window.HUWikiSlideshowImport.openDrive();}
    if(["tag","story","list","manual"].indexOf(param)>=0)openCreate(param);
    return false;});

  W.addEventListener("change",function(changes){if(!changes["$:/language"]||!layer)return;
    var creating=!byId("create").hidden,visible=layer.style.display,tab=activeTab,wasPresent=stage.style.display!=="none",inputs={};
    layer.querySelectorAll("input[id],textarea[id],select[id]").forEach(function(e){if(e.type!=="file"&&e.type!=="password")inputs[e.id]={value:e.value,checked:e.checked};});
    // Keep an in-progress document import (including its file and preview) intact.
    var importPanel=byId("pane-import");importPanel.remove();
    clearLive();uiEvents.abort();layer.remove();stage.remove();layer=null;stage=null;build();
    var newImport=byId("pane-import");if(window.HUWikiSlideshowImport)window.HUWikiSlideshowImport.mount(importPanel);newImport.replaceWith(importPanel);
    renderDecks();renderDetails();Object.keys(inputs).forEach(function(id){var e=document.getElementById(id);if(e&&e.type!=="file"){e.value=inputs[id].value;e.checked=inputs[id].checked;}});
    switchTab(tab);byId("create").hidden=!creating;layer.style.display=visible;if(wasPresent){stage.style.display="flex";stage.setAttribute("data-theme",presenting.theme);renderStage();}
  });
  repairDemoMetadata();
  repairSlideshowHome();
  upgradeSlideshowActions();
  installPresentationShortcut();
  installDeckTags();
  setupTagPillMenu();
};
})();