# ForgeShare / Tailscale-samarbejde

Optional, standalone TiddlyWiki 5 plugin, `0.1.13`. Adds a nontechnical Danish/English guide, official prerequisite download links, and locally downloadable helpers. Nothing is installed, shared or started by importing the plugin. It uses native `$:/language` (Danish, English fallback), with no extra language control. It uses the selected language plugin’s `name` metadata, the standard Danish ID and the existing HUWiki Danish ID (`$:/languages/huwiki-da-DK`). Native information tabs include `da-DK/readme`, `en-GB/readme` and the `HUWiki Dansk/readme` alias, plus a standalone fallback. These readmes remain readable directly from plugin JSON without unpacked shadows.

Import `dist/plugin.json`, save and reload, then open **Control Panel → ForgeShare** or the plugin readme. Forge's **Extra plugins** catalog lists it as an optional test package; no Edition includes it automatically. HTML/offline use and native savers remain available.

## Ordinary flow

1. Install Node.js for the helper. Tailscale is needed only for the Tailscale sharing option. Linux additionally needs Zenity for dialogs.
2. Download and extract the helper, then open ForgeShare.app (Mac), ForgeShare.exe (Windows) or the Linux launcher.
3. The library discovers wikis automatically. Select one item; use Add if a wiki is missing. Discovery starts no server or Tailscale process. Edit changes a name/description without changing assigned ports.
4. Open prepares HTML and starts the wiki locally, with the bridge available after approval. Share also prepares HTML in the background and starts the selected item using its remembered Sharing settings. New items ask on their first Share; settings never apply globally. Existing global settings migrate once onto existing entries. No silent LAN fallback. With wiki login enabled, credentials can optionally be remembered in the operating-system vault. Optional pinned TiddlyWiki installation still requires explicit approval.
5. Choose Export and select entries in its separate checkbox dialog (Select all / Select none). Choose names/descriptions only (default) or include last shared Tailscale or home-network addresses. Save a new JSON file and import it normally in a wiki. The localized overview and individual plain-text entry tiddlers use stable IDs for reimport. No paths, ports, credentials, unselected entries or wiki content are exported. Snapshots never claim live status; old imported entries are not automatically deleted.
6. Active library rows have their own Stop button; addresses can be copied under Sharing; stopping leaves the library entry intact. Quitting asks before ending active sessions. Linux provides the library actions through dialogs and a separate status dialog per running wiki.

The library lives in private local `library.json` beside the backwards-compatible `wikis.json` port registry. Library edits and registration use separate serialized locks. Names/locations are unique and missing files remain visible. The app opens a file/address only in response to Open; sharing alone does not launch a browser. The same-origin bridge described below exposes only approved metadata and AI operations. It exposes no management or secret-retrieval API. Metadata is refreshed on request.

Mac has a universal (Apple Silicon + Intel, macOS 13+) AppKit application with an icon. Windows has a .NET Framework WinForms GUI executable (Windows 10/11 with .NET Framework 4.8). Neither launches a console. Node.js remains a separately installed prerequisite; Tailscale is needed only for its sharing option. The short start page puts downloads first, then wiki selection and invitations, with keyboard-accessible help disclosures and responsive phone/tablet layout. Linux retains the Zenity script. All downloads are embedded and usable offline after prerequisites are installed.

These are unsigned test apps: the Mac bundle has only an ad-hoc signature for execution, no Developer ID or notarization. Per-app approval may be required. Windows SmartScreen may offer Run anyway; Smart App Control or policy can block unsigned files entirely. Instructions never disable protections globally. Native visual interaction and downloaded-file approval still need manual acceptance.

## Safety and limits

