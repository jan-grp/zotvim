const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function scripts(...names) {
  const scope = vm.createContext({ setTimeout, clearTimeout, console });
  for (const name of names) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../addon", name), "utf8"), scope);
  }
  return scope;
}

function key(key, extras = {}) {
  return { key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: key.length === 1 && key.toLowerCase() !== key,
    repeat: false, isComposing: false, ...extras };
}

class Element {
  constructor(doc, id, parent = null, tag = "div") {
    this.doc = doc;
    this.id = id;
    this.parent = parent;
    this.tag = tag;
    this.attributes = {};
    this.listeners = new Map();
    this.width = 400;
    this.clientHeight = 480;
    this.removed = false;
  }
  get ownerDocument() { return this.doc; }
  get localName() { return this.tag; }
  contains(child) {
    for (let node = child; node; node = node.parent) if (node === this) return true;
    return false;
  }
  closest(selector) {
    const selectors = selector.split(",").map(s => s.trim());
    for (let node = this; node; node = node.parent) {
      if (selectors.includes("#" + node.id) || selectors.includes(node.tag)
        || (node.isContentEditable && selectors.includes('[contenteditable]:not([contenteditable="false"])'))
        || (node.role && selectors.includes(`[role="${node.role}"]`))) return node;
    }
    return null;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  getBoundingClientRect() { return { width: this.width, height: 24 }; }
  append(child) { child.parent = this; this.doc.elements.set(child.id, child); }
  remove() { this.removed = true; this.doc.elements.delete(this.id); }
  focus() {
    this.doc.activeElement = this;
    this.doc.emit("focusin", { target: this });
  }
  select() { this.selectedText = true; }
  querySelector(selector) {
    if (selector.includes('tabindex="0"')) return this.doc.elements.get(this.id + "-focus");
    return null;
  }
  dispatchEvent(event) {
    event.target = this;
    event.composedPath ||= () => [this];
    event.preventDefault = () => { event.defaultPrevented = true; };
    event.stopImmediatePropagation = () => { event.stopped = true; };
    this.doc.emit("keydown", event);
    if (!event.stopped && this.nativeKey) this.nativeKey(event);
    return !event.defaultPrevented;
  }
}

function fixture(rowCount = 30) {
  const { ZotvimKeys, ZotvimWindow } = scripts("keys.js", "popups.js", "window.js");
  const listeners = new Map();
  const doc = {
    elements: new Map(),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    emit(type, e) { listeners.get(type)?.(e); },
    createElementNS(_ns, tag) { return new Element(doc, null, null, tag); },
    getElementById(id) { return this.elements.get(id); },
  };
  function element(id, parent, tag) {
    const el = new Element(doc, id, parent, tag);
    doc.elements.set(id, el);
    return el;
  }
  doc.documentElement = element("root");
  const toolbar = element("zotero-toolbar-item-tree", doc.documentElement);
  const collections = element("zotero-collections-tree", doc.documentElement);
  const items = element("zotero-items-tree", doc.documentElement);
  const collectionFocus = element("zotero-collections-tree-focus", collections);
  const itemFocus = element("zotero-items-tree-focus", items);
  const search = element("zotero-tb-search", toolbar, "search-textbox");
  search.searchTextbox = element("zotero-tb-search-textbox", search, "input");
  const opened = [];
  const errors = [];
  const nativeEvents = [];
  const tabMoves = [];
  const winListeners = new Map();
  let enabled = true;
  const win = {
    document: doc,
    setTimeout, clearTimeout,
    requestAnimationFrame: fn => setImmediate(fn),
    cancelAnimationFrame: clearImmediate,
    addEventListener: (type, fn) => winListeners.set(type, fn),
    removeEventListener: type => winListeners.delete(type),
    KeyboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    Zotero_Tabs: {
      selectedID: "zotero-pane",
      selectNext() { tabMoves.push(1); },
      selectPrev() { tabMoves.push(-1); },
    },
  };
  function view(focus) {
    let pending = false;
    let nextRow;
    const selection = { focused: 0 };
    const result = {
      rowCount,
      tree: {},
      selection,
      focus: () => focus.focus(),
      isContainer: () => true,
      isContainerEmpty: () => false,
      isContainerOpen: () => result.open,
      toggleOpenState: () => { result.open = !result.open; },
      open: false,
    };
    focus.nativeKey = e => {
      nativeEvents.push(e);
      const current = selection.focused;
      const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1
        : e.key === "PageDown" ? 10 : e.key === "PageUp" ? -10 : 0;
      if (e.key === "ArrowRight") result.open = true;
      if (e.key === "ArrowLeft") result.open = false;
      nextRow = e.key === "Home" ? 0 : e.key === "End" ? rowCount - 1
        : Math.max(0, Math.min(rowCount - 1, current + delta));
      // Emulate Zotero: multiple key events in a frame share one update.
      if (!pending) {
        pending = true;
        setImmediate(() => { selection.focused = nextRow; pending = false; });
      }
    };
    return result;
  }
  const itemsView = view(itemFocus);
  const collectionsView = view(collectionFocus);
  win.ZoteroPane = {
    itemsView, collectionsView,
    getSelectedItems: () => ["selected-item"],
    viewItems: async selected => opened.push(selected),
  };
  const controller = new ZotvimWindow(win, {
    Keys: ZotvimKeys, rootURI: "file:///addon/",
    enabled: () => enabled, timeout: () => 15,
    previousKey: "ArrowLeft", nextKey: "ArrowRight",
    error: e => errors.push(e), help: () => { win.helpShown = true; },
  });
  itemFocus.focus();
  function press(k, extras = {}, target = doc.activeElement) {
    const e = key(k, extras);
    target.dispatchEvent(e);
    return e;
  }
  return { doc, win, controller, element, collections, items, itemFocus, collectionFocus, search,
    itemsView, collectionsView, nativeEvents, errors, opened, tabMoves, press, listeners, winListeners,
    disable() { enabled = false; controller.reset(true); },
    async flush() { await controller.queue; },
  };
}

module.exports = { scripts, key, fixture };
