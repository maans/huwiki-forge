# ForgeShare / Tailscale-samarbejde

Optional, standalone TiddlyWiki 5 plugin, `0.1.2`. Adds a nontechnical Danish/English guide, official prerequisite download links, and locally downloadable helpers. Nothing is installed, shared or started by importing the plugin. It uses native `$:/language` (Danish, English fallback), with no extra language control. It uses the selected language plugin’s `name` metadata, the standard Danish ID and the existing HUWiki Danish ID (`$:/languages/huwiki-da-DK`). Native information tabs include `da-DK/readme`, `en-GB/readme` and the `HUWiki Dansk/readme` alias, plus a standalone fallback. These readmes remain readable directly from plugin JSON without unpacked shadows.

Import `dist/plugin.json`, save and reload, then open **Control Panel → ForgeShare** or the plugin readme. Forge's **Extra plugins** catalog lists it as an optional test package; no Edition includes it automatically. HTML/offline use and native savers remain available.

## Ordinary flow

1. Install Node.js for the helper. Tailscale is needed only when sharing. Linux additionally needs Zenity for dialogs.
2. Download and extract the helper, then open ForgeShare.app (Mac), ForgeShare.exe (Windows) or the Linux launcher.
3. Add an HTML file or wiki folder to the persistent library. Existing shared profiles appear automatically. Adding starts no server or Tailscale process. Edit changes a name/description without changing assigned ports.
4. Open an HTML file with the default browser and its existing save method. Open a prepared server folder locally with authenticated loopback access; this does not query or start Tailscale. Share is a separate action. Optional pinned TiddlyWiki installation requires explicit approval. HTML-to-server conversion is not automatic.
5. Select entries and Export selected. Choose names/descriptions only (default) or include last shared HTTPS addresses. Save a new JSON file and import it normally in a wiki. The localized overview and individual plain-text entry tiddlers use stable IDs for reimport. No paths, ports, credentials, unselected entries or wiki content are exported. Snapshots never claim live status; old imported entries are not automatically deleted.
6. Active servers have independent Copy address and Stop controls; stopping leaves the library entry intact. Quitting asks before ending active sessions. Linux provides the library actions through dialogs and a separate status dialog per running wiki.

The library lives in private local `library.json` beside the backwards-compatible `wikis.json` port registry. Library edits and registration use separate serialized locks. Names/locations are unique and missing files remain visible. The app opens a file/address only in response to Open; sharing alone does not launch a browser. There is no local browser-accessible management API and no automatic metadata synchronization.

Mac has a universal (Apple Silicon + Intel, macOS 13+) AppKit application with an icon. Windows has a .NET Framework WinForms GUI executable (Windows 10/11 with .NET Framework 4.8). Neither launches a console. Node.js remains a separately installed prerequisite; Tailscale is needed only for sharing. The short start page puts downloads first, then wiki selection and invitations, with keyboard-accessible help disclosures and responsive phone/tablet layout. Linux retains the Zenity script. All downloads are embedded and usable offline after prerequisites are installed.

These are unsigned test apps: the Mac bundle has only an ad-hoc signature for execution, no Developer ID or notarization. Per-app approval may be required. Windows SmartScreen may offer Run anyway; Smart App Control or policy can block unsigned files entirely. Instructions never disable protections globally. Native visual interaction and downloaded-file approval still need manual acceptance.

## Safety and limits

- New named wikis automatically get separate local ports in 20000–20999 and HTTPS ports in 21000–21999, bound to loopback and foreground Serve respectively. Candidate ranges are not reserved: sharing checks OS interfaces and all Serve/Funnel/Foreground/Services entries. Local-only startup checks OS listeners and saved assignments without querying Tailscale; later sharing still refuses any Tailscale conflict. Saved assignments are stable; a later conflict causes refusal, never silent reassignment.
- Existing configurations, including 443 → 11434, 8443 → 1234, SSH and an old wiki on 10000 → 8080, are preserved. Occupied saved ports, unknown Serve formats, mismatching settings, failed authentication checks and startup errors cause refusal. Before/after comparison covers all unrelated Serve settings, including foreground entries.
- Names, canonical folder paths and port assignments (not credentials) are saved in `wikis.json` in the per-user ForgeShare app-data directory. Copies of the helper share that catalogue. Atomic file replacement and catalogue/session locks serialize changes and prevent duplicate helper starts. Only locks with a confirmed dead owner can be recovered; incomplete locks require inspection. Do not start a saved folder manually in another server. Separate computer accounts do not share this catalogue.
- No `serve reset`, Funnel, background persistence, force/yes flags, unsolicited browser opening, policy edits, or arbitrary shell evaluation. Do not change Serve concurrently.
- The helper waits for its own child server's listening event over IPC, then checks anonymous `/status` gets HTTP 401. It never adopts or kills an existing service.
- Stop terminates only owned children, ends foreground Serve, then asks the wiki worker over IPC to stop accepting requests and drain pending filesystem saves. It allows 30 seconds for saves and forces termination after 35 seconds if a child cannot exit. Errors, sudden power loss and forced termination still require recovery from backup.
- The GUI creates a temporary, private credentials file. POSIX directory/file permissions are 700/600; Windows removes inherited permissions and grants the current SID access before writing credentials. Normal shutdown removes it. Abrupt termination may leave a private file in the system temporary directory.
- GUI mode uses one shared wiki account per session, not individual authorship. Terminal mode accepts an external protected CSV for multiple accounts. All supplied accounts receive read/write access. For distinct privileges, use native TW `readers`/`writers` manually.
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

Headless browser checks cover the rendered start page, mobile fit, keyboard disclosures, live language refresh and exact downloadable package bytes. Tests cover source/bundle parity, native TW Danish/English rendering, native polling action/read-only behavior, downloadable ZIP/source identity, standalone HTML assembly, Serve conflicts/AI preservation, cancellation and failure cleanup, literal arguments, private temporary credentials, and real authenticated writes/readback/persistence across two HTTP clients and restart. GitHub Actions runs the helper tests on Mac, Windows and Linux; dialog answers and Tailscale are simulated. No test touches the user's actual Tailscale service or ports 8080/443/8443/10000. Multiwiki tests run two real isolated servers with independent content, verify one survives the other stopping, and simulate unrelated Serve/SSH/AI routes. Further tests cover name selection, persistent addresses, concurrent registrations, duplicate starts and OS conflicts.

## Manual acceptance before release

- On each OS, test adding/editing HTML and folder entries, selected export/import, local-only opening, native dialogs, cancellation, missing prerequisites, explicit TW installation, paths with spaces/non-ASCII characters, extraction permissions, status copy and stopping.
- With a backed-up test wiki and actual Tailscale, start two named wikis, verify only the selected foreground route disappears after normal stop/terminal close, the other wiki remains usable, and all pre-existing services (including 443/8443) stay unchanged. Restart by name and verify its address is retained. Test another application taking a saved port; the helper must refuse without changing the link.
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

Version 0.1.2 intentionally increments the patch number: TW 5.4.1’s import comparison ignores prerelease suffixes such as `-test.2` and `-test.3`. The actual core comparator is tested so the new package upgrades those earlier test builds.

The headless browser check also uses the core import review and Import button, then reimports to verify stable identities and removal of previously included addresses.

Library tests cover persistence, legacy profile migration, renaming without port changes, excluded/private metadata, inert user text rendered by real TW, stable reimport identity, cancellation, non-overwriting export files and an actual authenticated local server that never invokes Tailscale.
