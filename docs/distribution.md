# Download, share or self-host Forge

## I only want my own wiki

1. Open [Forge](https://forge.måns.dk/) and choose **Open demo** to try an Edition.
2. Choose **Customize and download**, or go directly to the [Assembler](https://forge.måns.dk/assembler/).
3. Click **Build and download your wiki**. Open the HTML file, edit it, and use TiddlyWiki's **Save** button.

This is a **download of your wiki**, not a copy of the Forge source repository. Forge does not create an online account or synchronize your downloaded copies.

## I want to use the source code

| GitHub action | Result |
| --- | --- |
| **Fork** | Your repository copy with Git history; you can later merge upstream changes yourself. |
| **Download ZIP** | A snapshot of the source files without Git history; not a ready-to-open assembled Edition. |
| **Use this template** | An independent repository **only if** the owner has enabled GitHub's template option. Do not assume it is enabled. |

If you publish your own fork with GitHub Pages, enable Pages in that fork and adjust links, paths and the `CNAME` file for **your own** domain. The original `forge.måns.dk` name is not yours to use by copying the repository. Built-in links and same-origin plugin/library URLs may also need configuration and verification.

## What remains manual

A downloaded wiki does **not** update itself when Forge changes. To receive newer plugins, use TiddlyWiki's plugin library and save/reload; to change the Edition composition, build a new copy and deliberately migrate your content. Publishing a site, running a server and giving others editing access are separate operations with separate requirements.

See [security and data boundaries](security.md), [the plugin guide](../plugins/README.md) and [ForgeShare Mac test](../downloads/forgeshare/README.md).
