"""Build the searchable AniMus catalogue and optional, self-contained starter packs.
No full collection is imported into a user's wiki. External files use pinned revisions.
Run with --toon DIR --theseus DIR; --rgs ZIP adds the fifteen modular face samples.
"""
import argparse,base64,copy,hashlib,io,json,pathlib,re,struct,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/animus'
TAG='$:/tags/AniMus/Asset'
BASE='https://forge.xn--mns-ula.dk/assets/animus/'
CC0='https://creativecommons.org/publicdomain/zero/1.0/'
def slug(s):return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def pose(x=0,y=0):return dict(t=0,x=x,y=y,r=0,sx=1,sy=1,opacity=1,easing='linear')
def dimensions(data):
 if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Expected PNG')
 return struct.unpack('>II',data[16:24])
def save_json(p,value):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
def asset(key,data,**extra):
 w,h=dimensions(data);name='files/'+key+'.png';p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 return dict(id=key,url=BASE+name,mime='image/png',width=w,height=h,sha256=hashlib.sha256(data).hexdigest(),**extra)
def entry(id,name,category,collection,author,source,**extra):return dict(id=id,name=name,category=category,collection=collection,author=author,source=source,license='CC0-1.0',licenseUrl=CC0)|extra
def image_part(id,name,parent,a,x,y,w,h,crop=None):
 g=dict(x=-w/2,y=0,w=w,h=h)
 if crop:g['crop']=crop
 return dict(id=id,name=name,type='image',parent=parent,pivot=dict(x=0,y=0),asset=a,geo=g,keys=[pose(x,y)])
def toon_entries(folder):
 result=[]
 for d in sorted(folder.iterdir()):
  parts=d/'PNG/Parts'
  if not parts.is_dir():continue
  id='kenney-'+slug(d.name);assets=[]
  for f in sorted(parts.glob('*.png')):assets.append(asset(id+'/'+f.stem,f.read_bytes(),part=f.stem))
  by={a['part']:a for a in assets};used={k:by[k]['id'] for k in ['body','head','arm','hand','leg']};ps=[dict(id='actor',name=d.name,type='group',parent=None,pivot=dict(x=0,y=0),geo={},keys=[pose()])]
  def img(key,name,parent,a,x,y,scale=3,crop=None):
   v=by[a];w,h=v['width']*scale,v['height']*scale
   if crop:w,h=crop['w']*scale,crop['h']*scale
   p=image_part(key,name,parent,v['id'],x,y,w,h,crop);ps.append(p);return p
  # The original straight arm and leg are split at their middle. Pivots stay
  # at the cut edge, so elbows and knees rotate without detaching the artwork.
  for side,x in [('back',-40),('front',40)]:
   for bone,a,y in [('arm','arm',-158),('leg','leg',-52)]:
    v=by[a];half=v['height']/2
    first=dict(x=0,y=0,w=v['width'],h=half,sourceWidth=v['width'],sourceHeight=v['height'])
    second={**first,'y':half}
    upper=img(side+'-'+bone,('Shoulder' if bone=='arm' else 'Hip')+' '+side,'actor',a,x if bone=='arm' else x*.5,y,crop=first)
    img(side+'-'+('elbow' if bone=='arm' else 'knee'),('Elbow' if bone=='arm' else 'Knee')+' '+side,upper['id'],a,0,half*3-1,crop=second)
    if bone=='arm':img(side+'-hand','Hand '+side,side+'-elbow','hand',0,half*3-5,scale=2.4)
  img('body','Body','actor','body',0,-162)
  p=img('head','Head','actor','head',0,-296);p['geo']['y']=0
  # Remove unused head/back/pose files from the character's dependency list.
  assets=[a for a in assets if a['id'] in set(used.values())]
  e=entry(id,d.name,'figure','kenney-toon','Kenney','https://opengameart.org/content/toon-characters-1',assets=assets,parts=ps,preview=by['head']['url'],height=300,keywords='figure character puppet figur dukke robot zombie person menneske '+d.name)
  result.append(e)
 return result

def remote_entries(index):
 result=[];raw='https://raw.githubusercontent.com/ETdoFresh/kenney.nl/'+index['kenneyRevision']+'/background-elements-redux/'
 for f in index['backgrounds']:
  path=f['path'];name=pathlib.PurePosixPath(path).stem;cat='background' if path.startswith('Backgrounds/') and '/Elements/' not in path else 'scenery'
  id='kenney-background-'+slug(name);url=raw+urllib.parse.quote(path)
  result.append(entry(id,re.sub(r'([a-z])([A-Z])',r'\1 \2',name),cat,'kenney-backgrounds','Kenney','https://opengameart.org/content/background-elements-redux',assets=[dict(id=id,url=url,mime='image/png')],preview=url,keywords=cat+' '+name))
 raw='https://raw.githubusercontent.com/ThirdPartyNinjas/GlitchAssets/'+index['glitchRevision']+'/Items/'
 for f in index['glitch']:
  path=f['path'];name=pathlib.PurePosixPath(path).stem;id='glitch-'+slug(path[:-4]);url=raw+urllib.parse.quote(path)
  cat='cutout' if path.startswith('cubimals/') else 'prop'
  result.append(entry(id,name.replace('_',' '),cat,'glitch-items','Tiny Speck; PNG conversion: ThirdPartyNinjas','https://github.com/tinyspeck/glitch-items',assets=[dict(id=id,url=url,mime='image/png')],preview=url,grip=dict(x=.5,y=.65),keywords=path.replace('/',' ').replace('_',' '),conversionSource='https://github.com/ThirdPartyNinjas/GlitchAssets'))
 return result

