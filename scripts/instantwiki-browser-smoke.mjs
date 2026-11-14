import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
const root=process.cwd(),dir=await mkdtemp(path.join(tmpdir(),'forge-instantwiki-'));
const server=createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.includes('..'))throw Error();const f=path.join(root,name.endsWith('/')?name+'index.html':name);const data=await readFile(f);res.setHeader('Content-Type',f.endsWith('.mjs')?'text/javascript':f.endsWith('.json')?'application/json':'text/html');res.end(data);}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true});
try{
 for(const da of [true,false]){
  const t=(a,b)=>da?a:b,context=await browser.newContext({acceptDownloads:true,locale:da?'da-DK':'en-GB'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await context.route('https://forge.xn--mns-ula.dk/**',async route=>{const response=await route.fetch({url:base+new URL(route.request().url()).pathname});await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});});await page.goto(base+'/instantwiki/');
  await page.waitForFunction(()=>window.$tw?.wiki && document.querySelector(".forge-instantwiki,.tc-tiddler-frame"));assert.equal(await page.evaluate(()=>$tw.wiki.getTiddlerText('$:/language')),da?'$:/languages/da-DK':'$:/languages/en-GB');
  const ui=page.locator('.forge-instantwiki');await ui.waitFor();
  const document='<h1>Chapter A</h1><p>Alpha &amp; Beta. &lt;$action-setfield $tiddler="evil"/&gt; {{attack}}</p><h2>Child</h2><p>Retain this paragraph</p><h1>Chapter B</h1><p>Final paragraph</p><img src="https://invalid.example/track.png" onerror="window.INJECTED=1"><script>window.INJECTED=1</script>';
  const external=[];page.on('request',r=>{if(r.url().includes('invalid.example'))external.push(r.url());});
  await ui.locator('input[type=file]').setInputFiles({name:'Sample.html',mimeType:'text/html',buffer:Buffer.from(document)});
  await ui.locator('.iw-preview li').nth(2).waitFor();assert.equal(await ui.locator('.iw-preview li').count(),3);assert.equal(await page.evaluate(()=>window.INJECTED),undefined);assert.deepEqual(external,[]);
  await ui.getByLabel(t('Titel 1','Title 1'),{exact:true}).fill('Renamed chapter');await ui.getByLabel(t('Titel 1','Title 1'),{exact:true}).blur();
  await ui.locator('.iw-preview li').nth(1).getByRole('checkbox').uncheck();
  if(da)await ui.getByRole('checkbox',{name:t('Medtag originalfilen i wikien','Include the original file in the wiki'),exact:true}).uncheck();
  await ui.getByRole('button',{name:t('Vælg en Edition (kræver internet)','Choose an Edition (requires internet)'),exact:true}).click();await ui.getByLabel('Edition',{exact:true}).waitFor().catch(async e=>{console.log(await ui.innerText());throw e;});
  await ui.getByLabel('Edition',{exact:true}).selectOption('shop');
  const [download]=await Promise.all([page.waitForEvent('download'),ui.getByRole('button',{name:t('Skab og hent wiki','Create and download wiki'),exact:true}).click()]);
  const file=path.join(dir,'document-'+da+'.html');await download.saveAs(file);
  const made=await context.newPage();await made.goto(pathToFileURL(file).href);await made.waitForFunction(()=>window.$tw?.wiki && document.querySelector(".forge-instantwiki,.tc-tiddler-frame"));
  const state=await made.evaluate(()=>({root:$tw.wiki.getTiddlerText('$:/DefaultTiddlers'),parts:$tw.wiki.filterTiddlers('[instant-document-part[yes]]'),text:$tw.wiki.getTiddlerText('Renamed chapter'),shop:!!$tw.wiki.getTiddler('$:/plugins/huwiki/shop'),language:$tw.wiki.getTiddlerText('$:/language'),evil:!!$tw.wiki.getTiddler('evil')}));
  assert.equal(state.shop,true);assert.equal(state.language,da?'$:/languages/da-DK':'$:/languages/en-GB');assert.equal(state.parts.length,2);assert.match(state.text,/Retain this paragraph/);assert.match(state.text,/Alpha/);assert.equal(state.evil,false);
  if(!da){const attachment=await made.evaluate(()=>$tw.wiki.renderTiddler('text/html','Sample — Sample.html'));assert.match(attachment,/application\/octet-stream/);assert.doesNotMatch(attachment,/<script>/);}
  const documentView=made.locator('.instant-doc');await documentView.waitFor();assert.equal(await documentView.locator('.instant-doc-part').count(),2);
  await documentView.locator('.instant-doc-heading-hit').first().click();const editor=made.locator('.instant-doc-editor');await editor.waitFor();const before=await editor.inputValue();await editor.fill(before+'<p>Inline saved</p>');await made.getByRole('button',{name:t('✓ Gem','✓ Save'),exact:true}).click();assert.match(await made.evaluate(()=>$tw.wiki.getTiddlerText('Renamed chapter')),/Inline saved/);
  await documentView.locator('.instant-doc-heading-hit').first().click();await editor.fill('DISCARD ME');await editor.press('Escape');assert.doesNotMatch(await made.evaluate(()=>$tw.wiki.getTiddlerText('Renamed chapter')),/DISCARD ME/);
  await documentView.locator('.instant-doc-heading-hit').first().click();await editor.fill(before+'<p>Keyboard saved</p>');await editor.press(process.platform==='darwin'?'Meta+Enter':'Control+Enter');await made.waitForFunction(()=>$tw.wiki.getTiddlerText('Renamed chapter').includes('Keyboard saved'));assert.match(await made.evaluate(()=>$tw.wiki.getTiddlerText('Renamed chapter')),/Keyboard saved/);
  await made.getByRole('button',{name:t('☷ Åbn som tiddlere','☷ Open as tiddlers'),exact:true}).click();assert.deepEqual(await made.evaluate(()=>$tw.wiki.getTiddler('$:/StoryList').fields.list),['Renamed chapter','Chapter B']);
  const [saved]=await Promise.all([made.waitForEvent('download'),made.getByRole('button',{name:t('gem ændringer','save changes'),exact:true}).click()]);const savedPath=path.join(dir,'saved-'+da+'.html');await saved.saveAs(savedPath);
  const reopened=await context.newPage();await reopened.goto(pathToFileURL(savedPath).href);await reopened.waitForFunction(()=>window.$tw?.wiki && document.querySelector(".forge-instantwiki,.tc-tiddler-frame"));assert.match(await reopened.evaluate(()=>$tw.wiki.getTiddlerText('Renamed chapter')),/Retain this paragraph/);
  await ui.getByRole('button',{name:t('Importér i denne wiki…','Import into this wiki…'),exact:true}).click();await page.waitForFunction(()=>!!$tw.wiki.getTiddler('$:/Import'));
  assert.equal(await page.evaluate(()=>!!$tw.wiki.getTiddler('Renamed chapter')),false,'native review must not import without confirmation');
  await page.getByRole('button',{name:t('Importér','Import'),exact:true}).last().click();await page.waitForFunction(()=>!!$tw.wiki.getTiddler('Renamed chapter'));
  await page.getByRole('link',{name:'Sample',exact:true}).last().click();
  const importedView=page.locator('.instant-doc');await importedView.waitFor();
  assert.equal(await importedView.locator('.instant-doc-part').count(),2);
  await page.getByRole('button',{name:t('☷ Åbn som tiddlere','☷ Open as tiddlers'),exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>$tw.wiki.getTiddler('$:/StoryList').fields.list),['Renamed chapter','Chapter B']);
  assert.equal(await page.evaluate(()=>window.INJECTED),undefined);assert.deepEqual(errors,[]);await context.close();
 }
 // Exercise bundled readers entirely offline, including real DOCX, XLSX and PDF bytes.
 const context=await browser.newContext();const page=await context.newPage();await page.goto(base+'/instantwiki/');await page.waitForFunction(()=>window.$tw?.wiki && document.querySelector(".forge-instantwiki,.tc-tiddler-frame"));await context.setOffline(true);
 const data=await page.evaluate(async()=>{
  const r=$tw.modules.execute('$:/plugins/huwiki/instantwiki/readers.js'),Zip=$tw.modules.execute('$:/plugins/huwiki/instantwiki/vendor/jszip.js'),X=$tw.modules.execute('$:/plugins/huwiki/instantwiki/vendor/xlsx.js');
  const csv=await r.read(new File(['Name,Note\n"One","quoted, comma"\nTwo,Second'],'sample.csv'),{});
  const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['Name','Note'],['First','one']]),'First');X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([['Title','Body'],['Second','two']]),'Second');
  const sheet=await r.read(new File([X.write(book,{type:'array',bookType:'xlsx'})],'sample.xlsx'),{sheetName:'Second'});
  const zip=new Zip();zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p><w:p><w:r><w:t>Office body</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  const docx=await r.read(new File([await zip.generateAsync({type:'uint8array'})],'sample.docx'),{});
  const odtZip=new Zip();odtZip.file('content.xml','<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">ODT heading</text:h><text:p>ODT body</text:p></office:text></office:body></office:document-content>');const odt=await r.read(new File([await odtZip.generateAsync({type:'uint8array'})],'sample.odt'),{});
  const xls=await r.read(new File([X.write(book,{type:'array',bookType:'xls'})],'sample.xls'),{});const ods=await r.read(new File([X.write(book,{type:'array',bookType:'ods'})],'sample.ods'),{});
  const tsv=await r.read(new File(['Title\tBody\nTSV row\tTSV body'],'sample.tsv'),{});const md=await r.read(new File(['# Markdown heading\nMarkdown body'],'sample.md'),{});

  // Minimal valid single-page PDF with byte-accurate xref table.
  const stream='BT /F1 12 Tf 50 750 Td (Hello PDF) Tj ET';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((s,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+s+'\nendobj\n';});const start=pdf.length;pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
  const parsedPdf=await r.read(new File([pdf],'sample.pdf'),{en:true});const originalPdf=await r.read(new File([pdf],'sample.pdf'),{pdfMode:'source'});
  return {csv:csv.sections,sheet:sheet.sections,docx:docx.sections,odt:odt.sections,xls:xls.sections,ods:ods.sections,tsv:tsv.sections,md:md.sections,pdf:parsedPdf.sections,original:originalPdf.requireSource};
 });
 assert.equal(data.csv.length,2);assert.match(data.csv[0].text,/quoted, comma/);assert.equal(data.sheet[0].title,'Second');assert.match(data.docx[0].text,/Office body/);assert.match(data.docx[0].text,/Cell/);assert.match(data.pdf[0].text,/Hello PDF/);assert.equal(data.pdf[0].title,'Page 1');assert.doesNotMatch(data.pdf[0].text,/<h[1-6]>|Page 1/);assert.equal(data.original,true);assert.match(data.odt[0].text,/ODT body/);assert.equal(data.xls[0].title,'First');assert.equal(data.ods[0].title,'First');assert.equal(data.tsv[0].title,'TSV row');assert.match(data.md[0].text,/Markdown body/);
 const linkContext=await browser.newContext({locale:'en-GB'});const linkPage=await linkContext.newPage();await linkPage.route('https://document.test/source.txt',route=>route.fulfill({status:200,contentType:'text/plain',headers:{'Access-Control-Allow-Origin':'*'},body:'Public document body'}));await linkPage.goto(base+'/instantwiki/');await linkPage.locator('.forge-instantwiki').waitFor();await linkPage.getByLabel('Or a public document URL',{exact:true}).fill('https://document.test/source.txt');await linkPage.getByRole('button',{name:'Fetch document',exact:true}).click();await linkPage.locator('.iw-preview li').waitFor();assert.match(await linkPage.locator('.iw-preview').innerText(),/Title 1/);await linkPage.getByLabel('Or a public document URL',{exact:true}).fill('http://document.test/source.txt');await linkPage.getByRole('button',{name:'Fetch document',exact:true}).click();await linkPage.getByRole('alert').waitFor();assert.match(await linkPage.getByRole('alert').innerText(),/HTTPS/);assert.equal(await linkPage.locator('.iw-preview li').count(),0);await linkContext.close();
 await context.close();console.log('InstantWiki: DA/EN, HTML safety, merge, Shop Edition, native import, save/reopen, offline DOCX/XLSX/CSV/PDF passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}
