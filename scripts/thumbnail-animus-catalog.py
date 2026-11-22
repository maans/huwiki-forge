"""Create small preview files so browsing never downloads full source atlases."""
import hashlib,json,pathlib
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'assets/animus';host='https://forge.xn--mns-ula.dk/assets/animus/'
cat=json.loads((OUT/'catalog.json').read_text());(OUT/'previews').mkdir(exist_ok=True);done={}
for e in cat['entries']:
 url=e.get('preview','')
 if not url.startswith(host) or '/previews/' in url or not url.endswith('.png'):continue
 path=OUT/url[len(host):]
 if not path.is_file():continue
 if url not in done:
  name=hashlib.sha256(path.read_bytes()).hexdigest()+'.png';dest=OUT/'previews'/name
  with Image.open(path) as im:im.thumbnail((240,180));im.save(dest,optimize=True)
  done[url]=host+'previews/'+name
 e['preview']=done[url]
(OUT/'catalog.json').write_text(json.dumps(cat,ensure_ascii=False,indent=2)+'\n');print('Small visual previews:',len(done))
