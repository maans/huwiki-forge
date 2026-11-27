"""Merge reviewed recording metadata into existing repertoire originals."""
import json,re,unicodedata,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'research/videos/recordings.json').read_text())
ONLY=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
FIELDS=('repertoire-youtube','repertoire-youtube-title','repertoire-youtube-match','repertoire-youtube-note','repertoire-youtube-source','repertoire-youtube-start','repertoire-youtube-curated')
def key(title):
    title=str(title).split(' · ')[0]
    title=re.sub(r'\s*\([^)]*\)\s*$','',title)
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',title).encode('ascii','ignore').decode().lower())
def collection(path):
    relative=path.relative_to(ROOT).parts
    if relative[0]=='wiki':
        return {'birdland':'birdland','bjarke':'birdland','helles':'helles','silba':'silba','akustisk':'akustisk'}.get(relative[1])
    return {'silba-atno-repertoire':'silba','akustisk-elektrisk-repertoire':'akustisk'}.get(relative[1]) if relative[0]=='editions' else None
def merge(rows,group):
    matches={key(r['title']):r for r in DATA['records'] if r['collection']==group}
    changed=0
    for row in rows:
        if row.get('repertoire-work-title') or row.get('repertoire-kind') in ('orchestra-item','setlist','orchestra'):continue
        if row.get('repertoire-kind')!='piece' and not row.get('abc-source'):continue
        if group in ('silba','akustisk') and row.get('abc-source') and row.get('type','text/vnd.tiddlywiki')=='text/vnd.tiddlywiki' and not re.search(r'<\$huwiki-(?:abc|repertoire-piece|repertoire-book)\b',row.get('text','')):
            original=row.get('text','')
            practice='<details class="huwrep-practice-notes"><summary>Øvestatus og noter</summary>\n\n<label>Status <$select field="musik-status"><option>Ny</option><option>Øver</option><option>Kan selv</option><option>Klar til undervisning</option></$select></label>\n\n<label>Mit øvemål <$edit-text field="musik-mål" tag="input"/></label>\n\n</details>'
            row['text']='<$huwiki-repertoire-piece tiddler=<<currentTiddler>>/>\n\n'+practice+'\n\n'+original
            row['music-template']='off'
            changed+=1
        record=matches.get(key(row.get('title','')))
        if not record:continue
        if row.get('repertoire-youtube-match')=='manual':continue
        if row.get('repertoire-youtube') and not row.get('repertoire-youtube-curated'):continue
        updates=dict(zip(FIELDS,('https://www.youtube.com/watch?v='+record['id'],record['label'],record['match'],record.get('note',''),record['source'],str(record.get('start',0)),'2026-11-27')))
        if any(row.get(k)!=v for k,v in updates.items()):row.update(updates);changed+=1
    return changed
def report(group):
    records=[r for r in DATA['records'] if r['collection']==group]
    pending=[r for r in DATA['missing'] if r['collection']==group]
    text=f'{len(records)} valgte videoer · {len(pending)} numre afventer identifikation.\n\nVideoerne vælges som YouTube i samme menu som noder og PDF. Ingen automatisk afspilning. Et sandsynligt bigbandarrangement er markeret som ubekræftet.\n\n'
    if pending:text+='!! Afventer\n\n'+'\n'.join('* [['+r['title']+']]: '+r['reason'] for r in pending)+'\n\n'
    text+='!! Valgte indspilninger\n\n'+'\n'.join('* [['+r['title']+']] — [[ '+r['label']+'|https://www.youtube.com/watch?v='+r['id']+']]'+(' · Arrangement ikke bekræftet' if group=='birdland' else '') for r in records)+'\n'
    return {'title':'YouTube – Videoer og kilder','type':'text/vnd.tiddlywiki','text':text,'tags':'RepertoireHjælp'}
def html(path,group):
    source=path.read_text();changed=0
    def replace(match):
        nonlocal changed
        rows=json.loads(match[2])
        if not isinstance(rows,list) or not any(r.get('repertoire-kind')=='piece' or r.get('abc-source') for r in rows):return match[0]
        changed+=merge(rows,group)
        status=report(group)
        old=next((r for r in rows if r.get('title')==status['title']),None)
        if old is None:rows.append(status);changed+=1
        elif old.get('text')!=status['text']:old['text']=status['text'];changed+=1
        return match[1]+json.dumps(rows,ensure_ascii=False).replace('<','\\u003c')+match[3]
    output=re.sub(r'(<script\b[^>]*class=["\'][^"\']*\btiddlywiki-tiddler-store\b[^"\']*["\'][^>]*>)([\s\S]*?)(</script>)',replace,source)
    if output!=source:path.write_text(output)
    return changed
if __name__=='__main__':
    total=0
    for base in ('wiki','editions'):
        if not (ROOT/base).exists():continue
        for path in (ROOT/base).rglob('index.html'):
            group=collection(path)
            if group and (not ONLY or group==ONLY):total+=html(path,group)
    for path in [ROOT/'research/helles/tiddlers.json',*list((ROOT/'editions').glob('*/tiddlers/*.json'))]:
        if not path.exists():continue
        group='helles' if path.parent==ROOT/'research/helles' else collection(path)
        if not group or ONLY and group!=ONLY:continue
        rows=json.loads(path.read_text())
        if isinstance(rows,list) and merge(rows,group):path.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    print(f'YouTube recording metadata merged: {total} additions/updates; manual choices preserved')
