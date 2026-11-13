# AI Edition: private forbindelser uden for TiddlyWiki

**Designkrav** fra den tidligere HUWiki Private Vault (`PrivateVault.js`) og AI Edition 0.3.6 (`AIEdition.js`).

HUWiki havde et brugerafgrænset serverlager (`PropertiesService.getUserProperties()`), som holdt cloud-API-nøgler ude af TiddlyWikien. Forge skal bevare **adskillelsen** uden at kræve Apps Script eller nogen Google-tjeneste.

## Funktionelle muligheder

- Brugeren vælger selv leverandør og model: fx OpenAI, Anthropic/Claude eller en anden kompatibel API.
- Brugeren kan vælge lokal/modelserver ved URL (LM Studio, Ollama eller OpenAI-kompatibel lokal API).
- Nøgle, serveradresse og model konfigureres separat fra wikiens tiddlere. Wikiens HTML kan kopieres eller deles uden at overføre disse forbindelser.
- Uden konfigureret forbindelse skal AI Edition stadig være redigerbar; AI-knapperne må forklare, at en forbindelse mangler, og må ikke sende data.
- Afsendelse af wikiindhold til en valgt cloud-provider kræver synligt brugerinitiativ og fortsat samtykke.

## Oprindelige afhængigheder der skal erstattes

Pluginet `$:/plugins/huwiki/ai` i `AIEdition.js` indeholder bl.a. `workbench-widget.js`, `chat-library-widget.js`, `connection-status-widget.js` og `image-replies.js` med kald til den tidligere `google.script.run`-bro og `huPrivateVault...`-funktioner. De skal ændres på API-grænsen før pluginet kan udgives som en fungerende Google-uafhængig Forge Edition.

## Forslag til browserkontrakt

- `listConnections()` → vis **kun** offentlige metadata: id, navn, provider, model, URL og `hasKey`.
- `setConnection()` → modtag private indstillinger i en særskilt browser/sessionfunktion; må ikke skrive dem i tiddlere eller HTML.
- `requestCompletion()`, `listModels()`, `generateImage()` → sender kun til en eksplicit valgt endpoint/provider; ingen indbygget central HUWiki-server.
- `forgetConnection()` → fjerner forbindelsen fra aktiv session og evt. valgfrit browserlager.
- Alle API-kald skal formidle HTTP-/CORS-fejl uden at udskrive API-nøgler i debuglog eller statusmeddelelser.

## Lagring og sikkerhed

Den første implementering bør bruge **sessionshukommelse**. Nøgler bør ikke som standard persisteres. En senere, tydeligt valgfri indstilling kan gemme forbindelsesmetadata lokalt i browseren og efter særskilt vurdering også credentials.

`localStorage`, `sessionStorage` og `IndexedDB` er ikke hemmelige for JavaScript med samme origin. En gemt `file://`-wiki har desuden inkonsistent browser-/originadfærd, så en lokal fil kan ikke pålideligt dele et lager med enhver anden lokal fil. En separat, dedikeret connector-origin eller en brugeradministreret localhost-tjeneste kan senere give mere robust lagring og adgangskontrol. Credentials må aldrig transkluderes ind i tiddlere, gemte HTML-filer, Github-commits, backups eller diagnoseudskrifter.

## Ingen stiltiende omgåelse af CORS

GitHub Pages er kun statisk hosting. Browseren kan kalde en privat LLM/server eller cloud-API direkte **hvis** destinationen tillader browserens origin og de nødvendige HTTP-headere. Dette er ikke garanteret for alle AI-providere. For endpoints uden understøttet browser-CORS kan brugeren benytte en lokal eller selvhostet proxy under egen kontrol; Forge stiller ikke automatisk andres API-nøgler til rådighed gennem en fælles server.

## Status

Dette er et specificeret migrationskrav, **ikke** en færdig credential-boks eller et påstået fungerende AI-plugin. Den oprindelige AI-pakke skal bevares og gennemgås modul for modul før publicering.
