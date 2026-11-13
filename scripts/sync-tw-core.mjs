/*
 * Downloads upstream TiddlyWiki empty.html as a CANDIDATE.
 * Based on HUWiki's wikiFetchAndPinCore_ / wikiDetectCoreVersion_.
 * Executed on GitHub Actions, so browser CORS is not involved.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateCore } from "../assembler/assemble.mjs";

const SOURCE = "https://tiddlywiki.com/empty.html";

export function detectVersion(html) {
  for (const pattern of [
    /name=["']tiddlywiki-version["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']tiddlywiki-version["']/i,
    /TiddlyWiki\s+v?(\d+\.\d+\.\d+)/i
  ]) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1];
  }
  return "unknown";
}

export async function syncCore(fetcher = fetch, target = "core") {
  const response = await fetcher(SOURCE, { redirect: "follow" });
  if (!response.ok) throw new Error("Officiel empty.html: HTTP " + response.status);
  const html = await response.text();
  validateCore(html);
  if (Buffer.byteLength(html, "utf8") < 500000) {
    throw new Error("Den hentede TiddlyWiki-kerne er uventet lille og overskrives ikke.");
  }
  const sha256 = createHash("sha256").update(html).digest("hex");
  const version = detectVersion(html);
  const pinned = await readFile(join(target,"empty.html"),"utf8").catch(()=>null);
  if (pinned === html) return { changed:false, version, sha256, reason:"same-as-pinned" };
  const filename = join(target, "candidate-empty.html");
  let previous = "";
  try { previous = await readFile(filename, "utf8"); } catch {}
  if (previous === html) return { changed: false, version, sha256 };
  await mkdir(target, { recursive: true });
  await writeFile(filename, html, "utf8");
  await writeFile(join(target, "candidate-version.json"), JSON.stringify({
    schemaVersion: 1,
    sourceUrl: SOURCE,
    version: version,
    sha256: sha256,
    status: "candidate",
    note: "Candidate only: core/empty.html remains pinned until a separately reviewed approval."
  }, null, 2) + "\n", "utf8");
  return { changed: true, version, sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncCore().then(result => {
    process.stdout.write(JSON.stringify(result) + "\n");
  }).catch(error => {
    process.stderr.write(String(error.stack || error) + "\n");
    process.exitCode = 1;
  });
}
