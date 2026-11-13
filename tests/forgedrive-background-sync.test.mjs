import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (path) => readFileSync(fileURLToPath(new URL("../" + path, import.meta.url)), "utf8");
const server = at("integrations/google-drive-apps-script/DeltaSync.gs");
const client = at("integrations/google-drive-apps-script/DeltaClient.html");
const manifest = JSON.parse(at("integrations/google-drive-apps-script/appsscript.json"));

class MemorySheet {
  constructor(name) { this.name = name; this.data = []; }
  setName(name) { this.name = name; }
  setFrozenRows() {}
  hideSheet() {}
  getLastRow() { return this.data.length; }
  getRange(a, b, count = 1, width = 1) {
    if (typeof a === "string") {
      const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a);
      if (!m) throw Error("Unexpected A1 range: " + a);
      const col = s => s.charCodeAt(0) - 64;
      const row = Number(m[2]);
      count = m[4] ? Number(m[4]) - row + 1 : 1;
      width = m[3] ? col(m[3]) - col(m[1]) + 1 : 1;
      a = row;
      b = col(m[1]);
    }
    return {
      setValues: values => {
        for (let i = 0; i < values.length; i++) {
          const row = this.data[a - 1 + i] || [];
          for (let j = 0; j < values[i].length; j++) row[b - 1 + j] = values[i][j];
          this.data[a - 1 + i] = row;
        }
      },
      getValues: () => Array.from({ length: count }, (_, i) =>
        Array.from({ length: width }, (_, j) => this.data[a - 1 + i]?.[b - 1 + j] ?? "")),
      getValue: () => this.data[a - 1]?.[b - 1] ?? ""
    };
  }
}

class MemoryBook {
  constructor(id) { this.id = id; this.sheets = [new MemorySheet("Sheet1")]; }
  getId() { return this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find(s => s.name === name); }
  insertSheet(name) {
    const sheet = new MemorySheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
}

function backendFixture() {
  const file = {
    id: "1slj3k2JQrUh6rizHQ1gRUtghu1Wtr2az",
    name: "HUWiki-demo.html",
    mimeType: "text/html",
    capabilities: { canEdit: true, canShare: true },
    properties: {}
  };
  const books = new Map();
  const permissions = new Map([[file.id, [
    {id: "owner_1", type: "user", role: "owner", emailAddress: "owner@example.com"}
  ]]]);
  const SpreadsheetApp = {
    create() {
      const id = "sheet_" + String(books.size + 1).padStart(15, "0");
      const book = new MemoryBook(id);
      books.set(id, book);
      return book;
    },
    openById(id) {
      if (!books.has(id)) throw Error("Workbook permission denied: " + id);
      return books.get(id);
    },
    flush() {}
  };
  let nextPermission = 1;
  const Drive = {
    Files: {
      get: () => ({ ...file, properties: { ...file.properties } }),
      update: ({ properties }) => { Object.assign(file.properties, properties); }
    },
    Permissions: {
      list: (id) => ({permissions: (permissions.get(id) || []).map(p => ({...p}))}),
      create: (grant, id) => {
        const p = {...grant, id: "grant_" + nextPermission++};
        permissions.set(id, [...(permissions.get(id) || []), p]);
        return {id: p.id};
      },
      update: (patch, id, permissionId) => {
        const p = (permissions.get(id) || []).find(entry => entry.id === permissionId);
        if (!p) throw Error("Permission not found");
        Object.assign(p, patch);
        return {id: p.id};
      },
      delete: (id, permissionId) => {
        permissions.set(id, (permissions.get(id) || []).filter(p => p.id !== permissionId));
      }
    },
    About: {get: () => ({user: {permissionId: "per_account_one"}})}
  };
  const LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
  };
  const ctx = { SpreadsheetApp, Drive, LockService, huFile_: () => ({ ...file }), huFileId_: x => x };
  vm.runInNewContext(server, ctx);
  return { ctx, file, books, permissions };
}

function op(title, baseSeq, opId, text = "hello") {
  return {
    title, baseSeq, opId, actor: "fd_12345678", operation: "put",
    fields: { title, text }
  };
}

