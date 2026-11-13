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
  assert.equal(plugin.version, addOn.version);
  const appURL = inner.tiddlers["$:/config/huwiki/google-drive/app-url"]?.text;
  assert.equal(appURL,
    "https://script.google.com/macros/s/AKfycbxcW3X-jn0sUcNL1MKUg3RNp4UeG_4LqQyglAc9VlSKcB8mgHTAFUbO1BzAYM4tdwF-/exec");
  assert.match(inner.tiddlers["$:/plugins/huwiki/google-drive/ui-da"].text, /Åbn HUWiki Google Drev/);
  assert.match(inner.tiddlers["$:/plugins/huwiki/google-drive/ui-en"].text, /Open HUWiki Google Drive/);
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
  assert.deepEqual(manifest.oauthScopes, [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets"
  ]);
  assert.equal(manifest.dependencies.enabledAdvancedServices[0].version, "v3");
  assert.doesNotMatch(server, /UrlFetchApp\s*\.|MailApp\s*\.|GmailApp\s*\./);
  assert.doesNotMatch(server, /PickerBuilder|google\.picker/);
});

test("server uses content checksum preflight and Drive sharing notifications", () => {
  assert.match(server, /LockService\.getScriptLock\(\)/);
  assert.match(server, /diskFingerprint\s*!==\s*baseline/);
  assert.match(server, /md5Checksum/);
  assert.match(server, /Drive\.Files\.update\(/);
  assert.match(server, /Drive\.Permissions\.create\(/);
  assert.match(server, /sendNotificationEmail:\s*notify/);
  assert.match(server, /huGrantShare_\(id, email, role, true, link\)/);
  assert.match(server, /options\.emailMessage\s*=/);
  assert.match(server, /Drive\.Permissions\.remove\(sheetId, journal\.id\)/);
});

test("HTML app exposes local upload, Google Drive invitation and wiki saver", () => {
  assert.match(ui, /name="wikiFile" type="file"/);
  assert.match(ui, /huCreate\(form\)/);
  assert.match(ui, /huShare/);
  assert.match(ui, /huSave/);
  assert.match(ui, /current\.fingerprint/);
  assert.match(ui, /huwiki-google-drive/);
  assert.match(ui, /iframe id="wiki"/);
});

test("Apps Script and HTML-service client both parse as JavaScript", async () => {
  const vm = await import("node:vm");
  assert.doesNotThrow(() => new vm.Script(server));
  const scriptMatch = ui.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, "Expected one inline client script");
  // Apps Script templates insert a JSON string before evaluating the page.
  const browserScript = scriptMatch[1].replace(/<\?!= initialIdJson \?>/g, '""');
  assert.doesNotThrow(() => new vm.Script(browserScript));
});

test("TiddlyWiki saver uses synchronous boolean + asynchronous callback", () => {
  assert.match(ui, /req\.callback\(null\)/);
  assert.match(ui, /return true;\s*\}\s*\}\);/);
  assert.match(ui, /capabilities:\s*\["save"\]/);
  assert.match(ui, /tw\.config\.disableAutoSave\s*=\s*true/);
  assert.match(ui, /sh\.filterFn\.call\(tw\.wiki/);
  assert.match(ui, /unsavedAfterSnapshot\s*=\s*Math\.max\(0, changeSerial - job\.serial\)/);
  assert.match(ui, /id="saveButton"/);
  assert.match(ui, /saveWiki\(\{method:\s*"save"\}\)/);
  assert.match(ui, /beforeunload/);
  assert.match(ui, /id="enableSyncButton"/);
  assert.match(ui, /HtmlService\.createHtmlOutputFromFile\("DeltaClient"\)/);
  assert.doesNotMatch(ui, /savePending\s*=/);
  assert.match(ui, /Hent lokal sikkerhedskopi/);
});


function makeServerFixture({fingerprint = "a".repeat(32), version = "8"} = {}) {
  const vm = requireVmModule();
  let writes = 0;
  let gets = 0;
  let lastPayload = null;
  const file = {
    id: "1slj3k2JQrUh6rizHQ1gRUtghu1Wtr2az",
    name: "HUWiki-demo.html",
    mimeType: "text/html",
    size: "2553535",
    version,
    md5Checksum: fingerprint,
    modifiedTime: "2026-11-13T18:01:59.672Z",
    capabilities: {canEdit: true, canShare: true}
  };
  const ctx = {
    Drive: {Files: {
      get: () => {gets += 1; return {...file};},
      update: (_file, _id, upload) => {
        writes += 1;
        lastPayload = upload;
        file.version = String(Number(file.version) + 1);
        file.md5Checksum = "c".repeat(32);
        return {...file};
      }
    }},
    Utilities: {
      newBlob: (value) => ({
        getBytes: () => Buffer.from(value, "utf8"),
        setName(name) { this.name = name; return this; }
      })
    },
    LockService: {getScriptLock: () => ({
      waitLock() {},
      releaseLock() {}
    })}
  };
  vm.runInNewContext(server, ctx);
  return {ctx, file, get writes() {return writes;}, get gets() {return gets;}, get upload() {return lastPayload;}};
}

// Resolve once via Node's standard module loader, without adding production deps.
import vm from "node:vm";
function requireVmModule() { return vm; }

test("first save succeeds if Drive's metadata version changes but HTML checksum is unchanged", () => {
  const testEnv = makeServerFixture({fingerprint: "a".repeat(32), version: "100"});
  const result = testEnv.ctx.huSave(testEnv.file.id, "<html>local edit</html>", "a".repeat(32));
  assert.equal(result.ok, true);
  assert.equal(result.conflict, undefined);
  assert.equal(testEnv.writes, 1);
  assert.equal(testEnv.gets, 1, "save should reuse updated metadata without an extra GET");
  assert.equal(result.meta.fingerprint, "c".repeat(32));
});

test("save refuses an actual content conflict even when version does not change", () => {
  const testEnv = makeServerFixture({fingerprint: "b".repeat(32), version: "100"});
  const result = testEnv.ctx.huSave(testEnv.file.id, "<html>stale edit</html>", "a".repeat(32));
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(testEnv.writes, 0);
});

test("missing Drive checksum fails closed without overwriting", () => {
  const testEnv = makeServerFixture({fingerprint: "", version: "100"});
  assert.throws(() => testEnv.ctx.huSave(testEnv.file.id, "<html>edit</html>", ""), /checksum/);
  assert.equal(testEnv.writes, 0);
});

test("the recipient gets a bilingual warning and a separately copyable ForgeDrive deep link", () => {
  assert.match(server, /Google's automatically generated file card/);
  assert.match(server, /huLaunchUrl_\(verified\.id\)/);
  assert.match(ui, /id="launchLink"/);
  assert.match(ui, /id="copyLaunchLink"/);
  assert.match(ui, /showLaunchLink\(result\.launchLink\)/);
  assert.match(ui, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(ui, /Google's file card only previews the HTML source/);
  assert.doesNotMatch(ui, /<select[^>]+id="language"/);
});
