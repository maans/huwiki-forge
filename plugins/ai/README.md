# HUWiki AI — ForgeShare integration (0.4.0 test)

Source migration of the existing HUWiki AI 0.3.6 package from the AI Edition project, with a ForgeShare same-origin bridge replacing its Apps Script vault calls. Original HUWiki modules/pages/templates are retained as editable tiddler JSON in `src/`. Build with `node scripts/build-forge-ai.mjs`; import `dist/plugin.json`, save and reload. This is an optional test package; no production Edition is changed by this branch.

Open the wiki through ForgeShare 0.1.8. Add an AI connection in the helper's vault. The AI Connections page can request access; compare the code in the helper and approve the desired connections. Refresh the connections list. The browser receives only connection metadata, model lists and replies; it never receives API keys. The helper owns outgoing AI requests. Each selected browser/wiki requires its own approval, including the owner's browser.

Supported Vault operations in the new AI Forge 0.4.2 test source: text chat, model lists, screenshot/image analysis for LM Studio, Ollama, OpenAI-compatible servers, OpenAI and Gemini, plus optional local per-wiki image save/load. Image generation through the Vault is still separate and not implemented. The currently published ForgeShare Mac 0.1.18 does not include these new operations; it will continue to reject image analysis. Keys cannot be entered into or exported from a wiki. Wiki readers with a separate approved AI grant can use the owner's accounts; saving chat tiddlers still requires wiki editing rights.

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


## AI Forge 0.4.2-test.1 — local images and multimodal ForgeShare (16 November 2026)

**Two dependent test branches:** AI plugin in `fix/ai-forge-vision-av-20261116` (based on `main`) and ForgeShare helper in `feat/forgeshare-vault-vision-media-20261116` (based on PR #8). Neither is deployed in the public Mac ZIP. A new, separately tested Mac app build is required before device acceptance and release. Do not present this as a live fix in the user's existing wiki.

- The chat now passes explicitly attached PNG/JPEG/WebP screenshots through the same-origin ForgeShare bridge to the Mac host. The host validates MIME, encoded bytes, user consent and the approved connection before forwarding the image to the selected vision-capable local/cloud model. Provider formats differ: LM Studio/OpenAI-compatible uses `image_url`, Ollama uses `images`, Gemini uses `inline_data`. Existing text-only requests remain unchanged.
- The old `google.script.run` image-save, playback and AV-sharing calls are **not used** for new images. User and generated images are transient unless the user selects **Gem billedet lokalt / Save image locally**. Approved local save writes a file to the ForgeShare host's `ai-media/<sha256-of-wiki-id>` directory under the app's private data root, and stores only an ID/reference in the TiddlyWiki tiddler. The same approved wiki session can reload it from Mac or iPad via Tailscale.
- Old `av-file-id`/Drive references are preserved as historical references and can still link to the original Drive file. They are **not** automatically imported or rewritten. Saving a new image requires a current approved ForgeShare session; an HTML wiki export does **not** embed the local images. Back up the ForgeShare `ai-media` directory together with the wiki, and expect the media to be unavailable when the wiki is opened outside its approved host.
- Only PNG/JPEG/WebP are supported for host-side storage in this first test. SVG can still be handled as text/code. Two attached input images maximum, combined original image data up to 4 MiB, each up to 3 MiB; the bridge limits body size to 6 MiB. Local library quotas are intentionally bounded.
- Retry after a browser reload restores explicitly saved screenshots through the authorized bridge. If the original screenshot was transient and lost, Retry explains that it must be attached again rather than making a misleading text-only request.

### Testing order

1. Run the automated helper tests on the ForgeShare helper PR and the AI-plugin bundle/tests on the AI Forge PR. No real cloud account is used in these tests.
2. Build a *new test Mac app* from the reviewed helper branch, leaving the published 0.1.18 ZIP untouched. Pair the local wiki with ForgeShare Vault and LM Studio Gemma 4.
3. Test text chat, one small screenshot, two screenshots and a 1200 px screenshot from Mac and iPad separately. Inspect model input and ensure no model/approval bypass or secret disclosure.
4. Save an attached screenshot locally, reload the wiki on both devices, verify that the image renders and that a retry still includes the image. Check revocation and a second wiki cannot retrieve it.
5. Test legacy Drive references (read-only link), ordinary single-file backups (clear missing-media explanation) and ForgeShare media backup/restore before deciding whether to merge/deploy.
