import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { config } from '../config'
import { getLogger } from '../logger'
import { normalizeFsPath, pdfPathForSyncTex, resolveInputs } from './inputs'
import { decodeSyncTex, parseSyncTex, type SyncTexData } from './parser'

export interface SyncTexEntry {
  /** Absolute path of the .synctex(.gz) file. */
  synctexPath: string
  /** Absolute path of the PDF the SyncTeX file describes. */
  pdfPath: string
  data: SyncTexData
  mtimeMs: number
  /** normalised absolute input path -> tag */
  inputTags: Map<string, number>
}

export interface ResolvedDocument {
  entry: SyncTexEntry
  tag: number
}

/** Workspace globbing is cached this long; file watcher events invalidate it earlier. */
const DISCOVERY_TTL_MS = 10_000

/**
 * Discovers, parses and caches the SyncTeX files reachable from the current
 * workspace, and maps TeX documents to the SyncTeX file (and input tag)
 * that describes them.
 */
export class SyncTexStore implements vscode.Disposable {
  private readonly cache = new Map<string, SyncTexEntry>()
  private readonly disposables: vscode.Disposable[] = []
  private watcher: vscode.FileSystemWatcher | undefined
  private readonly changeEmitter = new vscode.EventEmitter<string | undefined>()
  private discovery: { at: number; paths: string[] } | undefined

  /** Fires with the changed SyncTeX path, or `undefined` for a full reload. */
  readonly onDidChange = this.changeEmitter.event

  constructor() {
    this.createWatcher()
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('texSync.synctex')) {
          this.createWatcher()
          this.reload()
        }
      }),
    )
  }

  private createWatcher(): void {
    this.watcher?.dispose()
    this.watcher = vscode.workspace.createFileSystemWatcher(config.synctexInclude)
    const invalidate = (uri: vscode.Uri) => {
      const key = normalizeFsPath(uri.fsPath)
      this.cache.delete(key)
      this.discovery = undefined
      getLogger().debug(`SyncTeX changed: ${uri.fsPath}`)
      this.changeEmitter.fire(uri.fsPath)
    }
    this.watcher.onDidChange(invalidate)
    this.watcher.onDidCreate(invalidate)
    this.watcher.onDidDelete(invalidate)
  }

  reload(): void {
    this.cache.clear()
    this.discovery = undefined
    this.changeEmitter.fire(undefined)
  }

  /** Find the SyncTeX entry whose inputs include `document`, preferring the newest file. */
  async resolveDocument(document: vscode.TextDocument): Promise<ResolvedDocument | undefined> {
    if (document.uri.scheme !== 'file') return undefined
    const docKey = normalizeFsPath(document.uri.fsPath)

    const candidates = await this.discoverCandidates(document.uri)
    let best: ResolvedDocument | undefined
    for (const synctexPath of candidates) {
      const entry = this.load(synctexPath)
      if (!entry) continue
      const tag = entry.inputTags.get(docKey)
      if (tag === undefined) continue
      if (!best || entry.mtimeMs > best.entry.mtimeMs) {
        best = { entry, tag }
      }
    }
    return best
  }

  /**
   * SyncTeX files that might describe `docUri`: everything matching the
   * configured glob inside the workspace, plus files sitting next to the
   * document (covers single-file use without a workspace folder).
   */
  private async discoverCandidates(docUri: vscode.Uri): Promise<string[]> {
    const found = new Set<string>()
    const inWorkspace = vscode.workspace.getWorkspaceFolder(docUri) !== undefined
    if (inWorkspace) {
      if (!this.discovery || Date.now() - this.discovery.at > DISCOVERY_TTL_MS) {
        const uris = await vscode.workspace.findFiles(
          config.synctexInclude,
          config.synctexExclude,
          200,
        )
        this.discovery = { at: Date.now(), paths: uris.map((u) => u.fsPath) }
      }
      for (const p of this.discovery.paths) found.add(p)
    }
    const dir = path.dirname(docUri.fsPath)
    try {
      for (const name of fs.readdirSync(dir)) {
        if (/\.synctex(\.gz)?$/i.test(name)) found.add(path.join(dir, name))
      }
    } catch {
      /* unreadable directory */
    }
    return [...found]
  }

  /** Parse (or return the cached) SyncTeX file. */
  load(synctexPath: string): SyncTexEntry | undefined {
    const key = normalizeFsPath(synctexPath)
    let stat: fs.Stats
    try {
      stat = fs.statSync(synctexPath)
    } catch {
      this.cache.delete(key)
      return undefined
    }
    const cached = this.cache.get(key)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached

    try {
      const started = Date.now()
      const data = parseSyncTex(decodeSyncTex(fs.readFileSync(synctexPath)))
      const entry: SyncTexEntry = {
        synctexPath,
        pdfPath: pdfPathForSyncTex(synctexPath),
        data,
        mtimeMs: stat.mtimeMs,
        inputTags: resolveInputs(data.inputs, synctexPath),
      }
      this.cache.set(key, entry)
      getLogger().info(
        `Parsed ${path.basename(synctexPath)}: ${data.records.length} records, ${data.pageCount} pages, ${data.inputs.size} inputs (${Date.now() - started} ms)`,
      )
      return entry
    } catch (err) {
      getLogger().error(`Failed to parse ${synctexPath}: ${String(err)}`)
      return undefined
    }
  }

  dispose(): void {
    this.watcher?.dispose()
    this.changeEmitter.dispose()
    for (const d of this.disposables) d.dispose()
    this.cache.clear()
  }
}
