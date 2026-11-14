# Forge-landingswikien

Forsiden er en statisk, selvstændig TiddlyWiki 5.4.1. GitHub Pages leverer den færdige `index.html`; der køres ikke et nyt build ved besøg. `editions/forge/manifest.json` samler også den samme Edition i den eksisterende Assembler.

## Indhold og design

Edition-kort og status stammer fra `catalog/editions.json`. De danske/engelske præsentationstekster ligger i hvert elements `home`-felt. Bygget afleder `editions/forge/tiddlers/edition-index.json` fra dette katalog; det er ikke et nyt katalog. Lokale kopier beholder deres snapshot og har links til TiddlyWikis eget fællesskab og HUWiki Plugin Library.

`seed.json` indeholder redigerbare danske/engelske forsider og kortskabeloner. `design.json` er forsidens stylesheet. Dansk er den uændrede officielle TiddlyWiki 5.4.1-pakke med BSD-licens. Valget følger kun `$:/language` i TiddlyWikis kontrolpanel.

Designreferencer gennemgået 14. november 2026: [HUWiki](https://huwiki.måns.dk/da/index.html) (petrol/mint, serifoverskrift, ligefremme tekster), [Wikilabs](https://wikilabs.github.io/) (formålsbestemte indgange og native biblioteker) og [TriTarget](https://tritarget.org/) (læselig artikeltypografi). De to TiddlyWiki-eksempler er fundet via [tiddlywiki.com](https://tiddlywiki.com/static/Examples.html) og [Community Editions](https://tiddlywiki.com/static/Community%2520Editions.html). Ingen kode eller samlet design er kopieret fra disse hjemmesider.

## Læsevisning og lokal gemning

Den eksisterende HUWiki-hængelås fra `PersonalReading.js` i `HUWiki-OAuthLab-backup.zip` ligger i tiddlerens **Mere**-menu. HTTP(S) starter i læsevisning; file:-kopier starter med redigering tilgængelig. Hængelåsen skifter begge veje. Åbne kladder skal afsluttes før skift til læsning. Det er præsentation, ikke adgangskontrol. Der er ingen GitHub-saver eller ejeridentifikation i gæstewikien.

Gem-knappen bruger TiddlyWikis native `tm-save-wiki`. Kontrolpanel, sprogvalg og den oprindelige pluginbiblioteksdialog forbliver tilgængelige. F-knappen er udelukkende et link til https://forge.måns.dk/ og indgår i alle Editions via `editions/shared/libraries.json`. ForgeShare ændres ikke.

ReadOnly-stylesheetet er en tilpasning af Eric L. Shulmans TiddlyTools ReadOnly under **CC BY-NC-SA 4.0**. Originalt materiale, dokumentation, juridisk meddelelse og ændringshistorik bevares under `editions/forge/licenses/readonly/` og i `$:/HUWiki/ReaderLicense`. Licensen gælder denne komponent; den erstatter ikke andre komponenters licenser.

## Ejerens lokale redigering til GitHub

1. Hent siden med TiddlyWikis Gem. Åbn den lokale HTML, redigér velkomsttiddleren eller stylesheetet, og gem med TiddlyWikis Gem igen.
2. I en udviklingsgren: `node scripts/import-forge-home.mjs /sti/til/Forge.html`.
3. Importen kopierer **kun text-feltet på eksisterende forside-, kortskabelon- og designtiddlere** til `seed.json`/`design.json`. Den medtager ikke installerede plugins, nye titler, kladder, sprogvalg, sessionsdata eller andre felter. Edition-metadata ændres i det fælles katalog.
4. Kontrollér diff, kør `node scripts/build-forge-home.mjs`, `npm test` og browsertesten; commit kilderne, genererede Edition-kort og `index.html` sammen.
5. PR og CI før merge. Kontrollér Pages-resultatet efter merge. En almindelig lokal Gem opdaterer aldrig GitHub.

## Kontrol

`node scripts/build-forge-home.mjs --check` afviser forældet HTML eller Edition-kort. CI verificerer det på alle PR'er og main uden automatiske bot-commits til en navngiven udviklingsgren.

`CHROME_BIN=/sti/til/chrome node scripts/forge-home-browser-smoke.mjs` tester: reversibel hængelås i Mere-menuen, dansk/engelsk via native kontrolpanel, F-link, katalogkort, native download, offline genåbning, faktisk redigering og endnu en gem/genåbning, samt bredder 1440/768/390 px. Sæt `FORGE_HOME_URL=https://forge.måns.dk/` for at kontrollere den udgivne side. Testen skriver aldrig til GitHub eller den offentlige wiki.

## Bred forside og egne sammensætninger

Forsiden starter med den indbyggede `$:/state/sidebar` sat til `no`. Den normale sidepanelknap åbner det igen. Ved mindst 1100 px og skjult sidepanel vises tre Edition-kort pr. række; små skærme viser ét. Dansk/engelsk følger fortsat kun `$:/language`; linkene sender det valgte sprog videre til Assembleren.

Assembleren bruger `catalog/editions.json`, Plugin Librarys `registry.json` og det eksisterende `catalog/materials.json`. Besøgende kan vælge en eksisterende Edition eller en tom wiki, dernæst værktøjer, indhold og tema. Nødvendige hjælpepakker medtages automatisk. Manglende/cirkulære afhængigheder, uoverensstemmende pakkeversioner og modstridende tiddlere afvises før download. Pakker og deres licenser bevares. F og begge biblioteksindgange følger altid med.

Sammensætninger er testudgaver, ikke en garanti for alle kombinationer. `scripts/composer-browser-smoke.mjs` afprøver dansk musik + jazzundervisning + Modern, native gem/genåbn offline og en engelsk HUPedia + Tegne-eksempler med automatisk Excalidraw/React. `tests/compose.test.mjs` kontrollerer desuden alle eksisterende Editions og fejltilfælde. Browserkontrollen kører i CI sammen med forsidekontrollen. `FORGE_HOME_URL` kan pege på Pages for samme kontrol efter deployment.
