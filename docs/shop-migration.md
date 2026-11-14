# Shop Edition: Shop Site og guidet opsætning

Version: 0.2.0-test.1. Kilde: `HUWiki-OAuthLab-backup.zip`, `ShopEdition.js`, oprindelig Shop 0.1.2. Den originale kilde ligger komprimeret i `migration/shop/source.b64`, med SHA-256 og ophav i `provenance.json`. Det tekniske plugin-id er fortsat `$:/plugins/huwiki/shop`, og ophavet HUWiki bevares. Originalen angiver ingen top-level-licens; vi opfinder ikke en.

Brugeren har bedt om at erstatte den automatiske Google-opsætning med en enkel guide, hvor ejeren selv logger ind og opretter formular og regneark. Google er derfor en valgfri, udtrykkelig opsætningsvej for Shop. Katalog, redigering, forhåndsvisning, kundesideeksport og gemning fungerer lokalt. Et katalog uden formular og et link til en anden offentlig formular er også muligt.

## Hvad der følger med

- De ni originale skabeloner: festudvalg, sekretærbestillinger, skoletøj, katalog, bestillingsliste, tilmelding/reservation, bidrag, forespørgsel og fri opbygning.
- Originale galleri-, liste- og plakatvisninger, fire farver og tøjets SVG-illustration. Dansk/engelsk skabelonindhold ved oprettelse; ejerens redigerede indhold oversættes ikke automatisk ved sprogskift.
- Varer, varianter, priser, beskrivelse, status, offentlige billeder eller indlejrede lokale billeder, kontakt, levering og frivillige eksisterende MobilePay-oplysninger/betalings-QR.
- Syv guidetrin med individuelle flueben: katalog, Forms, privat Sheets-ordreark, prøvebestilling, kundesideeksport, udgivelse og løbende drift. Afkrydsning er ejerens egen bekræftelse, ikke en påstand om automatisk kontoadgang.
- Fremdrift og data gemmes i arbejdswikien med TiddlyWikis native saver. Sprog følger kun `$:/language`. Katalogændringer nulstiller relevante ordre-/udgivelsesprøver.
- Eksport af `index.html` og statisk HTML/CSS til Google Sites' **Integrer kode**. Begge indeholder kun eksplicitte offentlige katalogfelter. Privat arkadresse, afkrydsninger, arbejdswiki og ordredata eksporteres ikke.
- En lille valgfri Node-hjælper serverer kun `index.html` på `127.0.0.1:8787`; den afviser skrivning og andre filstier. Funnel-guiden viderestiller denne port, aldrig ejerens redigerbare TiddlyWiki-server. ForgeShare er fortsat et særskilt projekt; guiden opfinder ikke et erstatningsplugin.

## Bevidste ændringer fra OAuthLab

Ingen Apps Script, kontotokens eller automatiske Google-kald medfølger. Oprettelse og publicering af formular, kobling til svarark, ordrebog, betaling, bekræftelse og udlevering gennemføres manuelt. Der er ingen automatisk ordreimport, kundemail, lagerreservation, betalingskontrol eller synkronisering af varepriser. Den tidligere automatiske site-QR-generator er ikke med; modtagerens eksisterende betalings-QR kan indlejres.

Google Sites får kopieret kundesidens HTML/CSS ind i en indlejring. Den behøver ikke en tændt ejercomputer. Det er ikke upload af den redigerbare TiddlyWiki til Drive. Ved ændringer skal kode/indlejring erstattes og sitet udgives igen. Google Sites-kontoens faktiske rettigheder og indlejring skal accepteres i en rigtig kontotest.

Funnel viser den statiske kundeside fra ejerens tændte computer. Kunden behøver ikke Tailscale. Node-server og Funnel kører i forgrunden; begge skal startes igen efter genstart. Portdeling undgår platformsbegrænsninger ved direkte fil-/mappedeling. Ingen offentlig Funnel åbnes under de automatiske tests.

## Verifikation og udeståender

`tests/shop.test.mjs` kontrollerer alle ni skabeloner × tre layouts × to sprog, linkvalidering, HTML-escaping, privat/offentlig afgrænsning og den faktiske lokale HTTP-hjælper (GET/HEAD, ingen POST, ingen private filstier, opdateret fil).

`scripts/shop-browser-smoke.mjs` kontrollerer i rigtig Chrome: offline Edition, native dansk/engelsk, katalogredigering, afkrydsning og nulstilling, faktisk HTML-download, indlejringsfragment i isoleret iframe, native Gem/genåbn med bevaret fremdrift, sprogskift og mobilbredde. Formularadressen i denne test er en testadresse; testen sender ingen ordre til Google.

**Lokalt verificeret 14. november 2026:** 95 automatiske tests består. Shop-browserprøven består i dansk og engelsk med faktiske downloads og offline genåbning. Alle ni Editions består fælles navn-/sprogkontrol i begge sprog; Forge-forsidens native gemning og layoutkontrol består.

**Udestående før fuld accept:** oprettelse af en rigtig Google-formular og svarark med ejerens konto, anonym kundebestilling, faktisk publicering og indlejring i Google Sites samt offentlig Funnel på ejerens computer/netværk. Screenshots af Google-kontotrinnene bør først tilføjes fra det reelle afprøvede forløb. Safari, Firefox, iPad og større kataloger/billeder er ikke accepteret. Udgivelsen skal fortsat stå som testudgave med disse begrænsninger.

## Kontrollerede officielle vejledninger

Kontrolleret 14. november 2026. Knapnavne kan variere med sprog og kontotype.

- [Opret Google Forms](https://support.google.com/docs/answer/6281888)
- [Udgiv formular og hent respondentlink](https://support.google.com/docs/answer/2839588)
- [Knyt formularsvar til et regneark](https://support.google.com/docs/answer/2917686)
- [Indlejr HTML/CSS eller en webside i Google Sites](https://support.google.com/sites/answer/90569)
- [Udgiv Google Sites](https://support.google.com/sites/answer/6372880)
- [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel)
- [Funnel-eksempler](https://tailscale.com/docs/reference/examples/funnel)
- [Tailscale på Mac](https://tailscale.com/docs/install/mac)
- [Node.js-installation](https://nodejs.org/en/download)