function clientClass() {
  const match = client.match(/^<script>([\s\S]*)<\/script>\s*$/);
  assert.ok(match, "Expected DeltaClient.html to contain a single script");
  const window = {};
  const context = {
    window, navigator: { onLine: true },
    document: { hidden: false },
    setTimeout: (callback, delay) => {
      if (delay === 0) queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {}, setInterval: () => 1, clearInterval() {}
  };
  vm.runInNewContext(match[1], context);
  return window.ForgeDriveDelta;
}

function fakeWiki() {
  const data = new Map();
  const subscribers = [];
  const saverHandler = {
    numChanges: 0,
    updateDirtyStatus() {},
    isDirty() { return this.numChanges > 0; },
    filterFn() { return []; }
  };
  class Tiddler {
    constructor(fields) { this.fields = { ...fields }; }
    getFieldString(key) { return String(this.fields[key]); }
  }
  const wiki = {
    addEventListener(type, listener) {
      if (type === "change") subscribers.push(listener);
    },
    getTiddler: title => data.get(title),
    addTiddler(tiddler) {
      const title = tiddler.fields.title;
      data.set(title, tiddler);
      saverHandler.numChanges++;
      subscribers.forEach(fn => fn({ [title]: { normal: true, modified: true } }));
    },
    deleteTiddler(title) {
      data.delete(title);
      saverHandler.numChanges++;
      subscribers.forEach(fn => fn({ [title]: { normal: true, deleted: true } }));
    }
  };
  return { wiki, Tiddler, saverHandler };
}

test("sync has user-scoped authorization and does not use Picker/UrlFetch", () => {
  assert.equal(manifest.webapp.executeAs, "USER_ACCESSING");
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/spreadsheets"));
  assert.doesNotMatch(server, /UrlFetchApp\s*\.|google\.picker|PickerBuilder/);
  assert.doesNotMatch(client, /UrlFetchApp\s*\.|google\.picker|PickerBuilder/);
  assert.doesNotThrow(() => new vm.Script(server));
});

test("creates exactly one shared change log linked to its Drive HTML wiki", () => {
  const f = backendFixture();
  const a = f.ctx.huSyncEnable(f.file.id);
  const b = f.ctx.huSyncEnable(f.file.id);
  assert.equal(a.sheetId, b.sheetId);
  assert.equal(f.books.size, 1);
  assert.equal(f.file.properties.forgeDriveSyncSheetId, a.sheetId);
});

test("different tiddler edits batch without a full HTML upload", () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const a = f.ctx.huSyncPush(f.file.id, [op("Tiddler A", 0, "fd_first_0001")]);
  const b = f.ctx.huSyncPush(f.file.id, [op("Tiddler B", 0, "fd_second_002")]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const pull = f.ctx.huSyncPull(f.file.id, 0, 100);
  assert.equal(pull.events.length, 2);
  assert.equal(pull.cursor, 2);
  assert.deepEqual(Array.from(pull.events.map(e => e.title)), ["Tiddler A", "Tiddler B"]);
});

test("rejects only real concurrent edits on the same tiddler", () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  f.ctx.huSyncPush(f.file.id, [op("Conflict", 0, "fd_first_0001")]);
  const conflict = f.ctx.huSyncPush(f.file.id, [op("Conflict", 0, "fd_second_002", "different")]);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.conflicts[0].actual, 1);
  assert.equal(f.ctx.huSyncPull(f.file.id, 0, 100).events.length, 1);
});

test("retry with same operation id is idempotent", () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const action = op("Notes", 0, "fd_action_0001");
  f.ctx.huSyncPush(f.file.id, [action]);
  const repeat = f.ctx.huSyncPush(f.file.id, [action]);
  assert.equal(repeat.ok, true);
  assert.equal(repeat.accepted[0].seq, 1);
  assert.equal(f.ctx.huSyncPull(f.file.id, 0, 100).events.length, 1);
});

test("Sheets input rejects oversized changes and invalid identifiers", () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  assert.throws(() => f.ctx.huSyncPush(f.file.id,
    [op("Large", 0, "fd_large_0001", "x".repeat(50000))]), /for stor/);
  assert.throws(() => f.ctx.huSyncPush(f.file.id,
    [op("$:/system", 0, "fd_system_001")]), /Ugyldig/);
  assert.equal(f.ctx.huSyncPull(f.file.id, 0, 100).events.length, 0);
});

test("browser clients exchange updates and clear remote dirty state", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const Delta = clientClass();
  const A = fakeWiki(), B = fakeWiki();
  const rpc = async (name, ...args) => f.ctx[name](...args);
  const a = new Delta({ tw: A, fileId: f.file.id, rpc });
  const b = new Delta({ tw: B, fileId: f.file.id, rpc });
  await a.start();
  await b.start();
  A.wiki.addTiddler(new A.Tiddler({ title: "Shared", text: "first" }));
  assert.equal(a.pending.size, 1);
  await a.flush();
  await b.pullAll();
  assert.equal(B.wiki.getTiddler("Shared").fields.text, "first");
  assert.equal(a.pending.size, 0);
  assert.equal(A.saverHandler.isDirty(), false);
  assert.equal(B.saverHandler.isDirty(), false);
  a.stop(); b.stop();
});

test("browser conflict retains the second editor's unsent version", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const Delta = clientClass();
  const A = fakeWiki(), B = fakeWiki();
  const rpc = async (name, ...args) => f.ctx[name](...args);
  const a = new Delta({ tw: A, fileId: f.file.id, rpc });
  const b = new Delta({ tw: B, fileId: f.file.id, rpc });
  await a.start(); await b.start();
  A.wiki.addTiddler(new A.Tiddler({ title: "Same", text: "first" }));
  await a.flush(); await b.pullAll();
  A.wiki.addTiddler(new A.Tiddler({ title: "Same", text: "A edit" }));
  B.wiki.addTiddler(new B.Tiddler({ title: "Same", text: "B edit" }));
  await a.flush(); await b.flush();
  assert.equal(b.conflicts.size, 1);
  assert.equal(B.wiki.getTiddler("Same").fields.text, "B edit");
  assert.equal(b.hasUnsynced(), true);
  a.stop(); b.stop();
});

test("oversized tiddlers stay dirty and do not trigger repeated network writes", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const Delta = clientClass();
  const A = fakeWiki();
  let writes = 0;
  const rpc = async (name, ...args) => {
    if (name === "huSyncPush") writes++;
    return f.ctx[name](...args);
  };
  const a = new Delta({ tw: A, fileId: f.file.id, rpc });
  await a.start();
  A.wiki.addTiddler(new A.Tiddler({ title: "Oversize", text: "X".repeat(50000) }));
  assert.equal(a.pending.size, 0);
  assert.equal(a.unsupported.size, 1);
  assert.equal(a.hasUnsynced(), true);
  await a.flush();
  assert.equal(writes, 0);
  assert.equal(A.saverHandler.isDirty(), true);
  a.stop();
});
