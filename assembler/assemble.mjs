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

export const CORE_LIBRARY_MARKER = "<!--~~ Library modules ~~-->";

export function validateCore(html) {
  if (typeof html !== "string" || !html.includes(CORE_LIBRARY_MARKER) ||
      !html.includes("tiddlywiki-tiddler-store") || !html.includes("$:/core")) {
    throw new Error("Ugyldig eller inkompatibel TiddlyWiki empty.html (Library modules-markøren eller kernen mangler).");
  }
  return true;
}

export function assembleHtml(emptyHtml, tiddlers) {
  validateCore(emptyHtml);
  validateTiddlers(tiddlers);
  // Same escaping and insertion marker as the original HUWiki Code.js.
  const safeJson = JSON.stringify(tiddlers)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const store = '<script class="tiddlywiki-tiddler-store" type="application/json">' +
    safeJson + "</script>";
  const index = emptyHtml.indexOf(CORE_LIBRARY_MARKER);
  return emptyHtml.slice(0,index) +
    "\n<!-- HUWiki Forge Edition -->\n" + store + "\n" + emptyHtml.slice(index);
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


/**
 * Github Pages may temporarily serve an old copy when its bot synchronizes
 * a new core with GITHUB_TOKEN. Use GitHub's raw origin as fallback.
 * Infer owner/repository from GitHub Pages URL so forks remain independent.
 */
export function githubRawCoreUrl(pageUrl) {
  const url = new URL(pageUrl);
  const match = /^([a-z0-9-]+)\.github\.io$/i.exec(url.hostname);
  if (!match) return null;
  const owner = match[1];
  const segments = url.pathname.split("/").filter(Boolean);
  const repo = segments[0] || owner + ".github.io";
  return "https://raw.githubusercontent.com/" + encodeURIComponent(owner) + "/" +
    encodeURIComponent(repo) + "/main/core/empty.html";
}

export async function loadOfficialCore(baseUrl, fetcher = fetch) {
  const localUrl = new URL("../core/empty.html", baseUrl).href;
  const candidates = [localUrl];
  const rawUrl = githubRawCoreUrl(baseUrl);
  if (rawUrl) candidates.push(rawUrl);
  candidates.push("https://tiddlywiki.com/empty.html");
  const errors = [];
  for (const url of candidates) {
    try {
      const response = await fetcher(url);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      validateCore(html);
      return { html, sourceUrl: url };
    } catch (error) {
      errors.push(url + ": " + String(error.message || error));
    }
  }
  throw new Error("Kunne ikke hente en gyldig TiddlyWiki-kerne automatisk. " +
    "GitHub-spejlet skal først oprettes. " + errors.join(" | "));
}
