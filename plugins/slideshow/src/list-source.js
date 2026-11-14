/* Resolve the source tiddler's lists using TiddlyWiki's own renderer.
 * This evaluates filters/macros in currentTiddler context; it never uses StoryList.
 */
exports.resolve = function(wiki,title,parentWidget) {
  var t=wiki.getTiddler(title), listed=[], links=[], hasList=false;
  if(!t)return {titles:[],hasList:false};
  function valid(value){return typeof value==='string' && value!==title && value.indexOf('$:/')!==0 && !!wiki.getTiddler(value);}
  function unique(values){var seen=Object.create(null);return values.filter(function(v){if(!valid(v)||seen[v])return false;seen[v]=true;return true;});}
  if(Object.prototype.hasOwnProperty.call(t.fields,'list')) {
    return {titles:unique(Array.isArray(t.fields.list)?t.fields.list:$tw.utils.parseStringArray(t.fields.list||'')),hasList:true};
  }
  var widget=wiki.makeTranscludeWidget(title,{document:$tw.fakeDocument,parentWidget:parentWidget,importPageMacros:true,variables:{currentTiddler:title}});
  var container=$tw.fakeDocument.createElement('div');
  widget.render(container,null);
  function visit(w,inList){
    var node=w.parseTreeNode||{}, type=node.type, inside=inList;
    if(type==='list') {
      var candidates=unique(w.list||[]);
      // A one-item conditional list of the source itself is not its content list.
      if(candidates.length) {hasList=true;Array.prototype.push.apply(listed,candidates);return;}
      if(!(w.list||[]).length)hasList=true;
    }
    if(type==='element' && /^(ul|ol|li)$/.test(node.tag||'')){inside=true;hasList=true;}
    var target=type==='link'?w.to:'';
    if(type==='element' && node.tag==='a') {
      var href=w.getAttribute('href','');
      if(href.charAt(0)==='#'){try{target=decodeURIComponent(href.slice(1));}catch(ignored){}}
    }
    if(valid(target)){links.push(target);if(inside)listed.push(target);}
    (w.children||[]).forEach(function(child){visit(child,inside);});
  }
  visit(widget,false);
  return {titles:unique(hasList?listed:links),hasList:hasList||links.length>0};
};
