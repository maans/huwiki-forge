# 0.1.16 — remembered sharing choice and Funnel diagnostics

- Share asks whether to reuse the saved connection, choose another method, or cancel for each wiki and static site. Open remains local. Stop is available on the running library row; active shares are never silently switched.
- Changing the method applies only to the selected item. A failed or cancelled trial retains its previous saved choice; concurrent newer choices are preserved.
- When Funnel cannot start, explain the state of each supported HTTPS port (443, 8443, 10000) individually: reserved by existing Serve/Funnel or occupied on the local machine. Never reset, replace, disable or change existing connections.
- Update Danish and English guide/help with the actual behavior and the wiki versus static-site distinction. Refresh the plugin's visual design with clear server-type cards and responsive instructions.
- Preserve the pinned tested native Mac launcher and the existing Wiki/Site server architecture; run normal-window and integration tests again. This remains a draft test build.

# 0.1.15 — restore Mac launcher and Tailscale discovery

- Reuse the byte-for-byte native Mac executable and icon from the last Mac app whose interface opened successfully (0.1.13). This avoids the unnecessary recompilation with a different macOS SDK used for the 0.1.14 test archive. The existing native library, Wiki/Site labels, Stop, sharing, vault, and HTML-site server remain intact.
- Restore the pre-0.1.13 CLI-first Tailscale discovery order on macOS; retain explicit CLI mode for commands including direct-app fallback. Keep process-group shutdown and safe address recovery.
- Sign the complete rebuilt app archive ad hoc after bundling the new helper and version info; verify its resource seal and run the native self-test. This is NOT an Apple Developer ID signature or notarization. A freshly downloaded ZIP can still trigger Gatekeeper. A signed/notarized public release requires developer credentials.
- Add Mac GUI launch smoke testing on the CI runner to check the application window, not only --self-test; keep all releases as drafts pending real-device acceptance.

# 0.1.14 — macOS Tailscale CLI launch fix

- Force Tailscale command-line mode for both status checks and foreground Serve/Funnel when ForgeShare launches from Finder. Tailscale's macOS app otherwise sometimes opens its GUI instead of returning status.
- Preserve all existing Tailscale routes and automatic free-address selection. Add regression checks for status and Serve subprocess environments.
- Rebuild ad-hoc-signed Mac and native Windows test packages; the pull request remains a draft.

# 0.1.7

- Optional public Tailscale Funnel with a code-only login page, reader/editor roles and separate local owner editing access.
- Restrict public ports to unoccupied 10000/8443/443; preserve existing Serve, Funnel and AI services. Stop only owned foreground processes.
- Ephemeral credentials and sessions, CSRF/origin checks, bounded login attempts, and independent server-side role enforcement. No anonymous public mode or automatic Funnel startup.

# 0.1.6

- Automatically discover HTML and folder wikis on app startup.
- Share uses remembered settings and prepares HTML in the background. Verified conversion preserves library IDs, tiddler fields, embedded images and plugins; only then moves the original to OS Trash. Failures retain it.
- Accept .html/.Html/.HTML without Finder type filtering; queue multiple selected wikis and skip running sessions.
- Default sharing is private Tailscale without extra wiki login; network/login settings remain explicit under Sharing. No automatic sharing during discovery.

# Changelog

## 0.1.5 — Clear choices, readable exports and optional startup

- Helper dialogs follow the OS language (Danish or English); small decisions use actual Mac/Windows buttons and Linux radio choices.
- Compact Mac status panel, Help and Startup controls on both desktop apps, bundled offline help covering sharing, export, backup, sync and OS login startup.
- Opt-in startup of one selected wiki, local/Tailscale/LAN. Disabled by default, reversible; passwords are requested per launch, never stored. Existing address, binding and Serve checks still apply.
- Export titles use a chosen overview name and wiki names; UUIDs stay in metadata. Entry pages explain their purpose and show readable dates. Persisted titles survive wiki renames. Existing legacy UUID-titled exports are left alone; import the new overview and remove old copies manually if desired.
- Standalone plugin remains in Forge's catalog/library. Collaboration Edition integration is deferred until that edition is ready.

## 0.1.4 — Home network and optional wiki login

