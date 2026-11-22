"""Small, explicitly selected CC0 sound effects; no speech, songs or music."""
import hashlib,json,pathlib,subprocess,tempfile,urllib.request,wave
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'assets/animus';REV='45df48c4d45f8716216b1a9e22df0b69cd9f5932'
# Paths are pinned to the same Kenney mirror used by the visual asset catalogue.
SOUNDS=[
 ('rpgaudio','creak1','Wood creak','Knirkende træ','🪵'),('rpgaudio','creak2','Wood creak 2','Knirkende træ 2','🪵'),
 ('rpgaudio','doorOpen_1','Door opening','Dør åbnes','🚪'),('rpgaudio','doorClose_1','Door closing','Dør lukkes','🚪'),
 ('rpgaudio','chop','Chopping wood','Hug i træ','🪓'),('rpgaudio','cloth1','Cloth rustle','Stof rasler','⛵'),
 ('rpgaudio','bookOpen','Book opening','Bog åbnes','📖'),('rpgaudio','bookClose','Book closing','Bog lukkes','📕'),
 ('rpgaudio','handleCoins','Coins','Mønter','🪙'),('rpgaudio','metalLatch','Metal latch','Metallås','🔒'),
 ('impactsounds','footstep_wood_000','Footstep on wood','Skridt på træ','👣'),('impactsounds','footstep_grass_000','Footstep on grass','Skridt på græs','👣'),
 ('impactsounds','impactWood_medium_000','Wood impact','Slag mod træ','🔨'),('impactsounds','impactPlank_medium_000','Plank impact','Slag mod planke','🔨'),
 ('impactsounds','impactMetal_light_000','Light metal impact','Let metalslag','🔧'),('impactsounds','impactBell_heavy_000','Bell impact','Klokkeslag','🔔')]
cat=json.loads((OUT/'catalog.json').read_text());cat['entries']=[e for e in cat['entries'] if e['collection']!='kenney-audio'];(OUT/'files/audio').mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 for pack,name,label,da,icon in SOUNDS:
  source=f'https://raw.githubusercontent.com/ETdoFresh/kenney.nl/{REV}/kenney_{pack}/Audio/{name}.ogg';src=pathlib.Path(tmp)/'source.ogg'
  src.write_bytes(urllib.request.urlopen(source,timeout=30).read());id='kenney-audio-'+name.lower().replace('_','-');dest=OUT/'files/audio'/f'{id}.wav'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-ac','1','-ar','22050','-c:a','pcm_s16le',str(dest)],check=True)
  with wave.open(str(dest)) as wav:duration=wav.getnframes()/wav.getframerate()
  if not 0<duration<20:raise ValueError('Unexpected effect duration')
  sha=hashlib.sha256(dest.read_bytes()).hexdigest()
  cat['entries'].append(dict(id=id,name=label,nameDa=da,category='sound',collection='kenney-audio',author='Kenney',source=f'https://github.com/ETdoFresh/kenney.nl/tree/{REV}/kenney_{pack}',license='CC0-1.0',licenseUrl=f'https://github.com/ETdoFresh/kenney.nl/blob/{REV}/kenney_{pack}/License.txt',sourceAudio=source,icon=icon,duration=round(duration,6),keywords=label+' '+da+' audio lyd effekt sound effect',assets=[dict(id=id,url=f'https://forge.xn--mns-ula.dk/assets/animus/files/audio/{id}.wav',mime='audio/wav',sha256=sha)]))
(OUT/'catalog.json').write_text(json.dumps(cat,ensure_ascii=False,indent=2)+'\n');print('Prepared',len(SOUNDS),'individual audio effects')
