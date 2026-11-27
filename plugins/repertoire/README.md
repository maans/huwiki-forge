# HUWiki Repertoire · første udviklingsversion

A TiddlyWiki 5 repertoire plugin. ABC Music is installed automatically as its shared notation and print engine. Scores remain in their original tiddlers.

## Cue sheets and parts / Stiknoder og stemmer

Open **Cue sheets and parts** from the Repertoire sidebar, workshop or tune book print menu. The current set list is selected automatically. Choose an excerpt, full piece or named sections; select voices, transposing instruments and chord symbols, then use **Print / PDF**. Set-list key, tempo and playing instructions are applied without changing the original score.

Åbn **Stiknoder og stemmer** fra Repertoire-fanen, værkstedet eller nodebogens udskriftsmenu. Den aktuelle sætliste følger med. Vælg udsnit, hele numre eller formdele, stemmer, instrument og becifringer, og brug **Udskriv / PDF**. Toneart, tempo og spilleaftaler følger sætlisten uden at ændre originalnoderne.

## Struktur

1. **Musikbibliotek**: Originale musik-tiddlers (ABC, billeder eller tekst). Eksisterende kilde ændres ikke ved import.
2. **Orkester** (`repertoire-kind: orchestra`): Hvert orkester har sit eget repertoire.
3. **Repertoirepost** (`orchestra-item`): Henviser til én original tiddler med felterne `orchestra-title`, `music-title`, `repertoire-key`, `repertoire-tempo` og `repertoire-form`.
4. **Sætliste** (`setlist`): Henviser til repertoireposter gennem TiddlyWikis almindelige `list`-felt. `repertoire-overrides` er JSON med sætliste-specifikke aftaler.

Én melodi kan indgå i mange orkestres repertoirer og mange sætlister. ABC, scans og PDF kildefiler bliver ikke kopieret.

## Prøv i SilbaÄtno

Åbn `SilbaÄtno Repertoire – Oversigt` i den **redigerbare** udgave på Forge. Vælg **Åbn nodebogen** direkte fra forsiden, eller åbn **Repertoireværkstedet** for at redigere orkester og sætlister.

Testdata omfatter SilbaÄtno som orkester, 17 repertoireposter og en øvesætliste i partiturernes oprindelige rækkefølge. De 17 ABC-scores ligger fortsat i `tiddlers/repertoire.json`.

I værkstedet kan du:

- oprette flere orkestre og sætlister;
- kopiere og indsætte titellister (én titel pr. linje);
- føje eksisterende ABC-numre fra biblioteket til et orkester;
- vælge musiknumre, ændre sætlisten og flytte numre med op/ned-knapper, også på iPad;
- gemme toneart, tempo og formaftaler **enten i den aktuelle sætliste eller for orkestret generelt**;
- åbne originalnoderne i TiddlyWikis almindelige ABC-visning.

## Nodebogen på iPad

- **Én eller to nodesider:** Automatisk én side i stående og to sider i liggende format (hvis der er plads); kan også vælges manuelt.
- **Bladring:** Den aktive sætliste styrer rækkefølgen. På sidste nodeside går næste-knappen videre til næste nummer. Den eksisterende ABC-sidepult står for sidenavigation, SVG og afspilning.
- **Nummerpanel:** **☷ Nummerliste** viser et kompakt søgbart sidepanel med numrene i den aktive sætliste. Det dækker noderne midlertidigt i stedet for at skubbe dem ned.
- **Øvetilstand / Music Minus One:** Vælg en **noteret stemme** under Spil selv for at aktivere øvetilstanden og dæmpe stemmen. Fluebenet kan slå øveblandingen fra og gendanne den almindelige lyd. Metronomen kan bruges, mens ABC's eksisterende note- og sidefølge fortsætter. Øveblandingen ændrer kun de aktive GainNodes og bliver ikke gemt i originalnoder eller orkestrets aftaler. De allerede eksisterende ABC-lydkontroller bruges – ingen ny lydmotor.
- **Fuldskærm:** Brug ⛶ Fuldskærm til koncentreret spil. Kun det aktuelle nummer indlæses i notationswidget'en.