- Share via Tailscale or the home network. LAN sharing binds one selected private IPv4 interface and does not inspect or start Tailscale, change firewall/router rules, or bind all interfaces.
- Choose with or without wiki login for each session. Password length is the user's choice; no-login is an explicit choice. All participants retain read/write access; separate guest roles are deferred.
- Show network and login mode beside the copyable address. Selected metadata exports can include the last LAN address as well as the Tailscale address.
- Verify the actual listener and selected login behavior before reporting ready. Keep CSRF and owned-process cleanup in both modes.

## 0.1.3 — Find existing wiki folders

- Add → Find wiki folders proposes existing wikis from common folders; users choose what to add. Search another folder remains available without typing paths.
- Read-only bounded discovery skips hidden/dependency folders and links; selected suggestions are revalidated before an atomic library update. No server or sharing starts.
- Fix the Mac crash when rendering a populated library: activate row constraints only after insertion. Exercise production rendering in the native self-test.
- Windows dialog payloads use stdin to support long result lists without command-line limits.

## 0.1.2 (test release)

- Add a persistent wiki library for local HTML files and wiki folders. Adding a wiki starts no sharing. Existing server profiles appear automatically; names and descriptions can be edited.
- Open HTML with the existing browser/save workflow, or run a prepared server folder locally without querying/starting Tailscale. Sharing is a separate action.
- Export checked entries as ordinary importable tiddlers plus a localized overview. Addresses are opt-in; file paths, credentials and unselected entries are omitted. Stable IDs support reimport; snapshots explicitly do not claim live status or automatic synchronization.
- Add library, selection, migration, literal-text rendering, exclusive export-file creation and real local-only server tests.

## 0.1.1 (test release)

- Replace Mac/Windows terminal launchers with native apps: icon, active wiki names/addresses, copy and individual Stop. Mac is universal and ad-hoc sealed, without Developer ID/notarization; Windows is an unsigned GUI .exe. Node.js/Tailscale remain prerequisites.
- Add explicit per-app approval guidance, source/artifact manifests, native build/self-tests, and STOP/parent-exit cleanup tests. No global security changes.
- Redesign the bilingual guide around three short steps, immediate downloads, icons and expandable help. Use general computer/phone/tablet examples, without personal device/test references. Verify mobile fit, keyboard help and language refresh in a headless browser.
- Increment the patch version because TW 5.4.1 ignores prerelease suffixes when comparing imports.
- Integrate the optional package into the shared Forge plugin registry; retain offline HTML and all existing services.

## 0.1.0-test.3

- Fix Danish selection for the existing HUWiki Dansk language pack; follow the native `$:/language` selector and language metadata.
- Provide standalone localized native plugin information tabs and test live switching through the actual core selector, with English fallback.
- Replace the helper's technical README with a short bilingual getting-started sheet; remove terminal commands and preserve executable ZIP permissions.
- Mark the Mac download as a technical test after the observed Gatekeeper block; document signed/notarized app distribution as an unresolved usability requirement.

## 0.1.0-test.2

- Add saved wiki names with a native picker on Mac, Windows and Linux; run several independent helpers/wikis concurrently.
- Allocate and persist distinct free local/HTTPS ports, skipping OS listeners and all existing Serve/Funnel/Services settings. Never silently change a saved address.
- Serialize registration/startup, prevent duplicate starts, recover verifiably dead locks, and stop only the selected session.
- Test concurrent real servers, independent data and shutdown, occupied ports, saved-name restart, configuration preservation and concurrent registration.

## 0.1.0-test.1

- Add optional standalone ForgeShare catalog plugin with readable Danish/English onboarding and advanced help.
- Include offline downloads for a standalone script and Mac, Windows and Linux helper packages.
- Add native-dialog sharing flow, separately approved local TiddlyWiki installation, private temporary login, and explicit final start confirmation.
- Protect existing Serve services, require wiki authentication, bind loopback only, and drain pending writes on stop.
- Document group sharing, effective access checks, polling/reload, backup, conflicts, offline HTML and optional Messages discussions.
- Add real TiddlyWiki rendering/server tests and cross-platform CI. Native UI and real-tailnet acceptance remain pending.
