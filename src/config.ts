import * as vscode from 'vscode'

export type TriggerKind = 'keyboard' | 'mouse' | 'command' | 'programmatic'

const SECTION = 'texSync'

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION)
}

export const config = {
  get followEnabled(): boolean {
    return cfg().get<boolean>('follow.enabled', true)
  },
  get followDebounceMs(): number {
    return Math.max(0, cfg().get<number>('follow.debounceMs', 150))
  },
  get followTriggerKinds(): ReadonlySet<TriggerKind> {
    return new Set(cfg().get<TriggerKind[]>('follow.triggerKinds', ['keyboard', 'mouse']))
  },
  get syncWhileTyping(): boolean {
    return cfg().get<boolean>('follow.syncWhileTyping', false)
  },
  get skipUnchangedPosition(): boolean {
    return cfg().get<boolean>('follow.skipUnchangedPosition', true)
  },
  get positionTolerance(): number {
    return Math.max(0, cfg().get<number>('follow.positionTolerance', 2))
  },
  get autoOpenPdfEnabled(): boolean {
    return cfg().get<boolean>('autoOpenPdf.enabled', true)
  },
  get autoOpenPdfDelayMs(): number {
    return Math.max(0, cfg().get<number>('autoOpenPdf.delayMs', 300))
  },
  get highlightChangesEnabled(): boolean {
    return cfg().get<boolean>('highlightChanges.enabled', true)
  },
  get highlightChangesMaxLines(): number {
    return Math.max(1, cfg().get<number>('highlightChanges.maxLines', 20))
  },
  get highlightChangesDelayMs(): number {
    return Math.max(0, cfg().get<number>('highlightChanges.delayMs', 800))
  },
  get highlightChangesScrollToChange(): boolean {
    return cfg().get<boolean>('highlightChanges.scrollToChange', true)
  },
  get statusBarEnabled(): boolean {
    return cfg().get<boolean>('statusBar.enabled', true)
  },
  get synctexInclude(): string {
    return cfg().get<string>('synctex.include', '**/*.synctex{,.gz}')
  },
  get synctexExclude(): string {
    return cfg().get<string>('synctex.exclude', '**/node_modules/**')
  },
}

/**
 * Flip a boolean setting. Writes to the most specific scope that currently
 * defines the value so that a workspace override is not silently shadowed
 * by a user-level write.
 */
export async function toggleBooleanSetting(key: string, fallback: boolean): Promise<boolean> {
  const c = cfg()
  const info = c.inspect<boolean>(key)
  const current = c.get<boolean>(key, fallback)
  const next = !current
  let target = vscode.ConfigurationTarget.Global
  if (info?.workspaceFolderValue !== undefined) {
    target = vscode.ConfigurationTarget.WorkspaceFolder
  } else if (info?.workspaceValue !== undefined) {
    target = vscode.ConfigurationTarget.Workspace
  }
  await c.update(key, next, target)
  return next
}

export function affectsTexSync(e: vscode.ConfigurationChangeEvent, key?: string): boolean {
  return e.affectsConfiguration(key ? `${SECTION}.${key}` : SECTION)
}
