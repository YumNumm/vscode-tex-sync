import * as path from 'node:path'
import * as vscode from 'vscode'
import { config } from '../config'
import type { FollowController, FollowState } from '../sync/followController'
import { isLatexDocument } from '../sync/latexWorkshop'

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem
  private readonly disposables: vscode.Disposable[] = []

  constructor(private readonly follow: FollowController) {
    this.item = vscode.window.createStatusBarItem(
      'texSync.status',
      vscode.StatusBarAlignment.Right,
      90,
    )
    this.item.name = 'TeX Sync'
    this.item.command = 'texSync.showMenu'
    this.disposables.push(
      this.item,
      follow.onDidChangeState((s) => this.render(s)),
      vscode.window.onDidChangeActiveTextEditor(() => this.render(follow.state)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('texSync')) this.render(follow.state)
      }),
    )
    this.render(follow.state)
  }

  private render(state: FollowState): void {
    if (!config.statusBarEnabled || !isLatexDocument(vscode.window.activeTextEditor?.document)) {
      this.item.hide()
      return
    }
    const follow = config.followEnabled
    const autoOpen = config.autoOpenPdfEnabled
    const lines: string[] = [
      `Cursor follow: **${follow ? 'on' : 'off'}**`,
      `Auto-open PDF: **${autoOpen ? 'on' : 'off'}**`,
      `Highlight changes after build: **${config.highlightChangesEnabled ? 'on' : 'off'}**`,
    ]

    let text: string
    switch (state.kind) {
      case 'disabled':
        text = '$(eye-closed) TeX Sync'
        break
      case 'no-synctex':
        text = '$(eye) TeX Sync $(warning)'
        lines.push('No SyncTeX file found. Build with `-synctex=1`.')
        break
      case 'no-record':
        text = '$(eye) TeX Sync —'
        lines.push('The current line has no SyncTeX record.')
        break
      case 'synced':
        text = `$(eye) TeX Sync p.${state.position.page}`
        lines.push(`${path.basename(state.pdfPath)} · page ${state.position.page}`)
        if (state.position.approximate) lines.push(`Nearest mapped line: ${state.position.line}`)
        break
      default:
        text = follow ? '$(eye) TeX Sync' : '$(eye-closed) TeX Sync'
    }
    this.item.text = text
    const md = new vscode.MarkdownString(lines.join('\n\n'))
    md.appendMarkdown('\n\nClick for options.')
    this.item.tooltip = md
    this.item.show()
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
