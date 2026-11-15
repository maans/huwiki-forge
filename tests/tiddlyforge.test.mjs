import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../", import.meta.url);
async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("TiddlyForge is a two-tiddler, dependency-free native TiddlyWiki plugin", async () => {
  const pkg = await json("plugins/tiddlyforge/dist/plugin.json");
  const source = await json("plugins/tiddlyforge/src/tiddlers.json");
  const shared = await json("editions/shared/libraries.json");
  const entries = JSON.parse(pkg.text).tiddlers;
  const library = entries["$:/config/HUWikiPluginLibrary"];
  const button = entries["$:/huwiki/forge/page-control"];
  assert.equal(pkg.title, "$:/plugins/huwiki/tiddlyforge");
  assert.equal(pkg["plugin-type"], "plugin");
  assert.deepEqual(entries, source.tiddlers, "Bundle must match human-readable source");
  assert.equal(Object.keys(entries).length, 2);
  assert.deepEqual(library, shared.find(x => x.title === library.title), "Reuse same Forge library configuration as Editions");
  assert.deepEqual(button, shared.find(x => x.title === button.title), "Reuse same F control as Editions");
  assert.equal(library.url, "https://forge.xn--mns-ula.dk/library/plugins/index.html");
  assert.equal(library.caption, "Forge Plugin Library");
  assert.ok(library.tags.includes("$:/tags/PluginLibrary"), "Use TiddlyWiki's built-in library selector");
  assert.ok(button.tags.includes("$:/tags/PageControls"), "Use existing page tools");
  assert.match(button.text, /href="https:\/\/forge\.xn--mns-ula\.dk\/"/);
  assert.match(button.text, /tc-image-tiddlyforge tc-image-button/, "Icon must follow native toolbar styles");
  assert.match(button.text, /width="22pt" height="22pt"/);
  assert.doesNotMatch(button.text, /font-size|font-weight|fill=|color:/i, "No black or oversized inline glyph");
  assert.match(button.text, /target="_blank"/);
  assert.match(button.text, /rel="noopener noreferrer"/);
  assert.ok(library.text.includes("$:/language"), "Library instructions follow TiddlyWiki language");
  assert.ok(!("$:/config/OfficialPluginLibrary" in entries), "Never replace the official library");
  assert.ok(!Object.values(entries).some(x => x["module-type"] === "startup"), "No startup code, automatic plugin downloads or additional UI");
});

test("TiddlyForge is listed in the standard Forge plugin registry", async () => {
  const registry = await json("library/plugins/registry.json");
  const pkg = await json("plugins/tiddlyforge/dist/plugin.json");
  const found = registry.items.filter(x => x.fields.title === pkg.title);
  assert.equal(found.length, 1);
  assert.equal(found[0].fields.version, pkg.version);
  assert.equal(found[0].path, "../../plugins/tiddlyforge/dist/plugin.json");
});
