# ForgeShare 0.1.19 — installationsvejledning / installation guide

Denne vejledning gælder testudgaven **0.1.19**. ForgeShare er et separat hjælpeprogram, ikke noget der installeres ved at importere AI Forge- eller ForgeShare-pluginet i TiddlyWiki.

## Dansk

### Hent og åbn ForgeShare

1. Hent den nyeste pakke fra [ForgeShares downloadside](README.md): **Windows (grafisk EXE)**, **Windows Node Edition**, **Mac** eller **Linux**. Hent fra projektets egen Forge/GitHub-side og ikke fra et tilfældigt link.
2. Installer [Node.js 20 eller nyere](https://nodejs.org/en/download) på computeren, der skal være vært for wikien. Pak hele ForgeShare-ZIP-filen ud i en almindelig mappe. Start ikke programmet inde fra ZIP-filen.
3. **Windows (grafisk):** Dobbeltklik på `ForgeShare.exe` som almindelig bruger. Det er ikke nødvendigt at vælge **Kør som administrator** på den Windows-computer, hvor 0.1.19 er afprøvet.
4. **Windows (Node Edition):** Dobbeltklik på `Start-ForgeShare.cmd`. Den udgave indeholder ikke `ForgeShare.exe` og benytter den installerede Node.js og Windows PowerShell/DPAPI til nøgleboksen. Node-udgaven er endnu ikke fysisk accepttestet.
5. **Mac:** Åbn `ForgeShare.app`. **Linux:** Brug `Start-ForgeShare.sh` (kræver også Zenity og en fungerende Secret Service/nøgleboks).

### Første sikkerhedsgodkendelse

**Windows:** Den normale EXE er endnu ikke signeret af en verificeret udgiver. Windows kan derfor vise en SmartScreen-advarsel om en *ukendt app/udgiver*. Kontroller først at ZIP-filen kommer fra Forge-projektets downloadside. Hvis advarslen alene handler om manglende udgiveromdømme, og du efter egen kontrol vil afprøve denne konkrete testfil, kan Windows tilbyde **Flere oplysninger → Kør alligevel**. Det er en godkendelse af den konkrete app, ikke en grund til at køre den som administrator.

**Vigtig forskel:** Hvis Microsoft Defender Antivirus angiver en konkret trussel eller sætter filen i karantæne (f.eks. et Trojan-navn), **stop**. Slå ikke Defender fra, gendan ikke filen fra karantæne, og tilføj ikke undtagelser. En tidligere usigneret Windows-testpakke udløste `Trojan:Script/Wacatac.B!ml`; den detektion er endnu ikke afklaret. Hvis Windows' organisation-/Smart App Control-politik blokerer installationen, skal du respektere blokeringen.

**Mac:** Hvis macOS stopper den ikke-notariserede app på grund af en ukendt udvikler, så forsøg først at åbne appen, gå derefter til **Systemindstillinger → Anonymitet & sikkerhed → Åbn alligevel**, og bekræft, *hvis du har kontrolleret og har tillid til filen*. Det giver en undtagelse for appen og er ikke det samme som at slå den generelle beskyttelse fra.

Officielle vejledninger: [Microsoft om SmartScreen og usignerede apps](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [Microsoft om Beskyttelsesoversigt og malwareadvarsler](https://support.microsoft.com/da-dk/windows/security/windows-security/protection-history-in-the-windows-security-app), [Apple om at åbne en app fra en ukendt udvikler](https://support.apple.com/en-us/102445).

### Åbn og del en wiki

1. Vælg eller tilføj en HTML-wiki eller wikimappe i **Bibliotek**. Vælg **Åbn** for at bruge den lokalt; Tailscale er ikke nødvendigt til lokal brug.
2. Hvis du vil dele privat, skal [Tailscale](https://tailscale.com/download) være forbundet på værtscomputeren og den anden enhed. Vælg **Del**, vælg privat Tailscale-deling og følg programmets login-/adgangsvalg. Del kun det udleverede link med de tilsigtede personer.
3. Åbn adressen i browseren på den anden enhed. Opret og gem en lille test-tiddler. Åbn den samme serverwiki på værtscomputeren og kontroller ændringen; prøv også den modsatte vej. Det er **fælles redigering af én serverwiki**, ikke automatisk synkronisering af to selvstændige HTML-filer.
4. Afslut delingen med **Stop** i ForgeShare. Tag almindelige backupkopier af wikien. AI Forge-billeder, som gemmes lokalt via ForgeShare, ligger **uden for** wikiens HTML-backup.

**Afprøvet 16. november 2026:** Projektets ejer brugte den almindelige Windows-EXE 0.1.19 med privat Tailscale og Chrome på iPad. Tiddlere oprettet og gemt fra begge enheder kunne læses fra den anden. Den samme EXE virkede også startet som almindelig Windows-bruger uden administratorrettigheder efter den nødvendige godkendelse af en usigneret app. Dette beviser ikke, at offentlig Funnel, Windows Node Edition eller AI-billedanalyse med Gemma 4 er fysisk afprøvet.

---

## English

### Download and start ForgeShare

1. Download ForgeShare **0.1.19** from the [official project downloads](README.md), choosing **Windows native EXE**, **Windows Node Edition**, **Mac** or **Linux**. Avoid unverified third-party copies.
2. Install [Node.js 20 or later](https://nodejs.org/en/download) on the computer hosting the wiki. **Extract the entire ZIP** into a normal folder; do not run the program directly inside the archive.
3. **Windows native:** Double-click `ForgeShare.exe` as a normal user. **Run as administrator** was not needed on the Windows PC used for physical acceptance.
4. **Windows Node Edition:** Double-click `Start-ForgeShare.cmd`. This package has no `ForgeShare.exe` and uses installed Node.js plus PowerShell/Windows DPAPI for the Vault. This variant still needs physical acceptance testing.
5. **Mac:** Open `ForgeShare.app`. **Linux:** Run `Start-ForgeShare.sh` (also requires Zenity and a working Secret Service).

### First-run security prompt

**Windows:** The native executable is unsigned. SmartScreen may warn that it is an *unrecognized app or publisher*. Verify the download source before proceeding. If this is solely an unknown-publisher/reputation warning, and you consciously trust this specific file, Windows may offer **More info → Run anyway**. Approving the app is separate from running with elevated administrator rights.

If **Defender Antivirus detects malware or quarantines the file**, **stop**. Do not disable protection, restore quarantined files or add antivirus exclusions. A previous test build was detected as `Trojan:Script/Wacatac.B!ml`, which remains unresolved. Respect managed-device and Smart App Control restrictions.

**Mac:** For an unnotarized app blocked as an unidentified developer, try opening it first. If you have verified the file and still choose to proceed, use **System Settings → Privacy & Security → Open Anyway** and confirm the app-specific exception. Do not weaken system-wide security.

Official instructions: [Microsoft on SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [Microsoft on Defender Protection History](https://support.microsoft.com/en-us/windows/security/windows-security/protection-history-in-the-windows-security-app), [Apple on opening an unidentified-developer app](https://support.apple.com/en-us/102445).

### Open and share a wiki

1. In **Library**, add or choose an HTML wiki or server wiki. Select **Open** for local use; Tailscale is not needed.
2. For private access, connect both the host and other device to [Tailscale](https://tailscale.com/download), select **Share** and configure the private tailnet and wiki login/access options.
3. Open the provided address on the other device. Create and save a test tiddler; verify it on the host. Repeat in the other direction. This edits **one shared server wiki**; it does not synchronize two separate HTML files.
4. Use **Stop** to end sharing. Back up the wiki and, if using AI Forge local images, the ForgeShare-hosted media separately.

**Physically tested 16 November 2026:** The project owner used ForgeShare 0.1.19's native Windows EXE over private Tailscale to Chrome on an iPad. Tiddlers created and saved from either device were visible from the other. The same Windows app also ran without administrator elevation after the unsigned-app approval. This is **not** a live acceptance test for public Funnel, Windows Node Edition, or Gemma 4 image analysis.
