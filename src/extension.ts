import * as vscode from 'vscode'
import { config, toggleBooleanSetting } from './config'
import { disposeLogger, getLogger } from './logger'
import { SyncTexStore } from './synctex/store'
import { AutoOpenPdf } from './sync/autoOpenPdf'
import { ChangeHighlighter } from './sync/changeHighlighter'
import { FollowController } from './sync/followController'
import { isLatexDocument } from './sync/latexWorkshop'
import { StatusBar } from './ui/statusBar'

export function activate(context: vscode.ExtensionContext): void {
  const log = getLogger()
  log.info('TeX Sync activated')

  const store = new SyncTexStore()
  const follow = new FollowController(store)
  const autoOpen = new AutoOpenPdf(store)
  const highlighter = new ChangeHighlighter(store)
  const statusBar = new StatusBar(follow)

  const toggle = async (key: string, label: string, fallback: boolean) => {
    const next = await toggleBooleanSetting(key, fallback)
    vscode.window.setStatusBarMessage(`TeX Sync: ${label} ${next ? 'on' : 'off'}`, 2500)
  }

  context.subscriptions.push(
    store,
    follow,
    autoOpen,
    highlighter,
    statusBar,
    { dispose: disposeLogger },

    vscode.commands.registerCommand('texSync.toggleFollow', () =>
      toggle('follow.enabled', 'cursor follow', true),
    ),
    vscode.commands.registerCommand('texSync.toggleAutoOpenPdf', () =>
      toggle('autoOpenPdf.enabled', 'auto-open PDF', true),
    ),
    vscode.commands.registerCommand('texSync.toggleHighlightChanges', () =>
      toggle('highlightChanges.enabled', 'highlight changes after build', true),
    ),
    vscode.commands.registerCommand('texSync.syncNow', () => follow.sync()),
    vscode.commands.registerCommand('texSync.openPdf', () => {
      const doc = vscode.window.activeTextEditor?.document
      if (!isLatexDocument(doc)) {
        void vscode.window.showInformationMessage('TeX Sync: open a TeX document first.')
        return
      }
      return autoOpen.open(doc, { manual: true })
    }),
    vscode.commands.registerCommand('texSync.reload', () => {
      store.reload()
      vscode.window.setStatusBarMessage('TeX Sync: SyncTeX data reloaded', 2500)
    }),
    vscode.commands.registerCommand('texSync.showLog', () => log.show()),
    vscode.commands.registerCommand('texSync.showMenu', () => showMenu()),
  )
}

async function showMenu(): Promise<void> {
  type Item = vscode.QuickPickItem & { run: () => Thenable<unknown> | void }
  const items: Item[] = [
    {
      label: `$(${config.followEnabled ? 'check' : 'circle-large-outline'}) Cursor follow`,
      description: config.followEnabled ? 'on' : 'off',
      detail: 'Move the PDF viewer as the cursor moves (forward SyncTeX).',
      run: () => vscode.commands.executeCommand('texSync.toggleFollow'),
    },
    {
      label: `$(${config.autoOpenPdfEnabled ? 'check' : 'circle-large-outline'}) Auto-open PDF beside TeX`,
      description: config.autoOpenPdfEnabled ? 'on' : 'off',
      detail: 'Open the PDF in the group beside the editor when a TeX file becomes active.',
      run: () => vscode.commands.executeCommand('texSync.toggleAutoOpenPdf'),
    },
    {
      label: `$(${config.highlightChangesEnabled ? 'check' : 'circle-large-outline'}) Highlight changes after build`,
      description: config.highlightChangesEnabled ? 'on' : 'off',
      detail:
        'Flash the lines changed since the previous build in the PDF when a rebuild finishes.',
      run: () => vscode.commands.executeCommand('texSync.toggleHighlightChanges'),
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator, run: () => undefined },
    {
      label: '$(go-to-file) Sync PDF to cursor now',
      run: () => vscode.commands.executeCommand('texSync.syncNow'),
    },
    {
      label: '$(open-preview) Open PDF beside',
      run: () => vscode.commands.executeCommand('texSync.openPdf'),
    },
    {
      label: '$(refresh) Reload SyncTeX data',
      run: () => vscode.commands.executeCommand('texSync.reload'),
    },
    {
      label: '$(output) Show log',
      run: () => vscode.commands.executeCommand('texSync.showLog'),
    },
    {
      label: '$(settings-gear) Open settings',
      run: () =>
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:YumNumm.tex-sync'),
    },
  ]
  const picked = await vscode.window.showQuickPick(items, { title: 'TeX Sync' })
  await picked?.run()
}

export function deactivate(): void {
  /* all resources are disposed through context.subscriptions */
}
