"use strict";

// Plain scripts keep the key decoder usable in both Zotero's bootstrap scope
// and Node's VM-based tests, without a bundler or Firefox module imports.
var ZotvimKeys = class {
  constructor(context = "library") {
    this.context = context;
    this.reset();
  }

  reset() {
    this.count = "";
    this.prefix = "";
    this.command = null;
  }

  get pending() {
    if (this.inCommand) return ":" + this.command;
    return this.count + this.prefix;
  }

  get inCommand() { return this.command !== null; }

  finish(action) {
    this.reset();
    return { handled: true, action };
  }

  feed(event) {
    const { key, ctrlKey, altKey, metaKey, shiftKey, repeat } = event;
    if (event.isComposing || key === "Process" || key === "Dead" || altKey || metaKey) {
      this.reset();
      return { handled: false };
    }
    if (["Shift", "Control", "Alt", "Meta"].includes(key)) {
      return { handled: false };
    }
    if (key === "Escape") return this.finish({ type: "cancel" });
    if (this.inCommand) {
      // Command entry stays in the reading area; editable controls retain
      // ordinary typing. Native modifier shortcuts cancel command entry.
      if (ctrlKey) { this.reset(); return { handled: false }; }
      if (/^[0-9]$/.test(key)) {
        // Fifteen digits remain exact JavaScript integers.
        if (this.command.length < 15) this.command += key;
      }
      else if (key === "Backspace") {
        if (!this.command) return this.finish({ type: "cancel" });
        this.command = this.command.slice(0, -1);
      }
      else if (key === "Enter") {
        const page = Number(this.command);
        return this.finish(page > 0
          ? { type: "jump", end: false, row: page - 1 }
          : { type: "cancel" });
      }
      return { handled: true };
    }
    if (this.context === "reader" && key === ":" && !ctrlKey) {
      this.reset();
      this.command = "";
      return { handled: true };
    }
    const count = Number(this.count) || 1;

    if (ctrlKey) {
      this.reset();
      if (shiftKey) return { handled: false };
      if (key === "w" && this.context === "library") {
        this.prefix = "<C-w>";
        return { handled: true };
      }
      const actions = {
        d: { type: "halfPage", direction: 1, count },
        u: { type: "halfPage", direction: -1, count },
        f: { type: "native", key: "PageDown", count },
        b: { type: "native", key: "PageUp", count },
      };
      if (this.context === "reader") {
        const readerActions = {
          d: { type: "scroll", axis: "y", amount: 0.5, viewport: true, count },
          u: { type: "scroll", axis: "y", amount: -0.5, viewport: true, count },
          f: { type: "scroll", axis: "y", amount: 1, viewport: true, count },
          b: { type: "scroll", axis: "y", amount: -1, viewport: true, count },
        };
        return readerActions[key] ? this.finish(readerActions[key]) : { handled: false };
      }
      if (actions[key]) return this.finish(actions[key]);
      return { handled: false };
    }

    if (this.prefix) {
      // Holding a prefix key must not accidentally complete a sequence.
      if (repeat && this.prefix === key) return { handled: true };
      const sequences = {
        gg: { type: "jump", end: false, row: this.count ? count - 1 : null },
        gh: { type: "focus", pane: "collections" },
        gl: { type: "focus", pane: "items" },
        gt: { type: "tab", direction: 1, count },
        gT: { type: "tab", direction: -1, count },
        "<C-w>h": { type: "focus", pane: "collections" },
        "<C-w>l": { type: "focus", pane: "items" },
        "<C-w>w": { type: "focus", pane: "other" },
        zo: { type: "expand", operation: "open" },
        zc: { type: "expand", operation: "close" },
        za: { type: "expand", operation: "toggle" },
      };
      const readerSequences = {
        gg: { type: "jump", end: false, row: this.count ? count - 1 : null },
        gt: { type: "tab", direction: 1, count },
        gT: { type: "tab", direction: -1, count },
        g0: { type: "library" },
      };
      const action = (this.context === "reader" ? readerSequences : sequences)[this.prefix + key];
      if (action) return this.finish(action);
      this.reset();
      // An incomplete command doesn't swallow the next valid command.
      return this.feed(event);
    }

    if (/^[0-9]$/.test(key)) {
      if (key === "0" && !this.count) return this.finish(this.context === "reader"
        ? { type: "leftEdge" } : { type: "jump", end: false, row: null });
      this.count = String(Math.min(1000, Number(this.count + key)));
      return { handled: true };
    }
    if (key === "g" || (key === "z" && this.context === "library")) {
      this.prefix = key;
      return { handled: true };
    }
    const actions = {
      j: { type: "native", key: "ArrowDown", count },
      k: { type: "native", key: "ArrowUp", count },
      J: { type: "native", key: "ArrowDown", shiftKey: true, count },
      K: { type: "native", key: "ArrowUp", shiftKey: true, count },
      h: { type: "horizontal", direction: -1 },
      l: { type: "horizontal", direction: 1 },
      H: { type: "focus", pane: "collections" },
      L: { type: "focus", pane: "items" },
      G: { type: "jump", end: true, row: this.count ? count - 1 : null },
      "/": { type: "search" },
      o: { type: "open" },
      "?": { type: "help" },
    };
    if (this.context === "reader") {
      const readerActions = {
        j: { type: "scroll", axis: "y", amount: 40, count },
        k: { type: "scroll", axis: "y", amount: -40, count },
        h: { type: "scroll", axis: "x", amount: -40, count },
        l: { type: "scroll", axis: "x", amount: 40, count },
        J: { type: "page", direction: 1, count },
        K: { type: "page", direction: -1, count },
        G: { type: "jump", end: true, row: this.count ? count - 1 : null },
        "/": { type: "search" },
        n: { type: "find", direction: 1 },
        N: { type: "find", direction: -1 },
        "+": { type: "zoom", direction: 1 },
        "-": { type: "zoom", direction: -1 },
        "=": { type: "zoom", direction: 0 },
        "?": { type: "help" },
      };
      if (readerActions[key]) return this.finish(readerActions[key]);
      this.reset();
      return { handled: false };
    }
    if (actions[key]) return this.finish(actions[key]);
    this.reset();
    return { handled: false };
  }
};
