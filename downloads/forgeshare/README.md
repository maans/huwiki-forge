# ForgeShare 0.1.19 — Mac, Windows and Linux beta downloads

[English](#english) · [Dansk](#dansk)

## English

**[Step-by-step setup and unsigned-app approval guide](HOWTO.md#english)** — includes Windows, Mac, first-run warnings and a private Tailscale sharing test.

**Physical acceptance, 16 November 2026:** The regular Windows 0.1.19 EXE was opened by the project owner without administrator elevation (following a first-run unsigned-app confirmation). Chrome on an iPad reached a HUPedia server wiki over private Tailscale, and tiddlers saved from Windows and iPad appeared on the other device. This verifies shared editing of one server wiki, not sync between independent HTML files.


**ForgeShare 0.1.19 test packages (16 November 2026).** Choose the archive for your computer; each is a standalone download, not part of the TiddlyWiki plugin JSON.

- [Mac app — ForgeShare 0.1.19](./ForgeShare-mac-0.1.19-test.zip)
- [Windows app (.exe) — ForgeShare 0.1.19](./ForgeShare-windows-0.1.19-test.zip)
- [Windows Node Edition (no ForgeShare.exe) — ForgeShare 0.1.19](./ForgeShare-windows-node-0.1.19-test.zip)
- [Linux — ForgeShare 0.1.19](./ForgeShare-linux-0.1.19-test.zip)

Install a supported Node.js version (20 or later) from [nodejs.org](https://nodejs.org/en/download). Extract the ZIP **completely** and keep its files together. For Mac, open `ForgeShare.app`; for Windows choose `ForgeShare.exe` or `Start-ForgeShare.cmd` from the Node edition. On Linux, launch `Start-ForgeShare.sh` and install Zenity and a Secret Service implementation. Tailscale is optional for local Open, but required for private tailnet sharing.

**AI:** The new helper supports approved Gemini API-key connections via Google AI Studio, OpenAI, local LM Studio/Gemma and Ollama. AI Forge **0.4.2** is required for image analysis and per-wiki local media. Approve each wiki/device in ForgeShare Vault. Image *generation* through the Vault is not implemented. Saved media is on the hosting computer outside wiki HTML backups; back it up separately.

**Verification:** GitHub Actions verifies build integrity, unit tests and a simulated GUI/browser workflow. Real Mac/iPad/Tailscale/Gemma 4 image analysis must still be accepted on the user's devices. The Windows app is unsigned; a previous Windows build triggered Defender `Trojan:Script/Wacatac.B!ml`. This diagnosis remains unresolved. Do not disable or bypass antivirus. The Node edition is a separate alternative, **not a guarantee** against security warnings. Mac is ad-hoc signed, not Developer ID signed or notarized.

[Previous Mac 0.1.18 test](./ForgeShare-mac-0.1.18-test.zip) · [Source and build checks](https://github.com/maans/huwiki-forge/pull/36)

---

## Dansk

**[Trinvis installationsvejledning og godkendelse af usigneret app](HOWTO.md#dansk)** — Windows, Mac, første åbning og test af privat Tailscale-deling.

**Praktisk afprøvet 16. november 2026:** Den almindelige Windows 0.1.19-EXE blev startet uden administratorrettigheder efter godkendelse af en usigneret app. Chrome på iPad åbnede HUPedia via privat Tailscale, og tiddlere gemt på både Windows og iPad blev vist på den anden enhed. Det er fælles redigering i én serverwiki, ikke synkronisering af separate HTML-filer.


**ForgeShare 0.1.19 – testpakker til Mac, Windows og Linux (16. november 2026).** Hver ZIP-fil hentes for sig og ligger ikke længere som indlejret program i pluginbibliotekets JSON.

- [Mac-app – ForgeShare 0.1.19](./ForgeShare-mac-0.1.19-test.zip)
- [Windows-app (.exe) – ForgeShare 0.1.19](./ForgeShare-windows-0.1.19-test.zip)
- [Windows Node Edition (uden ForgeShare.exe) – ForgeShare 0.1.19](./ForgeShare-windows-node-0.1.19-test.zip)
- [Linux – ForgeShare 0.1.19](./ForgeShare-linux-0.1.19-test.zip)

Installér først [Node.js](https://nodejs.org/en/download), version 20 eller nyere. Pak hele ZIP-filen ud, og hold filerne samlet. På Mac åbnes `ForgeShare.app`; på Windows vælges `ForgeShare.exe` eller `Start-ForgeShare.cmd` i Node-udgaven. På Linux bruges `Start-ForgeShare.sh` sammen med Zenity og Secret Service. Tailscale er valgfri til lokal Åbn, men kræves ved deling over dit private Tailscale-net.

**AI:** Den nye hjælper tilbyder godkendte Gemini-forbindelser med API-nøgle fra Google AI Studio, OpenAI, LM Studio/Gemma og Ollama. AI Forge-plugin **0.4.2** bruges til billedanalyse og lokale billeder pr. wiki. Godkend hver wiki/enhed i ForgeShares nøgleboks. Billed*generering* via nøgleboksen findes endnu ikke. Billederne ligger på værtscomputeren og følger ikke med i en almindelig HTML-backup.

**Teststatus:** GitHub Actions kontrollerer programmering, pakkefiler og simulerede brugerforløb. Billedanalyse med Mac/iPad/Tailscale/Gemma 4 kræver stadig en rigtig afprøvning. Windows-programmet er usigneret, og en tidligere udgave udløste en Defender-detektion (`Trojan:Script/Wacatac.B!ml`), som endnu ikke er afklaret. Slå ikke antivirus fra, og omgå ikke en blokering. Node-udgaven kan prøves som alternativ, men er ikke garanteret accepteret. Mac-appen er ad hoc-signeret, ikke notariseret.

[Tidligere Mac-test 0.1.18](./ForgeShare-mac-0.1.18-test.zip) · [Kildekode og testresultater](https://github.com/maans/huwiki-forge/pull/36)
