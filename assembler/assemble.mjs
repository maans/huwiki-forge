/*
 * HUWiki Forge — minimal Edition Assembler, first proof of concept.
 * It inserts JSON tiddler stores into empty.html BEFORE TiddlyWiki boots.
 * No custom saving mechanism, token or backend is involved.
 */

function validateTiddlers(tiddlers) {
  if (!Array.isArray(tiddlers)) {
    throw new Error("Editionen skal indeholde et array af tiddlere.");
  }
  const titles = new Set();
  for (const tiddler of tiddlers) {
    if (!tiddler || typeof tiddler !== "object" || Array.isArray(tiddler)) {
      throw new Error("Ugyldigt tiddler-objekt.");
    }
    if (typeof tiddler.title !== "string" || !tiddler.title.trim()) {
      throw new Error("Hver tiddler skal have en titel.");
    }
    if (titles.has(tiddler.title)) {
      throw new Error("Duplikeret tiddler: " + tiddler.title);
    }
    titles.add(tiddler.title);
    for (const value of Object.values(tiddler)) {
      if (typeof value !== "string") {
        throw new Error("Tiddler-felter skal være tekststrenge: " + tiddler.title);
      }
    }
  }
}

export function assembleHtml(emptyHtml, tiddlers) {
  if (typeof emptyHtml !== "string" || !emptyHtml.includes("tiddlywiki-tiddler-store")) {
    throw new Error("Filen ser ikke ud til at være en almindelig TiddlyWiki empty.html.");
  }
  validateTiddlers(tiddlers);
  const head = /<head\b[^>]*>/i;
  if (!head.test(emptyHtml)) {
    throw new Error("TiddlyWiki-filen mangler <head>.");
  }
  // Escape '<' so tiddler text cannot terminate the JSON script element.
  const safeJson = JSON.stringify(tiddlers).replace(/</g, "\\u003c");
  const store = '<script class="tiddlywiki-tiddler-store" type="application/json">' +
    safeJson + '</script>';
  return emptyHtml.replace(head, match => match + "\n" + store + "\n");
}

async function readJson(url, fetcher) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error("Kunne ikke hente " + url + " (HTTP " + response.status + ")");
  }
  return response.json();
}

export async function loadEdition(manifestLocation, fetcher = fetch) {
  const baseUrl = typeof location === "undefined" ?
    "http://localhost/" : location.href;
  const manifestUrl = new URL(manifestLocation, baseUrl);
  if (!["http:", "https:"].includes(manifestUrl.protocol)) {
    throw new Error("Manifestet skal leveres via HTTP(S).");
  }
  const manifest = await readJson(manifestUrl.href, fetcher);
  if (manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.tiddlers) ||
      !Array.isArray(manifest.plugins)) {
    throw new Error("Ukendt eller ufuldstændigt Edition-manifest.");
  }
  const references = [...manifest.tiddlers, ...manifest.plugins];
  const tiddlers = [];
  for (const reference of references) {
    if (typeof reference !== "string" || !reference) {
      throw new Error("Ugyldig filreference i Edition-manifestet.");
    }
    const url = new URL(reference, manifestUrl);
    // No arbitrary third-party code sources in this first prototype.
    if (url.origin !== manifestUrl.origin || !["http:", "https:"].includes(url.protocol)) {
      throw new Error("Eksterne filreferencer er endnu ikke tilladt: " + reference);
    }
    const data = await readJson(url.href, fetcher);
    const entries = Array.isArray(data) ? data : [data];
    tiddlers.push(...entries);
  }
  validateTiddlers(tiddlers);
  return { manifest, tiddlers };
}
