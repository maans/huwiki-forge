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
    fields: "id,name,mimeType,size,version,md5Checksum,modifiedTime,properties,capabilities(canEdit,canShare)",
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
    canShare: !!(meta.capabilities && meta.capabilities.canShare),
    snapshotSeq: Number(meta.properties && meta.properties["forgeDriveSnapshotSeq"] || 0),
    syncEnabled: !!(meta.properties && meta.properties["forgeDriveSyncSheetId"])
  };
}

/**
 * Official Apps Script /exec deep link. Never derive it from the sandboxed
 * HTML Service iframe origin (script.googleusercontent.com).
 */
function huLaunchUrl_(fileId) {
  const base = ScriptApp.getService().getUrl() || "";
  return base ? base + (base.includes("?") ? "&" : "?") +
    "id=" + encodeURIComponent(huFileId_(fileId)) : "";
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
  // Avoid pairing an old snapshot cursor with new HTML bytes (or vice versa)
  // if another collaborator saves during this download.
  const verified = huFile_(meta.id);
  const metaSeq = String(meta.properties && meta.properties.forgeDriveSnapshotSeq || "0");
  const verifiedSeq = String(verified.properties && verified.properties.forgeDriveSnapshotSeq || "0");
  if (meta.md5Checksum !== verified.md5Checksum || metaSeq !== verifiedSeq) {
    throw new Error("Wikien blev opdateret, mens den blev hentet. Åbn den igen for at undgå tabte ændringer.");
  }
  return {
    meta: huPublicMeta_(verified),
    html: html,
    launchLink: huLaunchUrl_(verified.id),
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
function huSave(fileId, html, expectedFingerprint, expectedDeltaSeq) {
  const started = Date.now();
  const id = huFileId_(fileId);
  if (typeof html !== "string" || !html.length)
    throw new Error("Kan ikke gemme: HTML-indholdet er tomt.");
  // Cheap early guard. Exact UTF-8 size is checked only if the
  // preflight checksum succeeds; do not build a 2.5 MB blob for conflicts.
  if (html.length > HU_MAX_BYTES)
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

    // Snapshots must be based on the exact journal state that has reached
    // this browser. A concurrent delta push and a whole-HTML upload use the
    // same script lock, so no logged edits can slip between this check and
    // the Drive write. Never write a stale HTML snapshot over a newer log.
    const sheetId = current.properties && current.properties["forgeDriveSyncSheetId"];
    let journalHead = 0;
    if (sheetId) {
      const book = huSyncGetBook_(id, sheetId);
      journalHead = Math.max(0, book.journal.getLastRow() - 1);
      if (!Number.isSafeInteger(expectedDeltaSeq) || expectedDeltaSeq !== journalHead) {
        return {ok: false, conflict: true, meta: huPublicMeta_(current),
          message: "SNAPSHOT-KONFLIKT: Ændringsloggen er nyere end den indlæste wiki. Synkronisér først, eller hent en lokal sikkerhedskopi."};
      }
    }
    const htmlBlob = Utilities.newBlob(html, "text/html", current.name);
    if (htmlBlob.getBytes().length > HU_MAX_BYTES)
      throw new Error("Kan ikke gemme: HTML-indholdet er over 12 MB.");
    // Use metadata from the upload response, which normally already contains
    // the NEW checksum. This saves a second Drive.Files.get() and prevents
    // a stale follow-up version/fingerprint after a successful upload.
    const uploadMetadata = {mimeType: "text/html"};
    if (sheetId) {
      uploadMetadata.properties = {["forgeDriveSnapshotSeq"]: String(journalHead)};
    }
    const updated = Drive.Files.update(
      uploadMetadata,
      id,
      htmlBlob,
      {fields: "id,name,mimeType,version,md5Checksum,modifiedTime,properties,capabilities(canEdit,canShare)", supportsAllDrives: true}
    );
    const savedMeta = updated && updated.md5Checksum ? updated : huFile_(id);
    // Some mocks and Drive variants omit property values from upload replies.
    if (sheetId) {
      savedMeta.properties = Object.assign({}, current.properties, savedMeta.properties, {
        ["forgeDriveSnapshotSeq"]: String(journalHead)
      });
    }
    return {ok: true, meta: huPublicMeta_(savedMeta), elapsedMs: Date.now() - started};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Return the current direct user permission, if present. Drive returns
 * multiple pages for larger shared files, so never only scan the first one.
 */
function huFindShare_(fileId, email) {
  let token = "";
  do {
    const page = Drive.Permissions.list(fileId, {
      fields: "nextPageToken,permissions(id,type,role,emailAddress,deleted)",
      pageSize: 100,
      pageToken: token || undefined,
      supportsAllDrives: true
    });
    const found = (page.permissions || []).find(p =>
      !p.deleted && p.type === "user" &&
      String(p.emailAddress || "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    token = page.nextPageToken || "";
  } while (token);
  return null;
}

/** Grant or update direct Drive permission without duplicate invitations. */
function huGrantShare_(fileId, email, role, notify, invitationLink) {
  const existing = huFindShare_(fileId, email);
  if (existing) {
    if (existing.role === role) return {id: existing.id, created: false, previousRole: role};
    if (existing.role === "owner") throw new Error("Ejerskab kan ikke ændres her.");
    Drive.Permissions.update({role: role}, fileId, existing.id, {
      fields: "id", supportsAllDrives: true
    });
    return {id: existing.id, created: false, previousRole: existing.role};
  }
  const options = {
    fields: "id",
    supportsAllDrives: true,
    sendNotificationEmail: notify
  };
  if (notify) {
    // Google's automatically generated file card always opens the raw Drive
    // preview. Place the ForgeDrive /exec link on its own line and explain
    // this difference explicitly in both languages.
    options.emailMessage =
      "Åbn wikien i ForgeDrive / Open the wiki in ForgeDrive:\n" +
      invitationLink +
      "\n\nBrug dette link, ikke Googles filkort (Demo.html), som kun viser HTML-forhåndsvisning." +
      "\nUse this app link, not the Google Drive file card, which only previews the HTML.";
  }
  const created = Drive.Permissions.create(
    {type: "user", role: role, emailAddress: email},
    fileId,
    options
  );
  return {id: created.id, created: true, previousRole: null};
}

/**
 * Share both the HTML file and its companion spreadsheet; Drive sends the
 * invitation only once. Repeat shares are idempotent and role changes update
 * BOTH resources. Roll back any new/changed journal grant if wiki sharing
 * fails, preserving the previous permissions.
 */
function huShare(fileId, recipientEmail, role) {
  const id = huFileId_(fileId);
  const email = huEmail_(recipientEmail);
  if (role !== "reader" && role !== "writer") throw new Error("Ukendt adgangsrolle.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const meta = huFile_(id);
    if (!meta.capabilities || !meta.capabilities.canShare)
      throw new Error("Du må ikke dele denne fil.");
    const link = huLaunchUrl_(id);
    const sheetId = meta.properties && meta.properties["forgeDriveSyncSheetId"];
    let journal = null;
    if (sheetId) journal = huGrantShare_(huFileId_(sheetId), email, role, false, "");
    let wiki;
    try {
      wiki = huGrantShare_(id, email, role, true, link);
    } catch (error) {
      if (journal && journal.previousRole !== role) {
        try {
          if (journal.created) {
            // Advanced Drive exposes v3 permissions.delete as remove(fileId, permissionId).
            Drive.Permissions.remove(sheetId, journal.id);
          } else {
            Drive.Permissions.update({role: journal.previousRole}, sheetId, journal.id, {
              fields: "id", supportsAllDrives: true
            });
          }
        } catch (rollbackError) {
          console.error("Kunne ikke gendanne adgang til ændringsloggen:", rollbackError);
        }
      }
      throw error;
    }
    return {
      recipient: email,
      role: role,
      permissionId: wiki.id,
      journalPermissionId: journal && journal.id || null,
      link: link
    };
  } finally {
    lock.releaseLock();
  }
}
