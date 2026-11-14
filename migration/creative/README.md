# Oprindelige kreative HUWiki-pakker

Disse gzip/base64-kilder er udtrukket fra brugerens `HUWiki-OAuthLab-backup.zip`. `provenance.json` registrerer arkivets SHA-256 samt hver ukomprimeret kildes størrelse og SHA-256. Build-scripts verificerer disse før tilpasning.

- Slideshow 0.8.39 er samlet med originalkildens rene pakkefunktion og de indlejrede vendorbiblioteker. Den ældre 0.8.33 fra CutOut-blokken anvendes ikke.
- Excalidraw 0.3.4 og React 1.0.0 er rekonstrueret fra TegneAsset-delene. Den fælles tegnepakke bruger 0.3.4, som CutOut-broen forventer. Ingen parallel motor.
- PasteUp 0.1.8, Theatre 0.6.1, CutOut–Excalidraw 0.1.0 og de 355 CutOut-ressourcer kommer fra de oprindelige CutOut-assetkonstanter.
- Den oprindelige danske tegnepakke er bevaret. Dens engine-overrides ligger nu i den fælles engine, så sammensætning af Editions ikke afhænger af pluginrækkefølgen.

Build: `node scripts/build-creative.mjs`, `node scripts/build-slideshow.mjs`, `node scripts/build-cutout.mjs`. Tilføj `--check` for kun at kontrollere resultatet.

Ophav og licenser er bevaret. PasteUp: Eric L. Shulman/HUWiki, CC BY-NC-SA 4.0. Excalidraw og React beholder deres oprindelige licenstiddlere. Slideshow, CutOut, Theatre og tegnebroen angiver ikke en samlet licens i de oprindelige pakker; ingen licens er opfundet. De indlejrede bibliotekers egne licenstekster er uændrede.
