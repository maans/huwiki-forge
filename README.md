# TiddlyWiki Forge

**Public test project — not a finished release.** Forge helps you build your own editable [TiddlyWiki](https://tiddlywiki.com/) from a selected Edition (a starting set of tools and content). The result is an HTML wiki you can keep and edit yourself.

**English** · [Dansk](#dansk)

**[Open Forge](https://forge.måns.dk/)** · [Try the simple demo](https://forge.måns.dk/demo/?edition=demo&lang=en) · [Customize a wiki](https://forge.måns.dk/assembler/) · [Plugin Library](https://forge.måns.dk/library/plugins/index.html)

## Get started

1. On the [Forge homepage](https://forge.måns.dk/), choose **Open demo** on an Edition card to try it without installing anything.
2. Choose **Customize & download** to select tools, examples and a theme. In the Assembler, click **Build & download your wiki**.
3. Open the downloaded HTML file, edit it in TiddlyWiki and use TiddlyWiki's **Save** button to keep your changes.

You do **not** need a GitHub or Google account to try Forge. Forge does **not** automatically store or synchronize your wiki online. Keep backups of your HTML file. Some downloads, AI connections and publishing features need an internet connection or another service.

## What can I try?

All Editions are **test versions**; a working automated test does not mean every feature has been tested on Mac, Windows, iPad and all browsers.

| Edition | What it is for |
| --- | --- |
| **Demo** | A small wiki for trying editing and saving. |
| **HUPedia** | Editable articles, fact boxes and bilingual article views. |
| **Music** | ABC notation, playback, a mixer, teaching examples and MuseScore-to-ABC import. |
| **AI** | OpenAI, Claude, Gemini and local models; manual sessions or approved ForgeShare Vault, including screenshot analysis. |
| **CutOut / Drawing / Slideshow** | Scenes, drawings and presentations. Some device and import/export workflows are still being tested. |
| **Shop** | A local product catalogue and guided, optional order-form setup. |
| **HUPin** | Clickable points on images and SVGs. |

See the [live Edition catalogue](https://forge.måns.dk/) for the available choices and their specific limitations. You can also [open the Assembler directly](https://forge.måns.dk/assembler/). Extra plugins and examples can be deselected; if a tool is required by another selection, the Assembler adjusts the dependent selection and explains the change.

## ForgeShare 0.1.19 — Windows, Mac and Linux

[Download ForgeShare](downloads/forgeshare/README.md) · [First-run and unsigned-app installation guide (English/Danish)](downloads/forgeshare/HOWTO.md)

**Physically verified on 16 November 2026:** The owner used the normal, native Windows `ForgeShare.exe` with private Tailscale to Chrome on an iPad. Both Windows and iPad could create and save tiddlers in the same server wiki. The app also worked **without Run as administrator**, after its unsigned-app first-run confirmation. This is shared editing on one TiddlyWiki server, not synchronization of separate single-file wikis.

**Beta distribution:** Four separate 0.1.19 ZIP packages are available (Windows native, Windows Node-only, Mac and Linux). Installing or updating the optional ForgeShare TiddlyWiki plugin does **not** install the host program. Mac is ad-hoc signed, not notarized; Windows native EXE is unsigned. A previous Windows package triggered Defender `Trojan:Script/Wacatac.B!ml`; this remains unresolved, so do not bypass a malware detection or disable antivirus. Public Funnel, the Windows Node-only variant and live Gemma 4 image analysis still need physical acceptance.


## Plugins, source and developer notes

- [Install or build plugins](plugins/README.md) and [find Edition manifests](editions/README.md).
- [Documentation index](docs/README.md) separates current instructions from older plans and migration notes.
- [AI connection options and limitations](docs/ai-connections.md) and [ForgeShare setup](downloads/forgeshare/README.md).
- [Assembler implementation](assembler/README.md), [Forge homepage architecture](docs/forge-home.md) and [Plugin Library architecture](docs/forge-libraries.md).

Developers: install **Node.js 20 or later** and run `npm test`. Browser/device checks are separate from these automated tests. Changes to the generated homepage or package registry must also follow the build instructions in their respective technical documents.

The new Forge code does **not** yet have a repository-wide license decision. Individual third-party components retain their own licenses; do not assume the same license covers every file.

## Dansk

**Forge er et offentligt testprojekt.** Her kan du prøve en Edition eller sammensætte din egen TiddlyWiki. En Edition er et udgangspunkt med bestemte værktøjer, eksempler og indstillinger.

1. Gå til [Forge-forsiden](https://forge.måns.dk/), og vælg **Åbn demo** for at afprøve en Edition.
2. Vælg **Tilpas og hent**, hvis du vil bestemme, hvilke værktøjer og eksempler der følger med. Klik **Byg og hent din wiki**.
3. Åbn HTML-filen, redigér i TiddlyWiki, og brug **Gem**. Behold en sikkerhedskopi.

Du behøver ingen konto. Forge gemmer eller synkroniserer **ikke** automatisk din wiki på nettet. Alle Editions er testudgaver med forskellige begrænsninger.

Se [dokumentationsoversigten](docs/README.md), [vejledningen til Assembler](assembler/README.md), [AI-forbindelser](docs/ai-connections.md) og [ForgeShare til Mac, Windows og Linux](downloads/forgeshare/README.md).
