"use strict";

var ZotvimReader = class {
  constructor(reader, doc, options) {
    this.reader = reader;
    this.options = options;
    this.doc = options.canonical ? options.canonical(doc) : doc;
    this.win = this.doc.defaultView;
    this.keys = new options.Keys("reader");
    this.documents = new Map();
    this.frames = new Map();
    this.timer = null;
    this.refreshTimer = null;
    this.destroyed = false;
    this.popups = new ZotvimPopups();
    this.onKey = this.onKey.bind(this);
    this.onFocus = () => this.reset();
    this.onBlur = event => {
      if (event.target === event.currentTarget) this.reset();
    };
    this.onPopup = event => {
      if (this.popups.update(event)) this.reset();
    };
    this.onUnload = event => {
      if (event.target === this.doc) this.destroy();
    };
    this.win.addEventListener("unload", this.onUnload);
    this.hostWin = reader._window;
    this.hostDoc = this.hostWin?.document;
    // The XUL browser forwards reader-shell keys to its chrome window. Capture
    // there before Zotero's root-window shortcuts (including Ctrl-f) run.
    // Nested HTML PDF frames still need their own window listeners below.
    this.hostWin?.addEventListener("keydown", this.onKey, true, true);
    this.hostDoc?.addEventListener("popupshowing", this.onPopup, true);
    this.hostDoc?.addEventListener("popuphidden", this.onPopup, true);
    try { this.refresh(); }
    catch (error) { this.destroy(); throw error; }
  }

  reset() {
    this.keys.reset();
    if (this.timer !== null) this.win.clearTimeout(this.timer);
    this.timer = null;
    this.renderCommand();
  }

  scheduleRefresh() {
    if (this.destroyed || this.refreshTimer !== null) return;
    this.refreshTimer = this.win.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, 0);
  }

  refresh() {
    if (this.destroyed) return;
    this.installKeyboardBridge();
    const documents = new Set();
    const frames = new Set();
    const visit = doc => {
      if (doc && this.options.canonical) doc = this.options.canonical(doc);
      if (!doc || documents.has(doc)) return;
      documents.add(doc);
      for (const frame of doc.querySelectorAll("iframe")) {
        // Reader content is privileged local UI. Skip unrelated editor frames.
        if (!frame.src?.includes("/pdf/web/viewer.html")) continue;
        frames.add(frame);
        if (!this.frames.has(frame)) {
          // Attach before Zotero's deferred PDF initialization installs its
          // shortcuts (notably Ctrl-f and h/l).
          const listener = () => { this.reset(); this.refresh(); };
          frame.addEventListener("load", listener);
          this.frames.set(frame, listener);
        }
        try { visit(frame.contentDocument); }
        catch { /* A frame may be loading or already closed. */ }
      }
    };
    visit(this.doc);
    // A frame retains its WindowProxy when about:blank becomes the PDF viewer.
    // Remove obsolete-document listeners before registering the new document,
    // otherwise teardown can remove the newly registered window listener.
    for (const doc of this.documents.keys()) {
      if (!documents.has(doc)) this.detachDocument(doc);
    }
    for (const doc of documents) {
      if (this.documents.has(doc)) continue;
      const win = doc.defaultView;
      // Events do not bubble between frames. Capture in each PDF window.
      // Gecko's fourth argument allows synthetic keys as well as physical
      // keys, so automation and accessibility tools can drive the same handler.
      win.addEventListener("keydown", this.onKey, true, true);
      win.addEventListener("focusin", this.onFocus, true);
      win.addEventListener("blur", this.onBlur, true);
      const observer = new win.MutationObserver(() => this.scheduleRefresh());
      this.documents.set(doc, observer);
      observer.observe(doc.documentElement, this.options.clone({ childList: true, subtree: true }, win));
    }
    for (const [frame, listener] of this.frames) {
      if (frames.has(frame)) continue;
      frame.removeEventListener("load", listener);
      this.frames.delete(frame);
    }
  }

  installKeyboardBridge() {
    if (this.keyboardBridge) return;
    const manager = this.reader._internalReader?._keyboardManager;
    const original = manager?.handleViewKeyDown;
    if (typeof original !== "function" || !this.options.exportFunction) return;
    // Existing PDF windows already have Zotero's capture listener. Its view
    // callback looks up this method dynamically, so intercept here before
    // native Ctrl-f or annotation shortcuts run. Restore only our own wrapper.
    const wrapper = this.options.exportFunction(event => {
      const canonical = this.options.canonical ? this.options.canonical(event) : event;
      if (!this.onKey(canonical)) return original.call(manager, event);
    });
    manager.handleViewKeyDown = wrapper;
    this.keyboardBridge = { manager, original, wrapper };
  }

  detachDocument(doc) {
    const win = doc.defaultView;
    win?.removeEventListener("keydown", this.onKey, true);
    win?.removeEventListener("focusin", this.onFocus, true);
    win?.removeEventListener("blur", this.onBlur, true);
    this.documents.get(doc)?.disconnect();
    this.documents.delete(doc);
  }

  viewport(event) {
    let doc = event.target?.ownerDocument;
    if (doc && this.options.canonical) doc = this.options.canonical(doc);
    const node = event.target;
    // Zotero's normal reader focus and window restoration can leave the shell
    // body focused rather than its PDF iframe. Route only that neutral shell
    // focus (or the PDF frame element) to the last active reading pane.
    if (doc === this.doc && (node === doc.body || node === doc.documentElement || this.frames.has(node))) {
      if (doc.querySelector?.(".context-menu, .overlay")) return null;
      let activeDoc = this.reader._internalReader?._lastView?._iframeWindow?.document;
      if (activeDoc && this.options.canonical) activeDoc = this.options.canonical(activeDoc);
      if (this.documents.has(activeDoc)) return activeDoc.getElementById("viewerContainer");
      for (const candidate of this.documents.keys()) {
        const viewport = candidate.getElementById("viewerContainer");
        if (viewport) return viewport;
      }
      return null;
    }
    const viewport = doc?.getElementById("viewerContainer");
    if (!viewport || !this.documents.has(doc)) return null;
    if (node !== doc.body && node !== doc.documentElement && !viewport.contains(node)) return null;
    return viewport;
  }

  protectedInput(event) {
    return (event.composedPath?.() || [event.target]).some(node => node?.isContentEditable
      || node?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), '
        + '[role="textbox"], [role="combobox"], [role="menu"], [role="dialog"], '
        + 'button, a[href], [role="button"]'));
  }

  onKey(event) {
    if (this.destroyed) return;
    if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    const viewport = this.viewport(event);
    if (!viewport || !this.options.enabled() || this.popups.blocked || event.defaultPrevented
      || this.protectedInput(event) || event.isComposing || event.key === "Process" || event.key === "Dead") {
      this.reset();
      return;
    }
    // Zotero owns Escape for search, popups, annotations, and reader focus.
    if (event.key === "Escape" && !this.keys.pending) return;
    const result = this.keys.feed(event);
    if (this.timer !== null) this.win.clearTimeout(this.timer);
    this.timer = null;
    // A page command waits for Enter/Escape; it is not a timed key sequence.
    if (this.keys.pending && !this.keys.inCommand) {
      this.timer = this.win.setTimeout(() => this.reset(), this.options.timeout());
    }
    this.renderCommand();
    if (!result.handled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (result.action) {
      try {
        Promise.resolve(this.execute(result.action, viewport)).catch(error => this.options.error(error));
      }
      catch (error) { this.options.error(error); }
    }
    return true;
  }

  renderCommand() {
    if (!this.keys.inCommand) {
      if (this.commandLine) this.commandLine.hidden = true;
      return;
    }
    if (!this.commandLine) {
      const ns = "http://www.w3.org/1999/xhtml";
      this.commandStyle = this.doc.createElementNS(ns, "link");
      this.commandStyle.id = "zotvim-reader-style";
      this.commandStyle.rel = "stylesheet";
      this.commandStyle.href = this.options.rootURI + "style.css";
      (this.doc.head || this.doc.documentElement).append(this.commandStyle);
      this.commandLine = this.doc.createElementNS(ns, "output");
      this.commandLine.id = "zotvim-reader-command";
      this.commandLine.setAttribute("role", "status");
      this.commandLine.setAttribute("aria-live", "polite");
      (this.doc.body || this.doc.documentElement).append(this.commandLine);
    }
    this.commandLine.hidden = false;
    this.commandLine.textContent = this.keys.pending + "  ·  Enter: jump to page  ·  Esc: cancel";
  }

  pdf(viewport) {
    const win = viewport.ownerDocument.defaultView;
    return (win.wrappedJSObject || win).PDFViewerApplication;
  }

  execute(action, viewport) {
    switch (action.type) {
      case "cancel": this.reset(); break;
      case "scroll": {
        const size = action.axis === "y" ? viewport.clientHeight : viewport.clientWidth;
        const distance = action.amount * action.count * (action.viewport ? size : 1);
        if (action.axis === "y") viewport.scrollTop += distance;
        else viewport.scrollLeft += distance;
        break;
      }
      case "leftEdge": viewport.scrollLeft = 0; break;
      case "jump":
        if (action.row !== null) return this.page(action.row, viewport);
        if (action.end) this.reader.navigateToLastPage();
        else this.reader.navigateToFirstPage();
        break;
      case "page": {
        const pdf = this.pdf(viewport);
        if (!pdf?.pdfViewer) return;
        return this.page(pdf.pdfViewer.currentPageNumber - 1 + action.direction * action.count, viewport);
      }
      case "search":
        this.reader.toggleFindPopup(this.options.clone({ open: true }));
        break;
      case "find":
        if (action.direction > 0) this.reader.findNext();
        else this.reader.findPrevious();
        break;
      case "zoom":
        if (action.direction > 0) this.reader.zoomIn();
        else if (action.direction < 0) this.reader.zoomOut();
        else this.reader.zoomReset();
        break;
      case "tab": {
        const tabs = this.reader._window?.Zotero_Tabs;
        if (!tabs) break;
        // Finish the count in this action even if focus moves to another tab.
        for (let i = 0; i < action.count; i++) {
          if (action.direction > 0) tabs.selectNext();
          else tabs.selectPrev();
        }
        break;
      }
      case "library": this.options.library(); break;
      case "help": this.options.help(this.reader._window); break;
    }
  }

  page(index, viewport) {
    const count = this.pdf(viewport)?.pagesCount;
    if (!count) return;
    return this.reader.navigate({ pageIndex: Math.max(0, Math.min(count - 1, index)) });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.keyboardBridge) {
      const { manager, original, wrapper } = this.keyboardBridge;
      if (manager.handleViewKeyDown === wrapper) manager.handleViewKeyDown = original;
      this.keyboardBridge = null;
    }
    this.reset();
    if (this.refreshTimer !== null) this.win.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.win.removeEventListener("unload", this.onUnload);
    this.hostWin?.removeEventListener("keydown", this.onKey, true);
    this.hostDoc?.removeEventListener("popupshowing", this.onPopup, true);
    this.hostDoc?.removeEventListener("popuphidden", this.onPopup, true);
    for (const doc of this.documents.keys()) this.detachDocument(doc);
    for (const [frame, listener] of this.frames) frame.removeEventListener("load", listener);
    this.frames.clear();
    this.popups.clear();
    this.commandLine?.remove();
    this.commandStyle?.remove();
    this.options.onDestroy();
  }
};
