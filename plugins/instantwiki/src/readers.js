'use strict';
const model=require('$:/plugins/huwiki/instantwiki/model.js'),esc=model.escape,base='$:/plugins/huwiki/instantwiki/vendor/';
const MAX=20*1024*1024,MAX_TEXT=5*1024*1024;
const all=(n,name)=>Array.from(n.getElementsByTagNameNS('*',name));
const xml=s=>{if(s.length>MAX_TEXT)throw Error('too-large');const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('invalid-document');return d;};
const href=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
function htmlBlocks(text,splitItems){
 if(text.length>MAX_TEXT)throw Error('too-large');
 const doc=document.implementation.createHTMLDocument(''); const template=doc.createElement('template'); template.innerHTML=text;
 const allowed=new Set(['P','DIV','SECTION','ARTICLE','MAIN','H1','H2','H3','H4','H5','H6','STRONG','B','EM','I','U','S','SUB','SUP','BR','PRE','CODE','UL','OL','LI','TABLE','THEAD','TBODY','TR','TD','TH','BLOCKQUOTE','A','SPAN','HR','IMG']);
 const drop=new Set(['HEAD','TITLE','SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','FORM','INPUT','BUTTON','TEXTAREA','SELECT','SVG','MATH','TEMPLATE','NOSCRIPT']);
 let omitted=0;
 function clean(n){if(n.nodeType===3)return esc(n.textContent);if(n.nodeType!==1||drop.has(n.tagName))return '';if(n.tagName==='IMG'){omitted++;return '<p>'+esc(n.getAttribute('alt')||'[Image]')+'</p>';}
  const body=Array.from(n.childNodes).map(clean).join('');if(!allowed.has(n.tagName))return body;
  const tag=n.tagName.toLowerCase();if(tag==='a'){const u=href(n.getAttribute('href'));return u?'<a href="'+esc(u)+'" rel="noopener noreferrer">'+body+'</a>':body;}
  return ['br','hr'].includes(tag)?'<'+tag+'>':'<'+tag+'>'+body+'</'+tag+'>';
 }
 const blocks=[];
 function walk(n){if(n.nodeType===3){if(n.textContent.trim())blocks.push({plain:n.textContent,html:'<p>'+esc(n.textContent)+'</p>'});return;}if(n.nodeType!==1||drop.has(n.tagName))return;
  if(['DIV','SECTION','ARTICLE','MAIN'].includes(n.tagName)){Array.from(n.childNodes).forEach(walk);return;}
  if(splitItems&&['UL','OL'].includes(n.tagName)){for(const li of n.children){blocks.push({plain:li.textContent,html:'<'+n.tagName.toLowerCase()+'>'+clean(li)+'</'+n.tagName.toLowerCase()+'>',kind:'item'});}return;}
  const level=/^H[1-6]$/.test(n.tagName)?Number(n.tagName[1]):0,plain=n.textContent.trim(),lead=n.firstElementChild;
  const boldLead=lead&&['STRONG','B'].includes(lead.tagName)&&!(n.firstChild?.nodeType===3&&n.firstChild.textContent.trim())?lead.textContent.trim():'';
  const before=omitted,html=clean(n);blocks.push({plain,html,level,boldLead,soft:!level&&plain.length<=130&&boldLead.length>=Math.max(4,plain.length*.82),kind:n.tagName==='TABLE'?'table':/^[OU]L$/.test(n.tagName)?'list':'paragraph',images:omitted-before});
 }
 Array.from(template.content.childNodes).forEach(walk);return {blocks,omitted};
}
async function unzip(bytes){const Zip=require(base+'jszip.js'),zip=await Zip.loadAsync(bytes);let total=0;for(const f of Object.values(zip.files)){total+=f._data?.uncompressedSize||0;if(total>100*1024*1024)throw Error('zip-too-large');}return zip;}
async function office(file,ext){
 const zip=await unzip(await file.arrayBuffer()),read=async n=>{const f=zip.file(n);if(!f)throw Error('invalid-document');return xml(await f.async('string'));};let html='';
 if(ext==='docx'){
  const doc=await read('word/document.xml'),links=new Map();
  if(zip.file('word/_rels/document.xml.rels'))for(const r of (await read('word/_rels/document.xml.rels')).documentElement.children){if(href(r.getAttribute('Target')))links.set(r.getAttribute('Id'),href(r.getAttribute('Target')));}
  function inline(n){if(n.localName==='t')return esc(n.textContent);if(['br','cr'].includes(n.localName))return '<br>';if(n.localName==='tab')return '    ';if(n.localName==='drawing'||n.localName==='pict')return '<span>[Image]</span>';
   let out=Array.from(n.children).map(inline).join('');if(n.localName==='r'){if(all(n,'b').length)out='<strong>'+out+'</strong>';if(all(n,'i').length)out='<em>'+out+'</em>';}
   const u=n.localName==='hyperlink'&&links.get(n.getAttribute('r:id'));return u?'<a href="'+esc(u)+'">'+out+'</a>':out;
  }
  for(const n of all(doc,'body')[0]?.children||[]){if(n.localName==='p'){const style=all(n,'pStyle')[0]?.getAttribute('w:val')||'',match=style.match(/(?:heading|overskrift)[ _-]?([1-6])/i),tag=match?'h'+match[1]:/^title$/i.test(style)?'h1':'p';const v=inline(n);html+=all(n,'numPr').length?'<ul><li>'+v+'</li></ul>':'<'+tag+'>'+v+'</'+tag+'>';}
   else if(n.localName==='tbl')html+='<table>'+all(n,'tr').map(r=>'<tr>'+Array.from(r.children).filter(c=>c.localName==='tc').map(c=>'<td>'+all(c,'p').map(inline).join('<br>')+'</td>').join('')+'</tr>').join('')+'</table>';
  }
 }else{const doc=await read('content.xml');const render=n=>{if(n.nodeType===3)return esc(n.textContent);const v=Array.from(n.childNodes).map(render).join('');if(n.localName==='h'){const level=Math.max(1,Math.min(6,Number(n.getAttribute('text:outline-level'))||1));return '<h'+level+'>'+v+'</h'+level+'>';}
  const tags={p:'p',list:'ul','list-item':'li',table:'table','table-row':'tr','table-cell':'td','line-break':'br',tab:'span',span:'span'};const tag=tags[n.localName];if(n.localName==='image')return '<p>[Image]</p>';return tag?tag==='br'?'<br>':'<'+tag+'>'+v+'</'+tag+'>':v;};html=render(all(doc,'text')[0]||doc.documentElement);}
 return html;
}
async function sheet(file,ext,options){
 if(['xlsx','ods'].includes(ext))await unzip(await file.arrayBuffer());
 const XLSX=require(base+'xlsx.js');const bytes=new Uint8Array(await file.arrayBuffer());
 const book=XLSX.read(bytes,{type:'array',cellFormula:false,cellHTML:false,cellStyles:false,sheetRows:1002});
 const name=options.sheetName&&book.SheetNames.includes(options.sheetName)?options.sheetName:book.SheetNames[0];if(!name)throw Error('empty-document');
 const sh=book.Sheets[name],range=XLSX.utils.decode_range(sh['!fullref']||sh['!ref']||'A1');if(range.e.r>1000||range.e.c>99)throw Error('sheet-too-large');
 const rows=XLSX.utils.sheet_to_json(sh,{header:1,raw:false,defval:'',blankrows:true});
 let header=Math.max(0,Math.min(rows.length-1,(Number(options.headerRow)||1)-1)),width=Math.max(0,...rows.map(r=>r.length));if(!width)throw Error('empty-document');
 const headers=Array.from({length:width},(_,i)=>String(rows[header]?.[i]||XLSX.utils.encode_col(i))),titleCol=Math.max(0,Math.min(width-1,Number(options.titleColumn)||0)),tagCol=Number(options.tagColumn??-1);
 const columns=Array.isArray(options.textColumns)?options.textColumns.filter(n=>Number.isInteger(n)&&n>=0&&n<width):headers.map((_,i)=>i);
 const mode=options.sheetMode==='auto'||!options.sheetMode?(sh['!merges']?.length?'table':'rows'):options.sheetMode;
 const cell=s=>'<td>'+esc(s).replace(/\n/g,'<br>')+'</td>',sections=[];
 if(mode==='table'){const text='<table>'+rows.map((r,i)=>'<tr>'+Array.from({length:width},(_,j)=>i===header?'<th>'+esc(r[j]||'')+'</th>':cell(r[j]||'')).join('')+'</tr>').join('')+'</table>';sections.push({title:name,text,mergeText:text,tocType:'table',level:1,path:[]});}
 else rows.slice(header+1).forEach((r,i)=>{if(!r.some(v=>String(v).trim()))return;const title=String(r[titleCol]||name+' '+(header+i+2)),text='<table>'+columns.map(c=>'<tr><th>'+esc(headers[c])+'</th>'+cell(r[c]||'')+'</tr>').join('')+'</table>';sections.push({title,text,mergeText:text,tocType:'row',level:1,path:[],extraTags:tagCol>=0?String(r[tagCol]||'').split(/[;,\n]/).map(v=>v.trim()).filter(Boolean).slice(0,20):[],extraFields:{'sheet-name':name,'sheet-row':String(header+i+2)}});});
 if(sections.length>500)throw Error('too-many-sections');
 return {sections,modeUsed:mode,sheet:{names:book.SheetNames,name,headers,headerRow:header+1,titleColumn:titleCol,tagColumn:tagCol,textColumns:columns},warning:'sheet-values'};
}
async function pdf(file,options,report){
 globalThis.pdfjsWorker=require(base+'pdf-worker.js');const api=require(base+'pdf.js');
 const task=api.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,useWasm:false,useWorkerFetch:false,stopAtErrors:true});task.onPassword=()=>task.destroy();let doc;
 try{doc=await task.promise;if(doc.numPages>150)throw Error('pdf-too-many-pages');const blocks=[];let empty=0,total=0;
  for(let i=1;i<=doc.numPages;i++){report(i+'/'+doc.numPages);const page=await doc.getPage(i),content=await page.getTextContent();let text='';content.items.forEach(t=>{text+=String(t.str||'')+(t.hasEOL?'\n':' ');});total+=text.length;if(total>MAX_TEXT)throw Error('too-large');if(!text.trim())empty++;
   blocks.push({plain:text,html:'<h2>'+esc((options.en?'Page ':'Side ')+i)+'</h2><p>'+esc(text).replace(/\n/g,'<br>')+'</p>',level:1});page.cleanup();}
  const sourceOnly=options.pdfMode==='source'||options.pdfMode!=='text'&&empty===doc.numPages;
  if(sourceOnly)return {sections:[{title:file.name,text:'',mergeText:'',level:1,path:[],tocType:'document'}],modeUsed:'pdf-source',warning:'pdf-source',requireSource:true};
  return {sections:blocks.map((b,i)=>({title:(options.en?'Page ':'Side ')+(i+1),text:b.html,mergeText:b.html,level:1,path:[],tocType:'page'})),modeUsed:'pages',warning:empty?'pdf-missing-text':'pdf-text'};
 }finally{await task.destroy();}
}
async function read(file,options={},report=()=>{}){
 if(!file.size||file.size>MAX)throw Error('too-large');const ext=file.name.split('.').pop().toLowerCase();let out;
 if(['xlsx','xls','ods','csv','tsv'].includes(ext))out=await sheet(file,ext,options);
 else if(ext==='pdf')out=await pdf(file,options,report);
 else{let html;
  if(['docx','odt'].includes(ext))html=await office(file,ext);
  else if(['html','htm','txt','md'].includes(ext)){const text=await file.text();if(text.length>MAX_TEXT)throw Error('too-large');html=['html','htm'].includes(ext)?text:text.replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(p=>p.split('\n').map(line=>{const m=ext==='md'&&line.match(/^(#{1,6})\s+(.+)$/);return m?'<h'+m[1].length+'>'+esc(m[2])+'</h'+m[1].length+'>':'<p>'+esc(line)+'</p>';}).join('')).join('\n');}
  else throw Error('unsupported');
  const parsed=htmlBlocks(html,options.splitListItems);out={...model.split(parsed.blocks,options),warning:['docx','odt'].includes(ext)?'office-text':parsed.omitted?'html-images':'local-text'};
 }
 if(!out.sections.length)throw Error('empty-document');return {...out,source:{name:file.name,url:options.sourceUrl||'',type:ext,mime:file.type}};
}
async function fetchDocument(input){
 const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password)throw Error('https-url');
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),30000);
 try{const response=await fetch(url.href,{credentials:'omit',referrerPolicy:'no-referrer',signal:control.signal});if(!response.ok)throw Error('link-failed');
  if(Number(response.headers.get('content-length'))>MAX)throw Error('too-large');
  const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();throw Error('too-large');}chunks.push(value);}
  let name=decodeURIComponent(new URL(response.url).pathname.split('/').pop()||'document');const disposition=response.headers.get('content-disposition')||'',m=disposition.match(/filename="([^"/\\]+)"/i);if(m)name=m[1];
  const type=(response.headers.get('content-type')||'').split(';')[0];if(!/\.(pdf|docx|odt|xlsx|xls|ods|csv|tsv|txt|md|html?)$/i.test(name)){const ext={'application/pdf':'pdf','text/html':'html','text/plain':'txt','text/csv':'csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx'}[type];if(!ext)throw Error('unsupported');name+='.'+ext;}
  return {file:new File(chunks,name,{type}),url:response.url};
 }catch(e){if(['too-large','unsupported'].includes(e.message))throw e;throw Error('link-failed');}finally{clearTimeout(timer);}
}
exports.read=read;exports.fetchDocument=fetchDocument;exports.htmlBlocks=htmlBlocks;
