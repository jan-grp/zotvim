const test = require("node:test");
const assert = require("node:assert/strict");
const { scripts, key } = require("./helpers.cjs");
const { ZotvimKeys } = scripts("keys.js");
const plain = value => JSON.parse(JSON.stringify(value));

test("reader colon commands accept edited page numbers and require Enter", () => {
  const decoder = new ZotvimKeys("reader");
  for (const k of [":", "1", "2"]) assert.equal(decoder.feed(key(k)).handled, true);
  assert.equal(decoder.pending, ":12");
  assert.equal(decoder.inCommand, true);
  decoder.feed(key("Backspace")); decoder.feed(key("5"));
  assert.equal(decoder.pending, ":15");
  assert.deepEqual(plain(decoder.feed(key("Enter"))).action, { type: "jump", end: false, row: 14 });
  assert.equal(decoder.inCommand, false);
  assert.equal(decoder.pending, "");
  for (const keys of [[":", "Enter"], [":", "0", "Enter"], [":", "2", "Escape"], [":", "Backspace"]]) {
    let result;
    for (const k of keys) result = decoder.feed(key(k));
    assert.equal(result.action.type, "cancel");
    assert.equal(decoder.pending, "");
  }
  decoder.feed(key(":")); decoder.feed(key("g")); decoder.feed(key("n"));
  assert.equal(decoder.pending, ":");
  assert.equal(decoder.feed(key("c", { ctrlKey: true })).handled, false);
  assert.equal(decoder.pending, "");
  assert.equal(new ZotvimKeys().feed(key(":")).handled, false);
});

function decode(keys) {
  const decoder = new ZotvimKeys();
  let result;
  for (const k of keys) result = decoder.feed(typeof k === "string" ? key(k) : k);
  return plain(result);
}

test("movement, shifted selection, and bounded counts", () => {
  assert.deepEqual(decode(["5", "j"]).action, { type: "native", key: "ArrowDown", count: 5 });
  assert.deepEqual(decode(["2", "K"]).action, { type: "native", key: "ArrowUp", shiftKey: true, count: 2 });
  assert.equal(decode(["9", "9", "9", "9", "j"]).action.count, 1000);
});

test("first, last, and numbered rows", () => {
  assert.deepEqual(decode(["g", "g"]).action, { type: "jump", end: false, row: null });
  assert.deepEqual(decode(["G"]).action, { type: "jump", end: true, row: null });
  assert.equal(decode(["1", "0", "G"]).action.row, 9);
  assert.equal(decode(["2", "g", "g"]).action.row, 1);
  assert.equal(decode(["0"]).action.type, "jump");
});

test("window, tab, and expansion sequences", () => {
  assert.equal(decode([key("w", { ctrlKey: true }), "h"]).action.pane, "collections");
  assert.equal(decode([key("w", { ctrlKey: true }), "w"]).action.pane, "other");
  assert.equal(decode(["g", "l"]).action.pane, "items");
  assert.equal(decode(["3", "g", "T"]).action.direction, -1);
  for (const [letter, operation] of [["o", "open"], ["c", "close"], ["a", "toggle"]]) {
    assert.equal(decode(["z", letter]).action.operation, operation);
  }
});

test("unmatched prefixes allow the next command, held g does not become gg", () => {
  assert.equal(decode(["g", "j"]).action.key, "ArrowDown");
  const decoder = new ZotvimKeys();
  decoder.feed(key("g"));
  assert.equal(decoder.feed(key("g", { repeat: true })).action, undefined);
  assert.equal(decoder.pending, "g");
  assert.equal(decoder.feed(key("g")).action.type, "jump");
});

test("native shortcuts, IME, AltGr, and ordinary typing pass through", () => {
  for (const event of [key("c", { ctrlKey: true }), key("j", { metaKey: true }),
    key("j", { altKey: true, ctrlKey: true }), key("j", { isComposing: true }),
    key("Dead"), key("Process"), key("i"), key("a"), key("Delete")]) {
    assert.equal(decode(["g", event]).handled, false);
  }
});

test("modifier-only events preserve a sequence for gT", () => {
  assert.equal(decode(["g", key("Shift", { shiftKey: true }), "T"]).action.direction, -1);
});

test("Escape resets counts and prefixes; control paging respects counts", () => {
  const decoder = new ZotvimKeys();
  decoder.feed(key("2"));
  decoder.feed(key("g"));
  assert.equal(decoder.feed(key("Escape")).action.type, "cancel");
  assert.equal(decoder.pending, "");
  assert.equal(decode(["2", key("d", { ctrlKey: true })]).action.count, 2);
  assert.equal(decode([key("f", { ctrlKey: true })]).action.key, "PageDown");
});
