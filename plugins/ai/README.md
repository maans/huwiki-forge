# HUWiki AI — ForgeShare integration (0.4.0 test)

Source migration of the existing HUWiki AI 0.3.6 package from the AI Edition project, with a ForgeShare same-origin bridge replacing its Apps Script vault calls. Original HUWiki modules/pages/templates are retained as editable tiddler JSON in `src/`. Build with `node scripts/build-forge-ai.mjs`; import `dist/plugin.json`, save and reload. This is an optional test package; no production Edition is changed by this branch.

Open the wiki through ForgeShare 0.1.8. Add an AI connection in the helper's vault. The AI Connections page can request access; compare the code in the helper and approve the desired connections. Refresh the connections list. The browser receives only connection metadata, model lists and replies; it never receives API keys. The helper owns outgoing AI requests. Each selected browser/wiki requires its own approval, including the owner's browser.

Supported vault operations: text chat and model lists for LM Studio, Ollama, OpenAI and compatible chat-completions servers. Image generation and image analysis through the vault are explicitly rejected in this test version; direct local AI mode is retained. Keys cannot be entered into or exported from a wiki. Wiki readers with a separate approved AI grant can use the owner's accounts; saving chat tiddlers still requires wiki editing rights.

`forgeshare-vault-browser-smoke.mjs` exercises the real plugin modules in a running TiddlyWiki using an isolated in-memory vault and simulated AI. It performs no external AI request or billing. See the ForgeShare README for trust boundaries and remaining physical-device/OS-vault acceptance.


## Experimental manual AI connections (0.4.1-test.1)

The workbench and chat library now offer a **manual** connection beside ForgeShare,
with OpenAI, Anthropic Claude, Google Gemini, LM Studio and Ollama.
Enter the provider API key into a password field (LM Studio key optional),
choose or discover a model, and optionally enter the local server URL.
Chrome/password managers may offer to fill the key, but the wiki cannot retrieve
stored passwords itself; autofill depends on the browser's behavior.

The key lives **only in in-memory JavaScript** in the running browser tab.
It is never written to TiddlyWiki tiddlers, the saved HTML, localStorage,
sessionStorage, request URLs or GitHub. A **Forget key** button clears it.
Reloading the page loses the key. Model names, provider choice and local
server URLs can remain in browser settings as non-secret preferences.

**Security:** Direct browser requests are experimental and not equivalent to
ForgeShare. Any other JavaScript or browser extension with page access may
read a manually entered key. Cloud browser requests may fail due to CORS.
Cloud API endpoints are fixed to their official HTTPS hosts; the Gemini API
uses an x-goog-api-key header, Claude uses x-api-key plus the Anthropic
direct-browser opt-in header, and OpenAI uses Authorization Bearer.
ForgeShare remains the recommended alternative when a key should stay out
of the wiki/browser page entirely. Image generation still requires ForgeShare.
No real cloud-provider account/API billing test was performed in this change.

The plugin bundle in dist and the Forge Plugin Library registry have the same
version. Gemini via the ForgeShare vault requires an updated ForgeShare helper build (the currently published Mac 0.1.18 ZIP does not yet contain that helper support). The manual Gemini connector remains available as an experimental, session-only alternative.


## Gemini restoration: OAuth-independent AI Forge / AI Edition (0.4.1-test.3)

AI Forge and the AI Edition now explicitly present Google Gemini as a **ForgeShare Vault** provider in addition to the existing manual browser connection. Users create a separate **Gemini API key in Google AI Studio**, not a Google Workspace OAuth client or Gmail/Drive scope grant. The ForgeShare Mac host sends authorized text-generation and model-list requests to the Gemini API; the key never reaches the wiki, its stored HTML, iPad browser or GitHub. Each wiki/device must be explicitly authorized for that new Gemini connection in ForgeShare, even if the device previously had 30-day permission for LM Studio.

**Compatibility:** The updated ForgeShare Vault implementation is on the ForgeShare development branch/PR #8. The public 0.1.18 Mac ZIP predates the update and must not be presented as Gemini-ready. Gemini through the Vault is for text chat and model listing only until separately tested for images. No Google OAuth verification status is changed by this work. A real Google AI Studio key is required for live end-to-end testing. Google now requires an appropriate auth-type API key rather than a legacy unrestricted standard key.
