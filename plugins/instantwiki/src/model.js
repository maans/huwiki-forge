/* InstantWiki document structure, adapted from HUWiki's original InstantWiki.
   Source and attribution: migration/instantwiki. No Google service dependency. */
'use strict';
const MAX_PARTS=500;
const escape=s=>String(s??'').replace(/[&<>"'\[\]{}]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','[':'&#91;',']':'&#93;','{':'&#123;','}':'&#125;'}[c]));
function shortTitle(value,fallback='Section') {let s=String(value||'').replace(/\s+/g,' ').replace(/^[\s\-–—•*#]+|[\s:;,.!?\-–—]+$/g,'').trim();if(!s)return fallback;const w=s.split(' ');if(w.length>9)s=w.slice(0,9).join(' ')+'…';return s.length>72?s.slice(0,69).trim()+'…':s;}
function split(blocks,options={}) {
 const requested=['auto','headings','semantic','detailed'].includes(options.splitMode)?options.splitMode:'auto';
 const chars=blocks.reduce((n,b)=>n+String(b.plain||'').length,0),explicit=blocks.filter(b=>b.level).length,soft=blocks.filter(b=>b.soft).length;
 const mode=requested==='auto'?((chars>=18000||blocks.length>=110)&&(explicit>=2||(!explicit&&soft>=3))?'headings':'semantic'):requested;
 const parts=[],stack=[];let active=null,gap=true;
 const path=()=>stack.filter(Boolean).map(h=>h.title);
 function add(b,title,level,kind){const p={title:shortTitle(title,options.fallback||'Section'),level:level||Math.min(6,stack.length+1),path:path(),text:b.html||'',mergeText:b.html||'',plainText:b.plain||'',tocType:kind||'paragraph',imageCount:b.images||0};parts.push(p);active=p;return p;}
 for(const b of blocks){
  if(!b.plain?.trim()&&!b.html){gap=true;continue;}
  const heading=b.level||(b.soft&&!(mode==='headings'&&explicit>=2)?Math.min(6,stack.length+1):0);
  if(heading){stack.splice(heading-1);const p=add(b,b.plain,heading,'heading');p.title=b.plain;p.text='';p.mergeText=b.html;stack[heading-1]={title:b.plain};gap=false;continue;}
  const lead=String(b.boldLead||'').trim(),plain=String(b.plain||'').trim();
  const semantic=(lead.length>=4&&lead.length<plain.length*.82&&(lead.length>=10||gap&&/[:：.;!?]$/.test(lead)))||(plain.length<=95&&(/[:：]$/.test(plain)||gap&&/\s[-–—]$/.test(plain)));
  if(!active||mode==='detailed'||options.splitListItems&&b.kind==='item'||mode==='semantic'&&semantic)add(b,lead||plain,0,b.kind);
  else {active.text+='\n\n'+b.html;active.mergeText+='\n\n'+b.html;active.plainText+=' '+plain;active.imageCount+=b.images||0;}
  if(mode==='detailed'||options.splitListItems&&b.kind==='item')active=null;
  gap=!!b.gap;
 }
 if(parts.length>MAX_PARTS)throw Error('too-many-sections');
 return {sections:parts,modeUsed:mode,stats:{characters:chars,blocks:blocks.length,explicitHeadings:explicit,softHeadings:soft}};
}
// Original preview semantics: an unchecked boundary merges; it never discards text.
function applyPlan(sections,plan=[]) {
 const output=[];
 sections.forEach((source,i)=>{const p=plan[i]||{},title=String(p.title||source.title||'').trim();
  if(!output.length||p.splitBefore!==false)output.push({...source,outputTitle:title,text:source.text||'',sourceIndices:[i],extraTags:[...(source.extraTags||[])],extraFields:{...(source.extraFields||{})}});
  else {const cur=output.at(-1);cur.text+='\n\n'+(source.mergeText??source.text??'');cur.sourceIndices.push(i);cur.extraTags=[...new Set(cur.extraTags.concat(source.extraTags||[]))];cur.imageCount=(cur.imageCount||0)+(source.imageCount||0);}
 });return output;
}
function unique(title,used){let base=String(title||'Section').replace(/[\u0000-\u001f]/g,' ').trim();if(base.startsWith('$:/'))base='Document '+base.slice(3);base=base.slice(0,180)||'Section';let t=base,n=2;while(used.has(t))t=base+' ('+(n++)+')';used.add(t);return t;}
function createTiddlers({sections,plan,source,name,tag='',existing=[],sourceAsset=null,now=new Date().toISOString().replace(/[^0-9]/g,''),id}){
 const used=new Set(existing),root=unique(name||source.name,used),groups=applyPlan(sections,plan),parts=[],headings=new Map();
 for(const g of groups){const title=unique(g.outputTitle,used),p={...g,title,parent:'',children:[]};parts.push(p);for(const index of g.sourceIndices){const original=sections[index];if(original.tocType==='heading')headings.set(JSON.stringify((original.path||[]).concat(original.title)),p);}}
 for(const p of parts){const path=p.path||[];for(let n=path.length;n>0;n--){const parent=headings.get(JSON.stringify(path.slice(0,n)));if(parent&&parent!==p){p.parent=parent.title;parent.children.push(p.title);break;}}}
 const meta={'instant-import-id':id,'instant-source-title':source.name,'instant-source-url':source.url||'','instant-source-type':source.type||'','instant-document-title':name||source.name,'instant-document-root':root,created:now,modified:now};
 const rows=parts.map((p,i)=>({...p.extraFields,title:p.title,type:'text/vnd.tiddlywiki',text:p.text,tags:['InstantWiki',...(tag&&!tag.startsWith('$:/')?[tag]:[]),...(p.extraTags||[]).filter(t=>!t.startsWith('$:/')),...(p.parent?[p.parent]:[])],...meta,'instant-document-part':'yes','instant-order':String(i+1).padStart(4,'0'),'instant-level':String(p.level||1),'instant-parent':p.parent,'toc-type':p.tocType||'paragraph',list:p.children}));
 const doc={title:root,type:'text/vnd.tiddlywiki',text:'{{||$:/Wiki/DocumentView}}',tags:['InstantWiki',...(tag&&!tag.startsWith('$:/')?[tag]:[])],...meta,'instant-document':'yes',list:parts.filter(p=>!p.parent).map(p=>p.title),'instant-flat-list':parts.map(p=>p.title)};
 if(sourceAsset){const asset=unique(root+' — '+sourceAsset.name,used);rows.push({title:asset,type:sourceAsset.type,text:sourceAsset.text,tags:['InstantWiki'],...meta});doc['instant-source-file']=asset;doc.text+='\n\n<$link to={{!!instant-source-file}}><$text text={{!!instant-source-title}}/></$link>';}
 rows.unshift(doc);return {tiddlers:rows,root};
}
exports.escape=escape;exports.shortTitle=shortTitle;exports.split=split;exports.applyPlan=applyPlan;exports.createTiddlers=createTiddlers;
