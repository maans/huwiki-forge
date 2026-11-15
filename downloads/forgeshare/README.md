# ForgeShare — Mac download, setup guide and release status

[English](#english) · [Dansk](#dansk)

## English

**Current public test: ForgeShare 0.1.18 for Mac.** Status reviewed 15 November 2026.

**[Download ForgeShare for Mac (.zip)](https://forge.måns.dk/downloads/forgeshare/ForgeShare-mac-0.1.18-test.zip)**

### Which file is which?

The **ZIP** contains the real `ForgeShare.app`, including its helper modules and offline Danish/English help. The **JSON** in [Forge Plugin Library](https://forge.måns.dk/library/plugins/index.html) is only an **optional TiddlyWiki guide plugin**; importing it does not install the Mac app or launch a server. This README is the single reference for installation, current status and versions.

### Getting started on Mac

1. Install [Node.js](https://nodejs.org/en/download), required for TiddlyWiki's Node.js server.
2. Download and fully extract the Mac ZIP, then open `ForgeShare.app`. The app is ad hoc signed but **not Developer ID signed or notarized**; macOS may require per-app approval under **System Settings → Privacy & Security**. Run this test software only if you trust its origin.
3. Select or add an HTML wiki or wiki folder and choose **Open**. **Tailscale is not needed** for local operation.
4. For private sharing, configure [Tailscale](https://tailscale.com/download) on participating devices and choose **Share** for your own private tailnet. Public Funnel sharing is not verified.
5. Use **Stop** to end a session. Back up your wikis before testing.

### Status – 15 November 2026

| Feature | Status |
| --- | --- |
| Local TiddlyWiki Node server on Mac, without Tailscale | Tested on Mac |
| Private Tailscale VPN sharing | Tested with Mac and iPad |
| Public Tailscale Funnel | **Not verified** |
| AI Edition connection bridge | Experimental; setup and approval required. Image operations unverified |
| Windows | **No public download.** Microsoft Defender blocked a previous 0.1.18 test as `Trojan:Script/Wacatac.B!ml`; detection unresolved. Do not bypass antivirus |
| macOS signing | Not Developer ID signed or notarized; use at your own risk |

### Version history and development

- **0.1.18-test:** Public Mac ZIP above; contains `ForgeShare.app`, not the blocked Windows test executable.
- **0.1.17 and earlier:** Development builds in [draft PR #8](https://github.com/maans/huwiki-forge/pull/8) and its [technical changelog](https://github.com/maans/huwiki-forge/blob/feat/forgeshare-tailscale/plugins/forgeshare/CHANGELOG.md).
- **Future versions:** Publish a versioned Mac ZIP and update **this page** before changing the front-page download.

[Forge homepage](https://forge.måns.dk/) · [ForgeShare development PR #8](https://github.com/maans/huwiki-forge/pull/8).

---

## Dansk

**Aktuel offentlig testudgave: 0.1.18 til Mac.** Status gennemgået 15. november 2026. ForgeShare er testsoftware, ikke en færdig eller officielt signeret udgivelse.

**[Hent ForgeShare til Mac (.zip)](https://forge.måns.dk/downloads/forgeshare/ForgeShare-mac-0.1.18-test.zip)**

### Hvad henter jeg?

**ZIP-filen** indeholder selve Mac-applikationen, `ForgeShare.app`, med dens hjælpefiler og indbyggede dansk/engelske hjælp. **JSON-filen** i [Forge Plugin Library](https://forge.måns.dk/library/plugins/index.html) er derimod et valgfrit **TiddlyWiki-plugin med vejledning**. Det er ikke et Mac-program. Import af pluginet starter ingen server, og pluginet er ikke nødvendigt for at køre ForgeShare på Mac.

Denne README er den fælles kilde til **installationsvejledning, offentlig teststatus og versioner**. Forsiden linker direkte hertil, så status kan vedligeholdes ét sted.

### Sådan bruges Mac-programmet

1. Sørg for, at [Node.js](https://nodejs.org/en/download) er installeret. Det bruges til TiddlyWikis egen server.
2. Hent ZIP-filen ovenfor, pak den **helt** ud, og åbn `ForgeShare.app`. Appen er ad hoc-signeret, men **ikke Apple Developer ID-signeret eller notariseret**. macOS kan kræve manuel godkendelse i **Systemindstillinger → Anonymitet og sikkerhed**. Brug kun programmet, hvis du stoler på kilden.
3. Vælg eller tilføj din lokale wiki (HTML-fil eller wiki-mappe), og tryk **Åbn**. Det starter TiddlyWikis lokale Node.js-server. **Tailscale behøves ikke** til lokal brug.
4. Vil du dele privat, skal [Tailscale](https://tailscale.com/download) være installeret og konfigureret på de relevante enheder. Vælg **Del** for at bruge dit eget private Tailscale-netværk; del kun med betroede deltagere. Offentlig Funnel-deling er endnu ikke verificeret.
5. Brug programmets **Stop**-funktion til at afslutte en aktiv server eller deling. Tag backup af wikier før afprøvning.

### Status – 15. november 2026

| Funktion | Status |
| --- | --- |
| Lokal TiddlyWiki-server på Mac uden Tailscale | Afprøvet på Mac |
| Privat deling med Tailscale-VPN | Afprøvet på Mac og iPad |
| Offentlig Tailscale Funnel | **Ikke verificeret** |
| Forbindelsesbro til AI Edition | Testfunktion; kræver opsætning og godkendelse. Billedfunktioner er ikke verificeret |
| Windows | **Ingen offentlig download.** En tidligere Windows 0.1.18-test blev blokeret af Defender som `Trojan:Script/Wacatac.B!ml`. Detektionen er uafklaret. Omgå ikke antivirus |
| macOS-sikkerhed | Ikke Developer ID-signeret eller notariseret; test på eget ansvar |

### Versioner og videre udvikling

- **0.1.18-test:** Den offentlige Mac-ZIP ovenfor. ZIP'en indeholder `ForgeShare.app` og dens hjælpefiler – ikke Windows-programmet.
- **0.1.17 og tidligere:** Udviklingsudgaver, dokumenteret i [PR #8](https://github.com/maans/huwiki-forge/pull/8) og [ændringsloggen](https://github.com/maans/huwiki-forge/blob/feat/forgeshare-tailscale/plugins/forgeshare/CHANGELOG.md).
- **Fremtidige Mac-versioner:** Tilføj en ny versionsmærket ZIP og opdatér denne side, før forsidens download ændres.
