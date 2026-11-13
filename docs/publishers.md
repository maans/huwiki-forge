# Fælles udgivelsesplugins: SitePublisher og PDF Publisher

Kilde: `HUWiki-Musik-v0.3.51-test.1-SitePublisher-Fokus-manuel.html` og de selvstændige JSON-eksporter. Begge plugins har MIT-licens. De er siden tilpasset til fælles brug i Forge: versionsnumre og JavaScript-kode er ændret, mens de oprindelige Music-v0.3.51-eksporter forbliver reference.

## Hvorfor fælles plugins?

Udgivelse er en kapacitet, som flere Editions kan få glæde af. Den skal ikke være en uforanderlig del af eksempelvis HUPedia eller Musik. Derfor er plugins **selvstændige pakker i det fælles plugin-katalog**. Brugeren kan vælge dem i Assembler. De er foreløbig **fravalgt som standard**, indtil de er browser- og funktionstestet på tværs af Editions.

| Plugin | TiddlyWiki-titel | Forge-fil | Version |
| --- | --- | --- | --- |
| HUWiki SitePublisher | `$:/plugins/huwiki/site-publisher` | `plugins/site-publisher/dist/plugin.json` | 0.1.10-test.1 |
| HUWiki PDF Publisher (internt kaldet HUWiki Publisher/Print Article) | `$:/plugins/huwiki/print-article` | `plugins/print-article/dist/plugin.json` | 0.2.7-test.1 |

Begge plugins er browserværktøjer, ikke serverside-håndtering af Google Drev eller Apps Script. Den separate `PDF Publisher` laver PDF; `SitePublisher` laver **HTML-sites**. Den almindelige redigerbare single-file wiki gemmes fortsat med TiddlyWikis indbyggede saver.

## Funktionelle særtræk

**SitePublisher:** Udgiver en valgt tiddler, et tag, et list-felt eller StoryList som et selvstændigt HTML-site med navigation. Musikfunktioner såsom nodepult, C/B♭/E♭ og ABC-lydafspilning er betinget af ABC-pluginets funktioner; de må ikke blive obligatoriske afhængigheder i andre Editions. SitePublisher renderer almindelige artikler som statisk HTML, men det er ikke garanteret, at alle interaktive widgets og makroer kan eksporteres uden tab.

**PDF Publisher:** Understøtter almindelige tiddlere, samlinger, rækkefølge, interne links i indholdsfortegnelsen og valgfri blanke sider. ABC-modulet giver udvidet støtte til sangbøger, faktiske nodesider og venstre-/højresideopslag. PDF-eksport er rasterbaseret, og et fysisk foldet hæfte kræver eventuel separat udskriftsimposition.

## HUPedia

HUPedia har sit eget tema og artikelplugin. Den gamle ZIP-reference til `02-Site-Skabelon/ÅBN-SITE-EKSEMPEL.html` i startvejledningen er erstattet af `HUPedia · Udgivelse`. SitePublisher er endnu **ikke en valideret afløser for den gamle site-skabelon** med hensyn til alle HUPedias faktabokse, indholdslinks, typografi og redaktionelle filtre. Det skal testes.

`pedia-status: godkendt` er et **redaktionelt felt**, ikke en sikkerhedskontrol. Udgivelsesplugins filtrerer ikke automatisk efter godkendelsesstatus. Kontrollér derfor udvalget inden deling.

## Før vi gør dem til standard i alle Editions

1. Browser-test SitePublisher med HUPedia (faktabokse, links, billeder, layout).
2. Browser-test PDF Publisher med HUPedia og Tegne, og Music-funktionerne separat.
3. Kontroller at fejl og tomme udvalg håndteres fornuftigt uden ABC.
4. Undersøg eventuel ensretning af brugerflade og oversættelser på dansk/engelsk.
5. Først derefter overvej opt-in som standardvalgt addon eller en fælles pluginprofil, der kan fravælges.

**Nye prøvefunktioner (13. november):** SitePublisher får neutral navigation (*Artikler*, *Indhold* eller *Repertoire* afhængig af indholdet), sitetitel fra `$:/SiteTitle`, en samlet klikbar indholdsoversigt samt indstillinger, der kan skjules. PDF Publisher får automatisk genberegning med debounce, et miniatureoverblik over alle sider, klik-forstørrelse med sidepile, separat bogopslag og en indstillingsknap. Den første fysiske bogside ligger stadig på højre side i bogopslag; den vises alene i oversigten, så en tom venstreside ikke fylder den første visning. Eksportens faktiske sider og paginering er ikke ændret.

Plugins ligger nu i repositoryet med versionsnumre og MIT-licens. Automatiske tests kontrollerer gyldige pluginpakker, JavaScript-syntaks, udvalgte UI-kodeveje, Google-uafhængighed og korrekt indlejring før TiddlyWikis opstart. **De nye previewfunktioner er endnu ikke browsertestet og skal afprøves i en nybygget HUPedia-wiki.**

## Sprog og Mac-download

Begge plugins følger nu **TiddlyWikis eksisterende `$:/language`**, uden ekstra sprogvælgerknapper. Der er dansk og engelsk i Publisher-vinduerne, tooltips/beskrivelser og plugin-readme; TiddlyWiki-styrede toolbarbeskrivelser bruger betinget wikitext. SitePublisher har nu adskilt **Hent HTML** (direkte fil-download, også på Mac) fra **Del HTML** (valgfri systemdeling). PDF Publisher beholder særskilt PDF-download.

Ovenstående er verificeret ved automatiske tests og JavaScript-syntakskontrol. Dynamisk sprogskifte og Mac-browserens faktiske download skal stadig afprøves i en **nybygget** wiki, før brugerfladen kan regnes som endeligt godkendt. Pluginmetadata og versionsansvar bygger på den eksisterende **HUWiki Studio**-logik, jf. [pluginstandarden](plugin-standard.md).

## Fokus på touchskærme (SitePublisher 0.1.10-test.1)

Det selvstændige eksporterede HTML-site har fokusvisning uden ekstra krav til tastatur. Når fokus er aktivt og værktøjslinjen skjult, forbliver en lille, berøringsvenlig **Afslut fokus / Exit focus**-knap synlig i øverste højre hjørne med respekt for iPads safe area. Et tap på en tom del af artiklen eller det eksisterende nodeark viser/skjuler betjeningen. Links og interaktive felter forbliver klikbare. Når panelerne er synlige, kan man afslutte fokus via den almindelige topknap; på Mac virker **Escape** stadig. Dette er verificeret med en simuleret browser-runtime i CI, ikke endnu en manuel iPad-test.

## Tosproget HUPedia-eksport (SitePublisher 0.1.10-test.1)

SitePublisher læser den engelske tekst fra HUPedias `text-en` og bevarer samtidig de ældre HUWiki-felter `huwiki-text-en`/`huwiki-text-da`. Valget følger TiddlyWikis eksisterende `$:/language` og ændrer ikke brugerens artikelkilde. Forhåndsvisningen og artikeloversigten bruger samme sprog som HTML-eksporten. Mangler der en oversættelse, eksporteres grundteksten. PDF Publisher arbejder fra den viste artikel i TiddlyWiki og bruger ikke denne kildeudvælger.
