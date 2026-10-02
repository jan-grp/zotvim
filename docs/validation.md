# Validation

Validated on 2026-10-02 with Node.js 22.23.2 and Zotero 9.0.6 on Linux.

Version 0.3.0.

`npm test` exercises 35 tests covering key decoding, library event handling,
PDF scrolling and physical page navigation, input protection, frame lifecycle,
restoration of native reader keyboard handlers, cancelled/closed popups,
reader-shell focus routing to the last active PDF pane, and colon page commands.
`npm run check` checks addon script syntax and manifest requirements.
`npm run build` packages the extension without external dependencies.

`python3 scripts/smoke-zotero.py --zotero /opt/zotero` passed 59 checks against
the packaged XPI in a real Zotero process with a disposable profile:

- XPI installation and activation.
- Fluent localization registration.
- First/last-row jumps and numbered jumps.
- Counted movement in Zotero's actual React trees.
- Extended selection with `J`.
- Sequences with intervening modifier keydowns.
- Search focus and ordinary typing in search.
- Switching between item and collection trees.
- Collapsing and expanding a collection.
- Entering a collection's items with `o`.
- Tools-menu registration through Zotero MenuManager.
- Disabling navigation via preferences.
- Disabling the plugin removes its UI and localization resource.
- Re-enabling the plugin restores its UI.
- PDF scrolling with `j` and counts, physical page jumps, and `J`.
- Half-viewport and full-viewport scrolling.
- `Ctrl-f` overrides native search both in a new paper and after re-enabling
  the plugin with a paper already open.
- PDF zoom and search focus; ordinary typing in the search field.
- Navigation toggle, addon disable, and re-enable inside an open paper.
- New split panes and separate PDF windows receive bindings.
- Tab switching and returning to the library from either kind of PDF window.
- Closing a separate paper leaves the other reader working.
- Trusted Gecko keyboard input in both the library and paper viewer.
- Three minimize/restore cycles each in the library and PDF reader.
- A native tooltip cancelled by Zotero no longer permanently blocks library
  or PDF bindings.
- Zotero's ordinary reader focus accepts PDF keys without explicitly focusing
  the inner viewport; `Ctrl-f` also works from the reader shell.
- Colon page entry shows a prompt, survives the ordinary sequence timeout,
  accepts Backspace corrections, navigates on Enter, and cancels on Escape.

The test creates a collection, a nested collection, and twelve books in a
temporary data directory, plus a generated five-page PDF. It installs the XPI
via AddonManager and dispatches events to Zotero's library and PDF controls.
A driver is injected into a disposable
copy of the app entry script; the installed application and existing profiles
are unchanged. The extension itself is loaded normally from its packaged XPI.

The run was headless, so this verifies behavior rather than visual layout.
Window minimize/restore methods were exercised, but desktop window-manager
and compositor behavior still needs manual verification on the user's system.
Automated coverage includes an actual PDF reader session but excludes manual
testing on macOS/Windows. Zotero 8's documented lifecycle and MenuManager APIs
are used, but Zotero 8 itself was not installed for a separate runtime test.
Future versions remain installable and will need testing when their APIs change.

Reader discovery uses Zotero's `renderToolbar` lifecycle event and the existing
reader list. PDF commands delegate to reader methods or scroll the PDF viewport.
Overriding shortcuts in an already-open PDF also requires the reader's private
keyboard-manager callback; the wrapper is restored on shutdown and leaves
unmapped keys to Zotero. Changes to these internal reader interfaces may require
an update. The regression test exercises this path in Zotero 9.0.6.

The successful run's result is saved in [zotero-smoke.json](zotero-smoke.json).

The 0.2.0 failure was reproduced by opening Zotero's empty dynamic tooltip.
Zotero cancels `popupshowing` and never emits `popuphidden`; Zotvim's original
popup set retained the closed tooltip forever, disabling navigation even after
refocusing a list. Library and PDF handlers now share a popup guard that ignores
tooltips and checks actual menu/panel state before blocking keys. Regression
tests also cover a menu dismissed without a hidden event.

A second failing runtime check used Zotero's ordinary `reader.focus()` followed
by trusted keyboard input. Focus remained on the reader-shell body, which the
original PDF handler excluded. Neutral shell focus now routes commands to the
last active PDF pane. A chrome-window capture listener intercepts shell keys
before Zotero's native reader shortcuts; text inputs and sidebar/toolbar controls
remain outside that fallback.

The original tests explicitly focused the inner PDF viewport and always paired
popup showing/hidden events. Testing native cancelled popups and normal focus
entry paths would have caught both failures before packaging 0.2.0.
