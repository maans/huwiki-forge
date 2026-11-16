# AI Forge — experimental AI connections

**Current plugin metadata:** 0.4.1-test.3. This is a test integration, not a promise that every provider, browser, model or image function works.

[Try AI Edition in Forge](https://forge.måns.dk/) · [Connection and privacy details](../../docs/ai-connections.md) · [ForgeShare Mac instructions](../../downloads/forgeshare/README.md)

## Choose how to connect

| Connection | What you do | Where the API key stays |
| --- | --- | --- |
| **Manual browser connection** | In AI Forge, select OpenAI, Claude, Gemini, LM Studio or Ollama; enter the server address/model and key if required. | In memory in the **current browser tab**. Reloading loses the key. |
| **ForgeShare Vault** | Open the wiki through the ForgeShare Mac helper, add a connection in its Vault, request access from AI Forge, check the displayed code and approve the wiki/device. | In ForgeShare, **outside the wiki**. The browser receives connection metadata and replies, not the key. |

### Try a manual connection

1. Open **AI Edition**, then its AI connection controls.
2. Choose **Manual** and your provider. For a local model, start LM Studio or Ollama first and enter its local API URL. For a cloud model, use a provider API key, not a Google OAuth client ID.
3. Select or enter a model, then send a short test message.
4. Use **Forget key** when finished. A page reload also clears the manual key.

Manual requests run from the browser and can fail because of CORS or local-server settings. Browser password managers **may** offer autofill; the wiki cannot read your browser's saved passwords on its own. Do not paste API keys into ordinary wiki tiddlers or chat messages.

### Try ForgeShare Vault

1. Install the separate [Mac app](../../downloads/forgeshare/README.md), including its Node.js prerequisite, and open your wiki through ForgeShare.
2. Create the desired connection in ForgeShare's Vault.
3. In the wiki, request access and approve the matching request/code in ForgeShare. Refresh the list of approved connections before testing a chat.

The public **0.1.18-test Mac ZIP does not yet include the updated Gemini Vault support** described in the ForgeShare development branch [PR #8](https://github.com/maans/huwiki-forge/pull/8). Manual Gemini is a separate experimental option. Vault image generation and image analysis are **not verified** for the public test. Access from another browser or device needs its own approval.

## What is and is not saved

The manual key is not deliberately written to tiddlers, downloaded HTML, localStorage, sessionStorage, request URLs or GitHub; provider/model and local URL preferences may remain as non-secret browser settings. Because the manual key exists in the browser page's memory, other scripts or extensions with page access may still see it. ForgeShare Vault is preferable when the key must stay outside the page.

AI chat content that you choose to store in your wiki is different from a connection secret. Do not assume that saving or sharing the HTML file hides the chat.

## For developers

The migrated HUWiki AI plugin retains editable source tiddlers under `src/`. Build with `node scripts/build-forge-ai.mjs`; the installable bundle is `dist/plugin.json`. Its original Apps Script vault calls were replaced at the connection boundary. The ForgeShare browser smoke test uses an isolated simulated Vault and does **not** verify paid cloud-provider requests. See [AI connections](../../docs/ai-connections.md) for the trust model and known limitations.

**Dansk, kort fortalt:** Du kan indtaste en AI-nøgle manuelt til den aktuelle browserfane eller bruge ForgeShare Vault, hvor nøglen bliver uden for wikien. Manuel adgang kræver ofte korrekte CORS-indstillinger; den offentlige Mac-ZIP har endnu ikke den nye Gemini Vault-understøttelse. Billedfunktionerne via Vault er ikke verificeret.
