// Private helper service. No secret-returning browser operation exists.
import {execFile} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,rm,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
const hash=s=>createHash('sha256').update(s).digest('hex');
const empty=()=>({version:1,connections:[],passwords:[],grants:[],wikiLogins:{}});
const limited=(s,n=120)=>typeof s==='string' && s.length<=n && !/[\x00-\x1f]/.test(s);

// Image bytes belong to the ForgeShare host, never in the saved wiki or Vault secrets.
// Accepted formats are intentionally narrow; an extension or claimed MIME is not enough.
const MAX_IMAGE_BYTES=3*1024*1024;
const MAX_IMAGE_BATCH_BYTES=4*1024*1024;
const MAX_IMAGE_REQUESTS=2;
const imageFormats=new Set(['image/png','image/jpeg','image/webp']);
export function decodeImageAttachment(image){
  if(!image || typeof image!=='object' || !imageFormats.has(image.mimeType) ||
      typeof image.data!=='string' || !image.data.length ||
      image.data.length>Math.ceil(MAX_IMAGE_BYTES/3)*4+4 ||
      image.data.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))
    throw Error('Invalid PNG, JPEG or WebP image / Ugyldigt PNG-, JPEG- eller WebP-billede');
  const bytes=Buffer.from(image.data,'base64');
  if(!bytes.length || bytes.length>MAX_IMAGE_BYTES || bytes.toString('base64')!==image.data)
    throw Error('Invalid image payload / Ugyldige billeddata');
  const png=bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp=bytes.length>=12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
  if(!(image.mimeType==='image/png'&&png || image.mimeType==='image/jpeg'&&jpg || image.mimeType==='image/webp'&&webp))
    throw Error('Image content does not match format / Billedet passer ikke til filformatet');
  return {mimeType:image.mimeType,data:image.data,bytes};
}
function validatedImages(value){
  if(value===undefined || value===null)return [];
  if(!Array.isArray(value) || value.length>MAX_IMAGE_REQUESTS)throw Error('At most two images / Højst to billeder');
  const result=value.map(decodeImageAttachment);
  if(result.reduce((total,image)=>total+image.bytes.length,0)>MAX_IMAGE_BATCH_BYTES)
    throw Error('Images exceed the size limit / Billederne er for store');
  return result;
}
const mediaIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function privateCommand(command,args,input='',missingOK=false) {
  return new Promise((resolve,reject)=>{
    const child=execFile(command,args,{windowsHide:true,maxBuffer:1048576,timeout:30000},(error,stdout,stderr)=>error && !(missingOK && error.code===1 && !stdout && !stderr)?reject(Error('The system password store is unavailable. / Styresystemets nøgleboks er ikke tilgængelig.')):resolve(stdout));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export function systemStore({platform=process.platform,native=process.env.FORGESHARE_NATIVE,run=privateCommand}={}) {
  const perform=async(action,input)=>{
    if(platform==='linux')return run('secret-tool',action==='read'?['lookup','application','org.huwiki.ForgeShare','account','vault-v1']:['store','--label=ForgeShare','application','org.huwiki.ForgeShare','account','vault-v1'],input,action==='read');
    if(!native || !path.isAbsolute(native))throw Error('Open the ForgeShare app to use the vault. / Åbn ForgeShare-appen for at bruge nøgleboksen.');
    return run(native,['--vault',action],input);
  };
  return {async read(){const text=await perform('read');return text.trim()?JSON.parse(text):{};},async write(data){await perform('write',JSON.stringify(data));}};
}
export function publicConnection(c) {return {id:c.id,name:c.name,provider:c.provider,serverUrl:c.serverUrl,model:c.model,hasKey:!!c.secret};}
export function validateConnection(input) {
  if(!limited(input.name)||!input.name.trim()||!['lmstudio','ollama','openai','gemini','compatible'].includes(input.provider)||!limited(input.model,200))throw Error('Invalid connection');
  let url=new URL(input.provider==='openai'?'https://api.openai.com':input.provider==='gemini'?'https://generativelanguage.googleapis.com':input.serverUrl);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Use a server address without an API path. / Brug serveradressen uden en API-sti.');
  if(typeof input.secret!=='string'||input.secret.length>8192||/[\r\n]/.test(input.secret))throw Error('Invalid credential');
  if(input.provider==='gemini'&&!input.secret.trim())throw Error('Gemini needs an API key from Google AI Studio / Gemini kræver en API-nøgle fra Google AI Studio.');
  return {id:input.id||randomUUID(),name:input.name.trim(),provider:input.provider,serverUrl:url.origin,model:input.model,secret:input.secret};
}
export class Vault {
  constructor({root,lock,store=systemStore(),library,now=Date.now,fetcher=fetch}) {Object.assign(this,{root,lock,store,library,now,fetcher});this.inFlight=new Set();this.attempts=[];}
  async read(){const data=await this.store.read();if(Object.keys(data).length===0)return empty();if(data.version!==1||!Array.isArray(data.connections)||!Array.isArray(data.grants))throw Error('Unknown vault format');return data;}
  async change(fn){const release=await this.lock(this.root,'vault');try{const data=await this.read(),result=await fn(data);await this.store.write(data);return result;}finally{await release();}}
  async saveConnection(input){const c=validateConnection(input);return this.change(d=>{d.connections=d.connections.filter(e=>e.id!==c.id);d.connections.push(c);return publicConnection(c);});}
  async pending(){try {return JSON.parse(await readFile(path.join(this.root,'access-requests.json'),'utf8')).filter(p=>p.expires>this.now());}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  async changePending(fn){const release=await this.lock(this.root,'requests');try {const p=await this.pending(),result=await fn(p);const file=path.join(this.root,'access-requests.json'),tmp=file+'.'+randomUUID();await writeFile(tmp,JSON.stringify(p),{mode:0o600,flag:'wx'});await rename(tmp,file);return result;}finally{await release();}}
  async pair(wikiId,label,existingToken){
    if(!limited(label,80)||!label.trim())throw Error('Name this device / Navngiv denne enhed');
    const entries=(await this.library()).entries;if(!entries.some(e=>e.id===wikiId))throw Error('Unknown wiki');
    return this.changePending(p=>{
      const old=p.find(e=>e.wikiId===wikiId && e.hash===hash(existingToken||''));
      if(old)return {token:existingToken,code:old.code};
      if(p.length>=20)throw Error('Too many requests. / For mange anmodninger.');
      const token=randomBytes(32).toString('hex'),code=randomBytes(4).toString('hex').toUpperCase();
      p.push({id:randomUUID(),wikiId,label:label.trim(),hash:hash(token),code,expires:this.now()+600000});return {token,code};
    });
  }
  async approve(id,connectionIds,wikiIds){
    // Requests never grant anything until this native-only method is called.
    return this.changePending(async p=>{
      const item=p.find(e=>e.id===id);if(!item)throw Error('Request expired / Anmodningen er udløbet');
      const entries=(await this.library()).entries;
      await this.change(d=>{
        if(!connectionIds.every(id=>d.connections.some(c=>c.id===id))||!wikiIds.every(id=>entries.some(e=>e.id===id)))throw Error('Invalid selection');
        d.grants.push({...item,connectionIds:[...new Set(connectionIds)],wikiIds:[...new Set(wikiIds)],expires:this.now()+30*86400000});
      });p.splice(p.indexOf(item),1);
    });
  }
  async revoke(id){await this.change(d=>{d.grants=d.grants.filter(g=>g.id!==id);});}

  imageDirectory(wikiId){return path.join(this.root,'ai-media',hash(String(wikiId)));}
  async saveMedia(wikiId,input){
    const image=decodeImageAttachment(input),dir=this.imageDirectory(wikiId);
    await mkdir(dir,{recursive:true,mode:0o700});
    // A shared/approved device must not be able to fill the host disk indefinitely.
    const names=(await readdir(dir)).filter(name=>mediaIdPattern.test(name.replace(/\.bin$/,''))&&name.endsWith('.bin'));
    if(names.length>=500)throw Error('Local media library is full / Det lokale billedbibliotek er fyldt');
    let total=0;for(const name of names)total+=(await stat(path.join(dir,name))).size;
    if(total+image.bytes.length>128*1024*1024)throw Error('Local media quota exceeded / Grænse for lokale billeder nået');
    const id=randomUUID(),dataPath=path.join(dir,id+'.bin'),metaPath=path.join(dir,id+'.json');
    const name=limited(input.name,120)?input.name.trim():'';
    await writeFile(dataPath,image.bytes,{flag:'wx',mode:0o600});
    try{await writeFile(metaPath,JSON.stringify({id,mimeType:image.mimeType,name,bytes:image.bytes.length}),{flag:'wx',mode:0o600});}
    catch(e){await rm(dataPath,{force:true});throw e;}
    return {ok:true,id,mimeType:image.mimeType,name,bytes:image.bytes.length};
  }
  async loadMedia(wikiId,input){
    if(!mediaIdPattern.test(input?.id||''))throw Error('Invalid local image reference / Ugyldig lokal billedreference');
    const dir=this.imageDirectory(wikiId),id=input.id;
    const meta=JSON.parse(await readFile(path.join(dir,id+'.json'),'utf8'));
    if(meta.id!==id || !imageFormats.has(meta.mimeType) || !Number.isSafeInteger(meta.bytes) || meta.bytes>MAX_IMAGE_BYTES)
      throw Error('Invalid local media metadata / Ugyldige billedoplysninger');
    const bytes=await readFile(path.join(dir,id+'.bin'));
    if(bytes.length!==meta.bytes)throw Error('Invalid stored media / Ugyldigt gemt billede');
    const image=decodeImageAttachment({mimeType:meta.mimeType,data:bytes.toString('base64')});
    return {ok:true,id,mimeType:meta.mimeType,data:image.data,bytes:bytes.length};
  }
  async grant(wikiId,token){
    if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Approval required / Godkendelse kræves');
    const d=await this.read(),g=d.grants.find(g=>g.wikiId===wikiId&&g.hash===hash(token)&&g.expires>this.now());
    if(!g)throw Error('Approval required / Godkendelse kræves');return {d,g};
  }
  async call(wikiId,token,operation,input={}) {
    const {d,g}=await this.grant(wikiId,token);
    if(operation==='connections')return {connections:d.connections.filter(c=>g.connectionIds.includes(c.id)).map(publicConnection)};
    if(operation==='library')return {entries:(await this.library()).entries.filter(e=>g.wikiIds.includes(e.id)).map(e=>({id:e.id,name:e.name,description:e.description,kind:e.kind,url:e.shareUrl||'',addressIsLastKnown:true,hasLogin:!!d.wikiLogins[e.id]}))};
    if(operation==='media-get')return this.loadMedia(wikiId,input);
    if(operation==='media-save'){
      if(!g.connectionIds.length)throw Error('AI access approval required / Godkend AI-adgang først');
      this.attempts=this.attempts.filter(a=>a.time>this.now()-60000);
      if(this.attempts.filter(a=>a.id===g.id&&a.media).length>=10)throw Error('Please wait before saving more images / Vent før du gemmer flere billeder');
      this.attempts.push({id:g.id,time:this.now(),media:true});
      return this.saveMedia(wikiId,input);
    }
    if(!['models','generate'].includes(operation))throw Error('Unknown operation');
    const c=d.connections.find(c=>c.id===input.connectionId && g.connectionIds.includes(c.id));if(!c)throw Error('Connection not approved / Forbindelsen er ikke godkendt');
    if(this.inFlight.has(g.id))throw Error('Wait for the previous answer / Vent på det forrige svar');
    this.attempts=this.attempts.filter(a=>a.time>this.now()-60000);if(this.attempts.filter(a=>a.id===g.id).length>=10)throw Error('Please wait a minute / Vent et minut');
    this.attempts.push({id:g.id,time:this.now()});this.inFlight.add(g.id);
    try{return await this.request(c,operation,input);}finally{this.inFlight.delete(g.id);}
  }
  async request(c,operation,input){
    const ollama=c.provider==='ollama',gemini=c.provider==='gemini';let body,modelId='';
    if(operation==='generate'){
      if(input.consent!==true||!Array.isArray(input.messages)||input.messages.length>100||!input.messages.length)throw Error('Confirm before sending / Bekræft før afsendelse');
      const messages=input.messages.map(m=>{if(!['user','assistant','system'].includes(m.role)||typeof m.content!=='string'||m.content.length>100000)throw Error('Invalid message');return {role:m.role,content:m.content};});
      const images=validatedImages(input.images);
      if(images.length && !messages.some(m=>m.role==='user'))throw Error('Image requires a user message / Billedet kræver en brugerbesked');
      const model=input.model||c.model;
      if(!limited(model,200)||!model)throw Error('Choose a model / Vælg en model');
      if(gemini){
        modelId=String(model).replace(/^models\//,'');
        if(!/^[A-Za-z0-9._-]+$/.test(modelId))throw Error('Invalid Gemini model / Ugyldigt Gemini-modelnavn');
        const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
        const contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
        if(!contents.length)throw Error('No user or assistant messages / Ingen beskeder at sende');
        if(images.length){
          const last=contents.findLastIndex(m=>m.role==='user');
          contents[last].parts.push(...images.map(im=>({inline_data:{mime_type:im.mimeType,data:im.data}})));
        }
        body={contents,generationConfig:{maxOutputTokens:2048}};
        if(system)body.systemInstruction={parts:[{text:system}]};
      }else{
        body={model,messages,stream:false,...(!ollama?{...(c.provider==='openai'?{max_completion_tokens:2048}:{max_tokens:2048})}:{options:{num_predict:2048}})};
        if(images.length){
          const last=body.messages.findLastIndex(m=>m.role==='user');
          if(ollama)body.messages[last].images=images.map(im=>im.data);
          else body.messages[last].content=[
            {type:'text',text:body.messages[last].content},
            ...images.map(im=>({type:'image_url',image_url:{url:'data:'+im.mimeType+';base64,'+im.data}}))
          ];
        }
      }
    }
    // The Gemini destination is fixed even if a stored connection is damaged.
    const server=gemini?'https://generativelanguage.googleapis.com':c.serverUrl;
    const headers={'Content-Type':'application/json'};
    if(gemini)headers['x-goog-api-key']=c.secret;
    else if(c.secret)headers.Authorization='Bearer '+c.secret;
    const fetchJson=async(endpoint,payload)=>{
      const response=await this.fetcher(server+endpoint,{method:payload?'POST':'GET',headers,body:payload?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw Error('upstream:'+response.status);
      let chunks=[],size=0;
      for await(const chunk of response.body){chunks.push(Buffer.from(chunk));size+=chunk.length;if(size>2097152)throw Error('large response');}
      let raw=Buffer.concat(chunks).toString('utf8');
      // Upstream errors/echoes cannot leak credentials into a wiki.
      if(c.secret)raw=raw.split(c.secret).join('[private]');
      return JSON.parse(raw);
    };
    try{
      if(gemini&&operation==='models'){
        const models=[],seen=new Set();let nextPage='';
        // Gemini may paginate its catalog. Bound the number of pages and results.
        for(let page=0;page<5;page++){
          const endpoint='/v1beta/models?pageSize=100'+(nextPage?'&pageToken='+encodeURIComponent(nextPage):'');
          const data=await fetchJson(endpoint);
          if(!Array.isArray(data.models))throw Error('invalid model response');
          for(const item of data.models){
            if(item.supportedGenerationMethods&&(!Array.isArray(item.supportedGenerationMethods)||!item.supportedGenerationMethods.includes('generateContent')))continue;
            const name=String(item.name||'').replace(/^models\//,'');
            if(!/^[A-Za-z0-9._-]+$/.test(name)||seen.has(name))continue;
            seen.add(name);models.push(name);
            if(models.length>=500)break;
          }
          if(models.length>=500)break;
          nextPage=typeof data.nextPageToken==='string'&&data.nextPageToken.length<=2048?data.nextPageToken:'';
          if(!nextPage)break;
        }
        return {ok:true,models};
      }
      const endpoint=gemini?'/v1beta/models/'+encodeURIComponent(modelId)+':generateContent':
        operation==='models'?(ollama?'/api/tags':'/v1/models'):(ollama?'/api/chat':'/v1/chat/completions');
      const data=await fetchJson(endpoint,body);
      if(operation==='models')return {ok:true,models:(ollama?data.models:data.data||[]).map(m=>String(ollama?m.name:m.id).split(c.secret||'\u0000').join('[private]')).slice(0,500)};
      const content=gemini?(data.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p.text==='string').map(p=>p.text).join('\n'):
        ollama?data.message?.content:data.choices?.[0]?.message?.content;
      if(typeof content!=='string'||!content.trim())throw Error('missing content');
      return {ok:true,content:c.secret?content.split(c.secret).join('[private]'):content};
    }catch(error){
      if(gemini&&/^upstream:(401|403)$/.test(error.message||''))throw Error('Gemini rejected the API key or access (HTTP '+error.message.split(':')[1]+') / Gemini afviste API-nøgle eller adgang.');
      if(gemini&&error.message==='upstream:429')throw Error('Gemini quota or rate limit (HTTP 429) / Grænse for Gemini-kald eller kvote.');
      if(gemini&&error.message==='upstream:404')throw Error('Gemini model not found (HTTP 404) / Gemini-modellen findes ikke.');
      throw Error('The AI connection did not answer. Check it in ForgeShare. / AI-forbindelsen svarede ikke. Kontrollér den i ForgeShare.');
    }
  }
}
export async function vaultDialog(vault,ask,t){
  const add=t('Add AI connection','Tilføj AI-forbindelse'),password=t('Save another password','Gem en anden adgangskode'),approve=t('Approve a device','Godkend en enhed'),manage=t('Manage access and connections','Administrér adgang og forbindelser');
  const action=await ask('choice',t('Vault — secrets stay on this computer','Nøgleboks — hemmeligheder bliver på denne computer'),[add,approve,manage,password]);
  if(action===add){
    const providers=['LM Studio','Ollama','OpenAI','Google Gemini',t('Other compatible AI server','Anden kompatibel AI-server')];
    const picked=await ask('choice',t('AI connection','AI-forbindelse'),providers),index=providers.indexOf(picked);if(index<0)return;
    const name=await ask('text',t('Connection name','Forbindelsens navn'),picked),provider=['lmstudio','ollama','openai','gemini','compatible'][index];
    const serverUrl=provider==='openai'?'https://api.openai.com':provider==='gemini'?'https://generativelanguage.googleapis.com':await ask('text',t('Server address','Serveradresse'),index===0?'http://127.0.0.1:1234':index===1?'http://127.0.0.1:11434':'https://');
    let secret='';if(provider==='openai'||provider==='gemini'||await ask('choice',t('Does this connection need a key?','Kræver forbindelsen en nøgle?'),[t('No','Nej'),t('Yes','Ja')])===t('Yes','Ja')){
      const saved=(await vault.read()).passwords,newKey=t('Enter a new key','Indtast en ny nøgle'),labels=saved.map(p=>p.name+' · '+p.id.slice(0,8));
      const choice=saved.length?await ask('choice',t('Credential for this AI connection','Adgangsoplysning til denne AI-forbindelse'),[newKey,...labels]):newKey;
      if(choice===newKey)secret=await ask('password',t('API key — stored in the system vault','API-nøgle — gemmes i styresystemets nøgleboks'));
      else {const selected=saved[labels.indexOf(choice)];if(!selected)return;secret=selected.secret;}
    }
    const c=validateConnection({name,provider,serverUrl,secret,model:''});
    let model='';try{const result=await vault.request(c,'models',{});if(result.models.length)model=await ask('choice',t('Choose the model','Vælg modellen'),result.models);}catch{}
    if(!model)model=await ask('text',t('Model name from your AI service','Modelnavn fra din AI-tjeneste'));
    await vault.saveConnection({...c,model});await ask('info',t('Saved. In your wiki, choose Connect to ForgeShare and approve the request here.','Gemt. Vælg Forbind til ForgeShare i wikien, og godkend anmodningen her.'));
  }else if(action===password){
    const name=await ask('text',t('Name this password','Navngiv adgangskoden')),secret=await ask('password',t('Password','Adgangskode'));
    if(!limited(name)||!name.trim()||typeof secret!=='string'||!secret||secret.length>8192)throw Error(t('Enter a name and password','Indtast navn og adgangskode'));
    await vault.change(d=>{d.passwords.push({id:randomUUID(),name:name.trim(),secret});});
    await ask('info',t('Stored privately. Passwords are never returned to a wiki.','Gemt privat. Adgangskoder udleveres aldrig til en wiki.'));
  }else if(action===approve){
    const pending=await vault.pending(),library=await vault.library();if(!pending.length)return ask('info',t('No requests yet. Choose Connect to ForgeShare in the wiki first.','Ingen anmodninger endnu. Vælg først Forbind til ForgeShare i wikien.'));
    const labels=pending.map(p=>p.code+' · '+p.label+' · '+(library.entries.find(e=>e.id===p.wikiId)?.name||'?'));
    const p=pending[labels.indexOf(await ask('choice',t('Match the code shown on the requesting device','Kontrollér koden på den enhed, der beder om adgang'),labels))];if(!p)return;
    const d=await vault.read();
    const connectionLabel=c=>c.name+' · '+c.id.slice(0,8),wikiLabel=e=>e.name+' · '+e.id.slice(0,8);
    const none=t('No AI access','Ingen AI-adgang'),all=[none,...d.connections.map(connectionLabel)];
    const selected=(await ask('choices',t('Choose permitted AI connections. These can spend from your API account.','Vælg tilladte AI-forbindelser. De kan bruge penge på din API-konto.'),all)).split('\n');
    const noLibrary=t('No wiki overview','Ingen wikioversigt');
    const selectedWikis=(await ask('choices',t('Which wiki names and addresses may be shown?','Hvilke wikinavne og adresser må vises?'),[noLibrary,...library.entries.map(wikiLabel)])).split('\n');
    await ask('confirm',p.label+' · '+p.code+'\n'+t('Allow for 30 days? Access can be removed in the vault.','Tillad i 30 dage? Adgangen kan fjernes i nøgleboksen.'));
    await vault.approve(p.id,d.connections.filter(c=>selected.includes(connectionLabel(c))).map(c=>c.id),library.entries.filter(e=>selectedWikis.includes(wikiLabel(e))).map(e=>e.id));
  }else if(action===manage){
    const d=await vault.read(),entries=(await vault.library()).entries,items=[...d.grants.map(g=>({label:t('Remove access: ','Fjern adgang: ')+g.label,id:g.id,kind:'grant'})),...d.connections.map(c=>({label:t('Delete connection: ','Slet forbindelse: ')+c.name,id:c.id,kind:'connection'})),...d.passwords.map(c=>({label:t('Delete password: ','Slet adgangskode: ')+c.name,id:c.id,kind:'password'})),...Object.keys(d.wikiLogins).map(id=>({label:t('Forget sharing codes: ','Glem delingskoder: ')+(entries.find(e=>e.id===id)?.name||id),id,kind:'wiki'}))];
    for(const item of items)item.label+=' · '+item.id.slice(0,8);
    if(!items.length)return ask('info',t('The vault is empty','Nøgleboksen er tom'));
    const label=await ask('choice',t('Manage vault','Administrér nøgleboks'),items.map(i=>i.label)),chosen=items.find(i=>i.label===label);if(!chosen)return;
    await ask('confirm',label+'?');await vault.change(d=>{if(chosen.kind==='grant')d.grants=d.grants.filter(g=>g.id!==chosen.id);else if(chosen.kind==='connection')d.connections=d.connections.filter(c=>c.id!==chosen.id);else if(chosen.kind==='wiki')delete d.wikiLogins[chosen.id];else d.passwords=d.passwords.filter(c=>c.id!==chosen.id);});
  }
}
export function invitation({name,url,comment='',code,role,username,language='en'}) {
  const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid shared address');
  const da=language==='da',lines=[da?'Jeg har delt “'+name+'” med dig.':'I have shared “'+name+'” with you.',url];
  if(comment)lines.push('',comment);
  if(code)lines.push('',(da?'Adgangskode':'Access code')+(role?' ('+role+')':'')+': '+code,...(username?[(da?'Brugernavn: ':'Username: ')+username]:[]));
  lines.push('',da?'Computeren med delingen skal være tændt.':'The sharing computer must be on.');
  return 'mailto:?subject='+encodeURIComponent((da?'Invitation: ':'Invitation: ')+name)+'&body='+encodeURIComponent(lines.join('\n'));
}
