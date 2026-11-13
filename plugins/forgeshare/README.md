# ForgeShare / Tailscale-samarbejde

Optional, standalone TiddlyWiki 5 plugin, `0.1.0-test.3`. Adds a nontechnical Danish/English guide, official prerequisite download links, and locally downloadable helpers. Nothing is installed, shared or started by importing the plugin. It uses native `$:/language` (Danish, English fallback), with no extra language control. It uses the selected language plugin’s `name` metadata, the standard Danish ID and the existing HUWiki Danish ID (`$:/languages/huwiki-da-DK`). Native information tabs include `da-DK/readme`, `en-GB/readme` and the `HUWiki Dansk/readme` alias, plus a standalone fallback. These readmes remain readable directly from plugin JSON without unpacked shadows.

Import `dist/plugin.json`, save and reload, then open **Control Panel → ForgeShare** or the plugin readme. Forge's **Extra plugins** catalog lists it as an optional test package; no Edition includes it automatically. HTML/offline use and native savers remain available.

## Ordinary flow

1. The host installs Node.js and Tailscale through their official installers. Recipients need only Tailscale and a browser. Linux installation depends on the distribution; native dialogs additionally need Zenity.
2. Download the matching helper ZIP from inside the wiki, extract it and run its start file. Files and downloads work offline; installing prerequisites and connecting Tailscale need internet.
3. Native dialogs let users add an **already prepared** server wiki folder with a memorable name, or select a saved name, and ask for a login name/password. This test version does not convert HTML to a server folder; the guide includes first-setup instructions and clearly identifies this remaining technical step.
4. If TiddlyWiki is missing, the dialog helper can offer a separate, explicit installation of `tiddlywiki@5.4.1` in the user's ForgeShare application-data folder. It invokes npm via Node with `--ignore-scripts` and no shell, and does not install globally. Declining does not install anything. Node.js and Tailscale are never silently installed.
5. After the final sharing confirmation, the helper starts the Node server and foreground Tailscale Serve. It opens no website or browser. The user copies the address from the status dialog. Closing that named dialog stops only its wiki. Open the helper again to run another named wiki alongside it.

The start files can leave a terminal window behind the dialogs. These are inspectable source scripts, not signed desktop applications or bundled Node executables. Mac/Linux launcher ZIP entries carry executable permissions. The included getting-started sheet contains no terminal commands; it identifies the observed Gatekeeper block and does not suggest permission changes or extraction as a fix. Signing/notarization remains outside this test package. The native dialogs have not yet been manually exercised on all target systems.

## Safety and limits

- New named wikis automatically get separate local ports in 20000–20999 and HTTPS ports in 21000–21999, bound to loopback and foreground Serve respectively. Candidate ranges are not claimed as reserved: scan OS interfaces and all Serve/Funnel/Foreground/Services entries before allocating. Saved assignments are stable; a later conflict causes refusal, never silent reassignment.
- Existing configurations, including 443 → 11434, 8443 → 1234, SSH and an old wiki on 10000 → 8080, are preserved. Occupied saved ports, unknown Serve formats, mismatching settings, failed authentication checks and startup errors cause refusal. Before/after comparison covers all unrelated Serve settings, including foreground entries.
- Names, canonical folder paths and port assignments (not credentials) are saved in `wikis.json` in the per-user ForgeShare app-data directory. Copies of the helper share that catalogue. Atomic file replacement and catalogue/session locks serialize changes and prevent duplicate helper starts. Only locks with a confirmed dead owner can be recovered; incomplete locks require inspection. Do not start a saved folder manually in another server. Separate computer accounts do not share this catalogue.
- No `serve reset`, Funnel, background persistence, force/yes flags, automatic browser opening, policy edits, or arbitrary shell evaluation. Do not change Serve concurrently.
- The helper waits for its own child server's listening event over IPC, then checks anonymous `/status` gets HTTP 401. It never adopts or kills an existing service.
- Stop terminates only owned children, ends foreground Serve, then asks the wiki worker over IPC to stop accepting requests and drain pending filesystem saves. It allows 30 seconds for saves and forces termination after 35 seconds if a child cannot exit. Errors, sudden power loss and forced termination still require recovery from backup.
- The GUI creates a temporary, private credentials file. POSIX directory/file permissions are 700/600; Windows removes inherited permissions and grants the current SID access before writing credentials. Normal shutdown removes it. Abrupt termination may leave a private file in the system temporary directory.
- GUI mode uses one shared wiki account per session, not individual authorship. Terminal mode accepts an external protected CSV for multiple accounts. All supplied accounts receive read/write access. For distinct privileges, use native TW `readers`/`writers` manually.
- Machine sharing can expose other services if the tailnet's access policy is broad. Grants are additive: adding a narrow rule does not override a broad grant. The guide requires testing guest access to the selected wiki’s HTTPS port and denial on other wikis and AI ports. The helper does **not** verify or edit effective tailnet policy.
- The optional Messages/Meddelelser discussion pattern is documented based on the user's description of separate message tiddlers. It is not bundled, required, or integration-tested.
- Installing the plugin does not change polling. The native button explicitly sets `$:/config/SyncPollingInterval=3000`; readers cannot see the write button. Save and reload each client. The user's confirmed Mac/iPad observation is documented as an observation, not a latency guarantee.

