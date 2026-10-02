const test = require("node:test");
const assert = require("node:assert/strict");
const { scripts, key, fixture } = require("./helpers.cjs");

function setup(t, bridge = false) {
  const { ZotvimKeys, ZotvimReader } = scripts("keys.js", "popups.js", "reader.js");
  const f = fixture();
  const child = fixture();
  f.controller.destroy(); child.controller.destroy();
  const observers = [];
  for (const fixture of [f, child]) {
    fixture.doc.defaultView = fixture.win;
    fixture.doc.body = fixture.element("body", fixture.doc.documentElement, "body");
    fixture.doc.querySelectorAll = () => fixture.doc.frames || [];
    fixture.win.MutationObserver = class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    };
  }
  const frame = f.element("pdf", f.doc.body, "iframe");
  frame.src = "resource://zotero/reader/pdf/web/viewer.html";
  frame.contentDocument = child.doc;
  f.doc.frames = [frame];
  const viewport = child.element("viewerContainer", child.doc.body);
  viewport.clientHeight = 600;
  viewport.clientWidth = 400;
  viewport.scrollTop = 0;
  viewport.scrollLeft = 0;
  viewport.scrollBy = ({ top, left }) => { viewport.scrollTop += top; viewport.scrollLeft += left; };
  viewport.scrollTo = ({ left }) => { viewport.scrollLeft = left; };
  const pdf = { pagesCount: 5, pdfViewer: { currentPageNumber: 1 } };
  child.win.wrappedJSObject = { PDFViewerApplication: pdf };
  const calls = [];
  const reader = {
    _window: f.win,
    navigate: ({ pageIndex }) => { calls.push(["page", pageIndex]); pdf.pdfViewer.currentPageNumber = pageIndex + 1; },
    navigateToFirstPage: () => { calls.push(["first"]); pdf.pdfViewer.currentPageNumber = 1; },
    navigateToLastPage: () => { calls.push(["last"]); pdf.pdfViewer.currentPageNumber = 5; },
    toggleFindPopup: args => calls.push(["search", args.open]),
    findNext: () => calls.push(["find", 1]),
    findPrevious: () => calls.push(["find", -1]),
    zoomIn: () => calls.push(["zoom", 1]),
    zoomOut: () => calls.push(["zoom", -1]),
    zoomReset: () => calls.push(["zoom", 0]),
  };
  const nativeKeys = [];
  const original = event => nativeKeys.push(event.key);
  const manager = { handleViewKeyDown: original };
  if (bridge) reader._internalReader = { _keyboardManager: manager };
  let enabled = true;
  const errors = [];
  const controller = new ZotvimReader(reader, f.doc, {
    Keys: ZotvimKeys, rootURI: "file:///addon/", enabled: () => enabled, timeout: () => 15,
    clone: value => value, library: () => calls.push(["library"]),
    exportFunction: callback => callback,
    help: () => calls.push(["help"]), error: e => errors.push(e),
    onDestroy: () => calls.push(["destroy"]),
  });
  t.after(() => controller.destroy());
  function press(k, extra = {}, target = viewport) {
    const e = key(k, { target, ...extra });
    e.preventDefault = () => { e.defaultPrevented = true; };
    e.stopImmediatePropagation = () => { e.stopped = true; };
    child.winListeners.get("keydown")?.(e);
    return e;
  }
  return { f, child, frame, viewport, controller, pdf, calls, errors, observers, press,
    reader, manager, original, nativeKeys,
    disable() { enabled = false; controller.reset(); } };
}

test("PDF scroll commands aggregate counts and use actual viewport size", t => {
  const f = setup(t);
  f.press("5"); f.press("j");
  assert.equal(f.viewport.scrollTop, 200);
  f.press("k"); assert.equal(f.viewport.scrollTop, 160);
  f.press("d", { ctrlKey: true }); assert.equal(f.viewport.scrollTop, 460);
  f.press("b", { ctrlKey: true }); assert.equal(f.viewport.scrollTop, -140);
  f.press("l"); assert.equal(f.viewport.scrollLeft, 40);
  f.press("0"); assert.equal(f.viewport.scrollLeft, 0);
});

test("existing reader shortcuts are intercepted and native handlers restored on disable", t => {
  const f = setup(t, true);
  function nativePress(k, extra = {}, target = f.viewport) {
    const event = key(k, { target, ...extra });
    event.preventDefault = () => { event.defaultPrevented = true; };
    event.stopImmediatePropagation = () => { event.stopped = true; };
    f.manager.handleViewKeyDown(event);
    if (!event.stopped) f.child.winListeners.get("keydown")?.(event);
    return event;
  }
  assert.equal(nativePress("f", { ctrlKey: true }).defaultPrevented, true);
  assert.equal(f.viewport.scrollTop, 600);
  assert.deepEqual(f.nativeKeys, []);
  nativePress("3"); nativePress("j");
  assert.equal(f.viewport.scrollTop, 720);
  nativePress("c", { ctrlKey: true });
  const input = f.child.element("input", f.viewport, "input");
  nativePress("j", {}, input);
  assert.deepEqual(f.nativeKeys, ["c", "j"]);
  f.disable(); nativePress("j");
  assert.deepEqual(f.nativeKeys, ["c", "j", "j"]);
  f.controller.destroy();
  assert.equal(f.manager.handleViewKeyDown, f.original);
});

