ForgeShare — testudgave / test release 0.1.7

DANSK

1. Pak hele ZIP-filen ud.
   Mac: åbn ForgeShare.app.
   Windows: åbn ForgeShare.exe. Lad ForgeShare.mjs blive i samme mappe.
   Linux: åbn Start-ForgeShare.sh; tillad om nødvendigt kørsel i filens
   egenskaber. Linux-dialogerne kræver Zenity.
2. Dine wikier findes automatisk. Vælg dem, og tryk “Del”.
   HTML-wikier klargøres i baggrunden. Delingsindstillinger huskes.
   “Åbn” åbner én wiki lokalt. “Tilføj” finder en manglende wiki.
3. Markér de wikier, du vil have med i en oversigt. Tryk “Eksportér valgte”.
   Vælg om delingsadresser skal med, og gem en ny JSON-fil.
   Træk filen ind i din wiki, gennemse importen, og vælg “Importér”.
   Åbn “Mine wikier / My wikis”. Ingen automatisk opdatering.
4. “Stop” afslutter kun den valgte serverwiki. Den bliver på listen.
   På Linux vælger du funktionerne i hjælperens menu; OK/Annuller i
   statusvinduet stopper den kørende wiki.

Mac og Windows åbner ikke Terminal. Lokale HTML-filer bruger fortsat
browserens/wikiens egen gemmemetode. Appen overtager ikke gemningen.
Installer Node.js til hjælperen. Tailscale behøves kun ved deling via Tailscale:
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

Gem og luk HTML-wikien før deling. Efter kontrolleret klargøring flyttes
originalen til papirkurven. Biblioteket beholder kun den klargjorte wiki.
Du kan fortsat eksportere HTML til offlinebrug. Standarddeling er Tailscale
uden ekstra wiki-login. Skift netværk og adgang under “Deling”.
Ved Tailscale-deling skal deltagerne have Tailscale. Begræns gæsteadgang
til den ønskede wiki før invitation. Tag backup, og aftal hvem der redigerer samme artikel.

ENGLISH

1. Extract the complete ZIP.
   Mac: open ForgeShare.app.
   Windows: open ForgeShare.exe. Keep ForgeShare.mjs in the same folder.
   Linux: open Start-ForgeShare.sh; allow execution in its properties
   if needed. Linux dialogs require Zenity.
2. Your wikis are found automatically. Select them and press “Share”.
   HTML wikis are prepared in the background. Sharing settings are remembered.
   “Open” opens one wiki locally. Use “Add” for a missing wiki.
3. Check the wikis to include in an overview. Select “Export selected”.
   Choose whether to include shared addresses and save a new JSON file.
   Drag it into your wiki, review the import and select “Import”.
   Open “Mine wikier / My wikis”. There is no automatic update.
4. “Stop” ends only that server wiki. It stays in the library.
   On Linux, choose actions from the helper menu; OK/Cancel in its
   status window stops the running wiki.

Mac and Windows do not open a terminal. Local HTML files still use the
browser/wiki’s existing save method; the app does not take over saving.
Install Node.js for the helper. Tailscale is needed only for sharing through Tailscale.

The test app has no publisher certificate yet:
• Mac: if blocked as unidentified, you can approve this particular app
  under System Settings → Privacy & Security → Open Anyway,
  if you trust this download.
• Windows: SmartScreen may offer More info → Run anyway. Use this only
  if you trust the file. Smart App Control or computer policy may block
  it entirely.
Do not disable general protections. Get help if it stays blocked.

Save and close an HTML wiki before sharing. After verified preparation,
the original moves to Trash; the library keeps just the prepared wiki.
You can still export HTML for offline use. Default sharing is Tailscale
without extra wiki login. Change network and access under “Sharing”.
For Tailscale sharing, invitees need Tailscale. Restrict guest access to
the intended wiki before inviting. Keep backups and agree who edits each article.

Official help / Officiel hjælp:
https://support.apple.com/en-us/102445
https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation

Original HUWiki code. Licensing awaits the project's decision.

Find eksisterende wikier / Find existing wikis
Tilføj → Find wikimapper søger i Wikis, Dokumenter, Skrivebord og Overførsler. Vælg de fundne mapper, du vil have på listen. Søg i en anden mappe er også muligt.
Add → Find wiki folders searches Wikis, Documents, Desktop and Downloads. Select the suggestions to add. Search another folder is also available.
Søgningen starter ingen wiki eller deling. / Searching starts no wiki or sharing.

Del / Share
Vælg Tailscale eller Hjemmenetværk, og vælg med eller uden wiki-login. Du bestemmer selv adgangskodens længde. Alle med adgang kan læse og redigere. Appen viser linket og Kopiér adresse. Hjemmenetværk kræver ingen Tailscale og bruger HTTP uden kryptering; brug det kun på et betroet netværk.
Choose Tailscale or Home network, then with or without wiki login. You choose the password length. Everyone with access can read and edit. The app shows the link and Copy address. Home network needs no Tailscale and uses unencrypted HTTP; use it only on a trusted network.
