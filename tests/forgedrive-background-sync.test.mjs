import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (path) => readFileSync(fileURLToPath(new URL("../" + path, import.meta.url)), "utf8");
const server = at("integrations/google-drive-apps-script/DeltaSync.gs");
const fileServer = at("integrations/google-drive-apps-script/Code.gs");
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
    properties: {},
    md5Checksum: "a".repeat(32),
    version: "1"
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
  let htmlWrites = 0;
  const Drive = {
    Files: {
      get: () => ({ ...file, properties: { ...file.properties } }),
      update: ({ properties }, _id, blob) => {
        if (properties) Object.assign(file.properties, properties);
        if (blob) {
          htmlWrites++;
          file.md5Checksum = "b".repeat(32);
          file.version = String(Number(file.version) + 1);
        }
        return {...file, properties: {...file.properties}};
      }
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
      remove: (id, permissionId) => {
        permissions.set(id, (permissions.get(id) || []).filter(p => p.id !== permissionId));
      }
    },
    About: {get: () => ({user: {permissionId: "per_account_one"}})}
  };
  const LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
  };
  const Utilities = {
    newBlob: text => ({
      getBytes: () => Buffer.from(text, "utf8")
    })
  };
  const ctx = {SpreadsheetApp, Drive, LockService, Utilities};
  vm.runInNewContext(server + "\n" + fileServer, ctx);
  return {ctx, file, books, permissions, get htmlWrites() {return htmlWrites;} };
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

test("enabling a log preserves HTML baseline and mirrors existing named shares", () => {
  const f = backendFixture();
  f.permissions.get(f.file.id).push({
    id: "preexisting", type: "user", role: "writer",
    emailAddress: "school@example.com"
  });
  const enabled = f.ctx.huSyncEnable(f.file.id);
  const grants = f.permissions.get(enabled.sheetId);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].emailAddress, "school@example.com");
  assert.equal(grants[0].role, "writer");
  assert.equal(f.file.properties.forgeDriveSnapshotSeq, "0");
  assert.equal(f.htmlWrites, 0, "enabling must never rewrite the HTML wiki");
  assert.equal(f.ctx.huSyncPull(f.file.id, 0, 20).events.length, 0);
});

test("snapshot never overwrites a newer delta journal even with matching HTML checksum", () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  f.ctx.huSyncPush(f.file.id, [op("New shared tiddler", 0, "fd_snapshot_01")]);
  const checksum = f.file.md5Checksum;
  const stale = f.ctx.huSave(f.file.id, "<html>stale</html>", checksum, 0);
  assert.equal(stale.conflict, true);
  assert.equal(f.htmlWrites, 0);
  const saved = f.ctx.huSave(f.file.id, "<html>with changes</html>", checksum, 1);
  assert.equal(saved.ok, true);
  assert.equal(saved.meta.snapshotSeq, 1);
  assert.equal(f.file.properties.forgeDriveSnapshotSeq, "1");
  assert.equal(f.htmlWrites, 1);
});

test("deleted tiddlers propagate and do not leave remote dirty status", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const Delta = clientClass(), A = fakeWiki(), B = fakeWiki();
  const rpc = async (name, ...args) => f.ctx[name](...args);
  const a = new Delta({tw: A, fileId: f.file.id, rpc});
  const b = new Delta({tw: B, fileId: f.file.id, rpc});
  await a.start(); await b.start();
  A.wiki.addTiddler(new A.Tiddler({title:"Delete me", text:"hello"}));
  await a.flush(); await b.pullAll();
  A.wiki.deleteTiddler("Delete me");
  await a.flush(); await b.pullAll();
  assert.equal(B.wiki.getTiddler("Delete me"), undefined);
  assert.equal(a.hasUnsynced(), false);
  assert.equal(B.saverHandler.isDirty(), false);
  a.stop(); b.stop();
});

test("changes made during an in-flight push remain pending and dirty", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const Delta = clientClass(), A = fakeWiki();
  let release, first = true;
  const rpc = (name, ...args) => {
    if (name === "huSyncPush" && first) {
      first = false;
      return new Promise(resolve => {
        release = () => resolve(f.ctx[name](...args));
      });
    }
    return Promise.resolve(f.ctx[name](...args));
  };
  const a = new Delta({tw: A, fileId:f.file.id, rpc});
  await a.start();
  A.wiki.addTiddler(new A.Tiddler({title:"Typing", text:"first"}));
  const flight = a.flush();
  A.wiki.addTiddler(new A.Tiddler({title:"Typing", text:"newer"}));
  release();
  await flight;
  assert.equal(a.pending.size, 1, "the later edit must not be acknowledged");
  assert.equal(A.saverHandler.isDirty(), true);
  await a.flush();
  assert.equal(a.pending.size, 0);
  assert.equal(A.saverHandler.isDirty(), false);
  const log = f.ctx.huSyncPull(f.file.id, 0, 20).events;
  assert.deepEqual(log.map(e => e.fields.text), ["first", "newer"]);
  a.stop();
});

