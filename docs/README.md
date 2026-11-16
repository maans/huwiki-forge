# Forge documentation / dokumentation

Start with the instructions for **what you want to do**. Technical implementation notes and early plans are kept for developers, but should not be read as promises about the current public version.

## Current instructions / aktuelle vejledninger

| I want to… / Jeg vil… | Read / Læs |
| --- | --- |
| Try an Edition or keep my own wiki / Prøve en Edition | [Forge README](../README.md) and [Assembler guide](../assembler/README.md) |
| Install a plugin / Installere et plugin | [Plugin guide](../plugins/README.md) |
| Set up AI / Bruge AI | [AI connections](ai-connections.md) and [AI plugin guide](../plugins/ai/README.md) |
| Download or use ForgeShare on Mac / Bruge ForgeShare | [Mac installation and version status](../downloads/forgeshare/README.md) |
| Understand saving and hosting / Gemme og udgive | [Distribution and self-hosting](distribution.md), [security and data](security.md) |
| Work on an Edition / Udvikle en Edition | [Edition manifests](../editions/README.md) and [Forge homepage build](forge-home.md) |
| Maintain Plugin Library / Vedligeholde biblioteker | [Plugin Library architecture](forge-libraries.md) |

All public Editions are tests. A passing automated test does not prove that the same action works on all browsers, physical devices or operating systems.

## Implementation and historical sources / tekniske og historiske kilder

- **Current technical descriptions:** [Creative Editions](creative-editions.md), [publishers](publishers.md), [plugin structure](plugin-standard.md), [Shop](shop-migration.md) and [InstantWiki](instantwiki-migration.md). Their version-specific test notes may date from different days.
- **Ongoing migration notes:** [migration status](migration-status.md), [legacy SitePublisher audit](site-publisher-legacy-audit.md) and [Tegne migration](tegne-migration.md). Read their dates and open issues before treating statements as current.
- **Historical planning snapshots:** [project plan v0.3](projektplan-v0.3.md), [OAuthLab transfer inventory](oauthlab-transfer-inventory.md) and [initial HUWiki source analysis](huwiki-source-analysis.md). They record earlier decisions and gaps; the latest public workflow is described in the instructions above.

## Documentation rules / principper for dokumentationen

1. **Say what the user can do.** Start with a button, link, file or action; explain implementation afterward.
2. **Separate tested, experimental and planned.** Name the relevant platform and date for tests. Never turn a passing unit test into a claim of successful physical-device use.
3. **Use the exact label that appears in the UI.** If there is no working control or download, say so.
4. **Explain what is saved and where.** A downloaded HTML wiki, a local server, a browser session and a hosted site are different things.
5. **Check the source of truth before changing versions:** `catalog/editions.json`, the Edition's `manifest.json`, the plugin's `plugin-info.json` and the actual download folder. If these disagree, identify the mismatch rather than choosing a convenient number.
6. **Prefer short instructions and explicit limitations over promotional language.** Keep detailed development history in the technical documents.

**Reviewed:** 16 November 2026. This index organizes documentation; it does not replace release verification.
