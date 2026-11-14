# AI Edition – Forge test 0.1.0-test.1

This is a **separate, editable TiddlyWiki Edition** assembled from the existing, source-controlled `$:/plugins/huwiki/ai` 0.4.0 and `$:/plugins/huwiki/forgeshare` plugins on the ForgeShare feature branch. The AI source is migrated from HUWiki AI 0.3.6; no older HUWiki copy is substituted.

## What works without an account

- AI workbench, chat library, Danish/English interface, knowledge and 23 original task templates are included in a single-file wiki.
- The Edition, help content and ordinary tiddlers are editable offline; use TiddlyWiki's native Save button.
- A separate AI connection requires **ForgeShare helper** and explicit per-wiki approval. The helper—not the HTML wiki—stores any model-server credentials in the OS vault.
- The ForgeShare vault currently supports **text chat / model lists** only (e.g. LM Studio, Ollama, OpenAI and compatible endpoints); image analysis/generation through the vault remains unavailable.
- Reading this Edition locally from `file://` does not grant access to the ForgeShare vault. Open the wiki through the helper to pair it.
- Physical-device access, OS vault prompts and the current parent PR's failing CI jobs still require acceptance.

## Source and deployment

Manifest: `editions/ai/manifest.json`. Page: `editions/ai/tiddlers/seed.json`.
The Forge homepage card is built from `catalog/editions.json`, not a second catalog; the plugin remains independently selectable in the existing Plugin Library.

This change is developed from `feat/forgeshare-tailscale` in a separate branch. It must **not** be merged or deployed until its parent ForgeShare integration and all checks are accepted.
