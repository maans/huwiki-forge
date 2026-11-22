"""Retrieve the reviewed CC0 source archives and build reproducible asset outputs."""
import html,json,pathlib,re,subprocess,sys,tempfile,time,urllib.parse,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def get(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (AniMus Forge asset packaging)'}),timeout=120) as r:return r.read()
  except Exception:
   if attempt==2:raise
   time.sleep(2)
def archive(page,expected,destination):
 url='https://opengameart.org/sites/default/files/'+urllib.parse.quote(expected)
 try:data=get(url)
 except Exception:
  body=get(page).decode();links=re.findall(r'href=[\"\']([^\"\']+\.zip(?:\?[^\"\']*)?)[\"\']',body,re.I)
  matches=[urllib.parse.urljoin(page,html.unescape(x)) for x in links if expected.lower().replace('_','') in urllib.parse.unquote(x).lower().replace('_','')]
  if not matches:raise RuntimeError('Source archive not found: '+page)
  data=get(matches[0])
 destination.write_bytes(data);return zipfile.ZipFile(destination)
with tempfile.TemporaryDirectory(prefix='animus-assets-') as temp:
 temp=pathlib.Path(temp);toon=temp/'toon';toon.mkdir()
 z=archive('https://opengameart.org/content/toon-characters-1','kenney_toonCharacters1.zip',temp/'toon.zip')
 for member in z.infolist():
  if member.is_dir():continue
  path=pathlib.Path(member.filename)
  if path.is_absolute() or '..' in path.parts:raise ValueError('Invalid archive path')
  z.extract(member,toon)
 if not list(toon.glob('*/PNG/Parts')):
  toon=next(p.parent.parent.parent for p in toon.rglob('PNG/Parts'))
 archive('https://opengameart.org/content/free-cc0-modular-animated-vector-characters-2d','free_2d_animated_vector_game_character_sprites.zip',temp/'rgs.zip')
 # Print only paths, never execute anything from an asset archive.
 names=zipfile.ZipFile(temp/'rgs.zip').namelist();print('RGS paths:',json.dumps(names[:15]));print('RGS face paths:',json.dumps([n for n in names if re.search('eye|mouth',n,re.I)][:15]))
 subprocess.run([sys.executable,str(ROOT/'scripts/build-animus-assets.py'),'--toon',str(toon),'--rgs',str(temp/'rgs.zip'),'--theseus',str(ROOT/'editions/theseus-ship/tiddlers'),'--packages'],cwd=ROOT,check=True)