def greek_entries(folder):
 rows={}
 for f in sorted(folder.glob('*.json')):
  try:items=json.loads(f.read_text())
  except (ValueError,UnicodeError):continue
  if not isinstance(items,list):continue
  for t in items:
   if isinstance(t,dict) and 'title' in t:rows[t['title']]=t
 scene=next((json.loads(t['text']) for t in rows.values() if t['title']=='Theseus II · 01 · En hånd på rælingen'),None)
 if not scene:raise ValueError('Theseus harbour scene missing')
 result=[]
 for root,name,category in [('harbour','Den græske havn','background'),('harbour-foreground','Hus og træ ved havnen','scenery'),('continued-ship','Theseus’ skib','prop'),('pip','Pip','figure'),('mara','Mara','figure'),('ione','Ione','figure')]:
  ids={root}
  for _ in range(16):ids.update(p['id'] for p in scene['parts'] if p.get('parent') in ids)
  ps=copy.deepcopy([p for p in scene['parts'] if p['id'] in ids]);assets=[];names={}
  for p in ps:
   # Freeze the reusable figure at its authored first pose; omit scene dialogue.
   if p.get('keys'):p['keys']=[{**p['keys'][0],'t':0}]
   for part in [p]+p.get('variants',[]):
    title=part.get('asset')
    if not title:continue
    if title not in names:
     t=rows[title];aid='greek/'+slug(title);names[title]=aid;data=base64.b64decode(t['text']);assets.append(asset(aid,data))
    part['asset']=names[title];part.pop('assetId',None)
  rp=next(p for p in ps if p['id']==root);rp['parent']=None;rp['keys']=[pose()]
  result.append(entry('greek-'+root,name,category,'greek-harbour','Måns Mårtensson / AniMus Forge','https://forge.xn--mns-ula.dk/demo/?edition=theseus-ship',assets=assets,parts=ps,preview=assets[0]['url'] if assets else '',license='Forge project artwork',licenseUrl='',aiGenerated=True,keywords='græsk havn skib theseus harbour ship greek pip mara ione',height=300))
 return result

def rgs_entries(archive):
 from PIL import Image
 z=zipfile.ZipFile(archive);groups={}
 for name in sorted(z.namelist(),key=lambda n:(not bool(re.search(r'(?:^|/)idle[_/]',n,re.I)),n)):
  if not name.lower().endswith('.png'):continue
  match=re.search(r'(?:^|/)((?:Eyes?|Mouth)[ _-]*\d+)(?:/|[ _-])',name,re.I)
  if match:
   key=slug(match[1]);groups.setdefault(key,name)
 result=[]
 for key,name in sorted(groups.items()):
  im=Image.open(io.BytesIO(z.read(name))).convert('RGBA');bbox=im.getbbox()
  if not bbox:continue
  im=im.crop(bbox);buf=io.BytesIO();im.save(buf,format='PNG');a=asset('rgs/'+key,buf.getvalue());kind='eyes' if key.startswith('eye') else 'mouth'
  result.append(entry('rgs-'+key,key.replace('-',' ').title(),'face','rgs-faces','RGS_Dev (Raphael Gonçalves)','https://rgsdev.itch.io/free-cc0-modular-animated-vector-characters-2d',assets=[a],preview=a['url'],faceKind=kind,keywords='ansigt øjne mund face eyes mouth '+key,sourceMember=name))
 if len(result)<15:raise ValueError('Expected seven eye and eight mouth samples; found '+str(len(result))+' ('+', '.join(groups)+')')
 return result

