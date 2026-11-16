# Security and data: what Forge does

**Forge is a public test project, not a security audit or hosted account service.** The Forge homepage and Assembler are published as static files. They do not, by themselves, host your edited wiki, receive private changes or synchronize copies.

## Where your data goes

- **Downloaded wiki:** Your edits are saved using TiddlyWiki's own **Save** function. Keep backups of the resulting HTML file. Sharing that file can also share the content stored in it.
- **Plugins:** An installed TiddlyWiki plugin is executable code in the wiki. Only install and share packages from sources you trust. Third-party licenses and permissions still apply.
- **AI:** A manual key entered in AI Forge's dedicated connection control stays in the **current tab's memory**, not deliberately in the wiki file. Other page scripts or extensions may still access it. ForgeShare Vault keeps credentials in a **separate helper** and requires explicit client approval. See [AI connection details](ai-connections.md).
- **Publishing:** An exported site or a server opened for sharing is **not** the same as saving a private wiki. Review its public content and access controls before distributing it.
- **Browser/network:** GitHub Pages cannot accept server-side writes by itself; Forge does not bypass browser CORS rules. Tailscale/private networking and public internet exposure have different security boundaries.

Do **not** insert tokens or API keys into ordinary tiddlers, plugin source, exported HTML, Git commits or screenshots. A documentation claim of “local” does not mean “inaccessible to every script or device.”

The [public ForgeShare Mac test](../downloads/forgeshare/README.md) is not Developer ID signed or notarized. An earlier Windows build triggered an unresolved Defender detection; there is no public Windows download. Use test software only after reviewing its source and limitations.

Automated tests check specific code paths and package behavior. They are not a substitute for a security review or tests on the actual device and network you intend to use.
