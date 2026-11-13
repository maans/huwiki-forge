/**
 * ForgeDrive — experimental tiddler-level background sync.
 *
 * One shared Google Spreadsheet per Drive-hosted wiki, NOT one Drive file per
 * tiddler. Uses SpreadsheetApp (per-user authorization), google.script.run,
 * Google Drive permissions and LockService. No UrlFetchApp or Google Picker.
 *
 * Not deployed by default: enable in a separate test version first.
 */
const HU_SYNC_PROPERTY = "forgeDriveSyncSheetId";
const HU_SYNC_HEADER = ["seq", "opId", "actor", "title", "operation", "fieldsJson", "timestamp"];
const HU_SYNC_MAX_OPS = 25;
const HU_SYNC_MAX_BATCH_CHARS = 250000;
// Google Sheets has a ~50,000-character cell limit.
const HU_SYNC_MAX_TIDDLER_CHARS = 45000;
const HU_SYNC_MAX_POLL = 250;

function huSyncLinkedId_(wikiId) {
  const wiki = huFile_(wikiId); // already enforces Drive HTML access
  const linked = Drive.Files.get(wiki.id, {
    fields: "id,properties,capabilities(canEdit,canShare)",
    supportsAllDrives: true
  });
  const sheetId = linked.properties && linked.properties[HU_SYNC_PROPERTY];
  if (sheetId) huFileId_(sheetId);
  return {wiki: wiki, sheetId: sheetId || ""};
}

function huSyncGetBook_(wikiId, sheetId) {
  const book = SpreadsheetApp.openById(huFileId_(sheetId));
  const config = book.getSheetByName("Config");
  const journal = book.getSheetByName("Events");
  if (!config || !journal ||
      String(config.getRange("A1").getValue()) !== "forgedrive-sync-v1" ||
      String(config.getRange("B1").getValue()) !== String(wikiId))
    throw new Error("Ændringsloggen er ikke tilknyttet denne wiki.");
  return {book: book, journal: journal};
}

/** Status without creating additional resources. */
function huSyncInfo(wikiId) {
  const id = huFileId_(wikiId);
  const linked = huSyncLinkedId_(id);
  return {
    enabled: !!linked.sheetId,
    canEdit: !!linked.wiki.capabilities && !!linked.wiki.capabilities.canEdit,
    canShare: !!linked.wiki.capabilities && !!linked.wiki.capabilities.canShare,
    sheetId: linked.sheetId
  };
}

/**
 * Explicitly create a shared log. Does not change the original HTML content,
 * and does not silently enable synchronization for an existing wiki.
 */
function huSyncEnable(wikiId) {
  const id = huFileId_(wikiId);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const linked = huSyncLinkedId_(id);
    if (!linked.wiki.capabilities ||
        !linked.wiki.capabilities.canEdit ||
        !linked.wiki.capabilities.canShare)
      throw new Error("Kun en bruger med redigerings- og delingsadgang kan aktivere synkronisering.");
    if (linked.sheetId) return {enabled: true, sheetId: linked.sheetId};

    const book = SpreadsheetApp.create("ForgeDrive — " + linked.wiki.name + " — ændringslog");
    const log = book.getSheets()[0];
    log.setName("Events");
    log.getRange(1, 1, 1, HU_SYNC_HEADER.length).setValues([HU_SYNC_HEADER]);
    log.setFrozenRows(1);
    const config = book.insertSheet("Config");
    config.getRange("A1:B1").setValues([["forgedrive-sync-v1", id]]);
    config.hideSheet();

    // A public Drive custom property is visible to users with access to the
    // wiki file, even if they have their own Google OAuth session.
    Drive.Files.update(
      {properties: {[HU_SYNC_PROPERTY]: book.getId()}},
      id, null,
      {fields: "id,properties", supportsAllDrives: true}
    );
    return {enabled: true, sheetId: book.getId()};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Return delta events after a monotonically increasing sequence cursor.
 * One small Sheets read, not a whole HTML file download.
 */
function huSyncPull(wikiId, afterSeq, maxItems) {
  const id = huFileId_(wikiId);
  const linked = huSyncLinkedId_(id);
  if (!linked.sheetId) return {enabled: false, events: [], cursor: 0, hasMore: false};
  const book = huSyncGetBook_(id, linked.sheetId);
  const lastSeq = Math.max(0, book.journal.getLastRow() - 1);
  const cursor = Number(afterSeq);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > lastSeq)
    throw new Error("Ugyldigt ændringslog-cursor.");
  const requested = Number(maxItems) || 100;
  const limit = Math.max(1, Math.min(HU_SYNC_MAX_POLL, requested));
  const count = Math.min(limit, lastSeq - cursor);
  if (count === 0) return {enabled: true, events: [], cursor, hasMore: false};

  const rows = book.journal.getRange(cursor + 2, 1, count, HU_SYNC_HEADER.length).getValues();
  const events = rows.map((row, offset) => ({
    seq: cursor + offset + 1,
    opId: String(row[1]),
    actor: String(row[2]),
    // Store JSON-escaped titles in Sheets to prevent formula injection.
    title: JSON.parse(String(row[3])),
    operation: String(row[4]),
    fields: row[4] === "delete" ? null : JSON.parse(String(row[5] || "{}")),
    timestamp: String(row[6])
  }));
  return {enabled: true, events: events, cursor: cursor + count, hasMore: cursor + count < lastSeq};
}

