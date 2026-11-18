# Silba Etno Repertoire (work in progress)

Klargøring af selvstændig TiddlyWiki Musik Edition baseret på Henriks sætliste 5. november 2026. Branch: `feat/silva-ethno-repertoire-20261118`.

**Vigtigt:** Disse filer er kun en verificeret liste og kildemapping. MuseScore-partiturer, ABC og afspilning er ikke tilføjet endnu. Dette er ikke en færdig eller publiceret wiki og indgår ikke i Forge-kataloget.

## Status

- 14 numre i hovedlisten (13 med identificeret MSCZ, 1 uden)
- 2 usikre (1 med identificeret MSCZ, 1 uden)
- 5 foreløbigt ude (3 med identificeret MSCZ, 2 uden)
- **17 af 21** med senest identificerede MuseScore-vedhæftning.
- Ikke fundet: Oh verden; Hjul og Stejle nr. 6; Dance Me to the End of Love; Lulu Swing.

Datoerne i `songs.json` er maildatoer, ikke verificerede kompositionsrevisioner. Nogle Ebbes versioner er gamle og kan være erstattet uden for e-mail. `Mita, Barfly` antages at være `Mita Bekrijo`; identificér inden import.

## Næste trin

1. Hent hver seneste relevante MSCZ fra brugerens personlige Gmail, med kildeversioner bevaret.
2. Konvertér med Forge-pluginet MuseScore → ABC; kontrollér preview og rettelser. Kontrollér især mulige transponerede dobbeltpartier og skæve taktarter.
3. Gem redigerbare ABC-tiddlere i `tiddlers/`, med kilde- og ordensmetadata.
4. Test score-afspilning, nodegrafik, instrumentskift og den brugerbesluttede koncertsekvens; Henrik angiver max 12 numre på 45 minutter, og listen med 14 er ikke endelig.
5. Afklar udgivelsesrettigheder for beskyttede kompositioner og arrangementer; offentliggør ikke score eller download uden lovligt grundlag.
6. Publicér først derefter Edition og Site på GitHub/Forge.

Originale e-mails eller private kontaktoplysninger er ikke lagt i dette offentligt læsbare repository.

## Fast importregel: alle stemmer

Ved **hver eneste** MuseScore → ABC-konvertering vælges **alle nodesystemer og alle stemmer** fra originalfilen, også stemme 2 og eventuelle akkord-/akkompagnementsstemmer. Ingen automatisk beskæring til den første stemme, ingen grænse som `slice(0, 6)` og ingen udelukkelse udelukkende på grundlag af `count == 0`, da akkordsymboler kan ligge i en separat stemme. Der skal være en `V:`-definition for hver kilde-stemme (hvis kilden har flere stemmer), og alle akkordsymboler skal kontrolleres i det samlede ABC-resultat. Undgå at importeren vælger sin normale standard, hvor kun første stemme er afkrydset. Bevar instrumentnavne, transponering, dynamik hvor mulig, gentagelser og stemmesynkronisering. Sammenlign med originalen og gem eventuelle tab/konverteringsadvarsler.

## Eksport til én HTML — brug kun den eksisterende SitePublisher

**Ingen ny Site-generator, intet nyt afspilningssystem og ingen specialbygget eksport.** Byg først den redigerbare Musik Edition-wiki med ABC-nodeark og eksisterende ABC/Musik-afspilning. Når noder, alle stemmer, instrumenter, becifringer og playback er kontrolleret, anvendes wikiens **allerede indbyggede SitePublisher** til at vælge alle repertoiretiddlere og lægge dem i Henriks rækkefølge. SitePublisher har allerede valgene `Alle med tag` og `Liste i en tiddler`, mulighed for omarrangering og `Hent HTML`, som producerer én selvstændig HTML-fil. Brug wikiens eksisterende Sitevisning/Del-funktioner uden særskilt kode.

**Ønsket GitHub-layout:** redigerbar demo-wiki `index.html` og SitePublisher-genereret afspilningsfil `site/index.html` under samme repertoiremappe. Begge skal hedde **Silba Etno Repertoire** i deres synlige titler. Tilføj et fungerende relativt link fra wiki til `./site/index.html` **først efter** SitePublisher-eksporten er gennemført og filen findes. GitHub Pages giver derefter et delbart HTTPS-link, når dette er verificeret. Bevar én HTML-fil til alle numre i sitevisningen.

**Lyd:** Akkompagnement slået til for alle arrangementer. Har en noteret stemme 2 basnøgle, vælg stemme 2 som basskilde i mixerens `Bas fra`-valg (`bassSource: \"voice:1\"`, da indeks er nulbaseret). Dette skal erstatte den genererede stilartsbas, mens øvrigt akkompagnement fortsætter. Ellers behold `bassSource: \"style\"` så stilartsbas virker. Alle originale nodesystemer og stemmer importeres altid. Disse indstillinger sættes **pr. partitur**, ikke globalt for alle numre.

**Aktuel virkelighed:** Kilder til 17 numre er matchet, men ABC-konvertering, verificeret afspilning, SitePublisher-eksport, wikiens HTML-build og GitHub Pages-udgivelse er endnu ikke fuldført. Ingen links til en ikke-eksisterende eksport skal vises som om de er aktive.
