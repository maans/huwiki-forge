import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../demo/demo.mjs",import.meta.url),"utf8");

test("public demos fetch the plugin registry and catalog fresh alongside bundled plugins",()=>{
 // Prevent a fresh ABC package from being rejected against an older cached registry.
 assert.ok(source.includes("const isPluginRegistry="));
 assert.ok(source.includes("const isEditionCatalog="));
 assert.ok(source.includes("const isTurnAroundLayoutFix="));
 assert.ok(source.includes("const isGraphEditionTiddlers="));
 assert.ok(source.includes("||isTurnAroundCaptions||isGraphEditionTiddlers"));
 assert.ok(source.includes("||isCutoutEditorPlugin||isTurnAroundLayoutFix"));
 assert.ok(source.includes("isEditionManifest||isPluginRegistry||isEditionCatalog"));
 assert.ok(source.includes("loadChoices(new URL('../assembler/',location.href).href,fetchFreshEditionManifest)"));
});
