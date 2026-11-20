# HUWiki Repertoire · musikbibliotek og Nodebog

Et selvstændigt TiddlyWiki 5-plugin, som fungerer uden ABC-plugin og udnytter ABC, når de eksisterende noder åbnes.

## Struktur

1. **Musikbibliotek**: Originale musik-tiddlers (ABC, billeder eller tekst). Eksisterende kilde ændres ikke ved import.
2. **Orkester** (`repertoire-kind: orchestra`): Hvert orkester har sit eget repertoire.
3. **Repertoirepost** (`orchestra-item`): Henviser til én original tiddler med felterne `orchestra-title`, `music-title`, `repertoire-key`, `repertoire-tempo` og `repertoire-form`.
4. **Sætliste** (`setlist`): Henviser til repertoireposter gennem TiddlyWikis almindelige `list`-felt. `repertoire-overrides` er JSON med sætliste-specifikke aftaler.

Én melodi kan indgå i mange orkestres repertoirer og mange sætlister. ABC, scans og PDF kildefiler bliver ikke kopieret.

## Prøv i SilbaÄtno

Åbn `SilbaÄtno Repertoire – Oversigt` i den **redigerbare** udgave på Forge. Vælg **Åbn nodebogen** direkte fra forsiden, eller åbn **Repertoireværkstedet** for at redigere orkester og sætlister.

Testdata omfatter SilbaÄtno som orkester, 17 repertoireposter og en øvesætliste i partiturernes oprindelige rækkefølge. De 17 ABC-scores ligger fortsat i `tiddlers/repertoire.json`.

Værkstedet har tre kompakte listevisninger: **Sætliste**, **Orkestrets repertoire** og **Musikbibliotek**. Orkester, aktuel sætliste og **Åbn nodebogen** står øverst. Oprettelse og titelimport er samlet under **Tilføj musik, orkester eller sætliste**.

I værkstedet kan du:

- oprette flere orkestre og sætlister;
- kopiere og indsætte titellister (én titel pr. linje);
- føje eksisterende ABC-numre fra biblioteket til et orkester;
- søge efter titel, toneart og tempo, også uden at skrive accenter;
- sortere bibliotek og repertoire efter titel, toneart, numerisk tempo eller nodetype;
- flytte numre i sætlisten med op/ned-knapper, også på iPad, eller trække rækker med musen;
- sortere selve sætlisten med en særskilt handling og fortryde sorteringen;
- gemme toneart, tempo og formaftaler **enten i den aktuelle sætliste eller for orkestret generelt**;
- åbne originalnoderne i TiddlyWikis almindelige ABC-visning.

Bibliotekets sortering ændrer kun oversigten. Sætlistens gemte rækkefølge ændres først ved en udtrykkelig flytning eller **Sortér sætlisten**. Toneart og tempo vises fra de relevante aftaler, ellers fra ABC-partiturets K:/Q:-felter. Noteret tempo sammenlignes som tal; ukendte tempi står sidst.

Klik på en titel for at åbne dens **Aftaler**. Vælg **Åbn nodebogen** for at begynde med det valgte nummer i sætlisten. Valget følger med tilbage fra Nodebogen. **Åbn originalnoder** under aftalerne giver adgang til musik, som endnu ikke er i sætlisten.

## Nodebogen på iPad

- **Én eller to nodesider:** Automatisk én side i stående og to sider i liggende format (hvis der er plads); kan også vælges manuelt.
- **Bladring:** Den aktive sætliste styrer rækkefølgen. På sidste nodeside går næste-knappen videre til næste nummer. Den eksisterende ABC-sidepult står for sidenavigation, SVG og afspilning.
- **Nummerpanel:** **☷ Nummerliste** viser et kompakt søgbart sidepanel med numrene i den aktive sætliste. Det dækker noderne midlertidigt i stedet for at skubbe dem ned.
- **Øvetilstand / Music Minus One:** Aktiver via den lille sektion under overskriften. Slå metronomen til, og vælg en **noteret stemme** som skal være lydløs, mens ABC's eksisterende note- og sidefølge fortsætter. Metronomen følger også med, hvis en anden stemme står på solo. Øveblandingen ændrer kun de aktive GainNodes og bliver ikke gemt i originalnoder eller orkestrets aftaler. Den aktuelle lydblanding gemmes ved aktivering og gendannes ved deaktivering. De allerede eksisterende ABC-lydkontroller bruges – ingen ny lydmotor.
- **Fuldskærm:** Brug ⛶ Fuldskærm til koncentreret spil. Kun det aktuelle nummer indlæses i notationswidget'en.

## Bevidste afgrænsninger i denne version

- Forhandling af toneart i værkstedet opdaterer aftalefelterne. Automatisk transponering af det viste ABC-partitur implementeres senere og må ikke forveksles med den lagrede aftale.
- Nodebogen er bygget, men finger-preview af nummer-dots, bogmærker og automatiske skift efter afspilning er endnu ikke implementeret.
- PDF med klikbart indeks og blandede scannede sider er ikke bygget endnu; enkelte scannede nodebilleder kan vises, når de er knyttet til en melodi.
- Trækning af sætlistens rækker er til mus; på iPad bruges de trykvenlige op/ned-knapper. Nummerpanelet er søgbart.
- SilbaÄtno-demoen er en prøve på pluginet, ikke en færdig Repertoire Edition. Originale 17 konverterede partiturer skal fortsat kontrolleres mod MuseScore-kilder.

Byg pluginet: `node scripts/build-repertoire.mjs`; kontrollér kilde/pakke: `node scripts/build-repertoire.mjs --check`.

Test: `node --test tests/repertoire*.test.mjs`. Browser-accept: `node scripts/repertoire-browser-smoke.mjs` efter opbygning af den redigerbare wiki. GitHub kører browserforløbet og gemmer skærmbilleder i stående og liggende format før publicering. Hele Forge-testpakken: `npm test`.
