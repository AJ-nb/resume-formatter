import { clone, migrateDocument } from "./contracts.js";
import { ApplicationWorkspaceStore } from "./workspace.js";

const DOCUMENT_KEY = "resume-formatter:document-v2";
const VERSION_KEY = "resume-formatter:versions-v2";
const UNDO_LIMIT = 100;

function safeStorage(storage) {
  try {
    const key = "__rf_probe__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return storage;
  } catch {
    return null;
  }
}

export class ResumeStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage ? safeStorage(storage) : null;
    this.workspace = new ApplicationWorkspaceStore(this.storage);
    this.document = this.workspace.getActiveDocument();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.dirty = false;
  }

  load() {
    return this.workspace.getActiveDocument();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(reason = "update") {
    for (const listener of this.listeners) listener(this.document, reason);
  }

  replace(document, reason = "replace", recordUndo = true) {
    if (recordUndo) this.pushUndo(reason);
    this.document = migrateDocument(document);
    this.touch();
    this.notify(reason);
  }

  transact(reason, mutator, { recordUndo = true } = {}) {
    if (recordUndo) this.pushUndo(reason);
    mutator(this.document);
    this.touch();
    this.notify(reason);
  }

  pushUndo(label) {
    this.undoStack.push({ label, document: clone(this.document) });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push({ label: previous.label, document: clone(this.document) });
    this.document = previous.document;
    this.touch();
    this.notify("undo");
    return true;
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push({ label: next.label, document: clone(this.document) });
    this.document = next.document;
    this.touch();
    this.notify("redo");
    return true;
  }

  touch() {
    this.document.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  save() {
    if (!this.storage) return false;
    this.document.metadata.lastSavedAt = new Date().toISOString();
    this.workspace.setActiveDocument(this.document);
    this.storage.setItem(DOCUMENT_KEY, JSON.stringify(this.document));
    this.dirty = false;
    this.notify("save");
    return true;
  }

  saveVersion(name) {
    if (!this.storage) return null;
    const versions = this.listVersions();
    const version = {
      id: `version-${Date.now()}`,
      name: name || new Date().toLocaleString("zh-CN"),
      createdAt: new Date().toISOString(),
      document: clone(this.document),
    };
    versions.unshift(version);
    this.storage.setItem(VERSION_KEY, JSON.stringify(versions.slice(0, 20)));
    return version;
  }

  listVersions() {
    if (!this.storage) return [];
    try { return JSON.parse(this.storage.getItem(VERSION_KEY) || "[]"); } catch { return []; }
  }

  activateDocument(documentId) {
    this.workspace.setActiveDocument(this.document);
    this.document = this.workspace.activate(documentId);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.dirty = false;
    this.notify("activate-document");
    return this.document;
  }

  createApplication(input) {
    this.workspace.setActiveDocument(this.document);
    const application = this.workspace.createApplication(input);
    this.document = this.workspace.getActiveDocument();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.dirty = false;
    this.notify("create-application");
    return application;
  }

  replaceWorkspace(input) {
    this.document = this.workspace.replaceWorkspace(input);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.dirty = false;
    this.notify("replace-workspace");
  }
}

export const storageKeys = Object.freeze({ document: DOCUMENT_KEY, versions: VERSION_KEY });