test("keyboard bridge attaches when the reader initializes and cooperates with later wrappers", t => {
  const f = setup(t);
  assert.equal(f.controller.keyboardBridge, undefined);
  f.reader._internalReader = { _keyboardManager: f.manager };
  f.controller.refresh();
  const wrapper = f.manager.handleViewKeyDown;
  assert.notEqual(wrapper, f.original);
  const laterWrapper = event => wrapper(event);
  f.manager.handleViewKeyDown = laterWrapper;
  f.controller.destroy();
  assert.equal(f.manager.handleViewKeyDown, laterWrapper);
  laterWrapper(key("j", { target: f.viewport }));
  assert.deepEqual(f.nativeKeys, ["j"]);
});

test("page jumps, counts, and bounds navigate physical PDF pages", t => {
  const f = setup(t);
  f.press("3"); f.press("G"); assert.equal(f.pdf.pdfViewer.currentPageNumber, 3);
  f.press("J"); assert.equal(f.pdf.pdfViewer.currentPageNumber, 4);
  f.press("9"); f.press("J"); assert.equal(f.pdf.pdfViewer.currentPageNumber, 5);
  f.press("9"); f.press("K"); assert.equal(f.pdf.pdfViewer.currentPageNumber, 1);
  f.press("G"); assert.equal(f.pdf.pdfViewer.currentPageNumber, 5);
  f.press("g"); f.press("g"); assert.equal(f.pdf.pdfViewer.currentPageNumber, 1);
});

test("colon page entry stays visible until submitted and supports correction and bounds", async t => {
  const f = setup(t);
  f.press(":"); f.press("4");
  assert(f.controller.commandLine.textContent.startsWith(":4"));
  assert.equal(f.controller.commandLine.hidden, false);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.controller.keys.pending, ":4");
  assert.equal(f.pdf.pdfViewer.currentPageNumber, 1);
  f.press("Backspace"); f.press("3"); f.press("Enter");
  assert.equal(f.pdf.pdfViewer.currentPageNumber, 3);
  assert.equal(f.controller.commandLine.hidden, true);
  f.press(":"); f.press("9"); f.press("Enter");
  assert.equal(f.pdf.pdfViewer.currentPageNumber, 5);
});

test("colon page entry cancels on Escape, focus changes, disable, and reader teardown", t => {
  const f = setup(t);
  f.press(":"); f.press("3"); f.press("Escape");
  assert.equal(f.pdf.pdfViewer.currentPageNumber, 1);
  assert.equal(f.controller.commandLine.hidden, true);
  f.press(":"); f.press("3"); f.child.winListeners.get("focusin")();
  assert.equal(f.controller.keys.pending, "");
  assert.equal(f.controller.commandLine.hidden, true);
  f.press(":"); f.disable();
  assert.equal(f.controller.commandLine.hidden, true);
  const output = f.controller.commandLine;
  const style = f.controller.commandStyle;
  f.controller.destroy();
  assert.equal(output.removed, true);
  assert.equal(style.removed, true);
});

test("reader search, next matches, zoom, and tab navigation call Zotero", t => {
  const f = setup(t);
  for (const k of ["/", "n", "N", "+", "-", "=", "?"]) f.press(k);
  assert.deepEqual(f.calls, [["search", true], ["find", 1], ["find", -1],
    ["zoom", 1], ["zoom", -1], ["zoom", 0], ["help"]]);
  f.press("g"); f.press("Shift"); f.press("T");
  assert.deepEqual(f.f.tabMoves, [-1]);
  f.press("g"); f.press("0"); assert.deepEqual(f.calls.at(-1), ["library"]);
});

test("PDF fields, annotations, native shortcuts, IME, and disabled bindings pass through", t => {
  const f = setup(t);
  for (const tag of ["input", "textarea", "select", "button"]) {
    const node = f.child.element(tag, f.viewport, tag);
    assert.equal(f.press("j", {}, node).defaultPrevented, undefined);
    assert.equal(f.press(":", {}, node).defaultPrevented, undefined);
  }
  const annotation = f.child.element("annotation", f.viewport);
  annotation.isContentEditable = true;
  assert.equal(f.press("j", {}, annotation).defaultPrevented, undefined);
  assert.equal(f.press("j", { isComposing: true }).defaultPrevented, undefined);
  assert.equal(f.press("j", { ctrlKey: true, altKey: true }).defaultPrevented, undefined);
  assert.equal(f.press("c", { ctrlKey: true }).defaultPrevented, undefined);
  assert.equal(f.press("Escape").defaultPrevented, undefined);
  assert.equal(f.press("o").defaultPrevented, undefined);
  const sidebar = f.child.element("sidebar", f.child.doc.body);
  assert.equal(f.press("j", {}, sidebar).defaultPrevented, undefined);
  f.disable(); assert.equal(f.press("j").defaultPrevented, undefined);
  assert.equal(f.viewport.scrollTop, 0);
});

