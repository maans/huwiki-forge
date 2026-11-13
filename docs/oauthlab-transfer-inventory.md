# OAuthLab → HUWiki Forge: Editions, plugins og delte materialer

**Foreløbig teknisk inventarliste, 13. november 2026.** Kildemateriale: brugerens `HUWiki-OAuthLab-backup.zip` (132 ZIP-indgange), nyere `Musik-0.3.54-beaming-alle-fire.html` samt separat `HUWiki-MuseScore-ABC-Importer-v0.1.4-beta.1`. En del navne/versioner i backup er ældre end de seneste lokale forsøg; en portering må ikke overskrive nyere arbejde.

## Flyttet til GitHub

| Område | Pakke/Edition | Kildestatus | Forge-status |
| --- | --- | --- | --- |
| HUPedia | HUPedia plugin + tema + 8 eksempler | Fra OAuthLab, derefter fejlrettet og oversat | **HUPedia Edition 0.2.4-test.1** i Assembler |
| Musik | ABC 0.3.31-test.8, Musik 0.3.17-test.1 | Fra nyere Musik-wiki, ikke ældre OAuthLab 0.3.20 | **Musik Edition 0.1.0-test.1** i Assembler |
| MuseScore | Importer 0.1.4-beta.1 med ABCJS, JSZip og tredjepartslicenser | Selvstændig brugerleveret pluginfil | Med **automatisk i Musik Edition**, desuden selvstændig fil |
| Undervisning | Basic, Jazz, Rhythm, Balkan, India, Folk | Seks originalpakker; versioner stammer fra nyere Musik-wiki | Alle seks er med i Musik Edition; de kræver ABC |
| Temaer | Modern 0.1.2, Retro 0.1.3 | Originale TiddlyWiki-temapakker, adskilt fra SitePublisher-layouts | Begge ligger som selvstændige temaer; Modern er standard i Musik |
| Fælles værktøjer | SitePublisher, PDF Publisher, Trim | Tidligere overført og tilpasset til Forge | Selvstændige plugins; begge publishers med i Musik |
| Delte materialer | `catalog/materials.json` | Ny metadataoversigt baseret på faktiske filer | **16 kilder**; let katalog med deferred indholdshentning. Delt-panelets UI mangler |

**Status betyder ikke browsergodkendt.** Automatiske tests har kontrolleret Edition-manifester, TiddlyWiki-tiddlerpakker, dubletter, filstier og HTML-samling. Lyd, MuseScore-import, mobilvisning og UI skal stadig afprøves i faktiske Mac/iPad-browsere.

## Næste porteringer

| Edition/plugin | Forekomst i OAuthLab | Kan kode/indhold flyttes uden Google? | Hvad mangler? |
| --- | --- | --- | --- |
| **HUPin** | `HUEditions.js`, plugin 0.3.3 | Den selvstændige pinmotor ser Google-uafhængig ud | Pakkeudtræk; Edition-seed kræver aktuelt **PasteUp** |
| **Tegne** | `TegneEdition.js`, `TegneAsset*.js` | Tegneruntime/indhold kan potentielt køre lokalt | Genskab pluginbundles; kontrollér Excalidraw/React-afhængigheder, licenser og eksport |
| **CutOut** | `CutOutEdition.js` 0.6.2, `CutOutAsset*.js`, `CutOutSiteRuntime.js` | Animation og visning er i udgangspunktet browserfunktioner | Pluginpakker og store assets, sammenhæng med Tegne/PasteUp/Slideshow, offline-visning |
| **PasteUp** | `PasteUpDesigns.js`, forskellige assets | Browserdesign er genbrugeligt | Find den korrekte, seneste pluginpakke og bevare oprindelige licensvilkår |
| **Slideshow** | `SlideshowEdition.js`, `SlideshowVendorAsset.js`, `SlideshowImport.js`, `SlideshowExports.js` | Editor og lokal fremvisning kan adskilles fra hosting | Ekstrahér pakke; adskil lokal export fra Apps Script-publicering |
| **AV** | `AVEdition.js`, `AVWorkshopAsset.js` | Afspilnings- og redigerings-UI er delvis browserbaseret | Pakke/medieasset-udtræk, codec/offline-tests og evt. serverdel |
| **Studio** | `Studio.js` 0.6.1, `StudioEdition.js`, `StudioCommunity.js`, `StudioPublish.js` | Lokal pakning, design og plugin-arbejde kan flyttes | Udskift Google-publicering med statiske udgivelser; genbrug Studios eksisterende versions-/metadata-logik |
| **AI** | `AIEdition.js` 0.3.6 (53 interne tiddlere) | Lokal model/klientkode er mulig | Fjern Google Script/PrivateVault-forbindelsen, sikker håndtering af API-nøgler |
| **Shop** | `ShopEdition.js` | Design, produkter og lokal visning kan flyttes | Bestilling, betaling og formularsvar bruger Google Sheets/Forms; kræver særskilt service |
| **Spørgeskema** | `SurveyEdition.js`, `SurveyLive.js`, `SurveyResultSite.js` | Spørgsmål, skabeloner og lokal redigering kan flyttes | Erstat Google Forms/Sheets til indsamling og opbevaring |
| **Personal/Workspace sync** | `Code.js`, `PrivateVault.js`, Hub/Sync/OAuth-filer | Ikke som en ukritisk kopi | Hold synkronisering/adgangsstyring som valgfrie separate moduler. **Ingen tokens, konti eller private data på GitHub** |

