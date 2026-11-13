ForgeShare 0.1.0-test.2 — Mac / Windows / Linux

DANSK
1. Hent og installer Node.js fra https://nodejs.org/en/download og Tailscale fra
   https://tailscale.com/download. Følg deres installationsprogrammer, og log
   ind i Tailscale. Linux: brug din distributions vejledning/programbutik.
2. Pak ALLE filer ud sammen. Mac: åbn Start-ForgeShare.command.
   Windows: åbn Start-ForgeShare.cmd. Linux: kør Start-ForgeShare.sh; dialogerne
   kræver Zenity, som kan installeres via programbutikken.
3. Følg dialogboksene. Hvis TiddlyWiki mangler, kan du godkende installation
   af den testede version 5.4.1. Intet installeres uden dette særskilte valg.
4. Vælg en gemt wiki efter navn, eller tilføj en forberedt wikimappe med navn. En HTML-fil skal først kopieres til
   en serverwiki som beskrevet under Avanceret hjælp i pluginet. Denne første
   opsætning kan kræve hjælp; scriptet konverterer ikke automatisk HTML.
5. Vælg brugernavn og adgangskode. Hjælperen laver selv en privat midlertidig
   loginfil. Bekræft til sidst delingen, kopiér adressen og åbn den selv.
6. Lad statusdialogen stå åben. OK/Annuller stopper KUN denne wiki og loginet.
   Åbn hjælperen igen for at starte en anden wiki samtidig. Den husker navne
   og adresser; du skal ikke vælge porte. Kør aldrig samme mappe i to servere.
   Alle inviterede skal have Tailscale. Kontroller først, at de kun får adgang
   til wikien og ikke dine øvrige tjenester.

Et terminalvindue kan stå bag dialogerne, men du skal ikke skrive i det.
Mac/Linux kan kræve kørselsrettigheder efter udpakning:
  chmod u+x Start-ForgeShare.command    (Mac)
  chmod u+x Start-ForgeShare.sh         (Linux)
Følg systemets normale sikkerhedskontrol; deaktiver ikke beskyttelsen.
Dette er en testhjælper i kildekode, ikke en signeret app med indbygget Node.js.
Hjælperen åbner ingen hjemmeside og spørger aldrig efter dit Tailscale-login.

ENGLISH
1. Install Node.js from https://nodejs.org/en/download and Tailscale from
   https://tailscale.com/download using their installers, then sign in to
   Tailscale. Linux: use your distribution's instructions/software manager.
2. Extract ALL files together. Mac: open Start-ForgeShare.command.
   Windows: open Start-ForgeShare.cmd. Linux: run Start-ForgeShare.sh;
   its dialogs need Zenity, available through your software manager.
3. Follow the dialogs. If TiddlyWiki is missing, you can separately approve
   installing the tested version 5.4.1. Nothing installs without that choice.
4. Choose a saved wiki by name, or add a prepared wiki folder with a name. An HTML file first needs a server
   copy; see Advanced help in the plugin. First setup may require help; this
   script does not automatically convert HTML.
5. Choose a username/password. The helper creates a private temporary login
   file. Finally confirm sharing, copy the address and open it yourself.
6. Keep the status dialog open. OK/Cancel stops ONLY this wiki and its login.
   Open the helper again to run another wiki alongside it. Names and addresses
   are remembered; no port selection is needed. Never run one folder twice.
   Invitees need Tailscale. First verify they can access only your wiki,
   not other services on your computer.

A terminal window may stay behind the dialogs, but no typing is needed in it.
Mac/Linux extraction may require executable permissions (examples above).
Follow normal OS checks; do not disable protection. This is a source-code test
helper, not a signed app with bundled Node.js. It opens no website and never
asks for your Tailscale login.

TECHNICAL / TEKNISK
- node ForgeShare.mjs: advanced terminal mode; supply your own protected CSV.
- node ForgeShare.mjs --gui: dialogs; temporary private login, removed on exit.
- The GUI uses one shared wiki login per session. Terminal CSV supports
  multiple accounts. Tailscale accounts always remain individual.
- Tested TiddlyWiki: 5.4.1. Node.js: 20+. Tailscale: modern Serve CLI (1.52+).
- Wiki tiddlywiki.info must include tiddlywiki/tiddlyweb + tiddlywiki/filesystem.
- Credentials CSV: username,password header, one account per row, 12+ character
  passwords, no quotes/commas/newlines in values, unique simple usernames.
- Keep CSV outside the wiki. Mac/Linux: chmod 600, owned by you. Windows:
  restrict file ACLs to your account; this helper cannot verify Windows ACLs.
- Every CSV account receives read/write access. Use manual TW readers/writers
  for different permissions. Restrict Tailscale grants/ACLs to intended people
  and the selected wiki HTTPS port shown in the confirmation. No policy changes.
- Each wiki gets an available local 20000-20999 and HTTPS 21000-21999 port.
  The server binds only 127.0.0.1; Serve is foreground. Existing OS listeners,
  Serve/Funnel/Foreground/Services and saved assignments are skipped.
- wikis.json in your ForgeShare app-data folder stores names, paths and ports,
  not passwords. Copies of the helper under your account share the list.
  Mac: ~/Library/Application Support/ForgeShare
  Windows: %LOCALAPPDATA%/ForgeShare
  Linux: $XDG_DATA_HOME/ForgeShare, normally ~/.local/share/ForgeShare
- Saved addresses never move silently: if another service takes one, startup
  is refused. Changing the address needs help with saved assignments, sharing
  rules and links. Do not run the same folder in a manually started server.
- Locks prevent duplicate starts and coordinate catalogue changes. Confirmed
  dead owners can be recovered. If a lock remains after all helpers exit, get
  assistance inspecting the locks subfolder; do not delete active locks.
- Existing AI mappings 443 -> 11434 and 8443 -> 1234 remain untouched.
- Occupied saved ports, unknown Serve formats and anonymous access cause refusal.
- No Funnel, serve reset, --bg or automatic browser opening. GUI mode may
  install pinned TiddlyWiki via npm only after separate explicit approval.
- Do not change Serve concurrently in another terminal. No global rollback is
  attempted; only child processes owned by this helper are stopped.
- Back up before use. Avoid simultaneous edits of the same tiddler.
- Native Windows/Linux execution and real Tailscale acceptance must be checked
  on those systems before release; mocked automated tests are not that test.

Original HUWiki code. Licensing awaits the project's decision.
