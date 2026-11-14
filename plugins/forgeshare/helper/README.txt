ForgeShare — testudgave / test release 0.1.3

DANSK

1. Pak hele ZIP-filen ud.
   Mac: åbn ForgeShare.app.
   Windows: åbn ForgeShare.exe. Lad ForgeShare.mjs blive i samme mappe.
   Linux: åbn Start-ForgeShare.sh; tillad om nødvendigt kørsel i filens
   egenskaber. Linux-dialogerne kræver Zenity.
2. Tryk “Tilføj” for at gemme en HTML-fil eller wikimappe på listen.
   Markér én wiki: “Åbn” åbner den lokalt; “Del” starter særskilt deling
   af en forberedt serverwiki. “Redigér” ændrer navn og beskrivelse.
3. Markér de wikier, du vil have med i en oversigt. Tryk “Eksportér valgte”.
   Vælg om delingsadresser skal med, og gem en ny JSON-fil.
   Træk filen ind i din wiki, gennemse importen, og vælg “Importér”.
   Åbn “Mine wikier / My wikis”. Ingen automatisk opdatering.
4. “Stop” afslutter kun den valgte serverwiki. Den bliver på listen.
   På Linux vælger du funktionerne i hjælperens menu; OK/Annuller i
   statusvinduet stopper den kørende wiki.

Mac og Windows åbner ikke Terminal. Lokale HTML-filer bruger fortsat
browserens/wikiens egen gemmemetode. Appen overtager ikke gemningen.
Installer Node.js til hjælperen. Tailscale behøves kun ved deling:
https://nodejs.org/en/download
https://tailscale.com/download

Testappen har endnu intet udgivercertifikat:
• Mac: hvis appen blokeres som ukendt, kan du godkende netop appen under
  Systemindstillinger → Anonymitet & sikkerhed → Åbn alligevel,
  når du har tillid til denne download.
• Windows: SmartScreen kan vise Flere oplysninger → Kør alligevel.
  Vælg kun dette, hvis du har tillid til filen. Smart App Control eller
  computerens politik kan blokere den helt.
Slå ikke generel beskyttelse fra. Få hjælp, hvis appen fortsat blokeres.

For at DELE en HTML-wiki skal en kopi først klargøres som servermappe.
Se hjælpen i ForgeShare. Originalen kan stadig åbnes lokalt.
Deltagerne skal have Tailscale. Begræns gæsteadgang til den ønskede wiki
før invitation. Tag backup, og aftal hvem der redigerer samme artikel.

ENGLISH

1. Extract the complete ZIP.
   Mac: open ForgeShare.app.
   Windows: open ForgeShare.exe. Keep ForgeShare.mjs in the same folder.
   Linux: open Start-ForgeShare.sh; allow execution in its properties
   if needed. Linux dialogs require Zenity.
2. Select “Add” to keep an HTML file or wiki folder in the list.
   Check one wiki: “Open” opens it locally; “Share” separately starts
   sharing a prepared server wiki. “Edit” changes its name/description.
3. Check the wikis to include in an overview. Select “Export selected”.
   Choose whether to include shared addresses and save a new JSON file.
   Drag it into your wiki, review the import and select “Import”.
   Open “Mine wikier / My wikis”. There is no automatic update.
4. “Stop” ends only that server wiki. It stays in the library.
   On Linux, choose actions from the helper menu; OK/Cancel in its
   status window stops the running wiki.

Mac and Windows do not open a terminal. Local HTML files still use the
browser/wiki’s existing save method; the app does not take over saving.
Install Node.js for the helper. Tailscale is needed only for sharing.

The test app has no publisher certificate yet:
• Mac: if blocked as unidentified, you can approve this particular app
  under System Settings → Privacy & Security → Open Anyway,
  if you trust this download.
• Windows: SmartScreen may offer More info → Run anyway. Use this only
  if you trust the file. Smart App Control or computer policy may block
  it entirely.
Do not disable general protections. Get help if it stays blocked.

To SHARE an HTML wiki, prepare a copy in a server folder first. See
ForgeShare help. The original can still be opened locally.
Invitees need Tailscale. Restrict guest access to the intended wiki before
inviting. Keep backups and agree who edits each article.

Official help / Officiel hjælp:
https://support.apple.com/en-us/102445
https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation

Original HUWiki code. Licensing awaits the project's decision.

Find eksisterende wikier / Find existing wikis
Tilføj → Find wikimapper søger i Wikis, Dokumenter, Skrivebord og Overførsler. Vælg de fundne mapper, du vil have på listen. Søg i en anden mappe er også muligt.
Add → Find wiki folders searches Wikis, Documents, Desktop and Downloads. Select the suggestions to add. Search another folder is also available.
Søgningen starter ingen wiki eller deling. / Searching starts no wiki or sharing.
