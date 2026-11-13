# HUWiki Forge – fælles pluginstandard

**Status:** beslutning 13. november 2026. Fremadrettet standard for nye HUWiki-plugins og for plugins under migration. Dette dokument ændrer ikke automatisk licensen på allerede offentliggjort kode.

## Forbillede

Eric L. Shulmans [TiddlyTools Time](https://tiddlytools.com/timer.html) beskriver for hver komponent installation, brug, **Requires**, **Optional**, opsætning og eksempler. Den eksisterende **HUWiki Tid 0.1.2** er en god lokal reference: Den har `readme`, `original-documentation`, `license`, `provenance` og `Ændringer`-tiddlere samt ophavsmetadata.

Vi genbruger formen og grundigheden — ikke andres kildekode eller hjemmesideindhold.

## Pluginets opbygning

```
plugins/<slug>/
  README.md          # Brugsvejledning, krævede og valgfrie afhængigheder, eksempler
  LICENSE.md         # Konkret licens, originalforfatter og tredjepartskreditering
  CHANGELOG.md       # Versionshistorik og migrationsnoter
  provenance.json    # Ophav, kilder, bearbejdninger og dokumentation
  src/               # Vedligeholdelige tiddler- og JS/CSS-kilder
  dist/plugin.json   # Selvstændigt installerbar TiddlyWiki-pluginpakke
```

Installerbar `plugin.json` skal have felter:

- `title: $:/plugins/huwiki/<slug>`, `name` og `description`
- `author`, `version`, `core-version`, `source` og `license`
- `plugin-type: plugin` og `type: application/json`
- `text` med JSON-objektet `{"tiddlers": {...}}`

Bundlet skal desuden have interne hjælpetiddlere i sit eget navnerum:

- `$:/plugins/huwiki/<slug>/readme`: vejledning direkte i wikien
- `$:/plugins/huwiki/<slug>/license`: ophav og licensvilkår
- `$:/plugins/huwiki/<slug>/changes`: versioner og ændringer
- `$:/plugins/huwiki/<slug>/examples`: når relevante eksempler er nyttige
- `$:/plugins/huwiki/<slug>/provenance`: ved afledt kode; bevar original kilde, forfatter og ændringsnoter

README beskriver: **formål, installation, Requires, Optional, brug, konfiguration, eksempler, begrænsninger, opdatering, ændringer, ophav/licens og kildekode**. Ved importerbare underdele skal tiddlernavne, afhængigheder og installation kunne forstås hver for sig.

## Licens og ophav

**Nye, originale HUWiki-plugins:** Ønsket delingsmodel inspireret af TiddlyTools er **CC BY-NC-SA 4.0** med kreditering, ikke-kommerciel brug og deling af bearbejdninger på samme vilkår, hvor HUWiki ejer rettighederne og vælger denne licens. Se [Creative Commons](https://creativecommons.org/licenses/by-nc-sa/4.0/). Ikke-kommerciel begrænsning betyder, at denne licens **ikke** er en OSI-godkendt open-source-kodelicens.

**Eksisterende plugins og afledninger:** De beholder den licens, de faktisk er udgivet under, indtil oprindelse og rettigheder er gennemgået. Et plugin udgivet som MIT kan ikke bare få alle andres bidrag og eksisterende kopier omdøbt til CC BY-NC-SA. Bevar oprindelige MIT- eller øvrige licensnoter, originaldokumentation og kildehenvisninger. Ved TiddlyTools-afledninger skal `original-author`, `original-source`, `derived-from` og ændringshistorik videreføres; det er ikke vores egen originale kode.

## Sprog og teknisk kvalitet

- Generelle værktøjer skal følge TiddlyWikis `$:/language`: dansk og engelsk i brugerflade, caption, description, tooltip og readme.
- Ingen afhængighed af Google Apps Script eller en bestemt HUWiki Edition for grundfunktionerne.
- Brug TiddlyWikis eksisterende saver frem for ny gemmemotor.
- API-nøgler og private forbindelser må ikke gemmes i tiddlere eller eksport-HTML.
- Reelle *Requires* og *Optional* angives i metadata/readme. ABC/Musik må ikke være skjulte krav for PDF/Site-publishing.

## Releasekontrol

1. Kontrollér installation i en almindelig, kompatibel TiddlyWiki (uden anden Edition).
2. Kontrollér version, ophav, source, license, readme, changes, eksempel og afhængigheder.
3. Test sprogomskiftning i både toolbar-beskrivelser og selve vinduet.
4. Test opgradering/afinstallation uden at overskrive almindelige brugertiddlere.
5. Test download og deling som **adskilte handlinger** på Mac og iPad.
6. Kontrollér at licenser og ophavsoplysninger følger med i bundlet, og at ingen secrets følger med.

## Indfasning

1. SitePublisher og PDF Publisher først (bevar deres gældende MIT-vilkår, mens struktur og dokumentation standardiseres).
2. HUPedia, Trim, Musik, ABC, AI og øvrige originalpakker.
3. HUWiki Kalender og Tid: særligt fokus på at bevare Erics originale licens, dokumentation, kilde og tydelige bearbejdelsesoplysninger.

Pluginstandarden er en projektpolitik, ikke en automatisk ændring af repositoryets eller gamle pluginversioners ophavsret.
