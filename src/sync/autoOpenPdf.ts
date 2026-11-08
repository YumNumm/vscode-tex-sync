import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { config } from '../config'
import { getLogger } from '../logger'
import type { SyncTexStore } from '../synctex/store'
import { isLatexDocument, isPdfTabOpen, openPdfBeside } from './latexWorkshop'

/**
 * Opens the PDF beside a TeX document when it becomes active.
 *
 * Each PDF is auto-opened at most once per session, so a viewer tab the user
 * deliberately closed stays closed until they switch to a different project
 * or run "Open PDF Beside" explicitly.
 */
export class AutoOpenPdf implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []
  private readonly openedThisSession = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly store: SyncTexStore) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => this.schedule(editor)),
    )
    this.schedule(vscode.window.activeTextEditor)
  }

  private schedule(editor: vscode.TextEditor | undefined): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (!config.autoOpenPdfEnabled || !isLatexDocument(editor?.document)) return
    const doc = editor.document
    this.timer = setTimeout(() => {
      this.timer = undefined
      // Still the active document after the delay?
      if (vscode.window.activeTextEditor?.document !== doc) return
      void this.open(doc, { manual: false })
    }, config.autoOpenPdfDelayMs)
  }

  /** Resolve the PDF for `doc` and open it beside the editor. */
  async open(doc: vscode.TextDocument, { manual }: { manual: boolean }): Promise<void> {
    const pdfPath = await this.findPdf(doc)
    if (!pdfPath) {
      if (manual) {
        void vscode.window.showInformationMessage(
          'TeX Sync: no PDF found for this document. Build it with LaTeX Workshop first.',
        )
      }
      return
    }
    const key = pdfPath.toLowerCase()
    if (!manual && this.openedThisSession.has(key)) return
    if (isPdfTabOpen(pdfPath)) {
      this.openedThisSession.add(key)
      return
    }
    this.openedThisSession.add(key)
    getLogger().info(`Opening PDF beside editor: ${pdfPath}`)
    try {
      await openPdfBeside(pdfPath)
    } catch (err) {
      getLogger().error(`Failed to open PDF: ${String(err)}`)
    }
  }

  private async findPdf(doc: vscode.TextDocument): Promise<string | undefined> {
    const resolved = await this.store.resolveDocument(doc)
    if (resolved && fs.existsSync(resolved.entry.pdfPath)) return resolved.entry.pdfPath
    // Single-file fallback: main.tex -> main.pdf next to it.
    const sibling = doc.uri.fsPath.replace(/\.[^./\\]+$/, '.pdf')
    if (sibling !== doc.uri.fsPath && fs.existsSync(sibling)) return sibling
    getLogger().debug(`No PDF found for ${path.basename(doc.uri.fsPath)}`)
    return undefined
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    for (const d of this.disposables) d.dispose()
  }
}
