# Repertoire: fra mange visninger til én nodepult

Analyse og implementeringsgrundlag, 27. november 2026.

## Arbejdsgange

| Situation | Kapelmester / dirigent | Musiker |
| --- | --- | --- |
| Forberedelse | Find arrangementer og ledige stemmer; opret en dateret sætliste; sæt rækkefølge, toneart, tempo, form, besætning og indsatser | Find den relevante nodemappe og egen stemme; se hvilke nodeudgaver der findes |
| Individuel øvning | Lyt til melodi, harmoni eller en bestemt stemme; vurder form og stemmefordeling | Afspil leadsheet eller guitar-ABC; vælg akkompagnement og lydstyrker; dæmp egen stemme; justér øvetempo |
| Prøve | Del samme rækkefølge og spilleaftaler; slå partitur eller leadsheet op; skift hurtigt mellem numre | Læs egen PDF eller ABC; blad mellem sider og numre; følg dirigentens aftaler |
| Koncert | Åbn partitur og sætliste; læs indsatser; hold rækkefølgen synlig | Åbn egen nodemappe én gang; brug fuldskærm og to sider; blad uden at miste valgt nodeudgave |

Rollerne er arbejdssituationer, ikke konti eller adgangsrettigheder. Samme bruger kan skifte mellem dem.

## Fund i de publicerede wikier og komponenterne

1. Forside, repertoireværksted, direkte nummer, leadsheetkilde, Nodebog, ABC's Vis/Øv og den særskilte PDF-læser udgør forskellige indgange med forskellige knapper.
2. ABC's `Vis noder` åbner et ekstra lag i hele vinduet. Det skjuler afspilning i Vis og viser den i Øv. Nodebogen starter automatisk dette lag, så dens egne knapper kan blive dækket.
3. Direkte PDF-numre har iframe-navigation; direkte ABC-numre har nodeeditorens værktøjer. De har ikke samme adgang til fuldskærm, spilleaftaler eller nummerliste.
4. Nogle guitar-ABC-numre har endnu en nodevisning gemt inde i en fold med overskriften original PDF. Samme titel kan derfor vise flere afspillere og to forskellige arrangementer.
5. Repertoirekort ændrer sætlister ved klik. Den adfærd er nyttig under planlægning, men uhensigtsmæssig som musikerens almindelige nummeroversigt.
6. Format, instrument, sidetal, mappens standard og det enkelte nummers undtagelse er samlet i en lang værktøjslinje. Eksport og udgivelse fylder, før musikeren overhovedet kan læse noder.
7. En PDF er ikke en afspillelig nodekilde. Et tilhørende leadsheet kan levere lyd, men kan have en anden form end PDF-arrangementet. Det skal fremgå, hvilken udgave der høres; PDF-sider må ikke foregive at følge denne lyd.

## Beslutninger

- Én nodepult til både et enkelt nummer og en nodemappe. Direkte links til en kilde vælger den tilsvarende nodeudgave i samme nodepult.
- En rolig indgang med Nodemapper og Numre. Et klik åbner noder; redigering af sætlister er et udtrykkeligt valg.
- Afspilleren bliver på samme sted, når der findes en ABC-udgave. Ingen ekstra Vis/Øv-tilstand skal aktiveres for at få adgang til lyd.
- Lyd og akkompagnement samles bag én tydelig knap. Spil selv ligger ved afspilleren. Foldene ændrer synlighed, ikke musikkens afspilningstilstand.
- Fuldskærm tilhører nodepulten. Skift af nummer eller nodeudgave beholder den.
- PDF-visning kan bruge en tilknyttet ABC-udgave som lyd. Lydkilden navngives særskilt, og manglende PDF-synkronisering fremgår. Rene PDF-numre viser en begrundet, inaktiv afspilningsknap.
- Nummerets nodeudgave vælges tæt på titlen. Mappens standard, sidetal, udskrift og øvrige værktøjer samles i en fold.
- Originalfiler og kildehenvisninger bevares, men ligger i en selvstændig fold frem for at montere endnu en visning.
- Eksisterende sæt, original ABC, PDF-filer og spilleaftaler bevares. Ingen nye dubletter af musik eller sætlister oprettes ved læsning.

## Acceptkriterier

Test med Birdlands 34 leadsheets, de fire guitar-ABC-arrangementer, originale guitar-PDF'er, et fuldt partitur og et nummer uden ABC. Kontrollér direkte links, blandede mapper, standardvalg og undtagelser, afspilning, lydvalg, sideskift, fuldskærm, redigering og tilbagevenden. Kontrollér også at visninger ikke ændrer rækkefølge eller originalnoder, og at kun én afspiller lever ad gangen.

Den forbundne browserstyring var ikke tilgængelig under gennemgangen. Grundlaget er de aktuelle publicerede tiddlere, visningskoden og komponent-/renderingstests. En visuel afprøvning i den faktiske Mac/iPad-browser er derfor en særskilt begrænsning, som ikke må omtales som gennemført.
