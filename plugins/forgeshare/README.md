# ForgeShare – offentlig Mac-test (0.1.18)

Dette er den **afgrænsede Mac-testudgave** af ForgeShare. Den er tilgængelig fra Forge-forsiden som et selvstændigt TiddlyWiki-plugin med en dansk/engelsk vejledning og en særskilt Mac-hjælpeapp. Pluginet er dokumentation og downloadindgang; serverfunktionerne ligger i Mac-programmet.

- Mac ZIP: `/downloads/forgeshare/ForgeShare-mac-0.1.18-test.zip`. Pak hele ZIP-filen ud. Mac-programmet er **ikke Apple Developer ID-signeret eller notariseret** og kan kræve manuel godkendelse. Brug på eget ansvar; tag backup af wikier.
- **Åbn:** lokal TiddlyWiki Node.js-server, uden Tailscale. **Del:** privat Tailscale-VPN med inviterede deltagere, afprøvet på Mac/iPad. Serverdrift kræver Node.js, og privat deling kræver Tailscale.
- **Funnel:** offentlig deling er stadig under fejlsøgning og må ikke beskrives som verificeret.
- **Windows:** Ingen Windows-download fra den offentlige forside eller denne pluginpakke. Tidligere Windows-udgave udløste `Trojan:Script/Wacatac.B!ml` i Microsoft Defender; detektionen er uafklaret. Anbefal ikke at omgå antivirus eller installere en ikke-godkendt Windows-build.
- **AI Edition:** AI Forge 0.4.0 understøtter tekstsamtaler via lokale modeller eller godkendte ForgeShare-forbindelser. Delte AI-forbindelser kræver hjælper og godkendelse i Vault; billedfunktioner er ikke godkendt via broen.

Den fulde udvikling fortsætter i [PR #8](https://github.com/maans/huwiki-forge/pull/8). Den offentlige Mac-test er en særskilt, kurateret pakke uden Windows-binærfiler og uden automatisk installation eller deling. Forbedringerne er endnu ikke en generel Windows-release.