test("prefixes expire, reset on focus changes, and Escape cancels", async t => {
  const f = setup(t);
  f.press("g"); assert.equal(f.controller.keys.pending, "g");
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.controller.keys.pending, "");
  f.press("5"); assert.equal(f.press("Escape").defaultPrevented, true);
  assert.equal(f.controller.keys.pending, "");
  f.press("g"); f.child.winListeners.get("focusin")();
  assert.equal(f.controller.keys.pending, "");
});

test("removed split frames lose handlers and closing a reader cleans observers and timers", t => {
  const f = setup(t);
  assert.equal(f.controller.documents.size, 2);
  f.f.doc.frames = [];
  f.controller.refresh();
  assert.equal(f.child.winListeners.has("keydown"), false);
  assert.equal(f.frame.listeners.has("load"), false);
  assert.equal(f.controller.documents.size, 1);
  f.controller.destroy();
  assert.equal(f.f.winListeners.size, 0);
  assert.equal(f.f.listeners.size, 0);
  assert.equal(f.controller.documents.size, 0);
  assert(f.observers.every(observer => observer.disconnected));
  assert.deepEqual(f.calls, [["destroy"]]);
  assert.equal(f.errors.length, 0);
});

test("a loading frame keeps its key handler when its document changes on the same WindowProxy", t => {
  const f = setup(t);
  const oldDoc = f.child.doc;
  const newDoc = { ...oldDoc, querySelectorAll: () => [] };
  f.frame.contentDocument = newDoc;
  f.controller.refresh();
  assert(!f.controller.documents.has(oldDoc));
  assert(f.controller.documents.has(newDoc));
  assert.equal(typeof f.child.winListeners.get("keydown"), "function");
});

test("cancelled host popups and tooltip hovers cannot disable PDF scrolling", t => {
  const f = setup(t);
  for (const [tag, state] of [["tooltip", "closed"], ["tooltip", "open"], ["menupopup", "closed"]]) {
    const popup = f.f.element(tag, f.f.doc.documentElement, tag);
    popup.state = state;
    f.f.doc.emit("popupshowing", { type: "popupshowing", target: popup });
    f.child.winListeners.get("blur")({ target: f.child.win, currentTarget: f.child.win });
    f.child.winListeners.get("focusin")();
    assert.equal(f.press("j").defaultPrevented, true, tag + ":" + state);
  }
  assert.equal(f.viewport.scrollTop, 120);
});

test("reader shell focus routes Vim keys to the paper while sidebar controls keep native keys", t => {
  const f = setup(t);
  f.press("3", {}, f.f.doc.body); f.press("j", {}, f.f.doc.body);
  assert.equal(f.viewport.scrollTop, 120);
  f.press("k", {}, f.frame);
  assert.equal(f.viewport.scrollTop, 80);
  for (const tag of ["input", "textarea", "button", "div"]) {
    const control = f.f.element("shell-" + tag, f.f.doc.body, tag);
    assert.equal(f.press("j", {}, control).defaultPrevented, undefined);
  }
  assert.equal(f.viewport.scrollTop, 80);
});

test("open host menus block PDF keys and closing them without a hidden event restores scrolling", t => {
  const f = setup(t);
  const menu = f.f.element("menu", f.f.doc.documentElement, "menupopup");
  menu.state = "open";
  f.f.doc.emit("popupshowing", { type: "popupshowing", target: menu });
  assert.equal(f.press("j").defaultPrevented, undefined);
  assert.equal(f.press("j", {}, f.f.doc.body).defaultPrevented, undefined);
  menu.state = "closed";
  assert.equal(f.press("j").defaultPrevented, true);
  assert.equal(f.viewport.scrollTop, 40);
});

test("neutral reader shell keys use the last active split pane", t => {
  const f = setup(t);
  const secondary = fixture();
  secondary.controller.destroy();
  secondary.doc.defaultView = secondary.win;
  secondary.doc.querySelectorAll = () => [];
  secondary.win.MutationObserver = f.child.win.MutationObserver;
  const viewport = secondary.element("viewerContainer", secondary.doc.documentElement);
  viewport.scrollTop = 0;
  const frame = f.f.element("secondary", f.f.doc.body, "iframe");
  frame.src = f.frame.src;
  frame.contentDocument = secondary.doc;
  f.f.doc.frames.push(frame);
  f.controller.refresh();
  f.reader._internalReader = { _lastView: { _iframeWindow: secondary.win } };
  f.press("j", {}, f.f.doc.body);
  assert.equal(viewport.scrollTop, 40);
  assert.equal(f.viewport.scrollTop, 0);
  f.f.doc.frames.pop(); f.controller.refresh();
  f.press("j", {}, f.f.doc.body);
  assert.equal(f.viewport.scrollTop, 40);
});