function huSyncValidate_(operations) {
  if (!Array.isArray(operations) || !operations.length ||
      operations.length > HU_SYNC_MAX_OPS ||
      JSON.stringify(operations).length > HU_SYNC_MAX_BATCH_CHARS)
    throw new Error("Synkpakke er tom eller for stor.");
  const titles = new Set();
  return operations.map(op => {
    if (!op || typeof op.title !== "string" || !op.title.trim() ||
        op.title.length > 600 || op.title.startsWith("$:/") ||
        !/^[A-Za-z0-9_-]{8,100}$/.test(String(op.opId || "")) ||
        (op.operation !== "put" && op.operation !== "delete") ||
        !Number.isSafeInteger(op.baseSeq) || op.baseSeq < 0)
      throw new Error("Ugyldig eller ikke-synkroniserbar tiddler-ændring.");
    if (titles.has(op.title)) throw new Error("Duplikeret tiddler i en synkpakke.");
    titles.add(op.title);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(op.actor || "")))
      throw new Error("Ugyldigt deltager-ID.");
    if (op.operation === "put") {
      if (!op.fields || typeof op.fields !== "object" ||
          Array.isArray(op.fields) || op.fields.title !== op.title)
        throw new Error("Ugyldige tiddlerfelter.");
      for (const [key, value] of Object.entries(op.fields)) {
        if (!key || typeof value !== "string")
          throw new Error("Alle tiddlerfelter skal være tekststrenge.");
      }
      if (JSON.stringify(op.fields).length > HU_SYNC_MAX_TIDDLER_CHARS)
        throw new Error("Tiddleren er for stor til baggrundssynkronisering.");
    }
    return {
      opId: op.opId,
      actor: String(op.actor || "").slice(0, 100),
      title: op.title,
      operation: op.operation,
      fieldsJson: op.operation === "delete" ? "" : JSON.stringify(op.fields),
      baseSeq: op.baseSeq
    };
  });
}

/**
 * Append a batch of edits to the shared journal under a script-wide lock.
 * Revisions are per tiddler. A stale edit is rejected, not overwritten.
 * The whole batch commits or none of it does.
 */
function huSyncPush(wikiId, operations) {
  const id = huFileId_(wikiId);
  const parsed = huSyncValidate_(operations);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const linked = huSyncLinkedId_(id);
    if (!linked.wiki.capabilities || !linked.wiki.capabilities.canEdit)
      throw new Error("Du har ikke redigeringsadgang til denne wiki.");
    if (!linked.sheetId) throw new Error("Synkronisering er endnu ikke aktiveret.");
    const book = huSyncGetBook_(id, linked.sheetId);
    const lastRow = book.journal.getLastRow();

    const wanted = new Set(parsed.map(item => item.title));
    const latest = {};
    // Read the journal from the end in chunks, avoiding a full sheet scan
    // when recently edited tiddlers are checked. Later: indexed revisions.
    let scanEnd = lastRow;
    while (scanEnd >= 2 && wanted.size) {
      const scanStart = Math.max(2, scanEnd - 499);
      const rows = book.journal.getRange(scanStart, 1,
        scanEnd - scanStart + 1, HU_SYNC_HEADER.length).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        const title = JSON.parse(String(rows[i][3]));
        if (wanted.has(title)) {
          latest[title] = {
            seq: scanStart + i - 1,
            opId: String(rows[i][1])
          };
          wanted.delete(title);
        }
      }
      scanEnd = scanStart - 1;
    }

    const duplicates = [];
    const conflicts = [];
    const fresh = [];
    parsed.forEach(op => {
      const seen = latest[op.title] || {seq: 0, opId: ""};
      if (seen.opId === op.opId) {
        duplicates.push({title: op.title, opId: op.opId, seq: seen.seq});
      } else if (seen.seq !== op.baseSeq) {
        conflicts.push({title: op.title, expected: op.baseSeq, actual: seen.seq});
      } else {
        fresh.push(op);
      }
    });
    if (conflicts.length)
      return {ok: false, conflict: true, conflicts: conflicts, accepted: [],
        cursor: lastRow - 1};

    const now = new Date().toISOString();
    const rowsToAppend = fresh.map((op, n) => [
      lastRow + n, op.opId, op.actor, JSON.stringify(op.title), op.operation, op.fieldsJson, now
    ]);
    if (rowsToAppend.length) {
      book.journal.getRange(lastRow + 1, 1,
        rowsToAppend.length, HU_SYNC_HEADER.length).setValues(rowsToAppend);
      SpreadsheetApp.flush();
    }
    const accepted = duplicates.concat(fresh.map((op, n) => ({
      title: op.title, opId: op.opId, seq: lastRow + n
    })));
    return {ok: true, accepted: accepted, cursor: lastRow + rowsToAppend.length - 1,
      conflict: false};
  } finally {
    lock.releaseLock();
  }
}
