"use strict";

var ZotvimWindow = class {
  constructor(win, options) {
    this.win = win;
    this.doc = win.document;
    this.options = options;
    this.keys = new options.Keys();
    this.timer = null;
    this.frame = null;
    this.frameResolve = null;
    this.epoch = 0;
    this.dispatching = false;
    this.destroyed = false;
    this.queue = Promise.resolve();
    this.onKey = this.onKey.bind(this);
    this.onFocus = this.onFocus.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.onPopup = this.onPopup.bind(this);
    this.popups = new ZotvimPopups();
    this.doc.addEventListener("keydown", this.onKey, true);
    this.doc.addEventListener("focusin", this.onFocus, true);
    this.doc.addEventListener("popupshowing", this.onPopup, true);
    this.doc.addEventListener("popuphidden", this.onPopup, true);
    this.win.addEventListener("blur", this.onBlur);
    this.mount();
  }

  get pane() { return this.win.ZoteroPane; }

  get enabled() { return this.options.enabled(); }

  scope(node) {
    if (node?.closest?.("#zotero-collections-tree")) return "collections";
    if (node?.closest?.("#zotero-items-tree")) return "items";
    return null;
  }

  isEditable(event) {
    const nodes = event.composedPath?.() || [event.target];
    return nodes.some(node => node?.isContentEditable || node?.closest?.(
      'input, textarea, select, textbox, search-textbox, note-editor, iframe, browser, '
      + '[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'
    ));
  }

  view(scope) {
    return scope === "collections" ? this.pane?.collectionsView : this.pane?.itemsView;
  }

  reset(cancel = false) {
    this.keys.reset();
    if (this.timer !== null) this.win.clearTimeout(this.timer);
    this.timer = null;
    if (cancel) {
      this.epoch++;
      if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
      this.frame = null;
      this.frameResolve?.();
      this.frameResolve = null;
      // Old queued commands are invalidated by the epoch check.
      this.queue = Promise.resolve();
    }
    this.renderStatus();
  }

  onFocus() { this.reset(true); }

  onBlur(event) {
    if (event.target === this.win) this.reset(true);
  }

  onPopup(event) {
    if (this.popups.update(event)) this.reset(true);
  }

  onKey(event) {
    if (this.dispatching || this.destroyed) return;
    // Shift is a separate keydown before the T in gT. Modifier keydowns must
    // neither complete nor cancel an otherwise valid sequence.
    if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    const scope = this.scope(event.target);
    if (!this.enabled || !scope || this.popups.blocked || event.defaultPrevented
      || this.win.Zotero_Tabs?.selectedID !== "zotero-pane" || this.isEditable(event)
      || event.isComposing || event.key === "Process" || event.key === "Dead") {
      this.reset(true);
      return;
    }
    // Escape remains Zotero's key unless there is a command to cancel.
    if (event.key === "Escape" && !this.keys.pending) {
      this.reset(true);
      return;
    }
    const result = this.keys.feed(event);
    if (this.timer !== null) this.win.clearTimeout(this.timer);
    this.timer = null;
    if (this.keys.pending) {
      this.timer = this.win.setTimeout(() => this.reset(), this.options.timeout());
    }
    this.renderStatus();
    if (!result.handled) {
      // Native mouse/keyboard navigation takes precedence over queued movement.
      this.reset(true);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (result.action?.type === "cancel") {
      this.reset(true);
      return;
    }
    if (result.action) {
      const epoch = this.epoch;
      const view = this.view(scope);
      this.queue = this.queue.then(async () => {
        if (!this.valid(epoch, scope, view)) return;
        await this.execute(result.action, scope, view, epoch);
      }).catch(error => this.options.error(error));
    }
  }

  valid(epoch, scope, view) {
    return !this.destroyed && this.enabled && epoch === this.epoch
      && this.scope(this.doc.activeElement) === scope && this.view(scope) === view
      && this.win.Zotero_Tabs?.selectedID === "zotero-pane";
  }

  nextFrame() {
    // Zotero coalesces selection changes once per animation frame. Dispatching
    // all keys in one turn would make a count such as 5j move only one row.
    return new Promise(resolve => {
      this.frameResolve = resolve;
      this.frame = this.win.requestAnimationFrame(() => {
        this.frame = null;
        this.frameResolve = null;
        resolve();
      });
    });
  }

  async native(key, count, scope, view, epoch, shiftKey = false) {
    if (!view?.rowCount) return;
    const target = this.doc.activeElement;
    count = Math.min(count, Math.max(1, view?.rowCount || 0));
    for (let i = 0; i < count; i++) {
      if (!this.valid(epoch, scope, view)) break;
      const before = view?.selection?.focused;
      this.dispatching = true;
      try {
        target.dispatchEvent(new this.win.KeyboardEvent("keydown", {
          key, code: key, bubbles: true, cancelable: true, shiftKey,
        }));
      }
      finally { this.dispatching = false; }
      await this.nextFrame();
      if (count > 1 && before === view?.selection?.focused) break;
    }
  }

  focus(scope) {
    const view = this.view(scope);
    const container = this.doc.getElementById(
      scope === "collections" ? "zotero-collections-tree" : "zotero-items-tree"
    );
    if (!container || !view?.tree) return;
    // Let the browser decide focusability. Geometry can be zero while the
    // library is initializing or when Zotero runs without a display.
    if (view.rowCount) view.focus();
    else container.querySelector('[tabindex="0"]')?.focus();
  }

  async execute(action, scope, view, epoch) {
    switch (action.type) {
      case "native":
        await this.native(action.key, action.count, scope, view, epoch, action.shiftKey);
        break;
      case "horizontal":
        await this.native(action.direction < 0 ? this.options.previousKey : this.options.nextKey,
          1, scope, view, epoch);
        break;
      case "jump":
        await this.native(action.end && action.row === null ? "End" : "Home", 1, scope, view, epoch);
        if (action.row !== null && this.valid(epoch, scope, view)) {
          await this.native("ArrowDown", action.row, scope, view, epoch);
        }
        break;
      case "halfPage": {
        const container = this.doc.getElementById(
          scope === "collections" ? "zotero-collections-tree" : "zotero-items-tree"
        );
        const row = container?.querySelector('[role="row"], .row');
        const height = row?.getBoundingClientRect().height || 24;
        const rows = Math.max(1, Math.floor((container?.clientHeight || 480) / height / 2));
        await this.native(action.direction > 0 ? "ArrowDown" : "ArrowUp",
          rows * action.count, scope, view, epoch);
        break;
      }
      case "focus":
        this.focus(action.pane === "other" ? (scope === "items" ? "collections" : "items") : action.pane);
        break;
      case "search": {
        const search = this.doc.getElementById("zotero-tb-search");
        const input = search?.searchTextbox
          || this.doc.getElementById("zotero-tb-search-textbox");
        input?.focus();
        input?.select();
        break;
      }
      case "open":
        if (scope === "collections") this.focus("items");
        else await this.pane.viewItems(this.pane.getSelectedItems());
        break;
      case "expand": {
        const row = view?.selection?.focused;
        if (row < 0 || !view?.isContainer(row) || view.isContainerEmpty(row)) break;
        const open = view.isContainerOpen(row);
        if (action.operation === "toggle" || (action.operation === "open" && !open)
          || (action.operation === "close" && open)) {
          await view.toggleOpenState(row);
        }
        break;
      }
      case "tab":
        for (let i = 0; i < action.count; i++) {
          if (action.direction > 0) this.win.Zotero_Tabs.selectNext();
          else this.win.Zotero_Tabs.selectPrev();
        }
        break;
      case "help":
        this.options.help(this.win);
        break;
    }
  }

  mount() {
    const link = this.doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
    link.id = "zotvim-style";
    link.rel = "stylesheet";
    link.href = this.options.rootURI + "style.css";
    this.doc.documentElement.append(link);
    this.style = link;
    const toolbar = this.doc.getElementById("zotero-toolbar-item-tree");
    if (!toolbar) return;
    const button = this.doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
    button.id = "zotvim-status";
    button.type = "button";
    button.title = "Zotvim keyboard shortcuts (press ? in a library tree)";
    button.addEventListener("click", () => this.options.help(this.win));
    toolbar.append(button);
    this.status = button;
    this.renderStatus();
  }

  renderStatus() {
    if (!this.status) return;
    this.status.textContent = "Zotvim" + (!this.enabled ? " · off" : this.keys.pending ? " · " + this.keys.pending : " · ?");
    this.status.setAttribute("aria-label", this.status.textContent + ". Show keyboard shortcuts");
  }

  destroy() {
    this.destroyed = true;
    this.reset(true);
    this.doc.removeEventListener("keydown", this.onKey, true);
    this.doc.removeEventListener("focusin", this.onFocus, true);
    this.doc.removeEventListener("popupshowing", this.onPopup, true);
    this.doc.removeEventListener("popuphidden", this.onPopup, true);
    this.win.removeEventListener("blur", this.onBlur);
    this.popups.clear();
    this.status?.remove();
    this.style?.remove();
  }
};