- Private Tailscale sharing checks saved addresses at every start. If an old route holds a stopped wiki or site’s previous address, the helper selects unused local ports in 20000–20999 and HTTPS ports in 21000–21999. It checks OS listeners, saved assignments and Serve/Funnel/Foreground/Services entries, including their local proxy targets. Old routes remain untouched. New assignments are remembered only after a successful start; copy the current sharing link if it changes. LAN sharing uses one explicitly selected RFC1918 IPv4 interface.
- Existing configurations, including 443 → 11434, 8443 → 1234, SSH and an old wiki on 10000 → 8080, are preserved. An existing listener on the saved local port causes refusal rather than a second server for the same content. Unknown Serve formats, mismatching settings, failed authentication checks and startup errors also cause refusal. Before/after comparison covers all unrelated Serve settings, including foreground entries.
- Names, canonical folder paths and port assignments (not credentials) are saved in `wikis.json` in the per-user ForgeShare app-data directory. Copies of the helper share that catalogue. Atomic file replacement and catalogue/session locks serialize changes and prevent duplicate helper starts. Only locks with a confirmed dead owner can be recovered; incomplete locks require inspection. Do not start a saved folder manually in another server. Separate computer accounts do not share this catalogue.
- No `serve reset`, background persistence, force/yes flags, unsolicited browser opening, policy edits, or arbitrary shell evaluation. Do not change Serve concurrently.
- The helper waits for its own child server's listening event over IPC, then checks anonymous `/status` gets HTTP 401 with login or 200 only after an explicit no-login choice. It never adopts or kills an existing service.
- Stop terminates only owned children, ends foreground Serve, then asks the wiki worker over IPC to stop accepting requests and drain pending filesystem saves. It allows 30 seconds for saves and forces termination after 35 seconds if a child cannot exit. Errors, sudden power loss and forced termination still require recovery from backup.
- When login is selected, the GUI creates a temporary, private credentials file. No-login mode creates no credentials. POSIX directory/file permissions are 700/600; Windows removes inherited permissions and grants the current SID access before writing credentials. Normal shutdown removes it. Abrupt termination may leave a private file in the system temporary directory.
- GUI mode optionally uses one shared wiki account per session, not individual authorship. Funnel uses code-only reader/editor login and a separate local owner link that always permits editing. Terminal mode accepts an external protected CSV for multiple accounts. The ordinary private/LAN login mode grants read/write access to authenticated accounts; Funnel restricts TW writers to its internal editor account.
- Machine sharing can expose other services if the tailnet's access policy is broad. Grants are additive: adding a narrow rule does not override a broad grant. The guide requires testing guest access to the selected wiki’s HTTPS port and denial on other private services. The helper does **not** verify or edit effective tailnet policy.
- The optional Messages/Meddelelser discussion pattern is documented as a pattern using separate message tiddlers. It is not bundled, required, or integration-tested.
- Installing the plugin does not change polling. The native button explicitly sets `$:/config/SyncPollingInterval=3000`; readers cannot see the write button. Save and reload each client. The guide explains the interval without promising a maximum latency or referring to a personal device setup.

## Source and build

- `src/*.tid`: readable guide, advanced help, language wrapper and style.
- `helper/ForgeShare.mjs`: dependency-free local helper, with CLI and native-dialog modes.
- `native/macos/`, `native/windows/`: native launcher/icon sources. `helper/Start-ForgeShare.sh`: Linux entry point.
- `dist/plugin.json`: installable plugin, including self-contained data-URL downloads.
- `dist/ForgeShare-*.zip`: matching helper packages, with deterministic ZIP metadata and executable modes.

Run `npm ci --ignore-scripts`, `npm run build:forgeshare`, `npm run check:forgeshare`, and `npm test` (Node.js 20+). TiddlyWiki 5.4.1 is a pinned development dependency for real rendering and isolated server tests, not shipped inside the plugin.

Headless browser checks cover the rendered start page, mobile fit, keyboard disclosures, live language refresh and exact downloadable package bytes. Tests cover source/bundle parity, native TW Danish/English rendering, native polling action/read-only behavior, downloadable ZIP/source identity, standalone HTML assembly, Serve conflicts/AI preservation, cancellation and failure cleanup, literal arguments, private temporary credentials, and real authenticated writes/readback/persistence across two HTTP clients and restart. GitHub Actions runs the helper tests on Mac, Windows and Linux; dialog answers and Tailscale are simulated. The automated test suite does not touch the user's actual Tailscale service or ports 8080/443/8443/10000. Multiwiki tests run two real isolated servers with independent content, verify one survives the other stopping, and simulate unrelated Serve/SSH/AI routes. Further tests cover name selection, persistent addresses, concurrent registrations, duplicate starts and OS conflicts.

## Manual acceptance before release

