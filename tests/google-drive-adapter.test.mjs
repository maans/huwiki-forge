import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const plugin = JSON.parse(read("plugins/google-drive/dist/plugin.json"));
const inner = JSON.parse(plugin.text);
const catalog = JSON.parse(read("catalog/editions.json"));
const manifest = JSON.parse(read("integrations/google-drive-apps-script/appsscript.json"));
const server = read("integrations/google-drive-apps-script/Code.gs");
const ui = read("integrations/google-drive-apps-script/Index.html");

test("Google Drive integration is strictly optional in Forge", () => {
  const addOn = catalog.plugins.find(p => p.id === "google-drive");
  assert.ok(addOn);
  assert.equal(addOn.status, "prototype");
  assert.equal(addOn.file, "../plugins/google-drive/dist/plugin.json");
  for (const edition of catalog.editions) {
    assert.ok(!edition.bundledPlugins?.includes("google-drive"));
  }
  assert.equal(plugin.title, "$:/plugins/huwiki/google-drive");
  assert.equal(plugin["plugin-type"], "plugin");
  assert.ok(inner.tiddlers["$:/plugins/huwiki/google-drive/sidebar"]);
  assert.ok(inner.tiddlers["$:/plugins/huwiki/google-drive/ui-da"]);
  assert.ok(inner.tiddlers["$:/plugins/huwiki/google-drive/ui-en"]);
  for (const tiddler of Object.values(inner.tiddlers)) {
    assert.equal(typeof tiddler.text, "string");
    assert.equal(typeof tiddler.title, "string");
  }
});

test("Apps Script runs as the accessing user and does not require mail or URL Fetch scopes", () => {
  assert.equal(manifest.webapp.executeAs, "USER_ACCESSING");
  assert.equal(manifest.webapp.access, "ANYONE");
  assert.deepEqual(manifest.oauthScopes, ["https://www.googleapis.com/auth/drive"]);
  assert.equal(manifest.dependencies.enabledAdvancedServices[0].version, "v3");
  assert.doesNotMatch(server, /UrlFetchApp\s*\.|MailApp\s*\.|GmailApp\s*\./);
  assert.doesNotMatch(server, /PickerBuilder|google\.picker/);
});

test("server supports file version preflight and Drive sharing notifications", () => {
  assert.match(server, /LockService\.getScriptLock\(\)/);
  assert.match(server, /String\(current\.version\)\s*!==\s*String\(expectedVersion\)/);
  assert.match(server, /Drive\.Files\.update\(/);
  assert.match(server, /Drive\.Permissions\.create\(/);
  assert.match(server, /sendNotificationEmail:\s*true/);
  assert.match(server, /emailMessage:/);
});

test("HTML app exposes local upload, Google Drive invitation and wiki saver", () => {
  assert.match(ui, /name="wikiFile" type="file"/);
  assert.match(ui, /huCreate\(form\)/);
  assert.match(ui, /huShare/);
  assert.match(ui, /huSave/);
  assert.match(ui, /huwiki-google-drive/);
  assert.match(ui, /iframe id="wiki"/);
});
