"use strict";

var controllers = new Map();
var scriptScope;
var pluginRoot;
var menuID;
var prefObserver;
var readers = new Map();

const ENABLED_PREF = "extensions.zotvim.enabled";
const TIMEOUT_PREF = "extensions.zotvim.sequenceTimeout";
const HELP = [
  "Zotvim — library and PDF navigation",
  "",
  "j / k                 Next / previous row",
  "J / K                 Extend selection down / up",
  "h / l                 Collapse / expand (or parent / child)",
  "gg / G / 0            First / last / first row",
  "5j, 5k, 5gg, 5G       Counts; row numbers start at 1",
  "Ctrl-d / Ctrl-u       Half a pane down / up",
  "Ctrl-f / Ctrl-b       Page down / up (Zotero's behavior)",
  "H / gh / Ctrl-w h     Focus collections",
  "L / gl / Ctrl-w l     Focus items",
  "Ctrl-w w              Switch between the two trees",
  "/                     Focus library search; type normally",
  "o                     Open selected items; enter a collection",
  "zo / zc / za          Expand / collapse / toggle a row",
  "gt / gT               Next / previous Zotero tab",
  "Escape                Cancel an unfinished key sequence",
  "?                     This help",
  "",
  "Inside the PDF viewer:",
  "j / k / h / l         Scroll down / up / left / right (counts supported)",
  "Ctrl-d / Ctrl-u       Half a viewport down / up",
  "Ctrl-f / Ctrl-b       Full viewport down / up",
  "J / K                 Next / previous physical page",
  "gg / G / 5G           First / last / fifth physical page",
  ":5 then Enter         Go to physical page 5 (Backspace edits; Escape cancels)",
  "/                     Search this paper",
  "n / N                 Next / previous search match",
  "+ / - / =             Zoom in / out / reset",
  "0                     Scroll to the left edge",
  "gt / gT               Next / previous Zotero tab",
  "g0                    Return to the library",
  "?                     This help",
  "",
  "Click a collection or item tree to use these keys.",
  "There is no insert mode. Text fields use ordinary typing.",
  "Search fields, annotation editors, and note editors keep ordinary typing.",
  "Search: Enter runs the search. Escape clears it; Escape again returns to items.",
  "Toggle navigation in Tools → Enable Zotvim navigation.",
].join("\n");

function enabled() {
  return Services.prefs.getBoolPref(ENABLED_PREF, true);
}

function help(win) {
  Services.prompt.alert(win, "Zotvim keyboard shortcuts", HELP);
}

function sequenceTimeout() {
  return Math.max(200, Math.min(10000, Services.prefs.getIntPref(TIMEOUT_PREF, 1000)));
}

function attachReader(reader, doc) {
  if (!scriptScope || readers.has(reader) || reader.type !== "pdf" || !doc) return;
  const controller = new scriptScope.ZotvimReader(reader, doc, {
    Keys: scriptScope.ZotvimKeys,
    rootURI: pluginRoot,
    enabled,
    timeout: sequenceTimeout,
    help,
    clone: (value, win = reader._iframeWindow) => Components.utils.cloneInto(value, win),
    exportFunction: callback => Components.utils.exportFunction(callback, reader._iframeWindow),
    canonical: value => Components.utils.unwaiveXrays(value),
    library: () => {
      const win = Zotero.getMainWindow();
      if (!win) return;
      win.Zotero_Tabs.select("zotero-pane");
      win.focus();
      win.ZoteroPane.itemsView?.focus();
    },
    error: error => Zotero.logError(error),
    onDestroy: () => readers.delete(reader),
  });
  readers.set(reader, controller);
}

function attach(win) {
  if (!scriptScope || controllers.has(win) || !win.ZoteroPane) return;
  win.MozXULElement.insertFTLIfNeeded("zotvim.ftl");
  const controller = new scriptScope.ZotvimWindow(win, {
    Keys: scriptScope.ZotvimKeys,
    rootURI: pluginRoot,
    enabled,
    timeout: sequenceTimeout,
    previousKey: Zotero.arrowPreviousKey,
    nextKey: Zotero.arrowNextKey,
    help,
    error: error => Zotero.logError(error),
  });
  controllers.set(win, controller);
}

function install() {}
function uninstall() {}

async function startup({ id, rootURI }) {
  pluginRoot = rootURI;
  scriptScope = {};
  Services.scriptloader.loadSubScript(rootURI + "keys.js", scriptScope);
  Services.scriptloader.loadSubScript(rootURI + "popups.js", scriptScope);
  Services.scriptloader.loadSubScript(rootURI + "window.js", scriptScope);
  Services.scriptloader.loadSubScript(rootURI + "reader.js", scriptScope);
  // Zotero removes callbacks registered with the plugin ID on disable/uninstall.
  Zotero.Reader.registerEventListener("renderToolbar", ({ reader, doc }) => {
    try { attachReader(reader, doc); }
    catch (error) { Zotero.logError(error); }
  }, id);
  // Also support installing or re-enabling Zotvim while papers are already open.
  for (const reader of Zotero.Reader._readers || []) {
    Promise.resolve(reader._initPromise).then(() => {
      attachReader(reader, reader._iframeWindow?.document);
    }).catch(error => Zotero.logError(error));
  }
  for (const win of Zotero.getMainWindows()) attach(win);
  menuID = Zotero.MenuManager.registerMenu({
    menuID: "zotvim-tools",
    pluginID: id,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "zotvim-menu-toggle",
        onShowing: (_event, context) => {
          context.menuElem.setAttribute("type", "checkbox");
          context.menuElem.setAttribute("checked", String(enabled()));
        },
        onCommand: () => Services.prefs.setBoolPref(ENABLED_PREF, !enabled()),
      },
      {
        menuType: "menuitem",
        l10nID: "zotvim-menu-help",
        onCommand: event => help(event.target.ownerGlobal),
      },
    ],
  });
  prefObserver = () => {
    for (const controller of controllers.values()) controller.reset(true);
    for (const controller of readers.values()) controller.reset();
  };
  Services.prefs.addObserver("extensions.zotvim.", prefObserver);
}

function onMainWindowLoad({ window }) { attach(window); }

function onMainWindowUnload({ window }) {
  controllers.get(window)?.destroy();
  controllers.delete(window);
}

function shutdown() {
  if (prefObserver) Services.prefs.removeObserver("extensions.zotvim.", prefObserver);
  prefObserver = null;
  if (menuID) Zotero.MenuManager.unregisterMenu(menuID);
  menuID = null;
  for (const [win, controller] of controllers) {
    controller.destroy();
    win.document.querySelector('link[href="zotvim.ftl"]')?.remove();
  }
  controllers.clear();
  for (const controller of readers.values()) controller.destroy();
  readers.clear();
  scriptScope = null;
  pluginRoot = null;
}
