import test from "node:test";
import assert from "node:assert/strict";
import { assembleHtml, loadEdition } from "../assembler/assemble.mjs";

const empty = '<!doctype html><html><head><title>Empty</title></head><body>' +
  '<script class="tiddlywiki-tiddler-store" type="application/json">[]</script></body></html>';

test("inserts tiddlers before the original store", () => {
  const html = assembleHtml(empty, [{ title: "Demo", text: "Hej" }]);
  assert.ok(html.indexOf("Demo") < html.indexOf("<title>Empty"));
  assert.ok(html.includes("tiddlywiki-tiddler-store"));
});

test("escapes HTML-breaking strings inside JSON scripts", () => {
  const html = assembleHtml(empty, [{ title: "Attack", text: "</script><script>alert(1)</script>" }]);
  assert.ok(!html.includes('text":"</script>'));
  assert.ok(html.includes("\\u003c/script>"));
});

test("rejects duplicate tiddlers", () => {
  assert.throws(() => assembleHtml(empty, [{ title: "A" }, { title: "A" }]), /Duplikeret/);
});

test("rejects non-tiddlywiki input", () => {
  assert.throws(() => assembleHtml("<html><head></head></html>", []), /empty.html/);
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
  const result = await loadEdition("https://test.example/editions/demo/manifest.json", fetcher);
  assert.equal(result.tiddlers.length, 2);
});

test("rejects foreign-origin plugin paths", async () => {
  const fetcher = async () => ({
    ok: true, status: 200,
    json: async () => ({ schemaVersion: 1, tiddlers: [], plugins: ["https://evil.example/m.js"] })
  });
  await assert.rejects(
    loadEdition("https://test.example/m.json", fetcher), /Eksterne filreferencer/
  );
});
