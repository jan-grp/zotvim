# Zotvim

Vim-style keys for Zotero's library and PDF reader. Zotvim runs inside Zotero;
Neovim is not required. There is no insert mode. Search fields, notes, metadata,
and annotation editors keep ordinary typing.

## Install

Get an `.xpi` from a published release, or build one with Node.js 20+ and Python 3:

```sh
npm run build
```

In Zotero, open Tools → Plugins, choose Install Plugin From File… in the gear
menu, and select `dist/zotvim-0.3.0.xpi`. Install newer versions the same way.
Updates are manual.

Click an item list, collection tree, or PDF to use the keys. Press `?` for help.
Tools → Enable Zotvim navigation turns the bindings on or off.

## Common keys

| Key | Library | PDF |
| --- | --- | --- |
| `j` / `k` | Next / previous row | Scroll down / up |
| `h` / `l` | Collapse / expand a row | Scroll left / right |
| `J` / `K` | Extend selection down / up | Next / previous page |
| `gg` / `G` | First / last row | First / last page |
| `5G` | Go to row 5 | Go to page 5 |
| `Ctrl-d` / `Ctrl-u` | Half a pane down / up | Half a viewport down / up |
| `Ctrl-f` / `Ctrl-b` | Page Down / Page Up | Full viewport down / up |
| `/` | Library search | Search this paper |
| `gt` / `gT` | Next / previous tab | Next / previous tab |

Counts work with movement: `5j` moves five rows or scrolls five steps. `H` and
`L` focus collections and items. In PDFs, `n` / `N` move between search matches,
`+` / `-` / `=` change zoom, and `g0` returns to the library.

Type `:12` then Enter to go to PDF page 12. Backspace edits the number; Escape
cancels. Pages are numbered from 1, regardless of printed labels.

See the [full key reference](docs/keys.md) for all bindings. PDF keys also work
in split panes and separate reader windows; tab switching requires the main window.

## Compatibility

Requires Zotero 8 or newer. Tested on Zotero 9.0.6 on Linux; Zotero 8, macOS,
and Windows have not been runtime-tested. EPUB and HTML readers use Zotero's
own keys. PDF integration uses internal reader APIs that may change between
Zotero versions. See [validation details](docs/validation.md).

## Development

No dependencies need installing. Use Node.js 20+ and Python 3:

```sh
npm test
npm run check
npm run build
```

The XPI is written to `dist/`. GitHub Actions runs the checks and packages the
plugin. Pushing a version tag such as `v0.3.0` publishes the tested XPI as a
GitHub release.

[Contributing](CONTRIBUTING.md) covers testing and bug reports.
[Development notes](docs/development.md) cover the source layout and releases.

## License

[MIT](LICENSE).
