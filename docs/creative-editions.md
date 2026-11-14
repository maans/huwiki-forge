# CutOut og Slideshow: oprindelige værktøjer uden Google-tvang

## Omfang

CutOut 0.6.2-test.2 samler de fire oprindelige arbejdsrum, hele den gendannede eksempelsamling, Excalidraw 0.3.4 med redigerbare billedkilder, PasteUp, Theatre og Slideshow. Slideshow 0.8.39-test.1 er også en selvstændig Edition med syv originale eksempelpræsentationer. Begge bruger de eksisterende biblioteker og F-linket til Forge.

Slideshow bevarer oprettelse fra tiddlere, tags, StoryList og lister, rækkefølge, talernoter, PasteUp-layouts og interaktive klikmål. Eksport omfatter PDF, redigerbare præsentationspakker, selvstændige interaktive HTML-sites og ZIP med hele den redigerbare wiki. Native gem/genåbn fungerer fortsat.

Google-serverkald er erstattet af lokale filer. Bibliotekerne, inklusive PDF.js, jsPDF, html2canvas og JSZip, ligger indlejret. Der kræves ikke konto, CDN eller Google ved opstart og almindeligt arbejde.

## Dokumentimport

| Format | Lokal læsning i browseren | Visuelt sidetro alternativ |
| --- | --- | --- |
| PDF | Tekst pr. side eller indlejrede sidebilleder | Indbygget PDF-rendering |
| TXT, Markdown | Redigerbar tekst, opdeling ved overskrifter/skillelinjer | Eksportér PDF i dit tekstprogram |
| HTML | Tekst, overskrifter og sikre links; aktivt indhold fjernes | Valgfri lokal LibreOffice |
| DOCX | Overskrifter, fed/kursiv, links, enkle lister/tabeller | Valgfri lokal LibreOffice eller eksportér PDF |
| PPTX | Slidetekst i præsentationens relationsrækkefølge | Valgfri lokal LibreOffice eller eksportér PDF |
| ODT, ODP | Tekst, afsnit og slides | Valgfri lokal LibreOffice eller eksportér PDF |
| DOC, PPT, RTF | Valgfri lokal LibreOffice → PDF-tekst | Valgfri lokal LibreOffice → sidebilleder |
| HUWiki Slideshow JSON | Bevarer slides, noter, layoutreferencer og tilknyttet indhold | Ikke relevant |

Se [den valgfrie hjælper](../tools/slideshow-converter/README.md). Office-animationer og talernoter overføres ikke via PDF; automatisk OCR er ikke inkluderet. Kontroller skrifter og sideskift efter LibreOffice. PDF-tekst læses sidevis; dokumentets opdelingsvalg gælder de lokale Word/OpenDocument/HTML-læsere. Eksterne medier skal indlejres før en komplet lokal pakke kan eksporteres.

## Publicering og databevaring

Interaktive sites kan hentes som ZIP. I browsere med mappeadgang kan man desuden vælge sin egen udgivelsesmappe og oprette/opdatere et site. Opdatering bevarer `previous.html`. En markør forbinder mappen med præsentationen; ukendte mapper og ændrede udgivelser afvises. Sletning afvises, hvis mappen indeholder andre filer. Kun brugerens egne eksplicitte mappevalg giver adgang; mappehåndtag gemmes ikke i wikien.

At gemme i mappen uploader ikke noget til en webserver og ændrer ikke adgangsrettigheder. Hosting og læseradgang håndteres af brugerens valgte server. CutOut genbruger samme mappeværktøj. Tidligere Google-læserlister er ikke et adgangskontrolsystem i lokale HTML-filer.

## Dansk og engelsk

UI følger TiddlyWikis `$:/language`. Der er ingen ekstra sprogvælger. CutOuts oprindelige ordbog og oversatte eksempelsider er bevaret. Slideshow har lokaliserede værkstedsdialoger, import/eksport, forside og native knapper. PasteUps visning og redigeringsmakroer vælger deres lokale UI-kilde gennem samme sprogvalg. Tiddlertitler, objekt-id'er, brugerindhold og originale illustrative danske tekster oversættes ikke automatisk.

## Kilder og licenser

[Bevarede kilder og kontrolsummer](../migration/creative/README.md). PasteUp beholder CC BY-NC-SA 4.0 og Eric L. Shulmans ophav. Tegne-motor og React beholder deres licenser, og Slideshow-vendors er uændrede. Manglende top-level-licens i original HUWiki-kode er dokumenteret, ikke udfyldt med en antagelse.

Den fælles Excalidraw-pakke er opdateret fra den tidligere midlertidige offentlige 0.3.0 til den gendannede HUWiki 0.3.4. CutOut kræver denne ABI; Tegnes eksisterende SVG-eksport er bevaret og browsertestet. Det gamle import-workflow kan ikke længere nedgradere motoren.

## Accept og udeståender

`scripts/cutout-browser-smoke.mjs` afprøver faktisk tegning i Excalidraw, gemt redigerbar kilde og SVG, nøglebilleder, indlejret scene, kameraforestilling, lokal eksport og native gem/genåbn. `scripts/slideshow-browser-smoke.mjs` afprøver alle syv originale fortællinger, tastaturnavigation, oprettelse/rækkefølge/noter, sprogskift med bevaret importvalg, lokale dokumentformater, faktiske eksportfiler, beskyttet mappeopdatering/sletning og gem/genåbn. Mappevælgeren erstattes i testen; filoperationerne bruger Chromes rigtige FileSystemDirectoryHandle i browserlageret. Automatisk test kan ikke klikke operativsystemets mappevælger.

LibreOffice har lokalt produceret en rigtig PDF fra et dokument. CI kontrollerer hjælperens adgangskode, lokale adresse og inputgrænser, men installerer ikke LibreOffice. Mac Chrome er afprøvet; Safari, Firefox, iPad og touch er endnu ikke accepteret. Derfor er begge Editions tydeligt testudgaver. Ingen påstand om udgivelse eller live Pages-verifikation følger alene af, at lokale tests består.
