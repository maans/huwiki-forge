# Changelog

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
