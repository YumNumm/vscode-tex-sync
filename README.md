# TeX Sync

> **Note:** I have no intention of maintaining this extension. If it doesn't work for you, fork it and do whatever you like ♡

A VS Code extension that keeps the PDF in sync with your cursor while you write LaTeX.
It reads the SyncTeX "sourcemap" (`.synctex.gz`) produced by the TeX engine and drives
the PDF viewer of [LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop).

## Features

All three features can be switched on and off independently, from settings, the command palette,
or the status bar menu.

### Cursor follow (`texSync.follow.enabled`)

Every time the cursor moves in a TeX editor (debounced), the PDF viewer jumps to the
corresponding position — forward SyncTeX without pressing a key.

The extension parses the `.synctex(.gz)` file itself and uses it to avoid useless viewer
calls:

- lines without a SyncTeX record (preamble, comments, macros) don't trigger a jump,
- if the resolved PDF position is the same as last time, the viewer is left alone,
- cursor moves caused by typing are ignored by default, because the SyncTeX data is stale
  until the next build (`texSync.follow.syncWhileTyping`),
- selection changes made programmatically — including LaTeX Workshop's own inverse search
  (Ctrl/Cmd+click in the PDF) — are ignored by default, so there is no feedback loop
  (`texSync.follow.triggerKinds`).

### Auto-open PDF (`texSync.autoOpenPdf.enabled`)

When a TeX document becomes active and its PDF exists, the PDF is opened in LaTeX
Workshop's viewer in the editor group beside it. Each PDF is opened at most once per
session, so a viewer tab you closed stays closed. Use **TeX Sync: Open PDF Beside** to
open it again explicitly.

### Highlight changes after build (`texSync.highlightChanges.enabled`)

When the `.synctex.gz` is rewritten by a build, the lines that changed since the previous
build are flashed in the PDF: a translucent blue box over each changed line that fades out
in about a second. The flash is LaTeX Workshop's "rectangle" SyncTeX indicator, so
`latex-workshop.synctex.indicator` must be left at its default `rectangle`.

- The diff is taken between the sources of the previous build and this one (snapshots are
  taken on save), so only inserted or modified lines are flashed; deletions have nothing to
  point at.
- Lines without a SyncTeX record (preamble, macro definitions, Lua code) are skipped.
- At most `texSync.highlightChanges.maxLines` lines are flashed. The viewer ends up at the
  last changed location; set `texSync.highlightChanges.scrollToChange` to `false` to return
  it to the cursor position instead.
- The first build seen in a session only records a snapshot and flashes nothing.

### Status bar

`$(eye) TeX Sync p.3` shows the page the cursor maps to. Click it for a menu with the two
toggles, "sync now", "open PDF beside", "reload SyncTeX data", the log and the settings.

## Requirements

- [LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop)
  (declared as an extension dependency; it owns building and the PDF viewer).
- Build with SyncTeX enabled (`-synctex=1`, which LaTeX Workshop's default recipes do).

This extension does not build your document. It only reads the `.synctex(.gz)` and `.pdf`
produced by your existing workflow and watches them for changes.

## Commands

| Command                            | Description                                                 |
| ---------------------------------- | ----------------------------------------------------------- |
| `TeX Sync: Toggle Cursor Follow`   | Turn automatic forward search on/off                        |
| `TeX Sync: Toggle Auto-open PDF`   | Turn opening the PDF beside TeX files on/off                |
| `TeX Sync: Sync PDF to Cursor Now` | One-shot forward search, ignoring de-duplication            |
| `TeX Sync: Open PDF Beside`        | Open the PDF for the active document in the group beside it |
| `TeX Sync: Reload SyncTeX Data`    | Drop the parsed cache and re-read the files                 |
| `TeX Sync: Show Menu` / `Show Log` | Status bar menu / output channel                            |

## Settings

| Setting                                | Default                | Description                                                                  |
| -------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `texSync.follow.enabled`               | `true`                 | Automatic forward search on cursor move                                      |
| `texSync.follow.debounceMs`            | `150`                  | Delay after the last cursor move                                             |
| `texSync.follow.triggerKinds`          | `["keyboard","mouse"]` | Which selection changes trigger a sync (`command`, `programmatic` available) |
| `texSync.follow.syncWhileTyping`       | `false`                | Also sync on cursor moves caused by edits                                    |
| `texSync.follow.skipUnchangedPosition` | `true`                 | Skip the viewer call when the resolved position is unchanged                 |
| `texSync.follow.positionTolerance`     | `2`                    | Vertical tolerance (PDF points) for "unchanged"                              |
| `texSync.autoOpenPdf.enabled`          | `true`                 | Open the PDF beside TeX documents                                            |
| `texSync.autoOpenPdf.delayMs`          | `300`                  | Delay before auto-opening                                                    |
| `texSync.statusBar.enabled`            | `true`                 | Show the status bar item                                                     |
| `texSync.synctex.include`              | `**/*.synctex{,.gz}`   | Glob to discover SyncTeX files                                               |
| `texSync.synctex.exclude`              | `**/node_modules/**`   | Glob to ignore                                                               |

## How it works

1. SyncTeX files are discovered in the workspace (and next to the open document) and parsed
   into a `(file, line) → (page, x, y)` table. Input paths are resolved against the SyncTeX
   directory and its parents, so `-outdir` builds work too.
2. On cursor move, the current line is looked up (nearest mapped line wins; ties go to the
   following line).
3. If the target is new, `latex-workshop.synctexto` is invoked with the line and file, and
   LaTeX Workshop moves its viewer.
4. A file watcher invalidates the cache whenever the `.synctex(.gz)` is rebuilt.

## Development

Tooling: [mise](https://mise.jdx.dev) (Node LTS + pnpm) and [Vite+](https://viteplus.dev)
(`vp pack` → tsdown bundle, `vp test` → Vitest, `vp check` → Oxfmt + Oxlint + type check).

```sh
mise install
pnpm install
pnpm run build      # bundle to dist/extension.cjs
pnpm run test       # unit tests (parser, locator, input resolution)
pnpm run check      # format + lint + types
pnpm run package    # build a .vsix
```

Press <kbd>F5</kbd> in VS Code to launch the Extension Development Host.

The parser tests run against `test/fixtures/sample/main.synctex(.gz)`, generated with
`latexmk -pdf -synctex=1` from the `.tex` files in the same directory.

## License

MIT
