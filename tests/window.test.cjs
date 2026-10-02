const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers.cjs");

function setup(t, rows) {
  const f = fixture(rows);
  t.after(() => f.controller.destroy());
  return f;
}

test("5j moves five rows despite Zotero's per-frame selection coalescing", async t => {
  const f = setup(t);
  f.press("5"); f.press("j");
  await f.flush();
  assert.equal(f.itemsView.selection.focused, 5);
  assert.equal(f.nativeEvents.length, 5);
  assert.equal(f.errors.length, 0);
  f.press("2"); f.press("k");
  await f.flush();
  assert.equal(f.itemsView.selection.focused, 3);
});

test("gg, G, numbered G, and boundaries use native selection", async t => {
  const f = setup(t, 8);
  f.press("G"); await f.flush();
  assert.equal(f.itemsView.selection.focused, 7);
  f.press("g"); f.press("g"); await f.flush();
  assert.equal(f.itemsView.selection.focused, 0);
  f.press("3"); f.press("G"); await f.flush();
  assert.equal(f.itemsView.selection.focused, 2);
  f.press("9"); f.press("j"); await f.flush();
  assert.equal(f.itemsView.selection.focused, 7);
});

test("search, metadata, shadow-DOM inputs, notes, and IME are never intercepted", async t => {
  const f = setup(t);
  const note = f.element("note", f.items, "note-editor");
  const editable = f.element("editable", f.items);
  editable.isContentEditable = true;
  for (const target of [f.search.searchTextbox, note, editable,
    f.element("title", f.items, "input"), f.element("notes", f.items, "iframe"),
    f.element("combo", f.items, "select")]) {
    target.focus();
    for (const letter of ["j", "k", "g", "o", "/", "?"]) {
      assert.equal(f.press(letter, {}, target).stopped, undefined, target.id);
    }
  }
  f.itemFocus.focus();
  const shadowInput = f.element("shadow-input", null, "input");
  assert.equal(f.press("j", { composedPath: () => [shadowInput, f.itemFocus] }).stopped, undefined);
  assert.equal(f.press("j", { isComposing: true }).stopped, undefined);
  assert.equal(f.press("j", { altKey: true, ctrlKey: true }).stopped, undefined);
  await f.flush();
  assert.equal(f.itemsView.selection.focused, 0);
});

test("disabled plugin, menus, other tabs, and controls keep native keys", async t => {
  const f = setup(t);
  const popup = { localName: "menupopup", state: "open" };
  f.doc.emit("popupshowing", { type: "popupshowing", target: popup });
  assert.equal(f.press("j").stopped, undefined);
  f.doc.emit("popuphidden", { type: "popuphidden", target: popup });
  f.win.Zotero_Tabs.selectedID = "reader-1";
  assert.equal(f.press("j").stopped, undefined);
  f.win.Zotero_Tabs.selectedID = "zotero-pane";
  const button = f.element("unrelated", f.doc.documentElement, "button");
  button.focus();
  assert.equal(f.press("j").stopped, undefined);
  f.itemFocus.focus();
  f.disable();
  assert.equal(f.press("j").stopped, undefined);
  await f.flush();
  assert.equal(f.itemsView.selection.focused, 0);
});

test("pane switching, search focus, and open delegate to Zotero", async t => {
  const f = setup(t);
  f.press("H"); await f.flush();
  assert.equal(f.doc.activeElement, f.collectionFocus);
  f.press("o"); await f.flush();
  assert.equal(f.doc.activeElement, f.itemFocus);
  assert.equal(f.opened.length, 0);
  f.press("o"); await f.flush();
  assert.deepEqual(f.opened, [["selected-item"]]);
  f.press("/"); await f.flush();
  assert.equal(f.doc.activeElement, f.search.searchTextbox);
  assert.equal(f.search.searchTextbox.selectedText, true);
  assert.equal(f.press("j").stopped, undefined);
});

