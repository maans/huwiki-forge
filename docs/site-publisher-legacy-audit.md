# SitePublisher – genbrug OAuthLabs funktioner uden den gamle brugerflade

**Kildegennemgang: 13. november 2026.** Autoritative kilder: den vedhæftede `HUWiki-OAuthLab-backup.zip`, især `SiteWorkshop.js`, `HUPediaPublishing.js`, `HUPediaSiteAssets.js`, `CutOutSiteRuntime.js`, `MusicSite.js` og `MusicSiteTemplate.js`; nyere Musik Edition med `$:/plugins/huwiki/studio/site-builder.js` og `$:/plugins/huwiki/site-publisher`.

## Beslutning

**Bevar den nye Forges SitePublisher-panel**, herunder sammenklappelige indstillinger, indholdskilder, rækkefølge, overblik, site-forhåndsvisning, separat hent/del og touch-venlig fokusvisning. **Genindfør udgivelsesfunktionerne fra OAuthLab som små, uafhængige eksport-adaptere.** Kopiér *ikke* den gamle dialogs kompleksitet, Google Apps Script/Drive-afhængighed eller sprogknapper.

Nuværende hovedmål: Én **selvstændig HTML-fil**, der kan læses på Mac, iPad og offline. Større medietyper kan senere kræve eksplicit valg af komplet offline-pakke; der må ikke stille og roligt refereres til filer, som ikke findes hos modtageren.

## Hvad vi faktisk fandt i OAuthLab

| Funktion | Oprindelig kode | Status/overførsel |
| --- | --- | --- |
| Site-layouts | `SiteWorkshop.js`: `designCatalog` indeholder **Vanilla, Modern, Retro og HUPedia** (fire, ikke kun tre) | Skal tilbydes via **ét enkelt sitelayoutfelt** inde i de eksisterende indstillinger; automatisk standard baseret på aktivt TW-tema, alternativt standardlayout |
| Layout-udseende | `SiteWorkshop.js`: `css()`, temaernes egne stilarter og valgte navigationstyper | Genbrug relevante CSS-principper. Kopiér ikke gamle kontroller for skrifttype, farver, bredde, radius og navigation én til én |
| HUPedia | `HUPediaPublishing.js` (servergenereret snapshot) og `HUPediaSiteAssets.js` (eget site-shell og læser) | Første skridt er **0.1.11-test.1**: Genbrug HUPedias *lokale* `article-view`-tiddler og `style.css` i et selvstændigt HTML-site. Ikke afhængig af Apps Script |
| CutOut | `SiteWorkshop.js`: `siteCutoutWidgets()`, `cutoutAssets()`, `cutoutTitle()`; `CutOutSiteRuntime.js` | Skal have en dedikeret renderer, der eksporterer de anvendte data, billedafhængigheder og et **view-only runtime**. Ingen editor eller server-synk i det udgivne site |
| Tegne / SVG | `SiteWorkshop.js`: `siteDrawingSource()`, `drawingSiteWiki()`, `siteDrawingBody()` | Genbrug MIME-detektion `application/vnd.excalidraw+json`, SVG-/billedeksport og kontrol af indlejrede billeder. En privat eller ufuldstændig tegning må ikke udgives tavst |
| ABC / Musik | `SiteWorkshop.js`: `abcFrame()`, `abcAssets()`; `MusicSite.js` og `MusicSiteTemplate.js` | Allerede en del af Forges nyere SitePublisher. Bevar Music Editions hurtige **aktiv-tiddler → sitevisning** og forbedringerne til fokus/iPad |
| Billeder, lyd og indlejret medie | Oprindelig `renderSiteBody()` benytter TiddlyWikis renderer og `cleanHtml()` | Undersøg pr. MIME-type/visningskomponent. Bevar `<audio>`, `<video>`, billeddata og sikre SVG'er; klarlæg eksterne filer og indlejrede data før offline-godkendelse |
| Indholdslister | `SiteWorkshop.js`: story, tags, lister og valgt rækkefølge | Allerede forbedret i ny Forge UI |
| Publiceringshåndtering | OAuthLab: Drive-mapper, adgangskontrol, Google Script-response, flerfilssites, opdatering af allerede publicerede sites | **Ikke** en del af den nye lokale HTML-motor. Senere valgfri hosting skal holdes adskilt fra fil-eksporten |

## Fælles eksportkontrakt

Alle specialrenderere bør kunne give SitePublisher følgende, uden at tilføje egne værktøjspaneler:

