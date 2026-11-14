# CutOut: afgrænset offlineudgave

Kilden er `$:/plugins/huwiki/cutout` 0.6.2 fra `HU_CUTOUT_ASSET_01_000_` i den indsendte OAuthLab-backup. Den oprindelige README beskriver udtrykkeligt CutOut som selvstændigt: PasteUp, Slideshow, Theatre og Excalidraw er valgfrie. Forge-testudgaven 0.6.2-test.1 bruger dette selvstændige animationsværksted; den er ikke en påstand om at hele OAuthLab Editionen er migreret.

## Bevarede dele

Motor, projektmodel, ur, afspiller, eksportmotor, tændstikmandsdukke/-animation og JSZip er bevaret. De fire arbejdsrum er dukke, animation, scene og teater. Den oprindelige sprogordbog følger `$:/language`; den ekstra CutOut-sprogvælger er fjernet. Der følger officielt dansk sprogplugin, fælles F-link og begge eksisterende biblioteksindgange med.

Google-serveradapteren er erstattet med faktisk lokal ZIP-eksport. Online-publiceringsknappen er fjernet, og Slideshow tilbydes ikke i denne udgaves eksportvalg. Tegneknapper vises kun, hvis den særskilte CutOut-Excalidraw-bro faktisk findes. Motoren kan stadig importere billeddele uden tegnebroen. Ingen tomme erstatningsknapper eller obligatorisk Google-login.

## Kilde og licenser

Det originale komprimerede bundle ligger i `migration/cutout/original-plugin.b64`. `provenance.json` indeholder originalfilens og hele zip-arkivets SHA-256. `scripts/build-cutout.mjs` genskaber den tilpassede pakke og kan kontrollere den med `--check`.

Originalt ophav er HUWiki. Originalpakken angiver ingen samlet licens; Forge tildeler den ikke stiltiende MIT. Denne mangel er dokumenteret i pakkens NOTICE og Provenance-tiddler. Den indlejrede JSZip-licens er uændret og findes både i pluginet og `plugins/cutout/licenses/JSZip.txt`.

## Afprøvning og afgrænsning

Den automatiserede browserprøve starter en lokal wiki med alle netkald blokeret, åbner dukke-/animationsværkstedet, afspiller, ændrer et nøglebillede, gemmer projektet, skifter dansk/engelsk via kontrolpanelet, eksporterer ZIP, åbner den eksporterede visnings-HTML og gemmer/genåbner den redigerbare wiki med den native saver. Unit-tests sammenligner de bevarede originaldele og undersøger, at den kørbare kode ikke har Google-kald.

Den fulde eksempelsamling, oprindelig Excalidraw 0.3.4-bro, PasteUp/Slideshow-integration, alle scene-/teaterforløb og mobil/touch er endnu ikke accepteret. De er ikke med som lovede funktioner i Forge-kortet. Den simple afspiller og animationsredigering er det konkret afprøvede grundlag.
