import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_LIBRARY_MARKER, assembleHtml, validateCore, loadEdition,
  loadOfficialCore, githubRawCoreUrl
} from "../assembler/assemble.mjs";

const empty = '<!doctype html><html><head><title>Empty</title></head><body>' +
  '<script class="tiddlywiki-tiddler-store" type="application/json">[{"title":"$:/core"}]</script>' +
  CORE_LIBRARY_MARKER + '</body></html>';

test("inserts the edition store before the HUWiki Library modules marker", () => {
  const html = assembleHtml(empty, [{ title: "Demo", text: "Hej" }]);
  assert.ok(html.indexOf('"title":"Demo"') < html.indexOf(CORE_LIBRARY_MARKER));
  assert.ok(html.includes("tiddlywiki-tiddler-store"));
  assert.ok(html.includes("<!-- HUWiki Forge Edition -->"));
});

test("escapes HTML-breaking strings inside JSON scripts", () => {
  const html = assembleHtml(empty, [{ title: "Attack", text: "</script><script>alert(1)</script>&" }]);
  assert.ok(!html.includes('text":"</script>'));
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(html.includes("\\u0026"));
});

test("rejects duplicate tiddlers", () => {
  assert.throws(() => assembleHtml(empty, [{ title: "A" }, { title: "A" }]), /Duplikeret/);
});

test("rejects invalid or changed empty.html", () => {
  assert.throws(() => validateCore("<html><head></head></html>"), /Ugyldig/);
  assert.throws(() => assembleHtml(empty.replace(CORE_LIBRARY_MARKER, ""), []), /Ugyldig/);
});

test("loads a same-origin manifest and individual JSON files", async () => {
  const answers = {
    "https://test.example/editions/demo/manifest.json": {
      schemaVersion: 1, tiddlers: ["tiddlers/a.json"], plugins: ["../../plugins/p.json"]
    },
    "https://test.example/editions/demo/tiddlers/a.json": { title: "A", text: "B" },
    "https://test.example/plugins/p.json": { title: "$:/plugins/test/p", type: "application/json", text: "{}" }
  };
  const fetcher = async url => ({ ok: url in answers, status: url in answers ? 200 : 404, json: async () => answers[url] });
  assert.equal((await loadEdition("https://test.example/editions/demo/manifest.json", fetcher)).tiddlers.length, 2);
});

test("rejects foreign-origin plugins", async () => {
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({
    schemaVersion: 1, tiddlers: [], plugins: ["https://evil.example/m.js"]
  }) });
  await assert.rejects(loadEdition("https://test.example/m.json", fetcher), /Eksterne filreferencer/);
});

test("derives raw GitHub core URL independently for forks", () => {
  assert.equal(githubRawCoreUrl("https://maans.github.io/huwiki-forge/assembler/"),
    "https://raw.githubusercontent.com/maans/huwiki-forge/main/core/empty.html");
  assert.equal(githubRawCoreUrl("https://someone.github.io/fork/assembler/"),
    "https://raw.githubusercontent.com/someone/fork/main/core/empty.html");
  assert.equal(githubRawCoreUrl("https://forge.example.org/assembler/"), null);
});

test("loads mirrored core automatically", async () => {
  const fetcher = async url => ({
    ok: url.endsWith("/core/empty.html"), status: url.endsWith("/core/empty.html") ? 200 : 404,
    text: async () => empty
  });
  const result = await loadOfficialCore("https://maans.github.io/huwiki-forge/assembler/", fetcher);
  assert.ok(result.sourceUrl.endsWith("/core/empty.html"));
});

test("uses GitHub raw fallback when Pages lags behind", async () => {
  const requests = [];
  const fetcher = async url => {
    requests.push(url);
    return { ok: url.includes("raw.githubusercontent.com"), status: url.includes("raw.githubusercontent.com") ? 200 : 404,
      text: async () => empty };
  };
  const result = await loadOfficialCore("https://maans.github.io/huwiki-forge/assembler/", fetcher);
  assert.ok(result.sourceUrl.includes("raw.githubusercontent.com"));
  assert.equal(requests.length, 2);
});