test("one conflict does not freeze unrelated tiddler changes", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const Delta = clientClass(), A = fakeWiki(), B = fakeWiki();
  const rpc = async (name,...args) => f.ctx[name](...args);
  const a = new Delta({tw:A,fileId:f.file.id,rpc});
  const b = new Delta({tw:B,fileId:f.file.id,rpc});
  await a.start(); await b.start();
  A.wiki.addTiddler(new A.Tiddler({title:"Same",text:"initial"}));
  await a.flush(); await b.pullAll();
  A.wiki.addTiddler(new A.Tiddler({title:"Same",text:"edited A"}));
  B.wiki.addTiddler(new B.Tiddler({title:"Same",text:"edited B"}));
  await a.flush(); await b.flush();
  assert.equal(b.conflicts.size,1);
  B.wiki.addTiddler(new B.Tiddler({title:"Independent",text:"new"}));
  await b.flush();
  assert.equal(b.conflicts.size,1);
  assert.equal(b.pending.has("Independent"),false);
  assert.equal(b.pending.has("Same"),true);
  assert.equal(f.ctx.huSyncPull(f.file.id,0,20).events.at(-1).title,"Independent");
  a.stop(); b.stop();
});

test("pending offline edits survive reload in the same Google account", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) || null,
    setItem: (key,value) => data.set(key,value),
    removeItem: key => data.delete(key)
  };
  const Delta = clientClass();
  const rpc = async (name,...args) => f.ctx[name](...args);
  const A = fakeWiki();
  const a = new Delta({tw:A,fileId:f.file.id,rpc,storage});
  await a.start();
  A.wiki.addTiddler(new A.Tiddler({title:"Recovered",text:"offline draft"}));
  assert.equal(data.size,1);
  a.stop();
  const B = fakeWiki();
  const b = new Delta({tw:B,fileId:f.file.id,rpc,storage});
  await b.start();
  assert.equal(B.wiki.getTiddler("Recovered").fields.text,"offline draft");
  assert.equal(b.pending.size,1);
  await b.flush();
  assert.equal(b.pending.size,0);
  assert.equal(data.size,0);
  assert.equal(f.ctx.huSyncPull(f.file.id,0,20).events[0].title,"Recovered");
  b.stop();
});

test("read-only collaborator receives remote edits without false dirty warning", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  f.ctx.huSyncPush(f.file.id,[op("Remote",0,"fd_reader_0001")]);
  f.file.capabilities.canEdit = false;
  const Delta = clientClass(), B = fakeWiki();
  const b = new Delta({tw:B,fileId:f.file.id,
    rpc: async (name,...args) => f.ctx[name](...args)});
  await b.start();
  assert.equal(b.canEdit,false);
  assert.equal(B.wiki.getTiddler("Remote").fields.text,"hello");
  assert.equal(B.saverHandler.isDirty(),false);
  b.stop();
});

test("first edit after reopening an HTML snapshot uses the real tiddler base revision", async () => {
  const f = backendFixture();
  f.ctx.huSyncEnable(f.file.id);
  f.ctx.huSyncPush(f.file.id, [op("Already in HTML", 0, "fd_before_snapshot")]);
  const checksum = f.file.md5Checksum;
  const saved = f.ctx.huSave(f.file.id, "<html>snapshot 1</html>", checksum, 1);
  assert.equal(saved.ok, true);
  const Delta = clientClass();
  const W = fakeWiki();
  W.wiki.addTiddler(new W.Tiddler({title:"Already in HTML", text:"hello"}));
  W.saverHandler.numChanges = 0;
  const client = new Delta({tw:W,fileId:f.file.id,
    snapshotSeq:saved.meta.snapshotSeq,
    rpc: async (name,...args) => f.ctx[name](...args)});
  await client.start();
  assert.equal(client.cursor,1);
  assert.equal(client.revisions.get("Already in HTML"),1);
  W.wiki.addTiddler(new W.Tiddler({title:"Already in HTML", text:"after restart"}));
  await client.flush();
  assert.equal(client.pending.size,0);
  assert.equal(client.conflicts.size,0);
  assert.equal(f.ctx.huSyncPull(f.file.id,0,10).events[1].fields.text,"after restart");
  client.stop();
});
