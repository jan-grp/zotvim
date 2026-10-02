# Contributing

Use Node.js 20+ and Python 3. The project has no external dependencies.

```sh
npm test
npm run check
npm run build
```

Describe what changes and how you checked it in the pull request. Add regression
tests for changes to key sequences, focus handling, popup state, or reader
lifecycle. Update [the key reference](docs/keys.md) and in-app help when changing
bindings.

For UI changes, install the built XPI in Zotero and check the affected controls.
Include ordinary typing in search and annotation editors, window restoration,
and disabling/re-enabling the plugin where relevant. The Node tests use mocks;
they cannot establish compatibility with a Zotero release.

The Linux runtime test uses an unpacked Zotero installation:

```sh
python3 scripts/smoke-zotero.py --zotero /opt/zotero
```

It creates a temporary runtime, profile, library, and five-page PDF. The installed
application and existing profiles are unchanged. Results and logs remain in the
printed temporary directory.

For bug reports, include Zotero and Zotvim versions, operating system, steps to
reproduce, expected behavior, and actual behavior. State whether the problem is
in the library, a reader tab, a split pane, or a separate reader window.

See [development notes](docs/development.md) for packaging and release steps.
