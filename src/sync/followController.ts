import * as vscode from 'vscode'
import { config, type TriggerKind } from '../config'
import { getLogger } from '../logger'
import { isSamePosition, locateLine, type PdfPosition } from '../synctex/locator'
import type { SyncTexStore } from '../synctex/store'
import { forwardSearch, isLatexDocument } from './latexWorkshop'

export type FollowState =
  | { kind: 'disabled' }
  | { kind: 'idle' }
  | { kind: 'no-synctex' }
  | { kind: 'no-record' }
  | { kind: 'synced'; position: PdfPosition; pdfPath: string; skipped: boolean }

/** Milliseconds after a content change during which a selection change is treated as typing. */
const TYPING_WINDOW_MS = 80

function kindOf(k: vscode.TextEditorSelectionChangeKind | undefined): TriggerKind {
  switch (k) {
    case vscode.TextEditorSelectionChangeKind.Keyboard:
      return 'keyboard'
    case vscode.TextEditorSelectionChangeKind.Mouse:
      return 'mouse'
    case vscode.TextEditorSelectionChangeKind.Command:
      return 'command'
    default:
      return 'programmatic'
  }
}

/**
 * Watches the cursor in LaTeX editors and asks LaTeX Workshop to move the PDF
 * viewer accordingly. The local SyncTeX parse is used to decide *whether* a
 * call is worthwhile: no data, no record for the line, or an unchanged target
 * position all short-circuit before touching the viewer.
 */
export class FollowController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private readonly stateEmitter = new vscode.EventEmitter<FollowState>()
  readonly onDidChangeState = this.stateEmitter.event

  private timer: ReturnType<typeof setTimeout> | undefined
  private lastEditAt = new Map<string, number>()
  private last: { pdfPath: string; position: PdfPosition } | undefined
  private _state: FollowState = { kind: 'idle' }

  constructor(private readonly store: SyncTexStore) {
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => this.onSelection(e)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length > 0) this.lastEditAt.set(e.document.uri.toString(), Date.now())
      }),
      vscode.workspace.onDidCloseTextDocument((d) => this.lastEditAt.delete(d.uri.toString())),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('texSync.follow.enabled')) this.publishEnabledState()
      }),
      store.onDidChange(() => {
        // Fresh build: the old target is meaningless for de-duplication.
        this.last = undefined
      }),
    )
    this.publishEnabledState()
  }

  get state(): FollowState {
    return this._state
  }

  private setState(s: FollowState): void {
    this._state = s
    this.stateEmitter.fire(s)
  }

  private publishEnabledState(): void {
    this.setState(config.followEnabled ? { kind: 'idle' } : { kind: 'disabled' })
  }

  private onSelection(e: vscode.TextEditorSelectionChangeEvent): void {
    if (!config.followEnabled) return
    const editor = e.textEditor
    if (!isLatexDocument(editor.document)) return
    if (editor !== vscode.window.activeTextEditor) return

    const kind = kindOf(e.kind)
    if (!config.followTriggerKinds.has(kind)) return

    if (!config.syncWhileTyping) {
      const editedAt = this.lastEditAt.get(editor.document.uri.toString())
      if (editedAt !== undefined && Date.now() - editedAt < TYPING_WINDOW_MS) return
    }

    const line = e.selections[0]?.active.line
    if (line === undefined) return

    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.sync(editor, line, { force: false })
    }, config.followDebounceMs)
  }

  /** Sync the given (or active) editor's cursor line to the PDF. `force` bypasses de-duplication. */
  async sync(
    editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor,
    line: number | undefined = editor?.selection.active.line,
    { force }: { force: boolean } = { force: true },
  ): Promise<void> {
    if (!editor || line === undefined || !isLatexDocument(editor.document)) return
    const log = getLogger()

    const resolved = await this.store.resolveDocument(editor.document)
    if (!resolved) {
      this.setState({ kind: 'no-synctex' })
      log.debug(`No SyncTeX data covers ${editor.document.fileName}`)
      return
    }
    const { entry, tag } = resolved
    const position = locateLine(entry.data, tag, line + 1)
    if (!position) {
      this.setState({ kind: 'no-record' })
      log.debug(`No SyncTeX record for ${editor.document.fileName}:${line + 1}`)
      return
    }

    if (
      !force &&
      config.skipUnchangedPosition &&
      this.last &&
      this.last.pdfPath === entry.pdfPath &&
      isSamePosition(this.last.position, position, config.positionTolerance)
    ) {
      this.setState({ kind: 'synced', position, pdfPath: entry.pdfPath, skipped: true })
      return
    }

    this.last = { pdfPath: entry.pdfPath, position }
    this.setState({ kind: 'synced', position, pdfPath: entry.pdfPath, skipped: false })
    log.debug(
      `Forward search ${editor.document.fileName}:${line + 1} -> p.${position.page} (${position.x.toFixed(1)}, ${position.y.toFixed(1)})${position.approximate ? ` via line ${position.line}` : ''}`,
    )
    try {
      await forwardSearch(line, editor.document.uri.fsPath)
    } catch (err) {
      log.error(`Forward search failed: ${String(err)}`)
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.stateEmitter.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
