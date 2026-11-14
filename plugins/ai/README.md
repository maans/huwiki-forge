# HUWiki AI — ForgeShare integration (0.4.0 test)

Source migration of the existing HUWiki AI 0.3.6 package from the AI Edition project, with a ForgeShare same-origin bridge replacing its Apps Script vault calls. Original HUWiki modules/pages/templates are retained as editable tiddler JSON in `src/`. Build with `node scripts/build-forge-ai.mjs`; import `dist/plugin.json`, save and reload. This is an optional test package; no production Edition is changed by this branch.

Open the wiki through ForgeShare 0.1.8. Add an AI connection in the helper's vault. The AI Connections page can request access; compare the code in the helper and approve the desired connections. Refresh the connections list. The browser receives only connection metadata, model lists and replies; it never receives API keys. The helper owns outgoing AI requests. Each selected browser/wiki requires its own approval, including the owner's browser.

Supported vault operations: text chat and model lists for LM Studio, Ollama, OpenAI and compatible chat-completions servers. Image generation and image analysis through the vault are explicitly rejected in this test version; direct local AI mode is retained. Keys cannot be entered into or exported from a wiki. Wiki readers with a separate approved AI grant can use the owner's accounts; saving chat tiddlers still requires wiki editing rights.

`forgeshare-vault-browser-smoke.mjs` exercises the real plugin modules in a running TiddlyWiki using an isolated in-memory vault and simulated AI. It performs no external AI request or billing. See the ForgeShare README for trust boundaries and remaining physical-device/OS-vault acceptance.
