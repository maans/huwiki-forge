/**
 * HUWiki Google Drev – testadapter (ikke produktionsklar).
 * Webappen skal implementeres som USER_ACCESSING og ANYONE (logget ind).
 * Kræver Advanced Google Drive Service (v3), men IKKE UrlFetchApp eller Picker.
 */
const HU_MAX_BYTES = 12 * 1024 * 1024;

function huFileId_(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new Error("Ugyldigt Google Drive-fil-ID.");
  return id;
}

function huEmail_(value) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error("Angiv en gyldig Google-kontomailadresse.");
  return email;
}

function huFile_(id) {
  const fileId = huFileId_(id);
  const meta = Drive.Files.get(fileId, {
    fields: "id,name,mimeType,size,version,md5Checksum,modifiedTime,capabilities(canEdit,canShare)",
    supportsAllDrives: true
  });
  if (meta.mimeType !== "text/html" || !/\.html?$/i.test(meta.name || "")) {
    throw new Error("Kun almindelige HTML-wikifiler understøttes.");
  }
  return meta;
}

function huPublicMeta_(meta) {
  return {
    id: meta.id,
    name: meta.name || "wiki.html",
    version: String(meta.version || ""),
    // MD5 checks the actual HTML bytes, unaffected by Drive sharing changes.
    fingerprint: String(meta.md5Checksum || ""),
    modifiedTime: meta.modifiedTime || null,
    canEdit: !!(meta.capabilities && meta.capabilities.canEdit),
    canShare: !!(meta.capabilities && meta.capabilities.canShare)
  };
}

function doGet(e) {
  const view = HtmlService.createTemplateFromFile("Index");
  const requested = e && e.parameter && e.parameter.id || "";
  view.initialIdJson = JSON.stringify(/^[A-Za-z0-9_-]{10,200}$/.test(requested) ? requested : "");
  return view.evaluate().setTitle("HUWiki Google Drev – test");
}

/** Indlæs den eksisterende wiki med den aktuelle brugers Drive-rettigheder. */
function huOpen(fileId) {
  const started = Date.now();
  const meta = huFile_(fileId);
  if (meta.size && Number(meta.size) > HU_MAX_BYTES)
    throw new Error("Testadapterens filgrænse er 12 MB. Filen er ikke ændret.");
  // Hent filindholdet én gang. Må ikke kalde getBytes() på store wikier
  // blot for at måle størrelse, når Drive allerede leverer metadata.size.
  const html = DriveApp.getFileById(meta.id).getBlob().getDataAsString("UTF-8");
  return {
    meta: huPublicMeta_(meta),
    html: html,
    elapsedMs: Date.now() - started
  };
}

/**
 * HTML-service upload via <form> og google.script.run. Dette er en lokal HTML-filvælger,
 * IKKE Google Picker. Hverken OAuth-token eller brugerens filer sendes til Forge/GitHub.
 */
function huCreate(form) {
  const started = Date.now();
  if (!form || !form.wikiFile) throw new Error("Vælg en HTML-fil.");
  const upload = form.wikiFile;
  const name = String(upload.getName() || "HUWiki.html").replace(/[\\/]/g, "-");
  if (!/\.html?$/i.test(name)) throw new Error("Filen skal være en .html-wiki.");
  const bytes = upload.getBytes();
  if (!bytes.length || bytes.length > HU_MAX_BYTES)
    throw new Error("HTML-filen skal være mellem 1 byte og 12 MB.");
  // Blob'en kommer allerede fra HTML Service. Genbrug den direkte, så
  // store filer ikke kopieres endnu en gang ind i Utilities.newBlob().
  upload.setName(name).setContentType("text/html");
  const meta = Drive.Files.create(
    {name: name, mimeType: "text/html"},
    upload,
    {fields: "id,name,mimeType,version,modifiedTime,capabilities(canEdit,canShare)"}
  );
  return {meta: huPublicMeta_(huFile_(meta.id)), elapsedMs: Date.now() - started};
}

/**
 * Gem hele HTML-filen. En script-lock og Googles indholds-checksum begrænser
 * samtidige overskrivninger fra dette Apps Script-projekt.
 * Der er IKKE atomisk beskyttelse mod andre Drive-klienter.
 */
function huSave(fileId, html, expectedFingerprint) {
  const started = Date.now();
  const id = huFileId_(fileId);
  if (typeof html !== "string" || !html.length)
    throw new Error("Kan ikke gemme: HTML-indholdet er tomt.");
  const htmlBlob = Utilities.newBlob(html, "text/html");
  if (htmlBlob.getBytes().length > HU_MAX_BYTES)
    throw new Error("Kan ikke gemme: HTML-indholdet er over 12 MB.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const current = huFile_(id);
    if (!current.capabilities || !current.capabilities.canEdit)
      throw new Error("Du har ikke redigeringsadgang til denne wiki.");
    // Drive's "version" increases for metadata/permission changes, even when
    // the wiki's HTML is unchanged. This caused a FALSE first-save conflict.
    // The checksum remains stable until the actual file content changes.
    const diskFingerprint = String(current.md5Checksum || "").toLowerCase();
    const baseline = String(expectedFingerprint || "").toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(diskFingerprint) ||
        !/^[a-f0-9]{32}$/.test(baseline)) {
      throw new Error("Drive kunne ikke bekræfte filens indholds-checksum. Gemning er stoppet for at beskytte dine ændringer.");
    }
    if (diskFingerprint !== baseline) {
      return {ok: false, conflict: true, meta: huPublicMeta_(current),
        message: "WIKI-KONFLIKT: Filens indhold er ændret på Google Drive siden åbning. Hent en lokal kopi før genindlæsning."};
    }
    htmlBlob.setName(current.name);
    Drive.Files.update(
      {mimeType: "text/html"},
      id,
      htmlBlob,
      {fields: "id,version,modifiedTime", supportsAllDrives: true}
    );
    const savedMeta = huFile_(id);
    return {ok: true, meta: huPublicMeta_(savedMeta), elapsedMs: Date.now() - started};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Del med en Google-konto. Drive selv sender invitationen, så
 * hverken MailApp, GmailApp eller UrlFetchApp er nødvendig.
 */
function huShare(fileId, recipientEmail, role) {
  const id = huFileId_(fileId);
  const email = huEmail_(recipientEmail);
  if (role !== "reader" && role !== "writer") throw new Error("Ukendt adgangsrolle.");
  const meta = huFile_(id);
  if (!meta.capabilities || !meta.capabilities.canShare)
    throw new Error("Du må ikke dele denne fil.");
  const appUrl = ScriptApp.getService().getUrl();
  const link = appUrl ? appUrl + "?id=" + encodeURIComponent(id) : "";
  const permission = Drive.Permissions.create(
    {type: "user", role: role, emailAddress: email},
    id,
    {
      supportsAllDrives: true,
      sendNotificationEmail: true,
      emailMessage: "Du er inviteret til en HUWiki. Åbn den i HUWiki Google Drev: " + link,
      fields: "id"
    }
  );
  return {
    recipient: email,
    role: role,
    permissionId: permission.id,
    link: link
  };
}
