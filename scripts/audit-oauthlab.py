"""Read-only source inventory. Never executes Apps Script or publishes a bundle.
Usage: python3 scripts/audit-oauthlab.py /path/HUWiki-OAuthLab-backup.zip
"""
import base64, gzip, hashlib, json, re, sys, zipfile
from pathlib import Path
archive=Path(sys.argv[1])
groups={
 'cutout':['CutOutEdition.js','CutOutAsset','CutOutSiteRuntime.js'],
 'studio':['StudioEdition.js','Studio.js','StudioPublish.js'],
 'ai':['AIEdition.js','PrivateVault.js'],
 'shop':['ShopEdition.js'],
 'survey':['SurveyEdition.js','SurveyLive.js'],
 'slideshow':['SlideshowEdition.js','SlideshowPublishing.js','SlideshowVendorAsset.js'],
 'av':['AVEdition.js','AVWorkshopAsset.js'],
 'drawing_dependencies':['TegneEdition.js','TegneAsset','TegnePackage']}
result={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'groups':{}}
with zipfile.ZipFile(archive) as z:
 result['archiveEntries']=len(z.infolist())
 for group,prefixes in groups.items():
  rows=[]
  for name in sorted(z.namelist()):
   if not any(Path(name).name.startswith(p) for p in prefixes):continue
   raw=z.read(name);text=raw.decode('utf-8');payloads=[]
   for match in re.finditer(r'[\'"]([A-Za-z0-9+/=]{100,})[\'"]',text):
    try:decoded=gzip.decompress(base64.b64decode(match[1])).decode('utf-8')
    except (ValueError,OSError,UnicodeError,EOFError):continue
    payloads.append(decoded)
   all_text='\n'.join([text,*payloads])
   rows.append({'file':Path(name).name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'decodedPayloads':len(payloads),'decodedBytes':sum(len(s.encode()) for s in payloads),'serviceReferences':{s:len(re.findall(re.escape(s),all_text)) for s in ['google.script.run','HUDriveApp','DriveApp','HUFormConnector','SpreadsheetApp'] if s in all_text}})
  result['groups'][group]=rows
Path('migration/oauthlab-source-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Audited',sum(len(v) for v in result['groups'].values()),'source files; no code executed')
