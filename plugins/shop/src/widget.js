"use strict";
var Widget=require('$:/core/modules/widgets/widget.js').widget,model=require('$:/plugins/huwiki/shop/model.js'),guide=require('$:/plugins/huwiki/shop/guide.js');
var DATA='$:/plugins/huwiki/shop/data';
function Shop(tree,options){this.initialise(tree,options);}
Shop.prototype=new Widget();
Shop.prototype.lang=function(){return /(?:^|\/)da-DK$/.test(this.wiki.getTiddlerText('$:/language',''))?'da':'en';};
Shop.prototype.render=function(parent,nextSibling){
 this.parentDomNode=parent;this.computeAttributes();this.execute();
 this.language=this.lang();this.en=this.language==='en';this.data=this.wiki.getTiddlerData(DATA,null)||{draft:model.fromTemplate('fest',this.language),checks:{},step:0,route:'sites',sheetUrl:''};
 this.data.checks=this.data.checks||{};this.data.step=Math.min(6,Math.max(0,Number(this.data.step)||0));
 this.root=this.document.createElement('section');this.root.className='forge-shop';parent.insertBefore(this.root,nextSibling);this.domNodes.push(this.root);this.draw();
};
Shop.prototype.save=function(){this.wiki.setTiddlerData(DATA,this.data);};
Shop.prototype.t=function(da,en){return this.en?en:da;};
Shop.prototype.el=function(tag,text,parent){var e=this.document.createElement(tag);if(text!=null)e.textContent=text;(parent||this.root).appendChild(e);return e;};
Shop.prototype.button=function(text,fn,parent){var b=this.el('button',text,parent);b.type='button';b.addEventListener('click',fn);return b;};
Shop.prototype.link=function(label,url,parent){var a=this.el('a',label,parent);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
Shop.prototype.error=function(e){var messages={https:['Brug en hel https-adresse.','Use a complete https address.'],title:['Giv butikken et navn.','Give your shop a name.'],items:['Brug 1–25 varer.','Use 1–25 products.'],item:['Hver vare skal have et navn.','Each product needs a name.'],price:['Priser skal være mellem 0 og 100.000.','Prices must be between 0 and 100,000.'],payment:['Brug modtagerens officielle MobilePay/Vipps-betalingslink.','Use the recipient’s official MobilePay/Vipps payment link.'],form:['Indsæt et offentligt respondentlink. For Google: kopiér linket fra Udgivet → Kopiér respondentlink.','Paste a public responder link. For Google: copy it from Published → Copy responder link.']};this.notice.textContent=(messages[e.message]||[e.message,e.message])[this.en?1:0];this.notice.focus();};
Shop.prototype.change=function(){
 // Catalog edits invalidate order/publishing confirmations, but keep account/sheet setup.
 for(var k of Object.keys(this.data.checks))if(/^(catalog-ready|contact-ready|form-questions|test-|external-tested|anonymous-|preview-|export-|sites-|funnel-link|public-)/.test(k))delete this.data.checks[k];
 this.save();if(this.progressNode)this.progress();
};
Shop.prototype.field=function(parent,label,object,key,multiline,privateField){var wrap=this.el('label',null,parent);wrap.className='shop-field';this.el('span',label,wrap);var input=this.el(multiline?'textarea':'input',null,wrap);input.value=object[key]==null?'':object[key];if(!multiline)input.type='text';else input.rows=3;input.addEventListener('input',()=>{object[key]=input.value;privateField?this.save():this.change();});return input;};
Shop.prototype.select=function(parent,label,object,key,options,fn){var wrap=this.el('label',null,parent);wrap.className='shop-field';this.el('span',label,wrap);var select=this.el('select',null,wrap);select.setAttribute('aria-label',label);options.forEach(v=>{var o=this.el('option',v[1],select);o.value=v[0];});select.value=object[key];select.addEventListener('change',()=>{object[key]=select.value;(fn||(()=>this.change()))();});return select;};
Shop.prototype.checks=function(checks,parent){checks.forEach(c=>{var box=this.el('div',null,parent);box.className='shop-check';var label=this.el('label',null,box),input=this.el('input',null,label);input.type='checkbox';input.checked=!!this.data.checks[c[0]];this.el('span',c[this.en?2:1],label);input.addEventListener('change',()=>{this.data.checks[c[0]]=input.checked;this.save();this.progress();});if(c[3])this.link(this.t('Åbn vejledning / tjeneste ↗','Open guide / service ↗'),c[3],box);});};
Shop.prototype.applicable=function(){var mode=this.data.draft.mode;return guide.steps.flatMap(s=>mode!=='google'&&['form','sheet','test-form'].includes(s.id)?[]:s.checks).concat(guide.routes[this.data.route||'sites'],mode==='external'?guide.externalChecks:[]).filter(c=>!(mode==='catalog'&&['public-order','daily-routine'].includes(c[0])));};
Shop.prototype.progress=function(){var checks=this.applicable(),done=checks.filter(c=>this.data.checks[c[0]]).length;this.progressNode.textContent=done+' / '+checks.length+' '+this.t('handlinger afkrydset · gem wikien for at bevare fremdriften','actions checked · save your wiki to keep your progress');};
Shop.prototype.download=function(name,text,type){var url=URL.createObjectURL(new Blob([text],{type:type||'text/html;charset=utf-8'})),a=this.document.createElement('a');a.href=url;a.download=name;this.document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
Shop.prototype.upload=function(parent,label,object,key){var wrap=this.el('label',label,parent),input=this.el('input',null,wrap);input.type='file';input.accept='image/png,image/jpeg,image/webp';input.addEventListener('change',()=>{var file=input.files[0];if(!file)return;if(file.size>1000000||!/^image\/(png|jpeg|webp)$/.test(file.type)){this.notice.textContent=this.t('Vælg PNG, JPEG eller WebP under 1 MB.','Choose PNG, JPEG or WebP under 1 MB.');return;}var reader=new FileReader();reader.onload=()=>{object[key]=reader.result;this.change();this.draw();};reader.readAsDataURL(file);});};
Shop.prototype.draw=function(){
 this.root.textContent='';var d=this.data.draft,step=guide.steps[this.data.step],lang=this.en?1:0;
 this.el('h2',this.t('Fra idé til din egen Shop','From idea to your own Shop'));
 this.el('p',this.t('En guide til et Shop Site, du kan dele med kunder. Testudgave: Google Sites og offentlig Funnel skal stadig prøves med din egen konto.','A guide to a Shop Site you can share with customers. Test edition: Google Sites and public Funnel still need testing with your own account.'));
 this.progressNode=this.el('p');this.progressNode.className='shop-progress';this.progress();
 var nav=this.el('nav');nav.setAttribute('aria-label',this.t('Opsætningstrin','Setup steps'));
 guide.steps.forEach((s,i)=>{var b=this.button(s.title[lang],()=>{this.data.step=i;this.save();this.draw();},nav);if(i===this.data.step)b.setAttribute('aria-current','step');});
 this.notice=this.el('p');this.notice.className='shop-notice';this.notice.setAttribute('role','status');this.notice.tabIndex=-1;
 this.el('h3',step.title[lang]);this.el('p',step.intro[lang]);
 if(this.data.step===0)this.catalogEditor();
 var skip=d.mode!=='google'&&[1,2,3].includes(this.data.step);
 if(skip){
  this.el('p',d.mode==='catalog'?this.t('Du har valgt katalog uden formular. Fortsæt til trin 5. Kunden kontakter dig via oplysningerne på siden.','You chose a catalog without a form. Continue to step 5. Customers use the contact details on the page.'):this.t('Du har valgt en anden formular. Opret den hos din valgte tjeneste med spørgsmålene nedenfor. Test som kunde uden ejerlogin, og kontrollér, at du modtager svaret.','You chose another form. Create it with your chosen service using the questions below. Test as a customer without the owner’s login and verify receipt of the response.'));
  if(d.mode==='external'){this.field(this.root,this.t('Offentligt formularlink','Public form link'),d,'formUrl');this.questions();this.checks(guide.externalChecks);}
 }else this.checks(step.checks.filter(c=>!(d.mode==='catalog'&&['public-order','daily-routine'].includes(c[0]))).map(c=>{
  if(c[0]==='public-mobile'&&d.mode==='catalog')return [c[0],'Jeg har åbnet den offentlige kundeside på en telefon uden ejerlogin og kontrolleret billeder og kontaktoplysninger.','I have opened the public customer site on a phone without the owner’s login and checked images and contact details.'];
  if(c[0]==='public-order'&&d.mode==='external')return [c[0],'Jeg har sendt en TEST-bestilling fra den offentlige side og kontrolleret modtagelsen hos min valgte formulartjeneste.','I have sent a TEST order from the public page and verified receipt with my chosen form service.'];
  if(c[0]==='daily-routine'&&d.mode==='external')return [c[0],'Jeg ved, hvor jeg finder nye bestillinger og registrerer bekræftelse, betaling og levering manuelt.','I know where to find new orders and manually record confirmation, payment and delivery.'];
  return c;
 }));
 if(this.data.step===1&&!skip){this.questions();this.field(this.root,this.t('Respondentlink (bliver offentligt)','Responder link (will be public)'),d,'formUrl');}
 if(this.data.step===2&&!skip){this.el('pre',this.t('ID | Tidspunkt | Navn | Kontakt | Bestilling | Beløb | Status | Betaling | Note','ID | Time | Name | Contact | Order | Amount | Status | Payment | Note'));this.field(this.root,this.t('Privat adresse til ordrearket','Private order sheet address'),this.data,'sheetUrl',false,true);if(/^https:\/\/docs\.google\.com\/spreadsheets\//.test(this.data.sheetUrl||''))this.link(this.t('Åbn mit ordreark ↗','Open my order sheet ↗'),this.data.sheetUrl);}
 if(this.data.step===3&&!skip){try{var publicUrl=model.catalog(d).formUrl;if(publicUrl)this.link(this.t('Åbn formular ↗','Open form ↗'),publicUrl);}catch(e){this.error(e);}}
 if(this.data.step===4)this.exporter();
 if(this.data.step===5){this.select(this.root,this.t('Udgivelsesvej','Publishing route'),this.data,'route',[['sites','Google Sites'],['funnel','Tailscale Funnel']],()=>{this.save();this.draw();});this.checks(guide.routes[this.data.route]);if(this.data.route==='funnel'){this.link(this.t('Installér Tailscale ↗','Install Tailscale ↗'),'https://tailscale.com/download');this.el('pre','node shop-server.cjs\n\n# '+this.t('I et nyt terminalvindue:','In a new terminal window:')+'\ntailscale funnel 8787');this.button(this.t('Hent shop-server.cjs','Download shop-server.cjs'),()=>this.download('shop-server.cjs',this.wiki.getTiddlerText('$:/plugins/huwiki/shop/shop-server.cjs'),'text/javascript'));this.link(this.t('Prøv den lokale butik ↗','Try the local shop ↗'),'http://127.0.0.1:8787');}}
 if(this.data.step===6){var details=this.el('details');this.el('summary',this.t('Hvis noget driller','Troubleshooting'),details);guide.troubleshooting.forEach(t=>{this.el('h4',t[this.en?1:0],details);this.el('p',t[this.en?3:2],details);});this.link(this.t('Tailscale på Mac ↗','Tailscale on Mac ↗'),'https://tailscale.com/docs/install/mac');}
 var actions=this.el('div');actions.className='shop-actions';
 if(this.data.step>0)this.button(this.t('← Tilbage','← Back'),()=>{this.data.step--;this.save();this.draw();},actions);
 if(this.data.step<6)this.button(this.t('Næste →','Next →'),()=>{this.data.step++;this.save();this.draw();},actions);
 this.button(this.t('Gem min arbejdswiki','Save my working wiki'),()=>{this.save();this.dispatchEvent({type:'tm-save-wiki'});},actions);
 this.el('p',this.t('Ændrer du katalog eller formularlink, fjernes relevante test- og udgivelsesflueben. Gennemgå dem igen. Google-sider kan have lidt andre knapnavne på din konto.','Changing the catalog or form link clears relevant test and publication checks. Repeat them. Google button labels may differ slightly for your account.'));
};
Shop.prototype.questions=function(){var d=this.data.draft;this.el('h4',this.t('Spørgsmål til din formular','Questions for your form'));this.el('p',this.t('Kopiér én linje ad gangen. Navn, kontakt og antal er påkrævet; besked er valgfri.','Copy one line at a time. Name, contact and quantities are required; message is optional.'));this.el('pre',[this.t('Dit navn — Kort svar','Your name — Short answer'),this.t('Kontakt (mail eller telefon) — Kort svar','Contact (email or phone) — Short answer')].concat(d.items.map(v=>v.name+(v.variant?' / '+v.variant:'')+' — '+v.price+' DKK — '+this.t('antal: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10','quantity: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10'))).concat([this.t('Ønsker eller besked — Afsnit','Requests or message — Paragraph')]).join('\n'));};
Shop.prototype.catalogEditor=function(){
 var d=this.data.draft,choices=model.templates.map(t=>[t.id,t[this.language].title]);
 var temp={template:d.template};this.select(this.root,this.t('Startskabelon','Starting template'),temp,'template',choices,()=>{});
 this.button(this.t('Brug skabelonen (erstatter kataloget)','Use template (replaces catalog)'),()=>{if(!confirm(this.t('Erstat det nuværende katalog? Formularlink og udgivelsesprøver skal gennemgås igen.','Replace the current catalog? Review the form link and publication tests again.')))return;this.data.draft=model.fromTemplate(temp.template,this.language);this.change();this.draw();});
 this.field(this.root,this.t('Butikkens navn','Shop name'),d,'title');this.field(this.root,this.t('Introduktion','Introduction'),d,'intro',true);
 this.select(this.root,this.t('Visning','Layout'),d,'layout',[['gallery',this.t('Galleri','Gallery')],['list',this.t('Liste','List')],['poster',this.t('Plakat','Poster')]]);
 this.select(this.root,this.t('Farve','Colour'),d,'color',[['forest',this.t('Skov','Forest')],['berry',this.t('Bær','Berry')],['ink',this.t('Blæk','Ink')],['clay',this.t('Ler','Clay')]]);
 this.select(this.root,this.t('Modtag bestillinger','Receive orders'),d,'mode',[['google','Google Forms + Sheets'],['external',this.t('En anden offentlig formular','Another public form')],['catalog',this.t('Katalog uden formular','Catalog without a form')]],()=>{this.change();this.draw();});
 this.el('h4',this.t('Varer og muligheder','Products and options'));
 d.items.forEach((v,i)=>{var box=this.el('fieldset');this.el('legend',(i+1)+'. '+v.name,box);[['name','Navn','Name'],['variant','Variant','Variant'],['price','Pris (DKK)','Price (DKK)'],['description','Beskrivelse','Description'],['status','Status / tilgængelighed','Status / availability'],['image','Offentligt billedlink (valgfrit)','Public image URL (optional)']].forEach(f=>this.field(box,f[this.en?2:1],v,f[0],f[0]==='description'));this.upload(box,this.t('Eller vælg et lokalt billede','Or choose a local image'),v,'image');if(v.image)this.button(this.t('Fjern billede','Remove image'),()=>{v.image='';this.change();this.draw();},box);if(d.items.length>1)this.button(this.t('Fjern vare','Remove product'),()=>{d.items.splice(i,1);this.change();this.draw();},box);});
 if(d.items.length<25)this.button(this.t('+ Tilføj vare','+ Add product'),()=>{d.items.push({name:this.t('Ny vare','New product'),price:0,variant:'',description:'',status:'',image:''});this.change();this.draw();});
 this.field(this.root,this.t('Offentlige kontaktoplysninger','Public contact details'),d,'contact');this.field(this.root,this.t('Levering og bekræftelse','Delivery and confirmation'),d,'delivery',true);
 var pay=this.el('details');this.el('summary',this.t('Valgfri betaling med MobilePay','Optional MobilePay payment'),pay);this.el('p',this.t('Brug modtagerens eksisterende oplysninger og betalingskode. Shop opretter ikke en betalingsaftale og kan ikke se, om kunden har betalt.','Use the recipient’s existing details and payment code. Shop does not create a payment agreement or detect whether a customer has paid.'),pay);
 [['recipient','Modtager','Recipient'],['phone','Betalingsnummer','Payment number'],['paymentLink','Officielt betalingslink','Official payment link']].forEach(f=>this.field(pay,f[this.en?2:1],d,f[0]));this.upload(pay,this.t('Modtagerens betalings-QR (valgfrit)','Recipient payment QR (optional)'),d,'qrImage');if(d.qrImage)this.button(this.t('Fjern betalingsbillede','Remove payment image'),()=>{d.qrImage='';this.change();this.draw();},pay);
};
Shop.prototype.exporter=function(){
 try{var result=model.site(this.data.draft,this.language,true),frame=this.el('iframe');frame.title=this.t('Forhåndsvisning af kundesiden','Customer site preview');frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.srcdoc=result.html;
 this.button(this.t('Hent kundeside: index.html','Download customer site: index.html'),()=>{try{this.download('index.html',model.site(this.data.draft,this.language,false).html);}catch(e){this.error(e);}});
 this.button(this.t('Vis kode til Google Sites','Show code for Google Sites'),()=>{try{var output=model.site(this.data.draft,this.language,false);code.value=output.fragment;code.hidden=false;code.focus();code.select();this.notice.textContent=this.t('Kopiér den markerede kode med ⌘C / Ctrl+C. Indsæt den i Google Sites på næste trin.','Copy the selected code with ⌘C / Ctrl+C. Paste it into Google Sites in the next step.');}catch(e){this.error(e);}});
 var code=this.el('textarea');code.setAttribute('aria-label',this.t('Kode til Google Sites','Code for Google Sites'));code.readOnly=true;code.rows=8;code.hidden=true;
 }catch(e){this.error(e);}
};
Shop.prototype.refresh=function(changed){if(changed['$:/language']){this.refreshSelf();return true;}return false;};
exports['forge-shop']=Shop;
