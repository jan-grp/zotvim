# Key reference

## Library

| Key | Action |
| --- | --- |
| `j` / `k` | Next / previous row |
| `J` / `K` | Extend selection down / up, where Zotero supports multiple selection |
| `h` / `l` | Collapse / expand a row, or move to its parent / child |
| `gg` / `G` / `0` | First / last / first row |
| `5j`, `5k` | Move five rows; counts up to 1000 |
| `5gg`, `5G` | Go to the fifth row (row numbers start at 1) |
| `Ctrl-d` / `Ctrl-u` | Move approximately half the visible pane down / up |
| `Ctrl-f` / `Ctrl-b` | Zotero's native Page Down / Page Up |
| `H`, `gh`, `Ctrl-w h` | Focus the collection tree |
| `L`, `gl`, `Ctrl-w l` | Focus the item list |
| `Ctrl-w w` | Switch between the collection tree and item list |
| `/` | Focus the library's quick search and select its current text |
| `o` in items | Open selected items using Zotero's normal attachment/note/link behavior |
| `o` in collections | Focus that collection's items |
| `zo` / `zc` / `za` | Expand / collapse / toggle the selected row |
| `gt` / `gT` | Switch to the next / previous Zotero tab from a library tree |
| `Escape` | Cancel a count or unfinished sequence |
| `?` | Show the shortcut reference |

`Ctrl-w h` means press Control and `w`, release them, then press `h`.
Sequences expire after one second. Pane switching requires the destination pane
to be visible; use Zotero's View menu if it is collapsed.

Search keeps Zotero's normal keys: **Enter** runs a search, **Escape** clears
the query, and **Escape** again returns focus to the item list.

## PDF viewer keys

| Key | Action |
| --- | --- |
| `j` / `k` / `h` / `l` | Scroll down / up / left / right by 40 pixels |
| `5j`, `5k`, `5h`, `5l` | Scroll with a count |
| `Ctrl-d` / `Ctrl-u` | Scroll half a viewport down / up |
| `Ctrl-f` / `Ctrl-b` | Scroll a full viewport down / up |
| `J` / `K` | Next / previous physical page; counts supported |
| `gg` / `G` | First / last physical page |
| `5G`, `5gg` | Go to physical page 5, regardless of printed page labels |
| `:5` then `Enter` | Go directly to physical page 5 using the on-screen page command |
| `0` | Scroll to the left edge |
| `/` | Open the paper's search field and type normally |
| `n` / `N` | Next / previous search match |
| `+` / `-` / `=` | Zoom in / out / reset |
| `gt` / `gT` | Next / previous Zotero tab (in the main window) |
| `g0` | Return to the library in the main window |
| `Escape` | Cancel an unfinished sequence; otherwise Zotero's normal Escape |
| `?` | Show shortcut help |

Click or focus the PDF's reading area to use the bindings. They also attach to
new split panes and separate PDF windows. `gt`/`gT` require a reader tab in the
main window; `g0` returns to an existing main window from either kind of viewer.
Search fields and annotation comment/text editors keep ordinary typing. Use
Zotero's normal Escape to close search and return focus to the paper.

To jump to a page, type `:` followed by its number and press **Enter**. For
example, `:12` then Enter opens physical page 12. The first PDF page is page 1;
printed page labels do not change the numbering. **Backspace** edits the number,
and **Escape** cancels. The command stays visible until submitted or cancelled,
without the ordinary sequence timeout. Moving focus or disabling Zotvim cancels
it too. A number beyond the paper's length goes to the last page; empty input or
zero does not navigate. Text fields still accept `:` normally.
