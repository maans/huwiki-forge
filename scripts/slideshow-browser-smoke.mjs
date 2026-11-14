/** Original Slideshow/PasteUp flows in real Chromium, including offline files. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {loadEdition,assembleHtml} from '../assembler/assemble.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=await mkdtemp(path.join(tmpdir(),'slideshow-'));
const fetcher=async url=>{try{return{ok:true,json:async()=>JSON.parse(await readFile(path.join(root,new URL(url).pathname),'utf8'))};}catch{return{ok:false,status:404};}};
const {tiddlers}=await loadEdition('https://forge.test/editions/slideshow/manifest.json',fetcher);
const html=assembleHtml(await readFile(path.join(root,'core/empty.html'),'utf8'),tiddlers);
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(url)||u.startsWith('file:'))return route.continue();remote.push(u);return route.abort();});
 await page.goto(url);await page.locator('.show-hero').waitFor();
 assert.match(await page.locator('.show-hero').innerText(),/Give your story/);
 assert.equal(await page.locator('.tc-error-form').count(),0);
 const open=param=>page.evaluate(param=>$tw.rootWidget.dispatchEvent({type:'tm-huwiki-slideshow-open',param}),param);
 const lang=async value=>{await page.evaluate(value=>$tw.wiki.addTiddler({title:'$:/language',text:'$:/languages/'+value}),value);await page.waitForFunction(value=>$tw.wiki.getTiddlerText('$:/language')==='$:/languages/'+value,value);};
 const review=async()=>{await page.getByRole('button',{name:'Continue with this content',exact:true}).click();};
 const download=async(id,name,needsReview=false)=>{const waiting=page.waitForEvent('download');await page.locator('#'+id).click();if(needsReview)await review();const d=await waiting,file=path.join(dir,name);await d.saveAs(file);return file;};
 // Every preserved original presentation must render a real PasteUp slide.
 const decks=await page.evaluate(()=>$tw.wiki.filterTiddlers('[all[shadows+tiddlers]tag[Slideshow/Eksempler]tag[HUWiki-Præsentation]]'));
 assert.equal(decks.length,7);
 for(const deck of decks){await page.evaluate(param=>$tw.rootWidget.dispatchEvent({type:'tm-huwiki-slideshow-view',param}),deck);await page.waitForFunction(()=>document.querySelector('#huws-stage-content').innerHTML.length>500);assert.ok((await page.locator('#huws-stage-content').innerHTML()).length>500);await page.locator('#huws-stage-title').click();await page.keyboard.press('ArrowRight');assert.match(await page.locator('#huws-stage-counter').innerText(),/^2\s*\//);await page.locator('#huws-stage-exit').click();await page.waitForFunction(()=>!document.fullscreenElement);}
 console.log('PASS seven original example decks, actual PasteUp rendering and keyboard navigation');
 await open('manual');await page.locator('#huws-create-name').fill('QA presentation æøå');await page.locator('#huws-create-ok').click();
 for(const name of ['QA first','QA second']){await page.locator('#huws-slide-name').fill(name);await page.locator('#huws-create-slide').click();}
 await page.locator('#huws-notes').fill('PRIVATE SPEAKER NOTES');await page.locator('#huws-save').click();
 const deckTitle='Præsentation – QA presentation æøå';
 await page.locator('#huws-slides button[data-action="up"][data-index="1"]').click();await page.locator('#huws-save').click();
 const saved=await page.evaluate(title=>$tw.wiki.getTiddlerText(title),deckTitle);assert.equal(JSON.parse(saved).slides[0].title,'QA second');
 await lang('da-DK');await page.getByRole('tab',{name:'Eksport',exact:true}).waitFor();assert.equal(await page.evaluate(title=>$tw.wiki.getTiddlerText(title),deckTitle),saved);
 await lang('en-GB');await page.getByRole('tab',{name:'Export',exact:true}).waitFor();
 await page.locator('#huws-tab-export').click();
 const pdf=await download('huws-export-pdf','slides.pdf');assert.equal((await readFile(pdf)).subarray(0,5).toString(),'%PDF-');
 const native=await download('huws-export-native','slides.json',true);const bundle=JSON.parse(await readFile(native,'utf8'));assert.equal(bundle.deck.slides[0].notes,'PRIVATE SPEAKER NOTES');
 const siteZip=await download('huws-export-site','site.zip',true);const site=execFileSync('unzip',['-p',siteZip,'index.html'],{maxBuffer:30e6});assert.ok(!site.includes('PRIVATE SPEAKER NOTES'));const siteFile=path.join(dir,'site.html');await writeFile(siteFile,site);
 const view=await context.newPage();view.on('pageerror',e=>errors.push(e.message));await view.goto(pathToFileURL(siteFile).href);await view.locator('#huws-stage-content').getByRole('heading',{name:'QA second'}).waitFor();await view.locator('#huws-next').click();await view.locator('#huws-stage-content').getByRole('heading',{name:'QA first'}).waitFor();await view.close();
 console.log('PASS create/edit/reorder/notes, native da/en, real PDF/native-package/site ZIP and offline site playback without speaker notes');
 // Real FileSystemDirectoryHandle operations; only the native folder chooser is substituted.
 await page.evaluate(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();});
 await page.locator('#huws-publish-site').click();await review();await page.locator('dialog [data-folder]').click();await page.locator('dialog [data-name]').fill('qa-site');await page.locator('dialog [data-save]').click();await page.waitForFunction(()=>document.querySelector('dialog [data-status]').textContent.includes('qa-site/index.html'));
 assert.ok(await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),d=await root.getDirectoryHandle('qa-site');return (await(await(await d.getFileHandle('index.html')).getFile()).text()).includes('$:/boot/boot.js');}));
 await page.locator('dialog [data-close]').click();await page.locator('#huws-tab-slides').click();await page.locator('#huws-tab-export').click();
 await page.locator('#huws-published-sites button').first().click();await review();await page.locator('dialog [data-save]').click();await page.waitForFunction(()=>document.querySelector('dialog [data-status]').textContent.includes('qa-site/index.html'));assert.ok(await page.evaluate(async()=>{const d=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-site');return (await(await d.getFileHandle('previous.html')).getFile()).size>1000;}));await page.locator('dialog [data-close]').click();
 // Refuse deletion when unrelated files are present.
 await page.evaluate(async()=>{const d=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-site'),w=await(await d.getFileHandle('keep.txt',{create:true})).createWritable();await w.write('Keep me');await w.close();});
 await page.locator('#huws-tab-slides').click();await page.locator('#huws-tab-export').click();await page.locator('#huws-published-sites button').nth(1).click();await page.locator('#huws-published-sites button').last().click();await page.waitForFunction(()=>document.querySelector('#huws-published-sites').textContent.includes('other files'));
 await page.evaluate(async()=>{const d=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-site');await d.removeEntry('keep.txt');});await page.locator('#huws-published-sites button').last().click();await page.waitForFunction(async()=>{try{await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-site');return false;}catch(e){return e.name==='NotFoundError';}});
 console.log('PASS real directory create/update/previous copy, protected deletion and explicit cleanup');
 const selectImport=async(file,mode='text')=>{await page.locator('#huws-tab-import').click();await page.locator('#huwi-file').setInputFiles(file);await page.locator('#huwi-mode').selectOption(mode);await page.locator('#huwi-prepare').click();await page.waitForFunction(()=>!document.querySelector('#huwi-prepare').disabled);};
 const commit=async name=>{await page.locator('#huwi-name').fill(name);await page.locator('#huwi-commit').click();await page.waitForFunction(()=>document.querySelector('#huws-tab-slides').getAttribute('aria-selected')==='true');};
 await selectImport({name:'sample.md',mimeType:'text/markdown',buffer:Buffer.from('# Alpha\nFirst paragraph\n\n# Beta\nSecond paragraph')});assert.equal(await page.locator('#huwi-preview input').count(),2);await page.locator('#huwi-preview input').last().uncheck();await lang('da-DK');await page.waitForFunction(()=>document.querySelector('#huwi-prepare').textContent==='Forhåndsvis');assert.equal(await page.locator('#huwi-preview input:checked').count(),1);await lang('en-GB');await commit('QA text import');
 assert.equal(await page.evaluate(()=>JSON.parse($tw.wiki.getTiddlerText('Præsentation – QA text import')).slides.length),1);
 // Generate a valid text-layer PDF with the actual bundled library, then import it.
 const pdfBytes=await page.evaluate(()=>{const {jsPDF}=$tw.modules.execute('$:/plugins/huwiki/slideshow/vendor/jspdf.js'),p=new jsPDF();p.text('A locally imported PDF',20,20);return Array.from(new Uint8Array(p.output('arraybuffer')));});
 await selectImport({name:'local.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdfBytes)},'text');await commit('QA PDF text');assert.match(await page.evaluate(()=>$tw.wiki.getTiddlerText(JSON.parse($tw.wiki.getTiddlerText('Præsentation – QA PDF text')).slides[0].title)),/locally imported/);
 await selectImport({name:'local.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdfBytes)},'visual');await commit('QA PDF image');assert.ok(await page.evaluate(()=>$tw.wiki.filterTiddlers('[tag[HUWiki-Import]type[image/jpeg]]').length));
 // Office source fixtures exercise local readers, relationship order and links.
 const office=await page.evaluate(async()=>{const Zip=$tw.modules.execute('$:/plugins/huwiki/slideshow/vendor/jszip.js'),z=new Zip();z.file('word/document.xml','<w:document xmlns:w="w" xmlns:r="r"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Document heading</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r><w:hyperlink r:id="link1"><w:r><w:t>Original link</w:t></w:r></w:hyperlink></w:p></w:body></w:document>');z.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="link1" Target="https://tiddlywiki.com/" TargetMode="External"/></Relationships>');return Array.from(await z.generateAsync({type:'uint8array'}));});
 await selectImport({name:'local.docx',mimeType:'application/octet-stream',buffer:Buffer.from(office)});await commit('QA DOCX');const docxText=await page.evaluate(()=>$tw.wiki.getTiddlerText(JSON.parse($tw.wiki.getTiddlerText('Præsentation – QA DOCX')).slides[0].title));assert.match(docxText,/<strong>Bold text<\/strong>/);assert.match(docxText,/href="https:\/\/tiddlywiki.com\/"/);
 // PPTX relationship order and OpenDocument text readers.
 for(const kind of ['pptx','odt','odp']){
  const bytes=await page.evaluate(async kind=>{const Zip=$tw.modules.execute('$:/plugins/huwiki/slideshow/vendor/jszip.js'),z=new Zip();
   if(kind==='pptx'){z.file('ppt/presentation.xml','<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>');z.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>');for(const n of [1,2])z.file('ppt/slides/slide'+n+'.xml','<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Ordered slide '+n+'</a:t></a:r></a:p></p:sld>');}
   else z.file('content.xml',kind==='odt'?'<office:document xmlns:office="office" xmlns:text="text"><office:body><office:text><text:h>OpenDocument heading</text:h><text:p>Editable ODT content</text:p></office:text></office:body></office:document>':'<office:document xmlns:office="office" xmlns:draw="draw" xmlns:text="text"><office:body><draw:page><text:p>First ODP slide</text:p></draw:page><draw:page><text:p>Second ODP slide</text:p></draw:page></office:body></office:document>');return Array.from(await z.generateAsync({type:'uint8array'}));},kind);
  await selectImport({name:'local.'+kind,mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});await commit('QA '+kind);const text=await page.evaluate(kind=>{const deck=JSON.parse($tw.wiki.getTiddlerText('Præsentation – QA '+kind));return $tw.wiki.getTiddlerText(deck.slides[0].title);},kind);assert.match(text,kind==='pptx'?/Ordered slide 2/:kind==='odt'?/Editable ODT content/:/First ODP slide/);
 }
 await selectImport({name:'local.html',mimeType:'text/html',buffer:Buffer.from('<h1>Safe imported text</h1><script>window.unwantedImport=true</script><img src="https://example.invalid/leak"><p onclick="window.unwantedImport=true">Kept content</p><a href="javascript:alert(1)">Plain link</a>')});await commit('QA HTML');const clean=await page.evaluate(()=>$tw.wiki.getTiddlerText(JSON.parse($tw.wiki.getTiddlerText('Præsentation – QA HTML')).slides[0].title));assert.doesNotMatch(clean,/script|onclick|<img|javascript:/);assert.match(clean,/Kept content/);
 console.log('PASS PPTX relationship order, ODT/ODP readers and inactive local HTML import');
 // Import a package into a fresh wiki, then import the same package again unchanged.
 const fresh=await context.newPage();fresh.on('pageerror',e=>errors.push(e.message));await fresh.goto(url);await fresh.evaluate(()=>$tw.rootWidget.dispatchEvent({type:'tm-huwiki-slideshow-open'}));
 for(let repeat=0;repeat<2;repeat++){await fresh.locator('#huws-tab-import').click();await fresh.locator('#huwi-file').setInputFiles(native);await fresh.locator('#huwi-prepare').click();await fresh.locator('#huwi-commit').waitFor();await fresh.waitForFunction(()=>!document.querySelector('#huwi-commit').disabled);await fresh.locator('#huwi-commit').click();await fresh.waitForFunction(()=>document.querySelector('#huws-tab-slides').getAttribute('aria-selected')==='true');}
 assert.equal(await fresh.evaluate(title=>JSON.parse($tw.wiki.getTiddlerText(title)).slides[0].notes,deckTitle),'PRIVATE SPEAKER NOTES');await fresh.close();
 console.log('PASS selected text import, preserved preview across native language changes, PDF text/image, DOCX formatting/links and repeatable native package import');
 await page.locator('#huws-tab-export').click();const backup=await download('huws-export-zip','backup.zip');const backupHtml=execFileSync('unzip',['-p',backup,'index.html'],{maxBuffer:30e6});const backupFile=path.join(dir,'backup.html');await writeFile(backupFile,backupHtml);await page.goto(pathToFileURL(backupFile).href);await page.locator('.show-hero').waitFor();assert.ok(await page.evaluate(()=>$tw.wiki.getTiddler('Præsentation – QA DOCX')));assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/language')),'$:/languages/en-GB');
 const [saver]=await Promise.all([page.waitForEvent('download'),page.locator('button[class*="Buttons%2Fsave-wiki"]').click()]);const savedFile=path.join(dir,'native-saved.html');await saver.saveAs(savedFile);await page.goto(pathToFileURL(savedFile).href);await page.locator('.show-hero').waitFor();assert.ok(await page.evaluate(()=>$tw.wiki.getTiddler('Præsentation – QA DOCX')));
 if(process.env.FORGE_SCREENSHOTS){await mkdir(process.env.FORGE_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.FORGE_SCREENSHOTS,'forge-slideshow.png')});}
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);assert.equal(await page.locator('.tc-error-form').count(),0);
 console.log('PASS editable whole-wiki ZIP, native saver/reopen and no external network dependency');
}finally{await browser.close();await new Promise(r=>server.close(r));}
