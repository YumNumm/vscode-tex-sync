import * as fs from 'node:fs'
import * as path from 'node:path'

const CASE_INSENSITIVE_FS = process.platform === 'darwin' || process.platform === 'win32'

/** Canonical key for comparing file paths (realpath when possible, case-folded on macOS/Windows). */
export function normalizeFsPath(p: string): string {
  let out: string
  try {
    out = fs.realpathSync.native(p)
  } catch {
    out = path.resolve(p)
  }
  return CASE_INSENSITIVE_FS ? out.toLowerCase() : out
}

export function pdfPathForSyncTex(synctexPath: string): string {
  return synctexPath.replace(/\.synctex(\.gz)?$/i, '.pdf')
}

/** How many parent directories of the SyncTeX file to try as a base for relative inputs. */
const MAX_BASE_LEVELS = 4

/**
 * Map SyncTeX `Input:` paths to tags, keyed by normalised absolute path.
 *
 * Input paths are written relative to the directory the engine ran in, which
 * is not necessarily the output directory (`-outdir`), so the SyncTeX
 * directory and a few of its ancestors are tried as bases. Absolute paths
 * that no longer exist (a SyncTeX file produced on another machine or moved
 * directory) fall back to matching their trailing components under the same
 * bases.
 */
export function resolveInputs(
  inputs: ReadonlyMap<number, string>,
  synctexPath: string,
  exists: (p: string) => boolean = fs.existsSync,
): Map<string, number> {
  const bases = baseDirsFor(synctexPath)
  const out = new Map<string, number>()
  for (const [tag, raw] of inputs) {
    const abs = resolveInputPath(raw, bases, exists)
    if (abs === undefined) continue
    const key = normalizeFsPath(abs)
    // The engine may list the same file twice (e.g. main.aux); keep the first tag.
    if (!out.has(key)) out.set(key, tag)
  }
  return out
}

function baseDirsFor(synctexPath: string): string[] {
  const bases: string[] = []
  let dir = path.dirname(path.resolve(synctexPath))
  for (let i = 0; i < MAX_BASE_LEVELS; i++) {
    bases.push(dir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return bases
}

export function resolveInputPath(
  raw: string,
  bases: readonly string[],
  exists: (p: string) => boolean = fs.existsSync,
): string | undefined {
  const tryCandidates = (cands: readonly string[]): string | undefined => {
    for (const c of cands) {
      if (exists(c)) return c
      // TeX may omit the extension for \input{chapter}
      if (!path.extname(c) && exists(`${c}.tex`)) return `${c}.tex`
    }
    return undefined
  }

  if (path.isAbsolute(raw)) {
    const direct = tryCandidates([path.normalize(raw)])
    if (direct) return direct
    // Fallback: progressively shorter tails of the path, relative to each base.
    const parts = raw.split(/[\\/]+/).filter((s) => s.length > 0 && s !== '.')
    for (let i = 1; i < parts.length; i++) {
      const tail = parts.slice(i).join(path.sep)
      const hit = tryCandidates(bases.map((b) => path.resolve(b, tail)))
      if (hit) return hit
    }
    return undefined
  }
  return tryCandidates(bases.map((b) => path.resolve(b, raw)))
}
