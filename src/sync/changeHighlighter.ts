import * as path from 'node:path'
import * as vscode from 'vscode'
import { config } from '../config'
import { getLogger } from '../logger'
import { normalizeFsPath } from '../synctex/inputs'
import { locateLine, type PdfPosition } from '../synctex/locator'
import type { SyncTexStore } from '../synctex/store'
import { changedLinesInNew, toRuns } from './lineDiff'
import { forwardSearch, isLatexDocument } from './latexWorkshop'

interface Snapshot {
  /** Source lines that produced the most recent build we have seen. */
  built: string[] | undefined
  /** Source lines as of the most recent save (what the next build will use). */
  saved: string[]
}

/**
 * After a rebuild, flashes the lines that changed since the previous build in
 * the PDF. The flash itself is LaTeX Workshop's "rectangle" SyncTeX indicator
 * (a translucent blue box fading out over a second); we only decide which
 * lines to point it at, using a diff of the saved sources and the local
 * SyncTeX parse to skip lines that have no box in the PDF.
 */
export class ChangeHighlighter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private readonly snapshots = new Map<string, Snapshot>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly store: SyncTexStore) {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.onSave(doc)),
      vscode.workspace.onDidCloseTextDocument((doc) =>
        this.snapshots.delete(normalizeFsPath(doc.uri.fsPath)),
      ),
      store.onDidChange((synctexPath) => this.onBuild(synctexPath)),
    )
    for (const doc of vscode.workspace.textDocuments) {
      if (isLatexDocument(doc)) this.onSave(doc)
    }
  }

  private onSave(doc: vscode.TextDocument): void {
    if (!isLatexDocument(doc)) return
    const key = normalizeFsPath(doc.uri.fsPath)
    const lines = doc.getText().split(/\r?\n/)
    const snap = this.snapshots.get(key)
    if (snap) snap.saved = lines
    else this.snapshots.set(key, { built: undefined, saved: lines })
  }

  private onBuild(synctexPath: string | undefined): void {
    if (!synctexPath) return
    // The watcher fires several times while the file is written; coalesce and
    // give LaTeX Workshop's viewer time to reload the new PDF first.
    const existing = this.timers.get(synctexPath)
    if (existing) clearTimeout(existing)
    this.timers.set(
      synctexPath,
      setTimeout(() => {
        this.timers.delete(synctexPath)
        void this.highlight(synctexPath)
      }, config.highlightChangesDelayMs),
    )
  }

  private async highlight(synctexPath: string): Promise<void> {
    const entry = this.store.load(synctexPath)
    if (!entry) return
    const log = getLogger()

    // Collect changed lines across every open input of this build, and move
    // every snapshot forward even when highlighting is disabled so that
    // turning it on later does not replay old edits.
    const targets: Array<{ doc: vscode.TextDocument; line: number; position: PdfPosition }> = []
    let firstBuild = false
    for (const doc of vscode.workspace.textDocuments) {
      if (!isLatexDocument(doc)) continue
      const key = normalizeFsPath(doc.uri.fsPath)
      const tag = entry.inputTags.get(key)
      if (tag === undefined) continue

      const snap = this.snapshots.get(key) ?? {
        built: undefined,
        saved: doc.getText().split(/\r?\n/),
      }
      this.snapshots.set(key, snap)
      const previous = snap.built
      snap.built = snap.saved
      if (!previous) {
        firstBuild = true
        continue
      }
      for (const line of changedLinesInNew(previous, snap.saved)) {
        const position = locateLine(entry.data, tag, line + 1)
        if (position && !position.approximate) targets.push({ doc, line, position })
      }
    }

    if (!config.highlightChangesEnabled) return
    if (targets.length === 0) {
      if (!firstBuild)
        log.debug(`Rebuild of ${path.basename(entry.pdfPath)}: no highlightable changes`)
      return
    }
    const active = vscode.window.activeTextEditor
    if (!isLatexDocument(active?.document)) {
      log.debug('Skipping change highlight: active editor is not a TeX document')
      return
    }

    const picked = dedupeByPosition(targets).slice(0, config.highlightChangesMaxLines)
    const byFile = new Map<string, number[]>()
    for (const t of picked) {
      const list = byFile.get(t.doc.fileName) ?? []
      list.push(t.line)
      byFile.set(t.doc.fileName, list)
    }
    const summary = [...byFile.entries()]
      .map(
        ([file, lines]) =>
          `${path.basename(file)}:${toRuns(lines)
            .map(([a, b]) => (a === b ? `${a + 1}` : `${a + 1}-${b + 1}`))
            .join(',')}`,
      )
      .join(' ')
    log.info(
      `Rebuild of ${path.basename(entry.pdfPath)}: highlighting ${picked.length} line(s) ${summary}`,
    )

    try {
      for (const t of picked) {
        await forwardSearch(t.line, t.doc.uri.fsPath)
      }
      if (!config.highlightChangesScrollToChange) {
        // Bring the viewer back to where the cursor is.
        await forwardSearch(active.selection.active.line, active.document.uri.fsPath)
      }
    } catch (err) {
      log.error(`Change highlight failed: ${String(err)}`)
    }
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    for (const d of this.disposables) d.dispose()
  }
}

/** Several source lines can map onto the same PDF box; flash it once. */
function dedupeByPosition<T extends { position: PdfPosition }>(targets: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const t of targets) {
    const key = `${t.position.page}:${t.position.y.toFixed(1)}:${t.position.x.toFixed(1)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
