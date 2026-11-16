# AI connections — current test behavior

AI Edition uses **AI Forge 0.4.2** for text conversations and screenshot analysis with compatible models. Connections are **optional**: the wiki can still be opened and edited without an AI provider.

**Current plugin metadata:** `plugins/ai/plugin-info.json` identifies version **0.4.2**. This document describes the available test modes; it is no longer just the pre-implementation design proposal.

## How to use it

- **Manual connection, no ForgeShare required:** In the AI Edition connection controls choose OpenAI, Claude, Gemini, LM Studio or Ollama. Enter the model, optional local server URL and required API key. Test with a short chat message. The key lasts only in the open browser tab; reload or **Forget key** clears it.
- **ForgeShare Vault:** Install the separate [Mac, Windows or Linux helper](../downloads/forgeshare/README.md), open the wiki through it, configure a provider in the helper's Vault, request access from the wiki and approve the matching code in ForgeShare. The helper sends the requests. Each browser/wiki needs its own approval.

For more detail, see the [step-by-step AI plugin guide](../plugins/ai/README.md).

## Known limits

| Feature or question | Current position |
| --- | --- |
| Can a downloaded wiki run without AI? | **Yes.** Editing does not require a connection. |
| Are manually entered API keys saved into the HTML wiki? | **No, not by the connection form.** They live in the browser tab's JavaScript memory. Do not put keys in normal tiddlers. |
| Can the wiki read saved Chrome passwords automatically? | **No.** A password manager may offer autofill, but the wiki cannot access its password store. |
| Do cloud providers always work from a local HTML file? | **No.** Browser CORS rules and provider policies may prevent requests. |
| Does ForgeShare put a private key into the wiki? | **No.** The Vault holds the key in the separate helper; the browser gets approved metadata and responses. |
| Is Gemini available through ForgeShare Vault? | **Yes, in helper 0.1.19.** Configure an API key from Google AI Studio and approve the selected wiki/device. Live-provider acceptance is still pending. |
| Is screenshot analysis supported? | **Yes, in the 0.4.2 plugin with 0.1.19 helper**, for compatible vision models; automated adapter/media tests pass. Real Mac/iPad/Tailscale/Gemma 4 acceptance is pending. Image **generation** through Vault is not implemented. |
| Is AI connection setup synchronized across devices? | **No automatic cross-device secret synchronization.** Configure or approve each relevant client. |

Manual browser connections use official HTTPS provider hosts for cloud APIs and optional user-supplied local API URLs. Same-page JavaScript and browser extensions may see manually entered keys. If a provider blocks cross-origin requests, Forge does not secretly bypass CORS or forward all users' keys through a shared server.

## Implementation notes: what changed from the original plan

The original HUWiki AI plugin depended on Apps Script (`google.script.run`) and private user properties. Forge replaced that path with an explicit local-helper Vault route and a separate manual, session-only browser route. The older proposed functions (`listConnections`, `setConnection`, `requestCompletion` and related operations) were **design ideas**, not a public stable JavaScript API. Consult the current plugin source and tests before building against an interface.

Local PNG/JPEG/WebP media saved through ForgeShare lives on the host machine, not inside the exported HTML wiki. Back up the media directory separately. The ForgeShare simulated-browser test exercises approval and text-message flows without sending real paid cloud requests. It must not be reported as physical-device or live cloud-provider acceptance. [ForgeShare public status](../downloads/forgeshare/README.md) is maintained separately.