def package(name,title,entries,scene_name):
 prefix='$:/plugins/huwiki/'+name;tiddlers={};packed=copy.deepcopy(entries)
 for e in packed:
  for a in e['assets']:
   target=prefix+'/media/'+a['id'];a['title']=target;p=OUT/urllib.parse.unquote(a['url'].removeprefix(BASE))
   if not p.exists():
    p=OUT/'files/starter'/pathlib.PurePosixPath(a['id']+'.png');p.parent.mkdir(parents=True,exist_ok=True)
    if not p.exists():p.write_bytes(urllib.request.urlopen(a['url'],timeout=45).read())
   data=p.read_bytes();a['width'],a['height']=dimensions(data)
   tiddlers[target]=dict(title=target,type='image/png',text=base64.b64encode(data).decode(),**{'animus-source-id':e['id']})
  ti=prefix+'/items/'+e['id'];tiddlers[ti]=dict(title=ti,type='application/json',tags=TAG,text=json.dumps(e,ensure_ascii=False))
 # A small editable template, with independent instance IDs and local images.
 selected=[e for e in packed if e['category']!='figure']+[e for e in packed if e['category']=='figure'][:3 if 'greek' in name else 2]
 order={'background':0,'prop':1,'scenery':2,'figure':3,'cutout':3,'face':4};selected.sort(key=lambda e:order[e['category']])
 scene=dict(version=1,id=name+'-sample',kind='animation',name=title,width=960,height=540,duration=16,background='#dce7e1',parts=[])
 figure_index=0
 for e in selected:
  mapping={a['id']:a['title'] for a in e['assets']}
  ps=copy.deepcopy(e.get('parts',[]))
  if not ps:
   a=e['assets'][0];w,h=a['width'],a['height'];scale=max(960/w,540/h) if e['category']=='background' else min(150/w,180/h)
   ps=[image_part('image',e['name'],None,a['id'],110 if e['id'].endswith('-tree') else 820 if e['id'].endswith('-house1') else 480,470 if e['category']!='background' else 0,w*scale,h*scale)]
   if e['category']!='background':ps[0]['geo']['y']=-h*scale
  ids={p['id']:e['id']+'-'+p['id'] for p in ps}
  for part in ps:
   part['id']=ids[part['id']];parent=part.get('parent');part['parent']=ids.get(parent)
   if part.get('actorId'):part['actorId']=ids.get(part['actorId'],part['actorId'])
   for v in [part]+part.get('variants',[]):
    if v.get('asset'):v['asset']=mapping[v['asset']];v.pop('assetId',None)
   if not parent:
    if e['category']=='figure':part['keys']=[pose(260+figure_index*230,470)];figure_index+=1
    elif e['category']=='prop':part['keys']=[pose(500,320)]
   scene['parts'].append(part)
 template=prefix+'/template';tiddlers[template]=dict(title=template,type='application/json',tags='$:/tags/AniMus/Template',**{'cutout-project':'yes','cutout-id':scene['id'],'animus-template-name':title},text=json.dumps(scene,ensure_ascii=False))
 # Keep the entry gallery native to TiddlyWiki; adding to a scene uses the shared picker.
 page=title;tiddlers[page]=dict(title=page,tags='AniMus',text=scene_name+'\n\n<$animus-new-project template="'+template+'"/>\n\nOpen an AniMus scene and choose **Workshops → Materials**. / Åbn en AniMus-scene og vælg **Værksteder → Materialer**.')
 info=dict(title=prefix,name=title,description=scene_name,author='HUWiki Forge',version='0.1.0',type='application/json',**{'plugin-type':'plugin','requires-reload':'yes','dependents':'$:/plugins/huwiki/musical','license':'Mixed; per-element provenance'})
 save_json(ROOT/'plugins'/name/'dist/plugin.json',{**info,'text':json.dumps({'tiddlers':tiddlers},ensure_ascii=False,separators=(',',':'))})

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--toon',type=pathlib.Path);ap.add_argument('--theseus',type=pathlib.Path);ap.add_argument('--rgs',type=pathlib.Path);ap.add_argument('--packages',action='store_true');args=ap.parse_args()
 OUT.mkdir(parents=True,exist_ok=True);idx=json.loads((ROOT/'scripts/animus-source-index.json').read_text());entries=remote_entries(idx)
 if args.toon:entries+=toon_entries(args.toon)
 if args.theseus:entries+=greek_entries(args.theseus)
 if args.rgs:entries+=rgs_entries(args.rgs)
 if len({e['id'] for e in entries})!=len(entries):raise ValueError('Duplicate catalogue ID')
 save_json(OUT/'catalog.json',dict(schemaVersion=1,entries=entries))
 if args.packages:
  kenney=[e for e in entries if e['collection']=='kenney-toon' or e['id'] in ['kenney-background-backgroundcolorgrass','kenney-background-tree','kenney-background-house1','glitch-food-apple-apple','glitch-tools-hatchet-class-axe-class-axe']]
  package('animus-starter-kenney','AniMus · Kenney Starter',kenney,'Six articulated characters, scenery and individual props / Seks ledopdelte figurer, kulisser og rekvisitter')
  package('animus-theme-greek-harbour','AniMus · Den græske havn',[e for e in entries if e['collection']=='greek-harbour'],'Hand-painted harbour, ship and Theseus characters / Håndmalet havn, skib og Theseus-figurer')
 print(json.dumps({'entries':len(entries),'collections':{k:sum(e['collection']==k for e in entries) for k in sorted(set(e['collection'] for e in entries))}},ensure_ascii=False))
if __name__=='__main__':main()