## Source and build

- `src/*.tid`: readable guide, advanced help, language wrapper and style.
- `helper/ForgeShare.mjs`: dependency-free local helper, with CLI and native-dialog modes.
- `helper/Start-ForgeShare.*`: Mac, Windows and Linux entry points.
- `dist/plugin.json`: installable plugin, including self-contained data-URL downloads.
- `dist/ForgeShare-*.zip`: matching helper packages, with deterministic ZIP metadata and executable modes.

Run `npm ci --ignore-scripts`, `npm run build:forgeshare`, `npm run check:forgeshare`, and `npm test` (Node.js 20+). TiddlyWiki 5.4.1 is a pinned development dependency for real rendering and isolated server tests, not shipped inside the plugin.

Tests cover source/bundle parity, native TW Danish/English rendering, native polling action/read-only behavior, downloadable ZIP/source identity, standalone HTML assembly, Serve conflicts/AI preservation, cancellation and failure cleanup, literal arguments, private temporary credentials, and real authenticated writes/readback/persistence across two HTTP clients and restart. GitHub Actions runs the helper tests on Mac, Windows and Linux; dialog answers and Tailscale are simulated. No test touches the user's actual Tailscale service or ports 8080/443/8443/10000. Multiwiki tests run two real isolated servers with independent content, verify one survives the other stopping, and simulate unrelated Serve/SSH/AI routes. Further tests cover name selection, persistent addresses, concurrent registrations, duplicate starts and OS conflicts.

## Manual acceptance before release

- On each OS, test native dialogs, cancellation, missing prerequisites, explicit TW installation, paths with spaces/non-ASCII characters, extraction permissions, status copy and stopping.
- With a backed-up test wiki and actual Tailscale, start two named wikis, verify only the selected foreground route disappears after normal stop/terminal close, the other wiki remains usable, and all pre-existing services (including 443/8443) stay unchanged. Restart by name and verify its address is retained. Test another application taking a saved port; the helper must refuse without changing the link.
- From a separately invited user, verify allowed wiki access, denied AI access, rejected incorrect wiki credentials and revocation through Tailscale.
- Recheck Mac/iPad browser bidirectional sync, 3000 ms plus reload, drafts/conflicts, group use, and offline HTML export/restoration.
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

## Mac distribution blocker

The user reproduced Gatekeeper refusing `Start-ForgeShare.command` because Apple cannot verify it for malicious software. This is distinct from executable permissions. The Mac download is now explicitly a technical test before the download button, not a beginner-ready application. A shorter README does not resolve this limitation.

The intended nontechnical Mac experience needs an application bundle with a recognizable icon and native windows, no Terminal launch, Developer ID signing and Apple notarization. No such bundle or signing credentials are included in this change. Repackaging the script as an unsigned `.app` would not solve trusted distribution. See [Apple Developer ID](https://developer.apple.com/developer-id/) and [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
