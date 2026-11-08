import * as vscode from 'vscode'
import { getLogger } from '../logger'

export const LATEX_WORKSHOP_ID = 'James-Yu.latex-workshop'
export const LATEX_WORKSHOP_PDF_VIEW_TYPE = 'latex-workshop-pdf-hook'

const LATEX_LANGUAGE_IDS = new Set(['latex', 'latex-expl3', 'pweave', 'jlweave', 'rsweave'])

export function isLatexDocument(doc: vscode.TextDocument | undefined): doc is vscode.TextDocument {
  return doc !== undefined && doc.uri.scheme === 'file' && LATEX_LANGUAGE_IDS.has(doc.languageId)
}

let activated: Promise<boolean> | undefined

/** Make sure LaTeX Workshop is activated so its commands are registered. */
export function ensureLatexWorkshop(): Promise<boolean> {
  activated ??= (async () => {
    const ext = vscode.extensions.getExtension(LATEX_WORKSHOP_ID)
    if (!ext) {
      getLogger().error('LaTeX Workshop is not installed.')
      return false
    }
    if (!ext.isActive) {
      await ext.activate()
    }
    return true
  })()
  return activated
}

/**
 * Forward search through LaTeX Workshop.
 * `latex-workshop.synctexto` takes a 0-based line and the file path; LaTeX
 * Workshop resolves the root/PDF itself and moves its viewer.
 */
export async function forwardSearch(line0: number, filePath: string): Promise<void> {
  if (!(await ensureLatexWorkshop())) return
  await vscode.commands.executeCommand('latex-workshop.synctexto', line0, filePath)
}

/** Whether a LaTeX Workshop PDF tab for `pdfPath` is currently open in any group. */
export function isPdfTabOpen(pdfPath: string): boolean {
  const target = pdfPath.toLowerCase()
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input
      if (
        input instanceof vscode.TabInputCustom &&
        input.viewType === LATEX_WORKSHOP_PDF_VIEW_TYPE
      ) {
        if (input.uri.fsPath.toLowerCase() === target) return true
      }
    }
  }
  return false
}

/** Open `pdfPath` in LaTeX Workshop's PDF viewer in the group beside the active editor. */
export async function openPdfBeside(pdfPath: string): Promise<void> {
  if (!(await ensureLatexWorkshop())) return
  const options: vscode.TextDocumentShowOptions = {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
  }
  await vscode.commands.executeCommand(
    'vscode.openWith',
    vscode.Uri.file(pdfPath),
    LATEX_WORKSHOP_PDF_VIEW_TYPE,
    options,
  )
}
