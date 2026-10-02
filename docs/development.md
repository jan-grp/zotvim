# Development notes

## Source layout

| Path | Purpose |
| --- | --- |
| `addon/` | Files installed in Zotero |
| `addon/keys.js` | Key decoding, counts, sequences, and page command entry |
| `addon/window.js` | Library focus and native tree navigation |
| `addon/reader.js` | PDF frames, commands, and lifecycle |
| `addon/popups.js` | Current XUL menu and panel state |
| `addon/bootstrap.js` | Plugin lifecycle, preferences, menus, and help |
| `tests/` | Node tests and Zotero runtime test driver |
| `scripts/` | Syntax checks, XPI packaging, and runtime test launcher |

The addon uses plain scripts loaded into a shared bootstrap scope. The same
scripts run in Node VM contexts for unit tests. Packaging needs no bundler.

## Build and test

Run `npm test`, `npm run check`, and `npm run build` before submitting changes.
The build takes the version from `addon/manifest.json`, requires it to match
`package.json`, and writes `dist/zotvim-<version>.xpi`. ZIP entries have fixed
timestamps and permissions so identical sources produce identical packages.
Generated packages are excluded from Git.

To test the XPI in Zotero on Linux:

```sh
python3 scripts/smoke-zotero.py --zotero /opt/zotero
```

This test uses a disposable profile and runtime. It injects a driver into a copy
of Zotero's app entry script, then installs the actual XPI through AddonManager.
It exercises library and PDF controls, window restoration, command entry, and
addon disable/re-enable. See [recorded validation](validation.md) for coverage
and limits. CI runs the Node checks and packaging; the Zotero runtime test is
run separately.

## Preferences

These settings are available in Zotero's Config Editor:

| Preference | Default | Meaning |
| --- | --- | --- |
| `extensions.zotvim.enabled` | `true` | Enable library and PDF bindings |
| `extensions.zotvim.sequenceTimeout` | `1000` | Sequence timeout in milliseconds, limited to 200–10000 |

Colon page commands wait for Enter or Escape and have no sequence timeout.

## Releases

1. Update the version in `package.json` and `addon/manifest.json`.
2. Add the changes to `CHANGELOG.md` and update the README's XPI filename.
3. Run the checks, build, and Zotero runtime test. Record the result in
   `docs/validation.md` and `docs/zotero-smoke.json`.
4. Commit and push the changes, then push the matching version tag:

   ```sh
   git tag v0.3.0
   git push origin v0.3.0
   ```

The workflow rejects tags that differ from the package version. After the test
matrix passes, it publishes the packaged XPI with generated release notes.
GitHub Actions needs permission to write repository contents for that release
job. Builds and pull requests use read-only permissions.

Plugin updates are manual. Zotero requires an update URL; the manifest uses
`example.invalid` until an update service is configured. Creating a GitHub
release does not enable automatic updates. Keep the plugin ID unchanged when
releasing upgrades.

Zotero references: [Zotero 8 for Developers](https://www.zotero.org/support/dev/zotero_8_for_developers)
and [plugin lifecycle and reader events](https://www.zotero.org/support/dev/zotero_7_for_developers).