## Sætlister, originale tempi og sortering

Repertoireværkstedet viser en responsiv oversigt og et kompakt redigeringsområde: **rækkefølge** og **aftaler for valgt nummer** side om side på brede skærme.

- Original toneart og tempo hentes fra ABC-partiturets `K:` og `Q:` i musikbiblioteket. Eksempelvis angives `Q:1/2=70` som 70 halve noder pr. minut, ikke 70 fjerdedele.
- En ændret toneart eller et nyt tempo kan gemmes **kun i den aktuelle sætliste** eller **som orkestrets standard**. Uændrede værdier henviser fortsat til originalen, i stedet for at kopiere standarden ind i alle sætlister.
- Listen kan sorteres ved at trække i grebet på Mac, iPad og touchskærme. På tastatur markeres grebet med Tab og flyttes med pil op/ned. Udseendet følger TiddlyWikis StoryView/dragmarkering, men den eksisterende liste omarrangeres uden fuld genopbygning. Listen har sin egen rulning; når man trækker ved kanten, ruller kun nummerlisten – ikke hele wikiens vindue.
- Klik på titlen i rækkefølgelisten for at ændre sangens aftaler. Fjern-knappen (×) fjerner kun sangen fra sætlisten, ikke fra musikbiblioteket.

**Nodebog:** Tonearts- og tempoaftaler anvendes nu på en midlertidig ABC-version under visning og afspilning. Det transponerer melodistemmer og becifringer samt ændrer Q-tempo uden at skrive til de originale tiddlers. Relative dur/mol-signaturer respekteres: `K:F` og `K:Dm` deler fortegn. Ved ikke-understøttede ABC-tonearter vises en kort fejl.

## Bevidste afgrænsninger i denne version

- Nodebogen bruger sætlisteaftalen ved visning og afspilning. Åbning af originaltiddleren viser stadig dens oprindelige ABC-kode.
- Nodebogen er bygget, men finger-preview af nummer-dots, bogmærker og automatiske skift efter afspilning er endnu ikke implementeret.
- Nodebogen bruger nu PDF Publisher og SitePublisher direkte. PDF Publisher kan dele en rigtig PDF via iPad/Quines delingsmenu, uden at åbne `blob:` som en URL. C, B♭, E♭ sopranino og E♭ altsaxofon er separate notationsvalg. Form og instrumentering står på repertoireoversigten foran nodearkene.
- PDF- og SitePublisher-eksport bruger stadig de originale node-tiddlers; sætliste-transponering af eksporterede noder kommer separat. Scannede nodebilleder kan ikke transponeres automatisk.
- Rækkefølgen kan ændres med trækgreb på touch/mus eller pil op/ned fra tastatur. Nummerpanelet er fortsat søgbart.
- SilbaÄtno-demoen er en prøve på pluginet, ikke en færdig Repertoire Edition. Originale 17 konverterede partiturer skal fortsat kontrolleres mod MuseScore-kilder.

Test: `node --test tests/repertoire-edition.test.mjs`. Browser-accept: `node scripts/repertoire-browser-smoke.mjs` efter opbygning af den redigerbare wiki. Hele Forge-testpakken: `npm test`.

## Udgivelse 0.1.4-beta.3

- SitePublisher viser musiknumrenes korte titler og et klikbart repertoireindeks. Musikerne kan bruge Tilbage til repertoire, forrige/næste nummer, tastatur, iPad-swipe og den eksisterende ABC-nodepults bladvending. Aftalerne følger nummeret uden at ændre originalnoderne.
- PDF Publisher placerer aftalerne under sidste nodesystem, når der er plads. Hvis pladsen ikke rækker, får aftalerne deres egen side. Indholdsfortegnelsen bruger korte titler, og det valgte C/B♭/E♭-instrument er stadig angivet på PDF-forsiden.
- iPad/Quine anvender fortsat Del / udskriv PDF som native fildeling, aldrig navigation til `blob:`.