- On each OS, test adding/editing HTML and folder entries, selected export/import, local-only opening, native dialogs, cancellation, missing prerequisites, explicit TW installation, paths with spaces/non-ASCII characters, extraction permissions, status copy and stopping.
- With a backed-up test wiki and actual Tailscale, start two named wikis, verify only the selected foreground route disappears after normal stop/terminal close, the other wiki remains usable, and all pre-existing services (including 443/8443) stay unchanged. Restart by name and verify a free saved address is retained. Leave an old route using a stopped wiki/site’s saved address and verify private sharing selects new unused addresses, preserves all old routes and remembers the new link only after success. With a listener still running on the saved local port, verify the helper refuses to start a second server.
- From a separately invited user, verify allowed wiki access, denied AI access, rejected incorrect wiki credentials and revocation through Tailscale.
- Check computer/phone/tablet browser bidirectional sync, 3000 ms plus reload, drafts/conflicts, group use, and offline HTML export/restoration.
- If adding Messages, test concurrent independent messages against the actual plugin.

No production deployment or merge is part of this feature. Test status remains until these acceptance checks are complete.

## Official references

- [TiddlyWiki listen CLI](https://tiddlywiki.com/static/ListenCommand.html)
- [TiddlyWiki WebServer](https://tiddlywiki.com/static/WebServer.html)
- [Credentials](https://tiddlywiki.com/static/WebServer%2520Parameter%253A%2520credentials.html) and [authorization](https://tiddlywiki.com/static/WebServer%2520Authorization.html)
- [Tailscale Serve CLI](https://tailscale.com/kb/1242/tailscale-serve) and [Serve](https://tailscale.com/kb/1312/serve)
- [Sharing and access rules](https://tailscale.com/docs/features/sharing)
- [TW 5.4.1 polling implementation](https://github.com/Jermolene/TiddlyWiki5/blob/v5.4.1/core/modules/syncer.js)
- [Serve foreground configuration model](https://github.com/tailscale/tailscale/blob/main/ipn/serve.go)

Original HUWiki code; the project has not chosen its license yet. Existing third-party licenses remain unchanged. TailShare was considered but is already used by other Tailscale sharing tools, so this package keeps ForgeShare as its working name.

Translation references: [developer translation guide](https://tiddlywiki.com/dev/static/How%2520to%2520create%2520a%2520translation%2520for%2520TiddlyWiki.html), [translation mechanism](https://tiddlywiki.com/static/TranslationMechanism.html), and [plugin information tiddlers](https://tiddlywiki.com/static/Plugin%2520Information%2520Tiddlers.html). The native core language dropdown and an already-rendered guide are exercised in tests, including HUWiki Dansk’s actual title/name combination.

## Native builds and optional signing

Build Mac assets on a Mac with Xcode tools: `python3 scripts/build-forgeshare-mac.py`. Build Windows assets on Windows using `plugins/forgeshare/native/windows/build.ps1`. The Windows native workflow also publishes the compiled executable and its SHA-256 manifest. The checked-in assets allow deterministic plugin builds on all three systems; the builder refuses assets whose recorded source/artifact hashes no longer match. These manifests detect stale assets; they do not authenticate an unsigned download.

`--self-test` checks that the app can locate Node.js and parse its bundled helper without opening UI or starting services. The native wrapper communicates through private child pipes: selected name and ready address outward, STOP or parent EOF inward. Credentials never travel through this protocol. Tests cover cancellation during setup and graceful cleanup after active sharing. OS dialogs follow the computer language; plugin text follows TiddlyWiki’s language.

For later trusted Mac distribution: enroll in the Apple Developer Program, create a Developer ID Application certificate, sign the complete app with hardened runtime and a secure timestamp, submit a ZIP/DMG with Xcode’s notarytool, inspect the result, staple the ticket to the app/DMG and test a fresh quarantined download. This is distinct from App Store review. Do not change app resources after signing. No enrollment, payment, certificate handling or notarization submission is performed here. See [Apple Developer ID](https://developer.apple.com/developer-id/), [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), and [per-app approval](https://support.apple.com/en-us/102445).

Windows distribution can later use Authenticode signing; even a valid signature does not promise immediate SmartScreen reputation. See [Microsoft’s distribution guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).

Version 0.1.6 intentionally increments the patch number: TW 5.4.1’s import comparison ignores prerelease suffixes such as `-test.2` and `-test.3`. The actual core comparator is tested so the new package upgrades those earlier test builds.

The headless browser check also uses the core import review and Import button, then reimports to verify stable identities and removal of previously included addresses.

Library tests cover persistence, legacy profile migration, renaming without port changes, excluded/private metadata, inert user text rendered by real TW, stable reimport identity, cancellation, non-overwriting export files and an actual authenticated local server that never invokes Tailscale.

Discovery searches Wikis, Documents, Desktop and Downloads, or a folder explicitly chosen by the user. It recognizes a valid tiddlywiki.info, excludes known library entries and skips hidden/dependency/application folders, symlinks and wiki contents. Bounds: depth 5, 1500 directories, 20000 directory entries, 100 results and a 5-second cooperative deadline. Partial results are labelled; inaccessible folders are skipped. Nothing is added or started until suggestions are accepted. Accepted folders are revalidated and added atomically, with unique display names.

The Mac self-test now exercises the actual library row rendering with empty, populated and refreshed lists. This covers the 0.1.2 crash caused by activating a row-to-parent constraint before inserting the row into the view hierarchy. No visible window or real library is used in the test.

Home-network sharing uses HTTP, not TLS, and is intended for a trusted network. The helper excludes known VPN/virtual adapters and public, wildcard, loopback, IPv6 and Tailscale CGNAT addresses from LAN choices; if multiple eligible interfaces exist the user chooses one. It verifies the selected interface remains present before startup. It does not promise discovery across every VPN/platform adapter naming scheme. No firewall, router, port-forwarding or UPnP changes are made. Other devices need a browser on a network that can reach that interface; guest-network isolation or a firewall can prevent access. LAN addresses can change with DHCP. Actual cross-device LAN/firewall acceptance remains manual; automated integration uses isolated loopback servers.

### Helper language, help and startup (0.1.6)

The helper follows OS UI language (Danish, English fallback); the plugin and exported page bodies follow TiddlyWiki `$:/language`. Help is bundled as offline HTML and opens only when chosen. Startup is off by default. It stores only a library entry ID, network mode and login choice in the private library metadata; no passwords. The native app checks this once per launch. Wiki login requires entering credentials at launch; anonymous startup requires explicit opt-in. The normal listener, port ownership and Tailscale checks remain mandatory. This can register/remove its own login entry after an explicit choice under Settings → Start at login. It never replaces another startup entry. Linux performs the same saved startup before its library menu.

Export asks for a readable overview name. Use distinct names for separate libraries. Names are retained for future exports even after wiki renames; IDs remain inert metadata. Reimport uses TiddlyWiki's usual review; no existing wiki is modified directly. Legacy UUID-titled exports are not deleted automatically.

Official startup references: [Apple](https://support.apple.com/guide/mac-help/mh15189/mac), [Microsoft](https://support.microsoft.com/en-us/windows/experience/startup-boot/configure-startup-applications-in-windows), [Ubuntu](https://help.ubuntu.com/stable/ubuntu-help/startup-applications.html.en).

### Automatic preparation and sharing (0.1.6)

The native apps discover HTML and server folders on launch (bounded search in Wikis/Documents/Desktop/Downloads, no symlink traversal). Share prepares selected HTML wikis in a fresh sibling folder and queues selected sessions. Running sessions are skipped. Sharing preferences are separate and remembered; default is private Tailscale with anonymous wiki access, with no silent fallback to LAN. Optional wiki login prompts unless its credentials were explicitly saved in the vault.

The isolated importer uses the installed, trusted TiddlyWiki HTML deserializer; it never boots incoming plugins. It writes numeric JSON filenames, verifies all saved fields by reloading, and preserves the library identity. Source changes, newer cores and local external attachments stop conversion without deleting the source. Only after the library commits does the original move to OS Trash. Trash failure retains the source and reports it. No permanent deletion fallback. HTML offline export remains available.

## Optional public Funnel

Choose Sharing → Funnel, then Share. The helper asks for two distinct, nonempty codes, with no forced minimum length. Codes are kept in memory unless the owner explicitly chooses to remember them in the OS vault. Each public wiki needs a free Funnel-supported port (10000, 8443 or 443); existing private/AI routes are never converted or replaced. If all are occupied, sharing is refused. Funnel startup is manual only. The Tailscale account must already permit Funnel and HTTPS.

The public proxy binds only to loopback, requires a code, issues HttpOnly/Secure/SameSite=Strict sessions (8-hour maximum), and limits login attempts globally to 20/minute. The global limit deliberately does not trust forwarded IP headers; a malicious client can temporarily prevent other logins. Codes protect the whole wiki, not individual tiddlers. Anyone holding the editor code is trusted to change wiki content and client-side plugins. Public proxying is limited to core TW wiki/status/tiddler endpoints; custom server routes are not supported.

Independent ephemeral internal credentials enforce TW readers/writers. Client credentials and identity headers are not forwarded. The owner link uses a separate loopback listener and a random bootstrap capability; it is returned only to the native helper, never copied as the guest URL or exported in the library. Open uses it; Copy address uses the public HTTPS URL. Stopping kills the owned Funnel process before closing the gateway and draining wiki saves. Browser sessions end on stop; explicitly saved codes remain in the OS vault until forgotten. An abrupt crash may leave private temporary internal credentials, but no active gateway.

Validation includes real-server role/write tests, anonymous/header/CSRF/host failures, session expiry, throttling, occupied ports, route ownership and a headless browser test of code login and owner editing. Real external Funnel acceptance still needs the user's permitted, available Tailscale setup.

Official references: https://tailscale.com/docs/reference/tailscale-cli/funnel and https://tiddlywiki.com/static/WebServer%2520Authorization.html


## Vault, live library and background app (0.1.8)

The native Mac/Windows app has Library, Sharing, Connections and Settings pages. Closing its window keeps owned sessions alive; the menu-bar/tray icon reopens it. Quit explicitly stops owned sessions. Login startup is opt-in and starts the app after the user logs in; a selected wiki may also start using the saved startup preference. Move the app to its final location before enabling login startup. Linux retains the existing Zenity menu/status-window lifecycle rather than a native tray app.

Connections are stored with macOS Keychain, Windows DPAPI CurrentUser, or Linux Secret Service (`secret-tool`, with an unlocked collection). There is no plaintext fallback. OS authentication prompts may appear; an updated unsigned Mac build can require renewed Keychain approval. The native storage endpoint is an inherited-pipe interface for local processes running as the owner, not a browser endpoint. This is not protection against other software already running as the same OS user.

Add LM Studio, Ollama, OpenAI or a compatible chat-completions server under Connections → Vault. The server URL and model stay with the connection. Keys are used by the helper in outbound requests, never copied into wiki content, localStorage, browser responses or exports. The first integration supports text chat and model lists; image generation/analysis through the vault is not supported. Previously available direct local AI mode remains available. Generic passwords can be saved and selected as bearer credentials when adding a compatible AI connection; this is not an automatic website-login/password manager. Selecting a saved password copies it into that connection; deleting the saved item does not delete an existing connection's copy.

A wiki must be opened through this helper to request access. The ForgeShare library page or updated AI plugin displays a verification code. In the native vault, compare that code on the requesting device, then explicitly choose permitted AI connections and library entries. Device labels are user-entered, not verified identities. Grants last 30 days and can be revoked immediately. They are independent of Tailscale membership and Funnel reader/editor roles. Anyone using that approved browser profile, and scripts/plugins running in that wiki origin, can exercise its grant. Give access only to trusted wikis and people. API usage may cost money. Request limits are per helper session, not a billing budget.

The helper attaches `/_forgeshare/bridge/` to each owned wiki server. It requires same-origin POST requests, an allowlisted Origin, JSON content type and a custom header; approval cookies are HttpOnly, SameSite=Strict and Secure on HTTPS. Cookies are scoped to the bridge path and use separate names for separate wiki ports. Tokens are hashed in the vault and bound to a wiki ID. The browser cannot choose an arbitrary upstream URL, retrieve secrets, edit the vault, or change sharing settings. Approved library metadata is explicitly projected; no paths, private credentials or unselected entries are returned. Addresses are last-known sharing addresses, not proof that a server is running. Use HTTPS/Tailscale when access crosses an untrusted network. LAN HTTP still lacks transport encryption.

AI calls have timeouts, bounded bodies/responses, no redirects, fixed provider routes and a modest output limit. Revocation prevents new calls; a request already sent to a provider may still complete and be billed. The browser confirmation describes the content being sent; it is not a security boundary against malicious scripts in an already approved wiki.

## Sites and invitations

Add → HTML site selects a folder with `index.html`. A separate read-only HTTP server serves supported static assets; no TiddlyWiki conversion/server is used. Dotfiles, directory listings, path traversal and symlinks are refused. This is for exported/static sites, not PHP, arbitrary local services or server-side programs. Funnel requires a visitor code; visitors cannot write to a static site. The existing port ownership checks also apply to sites.

Sharing → Invite opens a draft in the owner's mail application. The default includes the shared link and an optional comment. Including a saved sharing code is an explicit additional choice; the recipient role determines which code is included. No API key or general password is offered. The user chooses recipients and sends the email. No mail is sent by ForgeShare.

Settings → Open Tailscale opens the installed app or offers its official download. Connections → Tailscale devices shows the local client's visible peers and online status. This is not a list of wiki visitors, AI grants, or a guarantee that a peer can access a particular wiki. ForgeShare does not change Tailscale grants or access policies.

### Validation and limits

Automated fixtures cover approval scopes, expiry/revocation, secret projection, same-origin requests/cookies, static-site confinement, startup files and optional invitation codes. A real isolated TiddlyWiki browser test covers pairing, live library, AI-plugin calls and revocation using a simulated AI service. The Funnel browser test covers independent reader/editor and vault permissions through a local HTTPS proxy. These tests do not spend API credits, touch the owner's real vault, enable real login startup, or create a public Funnel. Real OS-vault prompts and use from a physical second device still require hands-on acceptance.

Security/storage references: [Apple Keychain](https://developer.apple.com/documentation/security/using-the-keychain-to-manage-user-secrets), [Windows data protection](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection), [Secret Service](https://specifications.freedesktop.org/secret-service/latest-single/). Server references: [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve), [Funnel](https://tailscale.com/docs/reference/tailscale-cli/funnel), [LM Studio chat completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions).

### Sharing and Tailscale status fixes (0.1.9)
Each wiki/site stores its own network and login choice. New entries inherit no global choice. Settings select one item; changes apply on its next start. Existing running sessions are not reconfigured. Tailscale status text/errors receive a localized actionable message instead of a JSON parse exception. Mac library commands use the same executable search path and working directory as sharing commands.

### Library clarity (0.1.10)
The native library selects one item at a time. Every row identifies Wiki or Site with an icon and shows a separate text status and grey/amber/green indicator for sessions owned by this app instance. Each active library row has its own Stop button; stopped rows have none. Status is not inferred from saved sharing preferences or last-known addresses. Export has a separate multiple-selection dialog with Select all / Select none.

### Automatic local opening (0.1.11)
Open now prepares HTML wikis through the same verified conversion used for sharing, starts a loopback-only server, and opens the local address. It does not use the saved sharing mode or request sharing credentials. Existing sharing preferences remain unchanged. Static sites open locally without installing TiddlyWiki. Failed conversion never starts a server or removes the original.

### Compact library rows (0.1.12)

Each native library row keeps its status light, name, Wiki/Site type, active sharing method and Stop button on one line. Local and stopped states use the indicator without repeated visible status sentences; Mac accessibility labels and tooltips retain the full state. Only a running shared session shows Tailscale, Home network or Funnel. Names truncate when needed; Stop stays at the right edge.

The Sharing page lists only ready shared sessions. Local sessions remain in the library; the empty sharing page points to Share in the library instead of showing disabled invitation buttons for local addresses.

### Recovering from cancelled or failed sharing (0.1.12)

A failed or cancelled manual start clears only that item's attempted sharing choice, so the next Share offers Tailscale, home network and Funnel again. A newer choice made elsewhere is preserved. Successful sessions keep their choice; local Open and automatic startup do not clear it. Funnel availability is checked before requesting codes and checked again under the startup lock. Existing Tailscale services are never removed by this recovery.

Regression tests cover occupied Funnel → private/LAN/local retry, cancelled visitor codes, failed launches, lock release and preservation of another item's choices. Real static-site tests cover authenticated nested pages and assets, HEAD, rejected writes, owner access, stop and restart. Site login uses site-specific wording.

### Reusing a stopped wiki or site (0.1.13)

Private Tailscale sharing checks the saved addresses on each start. If an old route still holds one, ForgeShare selects unused local and private HTTPS addresses without replacing that route or any other service. Only a successful start updates the saved addresses. The current link is available under Copy address; previous invitations may need a new link. A running listener on the old local address blocks startup so that the helper does not create a second writer for the same wiki. Funnel still requires a free supported port (443, 8443 or 10000) and never takes over another service.
