"use strict";

// XUL popupshowing is cancellable. A cancelled popup never sends popuphidden,
// and window deactivation may dismiss a popup without our seeing its teardown.
// Check current native state before blocking keyboard navigation.
var ZotvimPopups = class {
  constructor() { this.active = new Set(); }

  update(event) {
    const popup = event.target;
    const tag = (popup?.localName || popup?.tagName || "").toLowerCase();
    // Tooltips do not own keyboard input, including Zotero's empty, cancelled
    // dynamic tooltips. They must not interrupt counts or key sequences.
    if (tag !== "menupopup" && tag !== "panel") return false;
    if (event.type === "popupshowing") this.active.add(popup);
    else this.active.delete(popup);
    return true;
  }

  get blocked() {
    for (const popup of this.active) {
      try {
        if (popup.isConnected === false || !["showing", "open", "hiding"].includes(popup.state)) {
          this.active.delete(popup);
        }
      }
      catch { this.active.delete(popup); } // A closed window may leave dead wrappers.
    }
    return this.active.size > 0;
  }

  clear() { this.active.clear(); }
};
