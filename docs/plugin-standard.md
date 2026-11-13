# HUWiki Forge – Studio som fælles pluginmotor

**Kilde og status:** Denne arkitektur bygger på den eksisterende HUWiki Studio-kode i `Studio.js`, `StudioCommunity.js`, `StudioHub.js` og `Code.js` fra OAuthLab-backuppen. Den erstatter den tidligere skitse om en konkurrerende Forge-pluginstandard. Den tidligere gennemgang af TiddlyTools-licenser gælder fortsat.

## Hvad Studio allerede gør

- Bygger rigtige TiddlyWiki 5-plugin- og temapakker med identitet `$:/plugins/<author>/<id>` eller `$:/themes/<author>/<id>`; kilde-tiddlerne samles i pakkens `text` som JSON `{tiddlers: ...}`.
- Håndhæver udvikler-id og plugin-id, pakkeidentitet, versionsformat `x.y.z`, uændret identitet ved opdatering, automatisk patch-version ved ændret kode og undgår at overskrive eksisterende pakker.
- Gemmer `name`, `description`, `author`, `version`, `plugin-type`, `type`, `studio-category`, `studio-tags` og `studio-source-titles` samt oprindelseswiki-id; Studio kan samle temaer og paletter.
- Udelukker visse synkroniseringsfelter og Drive-referencer i pakkede tiddlere; begrænser pakkestørrelsen; skiller oprettelse og udgivelse ad.
- Udgiver selvstændige pakker via Community-hubben; snapshots er versionssatte og adskilt fra kilde-wikien, og afpublicering sletter ikke brugernes installerede kopier.
- Eksisterende pluginbibliotek har allerede udtræk af readme og beregning af, om genindlæsning kræves (`wikiPluginLibraryReadme_`, `wikiPluginLibraryRequiresReload_`).

**Vigtigt:** Studions nuværende save-funktion *kræver ikke* særskilte licens-, README- og changelogfiler eller interne dokumentationstiddlere. Vi må derfor ikke hævde, at dette allerede er automatisk håndhævet. I Forge skal eventuelle forbedringer føjes til Studio-logikken og dens genererede pakke/metadata – ikke implementeres som en parallel motor.

## Struktur i Forge

En Forge-pluginpakke er fortsat et installerbart TiddlyWiki-pluginbundle i `plugins/<id>/dist/plugin.json`. De læsbare kildefiler og eventuelle `README.md`, `CHANGELOG.md` og licensfiler er et supplement til **Studios eksisterende metadata**, når vi vedligeholder kode på GitHub. De er ikke en ny uafhængig pakkestandard eller et krav om, at hver tiddler skal have flere kopier.

Ved selvudviklede plugins vil vi gerne bevare TiddlyTools' overskuelige dokumentation *inde i pluginet*, fx en `readme`-tiddler med formål, installation, eksempler, konfiguration, nødvendige/valgfrie afhængigheder, historik og ophav. Den præcise placering/automatiske generering besluttes i en videreudvikling af Studio, så samme data kun vedligeholdes ét sted.

## Licenser og ophav

HUWiki Tid viser en gennemarbejdet TiddlyTools-afledning med `license: CC-BY-NC-SA-4.0`, originalforfatter, original kilde, afledt fra, original dokumentation og særskilte ændringsnoter. Denne dokumentations- og krediteringspraksis er forbilledet for *formen*.

- Eric L. Shulmans eksisterende TiddlyTools-vilkår og enhver anden tredjepartskildes faktiske licens videreføres uændret. Ændrede afledninger skal tydeligt kunne spores til originalen.
- Nye originale HUWiki-plugins kan få en tilsvarende ikke-kommerciel Creative Commons-licens, når rettighedshaverne udtrykkeligt vælger det. Det er **ikke** besluttet for alle eksisterende komponenter.
- Allerede udgivne komponenter med MIT-licens (fx SitePublisher og PDF Publisher) beholder deres MIT-licens; hverken dokumentet eller Studio ændrer tidligere udgivne kopiers licens.
- CC BY-NC-SA 4.0 er ikke en OSI-godkendt open-source-kodelicens. Forskel mellem kodelicens og dokumentationslicens skal være tydelig.

## Sprog

TiddlyWikis indbyggede `$:/language` er den **eneste sprogvælger**. Alle generelle HUWiki-plugins skal reagere på den, herunder captions, beskrivelser, værktøjstip, hjælpetekster og vinduer. **Ingen ekstra sprogvælgerknapper** i plugins eller Forge-forsiden. Egne Editions kan stadig indeholde brugerindhold på et bestemt sprog; det er en anden sag end grænsefladens sprog.

## Andre kvalitetskrav

- Ingen obligatorisk Google Apps Script-, Drive-, Forms- eller Sheets-afhængighed i Editions.
- Ingen API-nøgler i tiddlere, gemt HTML, pluginbundles eller debug-logs.
- TiddlyWikis egen saver bruges til den redigerbare single-file wiki.
- Publisher-plugins skal kunne fungere uden ABC; musikfunktioner er valgfrie.
- Mac: **Hent** og **Del** skal være adskilte handlinger, ikke én knap der skjuler en automatisk delingsmenu.

## Næste skridt

Vi bruger Studios eksisterende builder og community-metadatamodel som udgangspunkt, dokumenterer præcis hvad der mangler (eksempelvis obligatorisk ophav/readme), og udvider kun samme kodevej. Vi migrerer fortsat plugins ét ad gangen og tester sprog, installérbarhed, eksport og kompatibilitet.
