# TiddlyWiki Forge

**Status: udviklings- og testprojekt.** Forge Assembler kan samle flere selvstændige Editions; enkelte pluginfunktioner kræver stadig browsertest.

TiddlyWiki Forge skal oprette en ny, selvstændig TiddlyWiki fra en **frisk, testet og kompatibel** `empty.html` og et manifest med Editionens tiddlere og plugins. Brugeren redigerer og gemmer bagefter med TiddlyWikis **egne** funktioner. Forge bygger hverken en ny HTML-saver, backupmotor eller generel serversynkronisering.

## Prøv Forge Assembler

Åbn **[Edition Assembler](https://forge.xn--mns-ula.dk/assembler/)** og vælg en Edition fra kataloget:

- **HUPedia Edition (test):** Tosproget leksikon med artikelredigering, faktabokse og otte eksempelartikler. Brug sammen med SitePublisher og PDF Publisher efter behov.
- **Musik Edition (test):** ABC-plugin med følgeafspiller og swing, TiddlyWiki Jingle som redigerbart nodeeksempel, Musik-plugin, seks undervisningspakker, Modern-temaet, **MuseScore → ABC Importer 0.1.5-beta.1** samt SitePublisher og PDF Publisher. Kontroller noder og lyd i browseren, inden Editionen anvendes til produktion.
- **AI Edition (test):** AI Forge 0.4.0 med tekstsamtaler, opgaveeksempler og valg af lokal AI eller godkendte ForgeShare-forbindelser. AI-forbindelsesbroen kræver det særskilte Mac-hjælpeprogram og adgangsgodkendelse; billedfunktioner er ikke godkendt via broen.
- **Demo Edition:** Den tidligere gennemprøvede opstartstest af TiddlyWiki og et startup-plugin.

Tryk **Byg Edition**. Forge henter automatisk den **fastlåste** TiddlyWiki-kerne og leverer én selvstændig HTML-fil. Du skal **ikke** selv hente `empty.html`. Åbn filen og brug TiddlyWikis indbyggede redigering og Gem-funktion.

Et valgfrit felt til en lokal `empty.html` er bevaret til versionskontrol. Den officielle upstream-kerne overvåges i GitHub Actions, men nye versioner gemmes som **kandidater** og erstatter ikke automatisk den version, Editions bruger.

**Separat plugin:** [HUWiki Trim 0.1.5](plugins/trim/dist/plugin.json) og [MuseScore → ABC Importer](plugins/musescore-import/dist/plugin.json) kan vælges under **Ekstra plugins**. MuseScore-importeren er allerede med i Musik Edition. Import efter node-preview bruger TiddlyWikis almindelige `$:/Import`.

Kør `npm test` (Node.js 20+) for de automatiske tests. De kontrollerer nu også HUPedia-komponenter og samling mod den fastlåste kerne. Enhedstests kan ikke erstatte reel browserafprøvning.

Se [migrationsstatus](docs/migration-status.md), [overførselsinventar fra OAuthLab](docs/oauthlab-transfer-inventory.md), [det lette materialekatalog](catalog/materials.json), [AI Editionens forbindelsesdesign](docs/ai-connections.md) og [HUWiki-kildeanalysen](docs/huwiki-source-analysis.md).

**TiddlyWiki Jingle:** Forge-forsiden har en kompakt nodefølger med melodi og becifringer. Alle stemmer og akkompagnement spilles. Det tosprogede link **Åbn / Open** åbner kompositionens fulde, redigerbare tiddler. Makroen `<<abc-player ...>>` og dens parametre forklares i ABC-pluginets hjælp.

## ForgeShare · offentlig Mac-test

[ForgeShare til Mac, 0.1.18-test (ZIP)](downloads/forgeshare/ForgeShare-mac-0.1.18-test.zip) er et særskilt hjælpeprogram; [installationsvejledningen og den løbende versionsstatus](downloads/forgeshare/README.md) forklarer Mac-appens brug og begrænsninger. Den valgfrie [ForgeShare-pluginvejledning (JSON)](plugins/forgeshare/dist/plugin.json) kan installeres i en TiddlyWiki via Plugin Library. **Åbn** starter en lokal TiddlyWiki Node.js-server uden Tailscale. Privat Tailscale-deling er afprøvet på Mac/iPad, men offentlig **Funnel er ikke verificeret**.

Mac-appen er **ikke Apple Developer ID-signeret eller notariseret** og kan kræve manuel macOS-godkendelse. Det er testsoftware på eget ansvar; tag backup før brug. **Windows-download er ikke tilgængelig:** en tidligere Windows-testudgave blev blokeret af Microsoft Defender, og detektionen er endnu ikke afklaret. Det anbefales ikke at omgå antivirus.

AI Edition kan bruge ForgeShare til godkendte AI-forbindelser; lokal AI kan også bruges separat. ForgeShare-udviklingen og den blokerede Windows-test forbliver i [draft-PR #8](https://github.com/maans/huwiki-forge/pull/8), uden at den fulde PR flettes ind i main.

## Plugin Library og TiddlyWiki Community

**[TiddlyForge – til eksisterende TiddlyWikier](plugins/tiddlyforge/dist/plugin.json)** er et lille, selvstændigt plugin, som tilføjer Forge Plugin Library til den normale *Get More Plugins*-dialog og en diskret **F**-genvej blandt TiddlyWikis eksisterende sideværktøjer. Det officielle bibliotek bevares. Importér pluginfilen i din wiki og gem. Ingen særskilt browser, ekstra installationsdialog eller automatisk installering af andre plugins.



**[HUWiki Plugin Library](https://forge.xn--mns-ula.dk/library/plugins/index.html)** integrerer med TiddlyWikis egen *Get More Plugins*-dialog. Den tilbyder alle de installerbare Forge-plugins og temaer, som ligger under `plugins/` og `themes/` i dette GitHub-repository. Pakkerne hentes ved installation, ikke alle på én gang.

**[TiddlyWiki Community](https://tiddlywiki.com/#Community)** er indgangen til TiddlyWikis eget fællesskab. Den tidligere `/community/`-side viderestiller dertil. Der tilføjes ingen Community-fane i sidepanelet.

Alle Editions bruger de **samme** TiddlyWiki-biblioteksadresser fra `editions/shared/libraries.json`. TiddlyWikis officielle pluginbibliotek bevares. Se [bibliotekernes arkitektur og opdatering](docs/forge-libraries.md).

## Struktur

- `assembler/` — før-boot assembler og testside
- `editions/` — Editions-manifester og tiddlere
- `plugins/` — plugin-kilder og distributionsbundles
- `catalog/` — Editions og et let, offentligt materialekatalog til det kommende Delt-panel
- `core/` — planlagte, testede TiddlyWiki-kerner
- `docs/` — arkitektur, sikkerhed og [projektplan v0.3](docs/projektplan-v0.3.md)
- `updates/` — kommende Notice-feed
- `admin/` — kommende GitHub Publisher

## Grundprincipper

- Ingen GitHub- eller Google-konto for almindelige brugere.
- TiddlyWikis eksisterende redigering, HTML-gemning, eksport, import og saver-funktioner genbruges.
- En Edition er et manifest, ikke en vedligeholdt monolitisk HTML-fil.
- Fork, GitHub-template og Download ZIP kan distribuere den samlede kildekode.
- Notice starter med opdateringsbeskeder; Talkback og frivilligt community kommer senere.
- Tokens og andre hemmeligheder må aldrig indgå i offentlige filer eller eksporter.

**Licens til ny Forge-kode er endnu ikke besluttet.** Tredjepartskomponenters licenser skal respekteres, før projektet frigives til videre distribution.