Fravær af et Google-kald i en pluginfil er **ikke** bevis for, at alle runtime-afhængigheder er opfyldt. Omvendt er en Edition ikke nødvendigvis Google-afhængig, bare fordi den blev pakket og distribueret med Apps Script. Vi vurderer **plugin, indhold, hosted publicering og brugerlogin hver for sig**.

## Det nye Delt-panel

Vi skal videreføre OAuthLabs brugeroplevelse, **ikke dens Google-backed database**. Den oprindelige `content-library.js` benytter browserens drag-and-drop med `text/vnd.tiddler` og `application/json`. Native TiddlyWiki-import fungerer også via `tm-import-tiddlers` og det eksisterende `$:/Import`-review. Den nye implementering skal fortsat bruge disse mekanismer.

1. GitHub Pages udgiver en lille **offentlig materialekatalog-JSON** (`catalog/materials.json`). Først ved klik/hover hentes den konkrete pakke.
2. En kildesamling kan indeholde **enkelte tiddlere**, et helt **plugin**, et **tema** eller en **Edition**. Import af individuelle tiddlere må ikke automatisk overskrive en eksisterende pluginpakke.
3. En kommende sidebar-visning **Del** skal have søgning, metadata, preview, træk-og-slip og native importkontrol. En statisk library-/iframe-bro kan bruges fra lokale single-file wikier uden serverlogin.
4. **Studio** skal senere kunne udgive versionssatte offentlige samlinger til dette katalog. Private delinger må **ikke** blot lægges på offentlige GitHub Pages; de kræver særskilt adgangsstyring.
5. Til pluginbiblioteket bruger vi TiddlyWikis **egen standard for Plugin Library**, mens **Delt** er en anden brugerflade til materialer og samlinger. Ingen parallel wiki-saver eller privat database.

## Ydelse og pakningskvalitet

- Materialekataloget skal forblive meget lille (CI grænse: 12 KB) og ikke indeholde hele pluginbundles.
- Pluginfiler indlæses først, når brugeren vælger materialet eller bygger en Edition.
- Musik Edition inkluderer for øjeblikket **to forskellige ABCJS-kopier**: en i ABC-pluginet og en til selvstændig MuseScore-preview. De må først deduplikeres efter konkret kompatibilitetstest.
- Bevar pluginernes originale metadata, afhængigheder og licenstekster. Uklare ophavs-/distributionsvilkår skal gennemgås før offentlig markedsføring.
- Alle egentlige artikler og oversættelser bevares som **læsbar WikiText** med korrekte linjeskift; UI-sproget følger kun TiddlyWikis `$:/language`.
- Det er vigtigt, at en ny Edition **ikke** tager ældre pluginversioner med, hvis en nyere testet kilde findes.

## Næste praktiske kontrol

Åbn Forge Assembler og vælg **Musik Edition (test)**. Kontrollér: den indbyggede ABC-editor, noder/lyd i Mac og på iPad, at MuseScore-importeren åbner og går videre til TiddlyWikis **$:/Import**, og at SitePublisher/PDF Publisher har de nye indstillinger. Derefter kan vi begynde at samle **HUPin/PasteUp** og **Tegne/CutOut** til næste færdige Editions.