test("row expansion is idempotent and horizontal navigation handles RTL", async t => {
  const f = setup(t);
  f.press("z"); f.press("o"); await f.flush();
  assert.equal(f.itemsView.open, true);
  f.press("z"); f.press("o"); await f.flush();
  assert.equal(f.itemsView.open, true);
  f.press("z"); f.press("a"); await f.flush();
  assert.equal(f.itemsView.open, false);
  f.controller.options.previousKey = "ArrowRight";
  f.press("h"); await f.flush();
  assert.equal(f.nativeEvents.at(-1).key, "ArrowRight");
});

test("focus changes and disabling cancel in-flight counted movement", async t => {
  const f = setup(t);
  f.press("9"); f.press("j");
  await new Promise(resolve => setImmediate(resolve));
  f.search.searchTextbox.focus();
  // A key already dispatched to Zotero may finish its one scheduled update.
  await new Promise(resolve => setImmediate(resolve));
  const atCancel = f.itemsView.selection.focused;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.itemsView.selection.focused, atCancel);
  f.itemFocus.focus();
  f.press("9"); f.press("j");
  f.disable();
  await f.flush();
  assert.equal(f.itemsView.selection.focused, atCancel);
});

test("prefix expires and doesn't leak across focus, Escape cancels", async t => {
  const f = setup(t);
  f.press("g");
  assert.equal(f.controller.keys.pending, "g");
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.controller.keys.pending, "");
  f.press("2"); f.press("g");
  assert.equal(f.press("Escape").stopped, true);
  assert.equal(f.controller.keys.pending, "");
  f.press("g"); f.collectionFocus.focus();
  assert.equal(f.controller.keys.pending, "");
});

test("gT survives the physical Shift keydown and switches tabs", async t => {
  const f = setup(t);
  f.press("g"); f.press("Shift", { shiftKey: true }); f.press("T", { shiftKey: true });
  await f.flush();
  assert.deepEqual(f.tabMoves, [-1]);
});

test("empty trees remain usable and destruction removes listeners and UI", async t => {
  const f = setup(t, 0);
  f.press("j"); await f.flush();
  f.press("H"); await f.flush();
  assert.equal(f.doc.activeElement, f.collectionFocus);
  f.controller.destroy();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.winListeners.size, 0);
  assert.equal(f.doc.getElementById("zotvim-status"), undefined);
  assert.equal(f.doc.getElementById("zotvim-style"), undefined);
  assert.equal(f.errors.length, 0);
});

test("cancelled tooltips and menus cannot leave library navigation blocked after restore", async t => {
  const f = setup(t);
  for (const tag of ["tooltip", "menupopup"]) {
    const popup = f.element("cancelled-" + tag, f.doc.documentElement, tag);
    popup.state = "closed";
    f.doc.emit("popupshowing", { type: "popupshowing", target: popup });
    // A cancelled popup does not send popuphidden, even across window blur.
    f.winListeners.get("blur")({ target: f.win });
    f.itemFocus.focus();
    assert.equal(f.press("j").defaultPrevented, true, tag);
    await f.flush();
  }
  assert.equal(f.itemsView.selection.focused, 2);
});

test("visible tooltips allow library navigation while open menus and panels block it", async t => {
  const f = setup(t);
  const tooltip = f.element("tooltip", f.doc.documentElement, "tooltip");
  tooltip.state = "open";
  f.doc.emit("popupshowing", { type: "popupshowing", target: tooltip });
  assert.equal(f.press("j").defaultPrevented, true);
  await f.flush();
  for (const tag of ["menupopup", "panel"]) {
    const popup = f.element(tag, f.doc.documentElement, tag);
    popup.state = "open";
    f.doc.emit("popupshowing", { type: "popupshowing", target: popup });
    assert.equal(f.press("j").defaultPrevented, undefined);
    popup.state = "closed"; // Window managers can dismiss popups on deactivate.
    f.winListeners.get("blur")({ target: f.win });
    f.itemFocus.focus();
    assert.equal(f.press("j").defaultPrevented, true);
    await f.flush();
  }
  assert.equal(f.itemsView.selection.focused, 3);
});