- `html`: statisk, sikker HTML for indholdet
- `css`: nødvendig visnings-CSS, hentet fra komponentens egen tiddler eller tema
- `scripts`: kun læser-runtime, når visningen ellers ikke virker
- `assets`: billeder, SVG, lyd og andre faktiske afhængigheder, så eksporten kan valideres
- `links`: tiddler-targets omsat til den eksisterende SitePublisher-navigation
- `warnings`: manglende ressourcer, store indlejrede data eller funktioner, der ikke kan eksporteres offline

**Ingen tavs forringelse:** Et nodeark, en faktaboks, en animation eller et SVG må ikke bare forsvinde, mens eksporten melder succes. Vis en konkret fejl eller udeladelsesliste.

## Implementeringsrækkefølge

1. **HUPedia-faktaboks:** Eksportér HUPedias allerede eksisterende artikelvisning via TiddlyWikis renderer og tilføj `$:/plugins/huwiki/hupedia/style.css`. Startet i SitePublisher **0.1.11-test.1**. Test både Person og Begreb på da/en samt kildetiddlere uden faktaboks; test visuelt i Mac-browser/iPad.
2. **Sitelayout:** Ét dropdownvalg i den **nuværende** indstillingsflade: Auto/Standard, Modern, Retro, HUPedia. Samme data, navigation og fokus-runtime i alle layouts. Læg design-CSS i separate, læsbare filer frem for en stor minificeret streng.
3. **CutOut:** Eksportér scene/dukke/animation med dens afhængigheder og en view-only runtime. Test afspilning helt offline og uden edit-knapper.
4. **Tegne og SVG:** Eksportér egentlige tegnedata som visning, med indlejrede billeder og alle nødvendige skrifter/ressourcer. Test både direkte tegning og indlejret tegning i artikel.
5. **Lyd, video og øvrige medier:** Test intern/ekstern data, filstørrelse, offlineafspilning, indlejring og filnavne. Tillad ikke referencer til den private filsti på redaktørens Mac.
6. **Fælles regressionstest:** Normal WikiText, danske/engelske artikler, HUPedia-felter, musikafspiller, navigation, fokusudgang på iPad, direkte download på Mac.

TiddlyWikis `$:/language` forbliver den eneste sprogvælger. Artiklers source WikiText skal være menneskevenlig, med synlige linjeskift og korrekt block-mode-rendering.

## Bemærkning om status

Den gamle `SiteWorkshop.js` er inspiceret, inklusive den komprimerede JavaScript-kilde. Dette dokument er en **funktionsinventarliste og migrationsplan**, ikke en erklæring om, at alt det gamle allerede virker i Forge. Browserresultat og forskellige medietyper skal testes, før de markeres som færdige.

## Status: Sitelayout i Forge

**0.1.12-test.1** har ét layoutvalg i det eksisterende SitePublisher-panel: Auto, Standard, Modern, Retro, Vanilla og HUPedia. Auto følger den aktive TW-theme-identitet. Stylingen ligger i særskilte CSS-tiddlere og indlejres i én HTML-fil. Der er ikke indført den gamle SiteWorkshops lange liste af detaljerede designkontroller. Auto/CSS er dækket af automatiske tests, men sammenligning i browser mangler endnu.


## Status: CutOut og mediehåndtering i Forge

**0.1.13-test.1 (13. november 2026):** Den gamle `CutOutSiteRuntime.js`, `siteCutoutWidgets()`, `cutoutAssets()` og `cutoutTitle()` er gennemgået. Én lokal read-only CutOut-læser er integreret i den nye SitePublishers fælles HTML-motor, hvor billed- og animationsreferencer valideres før udgivelse. Runtime, CutOut-JSON, CSS og interne billeddata pakkes i samme HTML-fil. Ingen editor, Google-synkronisering eller ekstra sprogknap følger med. Ligeledes kan direkte image/audio/video-tiddlere og lokale billedhenvisninger eksporteres som data-URL'er. Eksterne eller utilgængelige mediekilder giver en konkret fejl frem for en lydløs udeladelse.

Den nye brugerflade, sitelayouts, HUPedia, ABC og fokusvisning er ikke bevidst ændret. **Det er en første teknisk portering, ikke en browsergodkendt version.** CutOut bør prøves med dukker, animation, indlejrede teaterscener, kamerabevægelser og flere billedvarianter på Mac/iPad samt i en afbrudt netforbindelse. Excalidraw/Tegne og komplet SVG-/video-dækning er stadig næste særskilte udviklingstrin.
