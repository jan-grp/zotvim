// Zotvim integration test, loaded only by the disposable runtime's main window.
var Cc = Components.classes;
var Ci = Components.interfaces;
var { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
var { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
var checks = [];
var xpiPath = __XPI_PATH__;
var resultPath = __RESULT_PATH__;
var pdfPath = __PDF_PATH__;

function assert(condition, description) {
  if (!condition) throw new Error(description);
  checks.push(description);
}
function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function trustedPress(win, key, { ctrlKey = false } = {}) {
  const tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(win)) throw new Error("Could not start trusted keyboard input");
  const event = new win.KeyboardEvent("", { key, code: "Key" + key.toUpperCase(), keyCode: key.toUpperCase().charCodeAt(0) });
  const control = new win.KeyboardEvent("", { key: "Control", code: "ControlLeft" });
  if (ctrlKey) tip.keydown(control);
  tip.keydown(event);
  tip.keyup(event);
  if (ctrlKey) tip.keyup(control);
}
async function until(predicate, description) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await pause(100);
  }
  throw new Error("Timed out: " + description);
}
async function finish(result) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(resultPath);
  const output = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
  output.init(file, 0x02 | 0x08 | 0x20, 0o600, 0);
  const converter = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
  converter.init(output, "UTF-8");
  converter.writeString(JSON.stringify(result, null, 2));
  converter.close();
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}

