# HUWiki Repertoire · første udviklingsversion

Et selvstændigt TiddlyWiki 5-plugin, som fungerer uden ABC-plugin og udnytter ABC, når de eksisterende noder åbnes.

## Struktur

1. **Musikbibliotek**: Originale musik-tiddlers (ABC, billeder eller tekst). Eksisterende kilde ændres ikke ved import.
2. **Orkester** (`repertoire-kind: orchestra`): Hvert orkester har sit eget repertoire.
3. **Repertoirepost** (`orchestra-item`): Henviser til én original tiddler med felterne `orchestra-title`, `music-title`, `repertoire-key`, `repertoire-tempo` og `repertoire-form`.
4. **Sætliste** (`setlist`): Henviser til repertoireposter gennem TiddlyWikis almindelige `list`-felt. `repertoire-overrides` er JSON med sætliste-specifikke aftaler.

Én melodi kan indgå i mange orkestres repertoirer og mange sætlister. ABC, scans og PDF kildefiler bliver ikke kopieret.

## Prøv i SilbaÄtno

Åbn `SilbaÄtno Repertoire – Oversigt` i den **redigerbare** udgave på Forge. Vælg **Åbn repertoireværksted**.

Testdata omfatter SilbaÄtno som orkester, 17 repertoireposter og en øvesætliste i partiturernes oprindelige rækkefølge. De 17 ABC-scores ligger fortsat i `tiddlers/repertoire.json`.

I værkstedet kan du:

- oprette flere orkestre og sætlister;
- kopiere og indsætte titellister (én titel pr. linje);
- føje eksisterende ABC-numre fra biblioteket til et orkester;
- vælge musiknumre, ændre sætlisten og flytte numre med op/ned-knapper, også på iPad;
- gemme toneart, tempo og formaftaler **enten i den aktuelle sætliste eller for orkestret generelt**;
- åbne originalnoderne i TiddlyWikis almindelige ABC-visning.

## Bevidste afgrænsninger i denne version

- Forhandling af toneart i værkstedet opdaterer aftalefelterne. Automatisk transponering af det viste ABC-partitur implementeres senere og må ikke forveksles med den lagrede aftale.
- Noderne åbnes i eksisterende ABC-visning. Der er endnu ikke én samlet fuldskærms-nodebog med finger-preview af alle numre.
- PDF med klikbart indeks og blandede scannede sider er ikke bygget endnu.
- Automatisk sortering og egentlig drag-and-drop mellem repertoireposter afventer næste iteration; op/ned-knapper virker også ved touch.
- SilbaÄtno-demoen er en prøve på pluginet, ikke en færdig Repertoire Edition. Originale 17 konverterede partiturer skal fortsat kontrolleres mod MuseScore-kilder.

Test: `node --test tests/repertoire-edition.test.mjs`. Hele Forge-testpakken: `npm test`.
