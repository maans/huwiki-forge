# Changelog

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