async function run(win) {
  try {
    const Zotero = win.Zotero;
    await Zotero.initializationPromise;
    await until(() => win.ZoteroPane?.itemsView?.tree && win.ZoteroPane?.collectionsView?.tree, "library trees");
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(xpiPath);
    const install = await AddonManager.getInstallForFile(file);
    try { await install.install(); }
    catch (error) {
      throw new Error("XPI install failed (code " + install.error + ", state " + install.state
        + "): " + error);
    }
    const addon = await AddonManager.getAddonByID("zotvim@zotvim.local");
    assert(addon?.isActive, "Packaged XPI installs and is active");
    await until(() => win.document.getElementById("zotvim-status"), "plugin toolbar button");
    assert(!!win.document.querySelector('link[href="zotvim.ftl"]'), "Fluent resource is loaded");
    const pane = win.ZoteroPane;
    const collection = new Zotero.Collection();
    collection.name = "Zotvim integration test";
    await collection.saveTx();
    const child = new Zotero.Collection();
    child.name = "Nested collection";
    child.parentID = collection.id;
    await child.saveTx();
    for (let i = 0; i < 12; i++) {
      const item = new Zotero.Item("book");
      item.setField("title", "Zotvim book " + String(i).padStart(2, "0"));
      item.addToCollection(collection.id);
      await item.saveTx();
    }
    await pane.collectionsView.selectByID("C" + collection.id);
    await until(() => pane.itemsView.rowCount === 12, "test items");
    pane.itemsView.focus();
    function press(key, extra = {}) {
      const event = new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
      win.document.activeElement.dispatchEvent(event);
      return event;
    }
    press("g"); press("g"); await pause(100);
    assert(pane.itemsView.selection.focused === 0, "gg selects the first item");
    press("5"); press("j"); await until(() => pane.itemsView.selection.focused === 5, "5j");
    assert(pane.itemsView.selection.focused === 5, "5j moves five rows in the real React tree");
    press("2"); press("k"); await until(() => pane.itemsView.selection.focused === 3, "2k");
    assert(pane.itemsView.selection.focused === 3, "2k moves two rows up");
    press("J", { shiftKey: true }); await pause(100);
    assert(pane.itemsView.selection.count === 2, "J extends item selection");
    press("G", { shiftKey: true }); await pause(100);
    assert(pane.itemsView.selection.focused === 11, "G selects the last item");
    press("3"); press("G", { shiftKey: true }); await pause(150);
    assert(pane.itemsView.selection.focused === 2, "3G selects the third item");
    press("g"); press("Shift", { shiftKey: true }); press("g"); await pause(100);
    assert(pane.itemsView.selection.focused === 0, "Modifier-only keydowns preserve sequences");
    trustedPress(win, "j"); await pause(150);
    assert(pane.itemsView.selection.focused === 1, "Trusted keyboard input navigates the item list");
    for (let cycle = 0; cycle < 3; cycle++) {
      win.minimize(); await pause(100);
      win.restore(); win.focus(); await pause(150);
      const before = pane.itemsView.selection.focused;
      trustedPress(win, "j"); await pause(150);
      assert(pane.itemsView.selection.focused === before + 1,
        "Item navigation survives minimize/restore cycle " + cycle
        + " (focus=" + win.document.activeElement?.id + ")");
    }
    press("/"); await pause(100);
    assert(win.document.activeElement.closest("search-textbox, input"), "/ focuses the real search field");
    assert(!press("j").defaultPrevented, "Typing j in search is passed through");
    pane.itemsView.focus();
    await pause(100);
    const beforeH = win.document.activeElement.id;
    const eventH = press("H", { shiftKey: true }); await pause(100);
    assert(win.document.activeElement.closest("#zotero-collections-tree"),
      "H focuses collections (before=" + beforeH + ", after=" + win.document.activeElement.id
      + ", prevented=" + eventH.defaultPrevented + ")");
    press("z"); press("c"); await pause(100);
    assert(!pane.collectionsView.isContainerOpen(pane.collectionsView.selection.focused), "zc collapses a collection");
    press("z"); press("o"); await pause(100);
    assert(pane.collectionsView.isContainerOpen(pane.collectionsView.selection.focused), "zo expands a collection");
    press("o"); await pause(100);
    assert(win.document.activeElement.closest("#zotero-items-tree"), "o in collections focuses items");
    const tools = win.document.getElementById("menu_ToolsPopup");
    if (tools) {
      tools.openPopup(); await pause(150);
      assert(!!tools.querySelector('[data-l10n-id="zotvim-menu-toggle"]'), "Tools menu uses Zotero MenuManager");
      tools.hidePopup(); await pause(100);
    }
    pane.itemsView.focus();
    const cancelledTooltip = win.document.getElementById("dynamic-tooltip");
    cancelledTooltip.openPopup(win.document.getElementById("zotero-items-tree"), "after_start");
    await pause(150);
    assert(cancelledTooltip.state === "closed", "Zotero cancels an empty dynamic tooltip");
    pane.itemsView.focus(); await pause(100);
    assert(press("j").defaultPrevented, "A cancelled tooltip does not permanently disable library bindings");
    Services.prefs.setBoolPref("extensions.zotvim.enabled", false);
    assert(!press("j").defaultPrevented, "Disabling navigation restores native keys");
    Services.prefs.setBoolPref("extensions.zotvim.enabled", true);
    await addon.disable();
    assert(!win.document.getElementById("zotvim-status"), "Disabling the addon removes its UI");
    assert(!win.document.querySelector('link[href="zotvim.ftl"]'), "Disabling the addon removes its localization link");
    await addon.enable();
    await until(() => win.document.getElementById("zotvim-status"), "re-enabled plugin");
    assert(!!win.document.getElementById("zotvim-status"), "Re-enabling the addon restores its UI");

    const pdfFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    pdfFile.initWithPath(pdfPath);
    const attachment = await Zotero.Attachments.importFromFile({ file: pdfFile });
    const reader = await Zotero.Reader.open(attachment.id);
    await until(() => {
      const pdfWin = reader._internalReader?._primaryView?._iframeWindow;
      return (pdfWin?.wrappedJSObject || pdfWin)?.PDFViewerApplication?.pdfViewer?.pagesCount === 5;
    }, "five-page PDF viewer (internal=" + !!reader._internalReader + ")");
    const pdfWin = reader._internalReader._primaryView._iframeWindow;
    const viewer = pdfWin.document.getElementById("viewerContainer");
    const pdfApp = (pdfWin.wrappedJSObject || pdfWin).PDFViewerApplication;
    function pdfPress(key, extra = {}) {
      const event = new pdfWin.KeyboardEvent("keydown", Components.utils.cloneInto(
        { key, bubbles: true, cancelable: true, ...extra }, pdfWin));
      pdfWin.document.activeElement.dispatchEvent(event);
      // Read cancellation from the privileged reflector. Firefox hides
      // chrome-side preventDefault from a content-compartment event wrapper.
      return Components.utils.unwaiveXrays(event);
    }
    await reader.focus(); await pause(150);
    const nativeFocusScroll = viewer.scrollTop;
    trustedPress(win, "j"); await pause(100);
    assert(viewer.scrollTop === nativeFocusScroll + 40, "Zotero's normal reader focus accepts Vim bindings");
    cancelledTooltip.openPopup(win.document.getElementById("zotero-items-tree"), "after_start");
    await pause(150);
    const cancelledPDFScroll = viewer.scrollTop;
    trustedPress(win, "j"); await pause(100);
    assert(viewer.scrollTop === cancelledPDFScroll + 40, "A cancelled host tooltip does not disable PDF bindings");
    for (let cycle = 0; cycle < 3; cycle++) {
      win.minimize(); await pause(100);
      win.restore(); win.focus(); await pause(150);
      const before = viewer.scrollTop;
      trustedPress(win, "j"); await pause(100);
      assert(viewer.scrollTop === before + 40, "PDF scrolling survives minimize/restore cycle " + cycle);
    }
    const shellScroll = viewer.scrollTop;
    trustedPress(win, "f", { ctrlKey: true }); await pause(150);
    assert(viewer.scrollTop > shellScroll && !reader._iframeWindow.document.querySelector(".find-popup input"),
      "Ctrl-f with reader shell focus scrolls without opening native search");
    viewer.focus(); await pause(150);
    const beforeScroll = viewer.scrollTop;
    trustedPress(win, "j"); await pause(100);
    assert(viewer.scrollTop === beforeScroll + 40, "Trusted keyboard input scrolls the PDF reading area");
    viewer.scrollTop = beforeScroll;
    const firstPDFKey = pdfPress("j");
    assert(firstPDFKey.defaultPrevented, "PDF frame receives Vim bindings");
    assert(viewer.scrollTop === beforeScroll + 40, "j scrolls the real PDF viewport by 40 pixels");
    pdfPress("3"); pdfPress("j");
    assert(viewer.scrollTop === beforeScroll + 160, "3j scrolls the PDF viewport by another 120 pixels");
    pdfPress("g"); pdfPress("g"); await pause(150);
    assert(pdfApp.pdfViewer.currentPageNumber === 1, "gg navigates to the first PDF page");
    pdfPress("3"); pdfPress("G", { shiftKey: true }); await pause(200);
    assert(pdfApp.pdfViewer.currentPageNumber === 3, "3G navigates to the third physical PDF page");
    pdfPress(":"); pdfPress("4");
    const commandLine = reader._iframeWindow.document.getElementById("zotvim-reader-command");
    assert(commandLine && !commandLine.hidden && commandLine.textContent.startsWith(":4"),
      "Colon page entry displays a command line without moving focus");
    await pause(1100);
    assert(!commandLine.hidden, "Colon page entry survives the ordinary sequence timeout");
    pdfPress("Backspace"); pdfPress("2"); pdfPress("Enter"); await pause(150);
    assert(pdfApp.pdfViewer.currentPageNumber === 2 && commandLine.hidden,
      "Editing and submitting :2 navigates to physical page 2");
    pdfPress(":"); pdfPress("5"); pdfPress("Escape"); await pause(100);
    assert(pdfApp.pdfViewer.currentPageNumber === 2 && commandLine.hidden, "Escape cancels colon page entry without navigating");
    pdfPress("3"); pdfPress("G", { shiftKey: true }); await pause(150);
    pdfPress("J", { shiftKey: true }); await pause(150);
    assert(pdfApp.pdfViewer.currentPageNumber === 4, "J navigates to the next PDF page");
    pdfPress("G", { shiftKey: true }); await pause(150);
    assert(pdfApp.pdfViewer.currentPageNumber === 5, "G navigates to the last PDF page");
    pdfPress("g"); pdfPress("g"); await pause(150);
    const beforeHalfPage = viewer.scrollTop;
    pdfPress("d", { ctrlKey: true });
    assert(viewer.scrollTop > beforeHalfPage, "Ctrl-d scrolls half a PDF viewport");
    const beforeFullPage = viewer.scrollTop;
    pdfPress("f", { ctrlKey: true }); await pause(150);
    assert(viewer.scrollTop > beforeFullPage && !reader._iframeWindow.document.querySelector(".find-popup input"),
      "Ctrl-f scrolls a PDF viewport without opening Zotero's native search");
    const scale = pdfApp.pdfViewer.currentScale;
    pdfPress("+"); await pause(100);
    assert(pdfApp.pdfViewer.currentScale > scale, "+ zooms the real PDF viewer");
    pdfPress("/"); await pause(200);
    const searchInput = reader._iframeWindow.document.querySelector(".find-popup input");
    assert(searchInput && searchInput === reader._iframeWindow.document.activeElement, "/ opens and focuses the PDF search field");
    const typing = new reader._iframeWindow.KeyboardEvent("keydown", Components.utils.cloneInto(
      { key: "j", bubbles: true, cancelable: true }, reader._iframeWindow));
    searchInput.dispatchEvent(typing);
    assert(!Components.utils.unwaiveXrays(typing).defaultPrevented, "PDF search typing keeps ordinary keys");
    reader.toggleFindPopup(Components.utils.cloneInto({ open: false }, reader._iframeWindow));
    viewer.focus(); await pause(100);
    Services.prefs.setBoolPref("extensions.zotvim.enabled", false);
    assert(!pdfPress("j").defaultPrevented, "Navigation toggle also disables PDF bindings");
    Services.prefs.setBoolPref("extensions.zotvim.enabled", true);
    await addon.disable();
    assert(!pdfPress("j").defaultPrevented, "Disabling Zotvim removes PDF frame listeners");
    await addon.enable(); await pause(200);
    assert(pdfPress("k").defaultPrevented, "Re-enabling attaches to an already-open paper");
    pdfPress("g"); pdfPress("g"); await pause(150);
    const lateScroll = viewer.scrollTop;
    pdfPress("f", { ctrlKey: true }); await pause(150);
    assert(viewer.scrollTop > lateScroll && !reader._iframeWindow.document.querySelector(".find-popup input"),
      "Ctrl-f retains Vim behavior after enabling on an already-open paper");
    reader.toggleVerticalSplit(true);
    await until(() => {
      const secondary = reader._internalReader._secondaryView?._iframeWindow;
      return (secondary?.wrappedJSObject || secondary)?.PDFViewerApplication?.pdfViewer?.pagesCount === 5;
    }, "split PDF viewer");
    const secondaryWin = reader._internalReader._secondaryView._iframeWindow;
    const secondaryViewer = secondaryWin.document.getElementById("viewerContainer");
    secondaryViewer.focus(); await pause(150);
    const secondaryScroll = secondaryViewer.scrollTop;
    const splitKey = new secondaryWin.KeyboardEvent("keydown", Components.utils.cloneInto(
      { key: "j", bubbles: true, cancelable: true }, secondaryWin));
    secondaryViewer.dispatchEvent(splitKey);
    assert(secondaryViewer.scrollTop === secondaryScroll + 40, "New split views receive Vim scrolling");
    reader.toggleVerticalSplit(false); await pause(150);
    viewer.focus(); await pause(100);
    pdfPress("g"); pdfPress("Shift", { shiftKey: true }); pdfPress("T", { shiftKey: true });
    await pause(100);
    assert(win.Zotero_Tabs.selectedID === "zotero-pane", "gT from a PDF returns to the previous library tab");
    win.Zotero_Tabs.select(reader.tabID); await pause(100);
    viewer.focus(); await pause(100);
    pdfPress("g"); pdfPress("0"); await pause(100);
    assert(win.Zotero_Tabs.selectedID === "zotero-pane", "g0 returns from the PDF to the library");
    const standalone = await Zotero.Reader.open(attachment.id, null, { openInWindow: true });
    await until(() => {
      const standaloneWin = standalone._internalReader?._primaryView?._iframeWindow;
      return (standaloneWin?.wrappedJSObject || standaloneWin)?.PDFViewerApplication?.pdfViewer?.pagesCount === 5;
    }, "standalone PDF window");
    const standaloneWin = standalone._internalReader._primaryView._iframeWindow;
    const standaloneViewer = standaloneWin.document.getElementById("viewerContainer");
    standaloneViewer.focus(); await pause(150);
    const standaloneScroll = standaloneViewer.scrollTop;
    function standalonePress(key) {
      const event = new standaloneWin.KeyboardEvent("keydown", Components.utils.cloneInto(
        { key, bubbles: true, cancelable: true }, standaloneWin));
      standaloneWin.document.activeElement.dispatchEvent(event);
    }
    standalonePress("j");
    assert(standaloneViewer.scrollTop === standaloneScroll + 40, "Separate PDF windows receive Vim scrolling");
    win.Zotero_Tabs.select(reader.tabID); await pause(100);
    standaloneViewer.focus(); await pause(100);
    standalonePress("g"); standalonePress("0"); await pause(100);
    assert(win.Zotero_Tabs.selectedID === "zotero-pane", "g0 from a separate PDF window selects the main library");
    standalone._window.close(); await pause(150);
    win.Zotero_Tabs.select(reader.tabID); await pause(100);
    viewer.focus(); await pause(100);
    assert(pdfPress("j").defaultPrevented, "Closing a separate paper leaves the other reader working");
    await finish({ ok: true, zoteroVersion: Zotero.version, checks });
  }
  catch (error) {
    await finish({ ok: false, checks, error: String(error), stack: error.stack });
  }
}

run(testWindow);
